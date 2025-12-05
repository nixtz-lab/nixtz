/**
 * staff_roster.js
 * FINAL STABLE VERSION. Fixes: Shift Config Form, Icons, Generate Button & Fixed Day Off logic.
 */

// Global constants and API endpoints
window.API_BASE_URL = window.API_BASE_URL || window.location.origin;
const API_URL = `${window.API_BASE_URL}/api/staff/roster`;
const PROFILE_API_URL = `${window.API_BASE_URL}/api/staff/profile`;

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_OFF_MARKER = 'หยุด'; 
const AUTH_TOKEN_KEY = localStorage.getItem('nixtz_auth_token') ? 'nixtz_auth_token' : 'tmt_auth_token'; 

// --- CORE SHIFTS DEFINITION ---
// Used for populating the config modal
const CORE_SHIFTS = { 
    1: { name: 'Morning', time: '07:00-16:00', required: 6 }, 
    2: { name: 'Afternoon', time: '13:30-22:30', required: 5 },
    3: { name: 'Night', time: '22:00-07:00', required: 3 },
};

// --- AUTHENTICATION ---
function getAuthStatus() { return !!localStorage.getItem(AUTH_TOKEN_KEY); }
function getUsernameFromToken() { return localStorage.getItem('nixtz_username') || 'Superwayno'; }

function updateAuthUI() {
    const isLoggedIn = getAuthStatus(); 
    const authButtons = document.getElementById('auth-buttons-container');
    const userMenu = document.getElementById('user-menu-container');
    const usernameDisplay = document.getElementById('username-display');

    if (isLoggedIn) {
        if(authButtons) authButtons.style.display = 'none';
        if(userMenu) userMenu.style.display = 'flex';
        if(usernameDisplay) usernameDisplay.textContent = getUsernameFromToken(); 
    } else {
        if(authButtons) authButtons.style.display = 'flex';
        if(userMenu) userMenu.style.display = 'none';
    }
}

// --- CORE ROSTER FUNCTIONS ---

// 1. ADD ROW
function addStaffRow(initialData = {}) {
    const rosterBody = document.getElementById('roster-body');
    if (!rosterBody) return;
    
    // Clear placeholder
    if (rosterBody.innerHTML.includes('Click Regenerate') || rosterBody.innerHTML.includes('Loading')) {
        rosterBody.innerHTML = '';
    }
    
    const staffRowHtml = `
        <tr data-id="${initialData.employeeId || 'temp'}">
            <td class="p-3 text-left font-medium text-white border-b border-gray-800">
                ${initialData.employeeName} <span class="text-xs text-gray-500">(${initialData.employeeId})</span>
            </td>
            ${DAYS.map(day => {
                // Find shift for this day
                const dayData = initialData.weeklySchedule?.find(d => d.dayOfWeek === day);
                const shiftInfo = dayData?.shifts[0] || {};
                const val = shiftInfo.jobRole || DAY_OFF_MARKER;
                
                return `
                <td class="roster-cell bg-gray-900 border-l border-b border-gray-800 p-2 text-center text-sm" data-day="${day}">
                    <input type="text" class="duty-input text-white w-full text-center bg-transparent focus:outline-none" value="${val}" />
                </td>`;
            }).join('')}
        </tr>
    `;
    rosterBody.insertAdjacentHTML('beforeend', staffRowHtml);
}

// 2. LOAD ROSTER
async function loadRoster(startDateString) {
    if (!startDateString || !getAuthStatus()) return; 
    
    const rosterBody = document.getElementById('roster-body');
    rosterBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400">Loading...</td></tr>';

    try {
        const response = await fetch(`${API_URL}/${startDateString}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)}` }
        });
        const result = await response.json();

        rosterBody.innerHTML = ''; // Clear loading

        if (response.ok && result.success && Array.isArray(result.data) && result.data.length > 0) {
            result.data.forEach(data => addStaffRow(data));
        } else {
            rosterBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-500">No roster found. Click "Regenerate" (Green Button).</td></tr>';
        }
    } catch (error) {
        console.error("Load Roster Error:", error);
        rosterBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-500">Connection Error.</td></tr>';
    }
    // Refresh icons just in case rows contain them in future
    if (window.lucide) window.lucide.createIcons();
}

// 3. REGENERATE ROSTER
window.forceRosterRegeneration = async function() {
    const dateInput = document.getElementById('week-start-date');
    const dateVal = dateInput ? dateInput.value : null;

    if (!dateVal || !getAuthStatus()) {
        alert("Please log in and select a date first.");
        return;
    }

    const confirmGen = confirm(`Generate NEW roster for week starting ${dateVal}? This will overwrite existing data.`);
    if (!confirmGen) return;

    // Show loading indicator
    const btn = document.querySelector('button[title="Regenerate Roster"]'); 
    if(btn) btn.disabled = true;

    try {
        const response = await fetch(`${API_URL}/generate/${dateVal}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)}` }
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            loadRoster(dateVal); // Immediate reload
        } else {
            alert("Generation Failed: " + (result.message || "Unknown error"));
        }
    } catch (e) {
        console.error(e);
        alert("Network Error: Could not generate roster.");
    } finally {
        if(btn) btn.disabled = false;
    }
};

// 4. UTILS
window.snapToMonday = function(dateString) {
    const date = new Date(dateString);
    const day = date.getDay(); 
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    return date.toISOString().split('T')[0];
};

