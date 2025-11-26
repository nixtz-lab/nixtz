/**
 * staff_roster.js
 * Custom logic for the 7-Eleven Staff Roster page.
 * NOTE: Relies on global variables and functions defined in script.js (e.g., API_BASE_URL, getAuthStatus, showMessage).
 */

const API_URL = `${window.API_BASE_URL}/api/staff/roster`;
const PROFILE_API_URL = `${window.API_BASE_URL}/api/staff/profile`;

// CRITICAL CHANGE: Added Shift ID 4, 5, and 6 slots
let SHIFTS = { 
    // ID 1: Standard Morning Shift
    1: { name: 'Morning', time: '07:00-16:00', required: 4, roles: ['C1', 'C4', 'C3'] }, 
    // ID 2: Afternoon Shift
    2: { name: 'Afternoon', time: '13:30-22:30', required: 5, roles: ['C1', 'C5', 'C3'] },
    // ID 3: Night Shift
    3: { name: 'Night', time: '22:00-07:00', required: 'N/A', roles: ['C1', 'C2'] },
    // ID 4: Early Morning (User-defined time)
    4: { name: 'Early Morning', time: '06:00-15:00', required: 2, roles: ['C4', 'C5'] },
    // --- OPTIONAL SHIFTS (Slots 5 & 6) ---
    5: { name: 'Optional Shift A', time: '00:00-00:00', required: 0, roles: ['C4'] },
    6: { name: 'Optional Shift B', time: '00:00-00:00', required: 0, roles: ['C5'] }
};
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

let currentRosterData = []; 
let currentWeekStartDate = null;
let currentStaffData = {}; // Cache for single profile editing
let staffProfilesCache = []; // Global cache for profiles
let initialEditProfileData = ''; // To store original data for warning check
const AUTH_TOKEN_KEY = localStorage.getItem('nixtz_auth_token') ? 'nixtz_auth_token' : 'tmt_auth_token'; // Use the correct key

// --- SHIFT CONFIGURATION LOGIC ---

const SHIFT_CONFIG_KEY = 'nixtz_shift_config'; // Key for localStorage

function loadShiftConfig() {
    const savedConfig = localStorage.getItem(SHIFT_CONFIG_KEY);
    if (savedConfig) {
        try {
            const parsedConfig = JSON.parse(savedConfig);
            // Only update the properties we expect to be dynamic
            for (const id in SHIFTS) {
                if (parsedConfig[id] && parsedConfig[id].name && parsedConfig[id].time) {
                    SHIFTS[id].name = parsedConfig[id].name;
                    SHIFTS[id].time = parsedConfig[id].time;
                }
            }
            updateShiftDefinitionDisplay();
            return true;
        } catch (e) {
            console.error("Failed to parse saved shift configuration.", e);
        }
    }
    updateShiftDefinitionDisplay(); // Display default if none saved
    return false;
}

function saveShiftConfigToLocal(newConfig) {
    // Only save the mutable parts (name and time)
    const simplifiedConfig = {};
    for (const id in newConfig) {
        simplifiedConfig[id] = { name: newConfig[id].name, time: newConfig[id].time };
    }
    
    // Update the global mutable SHIFTS object
    for (const id in SHIFTS) {
        SHIFTS[id].name = newConfig[id].name;
        SHIFTS[id].time = newConfig[id].time;
    }
    
    localStorage.setItem(SHIFT_CONFIG_KEY, JSON.stringify(simplifiedConfig));
    updateShiftDefinitionDisplay();
}


function updateShiftDefinitionDisplay() {
    const container = document.getElementById('shift-definitions-display');
    if (!container) return;

    let content = '';
    
    // Clear the container
    container.innerHTML = '';
    
    // Display the updated shift details
    for (const id in SHIFTS) {
        const shift = SHIFTS[id];
        // Ensure requirements are displayed correctly (C1-C5 is just illustrative text)
        const rolesText = shift.roles.join(', ');
        const requiredText = shift.required === 'N/A' ? 'Night Staff Rotation' : `${shift.required} Staff (${rolesText})`;
        
        content += `
            <div>
                <span class="font-semibold text-white">${shift.name} (${id}):</span> ${shift.time}
                <div class="text-xs text-gray-500">Required: ${requiredText}</div>
            </div>
        `;
    }
    
    // Note: The general p tag outside the grid handles the job roles description
    container.innerHTML = content;
}

