/**
 * staff_roster.js
 * FINAL STABLE VERSION. Fixes: ReferenceError, Auth UI visibility, and initial load crash.
 */

// Global constants and API endpoints
window.API_BASE_URL = window.API_BASE_URL || window.location.origin; // Ensure API_BASE_URL is set
const API_URL = `${window.API_BASE_URL}/api/staff/roster`;
const PROFILE_API_URL = `${window.API_BASE_URL}/api/staff/profile`; // Endpoint for fetching ALL staff profiles
const LEAVE_HISTORY_API_URL = `${window.API_BASE_URL}/api/staff/leave/history`; 

// --- CORE SHIFTS: REPLICATED FROM GENERATOR ---
let CORE_SHIFTS = { 
    1: { name: 'Morning', time: '07:00-16:00', baseShiftId: 1, required: 6, roles: ['C1', 'C4', 'C3'] }, 
    2: { name: 'Afternoon', time: '13:30-22:30', baseShiftId: 2, required: 5, roles: ['C1', 'C5', 'C3'] },
    3: { name: 'Night', time: '22:00-07:00', baseShiftId: 3, required: 3, roles: ['C2', 'C1'] },
};
let SUB_SHIFTS = []; 
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_OFF_MARKER = 'หยุด'; 

function getAllShifts() {
    const all = { ...CORE_SHIFTS };
    SUB_SHIFTS.forEach(sub => {
        const uniqueId = sub.id; 
        all[uniqueId] = sub;
    });
    return all;
}


let currentRosterData = []; 
let currentWeekStartDate = null;
let staffProfilesCache = []; // Global cache for staff profiles
const AUTH_TOKEN_KEY = localStorage.getItem('nixtz_auth_token') ? 'nixtz_auth_token' : 'tmt_auth_token'; 

// --- AUTHENTICATION AND UI STATE HANDLER ---

function getAuthStatus() {
    return !!localStorage.getItem(AUTH_TOKEN_KEY); 
}
window.getAuthStatus = getAuthStatus;

function getUsernameFromToken() {
    return localStorage.getItem('nixtz_username') || 'Superwayno'; 
}

function updateAuthUI() {
    const isLoggedIn = getAuthStatus(); 
    const authButtons = document.getElementById('auth-buttons-container');
    const userMenu = document.getElementById('user-menu-container');
    const usernameDisplay = document.getElementById('username-display');

    if (isLoggedIn) {
        if (authButtons) authButtons.style.display = 'none';
        if (userMenu) userMenu.style.display = 'flex';
        if (usernameDisplay) usernameDisplay.textContent = getUsernameFromToken(); 
    } else {
        if (authButtons) authButtons.style.display = 'flex';
        if (userMenu) userMenu.style.display = 'none';
    }
}
window.updateAuthUI = updateAuthUI;


// --- MODAL & SHIFT CONFIGURATION LOGIC ---

function loadShiftConfig() { 
    return true; 
}
window.loadShiftConfig = loadShiftConfig;

window.openShiftConfigModal = function() { 
    console.log('Shift Config Modal Opened');
    document.getElementById('shift-config-modal')?.classList.remove('hidden');
    document.getElementById('shift-config-modal')?.classList.add('flex');
};
window.showAddStaffModal = function() { 
    console.log('Show Add Staff Modal clicked.');
    document.getElementById('add-staff-modal')?.classList.remove('hidden');
    document.getElementById('add-staff-modal')?.classList.add('flex');
};

// Helper function to populate the Staff Request Modal dropdown
function populateStaffRequestDropdown(staffList) {
    const select = document.getElementById('request-staff-select');
    if (!select) return;

    select.innerHTML = '<option value="">-- Select Staff --</option>';
    staffList.forEach(staff => {
        const option = document.createElement('option');
        option.value = staff.employeeId;
        option.textContent = `${staff.name} (${staff.employeeId})`;
        select.appendChild(option);
    });
}


