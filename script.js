let tenantsData = [];
let financeData = [];
let complaintsData = [];
let collectionsData = [];
let inventoryData = [];
let staffData = [];
let landlordData = [];

/* =========================================================
   CSV HELPERS
   ========================================================= */

function parseCSV(csvText) {
    const lines = csvText
        .replace(/\r/g, '')
        .trim()
        .split('\n');

    if (lines.length < 2) return [];

    // Supports normal CSV and basic quoted CSV values.
    function splitCSVLine(line) {
        const values = [];
        let current = '';
        let insideQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                if (insideQuotes && line[i + 1] === '"') {
                    current += '"';
                    i++;
                } else {
                    insideQuotes = !insideQuotes;
                }
            } else if (char === ',' && !insideQuotes) {
                values.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        values.push(current.trim());
        return values;
    }

    const headers = splitCSVLine(lines[0]).map(h =>
        h.replace(/^"|"$/g, '').trim()
    );

    return lines.slice(1)
        .filter(line => line.trim() !== '')
        .map(line => {
            const values = splitCSVLine(line);
            const obj = {};

            headers.forEach((header, index) => {
                obj[header] = (values[index] || '')
                    .replace(/^"|"$/g, '')
                    .trim();
            });

            return obj;
        });
}

async function loadCSVFile(fileName) {
    try {
        const response = await fetch(fileName);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const text = await response.text();
        return parseCSV(text);

    } catch (error) {
        console.error(`Error reading ${fileName}:`, error);
        return [];
    }
}

/* =========================================================
   COMMON HELPERS
   ========================================================= */

const monthOrder = {
    Jan: 1,
    January: 1,
    Feb: 2,
    February: 2,
    Mar: 3,
    March: 3,
    Apr: 4,
    April: 4,
    May: 5,
    Jun: 6,
    June: 6,
    Jul: 7,
    July: 7,
    Aug: 8,
    August: 8,
    Sep: 9,
    September: 9,
    Oct: 10,
    October: 10,
    Nov: 11,
    November: 11,
    Dec: 12,
    December: 12
};

function getMonthNumber(monthName) {
    return monthOrder[String(monthName || '').trim()] || 0;
}

function getCollectionDateKey(row) {
    const year = parseInt(row.Year, 10) || 0;
    const month = getMonthNumber(row.Month);

    return (year * 100) + month;
}

/*
    The current collections CSV contains duplicate June 2026
    and July 2026 records. We keep the LAST occurrence of a
    Month + Year combination, so duplicate records do not
    appear twice in the dashboard.
*/
function getUniqueSortedCollections() {
    const byMonth = new Map();

    collectionsData.forEach(row => {
        const year = String(row.Year || '').trim();
        const month = String(row.Month || '').trim();

        if (!year || !month || getMonthNumber(month) === 0) {
            return;
        }

        const key = `${year}-${getMonthNumber(month)}`;

        // Last record wins if the CSV contains a duplicate month/year.
        byMonth.set(key, row);
    });

    return Array.from(byMonth.values()).sort(
        (a, b) => getCollectionDateKey(a) - getCollectionDateKey(b)
    );
}

