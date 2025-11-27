// staff_roster_generator_be.js

/**
 * CRITICAL CHANGE: Removed hardcoded shift times.
 * This structure now only defines fixed ID, Name, Roles, and Required Counts.
 * The time strings used within the generation logic (e.g., '08:00-17:00') 
 * MUST match the dynamic times saved on the frontend for consistency.
 */
const SHIFTS = { 
    // ID 1: Morning Shift
    1: { name: 'Morning', time: 'DYNAMIC_TIME_1', roles: ['C1', 'C4', 'C3'], required: 6 }, 
    // ID 2: Afternoon Shift
    2: { name: 'Afternoon', time: 'DYNAMIC_TIME_2', roles: ['C1', 'C5', 'C3'], required: 5 }, 
    // ID 3: Night Shift
    3: { name: 'Night', time: 'DYNAMIC_TIME_3', roles: ['C1', 'C2'], required: 'N/A' }
};

// Colors for easy identification on the frontend
const ROLE_COLORS = {
    'Manager': '#FF0000',      
    'Supervisor': '#FF0000',   
    'Delivery': '#00B0F0',     
    'Normal Staff': '#FFFFFF'  
};

const DAYS_FULL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Define roles for rotation
const DAY_SHIFT_ROLES = ['C4', 'C5', 'C3']; // Roles for Morning/Afternoon Normal Staff
const NIGHT_SHIFT_ROLES = ['C2', 'C1']; // Roles for Night Normal Staff (C2 then C1, for simpler rotation logic)

/**
 * Utility function to find the next available duty for rotation based on the previous day.
 * Implements: Daily rotation for Day Shifts (C4/C5/C3) and 2-day rotation swap for Night Shifts (C1/C2).
 */
function getNextDuty(staff, dayIndex, shiftId, dutyTracker, weeklyRosterMap) {
    const isNightShift = shiftId === 3;
    const availableRoles = isNightShift ? NIGHT_SHIFT_ROLES : DAY_SHIFT_ROLES;
    const employeeId = staff.employeeId;
    
    // Default role assignment if no history exists (C4/C2)
    let suggestedRole = isNightShift ? 'C2' : 'C4'; 

    if (dayIndex > 0) {
        const prevDayEntry = weeklyRosterMap.get(employeeId).weeklySchedule[dayIndex - 1];
        
        if (prevDayEntry.shifts.length > 0) {
            const prevShift = prevDayEntry.shifts[0];
            const prevShiftId = prevShift.shiftId;
            const prevRole = prevShift.jobRole.split(' ')[0].trim(); // Get 'C1', 'C4', etc.

            // Only rotate if the staff is assigned the same shift type (Morning/Afternoon/Night)
            if (prevShiftId === shiftId && availableRoles.includes(prevRole)) {
                
                // --- Night Shift: Swap every 2 days (C2 <-> C1) ---
                if (isNightShift) {
                    const currentIndex = availableRoles.indexOf(prevRole);
                    const nextIndex = (currentIndex + 1) % availableRoles.length;
                    const nextRole = availableRoles[nextIndex];
                    
                    // Check if the previous day was the same role. If so, swap.
                    const dayBeforePrevEntry = (dayIndex > 1) ? weeklyRosterMap.get(employeeId).weeklySchedule[dayIndex - 2] : null;
                    const prevRoleIsDifferent = !dayBeforePrevEntry || dayBeforePrevEntry.shifts.length === 0 || dayBeforePrevEntry.shifts[0].jobRole.split(' ')[0].trim() !== prevRole;
                    
                    if (prevRoleIsDifferent) {
                         // Day 2 of the 2-day sequence, so swap duty
                         suggestedRole = nextRole;
                    } else {
                         // Day 1 of the 2-day sequence, or shortage retention: stick to previous role.
                         suggestedRole = prevRole;
                    }
                } 
                
                // --- Day Shift: Rotate daily (C4 -> C5 -> C3 -> C4) ---
                else {
                    const currentIndex = availableRoles.indexOf(prevRole);
                    const nextIndex = (currentIndex + 1) % availableRoles.length;
                    const nextRole = availableRoles[nextIndex];
                    
                    // Simple Daily Rotation (If the next role is free, take it)
                    if (dutyTracker.rolesAssigned.Day[nextRole] === undefined || dutyTracker.rolesAssigned.Day[nextRole] < 1) {
                        suggestedRole = nextRole;
                    } else {
                        // Shortage: Stick to the previous role for a second day
                        suggestedRole = prevRole;
                    }
                }
            }
        }
    }
    
    return suggestedRole;
}