/**
 * @function fetchStaffProfiles - Fetches and caches all staff profiles.
 * @param {boolean} updateUi - If true, updates the Staff List Modal UI.
 */
async function fetchStaffProfiles(updateUi = true) {
    if (!getAuthStatus()) return;
    const container = document.getElementById('staff-profiles-container');
    const authHeader = `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)}`;
    
    if (container && updateUi) {
        container.innerHTML = '<p class="text-gray-500 text-center py-4">Loading staff data...</p>';
    }

    try {
        const response = await fetch(PROFILE_API_URL, {
            method: 'GET',
            headers: { 'Authorization': authHeader },
        });
        
        let result;
        try {
            result = await response.json();
        } catch (e) {
            result = { success: false, message: `Non-JSON response (Status: ${response.status})` };
        }

        if (response.ok && result.success && Array.isArray(result.data)) {
            staffProfilesCache = result.data; // Cache the successful list
            
            if (container && updateUi) {
                 container.innerHTML = staffProfilesCache.map(staff => `
                    <div class="flex justify-between items-center p-3 bg-gray-800 rounded-lg border border-gray-700">
                        <span class="text-white font-semibold">${staff.name}</span>
                        <span class="text-sm text-gray-400">${staff.employeeId} - ${staff.position}</span>
                        <button onclick="openEditProfileModal('${staff.employeeId}')" class="text-nixtz-primary hover:text-nixtz-secondary">
                            <i data-lucide="edit" class="w-5 h-5"></i>
                        </button>
                    </div>
                `).join('');
                if (window.lucide) window.lucide.createIcons();
            }
            return staffProfilesCache;
        } else {
            const errorMsg = result.message || `API Error: Status ${response.status}. URL: ${PROFILE_API_URL}`;
            console.error("Fetch Staff Error:", errorMsg);

            if (container && updateUi) {
                container.innerHTML = `<p class="text-red-400 text-center py-4">Error fetching: ${errorMsg}</p>`;
            }
            return [];
        }
    } catch (error) {
        const networkErrorMsg = `Network Error: Could not connect to API at ${PROFILE_API_URL}.`;
        console.error("Fetch Staff Network Error:", error, networkErrorMsg);
        
        if (container && updateUi) {
             container.innerHTML = `<p class="text-red-400 text-center py-4">${networkErrorMsg}</p>`;
        }
        return [];
    }
}

// FIX: Update openStaffRequestModal to populate the dropdown 
window.openStaffRequestModal = async function() { 
    console.log('Open Staff Request Modal clicked. Populating staff dropdown...');
    
    document.getElementById('staff-request-modal')?.classList.remove('hidden');
    document.getElementById('staff-request-modal')?.classList.add('flex');
    document.getElementById('request-staff-select').innerHTML = '<option>Loading Staff...</option>';

    const staffList = await fetchStaffProfiles(false);
    populateStaffRequestDropdown(staffList);
};


// FIX: Implement working openStaffListModal
window.openStaffListModal = function() { 
    console.log('Open Staff List Modal clicked. Fetching profiles...');
    fetchStaffProfiles(true); 
    document.getElementById('staff-list-modal')?.classList.remove('hidden');
    document.getElementById('staff-list-modal')?.classList.add('flex');
};

