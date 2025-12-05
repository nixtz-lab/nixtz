/**
 * laundry_staff.js
 * Handles the logic for the staff-facing laundry management panel.
 */

// --- 1. CONFIGURATION FIX ---
// Prevent "undefined/api/..." errors if global config is missing
if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = ''; 
}

document.addEventListener('DOMContentLoaded', () => {
    // Ensure Lucide icons are initialized
    createLucideIcons(); 
    
    // Run initial access check and data load
    initLaundryStaffPage();
    
    // Run the global banner display logic
    if (typeof window.updateServiceBanner === 'function') {
        window.updateServiceBanner();
    }

    // Attach global listener for outside clicks to close dropdown
    document.addEventListener('click', closeDropdownOnOutsideClick);
});

// Helper function to create Lucide icons if they exist globally
function createLucideIcons() {
    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    }
}

// ------------------------------------
// CORE APPLICATION LOGIC & UTILITIES
// ------------------------------------

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
        default: return null; // Already completed or cancelled
    }
}


// ------------------------------------
// 1. DYNAMIC UI & DROPDOWN LOGIC 
// ------------------------------------

/**
 * Toggles visibility of the user dropdown menu when the banner button is clicked.
 */
function toggleUserDropdown() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) {
        const isHidden = dropdown.style.display === 'none' || dropdown.style.display === '';
        dropdown.style.display = isHidden ? 'block' : 'none';
        
        // Re-render icons inside when opening
        if (isHidden) createLucideIcons();
    }
}
window.toggleUserDropdown = toggleUserDropdown; // Expose globally for HTML onclick


/**
 * Closes the user dropdown if the click occurred outside the container.
 */
function closeDropdownOnOutsideClick(event) {
    const userContainer = document.getElementById('user-display-container');
    const dropdown = document.getElementById('user-dropdown');
    const displayButton = document.getElementById('user-display-button');
    
    // Only hide if the dropdown is visible and the click is NOT inside the container
    if (dropdown && dropdown.style.display === 'block' && 
        userContainer && !userContainer.contains(event.target) &&
        !displayButton.contains(event.target)) {
        
        dropdown.style.display = 'none';
    }
}


// ------------------------------------
// 2. STATUS UPDATE (APP LOGIC)
// ------------------------------------
async function updateRequestStatus(requestId, newStatus) {
    // FIX: Use string literal to avoid ReferenceError if global variable is missing
    const token = localStorage.getItem('nixtz_service_auth_token'); 
    
    if (!token) {
         window.showMessage("Authentication failed. Redirecting to login.", true);
         if (typeof window.checkServiceAccessAndRedirect === 'function') {
            window.checkServiceAccessAndRedirect('laundry_staff.html');
         }
         return;
    }

    const confirmationMessage = `Are you sure you want to change the status of request ${requestId.substring(0, 8)}... to "${newStatus}"?`;
    
    // Use custom modal instead of alert/confirm
    const modalResponse = await showCustomConfirm(confirmationMessage);
    if (!modalResponse) return;

    try {
        const response = await fetch(`${window.API_BASE_URL}/api/laundry/update-status/${requestId}`, {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ status: newStatus })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            window.showMessage(result.message, false);
            loadOutstandingRequests(); // Refresh the list
        } else {
            if (response.status === 401 || response.status === 403) {
                 window.showMessage("Session expired or access denied. Redirecting to login.", true);
                 if (typeof window.handleServiceLogout === 'function') window.handleServiceLogout(); 
                 return;
            }
            window.showMessage(result.message || 'Failed to update request status.', true);
        }

    } catch (error) {
        console.error('Status Update Error:', error);
        window.showMessage('Network error during status update.', true);
    }
}
window.updateRequestStatus = updateRequestStatus; 