/**
 * @function openShiftConfigModal
 * Displays the modal showing all shift configurations and the '+' button.
 */
function openShiftConfigModal() {
    if (!window.getAuthStatus || !getAuthStatus()) {
        showMessage("Please log in to edit shift configuration.", true);
        return;
    }
    
    const container = document.getElementById('shift-inputs-container');
    container.innerHTML = '';
    
    let firstHiddenShiftId = null;

    // Generate inputs for each shift
    for (const id in SHIFTS) {
        const shift = SHIFTS[id];
        const shiftId = parseInt(id);
        const shiftDiv = document.createElement('div');
        shiftDiv.className = 'p-3 bg-gray-800 rounded-lg border border-gray-700';
        
        // Handle optional slots (ID 5 and above)
        if (shiftId >= 5) {
             shiftDiv.classList.add('optional-shift-slot');
             
             // Check if this slot has a non-default name/time (i.e., it was configured)
             const isConfigured = shift.time !== '00:00-00:00' || shift.name !== 'Optional Shift A' && shift.name !== 'Optional Shift B';

             if (!isConfigured) {
                shiftDiv.style.display = 'none';
                if (!firstHiddenShiftId) firstHiddenShiftId = shiftId;
             }
        }

        shiftDiv.innerHTML = `
            <label class="block text-sm font-medium text-gray-400 mb-1">Shift ${shiftId} Configuration</label>
            <input type="text" id="shift-name-${shiftId}" value="${shift.name}" placeholder="Shift Name (e.g., Morning)" required 
                   class="w-full p-2 rounded-lg bg-gray-900 border border-gray-600 text-white focus:border-nixtz-primary mb-2 text-sm">
            <input type="text" id="shift-time-${shiftId}" value="${shift.time}" placeholder="Time Range (e.g., 07:00-16:00)" required 
                   class="w-full p-2 rounded-lg bg-gray-900 border border-gray-600 text-white focus:border-nixtz-primary text-sm">
        `;
        container.appendChild(shiftDiv);
    }
    
    // Determine the next starting ID for the '+' button
    const nextStartingShiftId = firstHiddenShiftId || 5; 
    
    // Check if there are any hidden slots left to add
    const hasHiddenSlots = document.querySelectorAll('#shift-inputs-container .optional-shift-slot[style*="display: none"]').length > 0;

    // Add the "+" button logic only if there are hidden slots
    if (hasHiddenSlots) {
        container.innerHTML += `
            <button type="button" onclick="toggleOptionalShift(this, ${nextStartingShiftId})" id="add-shift-btn" 
                    class="w-full p-3 bg-nixtz-primary text-white rounded-lg font-bold shadow-lg hover:bg-[#3f3bbf] transition duration-300">
                <i data-lucide="plus" class="w-5 h-5 mr-1 inline"></i> Add Optional Shift Slot
            </button>
        `;
    }

    document.getElementById('shift-config-modal').classList.remove('hidden');
    document.getElementById('shift-config-modal').classList.add('flex');
    window.lucide.createIcons();
}
window.openShiftConfigModal = openShiftConfigModal;

/**
 * @function toggleOptionalShift
 * Reveals the next hidden optional shift slot and updates the button.
 */
