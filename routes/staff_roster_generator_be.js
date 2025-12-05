// staff_roster_generator_be.js

const SHIFTS = {
    1: { name: 'Morning', time: '07:00-16:00', required: 6 },
    2: { name: 'Afternoon', time: '13:30-22:30', required: 5 },
    3: { name: 'Night', time: '22:00-07:00', required: 3 }
};

const DAYS_FULL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_OFF_MARKER = 'หยุด'; 

/**
 * Helper: Parse the specific request for a staff member for the current week.
 */
function getStaffRequest(profile, weekStartString) {
    if (!profile.nextWeekHolidayRequest || profile.nextWeekHolidayRequest === 'None') return null;
    
    const parts = profile.nextWeekHolidayRequest.split(':');
    // Ensure request is for THIS week
    if (parts[0] !== weekStartString) return null;

    // 1. Weekly Shift Preference Change
    if (parts.length === 2 && ['Morning', 'Afternoon', 'Night'].includes(parts[1])) {
        return { type: 'ShiftChange', shift: parts[1] };
    }
    // 2. Specific Day Off / Duty
    if (parts.length === 4) {
        return { type: 'Specific', day: parts[1], shiftId: parts[2], dutyRole: parts[3] };
    }
    // 3. Leave
    if (parts.length === 2) {
        return { type: 'Leave', day: parts[1] };
    }
    return null;
}

/**
 * Core Function: Decide the shift for ONE staff member on ONE specific day.
 * This function is isolated to prevent "leaking" status across days.
 */
function calculateDailyShift(staff, day, dayIndex, currentCounts, request) {
    const fixedDayOff = (staff.fixedDayOff || 'None').trim();
    const position = staff.position;
    
    // --- PRIORITY 1: Specific Requests & Leave ---
    if (request) {
        if (request.type === 'Specific' && request.day === day) {
            // If it's a specific assignment (Work or Off)
            if (request.shiftId === 'STATUS_LEAVE') {
                return { shiftId: null, jobRole: request.dutyRole, timeRange: DAY_OFF_MARKER };
            }
            const shift = SHIFTS[request.shiftId];
            if (shift) {
                // We need to count this towards the daily total
                if (request.shiftId == 1) currentCounts.M++;
                if (request.shiftId == 2) currentCounts.A++;
                if (request.shiftId == 3) currentCounts.N++;
                return { shiftId: request.shiftId, jobRole: request.dutyRole, timeRange: shift.time };
            }
        }
        if (request.type === 'Leave' && (request.day === day || request.day === 'Full Week' || request.day === 'Sick Leave')) {
            return { shiftId: null, jobRole: DAY_OFF_MARKER, timeRange: DAY_OFF_MARKER };
        }
    }

    // --- PRIORITY 2: Fixed Day Off ---
    // Strict check: Only if the current loop day matches the fixed day string
    if (fixedDayOff !== 'None' && fixedDayOff === day) {
        return { shiftId: null, jobRole: 'Day Off (Fixed)', timeRange: DAY_OFF_MARKER };
    }

    // --- PRIORITY 3: Role-Based Assignment ---
    
    // 3a. Manager (Morning Default)
    if (position === 'Manager') {
        const pref = (request && request.type === 'ShiftChange') ? request.shift : 'Morning';
        if (pref === 'Night') { currentCounts.N++; return { shiftId: 3, jobRole: 'C1 (Mgr)', timeRange: SHIFTS[3].time }; }
        if (pref === 'Afternoon') { currentCounts.A++; return { shiftId: 2, jobRole: 'C1 (Mgr)', timeRange: SHIFTS[2].time }; }
        currentCounts.M++; return { shiftId: 1, jobRole: 'C1 (Mgr)', timeRange: SHIFTS[1].time };
    }

    // 3b. Supervisor
    if (position === 'Supervisor') {
        const pref = (request && request.type === 'ShiftChange') ? request.shift : staff.shiftPreference;
        if (pref === 'Afternoon') { currentCounts.A++; return { shiftId: 2, jobRole: 'C1 (Sup)', timeRange: SHIFTS[2].time }; }
        if (pref === 'Night') { currentCounts.N++; return { shiftId: 3, jobRole: 'C1 (Sup)', timeRange: SHIFTS[3].time }; }
        currentCounts.M++; return { shiftId: 1, jobRole: 'C1 (Sup)', timeRange: SHIFTS[1].time };
    }

    // 3c. Delivery
    if (position === 'Delivery') {
        const pref = (request && request.type === 'ShiftChange') ? request.shift : staff.shiftPreference;
        if (pref.includes('Morning')) { currentCounts.M++; return { shiftId: 1, jobRole: 'C3 (Del)', timeRange: SHIFTS[1].time }; }
        currentCounts.A++; return { shiftId: 2, jobRole: 'C3 (Del)', timeRange: SHIFTS[2].time };
    }

    // 3d. Normal Staff (The fillers)
    // Preference handling
    const pref = (request && request.type === 'ShiftChange') ? request.shift : staff.shiftPreference;

    // Night Staff Check
    if (pref === 'Night' && currentCounts.N < SHIFTS[3].required) {
        currentCounts.N++;
        return { shiftId: 3, jobRole: 'C2', timeRange: SHIFTS[3].time };
    }

    // Morning Check (If preferred OR if Morning is low and Afternoon is full)
    const needsMorning = currentCounts.M < SHIFTS[1].required;
    const needsAfternoon = currentCounts.A < SHIFTS[2].required;

    if (needsMorning && (pref === 'Morning' || !needsAfternoon)) {
        currentCounts.M++;
        return { shiftId: 1, jobRole: 'C4', timeRange: SHIFTS[1].time };
    }

    // Afternoon Check
    if (needsAfternoon) {
        currentCounts.A++;
        return { shiftId: 2, jobRole: 'C5', timeRange: SHIFTS[2].time };
    }

    // Fallback: If no slots needed, they get a day off (or forced extra)
    return { shiftId: null, jobRole: DAY_OFF_MARKER, timeRange: DAY_OFF_MARKER };
}


function generateWeeklyRoster(staffProfiles, weekStartDate) {
    const weekStartString = weekStartDate.toISOString().split('T')[0];
    
    // Sort staff to ensure Manager/Sup get first picks
    const sortedStaff = [...staffProfiles].sort((a, b) => {
        const ranks = { 'Manager': 1, 'Supervisor': 2, 'Delivery': 3, 'Normal Staff': 4 };
        return (ranks[a.position] || 5) - (ranks[b.position] || 5);
    });

    // Structure to hold the result
    const weeklyData = sortedStaff.map(s => ({
        employeeName: s.name,
        employeeId: s.employeeId,
        position: s.position,
        weeklySchedule: [] // We will push days here one by one
    }));

    // Iterate Day by Day
    DAYS_FULL.forEach((day, dayIndex) => {
        
        // Reset counts for THIS DAY only
        let currentCounts = { M: 0, A: 0, N: 0 };

        // Iterate Staff by Staff for THIS DAY
        weeklyData.forEach((rosterEntry, staffIndex) => {
            const profile = sortedStaff[staffIndex];
            const request = getStaffRequest(profile, weekStartString);
            
            // Calculate the single cell
            const shiftAssignment = calculateDailyShift(profile, day, dayIndex, currentCounts, request);
            
            // Push to that staff's schedule
            rosterEntry.weeklySchedule.push({
                dayOfWeek: day,
                shifts: [shiftAssignment]
            });
        });
    });

    return weeklyData;
}

module.exports = { generateWeeklyRoster };