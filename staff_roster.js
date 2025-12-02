/**
 * staff_roster.js
 * Custom logic for the 7-Eleven Staff Roster page.
 * MODIFIED: Implements direct text input for manual roster editing and expanded request modal.
 */

const API_URL = `${window.API_BASE_URL}/api/staff/roster`;
const PROFILE_API_URL = `${window.API_BASE_URL}/api/staff/profile`;
const LEAVE_HISTORY_API_URL = `${window.API_BASE_URL}/api/staff/leave/history`; 

// --- CORE SHIFTS: REPLICATED FROM GENERATOR ---
// Note: These must match the backend for duty and required counts.
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
let staffProfilesCache = [];
const AUTH_TOKEN_KEY = localStorage.getItem('nixtz_auth_token') ? 'nixtz_auth_token' : 'tmt_auth_token'; 

// --- SHIFT CONFIGURATION LOGIC (Keep existing functions for display) ---

const SHIFT_CONFIG_KEY = 'nixtz_shift_config';
const SUB_SHIFT_KEY = 'nixtz_sub_shifts';

function loadShiftConfig() {
    // ... (Your existing loadShiftConfig logic)
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
    // ... (Your existing saveShiftConfigToLocal logic)
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
    
    SUB_SHIFTS = newSubShifts;
    localStorage.setItem(SUB_SHIFT_KEY, JSON.stringify(newSubShifts));
    
    updateShiftDefinitionDisplay();
}

