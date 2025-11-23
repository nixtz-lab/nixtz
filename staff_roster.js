/**
 * staff_roster.js
 * Custom logic for the 7-Eleven Staff Roster page.
 * NOTE: Relies on global variables and functions defined in script.js (e.g., API_BASE_URL, getAuthStatus, showMessage).
 */

const API_URL = `${window.API_BASE_URL}/api/staff/roster`;
const PROFILE_API_URL = `${window.API_BASE_URL}/api/staff/profile`;
const SHIFTS = { 
    1: { name: 'Morning', time: '07:00-16:00', required: 6, roles: ['C1', 'C4', 'C3'] },
    2: { name: 'Afternoon', time: '13:30-22:30', required: 5, roles: ['C1', 'C5', 'C3'] },
    3: { name: 'Night', time: '22:00-07:00', required: 'N/A', roles: ['C1', 'C2'] }
};
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

let currentRosterData = []; 
let currentWeekStartDate = null;
let currentStaffData = {}; // Cache for single profile editing
let staffProfilesCache = []; // Global cache for profiles
const AUTH_TOKEN_KEY = localStorage.getItem('nixtz_auth_token') ? 'nixtz_auth_token' : 'tmt_auth_token'; // Use the correct key

// --- CORE ROSTER UTILITIES ---

/**
 * Helper function to calculate and format dates for the table headers.
 * @param {string} startDateString - The ISO date string of Monday (week start).
 */
function updateDateHeaders(startDateString) {
    if (!startDateString) return;

    // Use Date object constructed from the input string
    const startDate = new Date(startDateString); 
    const dayHeaders = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    for (let i = 0; i < 7; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        
        // Format: DD/MM (Example: 24/11)
        const dayOfMonth = currentDate.getDate().toString().padStart(2, '0');
        const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
        const dateString = `${dayOfMonth}/${month}`;

        const headerCell = document.getElementById(`header-${dayHeaders[i].toLowerCase()}`);
        if (headerCell) {
            headerCell.innerHTML = `
                <span class="day-header">${dayHeaders[i]}</span>
                <span class="date-header">${dateString}</span>
            `;
        }
    }
}

/**
 * Custom sorting logic: Manager -> Supervisors -> Normal Staff -> Delivery.
 * @param {Array} rosterData - The roster array to be sorted.
 * @returns {Array} Sorted roster data.
 */
function sortRosterData(rosterData) {
    const positionOrder = {
        'Manager': 1,
        'Supervisor': 2,
        'Normal Staff': 3,
        'Delivery': 4
    };

    return rosterData.sort((a, b) => {
        const posA = a.position || 'Normal Staff';
        const posB = b.position || 'Normal Staff';
        
        const orderA = positionOrder[posA] || 99;
        const orderB = positionOrder[posB] || 99;

        if (orderA !== orderB) {
            return orderA - orderB;
        }
        // Secondary sort by name if positions are the same
        return a.employeeName.localeCompare(b.employeeName);
    });
}


