// staff_roster_generator_be.js

/**
 * GENERATOR CONFIGURATION
 * Defines the shift structure and quotas.
 */
const SHIFTS = { 
    1: { name: 'Morning', time: 'DYNAMIC_TIME_1', roles: ['C1', 'C4', 'C3'], required: 6 }, 
    2: { name: 'Afternoon', time: 'DYNAMIC_TIME_2', roles: ['C1', 'C5', 'C3'], required: 5 }, 
    3: { name: 'Night', time: 'DYNAMIC_TIME_3', roles: ['C1', 'C2'], required: 3 } // Total 3: 1 Sup + 2 Normal
};

const ROLE_COLORS = {
    'Manager': '#FF0000',      
    'Supervisor': '#FF0000',   
    'Delivery': '#00B0F0',     
    'Normal Staff': '#FFFFFF'  
};

const DAYS_FULL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Roles available for rotation
const DAY_SHIFT_ROLES = ['C4', 'C5', 'C3'];
const NIGHT_SHIFT_ROLES = ['C2', 'C1']; 

/**
 * Helper: Calculate next rotational duty based on history (kept for structure integrity)
 */
function getNextDuty(staff, dayIndex, shiftId, weeklyRosterMap) {
    const isNightShift = shiftId === 3;
    const availableRoles = isNightShift ? NIGHT_SHIFT_ROLES : DAY_SHIFT_ROLES;
    const employeeId = staff.employeeId;
    
    let suggestedRole = isNightShift ? 'C2' : 'C4'; 

    if (dayIndex > 0) {
        const prevDayEntry = weeklyRosterMap.get(employeeId).weeklySchedule[dayIndex - 1];
        
        if (prevDayEntry.shifts.length > 0 && !prevDayEntry.shifts[0].jobRole.includes('Leave') && !prevDayEntry.shifts[0].jobRole.includes('Day Off')) {
            const prevShift = prevDayEntry.shifts[0];
            const prevRole = prevShift.jobRole.split(' ')[0].trim();

            if (prevShift.shiftId === shiftId && availableRoles.includes(prevRole)) {
                if (isNightShift) {
                    const dayBefore = (dayIndex > 1) ? weeklyRosterMap.get(employeeId).weeklySchedule[dayIndex - 2] : null;
                    const sameAsDayBefore = dayBefore && dayBefore.shifts.length > 0 && dayBefore.shifts[0].jobRole.startsWith(prevRole);
                    
                    if (sameAsDayBefore) {
                        const idx = availableRoles.indexOf(prevRole);
                        suggestedRole = availableRoles[(idx + 1) % availableRoles.length];
                    } else {
                        suggestedRole = prevRole;
                    }
                } 
                else {
                    const idx = availableRoles.indexOf(prevRole);
                    suggestedRole = availableRoles[(idx + 1) % availableRoles.length];
                }
            }
        }
    }
    return suggestedRole;
}