function updateShiftDefinitionDisplay() {
    // ... (Your existing updateShiftDefinitionDisplay logic)
    const container = document.getElementById('shift-definitions-display');
    if (!container) return;

    let content = '';
    container.innerHTML = '';
    
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
// (Keep other supporting functions like openShiftConfigModal, renderSubShiftEditList, loadSubShiftToForm, etc.)


// --- CORE ROSTER UTILITIES ---

// (updateDateHeaders and sortRosterData remain the same)

/**
 * @function getRosterForSave
 * Reads the direct input fields for saving.
 */
function getRosterForSave() {
    const rows = document.querySelectorAll('#roster-body tr');
    const rosterData = [];

    rows.forEach(row => {
        const nameInput = row.querySelector('.staff-name-input');
        const idInput = row.querySelector('.staff-id-input');
        if (!nameInput || !idInput || !nameInput.value.trim()) return;
        
        const employeeId = idInput.value.trim();
        const cachedStaff = staffProfilesCache.find(s => s.employeeId === employeeId);
        
        const weeklySchedule = [];
        DAYS.forEach((day, dayIndex) => {
            // Read value directly from the input field
            const dutyInput = row.querySelector(`.duty-input[data-day-index="${dayIndex}"]`);
            const dutyText = dutyInput ? dutyInput.value.trim() : '';

            const shifts = [];
            
            if (dutyText) {
                // Simple parsing for the save structure
                let shiftId = null;
                let jobRole = dutyText;
                let timeRange = DAY_OFF_MARKER;
                
                if (dutyText !== DAY_OFF_MARKER) {
                    const parts = dutyText.split(' ');
                    if (parts.length >= 2 && !isNaN(parseInt(parts[0]))) {
                        shiftId = parts[0];
                        jobRole = parts.slice(1).join(' ');
                    }
                    // Attempt to map time range if a shift ID was found
                    if (shiftId && CORE_SHIFTS[shiftId]) {
                         timeRange = CORE_SHIFTS[shiftId].time;
                    }
                } else {
                    timeRange = DAY_OFF_MARKER;
                }

                shifts.push({ shiftId, jobRole, timeRange });
            }

            weeklySchedule.push({
                dayOfWeek: day,
                shifts: shifts
            });
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
// (updateShiftSummaries remains the same, adapted to read the duty-input value)


/**
 * @function addStaffRow - MODIFIED FOR INPUT FIELDS
 * Builds a new staff row with input fields for direct editing.
 */
function addStaffRow(initialData = {}) {
    const rosterBody = document.getElementById('roster-body');
    const newRow = document.createElement('tr');
    newRow.className = 'hover:bg-gray-800 transition duration-150 border-b border-gray-700';

    const staffName = initialData.employeeName || '';
    const staffId = initialData.employeeId || '';
    
    let rowHTML = `
        <td class="p-2 bg-gray-900 sticky left-0 z-10 border-r border-gray-700">
            <input type="text" value="${staffName}" placeholder="Staff Name" class="staff-name-input bg-transparent font-semibold w-full" data-key="name">
            <input type="text" value="${staffId}" placeholder="ID" class="staff-id-input bg-transparent text-xs text-gray-500 w-full mt-1" data-key="id">
        </td>
    `;

    DAYS.forEach((day, dayIndex) => {
        const daySchedule = initialData.weeklySchedule?.find(s => s.dayOfWeek === day);
        let initialDutyText = '';
        
        if (daySchedule && daySchedule.shifts.length > 0) {
            const shift = daySchedule.shifts[0];
            const shiftId = shift.shiftId; 
            const jobRole = shift.jobRole; 

            if (shiftId === null && (jobRole.includes('Day Off') || jobRole.includes('Leave') || jobRole === DAY_OFF_MARKER)) {
                // Display Day Off marker
                initialDutyText = DAY_OFF_MARKER; 
            } else if (shiftId !== null && jobRole) {
                // Display Shift ID and Role (e.g., "1 C1 (Mgr)")
                initialDutyText = `${shiftId} ${jobRole}`; 
            }
        }
        
        // --- NEW INPUT FIELD STRUCTURE ---
        rowHTML += `
            <td class="roster-cell p-2 border-r border-gray-700 bg-gray-700 hover:bg-gray-600 transition duration-150">
                <input type="text" 
                       value="${initialDutyText}" 
                       data-day-index="${dayIndex}"
                       data-employee-id="${staffId}"
                       oninput="updateShiftSummaries()"
                       placeholder="${day}"
                       class="duty-input w-full p-0 text-center bg-transparent border-none font-semibold text-white">
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
    
    // Create Lucide icons for the delete button
    if (window.lucide) window.lucide.createIcons();
}
window.addStaffRow = addStaffRow;

// --- STAFF REQUEST LOGIC (EXPANDED FOR DROPDOWNS) ---

/**
 * Populates the Shift ID dropdown with CORE shifts and the fixed Day Off option.
 */
function populateShiftIdDropdown(selectElement) {
    const allShifts = getAllShifts();
    selectElement.innerHTML = '<option value="">-- Select Shift/Status --</option>';
    
    // 1. Add the Fixed Day Off/Leave option (Shift ID = STATUS_LEAVE)
    const dayOffOption = document.createElement('option');
    dayOffOption.value = 'STATUS_LEAVE';
    dayOffOption.textContent = `${DAY_OFF_MARKER} / Leave (Full Day)`;
    selectElement.appendChild(dayOffOption);

    // 2. Add configured shifts (Shift ID 1, 2, 3 + sub-shifts)
    Object.entries(allShifts).forEach(([id, shift]) => {
        const option = document.createElement('option');
        option.value = id;
        const category = shift.baseShiftId ? `[Category ${shift.baseShiftId}]` : '';
        option.textContent = `Shift ${id}: ${shift.name} (${shift.time}) ${category}`;
        selectElement.appendChild(option);
    });
}

/**
 * Updates the Duty/Role dropdown and Time Range input based on the selected Shift ID.
 */
function updateShiftRoleDropdown() {
    const shiftId = document.getElementById('request-shift-id').value;
    const dutySelect = document.getElementById('request-duty-role');
    const timeInput = document.getElementById('request-time-range');
    dutySelect.innerHTML = '';
    
    // Handle Day Off/Leave Status
    if (shiftId === 'STATUS_LEAVE') {
        timeInput.value = 'Full Day';
        
        // Options for the Duty field when it's a Day Off/Leave
        dutySelect.innerHTML = `
            <option value="${DAY_OFF_MARKER}">${DAY_OFF_MARKER} (Day Off)</option>
            <option value="Leave (Holiday)">Holiday/Annual Leave</option>
            <option value="Sick Leave">Sick Leave</option>
        `;
        return;
    }
    
    // Handle specific working shift IDs
    const shiftConfig = getAllShifts()[shiftId];
    if (shiftConfig) {
        timeInput.value = shiftConfig.time;
        
        // Populate roles for this shift ID
        shiftConfig.roles.forEach(role => {
            const option = document.createElement('option');
            option.value = role; 
            option.textContent = role;
            dutySelect.appendChild(option);
        });
    } else {
        timeInput.value = '';
        dutySelect.innerHTML = '<option value="">-- Select Shift ID First --</option>';
    }
}
window.updateShiftRoleDropdown = updateShiftRoleDropdown;


window.toggleRequestFields = function(type) {
    const specificAssignmentFields = document.getElementById('specific-assignment-fields'); 
    const shiftPrefFields = document.getElementById('shift-pref-fields'); 
    const noneClearMessage = document.getElementById('none-clear-message');
    
    // Hide all
    specificAssignmentFields.classList.add('hidden');
    shiftPrefFields.classList.add('hidden');
    noneClearMessage.classList.add('hidden');

    // Reset required attributes
    document.getElementById('request-date').required = false;
    document.getElementById('request-shift-id').required = false;
    document.getElementById('shift-change-week-start').required = false;
    document.getElementById('request-new-shift').required = false;
    
    
    if (type === 'specific_day_duty') { 
        specificAssignmentFields.classList.remove('hidden');
        document.getElementById('request-date').required = true;
        document.getElementById('request-shift-id').required = true;
        
        // Initialize dynamic dropdowns
        populateShiftIdDropdown(document.getElementById('request-shift-id'));
        updateShiftRoleDropdown();

    } else if (type === 'weekly_shift_pref') {
        shiftPrefFields.classList.remove('hidden');
        document.getElementById('shift-change-week-start').required = true;
        document.getElementById('request-new-shift').required = true;
    } else if (type === 'none_clear') {
        noneClearMessage.classList.remove('hidden');
    }
};

// --- API Calls (loadRoster, saveRoster, etc. remain the same) ---
// (Due to length constraints, including only the essential modified parts)
// --- Final DOMContentLoaded setup (remains the same) ---