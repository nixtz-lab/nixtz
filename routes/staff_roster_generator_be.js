// staff_roster_generator_be.js

/**
 * REWRITTEN CORE DEFINITIONS for Stability and Template Matching
 */
const SHIFTS = { 
    // Shift ID 1: Morning (Example: 07:00-16:00)
    1: { name: 'Morning', time: '07:00-16:00', roles: ['C1', 'C4', 'C3'], required: 6 }, 
    // Shift ID 2: Afternoon (Example: 13:30-22:30)
    2: { name: 'Afternoon', time: '13:30-22:30', roles: ['C1', 'C5', 'C3'], required: 5 }, 
    // Shift ID 3: Night (Example: 22:00-07:00)
    3: { name: 'Night', time: '22:00-07:00', roles: ['C2', 'C1'], required: 3 }
};

const ROLE_COLORS = {
    'Manager': '#FF0000',      
    'Supervisor': '#FF0000',   
    'Delivery': '#00B0F0',     
    'Normal Staff': '#FFFFFF'  
};

const DAYS_FULL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const VALID_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_OFF_MARKER = 'หยุด'; // Thai word for rest/day off

function generateWeeklyRoster(staffProfiles, weekStartDate) {
    
    // 1. Time Definitions
    const MORNING_TIME = SHIFTS[1].time; 
    const AFTERNOON_TIME = SHIFTS[2].time; 
    const NIGHT_TIME = SHIFTS[3].time; 
    const weekStartString = weekStartDate.toISOString().split('T')[0]; 

    // 2. Initialization
    const weeklyRosterMap = new Map(staffProfiles.map(s => [s.employeeId, { ...s, weeklySchedule: new Array(7).fill({ shifts: [] }) }]));
    
    const isScheduled = (employeeId, dayIndex) => weeklyRosterMap.get(employeeId)?.weeklySchedule[dayIndex]?.shifts?.length > 0;

    /**
     * Helper to get requests, handling the new specific assignment format.
     */
    function getWeeklyRequest(profile) {
        if (!profile.nextWeekHolidayRequest || profile.nextWeekHolidayRequest === 'None') return { type: 'None' };
        const parts = profile.nextWeekHolidayRequest.split(':');
        
        // This validation is CRITICAL to ensure only requests for the current week are honored
        if (parts.length < 2 || parts[0] !== weekStartString) return { type: 'None' };
        
        // 1. Weekly Shift Preference Override (Old format: ISO:ShiftName)
        if (parts.length === 2 && ['Morning', 'Afternoon', 'Night'].includes(parts[1])) {
             return { type: 'ShiftChange', shift: parts[1] };
        } 
        
        // 2. Specific Day Assignment (New format: ISO:DayName:ShiftId:DutyRole)
        if (parts.length === 4) {
            const [reqWeek, reqDay, reqShiftId, reqDutyRole] = parts;
            return { 
                type: 'SpecificAssignment', 
                day: reqDay, 
                shiftId: reqShiftId, 
                dutyRole: reqDutyRole 
            };
        }

        // 3. Old Leave Format (ISO:DayName or ISO:Sick Leave)
        if (parts.length === 2) {
             const val = parts[1];
             if (VALID_DAYS.includes(val) || val === 'Sick Leave' || val === 'Full Week') {
                return { type: 'Leave', day: val };
             }
        }
        
        return { type: 'None' }
    }
    
    // Filter staff
    let manager = staffProfiles.find(s => s.position === 'Manager');
    let supervisors = staffProfiles.filter(s => s.position === 'Supervisor').sort((a, b) => a.shiftPreference.localeCompare(b.shiftPreference));
    let deliveryDrivers = staffProfiles.filter(s => s.position === 'Delivery');
    let allNormalStaff = staffProfiles.filter(s => s.position !== 'Manager' && s.position !== 'Supervisor' && s.position !== 'Delivery');
    
    // 3. Main Loop: Day by Day
    DAYS_FULL.forEach((day, dayIndex) => {

        // --- Trackers for THIS DAY ---
        let countM = 0; 
        let countA = 0; 
        let countN = 0; 
        
        let rolesAssigned = { M: {C1:0, C4:0, C3:0}, A: {C1:0, C5:0, C3:0}, N: {C2:0, C1:0} };

        // --- Step 0: PRIORITY LEAVE, FIXED DAY OFF, AND SPECIFIC DAY ASSIGNMENT ---
        staffProfiles.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            const request = getWeeklyRequest(staff);
            
            let assignment = null;
            let color = ROLE_COLORS[staff.position] || '#FFF';

            // 0a. Specific Day/Duty Assignment Override (Highest Priority)
            if (request.type === 'SpecificAssignment' && request.day === day) {
                const shiftConfig = SHIFTS[request.shiftId] || {}; // Simplified
                
                if (request.shiftId === 'STATUS_LEAVE') { // It's a Day Off/Leave
                     assignment = { 
                        shiftId: null, 
                        jobRole: request.dutyRole, // e.g., 'หยุด' or 'Sick Leave'
                        timeRange: DAY_OFF_MARKER,
                        color: (request.dutyRole === 'Sick Leave' || request.dutyRole === 'Leave (Holiday)') ? '#B91C1C' : color
                     };
                } else if (shiftConfig) {
                    assignment = { 
                        shiftId: request.shiftId, 
                        jobRole: request.dutyRole, 
                        timeRange: shiftConfig.time,
                        color: color // Use staff color for working shift
                    };
                }
            }
            
            // 0b. Requested Leave Override (If not overridden by Specific Assignment)
            if (!assignment && request.type === 'Leave') {
                const isReqDay = request.day === day || request.day === 'Sick Leave' || request.day === 'Full Week';
                if (isReqDay) {
                    assignment = { 
                        shiftId: null, 
                        jobRole: DAY_OFF_MARKER, 
                        timeRange: DAY_OFF_MARKER,
                        color: '#B91C1C'
                    };
                }
            }
            
            // 0c. FIXED DAY OFF ASSIGNMENT (Only if not already assigned)
            if (!assignment) {
                const fixedDay = staff.fixedDayOff || 'None'; 
                const isFixedDaySet = fixedDay !== 'None' && VALID_DAYS.includes(fixedDay);
                
                // CRITICAL FIX: Ensure the assignment ONLY happens for the matching day
                if (isFixedDaySet && fixedDay === day) { 
                    assignment = { 
                        shiftId: null, 
                        jobRole: 'Day Off (Fixed)', // Changed marker for clarity in this step
                        timeRange: DAY_OFF_MARKER,
                        color: color
                    };
                }
            }
            
            // Apply assignment if determined
            if (assignment) {
                staffEntry.weeklySchedule[dayIndex].shifts = [assignment];
            }
        });


        // --- Step A: Priority Assignments (Mgr, Sup, Del) ---
        
        // 1. Manager (Pae, C1)
        if (manager && !isScheduled(manager.employeeId, dayIndex)) { 
            const request = getWeeklyRequest(manager);
            const pref = (request.type === 'ShiftChange') ? request.shift : 'Morning';
            let sId, t, jobRole;
            
            if (pref === 'Night') { sId = 3; t = NIGHT_TIME; countN++; jobRole = 'C1 (Mgr)'; } 
            else if (pref === 'Afternoon') { sId = 2; t = AFTERNOON_TIME; countA++; jobRole = 'C1 (Mgr)'; }
            else { sId = 1; t = MORNING_TIME; countM++; jobRole = 'C1 (Mgr)'; }
            
            weeklyRosterMap.get(manager.employeeId).weeklySchedule[dayIndex].shifts.push({ 
                shiftId: sId, 
                jobRole: jobRole, 
                timeRange: t, 
                color: ROLE_COLORS['Manager'] 
            });
        } 
        
        // 2. Supervisors (C1)
        supervisors.forEach(sup => {
            if (isScheduled(sup.employeeId, dayIndex)) { return; }
            
            const request = getWeeklyRequest(sup);
            const pref = (request.type === 'ShiftChange') ? request.shift : sup.shiftPreference;
            
            let sId, t, jobRole = 'C1 (Sup)';
            if (pref === 'Afternoon') { sId = 2; t = AFTERNOON_TIME; countA++; }
            else if (pref === 'Night') { sId = 3; t = NIGHT_TIME; countN++; } 
            else { sId = 1; t = MORNING_TIME; countM++; } 
            
            weeklyRosterMap.get(sup.employeeId).weeklySchedule[dayIndex].shifts.push({ shiftId: sId, jobRole: jobRole, timeRange: t, color: ROLE_COLORS['Supervisor'] });
        });

        // 3. Delivery Drivers (C3)
        deliveryDrivers.forEach(driver => {
            if (isScheduled(driver.employeeId, dayIndex)) { return; }

            const request = getWeeklyRequest(driver);
            const pref = (request.type === 'ShiftChange') ? request.shift : driver.shiftPreference; 
            
            let sId, t;
            if (pref.includes('Morning')) { sId = 1; t = MORNING_TIME; countM++; rolesAssigned.M.C3++; }
            else { sId = 2; t = AFTERNOON_TIME; countA++; rolesAssigned.A.C3++; }
            
            const jobRole = 'C3 (Del)'; 
            
            weeklyRosterMap.get(driver.employeeId).weeklySchedule[dayIndex].shifts.push({ shiftId: sId, jobRole: jobRole, timeRange: t, color: ROLE_COLORS['Delivery'] });
        });


        // --- Step B: Normal Staff Assignment (Fill-in C2, C4, C5 roles) ---
        
        let totalMorningStaff = countM;
        let totalAfternoonStaff = countA;
        
        const requiredMorning = SHIFTS[1].required; 
        const requiredAfternoon = SHIFTS[2].required; 
        const requiredNight = SHIFTS[3].required; 

        // Filter staff who are not yet scheduled
        let availableStaff = allNormalStaff.filter(s => !isScheduled(s.employeeId, dayIndex));
        availableStaff.sort((a, b) => a.employeeId.localeCompare(b.employeeId));

        // 1. Assign Night Staff (C2)
        availableStaff.forEach(staff => {
            if (countN >= requiredNight || isScheduled(staff.employeeId, dayIndex)) return;

            const request = getWeeklyRequest(staff);
            const pref = (request.type === 'ShiftChange') ? request.shift : staff.shiftPreference;
            
            if (pref === 'Night') { 
                weeklyRosterMap.get(staff.employeeId).weeklySchedule[dayIndex].shifts.push({ 
                    shiftId: 3, 
                    jobRole: 'C2', 
                    timeRange: NIGHT_TIME 
                });
                countN++;
            }
        });
        
        // Update remaining available staff after night assignment
        let remainingDayStaff = availableStaff.filter(s => !isScheduled(s.employeeId, dayIndex));

        // 2. Morning/Afternoon Fill-in (C4, C5)
        remainingDayStaff.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            const request = getWeeklyRequest(staff);
            const pref = (request.type === 'ShiftChange') ? request.shift : staff.shiftPreference;
            
            let assigned = false;

            // --- A. Morning Assignment (C4) ---
            if ((pref === 'Morning' || totalMorningStaff < totalAfternoonStaff) && totalMorningStaff < requiredMorning) {
                weeklyRosterMap.get(staff.employeeId).weeklySchedule[dayIndex].shifts.push({ 
                    shiftId: 1, 
                    jobRole: 'C4', 
                    timeRange: MORNING_TIME 
                });
                totalMorningStaff++;
                assigned = true;
            }
            
            // --- B. Afternoon Assignment (C5) ---
            if (!assigned && totalAfternoonStaff < requiredAfternoon) {
                weeklyRosterMap.get(staff.employeeId).weeklySchedule[dayIndex].shifts.push({ 
                    shiftId: 2, 
                    jobRole: 'C5', 
                    timeRange: AFTERNOON_TIME 
                });
                totalAfternoonStaff++;
                assigned = true;
            } 
            
            // --- C. Auto Off ---
            if (!assigned) {
                 staffEntry.weeklySchedule[dayIndex].shifts = [{ shiftId: null, jobRole: DAY_OFF_MARKER, timeRange: DAY_OFF_MARKER }];
            }
        });

    }); // End Day Loop

    // Final Format
    return Array.from(weeklyRosterMap.values()).map(staff => ({
        employeeName: staff.name,
        employeeId: staff.employeeId,
        position: staff.position,
        weeklySchedule: staff.weeklySchedule.map((ds, i) => ({ dayOfWeek: DAYS_FULL[i], shifts: ds.shifts || [] }))
    }));
}

module.exports = { generateWeeklyRoster };