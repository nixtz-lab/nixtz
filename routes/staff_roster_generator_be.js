// staff_roster_generator_be.js

/**
 * REWRITTEN CORE DEFINITIONS for Stability
 */
const SHIFTS = { 
    1: { name: 'Morning', time: '07:00-16:00', roles: ['C1', 'C4', 'C3'], required: 6 }, 
    2: { name: 'Afternoon', time: '13:30-22:30', roles: ['C1', 'C5', 'C3'], required: 5 }, 
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
const DAY_OFF_MARKER = 'หยุด'; 

function generateWeeklyRoster(staffProfiles, weekStartDate) {
    
    // 1. Time Definitions
    const MORNING_TIME = SHIFTS[1].time; 
    const AFTERNOON_TIME = SHIFTS[2].time; 
    const NIGHT_TIME = SHIFTS[3].time; 
    const weekStartString = weekStartDate.toISOString().split('T')[0]; 

    // 2. Initialization
    const weeklyRosterMap = new Map(staffProfiles.map(s => [s.employeeId, { ...s, weeklySchedule: new Array(7).fill({ shifts: [] }) }]));
    
    const isScheduled = (employeeId, dayIndex) => weeklyRosterMap.get(employeeId)?.weeklySchedule[dayIndex]?.shifts?.length > 0;

    // Helper: Get Requests
    function getWeeklyRequest(profile) {
        if (!profile.nextWeekHolidayRequest || profile.nextWeekHolidayRequest === 'None') return { type: 'None' };
        const parts = profile.nextWeekHolidayRequest.split(':');
        
        if (parts.length < 2 || parts[0] !== weekStartString) return { type: 'None' };
        
        if (parts.length === 2 && ['Morning', 'Afternoon', 'Night'].includes(parts[1])) {
             return { type: 'ShiftChange', shift: parts[1] };
        } 
        
        if (parts.length === 4) {
            const [reqWeek, reqDay, reqShiftId, reqDutyRole] = parts;
            return { type: 'SpecificAssignment', day: reqDay, shiftId: reqShiftId, dutyRole: reqDutyRole };
        }

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

        let countM = 0; 
        let countA = 0; 
        let countN = 0; 
        let rolesAssigned = { M: {C1:0, C4:0, C3:0}, A: {C1:0, C5:0, C3:0}, N: {C2:0, C1:0} };

        // --- STEP 0: ABSOLUTE PRIORITY - FIXED DAY OFF CHECK ---
        // This block runs BEFORE any requests or assignments to guarantee fixed days off are respected.
        staffProfiles.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            const fixedDay = (staff.fixedDayOff || 'None').trim();
            
            // IF this is the staff's fixed day off, FORCE the day off assignment immediately.
            if (fixedDay !== 'None' && VALID_DAYS.includes(fixedDay) && fixedDay === day) {
                const color = ROLE_COLORS[staff.position] || '#FFFFFF';
                staffEntry.weeklySchedule[dayIndex].shifts = [{ 
                    shiftId: null, 
                    jobRole: 'Day Off (Fixed)', 
                    timeRange: DAY_OFF_MARKER,
                    color: color
                }];
            }
        });

        // --- STEP 1: REQUESTS & LEAVE (Only for staff not already assigned a Fixed Day Off) ---
        staffProfiles.forEach(staff => {
            if (isScheduled(staff.employeeId, dayIndex)) return; // Skip if Fixed Day Off already set

            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            const request = getWeeklyRequest(staff);
            let assignment = null;
            let color = ROLE_COLORS[staff.position] || '#FFF';

            if (request.type === 'SpecificAssignment' && request.day === day) {
                const shiftConfig = SHIFTS[request.shiftId] || {}; 
                if (request.shiftId === 'STATUS_LEAVE') { 
                     assignment = { shiftId: null, jobRole: request.dutyRole, timeRange: DAY_OFF_MARKER, color: '#B91C1C' };
                } else if (shiftConfig) {
                    assignment = { shiftId: request.shiftId, jobRole: request.dutyRole, timeRange: shiftConfig.time, color: color };
                }
            }
            
            if (!assignment && request.type === 'Leave') {
                const isReqDay = request.day === day || request.day === 'Sick Leave' || request.day === 'Full Week';
                if (isReqDay) {
                    assignment = { shiftId: null, jobRole: DAY_OFF_MARKER, timeRange: DAY_OFF_MARKER, color: '#B91C1C' };
                }
            }
            
            if (assignment) {
                staffEntry.weeklySchedule[dayIndex].shifts = [assignment];
            }
        });


        // --- STEP 2: ASSIGN WORK SHIFTS (Only for unassigned staff) ---
        
        // 2a. Manager
        if (manager && !isScheduled(manager.employeeId, dayIndex)) { 
            const request = getWeeklyRequest(manager);
            const pref = (request.type === 'ShiftChange') ? request.shift : 'Morning';
            let sId = 1, t = MORNING_TIME;
            
            if (pref === 'Night') { sId = 3; t = NIGHT_TIME; countN++; } 
            else if (pref === 'Afternoon') { sId = 2; t = AFTERNOON_TIME; countA++; }
            else { countM++; } // Default Morning
            
            weeklyRosterMap.get(manager.employeeId).weeklySchedule[dayIndex].shifts.push({ 
                shiftId: sId, jobRole: 'C1 (Mgr)', timeRange: t, color: ROLE_COLORS['Manager'] 
            });
        } 
        
        // 2b. Supervisors
        supervisors.forEach(sup => {
            if (isScheduled(sup.employeeId, dayIndex)) return;
            
            const request = getWeeklyRequest(sup);
            const pref = (request.type === 'ShiftChange') ? request.shift : sup.shiftPreference;
            let sId = 1, t = MORNING_TIME;

            if (pref === 'Afternoon') { sId = 2; t = AFTERNOON_TIME; countA++; }
            else if (pref === 'Night') { sId = 3; t = NIGHT_TIME; countN++; } 
            else { countM++; } // Default Morning
            
            weeklyRosterMap.get(sup.employeeId).weeklySchedule[dayIndex].shifts.push({ shiftId: sId, jobRole: 'C1 (Sup)', timeRange: t, color: ROLE_COLORS['Supervisor'] });
        });

        // 2c. Delivery Drivers
        deliveryDrivers.forEach(driver => {
            if (isScheduled(driver.employeeId, dayIndex)) return;

            const request = getWeeklyRequest(driver);
            const pref = (request.type === 'ShiftChange') ? request.shift : driver.shiftPreference; 
            let sId = 1, t = MORNING_TIME;

            if (pref.includes('Morning')) { countM++; rolesAssigned.M.C3++; }
            else { sId = 2; t = AFTERNOON_TIME; countA++; rolesAssigned.A.C3++; }
            
            weeklyRosterMap.get(driver.employeeId).weeklySchedule[dayIndex].shifts.push({ shiftId: sId, jobRole: 'C3 (Del)', timeRange: t, color: ROLE_COLORS['Delivery'] });
        });

        // 2d. Normal Staff (Night)
        let availableStaff = allNormalStaff.filter(s => !isScheduled(s.employeeId, dayIndex));
        availableStaff.sort((a, b) => a.employeeId.localeCompare(b.employeeId));

        availableStaff.forEach(staff => {
            if (countN >= requiredNight || isScheduled(staff.employeeId, dayIndex)) return;
            const request = getWeeklyRequest(staff);
            const pref = (request.type === 'ShiftChange') ? request.shift : staff.shiftPreference;
            
            if (pref === 'Night') { 
                weeklyRosterMap.get(staff.employeeId).weeklySchedule[dayIndex].shifts.push({ shiftId: 3, jobRole: 'C2', timeRange: NIGHT_TIME });
                countN++;
            }
        });
        
        // 2e. Normal Staff (Day Fill-in)
        let remainingDayStaff = availableStaff.filter(s => !isScheduled(s.employeeId, dayIndex));
        let totalMorningStaff = countM;
        let totalAfternoonStaff = countA;

        remainingDayStaff.forEach(staff => {
            const request = getWeeklyRequest(staff);
            const pref = (request.type === 'ShiftChange') ? request.shift : staff.shiftPreference;
            let assigned = false;

            if ((pref === 'Morning' || totalMorningStaff < totalAfternoonStaff) && totalMorningStaff < SHIFTS[1].required) {
                weeklyRosterMap.get(staff.employeeId).weeklySchedule[dayIndex].shifts.push({ shiftId: 1, jobRole: 'C4', timeRange: MORNING_TIME });
                totalMorningStaff++;
                assigned = true;
            }
            
            if (!assigned && totalAfternoonStaff < SHIFTS[2].required) {
                weeklyRosterMap.get(staff.employeeId).weeklySchedule[dayIndex].shifts.push({ shiftId: 2, jobRole: 'C5', timeRange: AFTERNOON_TIME });
                totalAfternoonStaff++;
                assigned = true;
            } 
            
            if (!assigned) {
                 weeklyRosterMap.get(staff.employeeId).weeklySchedule[dayIndex].shifts.push({ shiftId: null, jobRole: DAY_OFF_MARKER, timeRange: DAY_OFF_MARKER });
            }
        });

    }); // End Day Loop

    return Array.from(weeklyRosterMap.values()).map(staff => ({
        employeeName: staff.name,
        employeeId: staff.employeeId,
        position: staff.position,
        weeklySchedule: staff.weeklySchedule.map((ds, i) => ({ dayOfWeek: DAYS_FULL[i], shifts: ds.shifts || [] }))
    }));
}

module.exports = { generateWeeklyRoster };