// staff_report.js
const API_BASE = window.location.origin + '/api/staff/leave'; // Base for new routes
const AUTH_TOKEN = localStorage.getItem('nixtz_auth_token') || localStorage.getItem('tmt_auth_token');

document.addEventListener('DOMContentLoaded', () => {
    populateYearSelect();
    loadLeaveReport();
    if (window.lucide) window.lucide.createIcons();
});

function populateYearSelect() {
    const select = document.getElementById('report-year');
    const currentYear = new Date().getFullYear();
    for (let i = currentYear; i >= currentYear - 2; i--) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = i;
        select.appendChild(opt);
    }
}

// --- 1. LOAD MAIN REPORT TABLE ---
async function loadLeaveReport() {
    const year = document.getElementById('report-year').value;
    const tbody = document.getElementById('report-body');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8">Loading...</td></tr>';

    try {
        const res = await fetch(`${API_BASE}/report/${year}`, {
            headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
        });
        const json = await res.json();
        
        if (!json.success || !json.data.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">No records found.</td></tr>';
            return;
        }
        renderReportTable(json.data);
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-red-500 py-8">Error loading data.</td></tr>';
    }
}

function renderReportTable(data) {
    const tbody = document.getElementById('report-body');
    tbody.innerHTML = '';

    data.forEach(staff => {
        let sick = 0, personal = 0, holiday = 0, total = 0;
        
        // Sum up from breakdown array
        if (staff.breakdown) {
            staff.breakdown.forEach(b => {
                if (b.type === 'Sick Leave') sick += b.count;
                else if (b.type === 'Personal Leave') personal += b.count;
                else if (b.type === 'Holiday') holiday += b.count;
            });
            total = staff.total;
        }

        const tr = `
            <tr class="hover:bg-gray-800 transition group">
                <td class="p-3 font-medium text-white">${staff._id.employeeName}</td>
                <td class="p-3 text-center text-green-400 font-bold">${holiday}</td>
                <td class="p-3 text-center text-red-400 font-bold">${sick}</td>
                <td class="p-3 text-center text-orange-400 font-bold">${personal}</td>
                <td class="p-3 text-center text-white bg-gray-700/30 font-bold">${total}</td>
                <td class="p-3 text-center">
                    <button onclick="openManageModal('${staff._id.employeeId}', '${staff._id.employeeName}')" 
                            class="bg-nixtz-primary hover:bg-blue-600 text-white text-xs px-3 py-1 rounded shadow transition">
                        Manage
                    </button>
                </td>
            </tr>
        `;
        tbody.insertAdjacentHTML('beforeend', tr);
    });
}

// --- 2. MANAGE MODAL LOGIC ---
window.openManageModal = async function(empId, name) {
    const modal = document.getElementById('manage-modal');
    const title = document.getElementById('modal-staff-name');
    const listBody = document.getElementById('modal-list-body');
    const year = document.getElementById('report-year').value;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    title.textContent = `${name} (Records for ${year})`;
    listBody.innerHTML = '<tr><td colspan="3" class="p-4 text-center">Loading details...</td></tr>';

    try {
        const res = await fetch(`${API_BASE}/details?year=${year}&employeeId=${empId}`, {
            headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
        });
        const json = await res.json();
        renderDetailList(json.data);
    } catch (e) {
        listBody.innerHTML = '<tr><td colspan="3" class="text-red-500 text-center">Failed to load details.</td></tr>';
    }
};

function renderDetailList(leaves) {
    const tbody = document.getElementById('modal-list-body');
    tbody.innerHTML = '';
    
    if(!leaves || leaves.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-gray-500">No leave records found.</td></tr>';
        return;
    }

    leaves.forEach(l => {
        const dateStr = new Date(l.leaveDate).toLocaleDateString('en-GB'); // DD/MM/YYYY
        
        // Dynamic color for badge
        let badgeColor = 'bg-gray-700 text-gray-300';
        if(l.leaveType === 'Sick Leave') badgeColor = 'bg-red-900/50 text-red-200 border border-red-800';
        if(l.leaveType === 'Holiday') badgeColor = 'bg-green-900/50 text-green-200 border border-green-800';
        if(l.leaveType === 'Personal Leave') badgeColor = 'bg-orange-900/50 text-orange-200 border border-orange-800';

        const row = `
            <tr id="row-${l._id}" class="hover:bg-gray-800 transition">
                <td class="p-3 font-mono text-gray-300">${dateStr}</td>
                <td class="p-3">
                    <span class="px-2 py-1 rounded text-xs font-bold ${badgeColor}">${l.leaveType}</span>
                </td>
                <td class="p-3 text-right space-x-2">
                    <button onclick="enableEdit('${l._id}', '${l.leaveType}')" class="text-blue-400 hover:text-white text-xs underline">Edit</button>
                    <button onclick="deleteLeave('${l._id}')" class="text-red-400 hover:text-white text-xs underline">Delete</button>
                </td>
            </tr>
        `;
        tbody.insertAdjacentHTML('beforeend', row);
    });
}

// --- 3. EDIT & DELETE ACTIONS ---

window.enableEdit = function(id, currentType) {
    const row = document.getElementById(`row-${id}`);
    const cell = row.children[1]; // The 'Type' cell
    const actions = row.children[2];

    // Replace badge with Dropdown
    cell.innerHTML = `
        <select id="edit-select-${id}" class="bg-gray-900 text-white text-xs p-1 rounded border border-gray-600 focus:border-nixtz-primary">
            <option value="Sick Leave" ${currentType === 'Sick Leave' ? 'selected' : ''}>Sick Leave</option>
            <option value="Personal Leave" ${currentType === 'Personal Leave' ? 'selected' : ''}>Personal Leave</option>
            <option value="Holiday" ${currentType === 'Holiday' ? 'selected' : ''}>Holiday</option>
            <option value="Other" ${currentType === 'Other' ? 'selected' : ''}>Other</option>
        </select>
    `;

    // Replace buttons with Save/Cancel
    actions.innerHTML = `
        <button onclick="saveEdit('${id}')" class="text-green-400 font-bold text-xs hover:underline">Save</button>
        <button onclick="openManageModal(lastLoadedId, lastLoadedName)" class="text-gray-500 text-xs hover:underline">Cancel</button>
    `;
};

window.saveEdit = async function(id) {
    const newType = document.getElementById(`edit-select-${id}`).value;
    
    try {
        const res = await fetch(`${API_BASE}/${id}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${AUTH_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ leaveType: newType })
        });

        if(res.ok) {
            // Reload the list to show updated badge
            // Note: In a real app, we'd store the current staff ID globally to refresh cleanly.
            // For now, simply finding the row or refreshing the report is safer.
            alert("Updated!");
            loadLeaveReport(); // Refresh background table
            document.getElementById('manage-modal').classList.add('hidden'); // Close modal
        } else {
            alert("Failed to update.");
        }
    } catch(e) { console.error(e); alert("Network error."); }
};

window.deleteLeave = async function(id) {
    if(!confirm("Are you sure you want to delete this record? This cannot be undone.")) return;

    try {
        const res = await fetch(`${API_BASE}/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
        });

        if(res.ok) {
            document.getElementById(`row-${id}`).remove(); // Remove visually
            loadLeaveReport(); // Refresh totals in background
        } else {
            alert("Failed to delete.");
        }
    } catch(e) { console.error(e); }
};