// ------------------------------------
// 3. REQUEST DISPLAY (APP LOGIC)
// ------------------------------------
function renderRequestCard(request) {
    const nextStatus = getNextStatus(request.status);
    const statusColorClass = getStatusColor(request.status);
    
    const itemsHtml = request.items.map(item => `
        <li class="text-xs text-gray-400">
            <span class="font-semibold">${item.count}x ${item.type}</span> 
            ${item.details ? `(<span class="italic">${item.details}</span>)` : ''}
        </li>
    `).join('');
    
    const actionButton = nextStatus ? `
        <button 
            onclick="updateRequestStatus('${request._id}', '${nextStatus}')"
            class="w-full py-2 px-4 text-sm font-bold rounded-lg text-nixtz-bg bg-nixtz-secondary hover:bg-[#0da070] transition"
        >
            Mark as "${nextStatus}"
        </button>
    ` : `<button disabled class="w-full py-2 px-4 text-sm font-bold rounded-lg bg-gray-600 text-gray-400 cursor-not-allowed">
            No further action
        </button>`;

    return `
        <div class="bg-gray-800 p-5 rounded-xl shadow-lg border-l-4 border-nixtz-secondary/50">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
                <h4 class="text-xl font-bold text-white">${request.department} 
                    <span class="text-base font-normal text-gray-400 ml-2">(${request.requesterUsername})</span>
                </h4>
                <span class="mt-2 sm:mt-0 px-3 py-1 text-xs font-semibold rounded-full ${statusColorClass}">
                    ${request.status}
                </span>
            </div>
            
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm mb-4 border-b border-gray-700 pb-4">
                <p class="text-gray-400"><i data-lucide="phone" class="w-4 h-4 inline mr-1 text-nixtz-primary"></i> <span class="font-semibold">Contact:</span> ${request.contactExt}</p>
                <p class="text-gray-400"><i data-lucide="clock" class="w-4 h-4 inline mr-1 text-nixtz-primary"></i> <span class="font-semibold">Requested:</span> ${new Date(request.requestedAt).toLocaleDateString()}</p>
                <p class="text-gray-400"><i data-lucide="tag" class="w-4 h-4 inline mr-1 text-nixtz-primary"></i> <span class="font-semibold">ID:</span> ${request._id.substring(0, 8)}...</p>
            </div>

            <div class="mb-4 p-3 bg-gray-900 rounded-lg">
                <p class="text-sm font-semibold text-gray-300 mb-1">Items for Processing:</p>
                <ul class="list-disc pl-5 space-y-0.5">
                    ${itemsHtml}
                </ul>
            </div>
            
            ${request.notes ? `<p class="text-sm text-gray-300 mb-4 p-2 border-l-4 border-yellow-500 bg-yellow-900/30 rounded-r-md"><span class="font-semibold">Special Notes:</span> ${request.notes}</p>` : ''}
            
            <div class="flex space-x-2">
                ${actionButton}
                <button 
                    onclick="updateRequestStatus('${request._id}', 'Cancelled')"
                    class="flex-shrink-0 py-2 px-4 text-sm font-bold rounded-lg text-white bg-status-cancelled hover:bg-red-600 transition"
                >
                    Cancel
                </button>
            </div>
        </div>
    `;
}

// ------------------------------------
// 4. DATA FETCHING (APP LOGIC)
// ------------------------------------
async function loadOutstandingRequests() {
    const listContainer = document.getElementById('requests-list');
    // FIX: Use string literal
    const token = localStorage.getItem('nixtz_service_auth_token'); 
    
    if (!listContainer) return;

    if (!token) {
        listContainer.innerHTML = '<p class="text-red-400 text-center py-8">Authentication token missing. Redirecting...</p>';
        if (typeof window.checkServiceAccessAndRedirect === 'function') {
            window.checkServiceAccessAndRedirect('laundry_staff.html');
        }
        return; 
    }

    listContainer.innerHTML = '<p class="text-gray-500 text-center py-8">Fetching latest requests...</p>';

    try {
        const response = await fetch(`${window.API_BASE_URL}/api/laundry/staff-view`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        // Check for 404 HTML response
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Server returned non-JSON response (likely a 404).");
        }

        const result = await response.json();

        if (response.ok && result.success && result.data.length > 0) {
            listContainer.innerHTML = result.data.map(renderRequestCard).join('');
        } else if (result.data && result.data.length === 0) {
            listContainer.innerHTML = '<p class="text-nixtz-secondary text-center py-8 font-bold">🎉 All caught up! No outstanding requests.</p>';
        } else {
             if (response.status === 401 || response.status === 403) {
                 window.showMessage("Session expired or access denied. Redirecting to login.", true);
                 if (typeof window.handleServiceLogout === 'function') window.handleServiceLogout(); 
                 return;
            }
            window.showMessage(result.message || 'Failed to load requests.', true);
            listContainer.innerHTML = `<p class="text-red-400 text-center py-8">${result.message || 'Error loading requests.'}</p>`;
        }
        
        if(typeof lucide !== 'undefined') lucide.createIcons();

    } catch (error) {
        console.error('Requests Load Error:', error);
        window.showMessage('A network error occurred while contacting the server.', true);
        listContainer.innerHTML = '<p class="text-red-400 text-center py-8">Network error loading requests.</p>';
    }
}

// ------------------------------------
// 5. UTILITY (Custom Confirm Modal) 
// ------------------------------------
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
        const modal = document.getElementById('custom-confirm-modal');
        
        const cleanup = () => {
            modal.remove();
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


// ------------------------------------
// 6. INITIALIZATION & ACCESS CHECK
// ------------------------------------
function initLaundryStaffPage() {
    // Rely on the new service-specific access check
    if (typeof window.getServiceAuthStatus === 'function' && !window.getServiceAuthStatus()) {
        if (typeof window.checkServiceAccessAndRedirect === 'function') {
            window.checkServiceAccessAndRedirect('laundry_staff.html');
        }
        return; 
    }
    
    // Check auth status and role access 
    const userRole = localStorage.getItem('nixtz_service_user_role');
    const isAuthorized = userRole === 'admin' || userRole === 'superadmin' || userRole === 'standard';
    
    if (!isAuthorized) {
         window.showMessage("Access Denied: Your role does not permit staff panel access.", true);
         if (typeof window.handleServiceLogout === 'function') window.handleServiceLogout(); 
         return;
    }

    loadOutstandingRequests();
}