function getRosterForSave() {
    const rows = document.querySelectorAll('#roster-body tr');
    const rosterData = [];

    rows.forEach(row => {
        const nameInput = row.querySelector('.staff-name-input');
        const idInput = row.querySelector('.staff-id-input');
        if (!nameInput || !idInput || !nameInput.value.trim()) return;
        
        const cachedStaff = staffProfilesCache.find(s => s.employeeId === idInput.value.trim());
        
        const weeklySchedule = [];
        DAYS.forEach((day, dayIndex) => {
            const shiftCell = row.querySelector(`[data-day="${day}"]`);
            if (shiftCell) {
                const textContent = shiftCell.textContent.trim();
                const shifts = [];
                
                if (textContent.includes('Leave')) {
                    shifts.push({ shiftId: null, jobRole: textContent, timeRange: 'Full Day' });
                } else if (textContent) {
                    const cellDisplay = shiftCell.innerHTML;
                    const shiftMatch = cellDisplay.match(/^(\d+)\s+([A-Za-z0-9\s()]+)<span/);
                    const timeMatch = cellDisplay.match(/<span[^>]*>([^<]+)<\/span>/);
                    
                    if (shiftMatch) {
                        const shiftId = parseInt(shiftMatch[1]);
                        const jobRole = shiftMatch[2].trim();
                        const timeRange = timeMatch ? timeMatch[1].trim() : SHIFTS[shiftId].time;
                        
                        shifts.push({
                            shiftId: shiftId,
                            jobRole: jobRole,
                            timeRange: timeRange
                        });
                    }
                }

                weeklySchedule.push({
                    dayOfWeek: day,
                    shifts: shifts
                });
            }
        });

        const employeeId = idInput.value.trim() || nameInput.value.trim().toLowerCase().replace(/[\s\(\)]/g, '-');
        
        rosterData.push({
            employeeName: nameInput.value.trim(),
            employeeId: employeeId,
            weeklySchedule: weeklySchedule,
            position: cachedStaff ? cachedStaff.position : 'Normal Staff',
            nextWeekHolidayRequest: cachedStaff ? cachedStaff.nextWeekHolidayRequest : 'None'
        });
    });

    return rosterData;
}

function updateShiftSummaries() {
    const counts = {};
    const daysMap = {};
    
    DAYS.forEach(day => {
        daysMap[day] = { 1: { actual: 0, required: SHIFTS[1].required }, 2: { actual: 0, required: SHIFTS[2].required }, 3: { actual: 0, required: 'N/A' } };
    });

    DAYS.forEach(day => {
        document.querySelectorAll(`#roster-body [data-day="${day}"]`).forEach(cell => {
            const cellText = cell.textContent.trim();
            if (!cellText || cellText.includes('Leave')) return;

            const shiftIdMatch = cellText.match(/^(\d+)/);
            if (shiftIdMatch) {
                const shiftId = parseInt(shiftIdMatch[1]);
                if (shiftId && daysMap[day][shiftId]) {
                    daysMap[day][shiftId].actual++;
                }
            }
        });
    });

    DAYS.forEach(day => {
        const summaryCell = document.getElementById(`shift-summary-${day.toLowerCase()}`);
        if (!summaryCell) return;
        
        let content = '';
        for (const shiftId in daysMap[day]) {
            const data = daysMap[day][shiftId];
            const required = data.required === 'N/A' ? '' : data.required;
            const statusClass = (data.required !== 'N/A' && data.actual < data.required) ? 'text-red-400' : 'text-nixtz-secondary';

            if(data.actual > 0 || required !== '') {
                content += `<div class="shift-summary">
                                <span class="text-gray-400 font-normal mr-1">${shiftId} (${required}):</span>
                                <span class="${statusClass}">${data.actual}</span>
                            </div>`;
            }
        }
        summaryCell.innerHTML = content;
    });
}

