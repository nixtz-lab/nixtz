/**
 * laundry_request.js
 * Handles the logic for the user-facing laundry request submission form and history display.
 */

// --- 1. CONFIGURATION FIX (CRITICAL) ---
if (typeof window.API_BASE_URL === 'undefined') {
    // Leave empty if Nginx is configured, or use 'https://nixtz.com:3000' if not.
    window.API_BASE_URL = ''; 
}

// const SERVICE_TOKEN_KEY = 'nixtz_service_auth_token'; // REMOVED: Defined globally or accessed directly

const itemsContainer = document.getElementById('items-container');

document.addEventListener('DOMContentLoaded', () => {
    // Ensure Lucide icons are initialized immediately
    createLucideIcons();
    
    // Initialize the page logic
    initLaundryRequestPage();
    
    // Attach event listeners for the header UI
    document.addEventListener('click', closeDropdownOnOutsideClick);
});

// Helper function to create Lucide icons safely
function createLucideIcons() {
    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
    }
}

// --- Core Application Logic ---

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

// ------------------------------------
// 2. HEADER BANNER UI & DROPDOWN LOGIC
// ------------------------------------

function toggleUserDropdown() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) {
        const isHidden = dropdown.style.display === 'none' || dropdown.style.display === '';
        dropdown.style.display = isHidden ? 'block' : 'none';
        
        // Re-render icons when opening, just in case they were hidden/not rendered
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
// 3. DYNAMIC ITEM INPUT MANAGEMENT
// ------------------------------------
let itemCounter = 0;

function createItemInput() {
    const idCounter = itemCounter++;
    const id = `item-${idCounter}`;
    const removeBtnId = `remove-${id}`;
    const itemDiv = document.createElement('div');
    itemDiv.id = id;
    itemDiv.className = 'flex flex-col sm:flex-row gap-2 border border-gray-700 p-3 rounded-lg';
    
    itemDiv.innerHTML = `
        <div class="flex-grow">
            <label for="${id}-type" class="block text-xs font-medium text-gray-400">Item Type</label>
            <select id="${id}-type" required class="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-nixtz-primary transition">
                <option value="Uniform">Uniform</option>
                <option value="Towels">Towels</option>
                <option value="Linens">Linens (Sheets, covers)</option>
                <option value="Staff Clothing">Staff Personal Clothing</option>
                <option value="Other">Other (Specify in Details)</option>
            </select>
        </div>
        <div>
            <label for="${id}-count" class="block text-xs font-medium text-gray-400">Quantity</label>
            <input type="number" id="${id}-count" required min="1" value="1" class="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-nixtz-primary transition">
        </div>
        <div class="sm:w-2/5">
            <label for="${id}-details" class="block text-xs font-medium text-gray-400">Details (Stain, etc.)</label>
            <input type="text" id="${id}-details" class="w-full px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:border-nixtz-primary transition" placeholder="Optional notes">
        </div>
        <button type="button" id="${removeBtnId}" class="flex-shrink-0 mt-4 sm:mt-5 text-red-400 hover:text-red-500 transition" title="Remove Item">
            <i data-lucide="x" class="w-5 h-5"></i>
        </button>
    `;
    
    // Attach remove listener
    itemDiv.querySelector(`#${removeBtnId}`).addEventListener('click', () => {
        itemDiv.remove();
        if (itemsContainer.children.length === 1) {
            itemsContainer.querySelector('.flex-shrink-0').disabled = true;
        }
    });

    return itemDiv;
}

// ------------------------------------
// 4. FORM SUBMISSION
// ------------------------------------
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const department = document.getElementById('department').value.trim();
    const contactExt = document.getElementById('contact-ext').value.trim();
    const notes = document.getElementById('notes').value.trim();
    
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

    const payload = { department, contactExt, notes, items };
    const token = localStorage.getItem('nixtz_service_auth_token'); // Manual string to avoid reference errors
    
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
            itemsContainer.innerHTML = '';
            itemCounter = 0;
            itemsContainer.appendChild(createItemInput());
            itemsContainer.querySelector('.flex-shrink-0').disabled = true;
            createLucideIcons(); // Refresh icons for new inputs

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
// 5. HISTORY DISPLAY
// ------------------------------------
function renderRequestCard(request) {
    const itemsHtml = request.items.map(item => `
        <li class="text-xs text-gray-400">
            <span class="font-semibold">${item.count}x ${item.type}</span> 
            ${item.details ? `(<span class="italic">${item.details}</span>)` : ''}
        </li>
    `).join('');

    const statusColorClass = getStatusColor(request.status);
    const requestDate = new Date(request.requestedAt).toLocaleString();

    return `
        <div class="bg-gray-800 p-4 rounded-xl shadow-lg border-l-4 border-nixtz-primary/50 hover:border-nixtz-primary transition duration-200">
            <div class="flex justify-between items-start mb-3">
                <h4 class="text-lg font-bold text-white">${request.department}</h4>
                <span class="px-3 py-1 text-xs font-semibold rounded-full ${statusColorClass}">
                    ${request.status}
                </span>
            </div>
            <p class="text-xs text-gray-500 mb-2">Submitted: ${requestDate}</p>
            <div class="mb-3 p-3 bg-gray-900 rounded-lg">
                <ul class="list-disc pl-5 space-y-0.5">${itemsHtml}</ul>
            </div>
            ${request.notes ? `<p class="text-sm text-gray-400 border-t border-gray-700 pt-2"><span class="font-semibold">Notes:</span> ${request.notes}</p>` : ''}
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

        // Handle non-JSON responses (like 404 pages)
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            throw new Error("Server returned non-JSON response (likely a 404 or 500 error page).");
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
        } else {
            historyList.innerHTML = `<p class="text-red-400 text-center py-8">${result.message || 'Error loading history.'}</p>`;
        }

    } catch (error) {
        console.error('History Load Network Error:', error);
        historyList.innerHTML = '<p class="text-red-400 text-center py-8">Could not connect to server.</p>';
    }
}

// ------------------------------------
// 6. INITIALIZATION
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
        itemsContainer.innerHTML = ''; // Clear existing
        itemsContainer.appendChild(createItemInput());
        itemsContainer.querySelector('.flex-shrink-0').disabled = true;

        addItemButton.addEventListener('click', () => {
            itemsContainer.appendChild(createItemInput());
            itemsContainer.querySelectorAll('.flex-shrink-0').forEach(btn => btn.disabled = false);
            createLucideIcons(); // RENDER ICONS FOR NEW BUTTON
        });
    }

    loadRequestHistory();
    
    if (typeof window.updateServiceBanner === 'function') {
        window.updateServiceBanner(); 
    }
}