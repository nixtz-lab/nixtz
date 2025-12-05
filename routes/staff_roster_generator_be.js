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
    
    // Ensure request is for THIS week (Compare Week Start Dates)
    if (parts[0] !== weekStartString) return null;

    // 1. Weekly Shift Preference Change
    // Format: "2025-12-01:Night"
    if (parts.length === 2 && ['Morning', 'Afternoon', 'Night'].includes(parts[1])) {
        return { type: 'ShiftChange', shift: parts[1] };
    }

    // 2. Specific Day Off / Duty (Date Range)
    // Format: "2025-12-01:2025-12-05|2025-12-06:ShiftID:Role"
    if (parts.length === 4) {
        const dateRange = parts[1].split('|'); // Split Start|End
        return { 
            type: 'Specific', 
            startDate: dateRange[0], 
            endDate: dateRange[1], 
            shiftId: parts[2], 
            dutyRole: parts[3] 
        };
    }

    // 3. Simple Leave (Legacy/Fallback)
    if (parts.length === 2) {
        return { type: 'Leave', day: parts[1] };
    }
    return null;
}

/**
 * Core Function: Decide the shift for ONE staff member on ONE specific day.
 */
function calculateDailyShift(staff, dayName, currentDateString, currentCounts, request) {
    const fixedDayOff = (staff.fixedDayOff || 'None').trim();
    const position = staff.position;
    
    // --- PRIORITY 1: Specific Requests (Date Range Check) ---
    if (request) {
        // Handle Specific Date Range Request
        if (request.type === 'Specific') {
            // Check if the current loop date falls within the requested range
            if (currentDateString >= request.startDate && currentDateString <= request.endDate) {
                
                // If the request is for Leave/Day Off
                if (request.shiftId === 'STATUS_LEAVE') {
                    return { shiftId: null, jobRole: request.dutyRole, timeRange: DAY_OFF_MARKER };
                }

                // If the request is for a specific working shift
                const shift = SHIFTS[request.shiftId];
                if (shift || request.shiftId) {
                    // Try to find shift details, fallback to generic if ID not in standard map
                    const time = shift ? shift.time : ""; 
                    
                    // Increment counts based on ID (rough mapping)
                    if (request.shiftId == 1) currentCounts.M++;
                    else if (request.shiftId == 2) currentCounts.A++;
                    else if (request.shiftId == 3) currentCounts.N++;
                    
                    return { shiftId: request.shiftId, jobRole: request.dutyRole, timeRange: time };
                }
            }
        }
        
        // Handle Legacy Leave (Single Day Name match)
        if (request.type === 'Leave' && (request.day === dayName || request.day === 'Full Week')) {
            return { shiftId: null, jobRole: DAY_OFF_MARKER, timeRange: DAY_OFF_MARKER };
        }
    }

    // --- PRIORITY 2: Fixed Day Off ---
    if (fixedDayOff !== 'None' && fixedDayOff === dayName) {
        return { shiftId: null, jobRole: 'Day Off (Fixed)', timeRange: DAY_OFF_MARKER };
    }

    // --- PRIORITY 3: Role-Based Assignment ---
    
    // 3a. Manager (Morning Default)
    if (position === 'Manager') {
        const pref = (request && request.type === 'ShiftChange') ? request.shift : 'Morning';
        if (pref === 'Night') { currentCounts.N++; return { shiftId: 3, jobRole: ' ', timeRange: SHIFTS[3].time }; }
        if (pref === 'Afternoon') { currentCounts.A++; return { shiftId: 2, jobRole: ' ', timeRange: SHIFTS[2].time }; }
        currentCounts.M++; return { shiftId: 1, jobRole: ' ', timeRange: SHIFTS[1].time };
    }

    // 3b. Supervisor
    if (position === 'Supervisor') {
        const pref = (request && request.type === 'ShiftChange') ? request.shift : staff.shiftPreference;
        if (pref === 'Afternoon') { currentCounts.A++; return { shiftId: 2, jobRole: ' ', timeRange: SHIFTS[2].time }; }
        if (pref === 'Night') { currentCounts.N++; return { shiftId: 3, jobRole: ' ', timeRange: SHIFTS[3].time }; }
        currentCounts.M++; return { shiftId: 1, jobRole: ' ', timeRange: SHIFTS[1].time };
    }

    // 3c. Delivery
    if (position === 'Delivery') {
        const pref = (request && request.type === 'ShiftChange') ? request.shift : staff.shiftPreference;
        if (pref.includes('Morning')) { currentCounts.M++; return { shiftId: 1, jobRole: 'C3 (Del)', timeRange: SHIFTS[1].time }; }
        currentCounts.A++; return { shiftId: 2, jobRole: 'C3 (Del)', timeRange: SHIFTS[2].time };
    }

    // 3d. Normal Staff (The fillers)
    const pref = (request && request.type === 'ShiftChange') ? request.shift : staff.shiftPreference;

    // Night Staff Check
    if (pref === 'Night' && currentCounts.N < SHIFTS[3].required) {
        currentCounts.N++;
        return { shiftId: 3, jobRole: 'C2', timeRange: SHIFTS[3].time };
    }

    // Morning Check 
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

    // Fallback
    return { shiftId: null, jobRole: DAY_OFF_MARKER, timeRange: DAY_OFF_MARKER };
}


function generateWeeklyRoster(staffProfiles, weekStartDate) {
    // Ensure weekStartDate is a Date object
    const startDateObj = new Date(weekStartDate);
    const weekStartString = startDateObj.toISOString().split('T')[0];
    
    // SORTING: Manager -> Supervisor -> Normal Staff -> Delivery
    const sortedStaff = [...staffProfiles].sort((a, b) => {
        const ranks = { 'Manager': 1, 'Supervisor': 2, 'Normal Staff': 3, 'Delivery': 4 };
        return (ranks[a.position] || 5) - (ranks[b.position] || 5);
    });

    const weeklyData = sortedStaff.map(s => ({
        employeeName: s.name,
        employeeId: s.employeeId,
        position: s.position || '', 
        weeklySchedule: [] 
    }));

    // Iterate Day by Day (Mon -> Sun)
    DAYS_FULL.forEach((dayName, dayIndex) => {
        
        // CALCULATE THE EXACT DATE FOR THIS COLUMN (Mon, Tue, etc.)
        // This fixes the issue where the code didn't know the date of "Tuesday"
        const currentLoopDate = new Date(startDateObj);
        currentLoopDate.setDate(startDateObj.getDate() + dayIndex);
        const currentDateString = currentLoopDate.toISOString().split('T')[0];

        // Reset counts for THIS DAY only
        let currentCounts = { M: 0, A: 0, N: 0 };

        // Iterate Staff by Staff for THIS DAY
        weeklyData.forEach((rosterEntry, staffIndex) => {
            const profile = sortedStaff[staffIndex];
            const request = getStaffRequest(profile, weekStartString);
            
            // Pass the specific date string (currentDateString) to the calculator
            const shiftAssignment = calculateDailyShift(profile, dayName, currentDateString, currentCounts, request);
            
            rosterEntry.weeklySchedule.push({
                dayOfWeek: dayName,
                shifts: [shiftAssignment]
            });
        });
    });

    return weeklyData;
}

module.exports = { generateWeeklyRoster };