// ... (createShiftDropdown, setShiftSelection, hideAllDropdowns, addStaffRow, deleteStaffRow functions remain the same) ...
function createShiftDropdown(cell) {
    if (cell.querySelector('.shift-dropdown')) return;
    
    const existingText = cell.textContent.trim();
    const shiftMatch = existingText.match(/^(\d+)\s+([A-Za-z0-9\s()]+)/);
    const initialShiftId = shiftMatch ? parseInt(shiftMatch[1]) : null;
    const initialJobRole = shiftMatch ? shiftMatch[2].trim() : null;

    const day = cell.dataset.day;
    const shiftDropdown = document.createElement('div');
    shiftDropdown.className = 'shift-dropdown';
    shiftDropdown.onclick = (e) => e.stopPropagation();

    shiftDropdown.innerHTML += `<button class="dropdown-button bg-red-600 hover:bg-red-500" onclick="setShiftSelection(event, '${day}', null, 'Leave', 'Full Day')">LEAVE (휴가)</button>`;

    [1, 2, 3].forEach(shiftId => {
        const shiftConfig = SHIFTS[shiftId];
        if (!shiftConfig) return;

        shiftDropdown.innerHTML += `<div class="text-xs text-gray-400 mt-2 border-t border-gray-600 pt-1">${shiftConfig.name} (${shiftConfig.time})</div>`;

        shiftConfig.roles.forEach(role => {
            const fullRole = (role === 'C1' && shiftId !== 3) ? `${role} (Sup/Mgr)` : role;
            const isSelected = (initialShiftId === shiftId && initialJobRole === fullRole);
            
            shiftDropdown.innerHTML += `
                <button 
                    class="dropdown-button ${isSelected ? 'bg-nixtz-secondary' : ''}" 
                    onclick="setShiftSelection(event, '${day}', ${shiftId}, '${fullRole}', '${shiftConfig.time}')"
                >
                    ${shiftId} ${fullRole}
                </button>
            `;
        });
    });

    cell.appendChild(shiftDropdown);
    
    const rect = cell.getBoundingClientRect();
    if (rect.right > window.innerWidth - 200) {
        shiftDropdown.style.right = '0';
        shiftDropdown.style.left = 'auto';
    } else {
        shiftDropdown.style.left = '0';
        shiftDropdown.style.right = 'auto';
    }
    
    shiftDropdown.classList.remove('hidden');
}
window.createShiftDropdown = createShiftDropdown;

function setShiftSelection(event, day, shiftId, jobRole, timeRange) {
    const button = event.target;
    const cell = button.closest('.roster-cell');
    
    cell.removeAttribute('style');
    if (jobRole === 'Leave') {
        cell.innerHTML = jobRole;
        cell.classList.remove('bg-gray-700', 'bg-nixtz-card');
        cell.classList.add('bg-red-800', 'font-bold');
    } else {
        cell.innerHTML = `${shiftId} ${jobRole}<span class="text-xs text-gray-500 block leading-none">${timeRange}</span>`;
        cell.classList.remove('bg-red-800', 'bg-nixtz-card', 'font-bold');
        cell.classList.add('bg-gray-700');
    }
    
    cell.querySelector('.shift-dropdown')?.remove();
    
    updateShiftSummaries();
}
window.setShiftSelection = setShiftSelection;


function hideAllDropdowns(event) {
    const isInsideDropdown = event.target.closest('.shift-dropdown');
    const isCell = event.target.closest('.roster-cell');
    
    if (!isInsideDropdown && !isCell) {
        document.querySelectorAll('.shift-dropdown').forEach(d => d.remove());
    } else if (isCell && !isInsideDropdown) {
        document.querySelectorAll('.shift-dropdown').forEach(d => {
            if (d.closest('.roster-cell') !== isCell) {
                d.remove();
            }
        });
    }
}
document.addEventListener('click', hideAllDropdowns);