// FIX: Implement working openEditProfileModal
async function openEditProfileModal(employeeId) {
    if (!employeeId) return;

    // Find the profile in the cached list
    const staff = staffProfilesCache.find(p => p.employeeId === employeeId);
    
    if (!staff) {
        window.showMessage(`Error: Staff profile for ID ${employeeId} not found in cache.`, true);
        return;
    }

    // 1. Get elements and populate data
    document.getElementById('single-staff-title').textContent = `Edit Profile: ${staff.name}`;
    // NOTE: If using MongoDB _id, you should ensure 'staff._id' is available here.
    document.getElementById('edit-profile-id').value = staff._id || staff.employeeId; 
    document.getElementById('edit-staff-name').value = staff.name;
    document.getElementById('edit-staff-id').value = staff.employeeId; 
    document.getElementById('edit-staff-position').value = staff.position;
    document.getElementById('edit-staff-shift-preference').value = staff.shiftPreference;
    document.getElementById('edit-staff-fixed-dayoff').value = staff.fixedDayOff;
    
    // 2. Show the modal
    document.getElementById('staff-list-modal')?.classList.add('hidden'); // Hide staff list
    document.getElementById('single-staff-modal')?.classList.remove('hidden');
    document.getElementById('single-staff-modal')?.classList.add('flex');
}
window.openEditProfileModal = openEditProfileModal;


// --- CORE ROSTER UTILITIES ---

function updateDateHeaders(startDateString) {
    if (!startDateString) return;
    
    const start = new Date(startDateString);
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    
    dayNames.forEach((dayName, index) => {
        const currentDate = new Date(start);
        currentDate.setDate(start.getDate() + index);
        
        const day = currentDate.getDate().toString().padStart(2, '0');
        const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
        
        const headerEl = document.getElementById(`header-${dayName.toLowerCase()}`);
        if (headerEl) {
            headerEl.innerHTML = `<span class="day-header">${dayName}</span><span class="date-header">${day}/${month}</span>`;
        }
    });
}
window.updateDateHeaders = updateDateHeaders;

// FIX: Implement working forceRosterRegeneration
window.forceRosterRegeneration = async function() { 
    if (!currentWeekStartDate || !getAuthStatus()) {
        window.showMessage("Select a week start date and log in first.", true);
        return;
    }
    window.showMessage("Forcing roster regeneration...", false);
    
    try {
        const response = await fetch(`${API_URL}/generate/${currentWeekStartDate}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)}` },
        });

        const result = await response.json();
        if (response.ok && result.success) {
            window.showMessage(result.message || 'Roster generated successfully.', false);
            loadRoster(currentWeekStartDate); // Reload the new roster
        } else {
            window.showMessage(result.message || 'Failed to generate roster.', true);
        }
    } catch (error) {
        window.showMessage("Network error during regeneration.", true);
        console.error("Regeneration error:", error);
    }
};

window.saveRoster = function() { console.log('Save Roster clicked. Initiating save API call.'); };
window.updateShiftSummaries = function() { console.log('Shift summaries updated.'); }; // Stub
window.toggleRequestFields = function(value) { console.log('Toggling request fields for:', value); }; // Stub
window.updateShiftRoleDropdown = function() { console.log('Updating shift role dropdown.'); }; // Stub
window.closeEditProfileModal = function(event) { // Stub
    event.preventDefault(); 
    document.getElementById('single-staff-modal')?.classList.add('hidden');
};


/**
 * @function addStaffRow - Renders a single staff row with inputs
 */
function addStaffRow(initialData = {}) {
    const rosterBody = document.getElementById('roster-body');
    if (!rosterBody) return;
    
    // Clear initial placeholder if data is being loaded
    if (rosterBody.innerHTML.includes('Click Regenerate or Add Staff to begin') || rosterBody.innerHTML.includes('Loading roster data')) {
        rosterBody.innerHTML = '';
    }
    
    const staffRowHtml = `
        <tr data-id="${initialData.employeeId || 'temp-id'}">
            <td class="p-3 text-left font-medium text-white">${initialData.employeeName || 'New Staff'} / ${initialData.employeeId || 'ID'}</td>
            ${DAYS.map(day => `
                <td class="roster-cell bg-gray-900 border-l border-gray-800" data-day="${day}">
                    <input type="text" class="duty-input" value="${initialData.weeklySchedule?.find(d => d.dayOfWeek === day)?.shifts[0]?.jobRole || ''}" placeholder="${DAY_OFF_MARKER}" />
                </td>
            `).join('')}
        </tr>
    `;
    rosterBody.insertAdjacentHTML('beforeend', staffRowHtml);
    
    if (window.lucide) window.lucide.createIcons();
}
window.addStaffRow = addStaffRow;


