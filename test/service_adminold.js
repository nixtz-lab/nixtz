/**
 * service_admin.js
 * Handles the logic for the dedicated Service Management Admin Panel.
 */

// --- 1. CONFIGURATION FIX ---
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = ''; 
}

document.addEventListener('DOMContentLoaded', () => {
    // --- AUTHENTICATION CHECK (NEW) ---
    // If no token exists, kick the user out immediately.
    if (!window.getServiceAuthStatus()) {
        window.checkServiceAccessAndRedirect('service_admin.html');
        return; // Stop execution
    }

    // 1. Initialize Icons
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    // 2. Load Dashboard Data
    fetchAnalytics();
    fetchAllRequests();
    
    // 3. Attach Form Listeners
    const createStaffForm = document.getElementById('create-staff-form');
    if (createStaffForm) {
        createStaffForm.addEventListener('submit', handleCreateStaffFormSubmit);
    }

    // 4. Attach Dropdown Close Listener
    document.addEventListener('click', closeDropdownOnOutsideClick);
    
    // 5. Update Header Banner
    if (typeof window.updateServiceBanner === 'function') {
        window.updateServiceBanner();
    }
});

// ------------------------------------
// 2. DROPDOWN LOGIC
// ------------------------------------

function toggleUserDropdown() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) {
        const isHidden = dropdown.style.display === 'none' || dropdown.style.display === '';
        dropdown.style.display = isHidden ? 'block' : 'none';
        
        if (isHidden && typeof lucide !== 'undefined') lucide.createIcons();
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


// ------------------------------------
// 3. DATA FETCHING & DASHBOARD
// ------------------------------------

const statusMap = {
    'PendingPickup': { label: 'Pending Pickup', color: 'bg-status-pending text-nixtz-bg', icon: 'hourglass' },
    'PickedUp': { label: 'Picked Up', color: 'bg-status-pickedup text-white', icon: 'truck' },
    'InProgress': { label: 'In Progress', color: 'bg-status-progress text-white', icon: 'washing-machine' },
    'ReadyforDelivery': { label: 'Ready for Delivery', color: 'bg-status-ready text-nixtz-bg', icon: 'box' },
    'Completed': { label: 'Completed', color: 'bg-status-complete text-white', icon: 'check-circle' },
    'Cancelled': { label: 'Cancelled', color: 'bg-status-cancelled text-white', icon: 'x-circle' }
};

async function fetchAnalytics() {
    // FIX: Ensure we use the string literal consistently to avoid ReferenceErrors
    const token = localStorage.getItem('nixtz_service_auth_token');
    
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE_URL}/api/laundry/admin/analytics`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        // Handle 403 Forbidden (Not an Admin)
        if (response.status === 403) {
             window.showMessage("Access Denied: Admin privileges required.", true);
             // Optional: Redirect back to staff panel if they are just standard staff
             setTimeout(() => window.location.href = 'laundry_staff.html', 1500);
             return;
        }

        const result = await response.json();

        if (response.ok && result.success) {
            updateAnalyticsDashboard(result.data);
        } else {
            if(window.showMessage) window.showMessage(result.message || 'Failed to load analytics.', true);
        }
    } catch (error) {
        console.error('Analytics Fetch Error:', error);
    }
}

async function fetchAllRequests() {
    const tableBody = document.getElementById('all-requests-body');
    const token = localStorage.getItem('nixtz_service_auth_token');

    if (!tableBody || !token) return;

    tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-500">Loading all requests...</td></tr>';

    try {
        const response = await fetch(`${window.API_BASE_URL}/api/laundry/admin/all-requests`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Invalid server response (404/500)");
        }

        const result = await response.json();

        if (response.ok && result.success && result.data.length > 0) {
            tableBody.innerHTML = result.data.map(renderRequestRow).join('');
        } else if (result.data && result.data.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-400">No requests found in the system.</td></tr>';
        } else {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-red-400">Error loading data.</td></tr>';
        }

        if(typeof lucide !== 'undefined') lucide.createIcons();

    } catch (error) {
        console.error('All Requests Fetch Error:', error);
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-red-400">Network error loading requests.</td></tr>';
    }
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
        const labelText = key === 'Total' ? 'Total Requests' : info.label;
        const textColor = key === 'Total' ? 'text-white' : (key === 'PendingPickup' || key === 'ReadyforDelivery' ? 'text-nixtz-bg' : 'text-white');

        return `
            <div class="p-4 rounded-xl shadow-lg border border-gray-700 ${cardColor}">
                <div class="flex justify-between items-center">
                    <i data-lucide="${iconName}" class="w-6 h-6 ${textColor}"></i>
                    <p class="text-3xl font-extrabold ${textColor}">${count}</p>
                </div>
                <p class="text-sm mt-2 font-medium ${textColor}">${labelText}</p>
            </div>
        `;
    }).join('');
    
    if(typeof lucide !== 'undefined') lucide.createIcons();
}

function renderRequestRow(request) {
    const statusInfo = statusMap[request.status.replace(/\s/g, '')] || { label: request.status, color: 'bg-gray-500 text-white' };
    
    const itemsSummary = request.items.slice(0, 2).map(item => `${item.count}x ${item.type}`).join(', ') + 
                         (request.items.length > 2 ? ` (+${request.items.length - 2} more)` : '');

    const requestedDate = new Date(request.requestedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

    return `
        <tr class="bg-gray-900 border-b border-gray-800 hover:bg-gray-800 transition duration-150">
            <td class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Department</td>
            <td class="px-4 py-3 text-left text-xs font-medium text-gray-400">${request.requesterUsername} / ${request.contactExt}</td>
            <td class="px-4 py-3 text-sm text-gray-400 hidden sm:table-cell">${itemsSummary}</td>
            <td class="px-4 py-3 text-sm">
                <span class="px-3 py-1 text-xs font-semibold rounded-full ${statusInfo.color}">
                    ${statusInfo.label}
                </span>
            </td>
            <td class="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">${requestedDate}</td>
            <td class="px-4 py-3">
                <button 
                    onclick="deleteRequest('${request._id}', '${request.department}')"
                    class="text-red-400 hover:text-red-600 transition p-1 rounded-full hover:bg-red-900/30"
                    title="Delete Request"
                >
                    <i data-lucide="trash-2" class="w-5 h-5"></i>
                </button>
            </td>
        </tr>
    `;
}

// ------------------------------------
// 4. ADMIN ACTIONS
// ------------------------------------

async function deleteRequest(id, department) {
    const token = localStorage.getItem('nixtz_service_auth_token');
    if (!token) return;

    const confirmationMessage = `Are you sure you want to PERMANENTLY delete the request from ${department}? This cannot be undone.`;
    const modalResponse = await showCustomConfirm(confirmationMessage);
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
        } else {
            window.showMessage(result.message || 'Failed to delete request.', true);
        }

    } catch (error) {
        console.error('Delete Error:', error);
        window.showMessage('Network error during deletion.', true);
    }
}
window.deleteRequest = deleteRequest;

async function handleCreateStaffFormSubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById('staff-name').value.trim();
    const semployeeId = document.getElementById('staff-employee-id').value.trim();
    const password = document.getElementById('staff-password').value.trim();
    const department = document.getElementById('staff-department').value;
    const role = document.getElementById('staff-role').value;

    if (!name || !semployeeId || !password || !department || !role) {
        window.showMessage("All fields are required.", true);
        return;
    }
    if (password.length < 8) {
         window.showMessage("Password must be at least 8 characters long.", true);
         return;
    }

    const payload = { 
        sname: name,             
        semployeeId: semployeeId,
        spassword: password,     
        sdepartment: department, 
        srole: role              
    }; 
    
    const token = localStorage.getItem('nixtz_service_auth_token');

    try {
        const response = await fetch(`${window.API_BASE_URL}/api/service/admin/create-staff-v2`, { 
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            window.showMessage(result.message, false);
            e.target.reset(); 
        } else {
            window.showMessage(result.message || 'Failed to create staff account.', true);
        }

    } catch (error) {
        console.error('Staff Creation Error:', error);
        window.showMessage('Network error.', true);
    }
}

function showCustomConfirm(message) {
    return new Promise(resolve => {
        let existingModal = document.getElementById('custom-confirm-modal');
        if (existingModal) existingModal.remove();

        const modalHtml = `
            <div id="custom-confirm-modal" class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[10000]">
                <div class="bg-nixtz-card p-6 rounded-xl shadow-2xl max-w-sm w-full border border-gray-700">
                    <h3 class="text-lg font-bold text-white mb-4">Confirmation Required</h3>
                    <p class="text-gray-300 mb-6">${message}</p>
                    <div class="flex justify-end space-x-3">
                        <button id="cancel-btn" class="px-4 py-2 text-sm font-semibold rounded-lg text-gray-400 border border-gray-600 hover:bg-gray-700 transition">
                            Cancel
                        </button>
                        <button id="confirm-btn" class="px-4 py-2 text-sm font-semibold rounded-lg text-white bg-nixtz-secondary hover:bg-[#0da070] transition">
                            Confirm
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        const cleanup = () => {
            const modal = document.getElementById('custom-confirm-modal');
            if (modal) modal.remove();
        };

        document.getElementById('confirm-btn').onclick = () => {
            cleanup();
            resolve(true);
        };

        document.getElementById('cancel-btn').onclick = () => {
            cleanup();
            resolve(false);
        };
    });
}