function addStaffRow(initialData = {}) {
    const rosterBody = document.getElementById('roster-body');
    const newRow = document.createElement('tr');
    newRow.className = 'hover:bg-gray-800 transition duration-150 border-b border-gray-700';

    const staffName = initialData.employeeName || '';
    const staffId = initialData.employeeId || '';
    
    const position = initialData.position || 'Normal Staff';

    let rowHTML = `
        <td class="p-2 bg-gray-900 sticky left-0 z-10 border-r border-gray-700">
            <input type="text" value="${staffName}" placeholder="Staff Name" class="staff-name-input bg-transparent font-semibold w-full" data-key="name">
            <input type="text" value="${staffId}" placeholder="ID" class="staff-id-input bg-transparent text-xs text-gray-500 w-full mt-1" data-key="id">
        </td>
    `;

    DAYS.forEach(day => {
        const daySchedule = initialData.weeklySchedule?.find(s => s.dayOfWeek === day);
        let cellContent = '';
        let cellClasses = 'bg-nixtz-card';
        let customColor = '';
        
        if (daySchedule && daySchedule.shifts.length > 0) {
            const shift = daySchedule.shifts[0];
            const shiftId = shift.shiftId;
            const jobRole = shift.jobRole;
            const timeRange = shift.timeRange;
            
            if (jobRole && jobRole.includes('Leave')) {
                cellContent = jobRole;
                cellClasses = 'bg-red-800 font-bold';
            } else if (shiftId && jobRole && timeRange) {
                cellContent = `${shiftId} ${jobRole}<span class="text-xs text-gray-500 block leading-none">${timeRange}</span>`;
                cellClasses = 'bg-gray-700';

                if (shift.color) {
                    customColor = `style="background-color: ${shift.color}40; border-left: 4px solid ${shift.color};"`;
                }
            }
        }
        
        rowHTML += `
            <td class="roster-cell p-2 border-r border-gray-700 ${cellClasses}" 
                data-day="${day}" 
                onclick="createShiftDropdown(this)"
                ${customColor}>
                ${cellContent}
            </td>
        `;
    });
    
    rowHTML += `<td class="p-2 text-center bg-gray-900 border-l border-gray-700">
                    <button onclick="deleteStaffRow(this)" class="text-red-500 hover:text-red-400 transition duration-200" title="Delete Row">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </td>`;

    newRow.innerHTML = rowHTML;
    rosterBody.appendChild(newRow);
    
    lucide.createIcons();
    updateShiftSummaries();
}
window.addStaffRow = addStaffRow;

function deleteStaffRow(button) {
    button.closest('tr').remove();
    updateShiftSummaries();
}
window.deleteStaffRow = deleteStaffRow;
// ... (rest of the core utilities remain the same) ...


// --- API CALLS ---
async function loadRoster(startDateString) {
    if (!startDateString) return;
    if (!window.getAuthStatus || !getAuthStatus()) return showMessage("Please log in to load the roster.", true);
    
    updateDateHeaders(startDateString); // 1. Update dates in header

    // Ensure date format is YYYY-MM-DD
    const isoDate = new Date(startDateString).toISOString().split('T')[0];
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    
    showMessage(`Loading roster for week starting ${isoDate}...`, false);
    
    try {
        // --- STEP 1: Attempt to Load Existing Roster ---
        let response = await fetch(`${API_URL}/${isoDate}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        
        let result = await response.json();
        let rosterData = result.data;
        let generated = false;

        // --- STEP 2: If no roster found, attempt to GENERATE it ---
        if (!rosterData || rosterData.length === 0) {
            showMessage(`No saved roster found for this week. Attempting automatic generation...`, false);
            
            response = await fetch(`${API_URL}/generate/${isoDate}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to generate roster data.');
            }
            
            result = await response.json();
            rosterData = result.data;
            generated = true;
        }

        // --- STEP 3: Fetch profiles for sorting and caching ---
        await fetchStaffProfilesForDropdown(); // Update cache before sorting

        // --- STEP 4: Render the Roster with new sorting ---
        
        document.getElementById('roster-body').innerHTML = '';
        currentRosterData = rosterData;
        currentWeekStartDate = startDateString;
        
        // Augment roster data with position from cache for sorting
        const rosterWithPositions = rosterData.map(r => {
            const profile = staffProfilesCache.find(s => s.employeeId === r.employeeId);
            return {
                ...r,
                position: profile ? profile.position : 'Normal Staff'
            };
        });

        const sortedRoster = sortRosterData(rosterWithPositions); // 3. Apply new sorting

        if (sortedRoster.length === 0) {
            showMessage('Could not generate or find a roster. Start adding staff profiles!', true);
            for(let i = 0; i < 2; i++) addStaffRow({});
        } else {
            sortedRoster.forEach(data => addStaffRow(data));
            const successMsg = generated 
                ? `Roster automatically generated for ${sortedRoster.length} employees.`
                : `Roster loaded successfully for ${sortedRoster.length} employees.`;
            showMessage(successMsg, false);
        }

    } catch (error) {
        console.error("Load/Generate Roster Error:", error);
        showMessage(`Error loading/generating roster: ${error.message}`, true);
    }
}
window.loadRoster = loadRoster;


