// staff_roster_generator_be.js

/**
 * GENERATOR CONFIGURATION
 * Defines the shift structure and quotas.
 * NOTE: Roles are simplified here for stable assignment.
 */
const SHIFTS = { 
    1: { name: 'Morning', time: 'DYNAMIC_TIME_1', required: 6 }, 
    2: { name: 'Afternoon', time: 'DYNAMIC_TIME_2', required: 5 }, 
    3: { name: 'Night', time: 'DYNAMIC_TIME_3', required: 3 }
};

const ROLE_COLORS = {
    'Manager': '#FF0000',      
    'Supervisor': '#FF0000',   
    'Delivery': '#00B0F0',     
    'Normal Staff': '#FFFFFF'  
};

const DAYS_FULL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// --- START SIMPLIFIED GENERATOR ---

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
        return { type: 'None' };
    }
    
    // Filter staff
    let manager = staffProfiles.find(s => s.position === 'Manager');
    let supervisors = staffProfiles.filter(s => s.position === 'Supervisor');
    let deliveryDrivers = staffProfiles.filter(s => s.position === 'Delivery');
    let allNormalStaff = staffProfiles.filter(s => s.position === 'Normal Staff');
    
    // 3. Main Loop: Day by Day
    DAYS_FULL.forEach((day, dayIndex) => {

        // --- Trackers for THIS DAY ---
        let countM = 0; 
        let countA = 0; 
        let countN = 0; // Total Night Staff (Sup + Normal)
        
        // --- Step 0: Priority Leave Assignment ---
        staffProfiles.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            const request = getWeeklyRequest(staff);
            
            // 0a. Requested Leave
            let onLeave = false;
            if (request.type === 'Leave') {
                const isReqDay = request.day === day || request.day === 'Sick Leave' || request.day === 'Full Week';
                if (isReqDay) {
                    staffEntry.weeklySchedule[dayIndex].shifts = [{ shiftId: null, jobRole: 'Leave (Requested)', timeRange: 'Full Day', color: '#B91C1C' }];
                    onLeave = true;
                }
            }
            
            // 0b. Fixed Day Off (Honors Pae's Sunday)
            if (!onLeave && staff.fixedDayOff === day) {
                const roleColor = ROLE_COLORS[staff.position] || '#FFF';
                staffEntry.weeklySchedule[dayIndex].shifts = [{ shiftId: null, jobRole: 'Day Off (Fixed)', timeRange: 'Full Day', color: roleColor }];
            }
        });


        // --- Step A: Priority Assignments (Mgr, Sup, Del) ---
        
        // 1. Manager 
        if (manager) {
            if (!isScheduled(manager.employeeId, dayIndex)) { 
                staffEntry = weeklyRosterMap.get(manager.employeeId);
                staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: 1, jobRole: 'Z1 (Mgr)', timeRange: MORNING_TIME, color: ROLE_COLORS['Manager'] });
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
            
            weeklyRosterMap.get(driver.employeeId).weeklySchedule[dayIndex].shifts.push({ shiftId: sId, jobRole: 'C3 (Del)', timeRange: t, color: ROLE_COLORS['Delivery'] });
        
            if (sId === 1) countM++;
            else countA++;
        });


        // --- Step B: Normal Staff Assignment (Simple Pref + Fill) ---
        
        const REQUIRED_NIGHT_TOTAL = SHIFTS[3].required; 
        const REQUIRED_NIGHT_NS = REQUIRED_NIGHT_TOTAL - countN; // Quota for Normal Staff
        
        let remainingStaff = allNormalStaff.filter(s => !isScheduled(s.employeeId, dayIndex));
        remainingStaff.sort((a, b) => a.employeeId.localeCompare(b.employeeId));


        remainingStaff.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            const request = getWeeklyRequest(staff);
            const pref = (request.type === 'ShiftChange') ? request.shift : staff.shiftPreference;
            
            let assigned = false;

            // 1. Try Assign Night (Priority for Night Pref + Quota Check)
            if (pref === 'Night' && countN < REQUIRED_NIGHT_TOTAL) {
                
                let duty = (countN_Normal === 0) ? 'C2' : 'C1'; 
                
                staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: 3, jobRole: duty, timeRange: NIGHT_TIME });
                countN++;
                countN_Normal++;
                assigned = true;
            }
            
            // 2. Try Assign Morning/Afternoon
            if (!assigned) {
                let targetShift = 0;
                
                if (pref === 'Morning' && countM < SHIFTS[1].required) targetShift = 1;
                else if (pref === 'Afternoon' && countA < SHIFTS[2].required) targetShift = 2;
                else if (countM < SHIFTS[1].required) targetShift = 1;
                else if (countA < SHIFTS[2].required) targetShift = 2;

                if (targetShift !== 0) {
                    const sId = targetShift;
                    const t = sId === 1 ? MORNING_TIME : AFTERNOON_TIME;
                    
                    staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: sId, jobRole: 'C4', timeRange: t });
                    
                    if (sId === 1) countM++; else countA++;
                    assigned = true;
                }
            } 
            
            // 3. Auto Off
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