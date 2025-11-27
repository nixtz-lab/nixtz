// staff_roster_generator_be.js

/**
 * GENERATOR CONFIGURATION
 * Defines the shift structure and quotas.
 */
const SHIFTS = { 
    1: { name: 'Morning', time: 'DYNAMIC_TIME_1', required: 6 }, 
    2: { name: 'Afternoon', time: 'DYNAMIC_TIME_2', required: 5 }, 
    3: { name: 'Night', time: 'DYNAMIC_TIME_3', required: 3 } // Total 3: 1 Sup + 2 Normal
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
 * Helper: Calculate next rotational duty based on history
 */
function getNextDuty(staff, dayIndex, shiftId, weeklyRosterMap) {
    const isNightShift = shiftId === 3;
    const availableRoles = isNightShift ? NIGHT_SHIFT_ROLES : DAY_SHIFT_ROLES;
    const employeeId = staff.employeeId;
    
    // Default start duties
    let suggestedRole = isNightShift ? 'C2' : 'C4'; 

    if (dayIndex > 0) {
        const prevDayEntry = weeklyRosterMap.get(employeeId).weeklySchedule[dayIndex - 1];
        
        // If worked yesterday
        if (prevDayEntry.shifts.length > 0 && !prevDayEntry.shifts[0].jobRole.includes('Leave') && !prevDayEntry.shifts[0].jobRole.includes('Day Off')) {
            const prevShift = prevDayEntry.shifts[0];
            const prevRole = prevShift.jobRole.split(' ')[0].trim();

            if (prevShift.shiftId === shiftId && availableRoles.includes(prevRole)) {
                // Night: Swap every 2 days
                if (isNightShift) {
                    const dayBefore = (dayIndex > 1) ? weeklyRosterMap.get(employeeId).weeklySchedule[dayIndex - 2] : null;
                    const sameAsDayBefore = dayBefore && dayBefore.shifts.length > 0 && dayBefore.shifts[0].jobRole.startsWith(prevRole);
                    
                    // If 2nd day of same role, swap. Else keep.
                    if (sameAsDayBefore) {
                        const idx = availableRoles.indexOf(prevRole);
                        suggestedRole = availableRoles[(idx + 1) % availableRoles.length];
                    } else {
                        suggestedRole = prevRole;
                    }
                } 
                // Day: Swap daily
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
    
    // Helper to check if scheduled
    const isScheduled = (sid, did) => weeklyRosterMap.get(sid).weeklySchedule[did].shifts.length > 0;

    // 3. Helper to get requests
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

    // 4. Main Loop: Day by Day
    DAYS_FULL.forEach((day, dayIndex) => {

        // --- Trackers for THIS DAY ---
        let countM = 0; // Morning Count
        let countA = 0; // Afternoon Count
        let countN_Normal = 0; // Night Count (Normal Staff Only)
        
        // Track Specific Role Usage to ensure coverage
        let rolesUsed = { M: {C3:0, C4:0, C5:0}, A: {C3:0, C4:0, C5:0}, N: {C1:0, C2:0} };
        let hasDelCover = false;

        // --- Step A: Priority Assignments (Mgr, Sup, Del) ---
        // These are assigned first. They do NOT count towards the "Normal Staff Night Quota".
        
        staffProfiles.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            const request = getWeeklyRequest(staff);
            
            // 1. Apply Leave/Off
            let onLeave = false;
            if (request.type === 'Leave') {
                const isReqDay = request.day === day || request.day === 'Sick Leave';
                const isFull = request.day === 'Full Week';
                if (isReqDay || isFull) {
                    staffEntry.weeklySchedule[dayIndex].shifts = [{ shiftId: null, jobRole: `Leave (${isFull?'Week':'Req'})`, timeRange: 'Full Day', color: '#B91C1C' }];
                    onLeave = true;
                }
            }
            if (!onLeave && !isScheduled(staff.employeeId, dayIndex) && staff.fixedDayOff === day) {
                staffEntry.weeklySchedule[dayIndex].shifts = [{ shiftId: null, jobRole: 'Day Off', timeRange: 'Full Day', color: ROLE_COLORS[staff.position] || '#FFF' }];
                onLeave = true;
            }

            // 2. Assign Priority Roles if not on leave
            if (!onLeave) {
                if (staff.position === 'Manager') {
                    staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: 1, jobRole: 'Z1 (Mgr)', timeRange: MORNING_TIME, color: ROLE_COLORS['Manager'] });
                    countM++;
                } 
                else if (staff.position === 'Supervisor') {
                    let sId = 1, t = MORNING_TIME;
                    const pref = (request.type === 'ShiftChange') ? request.shift : staff.shiftPreference;
                    if (pref === 'Afternoon') { sId = 2; t = AFTERNOON_TIME; countA++; }
                    else if (pref === 'Night') { sId = 3; t = NIGHT_TIME; /* Supervisor doesn't count to Normal Staff Night Quota */ }
                    else { countM++; } // Default Morning
                    
                    staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: sId, jobRole: 'S1 (Sup)', timeRange: t, color: ROLE_COLORS['Supervisor'] });
                }
                else if (staff.position === 'Delivery') {
                    // Simple Delivery Logic
                    const pref = (request.type === 'ShiftChange') ? request.shift : staff.shiftPreference;
                    let sId = 1, t = MORNING_TIME;
                    if (pref === 'Afternoon') { sId = 2; t = AFTERNOON_TIME; }
                    
                    // Check if partner is off (simplified)
                    const partner = staffProfiles.find(p => p.position === 'Delivery' && p.employeeId !== staff.employeeId);
                    if (partner && partner.fixedDayOff === day) {
                         // Covering
                         staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: 1, jobRole: 'C3 (Del Cov)', timeRange: '07:00-21:00', color: ROLE_COLORS['Delivery'] });
                         hasDelCover = true;
                    } else {
                         staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: sId, jobRole: 'C3 (Del)', timeRange: t, color: ROLE_COLORS['Delivery'] });
                    }
                    
                    if (sId === 1) { countM++; rolesUsed.M.C3++; }
                    else { countA++; rolesUsed.A.C3++; }
                }
            }
        });

        // --- Step B: Normal Staff Assignment (Sequential) ---
        // We filter for Normal Staff and sort by Employee ID to keep it "row by row" stable.
        let normalStaff = staffProfiles.filter(s => s.position === 'Normal Staff');
        // Sort by ID to ensure consistent processing order
        normalStaff.sort((a, b) => a.employeeId.localeCompare(b.employeeId));

        // We need exactly 2 Normal Staff on Night (1x C1, 1x C2)
        const REQUIRED_NIGHT_NS = 2; 

        normalStaff.forEach(staff => {
            if (isScheduled(staff.employeeId, dayIndex)) return; // Skip if leave/off

            const request = getWeeklyRequest(staff);
            const pref = (request.type === 'ShiftChange') ? request.shift : staff.shiftPreference;
            let assigned = false;

            // 1. Try Assign Night (Highest Priority for Night Pref)
            if (pref === 'Night' && countN_Normal < REQUIRED_NIGHT_NS) {
                
                // Determine duty based on rotation or filling empty slot
                let duty = getNextDuty(staff, dayIndex, 3, weeklyRosterMap);
                
                // Logic: We need 1 C1 and 1 C2.
                // If C2 is free, take it (preferred starting role).
                // If C2 taken, take C1.
                if (rolesUsed.N.C2 === 0) { duty = 'C2'; }
                else if (rolesUsed.N.C1 === 0) { duty = 'C1'; }
                
                // Assign
                staffEntry = weeklyRosterMap.get(staff.employeeId);
                staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: 3, jobRole: duty, timeRange: NIGHT_TIME });
                
                rolesUsed.N[duty]++;
                countN_Normal++;
                assigned = true;
            }

            // 2. Try Assign Day (Morning/Afternoon)
            if (!assigned) {
                let targetShift = 0;
                
                // Prefer Morning
                if (pref === 'Morning' && countM < SHIFTS[1].required) targetShift = 1;
                // Prefer Afternoon
                else if (pref === 'Afternoon' && countA < SHIFTS[2].required) targetShift = 2;
                // Fill gaps if preference full
                else if (countM < SHIFTS[1].required) targetShift = 1;
                else if (countA < SHIFTS[2].required) targetShift = 2;

                if (targetShift !== 0) {
                    const sId = targetShift;
                    const t = sId === 1 ? MORNING_TIME : AFTERNOON_TIME;
                    const rUsed = sId === 1 ? rolesUsed.M : rolesUsed.A;
                    
                    // Duty Rotation Logic
                    let duty = getNextDuty(staff, dayIndex, sId, weeklyRosterMap);
                    
                    // Override rotation to fill critical empty roles (C3/C5)
                    if (rUsed.C3 === 0) duty = 'C3';
                    else if (rUsed.C5 === 0 && !hasDelCover) duty = 'C5'; // Only force C5 if no Del cover
                    
                    // Assign
                    weeklyRosterMap.get(staff.employeeId).weeklySchedule[dayIndex].shifts.push({ shiftId: sId, jobRole: duty, timeRange: t });
                    
                    if (sId === 1) countM++; else countA++;
                    if (rUsed[duty] !== undefined) rUsed[duty]++;
                    assigned = true;
                }
            }

            // 3. Auto Off
            if (!assigned) {
                // Check if this specific day was requested off (unlikely if we are here, but safe to check)
                // Otherwise assign Auto Off
                if (request.type !== 'Leave' || request.day === 'Full Week' || request.day === day) {
                     // If it's a specific single day request that WASN'T the current day, we shouldn't be here? 
                     // Actually, if pref was day and day is full, they get auto off.
                     weeklyRosterMap.get(staff.employeeId).weeklySchedule[dayIndex].shifts.push({ shiftId: null, jobRole: 'Leave (Auto Off)', timeRange: 'Full Day' });
                }
            }
        });

    }); // End Day Loop

    // Final Format
    return Array.from(weeklyRosterMap.values()).map(staff => ({
        employeeName: staff.name,
        employeeId: staff.employeeId,
        position: staff.position,
        weeklySchedule: staff.weeklySchedule.map((ds, i) => ({ dayOfWeek: DAYS_FULL[i], shifts: ds.shifts }))
    }));
}

module.exports = { generateWeeklyRoster };