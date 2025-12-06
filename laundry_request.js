/**
 * laundry_request.js
 * Handles the logic for the user-facing laundry request submission form and history display.
 */

// --- 1. CONFIGURATION FIX ---
if (typeof window.API_BASE_URL === 'undefined') {
    // If your backend is live (Nginx configured), leave this empty:
    window.API_BASE_URL = ''; 
    
    // NOTE: If you still get "404 Not Found" after using this, 
    // it means your Nginx server block is missing the /api proxy pass.
}

const itemsContainer = document.getElementById('items-container');

// --- 2. MODE STATE MANAGEMENT (UPDATED) ---
let currentMode = 'supply'; // Changed default mode to 'supply'

const ITEM_OPTIONS = {
    pickup: [
        "Uniforms (Bulk)", 
        "Towels (Bulk)", 
        "Bed Sheets (Bulk)", 
        "Patient Gowns (Bulk)", 
        "Other"
    ],
    supply: [
        "Bed Sheet (Single)",
        "Bed Sheet (Double)",
        "Pillow Case",
        "Bath Towel",
        "Face Towel",
        "Blanket",
        "Patient Gown (Size S)",
        "Patient Gown (Size M)",
        "Patient Gown (Size L)",
        "Patient Gown (Size XL)",
        "Staff Scrub Top (Size M)",
        "Staff Scrub Top (Size L)",
        "Other"
    ]
};

document.addEventListener('DOMContentLoaded', () => {
    createLucideIcons();
    initLaundryRequestPage();
    document.addEventListener('click', closeDropdownOnOutsideClick);
    
    // Initialize default mode UI to 'supply' (Order Clean)
    setRequestMode('supply'); // <-- UPDATED
});

// Helper function to create Lucide icons safely
function createLucideIcons() {
    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    }
}

// --- 3. CORE APPLICATION LOGIC ---

function getStatusColor(status) {
    switch (status) {
        case 'Pending Pickup': return 'bg-status-pending text-nixtz-bg'; // Yellow
        case 'Pending Delivery': return 'bg-blue-500 text-white';        // Blue (For Clean Orders)
        case 'Picked Up': return 'bg-status-pickedup text-white';
        case 'In Progress': return 'bg-status-progress text-white';
        case 'Ready for Delivery': return 'bg-status-ready text-nixtz-bg';
        case 'Completed': return 'bg-status-complete text-white';
        case 'Cancelled': return 'bg-status-cancelled text-white';
        default: return 'bg-gray-500 text-white';
    }
}

// --- 4. TOGGLE MODE FUNCTION ---
function setRequestMode(mode) {
    currentMode = mode;
    const typeInput = document.getElementById('request-type');
    if(typeInput) typeInput.value = mode;

    // Update Button Styles
    const btnPickup = document.getElementById('btn-mode-pickup');
    const btnSupply = document.getElementById('btn-mode-supply');
    const submitBtn = document.getElementById('submit-btn');

    if (btnPickup && btnSupply && submitBtn) {
        if (mode === 'pickup') {
            btnPickup.className = "flex-1 py-2 text-sm font-bold rounded-md text-white bg-nixtz-primary shadow-lg transition-all duration-200";
            btnSupply.className = "flex-1 py-2 text-sm font-bold rounded-md text-gray-400 hover:text-white transition-all duration-200";
            submitBtn.textContent = "Request Pickup";
            submitBtn.className = "w-full py-3 mt-6 bg-nixtz-primary hover:bg-[#3f3bbf] text-white font-bold rounded-lg shadow-lg transition";
        } else {
            btnSupply.className = "flex-1 py-2 text-sm font-bold rounded-md text-nixtz-bg bg-nixtz-secondary shadow-lg transition-all duration-200";
            btnPickup.className = "flex-1 py-2 text-sm font-bold rounded-md text-gray-400 hover:text-white transition-all duration-200";
            submitBtn.textContent = "Order Supplies";
            submitBtn.className = "w-full py-3 mt-6 bg-nixtz-secondary hover:bg-[#0da070] text-white font-bold rounded-lg shadow-lg transition";
        }
    }

    // Reset Items
    if (itemsContainer) {
        itemsContainer.innerHTML = '';
        itemCounter = 0;
        itemsContainer.appendChild(createItemInput());
        createLucideIcons();
    }
}
window.setRequestMode = setRequestMode; 

