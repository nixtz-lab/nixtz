// Full Updated staff_roster (3).js with Duty Rotation, Leave History Saving, and Night Rotator Removal

/**
 * staff_roster.js
 * Custom logic for the 7-Eleven Staff Roster page.
 * NOTE: Relies on global variables and functions defined in script.js (e.g., API_BASE_URL, getAuthStatus, showMessage).
 */

const API_URL = `${window.API_BASE_URL}/api/staff/roster`;
const PROFILE_API_URL = `${window.API_BASE_URL}/api/staff/profile`;
const LEAVE_HISTORY_API_URL = `${window.API_BASE_URL}/api/staff/leave/history`; // New API URL for permanent logging

// --- CORE SHIFTS: FIXED & USED FOR QUOTAS/SUMMARIES ---
// These are the three main categories. We use a baseShiftId property to link sub-shifts back.
let CORE_SHIFTS = { 
    1: { name: 'Morning', time: '07:00-16:00', baseShiftId: 1, required: 4, roles: ['C1', 'C4', 'C3'] }, 
    2: { name: 'Afternoon', time: '13:30-22:30', baseShiftId: 2, required: 5, roles: ['C1', 'C5', 'C3'] },
    3: { name: 'Night', time: '22:00-07:00', baseShiftId: 3, required: 'N/A', roles: ['C1', 'C2'] },
};
// --- SUB SHIFTS: Configurable variations (M1, M2, A1, etc.) ---
// These are saved as an array of objects to allow truly dynamic additions.
let SUB_SHIFTS = []; 

// Merge function to use in places that need all shifts (dropdown, loading)
function getAllShifts() {
    const all = { ...CORE_SHIFTS };
    SUB_SHIFTS.forEach(sub => {
        // Use a high ID (1000+) or unique identifier string for sub-shifts 
        const uniqueId = sub.id; 
        all[uniqueId] = sub;
    });
    return all;
}


const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

let currentRosterData = []; 
let currentWeekStartDate = null;
let currentStaffData = {}; // Cache for single profile editing
let staffProfilesCache = []; // Global cache for profiles
let initialEditProfileData = ''; // To store original data for warning check
const AUTH_TOKEN_KEY = localStorage.getItem('nixtz_auth_token') ? 'nixtz_auth_token' : 'tmt_auth_token'; // Use the correct key

// --- SHIFT CONFIGURATION LOGIC ---

const SHIFT_CONFIG_KEY = 'nixtz_shift_config'; // Key for localStorage
const SUB_SHIFT_KEY = 'nixtz_sub_shifts';

function loadShiftConfig() {
    const savedCoreConfig = localStorage.getItem(SHIFT_CONFIG_KEY);
    const savedSubShifts = localStorage.getItem(SUB_SHIFT_KEY);
    
    let updated = false;

    if (savedCoreConfig) {
        try {
            const parsedConfig = JSON.parse(savedCoreConfig);
            for (const id in CORE_SHIFTS) {
                if (parsedConfig[id] && parsedConfig[id].name && parsedConfig[id].time) {
                    CORE_SHIFTS[id].name = parsedConfig[id].name;
                    CORE_SHIFTS[id].time = parsedConfig[id].time;
                    updated = true;
                }
            }
        } catch (e) {
            console.error("Failed to parse saved core shift configuration.", e);
        }
    }
    
    if (savedSubShifts) {
        try {
            SUB_SHIFTS = JSON.parse(savedSubShifts);
            updated = true;
        } catch (e) {
            console.error("Failed to parse saved sub shifts.", e);
        }
    }

    if (updated) {
        updateShiftDefinitionDisplay();
    } else {
        updateShiftDefinitionDisplay(); 
    }
    return updated;
}

