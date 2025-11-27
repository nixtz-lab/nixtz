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
    3: { name: 'Night', time: '22:00-07:00', baseShiftId: 3, required: 'N/A', roles: ['C1', 'C2'] },
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
const NIGHT_SHIFT_ROLES = ['C2', 'C1']; // Roles for Night Normal Staff

/**
 * Utility function to find the next duty based purely on rotational rules and history.
 */
function getNextDuty(staff, dayIndex, shiftId, weeklyRosterMap) {
    const isNightShift = shiftId === 3;
    const availableRoles = isNightShift ? NIGHT_SHIFT_ROLES : DAY_SHIFT_ROLES;
    const employeeId = staff.employeeId;
    
    // Default role assignment if no history exists
    let suggestedRole = availableRoles[0]; 

    if (dayIndex > 0) {
        const prevDayEntry = weeklyRosterMap.get(employeeId).weeklySchedule[dayIndex - 1];
        
        // Check if staff worked the day before and it wasn't a leave day
        if (prevDayEntry.shifts.length > 0 && !prevDayEntry.shifts[0].jobRole.includes('Leave') && !prevDayEntry.shifts[0].jobRole.includes('Day Off')) {
            const prevShift = prevDayEntry.shifts[0];
            const prevShiftId = prevShift.shiftId;
            const prevRole = prevShift.jobRole.split(' ')[0].trim();

            // Only consider rotation if the staff is assigned the SAME shift type
            if (prevShiftId === shiftId && availableRoles.includes(prevRole)) {
                
                // --- Night Shift: 2-Day Rotation (C2, C2, C1, C1, C2, C2...) ---
                if (isNightShift) {
                    const dayBeforePrevEntry = (dayIndex > 1) ? weeklyRosterMap.get(employeeId).weeklySchedule[dayIndex - 2] : null;
                    
                    let prevRoleIsDifferent = true;
                    if (dayBeforePrevEntry && dayBeforePrevEntry.shifts.length > 0 && !dayBeforePrevEntry.shifts[0].jobRole.includes('Leave') && !dayBeforePrevEntry.shifts[0].jobRole.includes('Day Off')) {
                        // If the staff worked the day before the previous day, check the role
                        prevRoleIsDifferent = dayBeforePrevEntry.shifts[0].jobRole.split(' ')[0].trim() !== prevRole;
                    }
                    
                    if (prevRoleIsDifferent) {
                         // It was the first day of the block, time to swap duties for today
                         const currentIndex = availableRoles.indexOf(prevRole);
                         suggestedRole = availableRoles[(currentIndex + 1) % availableRoles.length];
                    } else {
                         // It was the second consecutive day of the same duty, stick to the previous role
                         suggestedRole = prevRole;
                    }
                } 
                
                // --- Day Shift: Daily Rotation (C4 -> C5 -> C3 -> C4) ---
                else {
                    const currentIndex = availableRoles.indexOf(prevRole);
                    suggestedRole = availableRoles[(currentIndex + 1) % availableRoles.length];
                }
            }
        }
    }
    
    return suggestedRole;
}


/**
 * Helper: Distributes random day offs evenly across the week for a group of staff.
 * @param {Array} staffGroup - Array of staff objects.
 * @param {Map} dynamicOffMap - Map to store the assigned off day for each employee ID.
 * @param {number} offset - Optional starting index for day rotation.
 */