async function saveRoster() {
    if (!currentWeekStartDate) return showMessage("Please select a Week Start Date before saving.", true);
    if (!window.getAuthStatus || !getAuthStatus()) return showMessage("Please log in to save the roster.", true);
    
    const rosterData = getRosterForSave();
    if (rosterData.length === 0) return showMessage("Add at least one staff member before saving.", true);

    const saveButton = document.getElementById('save-roster-btn');
    saveButton.disabled = true;
    showMessage("Saving roster...", false);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                weekStartDate: currentWeekStartDate,
                rosterData: rosterData
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to save roster.');
        }

        const result = await response.json();
        showMessage(`Roster saved successfully! Total entries: ${result.totalEntries}.`, false);

    } catch (error) {
        console.error("Save Roster Error:", error);
        showMessage(`Error saving roster: ${error.message}`, true);
    } finally {
        saveButton.disabled = false;
    }
}
window.saveRoster = saveRoster;

// --- STAFF PROFILE ADD/EDIT LOGIC ---

function showAddStaffModal() {
    document.getElementById('add-staff-modal').classList.remove('hidden');
    document.getElementById('add-staff-modal').classList.add('flex');
    document.getElementById('add-staff-form').reset();
}
window.showAddStaffModal = showAddStaffModal;

async function handleAddStaff(e) {
    e.preventDefault();
    if (!getAuthStatus()) return showMessage("Please log in to add staff.", true);
    
    const submitBtn = e.submitter;
    submitBtn.disabled = true;
    
    const staffData = {
        name: document.getElementById('new-staff-name').value,
        employeeId: document.getElementById('new-staff-id').value,
        position: document.getElementById('new-staff-position').value,
        shiftPreference: document.getElementById('new-staff-shift-preference').value,
        fixedDayOff: document.getElementById('new-staff-fixed-dayoff').value,
        nextWeekHolidayRequest: 'None', // Initialized to None
        isNightRotator: document.getElementById('new-staff-is-rotator').checked
    };
    
    showMessage("Saving new staff profile...", false);

    try {
        const response = await fetch(`${PROFILE_API_URL}/add`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(staffData)
        });

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || 'Failed to add staff.');
        }

        showMessage(`Staff member ${staffData.name} added. Please generate a new roster.`, false);
        document.getElementById('add-staff-modal').classList.add('hidden');
        document.getElementById('add-staff-modal').classList.remove('flex');
        
    } catch (error) {
        showMessage(`Error adding profile: ${error.message}`, true);
    } finally {
        submitBtn.disabled = false;
    }
}

// --- STAFF LIST MANAGEMENT LOGIC (Updated to remove field and add Delete button) ---

