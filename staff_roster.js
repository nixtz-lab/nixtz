// staff_roster.js

// ... (All existing constants like API_URL, CORE_SHIFTS, DAYS, DAY_OFF_MARKER remain the same)

// --- NEW/UPDATED FUNCTIONS FOR DYNAMIC DROPDOWNS ---

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
        option.textContent = `Shift ${id}: ${shift.name} ${category}`;
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
            // We use the Shift ID + Role in the value for easy processing later
            option.value = role; 
            option.textContent = role;
            dutySelect.appendChild(option);
        });
    } else {
        timeInput.value = '';
        dutySelect.innerHTML = '<option value="">-- Select Shift ID First --</option>';
    }
}
window.updateShiftRoleDropdown = updateShiftRoleDropdown; // Make callable from HTML


// --- UPDATED TOGGLE FIELDS ---

window.toggleRequestFields = function(type) {
    const specificAssignmentFields = document.getElementById('specific-assignment-fields'); // NEW
    const shiftPrefFields = document.getElementById('shift-pref-fields'); 
    const noneClearMessage = document.getElementById('none-clear-message');
    
    // Hide all
    specificAssignmentFields.classList.add('hidden');
    shiftPrefFields.classList.add('hidden');
    noneClearMessage.classList.add('hidden');

    // Reset required attributes
    document.getElementById('request-date').required = false; // NEW
    document.getElementById('request-shift-id').required = false; // NEW
    document.getElementById('shift-change-week-start').required = false;
    document.getElementById('request-new-shift').required = false;


    // Show selected section
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


// --- UPDATED HANDLE STAFF REQUEST (To process new inputs) ---

async function handleStaffRequest(e) {
    e.preventDefault();
    const profileId = document.getElementById('request-staff-select').value;
    if (!profileId) return showMessage("Please select a staff member.", true, 'request-message-box');
    
    const submitBtn = document.getElementById('submit-request-btn');
    submitBtn.disabled = true;

    const requestType = document.getElementById('request-type').value;
    const staff = staffProfilesCache.find(p => p._id === profileId);
    
    // ... (Existing checks for staff existence)
    
    let messageText = '';
    let requestValue = 'None';
    let weekStartIso = '';
    
    let leaveDateToLog = null; 
    let leaveTypeToLog = null; 
    
    // --- NEW LOGIC FOR SPECIFIC ASSIGNMENT ---
    if (requestType === 'specific_day_duty') {
        const requestedDate = document.getElementById('request-date').value;
        const shiftId = document.getElementById('request-shift-id').value;
        const dutyRole = document.getElementById('request-duty-role').value; // e.g., 'C4' or 'หยุด'
        
        if (!requestedDate) {
             submitBtn.disabled = false;
             return showMessage("Please select a date for the assignment.", true, 'request-message-box');
        }
        
        // 1. Calculate the Mon start date
        weekStartIso = snapToMonday(requestedDate);

        // 2. Determine the day of the week requested
        const dateObj = new Date(requestedDate);
        const dayIndex = dateObj.getDay(); 
        const requestedDay = DAYS[dayIndex === 0 ? 6 : dayIndex - 1]; 
        
        // 3. Format the request value: [MONDAY_ISO]:[DAY_OF_WEEK_NAME]:[SHIFT_ID]:[DUTY_ROLE]
        // Example: 2025-12-01:Mon:1:C4
        // Example Day Off: 2025-12-01:Sun:STATUS_LEAVE:หยุด
        requestValue = `${weekStartIso}:${requestedDay}:${shiftId}:${dutyRole}`;
        
        messageText = `Specific duty (${dutyRole}) assigned for ${requestedDay} for ${staff.name}.`;

        // Log Leave history if applicable
        if (shiftId === 'STATUS_LEAVE') {
            leaveDateToLog = requestedDate;
            leaveTypeToLog = dutyRole.includes('Sick') ? 'Sick Leave' : 'Holiday';
        }

    } 
    // --- EXISTING LOGIC FOR WEEKLY SHIFT PREF ---
    else if (requestType === 'weekly_shift_pref') {
        const requestedDate = document.getElementById('shift-change-week-start').value;
        const newShift = document.getElementById('request-new-shift').value;
        if (!requestedDate) {
            submitBtn.disabled = false;
            return showMessage("Please select a date for the shift change.", true, 'request-message-box');
        }

        weekStartIso = snapToMonday(requestedDate);
        
        // Format the request value: [MONDAY_ISO]:[SHIFT_NAME]
        requestValue = `${weekStartIso}:${newShift}`;
        messageText = `Temporary shift preference change to ${newShift} for week starting ${weekStartIso} submitted for ${staff.name}.`;
    } 
    // --- EXISTING LOGIC FOR NONE/CLEAR ---
    else if (requestType === 'none_clear') {
        requestValue = 'None';
        messageText = `All temporary requests for ${staff.name} have been cleared.`;
    }
    
    // Prepare the PUT body for StaffProfile update (The generator will read this requestValue)
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
        // ... (API call remains the same)
        const profileResponse = await fetch(`${PROFILE_API_URL}/${profileId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(apiUpdateBody)
        });

        const profileResult = await profileResponse.json();
        
        if (!profileResponse.ok || !profileResult.success) {
            throw new Error(profileResult.message || 'Profile update failed.');
        }

        // --- STEP 2: Log Historical Leave ---
        // ... (API call remains the same)
        if (leaveTypeToLog && leaveDateToLog) {
            // ... (log history API call)
        }
        
        showMessage(messageText + ` **Please regenerate the roster.**`, false);
        
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
window.handleStaffRequest = handleStaffRequest; // Ensure function is callable

// ... (openStaffRequestModal, fetchStaffProfilesForDropdown, snapToMonday, handleDateChange, and initial DOMContentLoaded setup need to be kept/adapted)