/**
 * laundry_staff.js
 * Handles the logic for the staff-facing laundry management panel.
 */

// --- 1. CONFIGURATION FIX ---
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = ''; 
}

// Map for Analytics & History Table
const statusMap = {
    'PendingPickup': { label: 'Pending Pickup', color: 'bg-status-pending text-nixtz-bg', icon: 'hourglass' },
    'PickedUp': { label: 'Picked Up', color: 'bg-status-pickedup text-white', icon: 'truck' },
    'InProgress': { label: 'In Progress', color: 'bg-status-progress text-white', icon: 'washing-machine' },
    'ReadyforDelivery': { label: 'Ready for Delivery', color: 'bg-status-ready text-nixtz-bg', icon: 'box' },
    'Completed': { label: 'Completed', color: 'bg-status-complete text-white', icon: 'check-circle' },
    'Cancelled': { label: 'Cancelled', color: 'bg-status-cancelled text-white', icon: 'x-circle' }
};

document.addEventListener('DOMContentLoaded', () => {
    createLucideIcons(); 
    initLaundryStaffPage();
    if (typeof window.updateServiceBanner === 'function') {
        window.updateServiceBanner();
    }
    document.addEventListener('click', closeDropdownOnOutsideClick);
});

function createLucideIcons() {
    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    }
}

// --- UTILITIES ---

function getStatusColor(status) {
    switch (status) {
        case 'Pending Pickup': return 'bg-status-pending text-nixtz-bg';
        case 'Picked Up': return 'bg-status-pickedup text-white';
        case 'In Progress': return 'bg-status-progress text-white';
        case 'Ready for Delivery': return 'bg-status-ready text-nixtz-bg';
        case 'Completed': return 'bg-status-complete text-white';
        case 'Cancelled': return 'bg-status-cancelled text-white';
        default: return 'bg-gray-500 text-white';
    }
}

function getNextStatus(currentStatus) {
    switch (currentStatus) {
        case 'Pending Pickup': return 'Picked Up';
        case 'Picked Up': return 'In Progress';
        case 'In Progress': return 'Ready for Delivery';
        case 'Ready for Delivery': return 'Completed';
        default: return null; 
    }
}

// --- UI LOGIC ---

function toggleUserDropdown() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) {
        const isHidden = dropdown.style.display === 'none' || dropdown.style.display === '';
        dropdown.style.display = isHidden ? 'block' : 'none';
        if (isHidden) createLucideIcons();
    }
}
window.toggleUserDropdown = toggleUserDropdown; 

function closeDropdownOnOutsideClick(event) {
    const userContainer = document.getElementById('user-display-container');
    const dropdown = document.getElementById('user-dropdown');
    const displayButton = document.getElementById('user-display-button');
    if (dropdown && dropdown.style.display === 'block' && 
        userContainer && !userContainer.contains(event.target) &&
        !displayButton.contains(event.target)) {
        dropdown.style.display = 'none';
    }
}

// --- ACTIONS: UPDATE STATUS (Card View) ---