window.toggleOptionalShift = function(button, targetShiftId) {
    const container = document.getElementById('shift-inputs-container');
    const allShiftIds = Object.keys(SHIFTS).map(Number).filter(id => id >= 5);
    
    // 1. Find the target slot (Shift ID container)
    let targetSlot = null;
    
    // Iterate through all shift inputs to find the correct DOM element by its ID
    container.querySelectorAll('.p-3.bg-gray-800.rounded-lg').forEach((slot) => {
        const inputId = slot.querySelector(`input[id^="shift-name-"]`)?.id;
        const currentId = inputId ? parseInt(inputId.split('-').pop()) : null;
        
        if (currentId === targetShiftId) {
            targetSlot = slot;
        }
    });

    if (!targetSlot) return; 

    // 2. Show the target slot
    targetSlot.style.display = 'block';

    // 3. Determine the next hidden slot ID
    let nextHiddenShiftId = null;
    for (const id of allShiftIds) {
        if (id > targetShiftId) {
            const nextSlotDom = container.querySelector(`input#shift-name-${id}`)?.closest('.optional-shift-slot');
            
            if (nextSlotDom && nextSlotDom.style.display === 'none') {
                nextHiddenShiftId = id;
                break;
            }
        }
    }

    // 4. Update the button for the next action
    if (nextHiddenShiftId) {
        button.setAttribute('onclick', `toggleOptionalShift(this, ${nextHiddenShiftId})`);
        button.innerHTML = `<i data-lucide="plus" class="w-5 h-5 mr-1 inline"></i> Add Optional Shift Slot ${nextHiddenShiftId}`;
        button.classList.replace('bg-red-600', 'bg-nixtz-primary'); 
    } else {
        // If no more hidden slots exist
        button.style.display = 'none';
    }
    
    window.lucide.createIcons();
}


document.getElementById('shift-config-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submit-shift-config-btn');
    submitBtn.disabled = true;
    
    const newConfig = {};
    let isValid = true;
    
    for (const id in SHIFTS) {
        const nameInput = document.getElementById(`shift-name-${id}`);
        const timeInput = document.getElementById(`shift-time-${id}`);
        
        if (!nameInput.value || !timeInput.value) {
            isValid = false;
            break;
        }
        
        newConfig[id] = { 
            name: nameInput.value, 
            time: timeInput.value,
            required: SHIFTS[id].required,
            roles: SHIFTS[id].roles 
        };
    }
    
    if (!isValid) {
        showMessage("Shift name and time are required for all shifts.", true, 'shift-config-message');
        submitBtn.disabled = false;
        return;
    }
    
    try {
        saveShiftConfigToLocal(newConfig);
        showMessage("Shift configuration saved successfully. Regenerate roster to apply changes!", false, 'shift-config-message');
        setTimeout(() => {
            document.getElementById('shift-config-modal').classList.add('hidden');
        }, 1500);

    } catch (error) {
        showMessage(`Error saving config: ${error.message}`, true, 'shift-config-message');
    } finally {
        submitBtn.disabled = false;
    }
});


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
        // Secondary sort by Employee ID for stable sorting if positions are the same
        return a.employeeId.localeCompare(b.employeeId);
    });
}