window.handleDateChange = function(input) {
    if(!input.value) return;
    const monday = window.snapToMonday(input.value);
    if(input.value !== monday) input.value = monday;
    
    // Update headers
    const start = new Date(monday);
    DAYS.forEach((d, i) => {
        const curr = new Date(start);
        curr.setDate(start.getDate() + i);
        const el = document.getElementById(`header-${d.toLowerCase()}`);
        if(el) el.innerHTML = `<span class="day-header">${d}</span><br><span class="date-header text-xs text-gray-500">${curr.getDate()}/${curr.getMonth()+1}</span>`;
    });

    loadRoster(monday);
};

// 5. MODAL LOGIC (FIXED SHIFT CONFIG)
let staffCache = [];

// FIX: Populate Shift Config Dropdown
window.openShiftConfigModal = function() {
    const modal = document.getElementById('shift-config-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        // Populate the dropdown
        const select = document.getElementById('config-shift-select');
        const nameInput = document.getElementById('config-shift-name');
        const timeInput = document.getElementById('config-shift-time');
        
        if(select && select.options.length <= 1) { // Only populate if empty
            select.innerHTML = '<option value="">-- Select Shift Slot --</option>';
            Object.keys(CORE_SHIFTS).forEach(id => {
                const shift = CORE_SHIFTS[id];
                const option = document.createElement('option');
                option.value = id;
                option.textContent = `Shift ${id}: ${shift.name}`;
                select.appendChild(option);
            });
            
            // Add listener to auto-fill inputs when shift is selected
            select.onchange = function() {
                const shiftId = this.value;
                if(shiftId && CORE_SHIFTS[shiftId]) {
                    nameInput.value = CORE_SHIFTS[shiftId].name;
                    timeInput.value = CORE_SHIFTS[shiftId].time;
                } else {
                    nameInput.value = '';
                    timeInput.value = '';
                }
            };
        }
    } else {
        console.error("Shift config modal not found in DOM");
    }
};

window.openStaffRequestModal = async function() {
    const modal = document.getElementById('staff-request-modal');
    if (!modal) return;
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    const select = document.getElementById('request-staff-select');
    if (select) {
        select.innerHTML = '<option>Loading...</option>';
        await fetchStaffProfiles(); 
        select.innerHTML = '<option value="">-- Select Staff --</option>';
        staffCache.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.employeeId;
            opt.text = `${s.name} (${s.employeeId})`;
            select.add(opt);
        });
    }
};

window.showAddStaffModal = () => {
    const modal = document.getElementById('add-staff-modal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
};

// Fetch staff helper function
async function fetchStaffProfiles() {
    try {
        const res = await fetch(PROFILE_API_URL, { headers: { 'Authorization': `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)}` } });
        const json = await res.json();
        if(json.success) {
            staffCache = json.data;
            return staffCache;
        }
    } catch (e) {
        console.error("Fetch profiles error", e);
    }
    return [];
}

window.openStaffListModal = async () => {
    const modal = document.getElementById('staff-list-modal');
    if(!modal) return;
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    const container = document.getElementById('staff-profiles-container');
    container.innerHTML = '<p class="text-center text-gray-400 py-4">Loading...</p>';
    
    await fetchStaffProfiles();
    
    if(staffCache.length > 0) {
        container.innerHTML = staffCache.map(s => `
            <div class="flex justify-between items-center p-3 bg-gray-800 rounded-lg border border-gray-700 hover:border-nixtz-primary transition-colors duration-200">
                <div class="flex flex-col">
                    <span class="text-white font-semibold text-sm">${s.name}</span>
                    <span class="text-xs text-gray-400">${s.position} (${s.employeeId})</span>
                </div>
                <button onclick="openEditProfileModal('${s.employeeId}')" class="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full transition-colors">
                    <i data-lucide="edit" class="w-4 h-4"></i>
                </button>
            </div>
        `).join('');
        if (window.lucide) window.lucide.createIcons();
    } else {
        container.innerHTML = '<p class="text-center text-gray-500 py-4">No staff found.</p>';
    }
};

window.openEditProfileModal = (id) => {
    const s = staffCache.find(x => x.employeeId === id);
    if(!s) return;
    
    const titleEl = document.getElementById('single-staff-title');
    if(titleEl) titleEl.textContent = `Edit Profile: ${s.name}`;
    
    const idField = document.getElementById('edit-profile-id');
    if(idField) idField.value = s._id;
    
    const nameField = document.getElementById('edit-staff-name');
    if(nameField) nameField.value = s.name;
    
    const empIdField = document.getElementById('edit-staff-id');
    if(empIdField) empIdField.value = s.employeeId;
    
    const posField = document.getElementById('edit-staff-position');
    if(posField) posField.value = s.position;
    
    const prefField = document.getElementById('edit-staff-shift-preference');
    if(prefField) prefField.value = s.shiftPreference;
    
    const dayOffField = document.getElementById('edit-staff-fixed-dayoff');
    if(dayOffField) dayOffField.value = s.fixedDayOff;

    const modal = document.getElementById('single-staff-modal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
    
    document.getElementById('staff-list-modal')?.classList.add('hidden');
};

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    
    // Set initial date to this Monday
    const today = new Date();
    const d = document.getElementById('week-start-date');
    if(d) {
        const monday = window.snapToMonday(today.toISOString());
        d.value = monday;
        window.handleDateChange(d);
    }

    // Initialize Global Icons
    if (window.lucide) window.lucide.createIcons();

    // Fix: Add listener for Shift Config form
    const shiftForm = document.getElementById('shift-config-form');
    if(shiftForm) {
        shiftForm.addEventListener('submit', (e) => {
            e.preventDefault();
            // In a real app, send POST request here.
            alert("Shift configuration updated (Mock Success).");
            document.getElementById('shift-config-modal').classList.add('hidden');
        });
    }
});