/**
 * Generates a weekly roster based on the current staff profiles and fixed day off rules.
 * @param {Array} staffProfiles - List of staff fetched from the database.
 * @param {Date} weekStartDate - The Monday start date of the week to generate.
 */
function generateWeeklyRoster(staffProfiles, weekStartDate) {
    
    const MORNING_TIME = SHIFTS[1].time || '07:00-16:00';
    const AFTERNOON_TIME = SHIFTS[2].time || '13:30-22:30';
    const NIGHT_TIME = SHIFTS[3].time || '22:00-07:00';
    
    const weekStartString = weekStartDate.toISOString().split('T')[0]; 

    // --- Utility function to check and extract request (Unchanged) ---
    function getWeeklyRequest(profile) {
        
        if (profile.nextWeekHolidayRequest === 'None' || !profile.nextWeekHolidayRequest || typeof profile.nextWeekHolidayRequest !== 'string') {
            return { type: 'None' };
        }
        
        const parts = profile.nextWeekHolidayRequest.split(':');
        
        if (parts.length !== 2) {
            return { type: 'None' };
        }
        
        const [requestWeek, requestValue] = parts;

        if (requestWeek < weekStartString) {
             return { type: 'None' };
        }
        
        if (requestWeek === weekStartString) {
            // Check for specific days, full week, or the new 'Sick Leave' type
            if (DAYS_FULL.includes(requestValue) || requestValue === 'Full Week' || requestValue === 'Sick Leave') {
                 return { type: 'Leave', day: requestValue };
            } 
            else if (['Morning', 'Afternoon', 'Night'].includes(requestValue)) {
                return { type: 'ShiftChange', shift: requestValue };
            }
        }
        
        return { type: 'None' };
    }
    
    // Filter staff into specific functional groups based on the profiles
    let manager = staffProfiles.find(s => s.position === 'Manager');
    let supervisors = staffProfiles.filter(s => s.position === 'Supervisor').sort((a, b) => a.shiftPreference.localeCompare(b.shiftPreference));
    let deliveryDrivers = staffProfiles.filter(s => s.position === 'Delivery').sort((a, b) => a.fixedDayOff.localeCompare(b.fixedDayOff));
    
    // --- NIGHT ROTATION REMOVAL FIX ---
    let allNormalStaff = staffProfiles.filter(s => s.position === 'Normal Staff');
    // All normal staff are now in the coverage pool.
    let coveragePool = allNormalStaff; 
    // --- END FIX ---
    
    
    // 1. Initial Assignments and Roster Map: Use employeeId as the map key
    const weeklyRosterMap = new Map(staffProfiles.map(s => [s.employeeId, { ...s, weeklySchedule: new Array(7).fill({ shifts: [] }) }]));
    
    // --- Utility to check if a staff member is already assigned a shift or leave ---
    function isScheduled(staffEntry, dayIndex) {
        return staffEntry.weeklySchedule[dayIndex].shifts.length > 0;
    }

    // --- Main Daily Scheduling Loop ---
    DAYS_FULL.forEach((day, dayIndex) => {
        
        // --- Duty tracking for the current day ---
        // Track the specific roles assigned for the current day across M/A/N shifts.
        const dutyTracker = {
            rolesAssigned: {
                Morning: { C3: 0, C4: 0, C5: 0, C1: 0 }, // C1 added for clarity
                Afternoon: { C3: 0, C4: 0, C5: 0, C1: 0 }, // C1 added for clarity
                Night: { C1: 0, C2: 0 }
            },
            hasExtendedDeliveryCover: false
        };
        
        // 0. CHECK WEEKLY REQUEST & FIXED DAY OFF OVERRIDE (HIGH PRIORITY)
        staffProfiles.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            const request = getWeeklyRequest(staff);
            
            // 0a. Requested Leave Override (Highest Priority)
            if (request.type === 'Leave') {
                
                const isRequestedDay = request.day === day || request.day === 'Sick Leave';
                const isFullWeek = request.day === 'Full Week';

                if (isRequestedDay || isFullWeek) {
                    const leaveType = isFullWeek ? 'Week Off' : (request.day === 'Sick Leave' ? 'Sick' : 'Requested');
                    
                    staffEntry.weeklySchedule[dayIndex].shifts = [{ 
                        shiftId: null, 
                        jobRole: `Leave (${leaveType})`, 
                        timeRange: 'Full Day', 
                        color: '#B91C1C' 
                    }];
                    return; 
                }
            } 
            
            // 0b. Fixed Day Off Assignment (If not already scheduled)
            if (!isScheduled(staffEntry, dayIndex)) {
                
                if (staff.fixedDayOff === day) {
                     const roleColor = ROLE_COLORS[staff.position] || ROLE_COLORS['Normal Staff'];
                     staffEntry.weeklySchedule[dayIndex].shifts = [{ 
                         shiftId: null, 
                         jobRole: 'Leave (Fixed)', 
                         timeRange: 'Full Day', 
                         color: roleColor 
                     }];
                     return;
                }
            }
        });
        
        // 1. Manager 
        if (manager) {
            const pae = weeklyRosterMap.get(manager.employeeId);
            
            if (isScheduled(pae, dayIndex)) { /* Skip assignment */ }
            else {
                pae.weeklySchedule[dayIndex].shifts.push({ shiftId: 1, jobRole: 'C1 (Mgr)', timeRange: MORNING_TIME, color: ROLE_COLORS['Manager'] });
                dutyTracker.rolesAssigned.Morning.C1++; 
            }
        }

        // 2. Delivery Drivers
        deliveryDrivers.forEach((driver, index) => {
            const driverEntry = weeklyRosterMap.get(driver.employeeId);
            const otherDriver = deliveryDrivers[1 - index];
            const request = getWeeklyRequest(driver);

            if (isScheduled(driverEntry, dayIndex)) { 
                if (driverEntry.weeklySchedule[dayIndex].shifts.length > 0) {
                    const shift = driverEntry.weeklySchedule[dayIndex].shifts[0];
                    if (shift.jobRole.includes('C3')) {
                        if (shift.shiftId === 1) dutyTracker.rolesAssigned.Morning.C3++;
                        if (shift.shiftId === 2) dutyTracker.rolesAssigned.Afternoon.C3++;
                    }
                }
                return; 
            }

            const tempShiftPref = (request.type === 'ShiftChange') ? request.shift : driver.shiftPreference; 
            
            let shiftDetails;
            let jobRole = 'C3 (Del)';

            if (tempShiftPref.includes('Morning')) {
                shiftDetails = { id: 1, time: MORNING_TIME };
            } else {
                shiftDetails = { id: 2, time: AFTERNOON_TIME };
            }

            if (otherDriver && otherDriver.fixedDayOff === day) {
                jobRole = 'C3 (Del Cov)';
                driverEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: 1, jobRole: jobRole, timeRange: '07:00-21:00', color: ROLE_COLORS['Delivery'] });
                dutyTracker.hasExtendedDeliveryCover = true; 
            } else {
                driverEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: shiftDetails.id, jobRole: jobRole, timeRange: shiftDetails.time, color: ROLE_COLORS['Delivery'] });
            }
        
            const shiftId = driverEntry.weeklySchedule[dayIndex].shifts[0].shiftId;
            if (shiftId === 1) dutyTracker.rolesAssigned.Morning.C3++;
            if (shiftId === 2) dutyTracker.rolesAssigned.Afternoon.C3++;
        });

        // 3. Supervisors
        supervisors.forEach(sup => {
            const supEntry = weeklyRosterMap.get(sup.employeeId);
            const request = getWeeklyRequest(sup);

            if (isScheduled(supEntry, dayIndex)) { return; }
            
            const tempShiftPref = (request.type === 'ShiftChange') ? request.shift : sup.shiftPreference;
            
            let shiftId;
            let timeRange;
            
            if (tempShiftPref === 'Morning') { shiftId = 1; timeRange = MORNING_TIME; dutyTracker.rolesAssigned.Morning.C1++; }
            else if (tempShiftPref === 'Afternoon') { shiftId = 2; timeRange = AFTERNOON_TIME; dutyTracker.rolesAssigned.Afternoon.C1++; }
            else { shiftId = 3; timeRange = NIGHT_TIME; dutyTracker.rolesAssigned.Night.C1++; } 

            supEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: shiftId, jobRole: 'C1 (Sup)', timeRange: timeRange, color: ROLE_COLORS['Supervisor'] });
        });

        // --- STEP 4 REMOVED ---
        
        // 5. Normal Staff Assignment (Morning/Afternoon/Night) with DUTY ROTATION
        
        // Define quotas for Normal Staff roles that need to be filled.
        const requiredMorning = SHIFTS[1].required; // 6
        const requiredAfternoon = SHIFTS[2].required; // 5
        const requiredNight = 2; // Fixed requirement of 2 Night staff

        // --- FIX: Initialize mutable quota tracking variables ---
        let neededMorningC3 = 1 - dutyTracker.rolesAssigned.Morning.C3; 
        let neededMorningC4 = 1; 
        let neededMorningC5 = 1; 
        
        let neededAfternoonC3 = 1 - dutyTracker.rolesAssigned.Afternoon.C3;
        let neededAfternoonC4 = 1;
        let neededAfternoonC5 = dutyTracker.hasExtendedDeliveryCover ? 0 : 1; 

        let neededNightC2 = requiredNight - (dutyTracker.rolesAssigned.Night.C1 + dutyTracker.rolesAssigned.Night.C2); // Total night spots minus C1 already covered
        // --- END FIX ---
        
        
        // Recalculate current staff counts for the loop
        let currentMorningCount = staffProfiles.filter(s => isScheduled(weeklyRosterMap.get(s.employeeId), dayIndex) && weeklyRosterMap.get(s.employeeId).weeklySchedule[dayIndex].shifts[0].shiftId === 1).length;
        let currentAfternoonCount = staffProfiles.filter(s => isScheduled(weeklyRosterMap.get(s.employeeId), dayIndex) && weeklyRosterMap.get(s.employeeId).weeklySchedule[dayIndex].shifts[0].shiftId === 2).length;
        let currentNightCount = staffProfiles.filter(s => isScheduled(weeklyRosterMap.get(s.employeeId), dayIndex) && weeklyRosterMap.get(s.employeeId).weeklySchedule[dayIndex].shifts[0].shiftId === 3).length;

        // Sort coverage pool by preference (Morning > Afternoon > Night)
        coveragePool.sort((a, b) => {
            const order = { 'Morning': 1, 'Afternoon': 2, 'Night': 3, 'None': 4 };
            return (order[a.shiftPreference] || 4) - (order[b.shiftPreference] || 4);
        });


        coveragePool.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            
            if (isScheduled(staffEntry, dayIndex)) return; 
            
            const request = getWeeklyRequest(staff);
            const tempShiftPref = (request.type === 'ShiftChange') ? request.shift : staff.shiftPreference;
            
            let assigned = false;
            
            // --- C0. Attempt Night Shift Assignment (ID 3) ---
            if (tempShiftPref === 'Night' && neededNightC2 > 0) { 
                
                // Determine duty using rotation logic
                const duty = getNextDuty(staff, dayIndex, 3, dutyTracker, weeklyRosterMap);
                
                // Only assign C2 duty to normal staff
                if (duty === 'C2') { 
                    staffEntry.weeklySchedule[dayIndex].shifts.push({ 
                        shiftId: 3, 
                        jobRole: 'C2', 
                        timeRange: NIGHT_TIME 
                    });
                    currentNightCount++;
                    dutyTracker.rolesAssigned.Night.C2++;
                    neededNightC2--;
                    assigned = true;
                }
            }


            // --- A/B. Attempt Morning/Afternoon Assignment (ID 1/2) ---
            if (!assigned) {
                let targetShiftId = null;
                let targetShiftTime = null;
                
                // Determine which shift to assign based on preference and capacity
                const prioritizeMorning = tempShiftPref === 'Morning' || (currentMorningCount < currentAfternoonCount && currentMorningCount < requiredMorning);
                
                if (prioritizeMorning && currentMorningCount < requiredMorning) {
                    targetShiftId = 1;
                    targetShiftTime = MORNING_TIME;
                } else if (currentAfternoonCount < requiredAfternoon) {
                    targetShiftId = 2;
                    targetShiftTime = AFTERNOON_TIME;
                }
                
                if (targetShiftId !== null) {
                    let jobRole = getNextDuty(staff, dayIndex, targetShiftId, dutyTracker, weeklyRosterMap);
                    
                    let targetRolesAssigned = (targetShiftId === 1) ? dutyTracker.rolesAssigned.Morning : dutyTracker.rolesAssigned.Afternoon;

                    // Override rotation if a critical role (C3/C5) is needed and decrement mutable counter
                    if (targetShiftId === 1 && neededMorningC3 > 0) {
                        jobRole = 'C3';
                        neededMorningC3--;
                    } else if (targetShiftId === 2 && neededAfternoonC3 > 0) {
                        jobRole = 'C3';
                        neededAfternoonC3--;
                    } else if (targetShiftId === 1 && neededMorningC5 > 0) {
                        jobRole = 'C5';
                        neededMorningC5--;
                    } else if (targetShiftId === 2 && neededAfternoonC5 > 0) {
                        jobRole = 'C5';
                        neededAfternoonC5--;
                    } else {
                        // If rotation suggested C3 or C5 but quota is full, default back to C4 for remaining spots
                        if (jobRole === 'C3' || jobRole === 'C5' || !DAY_SHIFT_ROLES.includes(jobRole)) {
                            jobRole = 'C4'; 
                        }
                    }
                    
                    staffEntry.weeklySchedule[dayIndex].shifts.push({ 
                        shiftId: targetShiftId, 
                        jobRole: jobRole, 
                        timeRange: targetShiftTime 
                    });
                    
                    if (targetShiftId === 1) currentMorningCount++;
                    if (targetShiftId === 2) currentAfternoonCount++;

                    targetRolesAssigned[jobRole] = (targetRolesAssigned[jobRole] || 0) + 1;
                    assigned = true;
                }
            }
            
            // --- C. Assign Day Off if all quotas are met for both shifts ---
            if (!assigned) {
                
                const hasSingleDayLeaveRequest = request.type === 'Leave' && request.day !== 'Full Week';

                if (!hasSingleDayLeaveRequest) {
                    staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: null, jobRole: 'Leave (Auto Off)', timeRange: 'Full Day' });
                }
            }
        });

    }); // End of DAYS_FULL.forEach

    // Final Formatting - ATTACH POSITION FOR FRONTEND SORTING
    return Array.from(weeklyRosterMap.values()).map(staff => ({
        employeeName: staff.name,
        employeeId: staff.employeeId, // Retain ID for the roster entry
        position: staff.position, 
        weeklySchedule: staff.weeklySchedule.map((daySchedule, index) => ({
            dayOfWeek: DAYS_FULL[index],
            shifts: daySchedule.shifts
        }))
    }));
}

module.exports = { generateWeeklyRoster };