// --- 5. HEADER UI LOGIC ---

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

// ------------------------------------
// 6. DYNAMIC ITEM INPUT MANAGEMENT
// ------------------------------------
let itemCounter = 0;

function createItemInput() {
    const idCounter = itemCounter++;
    const id = `item-${idCounter}`;
    const removeBtnId = `remove-${id}`;
    const itemDiv = document.createElement('div');
    itemDiv.id = id;
    itemDiv.className = 'flex flex-col sm:flex-row gap-2 border border-gray-700 p-3 rounded-lg bg-gray-800/30';
    
    // Generate Dropdown Options dynamically based on currentMode
    const optionsHtml = ITEM_OPTIONS[currentMode].map(opt => `<option value="${opt}">${opt}</option>`).join('');

    itemDiv.innerHTML = `
        <div class="flex-grow">
            <label for="${id}-type" class="block text-xs font-medium text-gray-400">Item Type</label>
            <select id="${id}-type" required class="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-nixtz-primary transition">
                ${optionsHtml}
            </select>
        </div>
        <div class="w-24">
            <label for="${id}-count" class="block text-xs font-medium text-gray-400">Quantity</label>
            <input type="number" id="${id}-count" required min="1" value="1" class="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-nixtz-primary transition">
        </div>
        <div class="sm:w-2/5">
            <label for="${id}-details" class="block text-xs font-medium text-gray-400">Details</label>
            <input type="text" id="${id}-details" class="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-nixtz-primary transition" placeholder="Optional notes">
        </div>
        <button type="button" id="${removeBtnId}" class="flex-shrink-0 mt-4 sm:mt-5 text-red-400 hover:text-red-500 transition" title="Remove Item">
            <i data-lucide="x" class="w-5 h-5"></i>
        </button>
    `;
    
    itemDiv.querySelector(`#${removeBtnId}`).addEventListener('click', () => {
        if (itemsContainer.children.length > 1) {
            itemDiv.remove();
        } else {
            window.showMessage("At least one item is required.", true);
        }
    });

    return itemDiv;
}

// ------------------------------------
// 7. FORM SUBMISSION
// ------------------------------------
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const department = document.getElementById('department').value.trim();
    const contactExt = document.getElementById('contact-ext').value.trim();
    const notes = document.getElementById('notes').value.trim();
    const requestType = currentMode; // Capture current mode
    
    const items = [];
    itemsContainer.querySelectorAll('[id^="item-"]').forEach(itemDiv => {
        const idPrefixMatch = itemDiv.id.match(/item-(\d+)/);
        if (!idPrefixMatch) return;
        const idPrefix = idPrefixMatch[0];
        
        const type = document.getElementById(`${idPrefix}-type`)?.value;
        const countInput = document.getElementById(`${idPrefix}-count`);
        const count = parseInt(countInput?.value);
        const details = document.getElementById(`${idPrefix}-details`)?.value.trim();

        if (count > 0 && type) {
            items.push({ type, count, details });
        }
    });

    if (items.length === 0) {
        window.showMessage("Please add at least one item.", true);
        return;
    }

    // Include requestType in the payload
    const payload = { department, contactExt, notes, items, requestType };
    const token = localStorage.getItem('nixtz_service_auth_token'); 
    
    if (!token) {
        window.showMessage("Authentication failed. Please log in.", true);
        window.checkServiceAccessAndRedirect('laundry_request.html');
        return;
    }

    try {
        const response = await fetch(`${window.API_BASE_URL}/api/laundry/request`, {
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
            form.reset();
            // Reset to defaults
            itemsContainer.innerHTML = '';
            itemCounter = 0;
            itemsContainer.appendChild(createItemInput());
            createLucideIcons(); 

            loadRequestHistory();
        } else {
            if (response.status === 401 || response.status === 403) {
                 window.showMessage("Session expired. Please log in again.", true);
                 if (typeof window.handleServiceLogout === 'function') window.handleServiceLogout(); 
                 return;
            }
            window.showMessage(result.message || 'Failed to submit request.', true);
        }

    } catch (error) {
        console.error('Submission Error:', error);
        window.showMessage('Network error during submission.', true);
    }
}