function formatINR(value) {
    return `₹ ${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
}

function calculatePending(row) {
    const totalDue = parseFloat(row.Total_Due_INR) || 0;
    const received = parseFloat(row.Amount_Received_INR) || 0;
    const adjusted = parseFloat(row.Amount_Adjusted_INR) || 0;

    let pending = parseFloat(row.Amount_Pending_INR);

    if (!Number.isFinite(pending)) {
        pending = totalDue - received - adjusted;
    }

    /*
        If the CSV pending value is inconsistent, calculate it
        from the three financial components instead.
    */
    if (pending > totalDue && totalDue > 0) {
        pending = totalDue - received - adjusted;
    }

    return Math.max(0, pending);
}

function getReceivedPercentage(row) {
    const totalDue = parseFloat(row.Total_Due_INR) || 0;
    const received = parseFloat(row.Amount_Received_INR) || 0;

    if (totalDue <= 0) return 0;

    return Math.min(
        100,
        Math.max(0, (received / totalDue) * 100)
    );
}

/* =========================================================
   TAB NAVIGATION
   ========================================================= */

function switchTab(tabId) {
    document.querySelectorAll('.page-section')
        .forEach(el => el.classList.remove('active'));

    document.querySelectorAll('nav button')
        .forEach(el => el.classList.remove('sidebar-item-active'));

    document.getElementById(`page-${tabId}`)
        .classList.add('active');

    document.getElementById(`nav-${tabId}`)
        .classList.add('sidebar-item-active');

    const titleMap = {
        dashboard: 'Dashboard Overview',
        finance: 'Finance Ledgers',
        tenants: 'Tenants Directory',
        complaints: 'Complaints Registry',
        staff: 'Staff Roster',
        landlord: 'Landlords Directory',
        inventory: 'Property Inventory'
    };

    document.getElementById('page-title').innerText =
        titleMap[tabId] || 'Dashboard Overview';
}

/* =========================================================
   DASHBOARD TIME FILTER
   ========================================================= */

function getFilteredCollections() {
    const filterValue =
        document.getElementById('dashboard-time-filter').value;

    const sortedData = getUniqueSortedCollections();

    if (sortedData.length === 0) {
        return [];
    }

    // All records
    if (filterValue === 'ALL') {
        return sortedData;
    }

    // Specific year
    if (filterValue === '2025' || filterValue === '2026') {
        return sortedData.filter(
            row => String(row.Year).trim() === filterValue
        );
    }

    // Last N months
    const months = parseInt(filterValue, 10);

    if (!Number.isFinite(months) || months <= 0) {
        return sortedData;
    }

    return sortedData.slice(-months);
}

function filterDashboardTime() {
    const filtered = getFilteredCollections();

    const chartContainer =
        document.getElementById('bar-chart-container');

    chartContainer.innerHTML = '';

    if (filtered.length === 0) {
        chartContainer.innerHTML = `
            <div class="w-full h-full flex items-center justify-center text-sm text-gray-400">
                No collection data available for this filter.
            </div>
        `;

        document.getElementById('metric-latest-pending').innerText = '₹ 0';
        document.getElementById('metric-tenants-arrears').innerText = '0';

        return;
    }

    filtered.forEach(row => {
        const totalDue =
            parseFloat(row.Total_Due_INR) || 0;

        const received =
            parseFloat(row.Amount_Received_INR) || 0;

        const pending =
            calculatePending(row);

        const receivedPct =
            getReceivedPercentage(row).toFixed(1);

        const pendingPct =
            Math.max(0, 100 - Number(receivedPct)).toFixed(1);

        const barWrapper =
            document.createElement('div');

        barWrapper.className =
            "flex flex-col items-center w-12 min-w-12 flex-shrink-0 select-none group relative";

        barWrapper.innerHTML = `
            <!-- Hover Tooltip -->
            <div class="
                hidden
                group-hover:block
                absolute
                -top-14
                bg-gray-900
                text-white
                text-3xs
                rounded-md
                px-2.5
                py-1.5
                z-20
                whitespace-nowrap
                shadow-lg
                text-center
                pointer-events-none
            ">
                <span class="font-bold text-gray-200">
                    Total: ${formatINR(totalDue)}
                </span>
                <br>

                <span class="text-emerald-300">
                    Received: ${formatINR(received)}
                    (${receivedPct}%)
                </span>
                <br>

                <span class="text-rose-300">
                    Pending: ${formatINR(pending)}
                    (${pendingPct}%)
                </span>
            </div>

            <!-- Collection Bar -->
            <div class="
                w-7
                h-32
                bg-rose-400
                rounded-t
                relative
                flex
                flex-col
                justify-end
                shadow-xs
                overflow-hidden
            ">
                <div
                    class="w-full bg-emerald-400 transition-all duration-300"
                    style="height: ${receivedPct}%;">
                </div>
            </div>

            <!-- Month Label -->
            <span class="
                text-3xs
                text-gray-500
                font-semibold
                mt-2
                whitespace-nowrap
            ">
                ${row.Month}'${String(row.Year || '').slice(-2)}
            </span>
        `;

        chartContainer.appendChild(barWrapper);
    });

    // Latest record in the selected period
    const latest = filtered[filtered.length - 1];

    const latestPending = calculatePending(latest);

    document.getElementById(
        'metric-latest-pending'
    ).innerText = formatINR(latestPending);

    document.getElementById(
        'metric-tenants-arrears'
    ).innerText = latest.Tenants_In_Arrears || 0;
}

/* =========================================================
   DASHBOARD KPI CARDS
   ========================================================= */

function renderDashboard() {
    filterDashboardTime();

    if (inventoryData.length > 0) {
        document.getElementById(
            'stat-properties-count'
        ).innerText = inventoryData.length;

        const totalUnits =
            inventoryData.reduce(
                (acc, curr) =>
                    acc + (parseInt(curr.Total_Units, 10) || 0),
                0
            );

        document.getElementById(
            'stat-units-count'
        ).innerText =
            totalUnits.toLocaleString('en-IN');
    } else {
        document.getElementById(
            'stat-properties-count'
        ).innerText = '0';

        document.getElementById(
            'stat-units-count'
        ).innerText = '0';
    }

    document.getElementById(
        'stat-tenants-count'
    ).innerText = tenantsData.length;

    document.getElementById(
        'stat-landlords-count'
    ).innerText = landlordData.length;

    document.getElementById(
        'stat-staff-count'
    ).innerText = staffData.length;
}

/* =========================================================
   FINANCE FILTER
   ========================================================= */

function filterFinance() {
    const status =
        document.getElementById('finance-status-filter').value;

    const filtered =
        status === 'ALL'
            ? financeData
            : financeData.filter(
                f => f.Payment_Status === status
            );

    const tbody =
        document.getElementById('finance-table-body');

    tbody.innerHTML = filtered.map(row => `
        <tr class="hover:bg-gray-50 transition">
            <td class="p-3 font-semibold text-gray-900">
                ${row.Tenant_Name}
            </td>

            <td class="p-3 text-gray-500">
                ${row.Assigned_Unit}
            </td>

            <td class="p-3">
                ₹ ${(parseInt(row.Monthly_Rent_INR, 10) || 0)
                    .toLocaleString('en-IN')}
            </td>

            <td class="p-3">
                ₹ ${(parseInt(row.Maintenance_Fee_INR, 10) || 0)
                    .toLocaleString('en-IN')}
            </td>

            <td class="p-3 text-gray-500">
                ${row.Last_Payment_Date}
            </td>

            <td class="p-3">
                <span class="
                    px-2
                    py-0.5
                    rounded
                    text-3xs
                    font-bold
                    ${row.Payment_Status === 'Paid'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-rose-50 text-rose-700'}
                ">
                    ${row.Payment_Status}
                </span>
            </td>

            <td class="
                p-3
                text-right
                font-bold
                ${parseInt(row.Balance_Due_INR, 10) > 0
                    ? 'text-rose-600'
                    : 'text-gray-400'}
            ">
                ₹ ${(parseInt(row.Balance_Due_INR, 10) || 0)
                    .toLocaleString('en-IN')}
            </td>
        </tr>
    `).join('');
}

/* =========================================================
   TENANT FILTERS
   ========================================================= */

function filterTenants() {
    const query =
        document.getElementById('tenant-search')
            .value
            .toLowerCase()
            .trim();

    const kycStatus =
        document.getElementById('tenant-kyc-filter').value;

    const filtered =
        tenantsData.filter(t => {

            const name =
                (t.Full_Name || '').toLowerCase();

            const unit =
                (t.Assigned_Unit || '').toLowerCase();

            const matchesQuery =
                name.includes(query) ||
                unit.includes(query);

            const matchesKYC =
                kycStatus === 'ALL' ||
                t.KYC_Status === kycStatus;

            return matchesQuery && matchesKYC;
        });

    const tbody =
        document.getElementById('tenants-table-body');

    tbody.innerHTML = filtered.map(row => `
        <tr class="hover:bg-gray-50 transition">
            <td class="p-3 font-mono text-3xs font-bold text-indigo-600">
                ${row.Tenant_ID}
            </td>

            <td class="p-3 font-semibold text-gray-900">
                ${row.Full_Name}
            </td>

            <td class="p-3 text-gray-500">
                ${row.Phone_Number}
                <br>
                <span class="text-3xs text-gray-400">
                    ${row.Email}
                </span>
            </td>

            <td class="p-3 text-gray-700 font-medium">
                ${row.Assigned_Unit}
            </td>

            <td class="p-3 text-gray-500">
                ${row.Lease_Start_Date}
            </td>

            <td class="p-3">
                <span class="
                    px-2
                    py-0.5
                    rounded
                    text-3xs
                    font-semibold
                    bg-indigo-50
                    text-indigo-700
                ">
                    ${row.KYC_Status}
                </span>
            </td>
        </tr>
    `).join('');
}

/* =========================================================
   COMPLAINT FILTERS
   ========================================================= */

function filterComplaints() {
    const category =
        document.getElementById('complaint-category-filter').value;

    const status =
        document.getElementById('complaint-status-filter').value;

    const filtered =
        complaintsData.filter(c => {

            const matchesCat =
                category === 'ALL' ||
                c.Category === category;

            const matchesStat =
                status === 'ALL' ||
                c.Status === status;

            return matchesCat && matchesStat;
        });

    const tbody =
        document.getElementById('complaints-table-body');

    tbody.innerHTML = filtered.map(row => `
        <tr class="hover:bg-gray-50 transition">
            <td class="p-3 font-mono text-3xs font-bold text-indigo-600">
                ${row.Ticket_ID}
            </td>

            <td class="p-3 font-semibold text-gray-900">
                ${row.Raised_By}
            </td>

            <td class="p-3 text-gray-500">
                <span class="px-1.5 py-0.5 bg-gray-100 rounded text-3xs">
                    ${row.User_Role}
                </span>
            </td>

            <td class="p-3 text-gray-700 font-medium">
                ${row.Category}
            </td>

            <td class="p-3 text-gray-500 max-w-xs truncate">
                ${row.Description}
            </td>

            <td class="p-3">
                <span class="
                    px-2
                    py-0.5
                    rounded
                    text-3xs
                    font-bold
                    ${row.Status === 'Resolved'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'}
                ">
                    ${row.Status}
                </span>
            </td>

            <td class="p-3 text-gray-600">
                ${row.Assigned_Staff}
            </td>
        </tr>
    `).join('');
}

/* =========================================================
   STAFF FILTER
   ========================================================= */

function filterStaff() {
    const property =
        document.getElementById('staff-property-filter').value;

    const filtered =
        property === 'ALL'
            ? staffData
            : staffData.filter(
                s => s.Assigned_Property === property
            );

    const tbody =
        document.getElementById('staff-table-body');

    tbody.innerHTML = filtered.map(row => `
        <tr class="hover:bg-gray-50 transition">
            <td class="p-3 font-mono text-3xs font-bold text-indigo-600">
                ${row.Staff_ID}
            </td>

            <td class="p-3 font-semibold text-gray-900">
                ${row.Staff_Name}
            </td>

            <td class="p-3 text-indigo-600 font-medium">
                ${row.Role}
            </td>

            <td class="p-3 text-gray-600">
                ${row.Assigned_Property}
            </td>

            <td class="p-3 text-gray-500">
                ${row.Phone_Number}
            </td>

            <td class="p-3 text-gray-500">
                ${row.Shift_Hours}
            </td>
        </tr>
    `).join('');
}

/* =========================================================
   LANDLORD
   ========================================================= */

function renderLandlord() {
    const tbody =
        document.getElementById('landlord-table-body');

    tbody.innerHTML = landlordData.map(row => `
        <tr class="hover:bg-gray-50 transition">
            <td class="p-3 font-mono text-3xs font-bold text-indigo-600">
                ${row.Landlord_ID}
            </td>

            <td class="p-3 font-semibold text-gray-900">
                ${row.Landlord_Name}
            </td>

            <td class="p-3 text-gray-700 font-medium">
                ${row.Property_Name}
            </td>

            <td class="p-3 text-gray-500">
                ${row.Contact_Info}
            </td>

            <td class="p-3 font-bold text-gray-800">
                ${row.Units_Managed} Units
            </td>

            <td class="p-3 text-gray-500 font-mono text-3xs">
                ${row.Bank_Account}
            </td>
        </tr>
    `).join('');
}

/* =========================================================
   INVENTORY
   ========================================================= */

function renderInventory() {
    const tbody =
        document.getElementById('inventory-table-body');

    tbody.innerHTML = inventoryData.map(row => `
        <tr class="hover:bg-gray-50 transition">
            <td class="p-3 font-mono text-3xs font-bold text-indigo-600">
                ${row.Property_ID}
            </td>

            <td class="p-3 font-semibold text-gray-900">
                ${row.Property_Name}
            </td>

            <td class="p-3 font-bold">
                ${row.Total_Units}
            </td>

            <td class="p-3 text-emerald-600 font-medium">
                ${row.Occupied_Active}
            </td>

            <td class="p-3 text-gray-500">
                ${row.Vacant_Available}
            </td>

            <td class="p-3 font-bold text-indigo-700">
                ${row.Occupancy_Rate}
            </td>
        </tr>
    `).join('');
}

/* =========================================================
   LOAD ALL DATA
   ========================================================= */

window.onload = async () => {

    tenantsData =
        await loadCSVFile('tenants_dataset.csv');

    financeData =
        await loadCSVFile('finance_ledgers.csv');

    complaintsData =
        await loadCSVFile('complaints_registry.csv');

    collectionsData =
        await loadCSVFile('collections_overview.csv');

    inventoryData =
        await loadCSVFile('property_inventory.csv');

    staffData =
        await loadCSVFile('staff.csv');

    landlordData =
        await loadCSVFile('landlords.csv');


    renderDashboard();

    filterTenants();
    filterFinance();
    filterComplaints();
    filterStaff();
    renderLandlord();
    renderInventory();
};
