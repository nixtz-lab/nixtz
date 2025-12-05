/**
 * staff_roster.js
 * FINAL STABLE VERSION. Fixes: Persistent Shift Config (LocalStorage), Icons, and Dropdowns.
 */

// Global constants and API endpoints
window.API_BASE_URL = window.API_BASE_URL || window.location.origin;
const API_URL = `${window.API_BASE_URL}/api/staff/roster`;
const PROFILE_API_URL = `${window.API_BASE_URL}/api/staff/profile`;

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_OFF_MARKER = 'หยุด'; 
const AUTH_TOKEN_KEY = localStorage.getItem('nixtz_auth_token') ? 'nixtz_auth_token' : 'tmt_auth_token'; 
const SHIFT_STORAGE_KEY = 'nixtz_core_shifts';

// --- BASE CATEGORIES (The Fixed 1, 2, 3) ---
const BASE_CATEGORIES = {
    1: { name: 'Morning', defaultTime: '07:00-16:00', required: 6, roles: ['C1', 'C4', 'C3'] },
    2: { name: 'Afternoon', defaultTime: '13:30-22:30', required: 5, roles: ['C1', 'C5', 'C3'] },
    3: { name: 'Night', defaultTime: '22:00-07:00', required: 3, roles: ['C2', 'C1'] }
};

// --- ACTIVE SHIFTS (Editable List with Persistence) ---
// Try to load from LocalStorage first, otherwise use defaults.
let storedShifts = localStorage.getItem(SHIFT_STORAGE_KEY);
let CORE_SHIFTS = storedShifts ? JSON.parse(storedShifts) : { 
    '1': { baseId: 1, category: 'Morning', name: 'M1', time: '07:00-16:00', required: 6 }, 
    '2': { baseId: 2, category: 'Afternoon', name: 'A1', time: '13:30-22:30', required: 5 },
    '3': { baseId: 3, category: 'Night', name: 'N1', time: '22:00-07:00', required: 3 },
};

function saveShiftsToStorage() {
    localStorage.setItem(SHIFT_STORAGE_KEY, JSON.stringify(CORE_SHIFTS));
}

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

function addStaffRow(initialData = {}) {
    const rosterBody = document.getElementById('roster-body');
    if (!rosterBody) return;
    
    if (rosterBody.innerHTML.includes('Click Regenerate') || rosterBody.innerHTML.includes('Loading')) {
        rosterBody.innerHTML = '';
    }
    
    const staffRowHtml = `
        <tr data-id="${initialData.employeeId || 'temp'}">
            <td class="p-3 text-left font-medium text-white border-b border-gray-800">
                ${initialData.employeeName} <span class="text-xs text-gray-500">(${initialData.employeeId})</span>
            </td>
            ${DAYS.map(day => {
                const dayData = initialData.weeklySchedule?.find(d => d.dayOfWeek === day);
                const shiftInfo = dayData?.shifts[0] || {};
                
                // Display Logic
                let displayVal = shiftInfo.jobRole || DAY_OFF_MARKER;

                if (shiftInfo.shiftId) {
                    const config = CORE_SHIFTS[shiftInfo.shiftId];
                    if (config) {
                        if (displayVal !== config.name) {
                             displayVal = `${config.name} (${displayVal})`;
                        } else {
                             displayVal = config.name;
                        }
                    }
                }

                let cellClass = "text-white";
                if (displayVal.includes(DAY_OFF_MARKER) || displayVal.includes("Off")) {
                    cellClass = "text-gray-500";
                } else if (displayVal.includes("M") || displayVal.includes("Morning")) {
                    cellClass = "text-yellow-300 font-medium";
                } else if (displayVal.includes("A") || displayVal.includes("Afternoon")) {
                    cellClass = "text-blue-300 font-medium";
                } else if (displayVal.includes("N") || displayVal.includes("Night")) {
                    cellClass = "text-purple-300 font-medium";
                }
                
                return `
                <td class="roster-cell bg-gray-900 border-l border-b border-gray-800 p-2 text-center text-sm" data-day="${day}">
                    <input type="text" class="duty-input w-full text-center bg-transparent focus:outline-none ${cellClass}" value="${displayVal}" />
                </td>`;
            }).join('')}
        </tr>
    `;
    rosterBody.insertAdjacentHTML('beforeend', staffRowHtml);
}

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

        rosterBody.innerHTML = ''; 

        if (response.ok && result.success && Array.isArray(result.data) && result.data.length > 0) {
            result.data.forEach(data => addStaffRow(data));
        } else {
            rosterBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-500">No roster found. Click "Regenerate" (Green Button).</td></tr>';
        }
    } catch (error) {
        console.error("Load Roster Error:", error);
        rosterBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-500">Connection Error.</td></tr>';
    }
    // Refresh icons after loading
    if (window.lucide) window.lucide.createIcons();
}