function saveShiftConfigToLocal(newCoreConfig, newSubShifts) {
    // 1. Save Core Config
    const simplifiedCoreConfig = {};
    for (const id in newCoreConfig) {
        simplifiedCoreConfig[id] = { 
            name: newCoreConfig[id].name, 
            time: newCoreConfig[id].time,
            baseShiftId: newCoreConfig[id].baseShiftId 
        };
        CORE_SHIFTS[id].name = newCoreConfig[id].name;
        CORE_SHIFTS[id].time = newCoreConfig[id].time;
    }
    localStorage.setItem(SHIFT_CONFIG_KEY, JSON.stringify(simplifiedCoreConfig));
    
    // 2. Save Sub Shifts
    SUB_SHIFTS = newSubShifts;
    localStorage.setItem(SUB_SHIFT_KEY, JSON.stringify(newSubShifts));
    
    updateShiftDefinitionDisplay();
}


function updateShiftDefinitionDisplay() {
    const container = document.getElementById('shift-definitions-display');
    if (!container) return;

    let content = '';
    container.innerHTML = '';
    
    // 1. Display Core Shifts (Categories)
    for (const id in CORE_SHIFTS) {
        const shift = CORE_SHIFTS[id];
        const rolesText = shift.roles.join(', ');
        const requiredText = shift.required === 'N/A' ? 'Night Staff Rotation' : `${shift.required} Staff (${rolesText})`;
        
        content += `
            <div>
                <span class="font-semibold text-white">${shift.name} (${id}) [Category]:</span> ${shift.time}
                <div class="text-xs text-gray-500">Required: ${requiredText}</div>
            </div>
        `;
    }

    // 2. Display Configured Sub-Shifts
    if (SUB_SHIFTS.length > 0) {
        content += `<div class="md:col-span-3 border-t border-gray-600 pt-3">
                        <h4 class="font-bold text-nixtz-primary mb-1">Sub-Shift Variations:</h4>
                    </div>`;
        SUB_SHIFTS.forEach(sub => {
            const baseShift = CORE_SHIFTS[sub.baseShiftId];
            if (baseShift) {
                content += `
                    <div>
                        <span class="font-semibold text-gray-300">${sub.shiftName} (Sub ID ${sub.id}):</span> ${sub.timeRange}
                        <div class="text-xs text-gray-500">Links to: ${baseShift.name} (${baseShift.baseShiftId})</div>
                    </div>
                `;
            }
        });
    }
    
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
    
    // Reset form to ADD mode
    const form = document.getElementById('shift-config-form');
    form.reset();
    document.getElementById('edit-shift-id').value = 0; // Use '0' for ADD mode
    document.getElementById('shift-form-title').textContent = `Add New Sub-Shift Variation`;
    document.getElementById('submit-shift-config-btn').textContent = `Add Shift`;
    document.getElementById('config-shift-select').disabled = false;

    // Populate the dropdown with CORE shift IDs (1, 2, 3) for linking
    const select = document.getElementById('config-shift-select');
    select.innerHTML = '<option value="">-- Select Main Shift Category --</option>';
    
    Object.entries(CORE_SHIFTS).forEach(([id, shift]) => {
        const option = document.createElement('option');
        option.value = id;
        
        // --- FIX APPLIED HERE: Force display name to avoid M1/M2 corruption ---
        let display_name = shift.name;
        if (id === '1') { display_name = 'Morning'; }
        else if (id === '2') { display_name = 'Afternoon'; }
        else if (id === '3') { display_name = 'Night'; }
        
        option.textContent = `${display_name} (${id})`;
        // --- END FIX ---

        select.appendChild(option);
    });
    
    // Render the list of currently configured sub-shifts
    renderSubShiftEditList();
    
    document.getElementById('shift-config-modal').classList.remove('hidden');
    document.getElementById('shift-config-modal').classList.add('flex');
}
window.openShiftConfigModal = openShiftConfigModal;

// --- SUB-SHIFT LIST & EDIT LOGIC ---

