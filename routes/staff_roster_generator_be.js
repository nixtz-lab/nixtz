// staff_roster_generator_be.js

/**
 * GENERATOR CONFIGURATION
 * Defines the shift structure and quotas.
 * SIMPLIFIED: Removes complex duty rotation logic for stability.
 */
const SHIFTS = { 
    1: { name: 'Morning', time: 'DYNAMIC_TIME_1', roles: ['C1', 'C4', 'C3'], required: 6 }, 
    2: { name: 'Afternoon', time: '13:30-22:30', roles: ['C1', 'C5', 'C3'], required: 5 }, 
    3: { name: 'Night', time: '22:00-07:00', roles: ['C1', 'C2'], required: 3 } // Total 3
};

const ROLE_COLORS = {
    'Manager': '#FF0000',      
    'Supervisor': '#FF0000',   
    'Delivery': '#00B0F0',     
    'Normal Staff': '#FFFFFF'  
};

const DAYS_FULL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const VALID_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function generateWeeklyRoster(staffProfiles, weekStartDate) {
    
    // 1. Time Definitions
    const MORNING_TIME = '07:00-16:00'; 
    const AFTERNOON_TIME = '13:30-22:30'; 
    const NIGHT_TIME = '22:00-07:00'; 
    const weekStartString = weekStartDate.toISOString().split('T')[0]; 

    // 2. Initialize Roster Map
    const weeklyRosterMap = new Map(staffProfiles.map(s => [s.employeeId, { ...s, weeklySchedule: new Array(7).fill({ shifts: [] }) }]));
    
    // Helper to check if scheduled
    const isScheduled = (employeeId, dayIndex) => weeklyRosterMap.get(employeeId)?.weeklySchedule[dayIndex]?.shifts?.length > 0;

    // Helper to get requests 
    function getWeeklyRequest(profile) {
        if (!profile.nextWeekHolidayRequest || profile.nextWeekHolidayRequest === 'None') return { type: 'None' };
        const parts = profile.nextWeekHolidayRequest.split(':');
        if (parts.length !== 2 || parts[0] < weekStartString) return { type: 'None' };
        if (parts[0] === weekStartString) {
            const val = parts[1];
            if (['Morning', 'Afternoon', 'Night'].includes(val)) return { type: 'ShiftChange', shift: val };
            return { type: 'Leave', day: val };
        }
        return { type: 'None' }
    }
    
    // Filter staff
    let manager = staffProfiles.find(s => s.position === 'Manager');
    let supervisors = staffProfiles.filter(s => s.position === 'Supervisor').sort((a, b) => a.shiftPreference.localeCompare(b.shiftPreference));
    let deliveryDrivers = staffProfiles.filter(s => s.position === 'Delivery').sort((a, b) => a.fixedDayOff.localeCompare(b.fixedDayOff));
    let allNormalStaff = staffProfiles.filter(s => s.position === 'Normal Staff');
    
    // 3. Main Loop: Day by Day
    DAYS_FULL.forEach((day, dayIndex) => {

        // --- Trackers for THIS DAY ---
        let countM = 0; 
        let countA = 0; 
        let countN = 0; 
        
        let rolesAssigned = { M: {C3:0, C4:0, C5:0}, A: {C3:0, C4:0, C5:0}, N: {C1:0, C2:0} };
        let hasDelCover = false;

        // --- Step 0: PRIORITY LEAVE & FIXED DAY OFF ASSIGNMENT (MUST COME FIRST) ---
        // This ensures the Day Off entry is the absolute first thing to be assigned, 
        // blocking later working shift assignments.
        staffProfiles.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            const request = getWeeklyRequest(staff);
            
            let jobRole = null;
            let color = ROLE_COLORS[staff.position] || '#FFF';

            // 0a. Requested Leave Override 
            if (request.type === 'Leave') {
                const isReqDay = request.day === day || request.day === 'Sick Leave' || request.day === 'Full Week';
                if (isReqDay) {
                    jobRole = `Leave (Requested)`;
                    color = '#B91C1C';
                }
            }
            
            // 0b. FIXED DAY OFF ASSIGNMENT (Only if not already on leave)
            if (!jobRole) {
                const fixedDay = staff.fixedDayOff;
                
                // CRITICAL FIX: Only assign Day Off if the fixedDay is a valid day name AND matches the current day.
                const isFixedDaySet = fixedDay && fixedDay !== 'None' && VALID_DAYS.includes(fixedDay);
                
                if (isFixedDaySet && fixedDay === day) {
                    jobRole = 'Day Off (Fixed)';
                }
            }
            
            // Apply assignment if determined
            if (jobRole) {
                // IMPORTANT: Use shifts=[] to ensure only one item per day
                staffEntry.weeklySchedule[dayIndex].shifts = [{ shiftId: null, jobRole: jobRole, timeRange: 'Full Day', color: color }];
            }
        });


        // --- Step A: Priority Assignments (Mgr, Sup, Del) ---
        
        // 1. Manager 
        if (manager) {
            const paeId = manager.employeeId;
            
            // CRITICAL CHECK: Skip if Pae is already scheduled (Day Off/Leave from Step 0)
            if (!isScheduled(paeId, dayIndex)) { 
                // Assign Morning Shift (ID 1)
                weeklyRosterMap.get(paeId).weeklySchedule[dayIndex].shifts.push({ 
                    shiftId: 1, 
                    jobRole: 'Z1 (Mgr)', 
                    timeRange: MORNING_TIME, 
                    color: ROLE_COLORS['Manager'] 
                });
                countM++;
            }
        } 
        
        // 2. Supervisors
        supervisors.forEach(sup => {
            if (isScheduled(sup.employeeId, dayIndex)) { return; }
            
            const request = getWeeklyRequest(sup);
            const pref = (request.type === 'ShiftChange') ? request.shift : sup.shiftPreference;
            
            let sId, t;
            if (pref === 'Afternoon') { sId = 2; t = AFTERNOON_TIME; countA++; }
            else if (pref === 'Night') { sId = 3; t = NIGHT_TIME; countN++; } 
            else { sId = 1; t = MORNING_TIME; countM++; } 
            
            weeklyRosterMap.get(sup.employeeId).weeklySchedule[dayIndex].shifts.push({ shiftId: sId, jobRole: 'S1 (Sup)', timeRange: t, color: ROLE_COLORS['Supervisor'] });
        });

        // 3. Delivery Drivers
        deliveryDrivers.forEach(driver => {
            if (isScheduled(driver.employeeId, dayIndex)) { return; }

            const request = getWeeklyRequest(driver);
            const pref = (request.type === 'ShiftChange') ? request.shift : driver.shiftPreference; 
            
            let sId, t = (pref.includes('Morning') ? MORNING_TIME : AFTERNOON_TIME);
            sId = (pref.includes('Morning') ? 1 : 2);

            const otherDriver = deliveryDrivers.find(p => p.employeeId !== driver.employeeId);
            const otherIsOff = otherDriver && isScheduled(otherDriver.employeeId, dayIndex) && weeklyRosterMap.get(otherDriver.employeeId)?.weeklySchedule[dayIndex]?.shifts[0]?.jobRole?.includes('Day Off');

            if (otherIsOff) {
                jobRole = 'C3 (Del Cov)';
                t = '07:00-21:00'; 
                sId = 1;
                hasDelCover = true;
            } else {
                jobRole = 'C3 (Del)';
            }
            
            weeklyRosterMap.get(driver.employeeId).weeklySchedule[dayIndex].shifts.push({ shiftId: sId, jobRole: jobRole, timeRange: t, color: ROLE_COLORS['Delivery'] });
        
            if (sId === 1) { countM++; rolesAssigned.M.C3++; }
            else { countA++; rolesAssigned.A.C3++; }
        });


        // --- Step B: Normal Staff Assignment (Night/Day Fill-in) ---
        
        // Filter staff who are not yet scheduled (this list is clean)
        let availableNormalStaff = allNormalStaff.filter(s => !isScheduled(s.employeeId, dayIndex));
        availableNormalStaff.sort((a, b) => a.employeeId.localeCompare(b.employeeId));

        const REQUIRED_NIGHT_TOTAL = SHIFTS[3].required; 

        // 1. Assign Night Staff
        availableNormalStaff.forEach(staff => {
            
            if (countN >= REQUIRED_NIGHT_TOTAL) return;

            // Only proceed if not already scheduled
            if (isScheduled(staff.employeeId, dayIndex)) return; 

            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            const request = getWeeklyRequest(staff);
            const pref = (request.type === 'ShiftChange') ? request.shift : staff.shiftPreference;
            
            // Assign Night only if preference is night
            if (pref === 'Night') { 
                
                let duty = (rolesAssigned.N.C2 === 0) ? 'C2' : 'C1'; 
                let jobRole = duty;
                
                staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: 3, jobRole: jobRole, timeRange: NIGHT_TIME });
                
                rolesAssigned.N[duty]++;
                countN++;
            }
        });


        // 2. Morning/Afternoon Normal Staff (Fill-in remaining general staff)
        
        let totalMorningStaff = countM;
        let totalAfternoonStaff = countA;
        
        const requiredMorningC5 = 1;
        const requiredAfternoonC4 = 1; 
        const requiredAfternoonC5 = hasDelCover ? 0 : 1; 

        const requiredMorning = SHIFTS[1].required; 
        const requiredAfternoon = SHIFTS[2].required; 

        // Filter staff who were not assigned Night shift
        let remainingDayStaff = availableNormalStaff.filter(s => 
            !isScheduled(s.employeeId, dayIndex)
        );

        remainingDayStaff.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            const request = getWeeklyRequest(staff);
            const pref = (request.type === 'ShiftChange') ? request.shift : staff.shiftPreference;
            
            let assigned = false;

            // --- A. Morning Assignment ---
            if ((pref === 'Morning' || totalMorningStaff < totalAfternoonStaff) && totalMorningStaff < requiredMorning) {
                let jobRole = 'C4'; 
                
                if (rolesAssigned.M.C5 < requiredMorningC5) { jobRole = 'C5'; rolesAssigned.M.C5++; } 
                else if (rolesAssigned.M.C4 < 2) { jobRole = 'C4'; rolesAssigned.M.C4++; } 
                
                staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: 1, jobRole: jobRole, timeRange: MORNING_TIME });
                totalMorningStaff++;
                assigned = true;
            }
            
            // --- B. Afternoon Assignment ---
            if (!assigned && totalAfternoonStaff < requiredAfternoon) {
                
                let jobRole = 'C4';
                
                if (rolesAssigned.A.C5 < requiredAfternoonC5) { jobRole = 'C5'; rolesAssigned.A.C5++; } 
                else if (rolesAssigned.A.C4 < 2) { jobRole = 'C4'; rolesAssigned.A.C4++; }
                
                staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: 2, jobRole: jobRole, timeRange: AFTERNOON_TIME });
                totalAfternoonStaff++;
                assigned = true;
            } 
            
            // --- C. Auto Off ---
            if (!assigned) {
                 // IMPORTANT: Use shifts=[] to ensure only one item per day
                 staffEntry.weeklySchedule[dayIndex].shifts = [{ shiftId: null, jobRole: 'Leave (Auto Off)', timeRange: 'Full Day' }];
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