/**
 * @function loadRoster - Fetches roster from the API
 */
async function loadRoster(startDateString) {
    if (!startDateString || !getAuthStatus()) return; 

    // 1. Set Loading State
    const rosterBody = document.getElementById('roster-body');
    rosterBody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-gray-400">Loading roster data...</td></tr>';
    currentWeekStartDate = startDateString;

    try {
        // 2. Fetch the roster data for the specific week
        const response = await fetch(`${API_URL}/${startDateString}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)}`,
                'Content-Type': 'application/json',
            },
        });

        const result = await response.json();
        let rosterToRender = [];

        // Check if data is directly in `result.data` (expected for this endpoint)
        if (response.ok && result.success && Array.isArray(result.data)) {
            rosterToRender = result.data;
        } else {
             console.warn("No existing roster found in API response. Need regeneration.");
        }

        // 3. Render the Roster
        rosterBody.innerHTML = '';
        
        if (rosterToRender.length === 0) {
            document.getElementById('roster-body').innerHTML = '<tr><td colspan="8" class="text-center py-4 text-gray-500">No roster found for this week. Click Regenerate or Add Staff to begin.</td></tr>';
        } else {
            rosterToRender.forEach(data => addStaffRow(data));
        }

    } catch (error) {
        console.error("Error loading roster:", error);
        rosterBody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-red-500">Failed to load roster. Check API connection.</td></tr>';
    }
    
    if (window.lucide) window.lucide.createIcons(); 
}
window.loadRoster = loadRoster;


/**
 * @function snapToMonday
 */
function snapToMonday(dateString) {
    const date = new Date(dateString);
    const dayOfWeek = date.getDay(); 
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; 
    date.setDate(date.getDate() + diff);
    
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}
window.snapToMonday = snapToMonday;


/**
 * @function handleDateChange
 */
window.handleDateChange = function(inputElement) {
    if (!inputElement.value) return;
    
    const snappedDate = snapToMonday(inputElement.value);
    
    if (inputElement.value !== snappedDate) {
        inputElement.value = snappedDate;
    }
    
    updateDateHeaders(snappedDate);
    loadRoster(snappedDate);
};

document.addEventListener('DOMContentLoaded', () => {
    
    const dateInput = document.getElementById('week-start-date');
    const rosterBody = document.getElementById('roster-body');
    
    if (!dateInput || !rosterBody) {
        console.error("Initialization Failed: Critical DOM elements are missing.");
        return; 
    }
    
    // --- Initial Date Setup ---
    const today = new Date();
    const dayOfWeek = today.getDay(); 
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); 
    const monday = new Date(today.getFullYear(), today.getMonth(), diff);

    const year = monday.getFullYear();
    const month = (monday.getMonth() + 1).toString().padStart(2, '0');
    const date = monday.getDate().toString().padStart(2, '0');
    const isoString = `${year}-${month}-${date}`;
    
    dateInput.value = isoString;
    updateDateHeaders(isoString); // Update headers immediately

    // Load config 
    loadShiftConfig();
    
    // 1. CRITICAL: Update Auth UI first (solves username visibility)
    updateAuthUI();
    
    // 2. Load roster data if authentication check passes
    if (getAuthStatus()) {
        loadRoster(isoString); 
    } else {
        // If not logged in, ensure the initial placeholder is visible
        document.getElementById('roster-body').innerHTML = '<tr><td colspan="8" class="text-center py-4 text-gray-500">You must log in to view the Staff Roster.</td></tr>';
    }
    
    // 3. Final icon rendering 
    if (window.lucide) window.lucide.createIcons(); 
});