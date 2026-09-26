let tenantsData = [];
let financeData = [];
let complaintsData = [];
let collectionsData = [];
let inventoryData = [];
let staffData = [];
let landlordData = [];

function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    
    return lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        let obj = {};
        headers.forEach((header, index) => {
            obj[header] = values[index] || '';
        });
        return obj;
    });
}

async function loadCSVFile(fileName) {
    try {
        const response = await fetch(fileName);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const text = await response.text();
        return parseCSV(text);
    } catch (error) {
        console.error(`Error reading ${fileName}:`, error);
        return [];
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.page-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('nav button').forEach(el => el.classList.remove('sidebar-item-active'));
    
    document.getElementById(`page-${tabId}`).classList.add('active');
    document.getElementById(`nav-${tabId}`).classList.add('sidebar-item-active');

    const titleMap = {
        'dashboard': 'Dashboard Overview',
        'finance': 'Finance Ledgers',
        'tenants': 'Tenants Directory',
        'complaints': 'Complaints Registry',
        'staff': 'Staff Roster',
        'landlord': 'Landlords Directory',
        'inventory': 'Property Inventory'
    };
    document.getElementById('page-title').innerText = titleMap[tabId];
}

// --- DASHBOARD TIME FILTER (BALANCED BAR SIZE & DYNAMIC RATIOS) ---
function filterDashboardTime() {
    const months = parseInt(document.getElementById('dashboard-time-filter').value);
    const filtered = collectionsData.slice(-months);

    const chartContainer = document.getElementById('bar-chart-container');
    chartContainer.innerHTML = '';

    if (filtered.length === 0) return;

    filtered.forEach(row => {
        const totalDue = parseFloat(row.Total_Due_INR) || 0;
        const received = parseFloat(row.Amount_Received_INR) || 0;
        const adjusted = parseFloat(row.Amount_Adjusted_INR) || 0;

        // Auto-correct any pending mismatch
        let pending = parseFloat(row.Amount_Pending_INR) || 0;
        if (pending > totalDue && totalDue > 0) {
            pending = Math.max(0, totalDue - received - adjusted);
        }

        // Exact percentage received
        const receivedPct = totalDue > 0 
            ? Math.min(100, Math.max(0, (received / totalDue) * 100)).toFixed(1)
            : 0;
        const pendingPct = (100 - receivedPct).toFixed(1);

        const barWrapper = document.createElement('div');
        barWrapper.className = "flex flex-col items-center w-12 select-none group relative";
        barWrapper.innerHTML = `
            <!-- Hover Tooltip -->
            <div class="hidden group-hover:block absolute -top-14 bg-gray-900 text-white text-3xs rounded-md px-2.5 py-1.5 z-20 whitespace-nowrap shadow-lg text-center pointer-events-none transition-all">
                <span class="font-bold text-gray-200">Total: ₹${Math.round(totalDue).toLocaleString('en-IN')}</span><br>
                <span class="text-emerald-300">Received: ₹${Math.round(received).toLocaleString('en-IN')} (${receivedPct}%)</span><br>
                <span class="text-rose-300">Pending: ₹${Math.round(pending).toLocaleString('en-IN')} (${pendingPct}%)</span>
            </div>

            <!-- Scaled Bar Container: w-7 and h-32 for clean spacing -->
            <div class="w-7 h-32 bg-rose-400 rounded-t relative flex flex-col justify-end shadow-xs overflow-hidden">
                <!-- Dynamic Emerald segment showing true received ratio -->
                <div class="w-full bg-emerald-400 transition-all duration-300" style="height: ${receivedPct}%;"></div>
            </div>

            <!-- Month Label -->
            <span class="text-3xs text-gray-500 font-semibold mt-2 whitespace-nowrap">${row.Month}'${row.Year ? row.Year.slice(-2) : ''}</span>
        `;
        chartContainer.appendChild(barWrapper);
    });

    if (filtered.length > 0) {
        const latest = filtered[filtered.length - 1];
        const totalDue = parseFloat(latest.Total_Due_INR) || 0;
        const received = parseFloat(latest.Amount_Received_INR) || 0;
        const adjusted = parseFloat(latest.Amount_Adjusted_INR) || 0;

        let latestPending = parseFloat(latest.Amount_Pending_INR) || 0;
        if (latestPending > totalDue && totalDue > 0) {
            latestPending = Math.max(0, totalDue - received - adjusted);
        }

        document.getElementById('metric-latest-pending').innerText = `₹ ${Math.round(latestPending).toLocaleString('en-IN')}`;
        document.getElementById('metric-tenants-arrears').innerText = latest.Tenants_In_Arrears || 0;
    }
}

function renderDashboard() {
    filterDashboardTime();

    if (inventoryData.length > 0) {
        document.getElementById('stat-properties-count').innerText = inventoryData.length;
        const totalUnits = inventoryData.reduce((acc, curr) => acc + parseInt(curr.Total_Units || 0), 0);
        document.getElementById('stat-units-count').innerText = totalUnits.toLocaleString('en-IN');
    }

    document.getElementById('stat-tenants-count').innerText = tenantsData.length;
    document.getElementById('stat-landlords-count').innerText = landlordData.length;
    document.getElementById('stat-staff-count').innerText = staffData.length;
}

// --- FINANCE FILTER ---
function filterFinance() {
    const status = document.getElementById('finance-status-filter').value;
    const filtered = status === 'ALL' ? financeData : financeData.filter(f => f.Payment_Status === status);

    const tbody = document.getElementById('finance-table-body');
    tbody.innerHTML = filtered.map(row => `
        <tr class="hover:bg-gray-50 transition">
            <td class="p-3 font-semibold text-gray-900">${row.Tenant_Name}</td>
            <td class="p-3 text-gray-500">${row.Assigned_Unit}</td>
            <td class="p-3">₹ ${parseInt(row.Monthly_Rent_INR || 0).toLocaleString('en-IN')}</td>
            <td class="p-3">₹ ${parseInt(row.Maintenance_Fee_INR || 0).toLocaleString('en-IN')}</td>
            <td class="p-3 text-gray-500">${row.Last_Payment_Date}</td>
            <td class="p-3">
                <span class="px-2 py-0.5 rounded text-3xs font-bold ${row.Payment_Status === 'Paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}">
                    ${row.Payment_Status}
                </span>
            </td>
            <td class="p-3 text-right font-bold ${parseInt(row.Balance_Due_INR) > 0 ? 'text-rose-600' : 'text-gray-400'}">₹ ${parseInt(row.Balance_Due_INR || 0).toLocaleString('en-IN')}</td>
        </tr>
    `).join('');
}

// --- TENANT FILTERS ---
function filterTenants() {
    const query = document.getElementById('tenant-search').value.toLowerCase();
    const kycStatus = document.getElementById('tenant-kyc-filter').value;

    const filtered = tenantsData.filter(t => {
        const matchesQuery = (t.Full_Name && t.Full_Name.toLowerCase().includes(query)) || 
                             (t.Assigned_Unit && t.Assigned_Unit.toLowerCase().includes(query));
        const matchesKYC = kycStatus === 'ALL' || t.KYC_Status === kycStatus;
        return matchesQuery && matchesKYC;
    });

    const tbody = document.getElementById('tenants-table-body');
    tbody.innerHTML = filtered.map(row => `
        <tr class="hover:bg-gray-50 transition">
            <td class="p-3 font-mono text-3xs font-bold text-indigo-600">${row.Tenant_ID}</td>
            <td class="p-3 font-semibold text-gray-900">${row.Full_Name}</td>
            <td class="p-3 text-gray-500">${row.Phone_Number}<br><span class="text-3xs text-gray-400">${row.Email}</span></td>
            <td class="p-3 text-gray-700 font-medium">${row.Assigned_Unit}</td>
            <td class="p-3 text-gray-500">${row.Lease_Start_Date}</td>
            <td class="p-3"><span class="px-2 py-0.5 rounded text-3xs font-semibold bg-indigo-50 text-indigo-700">${row.KYC_Status}</span></td>
        </tr>
    `).join('');
}

// --- COMPLAINTS FILTERS ---
function filterComplaints() {
    const category = document.getElementById('complaint-category-filter').value;
    const status = document.getElementById('complaint-status-filter').value;

    const filtered = complaintsData.filter(c => {
        const matchesCat = category === 'ALL' || c.Category === category;
        const matchesStat = status === 'ALL' || c.Status === status;
        return matchesCat && matchesStat;
    });

    const tbody = document.getElementById('complaints-table-body');
    tbody.innerHTML = filtered.map(row => `
        <tr class="hover:bg-gray-50 transition">
            <td class="p-3 font-mono text-3xs font-bold text-indigo-600">${row.Ticket_ID}</td>
            <td class="p-3 font-semibold text-gray-900">${row.Raised_By}</td>
            <td class="p-3 text-gray-500"><span class="px-1.5 py-0.5 bg-gray-100 rounded text-3xs">${row.User_Role}</span></td>
            <td class="p-3 text-gray-700 font-medium">${row.Category}</td>
            <td class="p-3 text-gray-500 max-w-xs truncate">${row.Description}</td>
            <td class="p-3">
                <span class="px-2 py-0.5 rounded text-3xs font-bold ${row.Status === 'Resolved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}">
                    ${row.Status}
                </span>
            </td>
            <td class="p-3 text-gray-600">${row.Assigned_Staff}</td>
        </tr>
    `).join('');
}

// --- STAFF FILTERS ---
function filterStaff() {
    const property = document.getElementById('staff-property-filter').value;
    const filtered = property === 'ALL' ? staffData : staffData.filter(s => s.Assigned_Property === property);

    const tbody = document.getElementById('staff-table-body');
    tbody.innerHTML = filtered.map(row => `
        <tr class="hover:bg-gray-50 transition">
            <td class="p-3 font-mono text-3xs font-bold text-indigo-600">${row.Staff_ID}</td>
            <td class="p-3 font-semibold text-gray-900">${row.Staff_Name}</td>
            <td class="p-3 text-indigo-600 font-medium">${row.Role}</td>
            <td class="p-3 text-gray-600">${row.Assigned_Property}</td>
            <td class="p-3 text-gray-500">${row.Phone_Number}</td>
            <td class="p-3 text-gray-500">${row.Shift_Hours}</td>
        </tr>
    `).join('');
}

function renderLandlord() {
    const tbody = document.getElementById('landlord-table-body');
    tbody.innerHTML = landlordData.map(row => `
        <tr class="hover:bg-gray-50 transition">
            <td class="p-3 font-mono text-3xs font-bold text-indigo-600">${row.Landlord_ID}</td>
            <td class="p-3 font-semibold text-gray-900">${row.Landlord_Name}</td>
            <td class="p-3 text-gray-700 font-medium">${row.Property_Name}</td>
            <td class="p-3 text-gray-500">${row.Contact_Info}</td>
            <td class="p-3 font-bold text-gray-800">${row.Units_Managed} Units</td>
            <td class="p-3 text-gray-500 font-mono text-3xs">${row.Bank_Account}</td>
        </tr>
    `).join('');
}

function renderInventory() {
    const tbody = document.getElementById('inventory-table-body');
    tbody.innerHTML = inventoryData.map(row => `
        <tr class="hover:bg-gray-50 transition">
            <td class="p-3 font-mono text-3xs font-bold text-indigo-600">${row.Property_ID}</td>
            <td class="p-3 font-semibold text-gray-900">${row.Property_Name}</td>
            <td class="p-3 font-bold">${row.Total_Units}</td>
            <td class="p-3 text-emerald-600 font-medium">${row.Occupied_Active}</td>
            <td class="p-3 text-gray-500">${row.Vacant_Available}</td>
            <td class="p-3 font-bold text-indigo-700">${row.Occupancy_Rate}</td>
        </tr>
    `).join('');
}

window.onload = async () => {
    tenantsData = await loadCSVFile('tenants_dataset.csv');
    financeData = await loadCSVFile('finance_ledgers.csv');
    complaintsData = await loadCSVFile('complaints_registry.csv');
    collectionsData = await loadCSVFile('collections_overview.csv');
    inventoryData = await loadCSVFile('property_inventory.csv');
    staffData = await loadCSVFile('staff.csv');
    landlordData = await loadCSVFile('landlords.csv');

    renderDashboard();
    filterTenants();
    filterFinance();
    filterComplaints();
    filterStaff();
    renderLandlord();
    renderInventory();
};