function distributeRandomOffs(staffGroup, dynamicOffMap, offset = 0) {
    // Filter for staff who actually need a random off (Fixed Day Off is 'None')
    const staffNeedingOff = staffGroup.filter(s => s.fixedDayOff === 'None');
    
    staffNeedingOff.forEach((staff, index) => {
        // Simple round-robin distribution: Mon, Tue, Wed...
        const dayIndex = (index + offset) % DAYS_FULL.length;
        const assignedDay = DAYS_FULL[dayIndex];
        dynamicOffMap.set(staff.employeeId, assignedDay);
    });
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
    
    // 1. Separate Staff by Group for "Random Day Off" Distribution
    let manager = staffProfiles.find(s => s.position === 'Manager');
    let supervisors = staffProfiles.filter(s => s.position === 'Supervisor').sort((a, b) => a.employeeId.localeCompare(b.employeeId));
    let deliveryDrivers = staffProfiles.filter(s => s.position === 'Delivery').sort((a, b) => a.employeeId.localeCompare(b.employeeId));
    let normalStaff = staffProfiles.filter(s => s.position === 'Normal Staff').sort((a, b) => a.employeeId.localeCompare(b.employeeId)); // Stable sort by ID

    // 2. Assign Random Day Offs (Populate a map of EmployeeID -> DayString)
    const dynamicOffMap = new Map(); // Stores 'Tue', 'Wed', etc. for staff with 'None' fixed off
    
    // Distribute offs for groups separately to ensure coverage isn't wiped out on one day
    distributeRandomOffs(supervisors, dynamicOffMap, 0); // Start Supervisors rotating from Mon
    distributeRandomOffs(deliveryDrivers, dynamicOffMap, 2); // Start Delivery rotating from Wed (offset)
    distributeRandomOffs(normalStaff, dynamicOffMap, 1); // Start Normal Staff rotating from Tue (offset)


    // --- PREPARE POOLS FOR SCHEDULING ---
    let nightPreferencePool = normalStaff.filter(s => s.shiftPreference === 'Night');
    let dayPreferencePool = normalStaff.filter(s => s.shiftPreference !== 'Night');
    let coveragePool = dayPreferencePool; 
    
    // 3. Initial Assignments and Roster Map
    const weeklyRosterMap = new Map(staffProfiles.map(s => [s.employeeId, { ...s, weeklySchedule: new Array(7).fill({ shifts: [] }) }]));
    
    function isScheduled(staffEntry, dayIndex) {
        return staffEntry.weeklySchedule[dayIndex].shifts.length > 0;
    }

    // --- Main Daily Scheduling Loop (DAY-BY-DAY EXECUTION) ---
    DAYS_FULL.forEach((day, dayIndex) => {
        
        // --- Duty tracking for the current day (Reset daily) ---
        const dutyTracker = {
            rolesAssigned: {
                Morning: { C3: 0, C4: 0, C5: 0, C1: 0, Z1: 0, S1: 0 },
                Afternoon: { C3: 0, C4: 0, C5: 0, C1: 0, Z1: 0, S1: 0 },
                Night: { C1: 0, C2: 0, Z1: 0, S1: 0 }
            },
            hasExtendedDeliveryCover: false
        };
        
        // 0. CHECK WEEKLY REQUEST & FIXED/RANDOM DAY OFF (HIGH PRIORITY)
        staffProfiles.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            const request = getWeeklyRequest(staff);
            
            // 0a. Requested Leave Override (Highest Priority)
            if (request.type === 'Leave') {
                const isRequestedDay = request.day === day || request.day === 'Sick Leave';
                const isFullWeek = request.day === 'Full Week';

                if (isRequestedDay || isFullWeek) {
                    const leaveType = isFullWeek ? 'Week Off' : (request.day === 'Sick Leave' ? 'Sick' : 'Requested');
                    staffEntry.weeklySchedule[dayIndex].shifts = [{ shiftId: null, jobRole: `Leave (${leaveType})`, timeRange: 'Full Day', color: '#B91C1C' }];
                    return; 
                }
            } 
            
            // 0b. Day Off Assignment (Fixed OR Random)
            if (!isScheduled(staffEntry, dayIndex)) {
                
                // Check Fixed Day Off
                let isDayOff = (staff.fixedDayOff === day);
                
                // Check Random/Dynamic Day Off (only if fixed is 'None')
                if (!isDayOff && staff.fixedDayOff === 'None') {
                    const assignedRandomDay = dynamicOffMap.get(staff.employeeId);
                    if (assignedRandomDay === day) {
                        isDayOff = true;
                    }
                }

                if (isDayOff) {
                     const roleColor = ROLE_COLORS[staff.position] || ROLE_COLORS['Normal Staff'];
                     staffEntry.weeklySchedule[dayIndex].shifts = [{ 
                         shiftId: null, 
                         jobRole: 'Day Off', 
                         timeRange: 'Full Day', 
                         color: roleColor 
                     }];
                     return;
                }
            }
        });
        
        // 1. Manager Assignment
        if (manager) {
            const pae = weeklyRosterMap.get(manager.employeeId);
            
            if (isScheduled(pae, dayIndex)) { /* Skip assignment */ }
            else {
                pae.weeklySchedule[dayIndex].shifts.push({ shiftId: 1, jobRole: 'Z1 (Mgr)', timeRange: MORNING_TIME, color: ROLE_COLORS['Manager'] });
            }
        }
        
        // 2. Delivery Drivers Assignment
        deliveryDrivers.forEach((driver, index) => {
            const driverEntry = weeklyRosterMap.get(driver.employeeId);
            const otherDriver = deliveryDrivers[1 - index];
            const request = getWeeklyRequest(driver);

            if (isScheduled(driverEntry, dayIndex)) { return; } 

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
        });

        // 3. Supervisors Assignment
        supervisors.forEach(sup => {
            const supEntry = weeklyRosterMap.get(sup.employeeId);
            const request = getWeeklyRequest(sup);

            if (isScheduled(supEntry, dayIndex)) { return; }
            
            const tempShiftPref = (request.type === 'ShiftChange') ? request.shift : sup.shiftPreference;
            
            let shiftId;
            let timeRange;
            
            if (tempShiftPref === 'Morning') { shiftId = 1; timeRange = MORNING_TIME; }
            else if (tempShiftPref === 'Afternoon') { shiftId = 2; timeRange = AFTERNOON_TIME; }
            else { shiftId = 3; timeRange = NIGHT_TIME; } 

            supEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: shiftId, jobRole: 'S1 (Sup)', timeRange: timeRange, color: ROLE_COLORS['Supervisor'] });
        });
        
        // --- Re-establish Duty Tracker Counts After All Priority Assignments ---
        staffProfiles.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            if (isScheduled(staffEntry, dayIndex)) {
                const shift = staffEntry.weeklySchedule[dayIndex].shifts[0];
                if (!shift.jobRole.includes('Leave') && !shift.jobRole.includes('Day Off')) {
                    
                    const jobRoleParts = shift.jobRole.split(' ');
                    const baseDuty = jobRoleParts[0];
                    const shiftId = shift.shiftId;
                    
                    if (shiftId === 1 || shiftId === 2) {
                        const shiftKey = shiftId === 1 ? 'Morning' : 'Afternoon';
                        if (dutyTracker.rolesAssigned[shiftKey][baseDuty] !== undefined) {
                            dutyTracker.rolesAssigned[shiftKey][baseDuty]++;
                        } else if (baseDuty === 'S1') {
                            dutyTracker.rolesAssigned[shiftKey].S1++;
                        } else if (baseDuty === 'Z1') {
                            dutyTracker.rolesAssigned[shiftKey].Z1++;
                        }
                    } else if (shiftId === 3) { // Night
                        if (dutyTracker.rolesAssigned.Night[baseDuty] !== undefined) {
                            dutyTracker.rolesAssigned.Night[baseDuty]++;
                        } else if (baseDuty === 'S1') {
                            dutyTracker.rolesAssigned.Night.S1++;
                        } else if (baseDuty === 'Z1') {
                            dutyTracker.rolesAssigned.Night.Z1++;
                        }
                    }
                }
            }
        });
        
        
        // 5. Normal Staff Assignment (Morning/Afternoon/Night) with DUTY ROTATION
        
        const requiredMorning = SHIFTS[1].required; // 6
        const requiredAfternoon = SHIFTS[2].required; // 5
        
        // --- QUOTA REQUIREMENTS ---
        const requiredNightC1_NS = 1; // Required Normal Staff C1 duty
        const requiredNightC2_NS = 1; // Required Normal Staff C2 duty
        
        // --- Initialize mutable quota tracking variables ---
        let neededMorningC3 = 1 - dutyTracker.rolesAssigned.Morning.C3; 
        let neededMorningC4 = 1; 
        let neededMorningC5 = 1; 
        
        let neededAfternoonC3 = 1 - dutyTracker.rolesAssigned.Afternoon.C3;
        let neededAfternoonC4 = 1;
        let neededAfternoonC5 = dutyTracker.hasExtendedDeliveryCover ? 0 : 1; 

        // Deficit calculation for Night Staff duties
        // FIX: We rely ONLY on Normal Staff quotas (C1/C2) being met, irrespective of S1/Z1 presence.
        let neededNightC1_NS_Pool = requiredNightC1_NS - dutyTracker.rolesAssigned.Night.C1; 
        let neededNightC2_NS_Pool = requiredNightC2_NS - dutyTracker.rolesAssigned.Night.C2; 
        
        
        // Recalculate current staff counts for the loop
        let currentMorningCount = staffProfiles.filter(s => isScheduled(weeklyRosterMap.get(s.employeeId), dayIndex) && weeklyRosterMap.get(s.employeeId).weeklySchedule[dayIndex].shifts[0].shiftId === 1).length;
        let currentAfternoonCount = staffProfiles.filter(s => isScheduled(weeklyRosterMap.get(s.employeeId), dayIndex) && weeklyRosterMap.get(s.employeeId).weeklySchedule[dayIndex].shifts[0].shiftId === 2).length;
        
        // Sort coverage pool by preference (Morning > Afternoon > Night)
        coveragePool.sort((a, b) => {
            const order = { 'Morning': 1, 'Afternoon': 2, 'Night': 3, 'None': 4 };
            return (order[a.shiftPreference] || 4) - (order[b.shiftPreference] || 4);
        });

        // FIX: Prioritize Night Preference Pool first for Night Shift assignment
        let schedulingPool = [
            ...nightPreferencePool.filter(staff => !isScheduled(weeklyRosterMap.get(staff.employeeId), dayIndex)),
            ...dayPreferencePool.filter(staff => !isScheduled(weeklyRosterMap.get(staff.employeeId), dayIndex))
        ];

        schedulingPool.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            
            if (isScheduled(staffEntry, dayIndex)) return; 
            
            const request = getWeeklyRequest(staff);
            const tempShiftPref = (request.type === 'ShiftChange') ? request.shift : staff.shiftPreference;
            
            let assigned = false;
            
            // --- C0. Attempt Night Shift Assignment (ID 3) ---
            if (tempShiftPref === 'Night') { 
                
                const duty = getNextDuty(staff, dayIndex, 3, weeklyRosterMap);
                
                // 1. Assign C2 if needed
                if (duty === 'C2' && neededNightC2_NS_Pool > 0) { 
                    staffEntry.weeklySchedule[dayIndex].shifts.push({ 
                        shiftId: 3, 
                        jobRole: 'C2', 
                        timeRange: NIGHT_TIME 
                    });
                    dutyTracker.rolesAssigned.Night.C2++;
                    neededNightC2_NS_Pool--;
                    assigned = true;
                } 
                // 2. Assign C1 if needed
                else if (duty === 'C1' && neededNightC1_NS_Pool > 0) {
                     staffEntry.weeklySchedule[dayIndex].shifts.push({ 
                        shiftId: 3, 
                        jobRole: 'C1', 
                        timeRange: NIGHT_TIME 
                    });
                    dutyTracker.rolesAssigned.Night.C1++;
                    neededNightC1_NS_Pool--;
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
                    let jobRole = getNextDuty(staff, dayIndex, targetShiftId, weeklyRosterMap);
                    
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

                    assigned = true;
                }
            }
            
            // --- C. Assign Day Off if all quotas are met for both shifts ---
            if (!assigned) {
                // No auto-off for leave request days logic needed here, as Step 0 handles that.
                // If we are here, the staff wasn't assigned.
                staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: null, jobRole: 'Day Off', timeRange: 'Full Day' });
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