function generateWeeklyRoster(staffProfiles, weekStartDate) {
    
    // 1. Time Definitions (placeholders)
    const MORNING_TIME = '07:00-16:00'; // DYNAMIC_TIME_1
    const AFTERNOON_TIME = '13:30-22:30'; // DYNAMIC_TIME_2
    const NIGHT_TIME = '22:00-07:00'; // DYNAMIC_TIME_3
    const weekStartString = weekStartDate.toISOString().split('T')[0]; 

    // 2. Initialize Roster Map
    const weeklyRosterMap = new Map(staffProfiles.map(s => [s.employeeId, { ...s, weeklySchedule: new Array(7).fill({ shifts: [] }) }]));
    
    // Helper to check if scheduled (uses employee ID string)
    const isScheduled = (employeeId, dayIndex) => weeklyRosterMap.get(employeeId).weeklySchedule[dayIndex].shifts.length > 0;

    // 3. Helper to get requests (no change)
    function getWeeklyRequest(profile) {
        if (!profile.nextWeekHolidayRequest || profile.nextWeekHolidayRequest === 'None') return { type: 'None' };
        const parts = profile.nextWeekHolidayRequest.split(':');
        if (parts.length !== 2 || parts[0] < weekStartString) return { type: 'None' };
        if (parts[0] === weekStartString) {
            const val = parts[1];
            if (['Morning', 'Afternoon', 'Night'].includes(val)) return { type: 'ShiftChange', shift: val };
            return { type: 'Leave', day: val };
        }
        return { type: 'None' };
    }
    
    // Filter staff into specific functional groups based on the profiles
    let manager = staffProfiles.find(s => s.position === 'Manager');
    let supervisors = staffProfiles.filter(s => s.position === 'Supervisor').sort((a, b) => a.shiftPreference.localeCompare(b.shiftPreference));
    let deliveryDrivers = staffProfiles.filter(s => s.position === 'Delivery').sort((a, b) => a.fixedDayOff.localeCompare(b.fixedDayOff));
    let allNormalStaff = staffProfiles.filter(s => s.position === 'Normal Staff');
    let nightStaffPool = allNormalStaff.filter(s => s.isNightRotator);
    let coveragePool = allNormalStaff.filter(s => !s.isNightRotator);


    // 4. Main Loop: Day by Day
    DAYS_FULL.forEach((day, dayIndex) => {

        // --- Trackers for THIS DAY ---
        let countM = 0; // Morning Count (Including Mgr, Sup, Del)
        let countA = 0; // Afternoon Count (Including Sup, Del)
        let countN_Normal = 0; // Night Count (Normal Staff Only)
        
        let rolesUsed = { M: {C3:0, C4:0, C5:0}, A: {C3:0, C4:0, C5:0}, N: {C1:0, C2:0} };
        let hasDelCover = false;

        // --- Step 0: Priority Assignments (Leave, Fixed Day Off) ---
        staffProfiles.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            const request = getWeeklyRequest(staff);
            
            // 0a. Requested Leave Override (HIGHEST PRIORITY)
            let onLeave = false;
            if (request.type === 'Leave') {
                const isReqDay = request.day === day || request.day === 'Sick Leave';
                const isFull = request.day === 'Full Week';
                if (isReqDay || isFull) {
                    staffEntry.weeklySchedule[dayIndex].shifts = [{ shiftId: null, jobRole: `Leave (${isFull?'Week':'Req'})`, timeRange: 'Full Day', color: '#B91C1C' }];
                    onLeave = true;
                }
            }
            
            // 0b. Fixed Day Off Assignment (Assign only if not already on requested leave)
            if (!onLeave && staff.fixedDayOff === day) {
                const roleColor = ROLE_COLORS[staff.position] || '#FFF';
                staffEntry.weeklySchedule[dayIndex].shifts = [{ shiftId: null, jobRole: 'Day Off (Fixed)', timeRange: 'Full Day', color: roleColor }];
            }
        });


        // --- Step A: Priority Assignments (Mgr, Sup, Del) ---
        
        // 1. Manager 
        if (manager) {
            const pae = weeklyRosterMap.get(manager.employeeId);
            
            // CRITICAL CHECK: Skip if Manager is already scheduled (Leave/Fixed Day Off)
            if (isScheduled(manager.employeeId, dayIndex)) { /* Skip assignment */ }
            else {
                staffEntry = pae;
                staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: 1, jobRole: 'Z1 (Mgr)', timeRange: MORNING_TIME, color: ROLE_COLORS['Manager'] });
                countM++;
            }
        } 
        
        // 2. Supervisors
        supervisors.forEach(sup => {
            const supEntry = weeklyRosterMap.get(sup.employeeId);
            const request = getWeeklyRequest(sup);

            // CRITICAL CHECK: Skip if Supervisor is already scheduled (Leave/Fixed Day Off)
            if (isScheduled(sup.employeeId, dayIndex)) { return; }
            
            const tempShiftPref = (request.type === 'ShiftChange') ? request.shift : sup.shiftPreference;
            
            let sId, t;
            if (tempShiftPref === 'Afternoon') { sId = 2; t = AFTERNOON_TIME; countA++; }
            else if (tempShiftPref === 'Night') { sId = 3; t = NIGHT_TIME; } // Sup doesn't count to Normal Staff Night Quota
            else { sId = 1; t = MORNING_TIME; countM++; } // Default Morning
            
            supEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: sId, jobRole: 'S1 (Sup)', timeRange: t, color: ROLE_COLORS['Supervisor'] });
        });

        // 3. Delivery Drivers
        deliveryDrivers.forEach((driver, index) => {
            const driverEntry = weeklyRosterMap.get(driver.employeeId);
            const otherDriver = deliveryDrivers.find(p => p.employeeId !== driver.employeeId);
            const request = getWeeklyRequest(driver);

            // CRITICAL CHECK: Skip if Driver is already scheduled (Leave/Fixed Day Off)
            if (isScheduled(driver.employeeId, dayIndex)) { 
                if (driverEntry.weeklySchedule[dayIndex].shifts.length > 0 && driverEntry.weeklySchedule[dayIndex].shifts[0].jobRole.includes('C3')) {
                    const shiftId = driverEntry.weeklySchedule[dayIndex].shifts[0].shiftId;
                    if (shiftId === 1) morningShiftRolesAssigned.C3++;
                    if (shiftId === 2) afternoonShiftRolesAssigned.C3++;
                }
                return; 
            }

            const tempShiftPref = (request.type === 'ShiftChange') ? request.shift : driver.shiftPreference; 
            
            let sId, t, jobRole = 'C3 (Del)';
            if (tempShiftPref.includes('Morning')) { sId = 1; t = MORNING_TIME; }
            else { sId = 2; t = AFTERNOON_TIME; }

            if (otherDriver && otherDriver.fixedDayOff === day) {
                jobRole = 'C3 (Del Cov)';
                driverEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: 1, jobRole: jobRole, timeRange: '07:00-21:00', color: ROLE_COLORS['Delivery'] });
                hasDelCover = true;
            } else {
                driverEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: sId, jobRole: jobRole, timeRange: t, color: ROLE_COLORS['Delivery'] });
            }
        
            if (sId === 1) { countM++; morningShiftRolesAssigned.C3++; }
            else { countA++; afternoonShiftRolesAssigned.C3++; }
        });


        // --- Step B: Normal Staff Assignment (Sequential) ---
        
        let normalStaff = staffProfiles.filter(s => s.position === 'Normal Staff');
        normalStaff.sort((a, b) => a.employeeId.localeCompare(b.employeeId));

        const nightSupCount = supervisors.filter(s => getWeeklyRequest(s).shift === 'Night' || s.shiftPreference === 'Night').length;
        const REQUIRED_NIGHT_NS = SHIFTS[3].required - nightSupCount;

        // 1. Assign Night Staff (Rotators)
        nightStaffPool.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            
            // CRITICAL CHECK: Skip if Night Rotator is already scheduled (Leave/Fixed Day Off)
            if (isScheduled(staff.employeeId, dayIndex)) { return; }
            
            if (countN_Normal < REQUIRED_NIGHT_NS) {
                let duty = (rolesUsed.N.C2 === 0) ? 'C2' : 'C1'; 
                
                staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: 3, jobRole: duty, timeRange: NIGHT_TIME });
                
                rolesUsed.N[duty]++;
                countN_Normal++;
            }
        });
        
        // 2. Assign Night Cover (from coveragePool)
        let neededNightCoverage = REQUIRED_NIGHT_NS - countN_Normal;
        
        if (neededNightCoverage > 0) {
            let availableCover = coveragePool.filter(s => !isScheduled(s.employeeId, dayIndex));
            
            for(let i=0; i < neededNightCoverage && i < availableCover.length; i++) {
                const coverStaff = availableCover[i];
                // Assign Night shift (ID 3) to fill coverage gap
                
                let duty = (rolesUsed.N.C2 === 0) ? 'C2' : 'C1'; 
                
                weeklyRosterMap.get(coverStaff.employeeId).weeklySchedule[dayIndex].shifts.push({ shiftId: 3, jobRole: `C4 (${duty} Cov)`, timeRange: NIGHT_TIME });
                
                rolesUsed.N[duty]++;
                countN_Normal++;
            }
        }


        // 3. Morning/Afternoon Normal Staff (Fill-in remaining general staff)
        
        const requiredMorningC3 = 1; 
        const requiredMorningC4 = 1; 
        const requiredMorningC5 = 1;
        
        const requiredAfternoonC3 = 1;
        const requiredAfternoonC4 = 1;
        const requiredAfternoonC5 = hasExtendedDeliveryCover ? 0 : 1; 

        const requiredMorning = SHIFTS[1].required; // 6
        const requiredAfternoon = SHIFTS[2].required; // 5

        // Use the coveragePool (non-rotators) and nightStaffPool (if they didn't get night shift)
        let remainingStaff = staffProfiles.filter(s => s.position === 'Normal Staff' && !isScheduled(s.employeeId, dayIndex));

        remainingStaff.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            const request = getWeeklyRequest(staff);
            const pref = (request.type === 'ShiftChange') ? request.shift : staff.shiftPreference;
            
            let assigned = false;

            // --- A. Morning Assignment ---
            if ((pref === 'Morning' || totalMorningStaff < totalAfternoonStaff) && totalMorningStaff < requiredMorning) {
                let jobRole = 'C4'; 
                
                if (morningShiftRolesAssigned.C5 < requiredMorningC5) { jobRole = 'C5'; morningShiftRolesAssigned.C5++; } 
                else if (morningShiftRolesAssigned.C4 < requiredMorningC4) { jobRole = 'C4'; morningShiftRolesAssigned.C4++; }
                else if (morningShiftRolesAssigned.C3 < requiredMorningC3) { jobRole = 'C3'; morningShiftRolesAssigned.C3++; }
                else { jobRole = 'C4'; }
                
                staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: 1, jobRole: jobRole, timeRange: MORNING_TIME });
                totalMorningStaff++;
                assigned = true;
            }
            
            // --- B. Afternoon Assignment ---
            if (!assigned && totalAfternoonStaff < requiredAfternoon) {
                
                let jobRole = 'C4';
                
                if (afternoonShiftRolesAssigned.C3 < requiredAfternoonC3) { jobRole = 'C3'; afternoonShiftRolesAssigned.C3++; } 
                else if (afternoonShiftRolesAssigned.C4 < requiredAfternoonC4) { jobRole = 'C4'; afternoonShiftRolesAssigned.C4++; }
                else if (afternoonShiftRolesAssigned.C5 < requiredAfternoonC5) { jobRole = 'C5'; afternoonShiftRolesAssigned.C5++; }
                else { jobRole = 'C4'; }
                
                staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: 2, jobRole: jobRole, timeRange: AFTERNOON_TIME });
                totalAfternoonStaff++;
                assigned = true;
            } 
            
            // --- C. Auto Off ---
            if (!assigned) {
                 staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: null, jobRole: 'Leave (Auto Off)', timeRange: 'Full Day' });
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