async function updateRequestStatus(requestId, newStatus) {
    const token = localStorage.getItem('nixtz_service_auth_token'); 
    if (!token) return window.checkServiceAccessAndRedirect('laundry_staff.html');

    const modalResponse = await showCustomConfirm(`Change status to "${newStatus}"?`);
    if (!modalResponse) return;

    try {
        const response = await fetch(`${window.API_BASE_URL}/api/laundry/update-status/${requestId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ status: newStatus })
        });
        const result = await response.json();

        if (response.ok && result.success) {
            window.showMessage(result.message, false);
            // Refresh ALL data
            loadOutstandingRequests(); 
            fetchAnalytics();
            fetchAllRequests();
        } else {
            window.showMessage(result.message || 'Failed to update.', true);
        }
    } catch (error) {
        window.showMessage('Network error.', true);
    }
}
window.updateRequestStatus = updateRequestStatus; 

// --- ACTIONS: DELETE (Table View) ---

async function deleteRequest(id) {
    const token = localStorage.getItem('nixtz_service_auth_token');
    if (!token) return;

    const modalResponse = await showCustomConfirm("Permanently delete this request?");
    if (!modalResponse) return;

    try {
        const response = await fetch(`${window.API_BASE_URL}/api/laundry/admin/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (response.ok && result.success) {
            window.showMessage(result.message, false);
            fetchAnalytics();
            fetchAllRequests();
            loadOutstandingRequests();
        } else {
            window.showMessage(result.message || 'Failed to delete.', true);
        }
    } catch (error) {
        window.showMessage('Network error.', true);
    }
}
window.deleteRequest = deleteRequest;

// --- DATA: ANALYTICS ---

async function fetchAnalytics() {
    const token = localStorage.getItem('nixtz_service_auth_token');
    if (!token) return;
    try {
        const response = await fetch(`${window.API_BASE_URL}/api/laundry/admin/analytics`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (response.ok) updateAnalyticsDashboard(result.data);
    } catch (error) { console.error('Analytics error', error); }
}

function updateAnalyticsDashboard(data) {
    const container = document.getElementById('analytics-dashboard');
    if (!container) return;
    const statuses = ['Total', 'PendingPickup', 'PickedUp', 'InProgress', 'ReadyforDelivery', 'Completed', 'Cancelled'];
    
    container.innerHTML = statuses.map(key => {
        const count = data[key] || 0;
        const info = statusMap[key] || { label: key, color: 'bg-gray-700 text-white', icon: 'info' };
        const cardColor = key === 'Total' ? 'bg-nixtz-primary' : info.color;
        const iconName = key === 'Total' ? 'trending-up' : info.icon;
        const textColor = (key === 'Total' || key === 'PickedUp' || key === 'InProgress' || key === 'Completed' || key === 'Cancelled') ? 'text-white' : 'text-nixtz-bg';

        return `
            <div class="p-4 rounded-xl shadow-lg border border-gray-700 ${cardColor}">
                <div class="flex justify-between items-center">
                    <i data-lucide="${iconName}" class="w-6 h-6 ${textColor}"></i>
                    <p class="text-3xl font-extrabold ${textColor}">${count}</p>
                </div>
                <p class="text-sm mt-2 font-medium ${textColor}">${key === 'Total' ? 'Total' : info.label}</p>
            </div>`;
    }).join('');
    createLucideIcons();
}

// --- DATA: FULL HISTORY ---

async function fetchAllRequests() {
    const tableBody = document.getElementById('all-requests-body');
    const token = localStorage.getItem('nixtz_service_auth_token');
    if (!tableBody || !token) return;

    tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-500">Loading...</td></tr>';
    try {
        const response = await fetch(`${window.API_BASE_URL}/api/laundry/admin/all-requests`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (response.ok && result.data.length > 0) {
            tableBody.innerHTML = result.data.map(req => {
                const statusInfo = statusMap[req.status.replace(/\s/g, '')] || { color: 'bg-gray-500' };
                const itemsSum = req.items.slice(0, 2).map(i => `${i.count}x ${i.type}`).join(', ');
                return `
                    <tr class="bg-gray-900 border-b border-gray-800 hover:bg-gray-800">
                        <td class="px-4 py-3 text-gray-400">${req.department}</td>
                        <td class="px-4 py-3 text-gray-400">${req.requesterUsername} / ${req.contactExt}</td>
                        <td class="px-4 py-3 text-gray-400 hidden sm:table-cell text-xs">${itemsSum}</td>
                        <td class="px-4 py-3"><span class="px-2 py-1 text-xs font-bold rounded-full ${statusInfo.color}">${req.status}</span></td>
                        <td class="px-4 py-3 text-gray-500 hidden md:table-cell text-xs">${new Date(req.requestedAt).toLocaleDateString()}</td>
                        <td class="px-4 py-3">
                            <button onclick="deleteRequest('${req._id}')" class="text-red-400 hover:text-red-600"><i data-lucide="trash-2" class="w-5 h-5"></i></button>
                        </td>
                    </tr>`;
            }).join('');
        } else { tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4">No data.</td></tr>'; }
    } catch (e) { tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-red-400">Error.</td></tr>'; }
    createLucideIcons();
}

// --- DATA: OUTSTANDING JOBS ---

function renderRequestCard(request) {
    const nextStatus = getNextStatus(request.status);
    const statusColorClass = getStatusColor(request.status);
    const itemsHtml = request.items.map(item => `<li class="text-xs text-gray-400"><span class="font-semibold">${item.count}x ${item.type}</span> ${item.details ? `(${item.details})` : ''}</li>`).join('');
    
    const actionButton = nextStatus ? `
        <button onclick="updateRequestStatus('${request._id}', '${nextStatus}')" class="w-full py-2 px-4 text-sm font-bold rounded-lg text-nixtz-bg bg-nixtz-secondary hover:bg-[#0da070] transition">Mark as "${nextStatus}"</button>
    ` : `<button disabled class="w-full py-2 px-4 text-sm font-bold rounded-lg bg-gray-600 text-gray-400 cursor-not-allowed">No Action</button>`;

    return `
        <div class="bg-gray-800 p-5 rounded-xl shadow-lg border-l-4 border-nixtz-secondary/50">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
                <h4 class="text-xl font-bold text-white">${request.department} <span class="text-base font-normal text-gray-400">(${request.requesterUsername})</span></h4>
                <span class="mt-2 sm:mt-0 px-3 py-1 text-xs font-semibold rounded-full ${statusColorClass}">${request.status}</span>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4 border-b border-gray-700 pb-4">
                <p class="text-gray-400"><i data-lucide="phone" class="w-4 h-4 inline mr-1 text-nixtz-primary"></i> ${request.contactExt}</p>
                <p class="text-gray-400"><i data-lucide="clock" class="w-4 h-4 inline mr-1 text-nixtz-primary"></i> ${new Date(request.requestedAt).toLocaleDateString()}</p>
            </div>
            <div class="mb-4 p-3 bg-gray-900 rounded-lg"><ul class="list-disc pl-5 space-y-0.5">${itemsHtml}</ul></div>
            <div class="flex space-x-2">${actionButton} <button onclick="updateRequestStatus('${request._id}', 'Cancelled')" class="flex-shrink-0 py-2 px-4 text-sm font-bold rounded-lg text-white bg-status-cancelled hover:bg-red-600 transition">Cancel</button></div>
        </div>`;
}

async function loadOutstandingRequests() {
    const listContainer = document.getElementById('requests-list');
    const token = localStorage.getItem('nixtz_service_auth_token');
    if (!listContainer || !token) return;

    listContainer.innerHTML = '<p class="text-gray-500 text-center py-8">Fetching requests...</p>';
    try {
        const response = await fetch(`${window.API_BASE_URL}/api/laundry/staff-view`, { headers: { 'Authorization': `Bearer ${token}` } });
        const result = await response.json();
        if (response.ok && result.success) {
            listContainer.innerHTML = result.data.length > 0 ? result.data.map(renderRequestCard).join('') : '<p class="text-nixtz-secondary text-center py-8">No outstanding requests.</p>';
        } else {
            listContainer.innerHTML = `<p class="text-red-400 text-center py-8">${result.message}</p>`;
        }
        createLucideIcons();
    } catch (e) { listContainer.innerHTML = '<p class="text-red-400 text-center py-8">Network error.</p>'; }
}

// --- UTILITY ---

function showCustomConfirm(message) {
    return new Promise(resolve => {
        let existingModal = document.getElementById('custom-confirm-modal');
        if (existingModal) existingModal.remove();
        document.body.insertAdjacentHTML('beforeend', `
            <div id="custom-confirm-modal" class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[10000]">
                <div class="bg-nixtz-card p-6 rounded-xl shadow-2xl max-w-sm w-full border border-gray-700">
                    <h3 class="text-lg font-bold text-white mb-4">Confirm</h3>
                    <p class="text-gray-300 mb-6">${message}</p>
                    <div class="flex justify-end space-x-3">
                        <button id="cancel-btn" class="px-4 py-2 text-sm rounded-lg border border-gray-600 text-gray-400">Cancel</button>
                        <button id="confirm-btn" class="px-4 py-2 text-sm rounded-lg bg-nixtz-secondary text-white">Confirm</button>
                    </div>
                </div>
            </div>`);
        const modal = document.getElementById('custom-confirm-modal');
        document.getElementById('confirm-btn').onclick = () => { modal.remove(); resolve(true); };
        document.getElementById('cancel-btn').onclick = () => { modal.remove(); resolve(false); };
    });
}

function initLaundryStaffPage() {
    if (typeof window.getServiceAuthStatus === 'function' && !window.getServiceAuthStatus()) {
        window.checkServiceAccessAndRedirect('laundry_staff.html');
        return; 
    }
    // Load ALL data components on startup
    loadOutstandingRequests();
    fetchAnalytics();
    fetchAllRequests();
}