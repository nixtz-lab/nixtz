// staff_roster_generator_be.js

const SHIFTS = { 
    1: { name: 'Morning', time: 'DYNAMIC_TIME_1', roles: ['C1', 'C4', 'C3'], required: 6 }, 
    2: { name: 'Afternoon', time: 'DYNAMIC_TIME_2', roles: ['C1', 'C5', 'C3'], required: 5 }, 
    3: { name: 'Night', time: '22:00-07:00', baseShiftId: 3, required: 'N/A', roles: ['C1', 'C2'] },
};

const ROLE_COLORS = {
    'Manager': '#FF0000', 'Supervisor': '#FF0000', 'Delivery': '#00B0F0', 'Normal Staff': '#FFFFFF'  
};

const DAYS_FULL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Rotation Arrays
const DAY_SHIFT_ROLES = ['C4', 'C5', 'C3']; 
const NIGHT_SHIFT_ROLES = ['C2', 'C1']; 

// --- HELPER: Random Day Off Distributor ---
// Ensures days off are spread out, not all on Monday
function assignRandomDaysOff(staffList) {
    const dayOffMap = new Map(); // { employeeId: 'Mon' }
    
    // Simple load balancing for days off
    const dayCounts = { Mon:0, Tue:0, Wed:0, Thu:0, Fri:0, Sat:0, Sun:0 };
    
    // Shuffle staff to randomize who gets what day
    const shuffled = staffList.sort(() => 0.5 - Math.random());

    shuffled.forEach(staff => {
        // Find day with lowest number of people off
        const bestDay = DAYS_FULL.reduce((a, b) => dayCounts[a] <= dayCounts[b] ? a : b);
        dayOffMap.set(staff.employeeId, bestDay);
        dayCounts[bestDay]++;
    });
    return dayOffMap;
}

// --- HELPER: Get Next Duty Logic ---
function getNextDuty(staff, dayIndex, shiftId, weeklyRosterMap) {
    const isNight = shiftId === 3;
    const roles = isNight ? NIGHT_SHIFT_ROLES : DAY_SHIFT_ROLES;
    const prevDayEntry = (dayIndex > 0) ? weeklyRosterMap.get(staff.employeeId).weeklySchedule[dayIndex - 1] : null;
    
    if (!prevDayEntry || prevDayEntry.shifts.length === 0 || prevDayEntry.shifts[0].jobRole.includes('Leave') || prevDayEntry.shifts[0].jobRole.includes('Day Off')) {
        return roles[0]; // Default start
    }

    const prevShift = prevDayEntry.shifts[0];
    const prevRole = prevShift.jobRole.split(' ')[0].trim();
    
    if (prevShift.shiftId !== shiftId || !roles.includes(prevRole)) return roles[0];

    if (isNight) {
        // Night Swap every 2 days
        const dayBefore = (dayIndex > 1) ? weeklyRosterMap.get(staff.employeeId).weeklySchedule[dayIndex - 2] : null;
        const isSecondDay = dayBefore && dayBefore.shifts.length > 0 && dayBefore.shifts[0].jobRole.startsWith(prevRole);
        return isSecondDay ? roles[(roles.indexOf(prevRole) + 1) % roles.length] : prevRole;
    } else {
        // Day Swap Daily
        return roles[(roles.indexOf(prevRole) + 1) % roles.length];
    }
}