window.forceRosterRegeneration = async function() {
    const dateInput = document.getElementById('week-start-date');
    const dateVal = dateInput ? dateInput.value : null;

    if (!dateVal || !getAuthStatus()) {
        alert("Please log in and select a date first.");
        return;
    }

    const confirmGen = confirm(`Generate NEW roster for week starting ${dateVal}? This will overwrite existing data.`);
    if (!confirmGen) return;

    const btn = document.querySelector('button[title="Regenerate Roster"]'); 
    if(btn) btn.disabled = true;

    try {
        const response = await fetch(`${API_URL}/generate/${dateVal}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)}` }
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            loadRoster(dateVal); 
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

// --- UTILS ---
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
    
    const start = new Date(monday);
    DAYS.forEach((d, i) => {
        const curr = new Date(start);
        curr.setDate(start.getDate() + i);
        const el = document.getElementById(`header-${d.toLowerCase()}`);
        if(el) el.innerHTML = `<span class="day-header">${d}</span><br><span class="date-header text-xs text-gray-500">${curr.getDate()}/${curr.getMonth()+1}</span>`;
    });

    loadRoster(monday);
};

// --- FORM & MODAL LOGIC ---
let staffCache = [];

// 1. Shift Config Logic
window.openShiftConfigModal = function() {
    const modal = document.getElementById('shift-config-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        // Populate Dropdown
        const select = document.getElementById('config-shift-select');
        const nameInput = document.getElementById('config-shift-name');
        const timeInput = document.getElementById('config-shift-time');
        
        if(select) {
            select.innerHTML = '<option value="">-- Add New to Category --</option>';
            Object.keys(BASE_CATEGORIES).forEach(id => {
                const base = BASE_CATEGORIES[id];
                const option = document.createElement('option');
                option.value = id;
                option.textContent = `Category ${id}: ${base.name}`; 
                select.appendChild(option);
            });
            
            select.onchange = function() {
                const baseId = this.value;
                if(baseId && BASE_CATEGORIES[baseId]) {
                    nameInput.value = ""; 
                    nameInput.placeholder = `e.g., ${baseId === '1' ? 'M2' : baseId === '2' ? 'A2' : 'N2'}`;
                    timeInput.value = BASE_CATEGORIES[baseId].defaultTime;
                } else {
                    nameInput.value = '';
                    timeInput.value = '';
                }
            };
        }
        renderShiftList();
    }
};

function renderShiftList() {
    const listContainer = document.getElementById('configured-shift-list');
    if (listContainer) {
        listContainer.innerHTML = '';
        Object.keys(CORE_SHIFTS).forEach(uniqueId => {
            const s = CORE_SHIFTS[uniqueId];
            listContainer.innerHTML += `
                <div class="flex justify-between items-center bg-gray-700 p-2 rounded border border-gray-600 mb-2">
                    <div>
                        <span class="text-xs text-gray-400 uppercase tracking-wider">Cat ${s.baseId}: ${s.category}</span>
                        <span class="text-white font-bold block text-lg">${s.name}</span>
                        <div class="text-xs text-gray-300">${s.time} (Req: ${s.required})</div>
                    </div>
                    <span class="text-nixtz-secondary text-xs bg-nixtz-secondary/10 px-2 py-1 rounded">Active</span>
                </div>
            `;
        });
    }
}

// 2. Staff Update/Request Logic
window.openStaffRequestModal = async function() {
    const modal = document.getElementById('staff-request-modal');
    if (!modal) return;
    
    // Auto-fill Week Start
    const weekStartVal = document.getElementById('week-start-date').value;
    const weekStartInput = document.getElementById('request-week-start');
    if (weekStartInput) weekStartInput.value = weekStartVal;

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Populate Shifts IMMEDIATELY
    const shiftSelect = document.getElementById('request-configured-shift');
    if (shiftSelect) {
        shiftSelect.innerHTML = '<option value="">-- Select Assigned Shift --</option>';
        const offOpt = document.createElement('option');
        offOpt.value = "STATUS_LEAVE";
        offOpt.text = "Status: Day Off / Leave";
        shiftSelect.add(offOpt);

        Object.keys(CORE_SHIFTS).forEach(id => {
            const s = CORE_SHIFTS[id];
            const opt = document.createElement('option');
            opt.value = `${s.baseId}|${s.name}`; 
            opt.text = `${s.name} (${s.time})`;
            shiftSelect.add(opt);
        });
    }
    
    // Populate Staff
    const select = document.getElementById('request-staff-select');
    if (select) {
        select.innerHTML = '<option>Loading...</option>';
        await fetchStaffProfiles(); 
        select.innerHTML = '<option value="">-- Select Staff --</option>';
        staffCache.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.employeeId; 
            opt.text = `${s.name} (${s.employeeId})`;
            opt.setAttribute('data-mongo-id', s._id); 
            select.add(opt);
        });
    }
    
    if(window.toggleRequestFields) window.toggleRequestFields('specific_day_duty'); 
};