async function loadStaffProfiles() {
    const container = document.getElementById('staff-profiles-container');
    const msgBox = document.getElementById('staff-list-message');
    container.innerHTML = '<p class="text-gray-500 text-center py-4">Loading staff data...</p>';
    msgBox.classList.add('hidden');

    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    
    try {
        const response = await fetch(PROFILE_API_URL, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Failed to fetch profiles.');
        }

        if (result.data.length === 0) {
            container.innerHTML = '<p class="text-yellow-500 text-center py-4">No staff profiles found. Use the "+ Add Staff" button to begin.</p>';
            return;
        }
        
        // Cache profiles for use in roster logic
        staffProfilesCache = result.data;

        // Render the list as cards or table rows
        container.innerHTML = result.data.map(p => {
            // 4. Removed display of p.nextWeekHolidayRequest here
            return `
            <div class="flex justify-between items-center bg-gray-800 p-4 rounded-lg border-l-4 ${p.position === 'Supervisor' || p.position === 'Manager' ? 'border-red-500' : p.position === 'Delivery' ? 'border-blue-400' : 'border-nixtz-secondary'} shadow-md">
                <div>
                    <p class="font-bold text-white">${p.name} <span class="text-xs text-gray-400">(${p.employeeId})</span></p>
                    <p class="text-sm text-nixtz-primary uppercase">${p.position}</p>
                    <p class="text-xs text-gray-500">Fixed Off: ${p.fixedDayOff}</p>
                </div>
                <div class="flex space-x-2">
                    <button onclick="openSingleEditModal('${p._id}')" data-id="${p._id}" class="bg-nixtz-secondary hover:bg-[#0da070] text-white px-4 py-2 rounded-full text-sm font-bold transition">
                        Edit
                    </button>
                    <button onclick="confirmDeleteStaff('${p._id}', '${p.name}')" class="bg-red-600 hover:bg-red-500 text-white px-3 py-2 rounded-full text-sm font-bold transition" title="Delete Staff">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        `}).join('');
        if(window.lucide) window.lucide.createIcons();


    } catch (error) {
        msgBox.textContent = `Error: ${error.message}`;
        msgBox.classList.remove('hidden');
    }
}
window.loadStaffProfiles = loadStaffProfiles;

// --- NEW FUNCTION: DELETE STAFF PROFILE ---
function confirmDeleteStaff(profileId, name) {
    if (confirm(`WARNING: Are you sure you want to permanently delete the profile for ${name}?\n\nThis cannot be undone.`)) {
        deleteStaffProfile(profileId, name);
    }
}

async function deleteStaffProfile(profileId, name) {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    
    try {
        const response = await fetch(`${PROFILE_API_URL}/${profileId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.message || `Failed to delete profile for ${name}.`);
        }

        showMessage(`Profile for ${name} deleted successfully.`, false);
        openStaffListModal(); // Reload the list

    } catch (error) {
        showMessage(`Error deleting profile: ${error.message}`, true);
    }
}
window.confirmDeleteStaff = confirmDeleteStaff;


function openStaffListModal() {
    document.getElementById('staff-list-modal').classList.remove('hidden');
    document.getElementById('staff-list-modal').classList.add('flex');
    loadStaffProfiles();
}
window.openStaffListModal = openStaffListModal;


async function openSingleEditModal(profileId) {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    
    try {
        const response = await fetch(PROFILE_API_URL, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        
        if (!response.ok || !result.success) {
             throw new Error("Error fetching profile data.");
        }

        const staff = result.data.find(p => p._id === profileId);
        if (!staff) return showMessage("Profile not found.", true);

        currentStaffData = staff;

        // 2. Populate the edit form
        document.getElementById('edit-profile-id').value = staff._id;
        document.getElementById('single-staff-title').textContent = `Edit Profile: ${staff.name}`;
        document.getElementById('edit-staff-name').value = staff.name;
        document.getElementById('edit-staff-id').value = staff.employeeId;

        document.getElementById('edit-staff-position').value = staff.position;
        document.getElementById('edit-staff-shift-preference').value = staff.shiftPreference;
        document.getElementById('edit-staff-fixed-dayoff').value = staff.fixedDayOff;
        
        let holidayReqValue = staff.nextWeekHolidayRequest || 'None';
        // Display user-friendly version of the request
        if(holidayReqValue.includes(':')) {
            const parts = holidayReqValue.split(':');
            holidayReqValue = `${parts[1]} for ${parts[0]}`;
        }
        
        document.getElementById('edit-staff-holiday-request').value = holidayReqValue;
        
        document.getElementById('edit-staff-is-rotator').checked = staff.isNightRotator;

        // 3. Display the modal and hide the list modal
        document.getElementById('staff-list-modal').classList.add('hidden');
        document.getElementById('single-staff-modal').classList.remove('hidden');
        document.getElementById('single-staff-modal').classList.add('flex');
    } catch(error) {
        showMessage(`Error: ${error.message}`, true);
    }
}
window.openSingleEditModal = openSingleEditModal;


document.getElementById('edit-staff-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const profileId = document.getElementById('edit-profile-id').value;
    const submitBtn = e.submitter;
    submitBtn.disabled = true;

    const updatedData = {
        name: document.getElementById('edit-staff-name').value,
        employeeId: document.getElementById('edit-staff-id').value,
        position: document.getElementById('edit-staff-position').value,
        shiftPreference: document.getElementById('edit-staff-shift-preference').value,
        fixedDayOff: document.getElementById('edit-staff-fixed-dayoff').value,
        nextWeekHolidayRequest: currentStaffData.nextWeekHolidayRequest || 'None', // Retain existing request data
        isNightRotator: document.getElementById('edit-staff-is-rotator').checked,
        currentRotationDay: currentStaffData.currentRotationDay
    };

    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    
    try {
        const response = await fetch(`${PROFILE_API_URL}/${profileId}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedData)
        });

        const result = await response.json();
        
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Update failed.');
        }

        showMessage(`Profile for ${updatedData.name} updated.`, false);
        
        document.getElementById('single-staff-modal').classList.add('hidden');
        openStaffListModal();
        
    } catch (error) {
        showMessage(`Error updating profile: ${error.message}`, true);
    } finally {
        submitBtn.disabled = false;
    }
});