function getRosterForSave() {
    const rows = document.querySelectorAll('#roster-body tr');
    const rosterData = [];

    rows.forEach(row => {
        const nameInput = row.querySelector('.staff-name-input');
        const idInput = row.querySelector('.staff-id-input');
        if (!nameInput || !idInput || !nameInput.value.trim()) return;
        
        // ***CRITICAL: Look up by employeeId***
        const employeeId = idInput.value.trim();
        const cachedStaff = staffProfilesCache.find(s => s.employeeId === employeeId);
        
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
                    
                    const timeRangeFromConfig = SHIFTS[shiftMatch ? parseInt(shiftMatch[1]) : 1]?.time || 'N/A';

                    if (shiftMatch) {
                        const shiftId = parseInt(shiftMatch[1]);
                        const jobRole = shiftMatch[2].trim();
                        // Use time match from cell or fallback to dynamic config
                        const timeRange = timeMatch ? timeMatch[1].trim() : timeRangeFromConfig; 
                        
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
        daysMap[day] = { 1: { actual: 0, required: SHIFTS[1].required }, 2: { actual: 0, required: SHIFTS[2].required }, 3: { actual: 0, required: SHIFTS[3].required }, 4: { actual: 0, required: SHIFTS[4]?.required || 0 }, 5: { actual: 0, required: SHIFTS[5]?.required || 0 }, 6: { actual: 0, required: SHIFTS[6]?.required || 0 } };
    });

    DAYS.forEach(day => {
        document.querySelectorAll(`#roster-body [data-day="${day}"]`).forEach(cell => {
            const cellText = cell.textContent.trim();
            if (!cellText || cellText.includes('Leave')) return;

            const shiftIdMatch = cellText.match(/^(\d+)/);
            if (shiftIdMatch) {
                const shiftId = parseInt(shiftIdMatch[1]);
                if (shiftId && daysMap[day][shiftId] !== undefined) {
                    daysMap[day][shiftId].actual++;
                }
            }
        });
    });

    DAYS.forEach(day => {
        const summaryCell = document.getElementById(`shift-summary-${day.toLowerCase()}`);
        if (!summaryCell) return;
        
        let content = '';
        // Only iterate through configured shifts (1-4) or those with non-zero requirements
        for (const shiftId in daysMap[day]) {
            const data = daysMap[day][shiftId];
            const required = data.required === 'N/A' ? '' : data.required;
            
            // Skip non-configured optional shifts if actual count is 0
            if (parseInt(shiftId) > 4 && data.actual === 0 && required === 0) continue;
            
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

    for (const id in SHIFTS) {
        const shiftId = parseInt(id);
        const shiftConfig = SHIFTS[id];
        // Skip optional/unconfigured shifts unless they have staff assigned
        if (!shiftConfig || (shiftId > 4 && shiftConfig.required === 0 && shiftConfig.time === '00:00-00:00')) continue; 

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
    }


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
        // Use the passed timeRange from the dynamic SHIFTS object
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
            let timeRange = shift.timeRange; // Time range is read directly from roster data
            
            // --- FIX: Use SHIFTS cache if time is a placeholder ---
            if (timeRange.startsWith('DYNAMIC_TIME_')) {
                // If the shiftId is defined, use the real time from the live SHIFTS config
                const realShiftConfig = SHIFTS[shiftId];
                if (realShiftConfig) {
                    timeRange = realShiftConfig.time;
                }
            }
            // --- END FIX ---
            
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

/**
 * @function forceRosterRegeneration
 * Forces the generation of a new roster for the current week, ignoring any existing saved snapshot.
 */
async function forceRosterRegeneration() {
    if (!currentWeekStartDate) return showMessage("Please select a Week Start Date.", true);
    if (!window.getAuthStatus || !getAuthStatus()) return showMessage("Please log in to generate the roster.", true);

    const isoDate = new Date(currentWeekStartDate).toISOString().split('T')[0];
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    
    const confirmRegen = confirm(`Are you sure you want to regenerate the roster for ${isoDate}?\n\nThis will overwrite the currently saved schedule with a newly calculated one based on current staff profiles.`);
    
    if (!confirmRegen) return;

    showMessage(`Forcing regeneration for week starting ${isoDate}...`, false);
    
    try {
        await fetchStaffProfilesForDropdown(); // Ensure profile cache is fresh
        
        // Call the generate route which also saves the generated roster to the DB
        const response = await fetch(`${API_URL}/generate/${isoDate}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to generate roster data.');
        }
        
        const result = await response.json();
        const rosterData = result.data;
        
        document.getElementById('roster-body').innerHTML = '';
        currentRosterData = rosterData;
        
        const rosterWithPositions = rosterData.map(r => {
            // ***CRITICAL: Look up profile by employeeId***
            const profile = staffProfilesCache.find(s => s.employeeId === r.employeeId);
            return {
                ...r,
                position: profile ? profile.position : 'Normal Staff'
            };
        });

        const sortedRoster = sortRosterData(rosterWithPositions); // 3. Apply new sorting
        
        if (sortedRoster.length === 0) {
            showMessage('Roster regenerated, but no active staff profiles were found.', true);
        } else {
            sortedRoster.forEach(data => addStaffRow(data));
            showMessage(`Roster successfully regenerated for ${sortedRoster.length} employees. Click 'Save Roster' to make this permanent!`, false);
        }

    } catch (error) {
        console.error("Force Regeneration Error:", error);
        showMessage(`Error regenerating roster: ${error.message}`, true);
    }
}
window.forceRosterRegeneration = forceRosterRegeneration;


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
        // --- STEP 1: Load dynamic config and profiles ---
        loadShiftConfig();
        await fetchStaffProfilesForDropdown(); 
        
        // --- STEP 2: Attempt to Load Existing Roster ---
        let response = await fetch(`${API_URL}/${isoDate}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        
        let result = await response.json();
        let rosterData = result.data;
        let generated = false;

        // --- STEP 3: If no roster found, attempt to GENERATE it ---
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
        
        // --- STEP 4: Render the Roster with new sorting ---
        
        document.getElementById('roster-body').innerHTML = '';
        currentRosterData = rosterData;
        currentWeekStartDate = startDateString;
        
        // Augment roster data with position from cache for sorting
        const rosterWithPositions = rosterData.map(r => {
            // ***CRITICAL: Look up profile by employeeId***
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

// --- STAFF LIST MANAGEMENT LOGIC (Updated) ---

/**
 * @function openStaffListModal (FIXED: Missing function)
 * Handles the display logic for the staff list modal.
 */
function openStaffListModal() {
    if (!window.getAuthStatus || !getAuthStatus()) {
        showMessage("Please log in to view the staff list.", true);
        return;
    }
    
    loadStaffProfiles(); 

    document.getElementById('staff-list-modal').classList.remove('hidden');
    document.getElementById('staff-list-modal').classList.add('flex');
}
window.openStaffListModal = openStaffListModal;


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
            // Removed display of p.nextWeekHolidayRequest
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
    // Note: window.confirm is used here as per guidelines
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
            // Attempt to read JSON error message if provided
            try {
                const result = await response.json();
                throw new Error(result.message || `Failed to delete profile for ${name}.`);
            } catch (jsonError) {
                // Handle case where response is not JSON (e.g., HTML error page from middleware)
                throw new Error(`Failed to delete profile due to server or authorization error. Status: ${response.status}`);
            }
        }

        showMessage(`Profile for ${name} deleted successfully.`, false);
        openStaffListModal(); // Reload the list

    } catch (error) {
        showMessage(`Error deleting profile: ${error.message}`, true);
    }
}
window.confirmDeleteStaff = confirmDeleteStaff;


function closeEditProfileModal(event) {
    // Prevent default form submission or navigation if the button is inside a form
    event.preventDefault(); 
    
    const modal = document.getElementById('single-staff-modal');
    const currentData = getEditProfileData();
    
    if (JSON.stringify(currentData) !== initialEditProfileData) {
        const confirmDiscard = confirm("You have unsaved changes. Are you sure you want to close and discard changes?");
        if (!confirmDiscard) {
            return; // Stay in the modal
        }
    }
    
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}
window.closeEditProfileModal = closeEditProfileModal;


// Helper to extract current form data for comparison
function getEditProfileData() {
    return {
        name: document.getElementById('edit-staff-name').value,
        position: document.getElementById('edit-staff-position').value,
        shiftPreference: document.getElementById('edit-staff-shift-preference').value,
        fixedDayOff: document.getElementById('edit-staff-fixed-dayoff').value,
        isNightRotator: document.getElementById('edit-staff-is-rotator').checked,
    };
}


async function openSingleEditModal(profileId) {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    
    try {
        // --- FIXED: Use the efficient single GET route ---
        const response = await fetch(`${PROFILE_API_URL}/${profileId}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        
        if (!response.ok || !result.success || !result.data) {
             throw new Error("Error fetching profile data.");
        }

        const staff = result.data; // Use the single profile object directly
        currentStaffData = staff;

        // 2. Populate the edit form
        document.getElementById('edit-profile-id').value = staff._id;
        document.getElementById('single-staff-title').textContent = `Edit Profile: ${staff.name}`;
        document.getElementById('edit-staff-name').value = staff.name;
        document.getElementById('edit-staff-id').value = staff.employeeId;

        document.getElementById('edit-staff-position').value = staff.position;
        document.getElementById('edit-staff-shift-preference').value = staff.shiftPreference;
        document.getElementById('edit-staff-fixed-dayoff').value = staff.fixedDayOff;
        
        // CRITICAL: Removed population logic for the deleted Next Week Holiday Request field
        
        document.getElementById('edit-staff-is-rotator').checked = staff.isNightRotator;

        // Store current state for comparison
        initialEditProfileData = JSON.stringify(getEditProfileData());

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
    document.getElementById('request-single-date').required = false;
    document.getElementById('shift-change-week-start').required = false;
    document.getElementById('request-new-shift').required = false;


    // Show selected section
    if (type === 'holiday') {
        holidayFields.classList.remove('hidden');
        document.getElementById('request-single-date').required = true;
    } else if (type === 'shift_change') {
        shiftChangeFields.classList.remove('hidden');
        document.getElementById('shift-change-week-start').required = true;
        document.getElementById('request-new-shift').required = true;
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
        msgBox.textContent = `Error: ${error.message}`;
        msgBox.classList.remove('hidden');
    }
}
window.fetchStaffProfilesForDropdown = fetchStaffProfilesForDropdown;


function openStaffRequestModal() {
    if (!window.getAuthStatus || !getAuthStatus()) {
        showMessage("Please log in to manage staff requests.", true);
        return;
    }
    
    // Get the currently loaded roster date for pre-filling
    const currentRosterWeek = document.getElementById('week-start-date').value;
    
    // Reset and show modal
    document.getElementById('staff-request-form').reset();
    
    // Pre-fill date fields with the CURRENTLY VIEWED WEEK's start date
    document.getElementById('request-single-date').value = currentRosterWeek; 
    document.getElementById('shift-change-week-start').value = currentRosterWeek; 
    
    toggleRequestFields('holiday');
    fetchStaffProfilesForDropdown();
    
    const staffSelect = document.getElementById('request-staff-select');
    
    // CRITICAL FIX: Add listener to update modal fields based on selected staff's existing request
    staffSelect.onchange = function() {
        const profileId = this.value;
        if (!profileId) return;

        const staff = staffProfilesCache.find(p => p._id === profileId);
        if (!staff || staff.nextWeekHolidayRequest === 'None') {
            // Reset to current roster week if no existing request
            document.getElementById('request-single-date').value = currentRosterWeek; 
            document.getElementById('shift-change-week-start').value = currentRosterWeek;
            document.getElementById('request-type').value = 'holiday'; 
            toggleRequestFields('holiday');
            return;
        }

        const [requestWeek, requestValue] = staff.nextWeekHolidayRequest.split(':');
        
        // If an existing request is found, pre-fill the date with the saved week
        document.getElementById('request-single-date').value = requestWeek;
        document.getElementById('shift-change-week-start').value = requestWeek;

        // Try to determine request type from saved value
        const requestTypeInput = document.getElementById('request-type');
        if (['Morning', 'Afternoon', 'Night'].includes(requestValue)) {
            requestTypeInput.value = 'shift_change';
            document.getElementById('request-new-shift').value = requestValue;
        } else if (['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Full Week', 'None'].includes(requestValue)) {
             requestTypeInput.value = 'holiday';
        }

        toggleRequestFields(requestTypeInput.value);
        showMessage(`Existing request (${requestValue}) for week ${requestWeek} loaded.`, false);
    };

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
    let weekStartIso = '';
    
    if (requestType === 'holiday') {
        const requestedDate = document.getElementById('request-single-date').value;
        if (!requestedDate) {
            submitBtn.disabled = false;
            return showMessage("Please select a date for the holiday request.", true, 'request-message-box');
        }
        
        // 1. Calculate the Mon start date from the user's requested date
        weekStartIso = snapToMonday(requestedDate);
        
        // 2. Determine the day of the week requested
        const dateObj = new Date(requestedDate);
        const dayIndex = dateObj.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        const requestedDayOff = DAYS[dayIndex === 0 ? 6 : dayIndex - 1]; // Convert 0 to Sun, 1 to Mon, etc.
        
        // 3. Format the request value: [MONDAY_ISO]:[DAY_OF_WEEK_NAME]
        requestValue = `${weekStartIso}:${requestedDayOff}`;
        messageText = `Holiday/Leave request (${requestedDayOff}) for week starting ${weekStartIso} submitted for ${staff.name}.`;

    } else if (requestType === 'shift_change') {
        const requestedDate = document.getElementById('shift-change-week-start').value;
        const newShift = document.getElementById('request-new-shift').value;
        if (!requestedDate) {
            submitBtn.disabled = false;
            return showMessage("Please select a date for the shift change.", true, 'request-message-box');
        }

        // Calculate the Mon start date from the user's requested date
        weekStartIso = snapToMonday(requestedDate);
        
        // Format the request value: [MONDAY_ISO]:[SHIFT_NAME]
        requestValue = `${weekStartIso}:${newShift}`;
        messageText = `Temporary shift preference change to ${newShift} for week starting ${weekStartIso} submitted for ${staff.name}.`;
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
            : `${messageText} **Please reload the roster to see changes for the week starting ${weekStartIso}.**`;
        
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


/**
 * @function snapToMonday
 * Converts any given date string (YYYY-MM-DD) to the ISO string of the Monday of that week.
 */
function snapToMonday(dateString) {
    const date = new Date(dateString);
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday
    
    // Calculate the difference in days to reach Monday
    // If it's Mon (1), diff = 0. If Tue (2), diff = -1. If Sun (0), diff = -6.
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; 
    
    // Use setDate to automatically handle month/year rollovers
    date.setDate(date.getDate() + diff);
    
    // Format back to YYYY-MM-DD string
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}


/**
 * @function handleDateChange
 * Intercepts the date input change, snaps to Monday, updates the input field, and loads the roster.
 */
window.handleDateChange = function(inputElement) {
    if (!inputElement.value) return;
    
    const snappedDate = snapToMonday(inputElement.value);
    
    // Update the input field with the corrected Monday date
    if (inputElement.value !== snappedDate) {
        inputElement.value = snappedDate;
        showMessage(`Date corrected to Monday, starting week ${snappedDate}.`, false);
    }
    
    loadRoster(snappedDate);
};


// --- INITIALIZATION (Date Fixes Applied) ---
document.addEventListener('DOMContentLoaded', () => {
    if (!window.getAuthStatus || !getAuthStatus()) {
        showMessage("You need to log in to access the Roster Management.", true);
        return;
    }
    
    // Load dynamic shift configuration before anything else
    loadShiftConfig(); 

    document.getElementById('add-staff-form')?.addEventListener('submit', handleAddStaff);
    
    // Event listener for the Shift Config Form submit is included here.
    document.getElementById('shift-config-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const submitBtn = document.getElementById('submit-shift-config-btn');
        submitBtn.disabled = true;
        
        const newConfig = {};
        let isValid = true;
        
        for (const id in SHIFTS) {
            const nameInput = document.getElementById(`shift-name-${id}`);
            const timeInput = document.getElementById(`shift-time-${id}`);
            
            if (!nameInput.value || !timeInput.value) {
                isValid = false;
                break;
            }
            
            newConfig[id] = { 
                name: nameInput.value, 
                time: timeInput.value,
                required: SHIFTS[id].required,
                roles: SHIFTS[id].roles 
            };
        }
        
        if (!isValid) {
            showMessage("Shift name and time are required for all shifts.", true, 'shift-config-message');
            submitBtn.disabled = false;
            return;
        }
        
        try {
            saveShiftConfigToLocal(newConfig);
            showMessage("Shift configuration saved successfully. Regenerate roster to apply changes!", false, 'shift-config-message');
            setTimeout(() => {
                document.getElementById('shift-config-modal').classList.add('hidden');
            }, 1500);

        } catch (error) {
            showMessage(`Error saving config: ${error.message}`, true, 'shift-config-message');
        } finally {
            submitBtn.disabled = false;
        }

    });
    
    document.getElementById('staff-request-form')?.addEventListener('submit', handleStaffRequest);

    const today = new Date();
    
    // Calculate the Monday of the current perceived week correctly
    const dayOfWeek = today.getDay(); 
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); 
    const monday = new Date(today.getFullYear(), today.getMonth(), diff);

    // Format to YYYY-MM-DD string for the input field
    const year = monday.getFullYear();
    const month = (monday.getMonth() + 1).toString().padStart(2, '0');
    const date = monday.getDate().toString().padStart(2, '0');
    const isoString = `${year}-${month}-${date}`;
    
    // Set the input field value using the calculated date
    const dateInput = document.getElementById('week-start-date');
    if (dateInput) {
        dateInput.value = isoString;
        // The onchange handler is set via HTML now, but ensuring the value is set here is correct.
    }
    
    loadRoster(isoString);

    updateShiftSummaries();
    lucide.createIcons();
});