/**
 * @function renderSubShiftEditList
 * Renders the list of configurable sub-shifts in the modal's list area.
 */
function renderSubShiftEditList() {
    const listContainer = document.getElementById('configured-shift-list');
    listContainer.innerHTML = '';
    
    if (SUB_SHIFTS.length === 0) {
        listContainer.innerHTML = '<p class="text-gray-500 text-center py-2">No custom sub-shifts configured.</p>';
        return;
    }

    SUB_SHIFTS.forEach(sub => {
        const baseShift = CORE_SHIFTS[sub.baseShiftId];
        const bgColor = sub.baseShiftId == 1 ? 'bg-indigo-600' : sub.baseShiftId == 2 ? 'bg-green-600' : 'bg-gray-600';
        
        listContainer.innerHTML += `
            <div class="flex justify-between items-center ${bgColor} p-3 rounded-lg shadow-md">
                <div class="flex-grow">
                    <p class="font-bold text-white">${sub.shiftName}</p>
                    <p class="text-xs text-gray-100">${sub.timeRange} <span class="ml-2 font-semibold">[Base: ${baseShift ? baseShift.name : 'Unknown'}]</span></p>
                </div>
                <button type="button" onclick="loadSubShiftToForm('${sub.id}')" class="bg-white/20 hover:bg-white/30 text-white font-semibold py-1 px-3 rounded text-xs transition">
                    Edit
                </button>
            </div>
        `;
    });
}
window.renderSubShiftEditList = renderSubShiftEditList;


/**
 * @function loadSubShiftToForm
 * Loads a selected sub-shift's configuration into the form for editing.
 */
window.loadSubShiftToForm = function(subShiftId) {
    const sub = SUB_SHIFTS.find(s => s.id === subShiftId);
    if (!sub) return;
    
    const form = document.getElementById('shift-config-form');

    // Set form mode to EDIT
    document.getElementById('edit-shift-id').value = sub.id; 
    document.getElementById('shift-form-title').textContent = `Edit Shift: ${sub.shiftName}`;
    document.getElementById('submit-shift-config-btn').textContent = `Update Shift`;
    
    // Populate form fields
    document.getElementById('config-shift-name').value = sub.shiftName;
    document.getElementById('config-shift-time').value = sub.timeRange;
    
    // Select the Base Shift (lock it for editing)
    const select = document.getElementById('config-shift-select');
    const baseShiftName = CORE_SHIFTS[sub.baseShiftId]?.name || 'N/A';
    
    // Use the actual CORE_SHIFT name in the option text
    select.innerHTML = `<option value="${sub.baseShiftId}">${baseShiftName} (${sub.baseShiftId})</option>`;
    select.value = sub.baseShiftId;
    select.disabled = true; 
}
window.loadSubShiftToForm = loadSubShiftToForm;