function generateWeeklyRoster(staffProfiles, weekStartDate) {
    const MORNING_TIME = '07:00-16:00';
    const AFTERNOON_TIME = '13:30-22:30';
    const NIGHT_TIME = '22:00-07:00';
    const weekStartString = weekStartDate.toISOString().split('T')[0]; 

    // 1. Initialize Roster Structure
    const weeklyRosterMap = new Map(staffProfiles.map(s => [s.employeeId, { ...s, weeklySchedule: new Array(7).fill({ shifts: [] }) }]));
    const isScheduled = (eid, did) => weeklyRosterMap.get(eid).weeklySchedule[did].shifts.length > 0;

    // 2. Pre-Calculate Random Days Off
    // We need a list of staff who do NOT have a fixed day off and do NOT have a specific leave request
    let staffNeedingOff = [];
    staffProfiles.forEach(s => {
        const hasFixed = s.fixedDayOff !== 'None';
        const hasReq = s.nextWeekHolidayRequest && s.nextWeekHolidayRequest.includes(weekStartString);
        if (!hasFixed && !hasReq && s.position !== 'Manager') {
            staffNeedingOff.push(s);
        }
    });
    const randomDayOffs = assignRandomDaysOff(staffNeedingOff);

    // 3. Main Daily Loop
    DAYS_FULL.forEach((day, dayIndex) => {
        
        // Trackers for THIS DAY
        let morningCount = 0;
        let afternoonCount = 0;
        
        // Specific Night Role Trackers for Normal Staff Quota
        let nightC1_Normal_Assigned = 0;
        let nightC2_Normal_Assigned = 0;
        
        // --- STEP A: APPLY LEAVES (Fixed, Random, Requested) ---
        staffProfiles.forEach(staff => {
            const entry = weeklyRosterMap.get(staff.employeeId);
            let request = { type: 'None' };
            
            // Parse Request
            if (staff.nextWeekHolidayRequest && staff.nextWeekHolidayRequest.startsWith(weekStartString)) {
                const val = staff.nextWeekHolidayRequest.split(':')[1];
                if (['Morning','Afternoon','Night'].includes(val)) request = { type: 'ShiftChange', shift: val };
                else request = { type: 'Leave', day: val };
            }

            // 1. Check Request
            if (request.type === 'Leave' && (request.day === day || request.day === 'Sick Leave' || request.day === 'Full Week')) {
                const label = request.day === 'Full Week' ? 'Week Off' : (request.day === 'Sick Leave' ? 'Sick' : 'Requested');
                entry.weeklySchedule[dayIndex].shifts = [{ shiftId: null, jobRole: `Leave (${label})`, timeRange: 'Full Day', color: '#B91C1C' }];
            }
            // 2. Check Fixed Day Off
            else if (staff.fixedDayOff === day) {
                entry.weeklySchedule[dayIndex].shifts = [{ shiftId: null, jobRole: 'Day Off', timeRange: 'Full Day', color: ROLE_COLORS[staff.position] }];
            }
            // 3. Check Random Day Off
            else if (randomDayOffs.get(staff.employeeId) === day) {
                entry.weeklySchedule[dayIndex].shifts = [{ shiftId: null, jobRole: 'Day Off', timeRange: 'Full Day', color: ROLE_COLORS[staff.position] }];
            }
        });

        // --- STEP B: ASSIGN LEADERSHIP (Manager & Supervisor) ---
        staffProfiles.filter(s => s.position === 'Manager' || s.position === 'Supervisor').forEach(staff => {
            if (isScheduled(staff.employeeId, dayIndex)) return;
            
            const entry = weeklyRosterMap.get(staff.employeeId);
            
            // Manager: Always Morning Z1
            if (staff.position === 'Manager') {
                entry.weeklySchedule[dayIndex].shifts.push({ shiftId: 1, jobRole: 'Z1 (Mgr)', timeRange: MORNING_TIME, color: ROLE_COLORS['Manager'] });
                morningCount++;
            } 
            // Supervisor: Preference based S1
            else {
                // Parse preference again locally
                let pref = staff.shiftPreference;
                if (staff.nextWeekHolidayRequest && staff.nextWeekHolidayRequest.startsWith(weekStartString)) {
                    const val = staff.nextWeekHolidayRequest.split(':')[1];
                    if (['Morning','Afternoon','Night'].includes(val)) pref = val;
                }

                let sId=1, time=MORNING_TIME;
                if (pref === 'Afternoon') { sId=2; time=AFTERNOON_TIME; afternoonCount++; }
                else if (pref === 'Night') { sId=3; time=NIGHT_TIME; /* Night Supervisor doesn't count to Normal Staff Quota */ }
                else { morningCount++; }
                
                entry.weeklySchedule[dayIndex].shifts.push({ shiftId: sId, jobRole: 'S1 (Sup)', timeRange: time, color: ROLE_COLORS['Supervisor'] });
            }
        });

        // --- STEP C: ASSIGN DELIVERY (C3) ---
        staffProfiles.filter(s => s.position === 'Delivery').forEach(staff => {
            if (isScheduled(staff.employeeId, dayIndex)) return;
            
            const entry = weeklyRosterMap.get(staff.employeeId);
            let pref = staff.shiftPreference; // (Add request parsing if needed for shift change)
            
            // Check partner for cover
            const partner = staffProfiles.find(d => d.position === 'Delivery' && d.employeeId !== staff.employeeId);
            const isCover = partner && isScheduled(partner.employeeId, dayIndex) && weeklyRosterMap.get(partner.employeeId).weeklySchedule[dayIndex].shifts[0].jobRole.includes('Day Off');

            if (isCover) {
                entry.weeklySchedule[dayIndex].shifts.push({ shiftId: 1, jobRole: 'C3 (Del Cov)', timeRange: '07:00-21:00', color: ROLE_COLORS['Delivery'] });
            } else {
                let sId = (pref === 'Afternoon') ? 2 : 1;
                let time = (sId === 1) ? MORNING_TIME : AFTERNOON_TIME;
                entry.weeklySchedule[dayIndex].shifts.push({ shiftId: sId, jobRole: 'C3 (Del)', timeRange: time, color: ROLE_COLORS['Delivery'] });
                if (sId === 1) morningCount++; else afternoonCount++;
            }
        });

        // --- STEP D: ASSIGN NORMAL STAFF (Night Priority First) ---
        let normalStaff = staffProfiles.filter(s => s.position === 'Normal Staff');
        
        // 1. Sort by Night Preference First
        // We prioritize putting "Night" preference people into the loop first to grab the C1/C2 slots.
        normalStaff.sort((a, b) => {
            const aPref = a.shiftPreference === 'Night' ? 0 : 1;
            const bPref = b.shiftPreference === 'Night' ? 0 : 1;
            return aPref - bPref;
        });

        normalStaff.forEach(staff => {
            if (isScheduled(staff.employeeId, dayIndex)) return;

            const entry = weeklyRosterMap.get(staff.employeeId);
            // Parse preference
            let pref = staff.shiftPreference;
            if (staff.nextWeekHolidayRequest && staff.nextWeekHolidayRequest.startsWith(weekStartString)) {
                const val = staff.nextWeekHolidayRequest.split(':')[1];
                if (['Morning','Afternoon','Night'].includes(val)) pref = val;
            }

            let assigned = false;

            // --- D1. Night Assignment (Target: 1x C1, 1x C2) ---
            if (pref === 'Night') {
                // Logic: If we haven't filled the 2 Normal Staff slots yet
                let role = null;
                
                // Rotation Logic for Night
                const rotatedRole = getNextDuty(staff, dayIndex, 3, weeklyRosterMap);

                // Strict fill: We NEED 1 C2 and 1 C1.
                if (nightC2_Normal_Assigned === 0) {
                    role = 'C2'; // Priority 1
                } else if (nightC1_Normal_Assigned === 0) {
                    role = 'C1'; // Priority 2
                }
                
                if (role) {
                    entry.weeklySchedule[dayIndex].shifts.push({ shiftId: 3, jobRole: role, timeRange: NIGHT_TIME });
                    if (role === 'C2') nightC2_Normal_Assigned++;
                    if (role === 'C1') nightC1_Normal_Assigned++;
                    assigned = true;
                }
            }

            // --- D2. Day Assignment (Morning/Afternoon) ---
            if (!assigned) {
                let target = 0;
                const REQ_M = 6; 
                const REQ_A = 5;

                // Simple logic: Fill preference if open, else fill other
                if (pref === 'Morning' && morningCount < REQ_M) target = 1;
                else if (pref === 'Afternoon' && afternoonCount < REQ_A) target = 2;
                else if (morningCount < REQ_M) target = 1;
                else target = 2; // Overflow to afternoon

                const time = (target === 1) ? MORNING_TIME : AFTERNOON_TIME;
                let role = getNextDuty(staff, dayIndex, target, weeklyRosterMap);
                
                // Simple Role Fill if rotation fails (ensure valid role)
                if (!['C3','C4','C5'].includes(role)) role = 'C4';

                entry.weeklySchedule[dayIndex].shifts.push({ shiftId: target, jobRole: role, timeRange: time });
                if (target === 1) morningCount++; else afternoonCount++;
                assigned = true;
            }
        });

    }); // End Days Loop

    // Format output
    return Array.from(weeklyRosterMap.values()).map(staff => ({
        employeeName: staff.name,
        employeeId: staff.employeeId,
        position: staff.position,
        weeklySchedule: staff.weeklySchedule.map((ds, i) => ({ dayOfWeek: DAYS_FULL[i], shifts: ds.shifts }))
    }));
}

module.exports = { generateWeeklyRoster };