window.toggleRequestFields = function(val) {
    document.getElementById('specific-assignment-fields').classList.add('hidden');
    document.getElementById('shift-pref-fields').classList.add('hidden');
    document.getElementById('none-clear-message').classList.add('hidden');
    
    if (val === 'specific_day_duty') document.getElementById('specific-assignment-fields').classList.remove('hidden');
    else if (val === 'weekly_shift_pref') document.getElementById('shift-pref-fields').classList.remove('hidden');
    else document.getElementById('none-clear-message').classList.remove('hidden');
}

window.showAddStaffModal = () => {
    const modal = document.getElementById('add-staff-modal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
};

window.closeEditProfileModal = (event) => {
    event.preventDefault();
    document.getElementById('single-staff-modal').classList.add('hidden');
    document.getElementById('staff-list-modal').classList.remove('hidden');
};

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
            <div class="flex justify-between items-center p-3 bg-gray-800 rounded-lg border border-gray-700 hover:border-nixtz-primary transition-colors duration-200 mb-2">
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
    
    document.getElementById('edit-profile-id').value = s._id;
    document.getElementById('edit-staff-name').value = s.name;
    document.getElementById('edit-staff-id').value = s.employeeId;
    document.getElementById('edit-staff-position').value = s.position;
    document.getElementById('edit-staff-shift-preference').value = s.shiftPreference;
    document.getElementById('edit-staff-fixed-dayoff').value = s.fixedDayOff;

    const modal = document.getElementById('single-staff-modal');
    if(modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
    
    document.getElementById('staff-list-modal')?.classList.add('hidden');
};

// --- INIT & EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    
    const today = new Date();
    const d = document.getElementById('week-start-date');
    if(d) {
        const monday = window.snapToMonday(today.toISOString());
        d.value = monday;
        window.handleDateChange(d);
    }

    if (window.lucide) window.lucide.createIcons();

    // 1. SHIFT CONFIG SAVE
    const shiftForm = document.getElementById('shift-config-form');
    if(shiftForm) {
        shiftForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const baseId = document.getElementById('config-shift-select').value;
            const name = document.getElementById('config-shift-name').value;
            const time = document.getElementById('config-shift-time').value;
            
            if(BASE_CATEGORIES[baseId]) {
                const newId = `custom_${Date.now()}`;
                const baseCat = BASE_CATEGORIES[baseId];
                
                CORE_SHIFTS[newId] = {
                    baseId: parseInt(baseId),
                    category: baseCat.name,
                    name: name,
                    time: time,
                    required: baseCat.required 
                };
                
                // SAVE TO LOCAL STORAGE
                saveShiftsToStorage();

                alert(`Added new shift "${name}" to ${baseCat.name} category.`);
                renderShiftList(); 
                document.getElementById('config-shift-name').value = "";
            } else {
                alert("Please select a valid Shift Category.");
            }
        });
    }

    // 2. STAFF REQUEST (UPDATE) SAVE
    const requestForm = document.getElementById('staff-request-form');
    if(requestForm) {
        requestForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const empId = document.getElementById('request-staff-select').value;
            const staffMember = staffCache.find(s => s.employeeId === empId);
            
            if(!staffMember || !staffMember._id) {
                alert("Error: Please select a valid staff member.");
                return;
            }

            const type = document.getElementById('request-type').value;
            let reqString = "None"; 
            const weekStart = document.getElementById('week-start-date').value;

            if (type === 'specific_day_duty') {
                const startDate = document.getElementById('request-start-date').value;
                const endDate = document.getElementById('request-end-date').value;
                const shiftValue = document.getElementById('request-configured-shift').value;
                
                let rShift = "STATUS_LEAVE";
                let rRole = "Leave";

                if (shiftValue && shiftValue !== "STATUS_LEAVE") {
                    const parts = shiftValue.split('|');
                    rShift = parts[0]; 
                    rRole = parts[1];  
                }

                reqString = `${weekStart}:${startDate}|${endDate}:${rShift}:${rRole}`;
            } 
            else if (type === 'weekly_shift_pref') {
                const newShift = document.getElementById('request-new-shift').value;
                reqString = `${weekStart}:${newShift}`;
            }

            try {
                const res = await fetch(`${PROFILE_API_URL}/${staffMember._id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)}`
                    },
                    body: JSON.stringify({ 
                        name: staffMember.name, 
                        position: staffMember.position, 
                        employeeId: staffMember.employeeId,
                        nextWeekHolidayRequest: reqString 
                    })
                });
                
                const json = await res.json();
                if(res.ok && json.success) {
                    alert("Request saved! Please REGENERATE the roster to see changes.");
                    document.getElementById('staff-request-modal').classList.add('hidden');
                } else {
                    alert("Failed to save: " + (json.message || "Unknown error"));
                }
            } catch(err) {
                console.error(err);
                alert("Network error saving request.");
            }
        });
    }

    // 3. EDIT STAFF PROFILE SAVE
    const editProfileForm = document.getElementById('edit-staff-form');
    if(editProfileForm) {
        editProfileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const dbId = document.getElementById('edit-profile-id').value;
            
            const updateData = {
                name: document.getElementById('edit-staff-name').value,
                employeeId: document.getElementById('edit-staff-id').value,
                position: document.getElementById('edit-staff-position').value,
                shiftPreference: document.getElementById('edit-staff-shift-preference').value,
                fixedDayOff: document.getElementById('edit-staff-fixed-dayoff').value
            };

            try {
                const res = await fetch(`${PROFILE_API_URL}/${dbId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)}`
                    },
                    body: JSON.stringify(updateData)
                });
                
                const json = await res.json();
                if(res.ok && json.success) {
                    alert("Profile updated successfully! \n\nIMPORTANT: Click 'Regenerate Roster' to apply these changes to the current schedule.");
                    document.getElementById('single-staff-modal').classList.add('hidden');
                    fetchStaffProfiles(); // Refresh cache
                } else {
                    alert("Failed to update profile: " + (json.message || "Unknown error"));
                }
            } catch(err) {
                console.error(err);
                alert("Network error updating profile.");
            }
        });
    }

    // 4. ADD STAFF SAVE
    const addStaffForm = document.getElementById('add-staff-form');
    if(addStaffForm) {
        addStaffForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const newData = {
                name: document.getElementById('new-staff-name').value,
                employeeId: document.getElementById('new-staff-id').value,
                position: document.getElementById('new-staff-position').value,
                shiftPreference: document.getElementById('new-staff-shift-preference').value,
                fixedDayOff: document.getElementById('new-staff-fixed-dayoff').value
            };

            try {
                const res = await fetch(`${PROFILE_API_URL}/add`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)}`
                    },
                    body: JSON.stringify(newData)
                });
                
                const json = await res.json();
                if(res.ok && json.success) {
                    alert("New staff added! Click 'Regenerate Roster' to include them.");
                    document.getElementById('add-staff-modal').classList.add('hidden');
                    addStaffForm.reset();
                    fetchStaffProfiles(); // Refresh cache
                } else {
                    alert("Failed to add staff: " + (json.message || "Unknown error"));
                }
            } catch(err) {
                console.error(err);
                alert("Network error adding staff.");
            }
        });
    }
});