// ------------------------------------
// 8. HISTORY DISPLAY
// ------------------------------------
function renderRequestCard(request) {
    // Determine visuals based on Request Type
    const isSupply = request.requestType === 'supply';
    const typeLabel = isSupply ? 'Clean Order' : 'Pickup';
    const typeColor = isSupply ? 'text-nixtz-secondary' : 'text-blue-400';
    const typeIcon = isSupply ? 'download' : 'upload'; // Download = Receive Clean, Upload = Send Dirty
    
    // Border color based on type
    const borderColor = isSupply ? 'border-nixtz-secondary' : 'border-nixtz-primary';

    const itemsHtml = request.items.map(item => `
        <li class="text-xs text-gray-400 flex justify-between">
            <span>
                <span class="font-bold text-white">${item.count}x</span> ${item.type}
            </span>
            ${item.details ? `<span class="italic text-gray-500 text-[10px]">(${item.details})</span>` : ''}
        </li>
    `).join('');

    const statusColorClass = getStatusColor(request.status);
    const requestDate = new Date(request.requestedAt).toLocaleString();

    return `
        <div class="bg-gray-800 p-4 rounded-xl shadow-lg border-l-4 ${borderColor} hover:bg-gray-750 transition duration-200">
            <div class="flex justify-between items-start mb-2">
                <div class="flex items-center gap-2">
                    <i data-lucide="${typeIcon}" class="w-4 h-4 ${typeColor}"></i>
                    <h4 class="text-lg font-bold text-white">${request.department}</h4>
                </div>
                <span class="px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full ${statusColorClass}">
                    ${request.status || 'Pending'}
                </span>
            </div>
            
            <div class="flex justify-between items-center text-xs text-gray-500 mb-3 border-b border-gray-700 pb-2">
                <span>${requestDate}</span>
                <span class="font-bold ${typeColor}">${typeLabel}</span>
            </div>

            <div class="mb-3 p-2 bg-gray-900/50 rounded-lg border border-gray-700/50">
                <ul class="space-y-1">${itemsHtml}</ul>
            </div>
            
            ${request.notes ? `<p class="text-xs text-gray-400 border-t border-gray-700 pt-2 mt-2"><span class="font-bold text-gray-300">Note:</span> ${request.notes}</p>` : ''}
        </div>
    `;
}

async function loadRequestHistory() {
    const historyList = document.getElementById('request-history-list');
    const token = localStorage.getItem('nixtz_service_auth_token'); 
    
    if (!historyList) return;

    if (!token) {
        historyList.innerHTML = '<p class="text-red-400 text-center py-8">Authentication token missing.</p>';
        return; 
    }

    historyList.innerHTML = '<p class="text-gray-500 text-center py-8">Loading request history...</p>';

    try {
        const response = await fetch(`${window.API_BASE_URL}/api/laundry/user-requests`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Server returned non-JSON response (likely a 404 error page).");
        }

        const result = await response.json();
        
        if (response.status === 401 || response.status === 403) {
            if (typeof window.handleServiceLogout === 'function') window.handleServiceLogout(); 
            return;
        }

        if (response.ok && result.success) {
            historyList.innerHTML = result.data.length > 0 
                ? result.data.map(renderRequestCard).join('') 
                : '<p class="text-gray-400 text-center py-8">You have no previous laundry requests.</p>';
            createLucideIcons(); // Render icons for history items
        } else {
            historyList.innerHTML = `<p class="text-red-400 text-center py-8">${result.message || 'Error loading history.'}</p>`;
        }

    } catch (error) {
        console.error('History Load Network Error:', error);
        historyList.innerHTML = '<p class="text-red-400 text-center py-8">Could not connect to server.</p>';
    }
}

// ------------------------------------
// 9. INITIALIZATION
// ------------------------------------
function initLaundryRequestPage() {
    if (!window.getServiceAuthStatus()) {
        window.checkServiceAccessAndRedirect('laundry_request.html');
        return; 
    }

    const form = document.getElementById('laundry-request-form');
    if (form) form.addEventListener('submit', handleFormSubmit);
    
    // Setup item input management
    const addItemButton = document.getElementById('add-item-btn');
    if (addItemButton) {
        addItemButton.addEventListener('click', () => {
            itemsContainer.appendChild(createItemInput());
            createLucideIcons(); 
        });
    }

    loadRequestHistory();
    
    if (typeof window.updateServiceBanner === 'function') {
        window.updateServiceBanner(); 
    }
}