// --- NEW STAFF REQUEST LOGIC (UPDATED) ---

window.toggleRequestFields = function(type) {
    const holidayFields = document.getElementById('holiday-fields');
    const shiftChangeFields = document.getElementById('shift-change-fields');
    const noneClearMessage = document.getElementById('none-clear-message');
    
    // Hide all
    holidayFields.classList.add('hidden');
    shiftChangeFields.classList.add('hidden');
    noneClearMessage.classList.add('hidden');

    // Reset required attributes
    document.getElementById('request-week-start').required = false;
    document.getElementById('shift-change-week-start').required = false;

    // Show selected section
    if (type === 'holiday') {
        holidayFields.classList.remove('hidden');
        document.getElementById('request-week-start').required = true;
    } else if (type === 'shift_change') {
        shiftChangeFields.classList.remove('hidden');
        document.getElementById('shift-change-week-start').required = true;
    } else if (type === 'none_clear') {
        noneClearMessage.classList.remove('hidden');
    }
};


async function fetchStaffProfilesForDropdown() {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return;

    try {
        const response = await fetch(PROFILE_API_URL, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Failed to fetch profiles for dropdown.');
        }

        staffProfilesCache = result.data;
        const select = document.getElementById('request-staff-select');
        select.innerHTML = '<option value="">-- Select Staff --</option>';
        
        staffProfilesCache.sort((a, b) => a.name.localeCompare(b.name)).forEach(p => {
            const option = document.createElement('option');
            option.value = p._id;
            option.textContent = `${p.name} (${p.employeeId})`;
            select.appendChild(option);
        });

    } catch (error) {
        console.error("Fetch Staff for Dropdown Error:", error);
    }
}
window.fetchStaffProfilesForDropdown = fetchStaffProfilesForDropdown;


function openStaffRequestModal() {
    if (!window.getAuthStatus || !getAuthStatus()) {
        showMessage("Please log in to manage staff requests.", true);
        return;
    }
    
    // Set default week date
    const currentWeek = document.getElementById('week-start-date').value;
    document.getElementById('request-week-start').value = currentWeek;
    document.getElementById('shift-change-week-start').value = currentWeek;
    
    // Reset and show modal
    document.getElementById('staff-request-form').reset();
    toggleRequestFields('holiday');
    fetchStaffProfilesForDropdown();
    document.getElementById('staff-request-modal').classList.remove('hidden');
    document.getElementById('staff-request-modal').classList.add('flex');
}
window.openStaffRequestModal = openStaffRequestModal;


