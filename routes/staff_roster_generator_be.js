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
 * Updated to handle Date Ranges (Start|End) from the frontend.
 */
function getStaffRequest(profile, weekStartString) {
    if (!profile.nextWeekHolidayRequest || profile.nextWeekHolidayRequest === 'None') return null;
    
    const parts = profile.nextWeekHolidayRequest.split(':');
    
    // Ensure request is for THIS week based on the Week Start Date
    if (parts[0] !== weekStartString) return null;

    // 1. Weekly Shift Preference Change (Format: WeekStart:ShiftName)
    if (parts.length === 2 && ['Morning', 'Afternoon', 'Night'].includes(parts[1])) {
        return { type: 'ShiftChange', shift: parts[1] };
    }
    
    // 2. Specific Day Off / Duty (Format: WeekStart : StartDate|EndDate : ShiftID : DutyRole)
    if (parts.length === 4) {
        const dateSegment = parts[1];
        let startDate, endDate;
        
        // Handle Range or Single Date
        if (dateSegment.includes('|')) {
            const dates = dateSegment.split('|');
            startDate = dates[0];
            endDate = dates[1];
        } else {
            startDate = dateSegment;
            endDate = dateSegment;
        }

        return { 
            type: 'Specific', 
            startDate: startDate, 
            endDate: endDate, 
            shiftId: parts[2], 
            dutyRole: parts[3] 
        };
    }

    // 3. Leave (Legacy Format: WeekStart:DayName)
    if (parts.length === 2) {
        return { type: 'Leave', day: parts[1] };
    }
    return null;
}

/**
 * Core Function: Decide the shift for ONE staff member on ONE specific day.
 * Uses currentDateString to match against specific date requests.
 */
function calculateDailyShift(staff, day, dayIndex, currentDateString, currentCounts, request) {
    const fixedDayOff = (staff.fixedDayOff || 'None').trim();
    const position = staff.position;
    
    // --- PRIORITY 1: Specific Requests & Leave ---
    if (request) {
        // Handle Date Range Requests
        if (request.type === 'Specific') {
            // Check if the current column's date falls within the requested range
            if (currentDateString >= request.startDate && currentDateString <= request.endDate) {
                
                // Specific Leave Request (Now handles SICK, PERSONAL, HOLIDAY, etc.)
                if (request.shiftId.startsWith('STATUS_')) {
                    // Use the user-provided "dutyRole" text (e.g. "Sick", "Personal")
                    return { shiftId: null, jobRole: request.dutyRole, timeRange: DAY_OFF_MARKER };
                }

                // Specific Shift Assignment
                const shift = SHIFTS[request.shiftId];
                if (shift) {
                    if (request.shiftId == 1) currentCounts.M++;
                    if (request.shiftId == 2) currentCounts.A++;
                    if (request.shiftId == 3) currentCounts.N++;
                    // Use the requested Role (e.g. "M3") but keep standard time for backend calculation
                    return { shiftId: request.shiftId, jobRole: request.dutyRole, timeRange: shift.time };
                }
            }
        }

        // Handle Legacy/Day-Name Requests
        if (request.type === 'Leave' && (request.day === day || request.day === 'Full Week')) {
            return { shiftId: null, jobRole: DAY_OFF_MARKER, timeRange: DAY_OFF_MARKER };
        }
    }

    // --- PRIORITY 2: Fixed Day Off ---
    // Matches against Day Name (e.g., "Fri")
    if (fixedDayOff !== 'None' && fixedDayOff === day) {
        return { shiftId: null, jobRole: 'Day Off (Fixed)', timeRange: DAY_OFF_MARKER };
    }

    // --- PRIORITY 3: Role-Based Assignment (Automatic) ---
    
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

    // 3c. Delivery (FIXED: Job role set to 'Del' for clean display)
    if (position === 'Delivery') {
        const pref = (request && request.type === 'ShiftChange') ? request.shift : staff.shiftPreference;
        if (pref.includes('Morning')) { currentCounts.M++; return { shiftId: 1, jobRole: 'Del', timeRange: SHIFTS[1].time }; }
        currentCounts.A++; return { shiftId: 2, jobRole: 'Del', timeRange: SHIFTS[2].time };
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

    // Fallback if full
    return { shiftId: null, jobRole: DAY_OFF_MARKER, timeRange: DAY_OFF_MARKER };
}

function generateWeeklyRoster(staffProfiles, weekStartDate) {
    // Ensure consistent string format for comparison
    const weekStartString = weekStartDate.toISOString().split('T')[0];
    
    // SORTING: Manager -> Supervisor -> Normal Staff -> Delivery
    const sortedStaff = [...staffProfiles].sort((a, b) => {
        const ranks = { 'Manager': 1, 'Supervisor': 2, 'Normal Staff': 3, 'Delivery': 4 };
        return (ranks[a.position] || 5) - (ranks[b.position] || 5);
    });

    // Structure to hold the result
    const weeklyData = sortedStaff.map(s => ({
        employeeName: s.name,
        employeeId: s.employeeId,
        position: s.position || '', 
        weeklySchedule: [] 
    }));

    // Iterate Day by Day (Columns)
    DAYS_FULL.forEach((day, dayIndex) => {
        
        // 1. Calculate the specific date for this column (e.g., "2025-12-05")
        // We clone the weekStartDate and add the day index
        const d = new Date(weekStartDate);
        d.setUTCDate(d.getUTCDate() + dayIndex); 
        const currentDateString = d.toISOString().split('T')[0];

        // 2. Reset counts for THIS DAY only
        let currentCounts = { M: 0, A: 0, N: 0 };

        // 3. Iterate Staff by Staff for THIS DAY
        weeklyData.forEach((rosterEntry, staffIndex) => {
            const profile = sortedStaff[staffIndex];
            const request = getStaffRequest(profile, weekStartString);
            
            // Calculate the single cell, passing the actual Date String for comparison
            const shiftAssignment = calculateDailyShift(profile, day, dayIndex, currentDateString, currentCounts, request);
            
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