document.getElementById('shift-config-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submit-shift-config-btn');
    submitBtn.disabled = true;
    
    // Determine the ID to update, which must come from the dropdown now (Base Shift ID)
    const shiftIdToUpdate = parseInt(document.getElementById('config-shift-select').value);
    
    if (!shiftIdToUpdate || !CORE_SHIFTS[shiftIdToUpdate]) {
        showMessage("Please select a valid main shift category.", true, 'shift-config-message');
        submitBtn.disabled = false;
        return;
    }

    const shiftName = document.getElementById('config-shift-name').value;
    const shiftTime = document.getElementById('config-shift-time').value;

    // Validation
    if (!shiftName || !shiftTime) {
        showMessage("Shift name and time are required.", true, 'shift-config-message');
        submitBtn.disabled = false;
        return;
    }
    
    let newSubShifts = [...SUB_SHIFTS];
    const isEditing = document.getElementById('edit-shift-id').value !== '0';
    const subShiftId = document.getElementById('edit-shift-id').value;


    if (isEditing) {
        // --- EDIT EXISTING SUB-SHIFT ---
        const index = newSubShifts.findIndex(s => s.id === subShiftId);
        if (index !== -1) {
            newSubShifts[index].shiftName = shiftName;
            newSubShifts[index].timeRange = shiftTime;
        }
    } else {
        // --- ADD NEW SUB-SHIFT ---
        
        // Ensure sub-shift name is unique (simple check)
        if (newSubShifts.some(s => s.shiftName === shiftName)) {
            showMessage(`Shift name "${shiftName}" already exists.`, true, 'shift-config-message');
            submitBtn.disabled = false;
            return;
        }

        // Generate a simple unique ID (timestamp + random number)
        const newId = `sub_${Date.now()}_${Math.floor(Math.random() * 100)}`;

        newSubShifts.push({
            id: newId,
            baseShiftId: shiftIdToUpdate, // Link to selected base shift ID
            shiftName: shiftName,
            timeRange: shiftTime
        });
    }

    try {
        // Save the new list of sub-shifts and CORE shifts (CORE shifts are static in this UI, but necessary for structure)
        saveShiftConfigToLocal(CORE_SHIFTS, newSubShifts);
        showMessage(`Shift ${shiftName} saved successfully.`, false, 'shift-config-message');
        
        // Re-render list and reset form to ADD mode
        openShiftConfigModal(); 

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
                    // Save the specific Leave type (Holiday, Sick, Fixed, Auto, Requested)
                    shifts.push({ shiftId: null, jobRole: textContent, timeRange: 'Full Day' });
                } else if (textContent) {
                    const cellDisplay = shiftCell.innerHTML;
                    // The shift ID in the cell is now a unique identifier (1, 2, 3, or sub_timestamp)
                    const shiftMatch = cellDisplay.match(/^(\w+)\s+([A-Za-z0-9\s()]+)<span/);
                    const timeMatch = cellDisplay.match(/<span[^>]*>([^<]+)<\/span>/);
                    
                    if (shiftMatch) {
                        const shiftId = shiftMatch[1]; // Shift ID or unique sub-shift ID
                        const jobRole = shiftMatch[2].trim();
                        const timeRange = timeMatch ? timeMatch[1].trim() : 'N/A';
                        
                        // We save the unique Shift ID string (like "sub_12345") to the roster
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
    const allShifts = getAllShifts();
    const daysMap = {};
    
    DAYS.forEach(day => {
        // Initialize maps for the 3 CORE SHIFTS
        daysMap[day] = {};
        for(let i=1; i<=3; i++) { 
            daysMap[day][i] = { 
                actual: 0, 
                required: CORE_SHIFTS[i]?.required === 'N/A' ? 'N/A' : CORE_SHIFTS[i]?.required || 0,
                baseShiftId: i
            };
        }
    });

    DAYS.forEach(day => {
        document.querySelectorAll(`#roster-body [data-day="${day}"]`).forEach(cell => {
            const cellText = cell.textContent.trim();
            if (!cellText || cellText.includes('Leave')) return;

            // Extract the unique Shift ID (which might be "1" or "sub_12345")
            const shiftIdMatch = cellText.match(/^(\w+)/);
            if (shiftIdMatch) {
                const uniqueShiftId = shiftIdMatch[1];
                const shiftConfig = allShifts[uniqueShiftId];

                if (shiftConfig) {
                    const baseId = shiftConfig.baseShiftId;
                    if (daysMap[day][baseId] !== undefined) {
                        daysMap[day][baseId].actual++;
                    }
                }
            }
        });
    });

    DAYS.forEach(day => {
        const summaryCell = document.getElementById(`shift-summary-${day.toLowerCase()}`);
        if (!summaryCell) return;
        
        let content = '';
        
        Object.entries(daysMap[day]).forEach(([baseId, data]) => {
            const required = data.required === 'N/A' ? '' : data.required;
            
            if (required !== '' || data.actual > 0) {
                 const statusClass = (data.required !== 'N/A' && data.actual < data.required) ? 'text-red-400' : 'text-nixtz-secondary';
                 const baseShiftName = CORE_SHIFTS[baseId]?.name.charAt(0) || baseId; // Use first letter of name (M, A, N)
                 
                 content += `<div class="shift-summary">
                                <span class="text-gray-400 font-normal mr-1">${baseShiftName} (${required}):</span>
                                <span class="${statusClass}">${data.actual}</span>
                            </div>`;
            }
        });
        
        summaryCell.innerHTML = content;
    });
}


function createShiftDropdown(cell) {
    if (cell.querySelector('.shift-dropdown')) return;
    
    const existingText = cell.textContent.trim();
    // Match the Shift ID which can be a number or a string (e.g., 'sub_123')
    const shiftMatch = existingText.match(/^(\w+)\s+([A-Za-z0-9\s()]+)/);
    const initialShiftId = shiftMatch ? shiftMatch[1] : null;
    const initialJobRole = shiftMatch ? shiftMatch[2].trim() : null;

    const day = cell.dataset.day;
    const shiftDropdown = document.createElement('div');
    shiftDropdown.className = 'shift-dropdown';
    shiftDropdown.onclick = (e) => e.stopPropagation();

    // --- FIX: Separate Holiday and Sick Leave for Manual Assignment ---
    shiftDropdown.innerHTML += `
        <button class="dropdown-button bg-red-600 hover:bg-red-500" onclick="setShiftSelection(event, '${day}', null, 'Leave (Holiday)', 'Full Day')">HOLIDAY (휴가)</button>
        <button class="dropdown-button bg-yellow-600 hover:bg-yellow-500" onclick="setShiftSelection(event, '${day}', null, 'Leave (Sick)', 'Full Day')">SICK LEAVE (병가)</button>
    `;
    // --- END FIX ---


    const allShifts = getAllShifts();
    const shiftsByBaseId = {};
    
    for (const id in allShifts) {
        const shift = allShifts[id];
        const baseId = shift.baseShiftId;
        if (!shiftsByBaseId[baseId]) {
            shiftsByBaseId[baseId] = { name: CORE_SHIFTS[baseId].name, list: [] };
        }
        shiftsByBaseId[baseId].list.push({ id: id, ...shift });
    }

    Object.entries(shiftsByBaseId).sort(([idA], [idB]) => parseInt(idA) - parseInt(idB)).forEach(([baseId, group]) => {
        
        shiftDropdown.innerHTML += `<div class="text-xs text-gray-400 mt-2 border-t border-gray-600 pt-1 font-bold">${group.name} Shifts</div>`;

        group.list.forEach(shiftConfig => {
            const shiftId = shiftConfig.id;
            const shiftName = shiftConfig.name;

            shiftConfig.roles.forEach(role => {
                const fullRole = (role === 'C1' && baseId !== 3) ? `${role} (Sup/Mgr)` : role;
                const isSelected = (initialShiftId === shiftId && initialJobRole === fullRole);
                
                shiftDropdown.innerHTML += `
                    <button 
                        class="dropdown-button ${isSelected ? 'bg-nixtz-secondary' : ''}" 
                        onclick="setShiftSelection(event, '${day}', '${shiftId}', '${fullRole}', '${shiftConfig.time}')"
                    >
                        ${shiftName} (${shiftId}) ${fullRole.replace(` (${shiftConfig.baseShiftId})`, '')}
                    </button>
                `;
            });
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
    
    // --- START FIX: Update Leave Handling to apply correct colors/classes ---
    if (jobRole && jobRole.startsWith('Leave')) {
        cell.innerHTML = jobRole; // e.g., 'Leave (Holiday)' or 'Leave (Sick)'
        cell.classList.remove('bg-gray-700', 'bg-nixtz-card', 'bg-red-800', 'bg-yellow-800');
        
        // Use a different color based on the type of leave
        if (jobRole.includes('(Holiday)')) {
            cell.classList.add('bg-red-800', 'font-bold', 'text-white');
        } else if (jobRole.includes('(Sick)')) {
            cell.classList.add('bg-yellow-800', 'font-bold', 'text-white');
        } else {
             // Fallback for types like 'Leave (Fixed)' or 'Leave (Auto Off)' - these rely on shift.color from generator
             cell.classList.add('bg-nixtz-card', 'font-bold', 'text-gray-300');
        }

    } 
    // --- END FIX ---
    
    else {
        // shiftId is now a string (e.g., "1" or "sub_12345")
        cell.innerHTML = `${shiftId} ${jobRole}<span class="text-xs text-gray-500 block leading-none">${timeRange}</span>`; 
        cell.classList.remove('bg-red-800', 'bg-nixtz-card', 'font-bold', 'bg-yellow-800'); // Clean up all leave colors
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

    // --- START FIX: Extract Requested Day of the Week from profile cache ---
    let requestedDayOfWeek = null;
    let isRequestedWeek = false;
    const staffProfile = staffProfilesCache.find(s => s.employeeId === staffId);
    
    if (staffProfile && staffProfile.nextWeekHolidayRequest && staffProfile.nextWeekHolidayRequest !== 'None' && currentWeekStartDate) {
        const [requestWeek, requestValue] = staffProfile.nextWeekHolidayRequest.split(':');
        
        // Only consider the request if the week matches the currently viewed roster week
        if (requestWeek === currentWeekStartDate) {
            isRequestedWeek = true;
            if (DAYS.includes(requestValue) || requestValue === 'Sick Leave') {
                requestedDayOfWeek = requestValue;
            } else if (requestValue === 'Full Week') {
                requestedDayOfWeek = 'Full Week'; // Use a flag for Full Week
            }
        }
    }
    // --- END FIX ---


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
        
        const isScheduledByGenerator = daySchedule && daySchedule.shifts.length > 0;
        
        if (isScheduledByGenerator) {
            const shift = daySchedule.shifts[0];
            const shiftId = shift.shiftId; // This can be "1" or "sub_12345"
            const jobRole = shift.jobRole;
            let timeRange = shift.timeRange; 
            
            // --- FIX: Use local config if time is a placeholder ---
            if (timeRange && timeRange.startsWith('DYNAMIC_TIME_')) {
                const allShifts = getAllShifts();
                const realShiftConfig = allShifts[shiftId];
                if (realShiftConfig) {
                    timeRange = realShiftConfig.time;
                }
            }
            // --- END FIX ---
            
            if (jobRole && jobRole.includes('Leave')) {
                cellContent = jobRole;
                
                // Set color based on generator output (Requested, Week Off)
                if (jobRole.includes('(Holiday)') || jobRole.includes('(Requested)') || jobRole.includes('(Week Off)')) {
                    cellClasses = 'bg-red-800 font-bold';
                } else if (jobRole.includes('(Sick)')) {
                    cellClasses = 'bg-yellow-800 font-bold';
                } else {
                     // This covers 'Leave (Fixed)' and 'Leave (Auto Off)'
                    cellClasses = 'bg-nixtz-card font-bold text-gray-300';
                }

                // Add color handling for Fixed/Requested Leave (Retained for generator output)
                if (shift.color) { 
                    customColor = `style="background-color: ${shift.color}40; border-left: 4px solid ${shift.color};"`;
                    cellClasses = 'bg-nixtz-card font-bold text-gray-300'; 
                }

            } else if (shiftId && jobRole && timeRange) {
                cellContent = `${shiftId} ${jobRole}<span class="text-xs text-gray-500 block leading-none">${timeRange}</span>`;
                cellClasses = 'bg-gray-700';

                if (shift.color) {
                    customColor = `style="background-color: ${shift.color}40; border-left: 4px solid ${shift.color};"`;
                }
            }
        } 
        
        // --- FINAL CRITICAL FIX: If the generator left the cell empty, and a request is active, assign the leave label only if the day matches ---
        else if (!isScheduledByGenerator && isRequestedWeek) {
            
            const isSingleDayRequest = DAYS.includes(requestedDayOfWeek) && requestedDayOfWeek === day;
            const isFullWeekRequest = requestedDayOfWeek === 'Full Week';
            const isSickLeaveRequest = requestedDayOfWeek === 'Sick Leave';

            if (isFullWeekRequest || isSickLeaveRequest || isSingleDayRequest) {
                // If the generator left it empty, but the profile says there is a request here:
                
                let leaveLabel = `Leave (Requested)`;
                cellClasses = 'bg-red-800 font-bold';

                if (isSickLeaveRequest) {
                    leaveLabel = `Leave (Sick)`;
                    cellClasses = 'bg-yellow-800 font-bold';
                }

                cellContent = leaveLabel;
            }
            // If the cell is empty but the request doesn't apply to this day, it remains blank/bg-nixtz-card (correct for non-leave workdays).
        }
        // --- END FINAL CRITICAL FIX ---
        
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
        showMessage(`Roster for week ${currentWeekStartDate} saved successfully! Total entries: ${result.totalEntries}.`, false);

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
        // isNightRotator removed from input/data model
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
        // isNightRotator removed from data model
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
        
        // Removed: document.getElementById('edit-staff-is-rotator').checked = staff.isNightRotator;

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
        // isNightRotator and currentRotationDay removed from the update payload
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
    if (type === 'holiday' || type === 'sick_leave') {
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
    
    // Default to 'holiday' to show date fields
    document.getElementById('request-type').value = 'holiday'; 
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
            toggleRequestFields('shift_change');
        } 
        // Check for the explicit sick leave request string
        else if (requestValue === 'Sick Leave') {
             requestTypeInput.value = 'sick_leave';
             toggleRequestFields('sick_leave');
        }
        else if (['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Full Week'].includes(requestValue)) {
             requestTypeInput.value = 'holiday';
             toggleRequestFields('holiday');
        } else if (requestValue === 'None') {
             requestTypeInput.value = 'none_clear';
             toggleRequestFields('none_clear');
        }

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
    
    let leaveDateToLog = null; // New variable for historical logging
    let leaveTypeToLog = null; // New variable for historical logging

    if (requestType === 'holiday' || requestType === 'sick_leave') {
        const requestedDate = document.getElementById('request-single-date').value;
        if (!requestedDate) {
            submitBtn.disabled = false;
            return showMessage("Please select a date for the leave request.", true, 'request-message-box');
        }
        
        // 1. Calculate the Mon start date from the user's requested date
        weekStartIso = snapToMonday(requestedDate);
        leaveDateToLog = requestedDate; // Use the specific day for logging

        // 2. Determine the day of the week or type of leave requested
        let requestedDayOffOrType;
        if (requestType === 'sick_leave') {
            requestedDayOffOrType = 'Sick Leave';
            leaveTypeToLog = 'Sick Leave';
            messageText = `Sick Leave request for week starting ${weekStartIso} submitted for ${staff.name}.`;
        } else {
            const dateObj = new Date(requestedDate);
            const dayIndex = dateObj.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
            requestedDayOffOrType = DAYS[dayIndex === 0 ? 6 : dayIndex - 1]; // Convert 0 to Sun, 1 to Mon, etc.
            leaveTypeToLog = 'Holiday';
            messageText = `Holiday/Leave request (${requestedDayOffOrType}) for week starting ${weekStartIso} submitted for ${staff.name}.`;
        }
        
        // 3. Format the request value: [MONDAY_ISO]:[DAY_OF_WEEK_NAME or TYPE]
        requestValue = `${weekStartIso}:${requestedDayOffOrType}`;

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
    
    // Prepare the PUT body for StaffProfile update
    const apiUpdateBody = {
        name: staff.name,
        employeeId: staff.employeeId,
        position: staff.position,
        shiftPreference: staff.shiftPreference,
        fixedDayOff: staff.fixedDayOff,
        nextWeekHolidayRequest: requestValue
    };


    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    
    try {
        // --- STEP 1: Update the Staff Profile (The Override Flag) ---
        const profileResponse = await fetch(`${PROFILE_API_URL}/${profileId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(apiUpdateBody)
        });

        const profileResult = await profileResponse.json();
        
        if (!profileResponse.ok || !profileResult.success) {
            throw new Error(profileResult.message || 'Profile update failed.');
        }

        // --- STEP 2: Log Historical Leave (Only for Holiday/Sick Leave types) ---
        if (leaveTypeToLog && leaveDateToLog) {
            const historyResponse = await fetch(LEAVE_HISTORY_API_URL, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    employeeId: staff.employeeId,
                    employeeName: staff.name,
                    leaveDate: leaveDateToLog,
                    leaveType: leaveTypeToLog
                })
            });
            
            // NOTE: We don't throw an error if history save fails (to protect roster submission)
            if (!historyResponse.ok) {
                 console.warn("Failed to save leave history. Might be a duplicate or API error.");
            }
        }
        
        showMessage(messageText + ` **Please regenerate the roster for the week starting ${weekStartIso}.**`, false);
        
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
        
        // Determine the ID to update, which must come from the dropdown now (Base Shift ID)
        const shiftIdToUpdate = parseInt(document.getElementById('config-shift-select').value);
        
        if (!shiftIdToUpdate || !CORE_SHIFTS[shiftIdToUpdate]) {
            showMessage("Please select a valid main shift category.", true, 'shift-config-message');
            submitBtn.disabled = false;
            return;
        }

        const shiftName = document.getElementById('config-shift-name').value;
        const shiftTime = document.getElementById('config-shift-time').value;

        // Validation for required fields
        if (!shiftName || !shiftTime) {
            showMessage("Shift name and time are required.", true, 'shift-config-message');
            submitBtn.disabled = false;
            return;
        }
        
        // --- ADD/UPDATE SUB-SHIFT LOGIC ---
        
        let newSubShifts = [...SUB_SHIFTS];
        const isEditing = document.getElementById('edit-shift-id').value !== '0';
        const subShiftId = document.getElementById('edit-shift-id').value;


        if (isEditing) {
            // --- EDIT EXISTING SUB-SHIFT ---
            const index = newSubShifts.findIndex(s => s.id === subShiftId);
            if (index !== -1) {
                newSubShifts[index].shiftName = shiftName;
                newSubShifts[index].timeRange = shiftTime;
            }
        } else {
            // --- ADD NEW SUB-SHIFT ---
            
            // Ensure sub-shift name is unique (simple check)
            if (newSubShifts.some(s => s.shiftName === shiftName)) {
                showMessage(`Shift name "${shiftName}" already exists.`, true, 'shift-config-message');
                submitBtn.disabled = false;
                return;
            }

            // Generate a simple unique ID (timestamp + random number)
            const newId = `sub_${Date.now()}_${Math.floor(Math.random() * 100)}`;

            newSubShifts.push({
                id: newId,
                baseShiftId: shiftIdToUpdate, // Link to selected base shift ID
                shiftName: shiftName,
                timeRange: shiftTime
            });
        }

        try {
            // Save the new list of sub-shifts and CORE shifts (CORE shifts are static in this UI, but necessary for structure)
            saveShiftConfigToLocal(CORE_SHIFTS, newSubShifts);
            showMessage(`Shift ${shiftName} saved successfully.`, false, 'shift-config-message');
            
            // Re-render list and reset form to ADD mode
            openShiftConfigModal(); 

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