async function handleStaffRequest(e) {
    e.preventDefault();
    const profileId = document.getElementById('request-staff-select').value;
    if (!profileId) return showMessage("Please select a staff member.", true, 'request-message-box');
    
    const submitBtn = document.getElementById('submit-request-btn');
    submitBtn.disabled = true;

    const requestType = document.getElementById('request-type').value;
    const staff = staffProfilesCache.find(p => p._id === profileId);
    
    if (!staff) return showMessage("Staff profile not found in cache.", true, 'request-message-box');
    
    let messageText = '';
    let requestValue = 'None';
    let weekStart = '';
    
    if (requestType === 'holiday') {
        weekStart = document.getElementById('request-week-start').value;
        const dayOff = document.getElementById('request-holiday-day').value;
        requestValue = `${weekStart}:${dayOff}`;
        messageText = `Holiday/Leave request (${dayOff}) for week starting ${weekStart} submitted for ${staff.name}.`;
    } else if (requestType === 'shift_change') {
        weekStart = document.getElementById('shift-change-week-start').value;
        const newShift = document.getElementById('request-new-shift').value;
        requestValue = `${weekStart}:${newShift}`;
        messageText = `Temporary shift preference change to ${newShift} for week starting ${weekStart} submitted for ${staff.name}.`;
    } else if (requestType === 'none_clear') {
        requestValue = 'None';
        messageText = `All temporary requests for ${staff.name} have been cleared.`;
    }
    
    // Prepare the PUT body
    const apiUpdateBody = {
        name: staff.name,
        employeeId: staff.employeeId,
        position: staff.position,
        shiftPreference: staff.shiftPreference,
        fixedDayOff: staff.fixedDayOff,
        isNightRotator: staff.isNightRotator,
        currentRotationDay: staff.currentRotationDay,
        nextWeekHolidayRequest: requestValue
    };


    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    
    try {
        const response = await fetch(`${PROFILE_API_URL}/${profileId}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(apiUpdateBody)
        });

        const result = await response.json();
        
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Update failed.');
        }

        const reloadMessage = requestType === 'none_clear' 
            ? `${messageText} **Please reload the roster to see their standard default schedule.**`
            : `${messageText} **Please reload the roster to see changes for the week starting ${weekStart}.**`;
        
        showMessage(reloadMessage, false);
        
        // Update the staff cache after successful request
        const updatedStaffIndex = staffProfilesCache.findIndex(s => s._id === profileId);
        if (updatedStaffIndex !== -1) {
            staffProfilesCache[updatedStaffIndex].nextWeekHolidayRequest = requestValue;
        }

        document.getElementById('staff-request-modal').classList.add('hidden');
        
    } catch (error) {
        showMessage(`Error submitting request: ${error.message}`, true, 'request-message-box');
    } finally {
        submitBtn.disabled = false;
    }
}


// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    if (!window.getAuthStatus || !getAuthStatus()) {
        showMessage("You need to log in to access the Roster Management.", true);
        return;
    }

    document.getElementById('add-staff-form')?.addEventListener('submit', handleAddStaff);
    document.getElementById('staff-request-form')?.addEventListener('submit', handleStaffRequest);

    const today = new Date();
    // FIX: Ensure the calculated start date falls in the correct year
    const day = today.getDay();
    // Calculate difference: day - dayOfWeek (0=Sun, 1=Mon, ...) + (if Sun, -6) + 1 (to make it Monday)
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); 
    const monday = new Date(today.getFullYear(), today.getMonth(), diff);

    const isoString = monday.toISOString().split('T')[0];
    
    // Set the input field value using the calculated date, NOT the hardcoded year 2025
    document.getElementById('week-start-date').value = isoString;
    
    // Initial load will now call updateDateHeaders
    loadRoster(isoString);

    updateShiftSummaries();
    lucide.createIcons();
});