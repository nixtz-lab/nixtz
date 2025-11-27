// staff_roster_generator_be.js

// ... (Lines 1-177 unchanged)

    // --- Main Daily Scheduling Loop (DAY-BY-DAY EXECUTION) ---
    DAYS_FULL.forEach((day, dayIndex) => {
        
        // --- Duty tracking for the current day ---
        // This is ONLY used for tracking C3/C4/C5/C1/C2 assignments to check quotas
        const dutyTracker = {
            rolesAssigned: {
                Morning: { C3: 0, C4: 0, C5: 0, C1: 0 },
                Afternoon: { C3: 0, C4: 0, C5: 0, C1: 0 },
                Night: { C1: 0, C2: 0 }
            },
            hasExtendedDeliveryCover: false
        };
        
        // 0. CHECK WEEKLY REQUEST & FIXED DAY OFF OVERRIDE (HIGH PRIORITY) - NO DUTY YET
        staffProfiles.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            const request = getWeeklyRequest(staff);
            
            // 0a. Requested Leave Override (Highest Priority)
            if (request.type === 'Leave') {
                // ... (Logic remains unchanged for Requested Leave)
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
            
            // 0b. Fixed Day Off Assignment (If not already scheduled, and only on the matching day)
            if (!isScheduled(staffEntry, dayIndex)) {
                
                if (staff.fixedDayOff === day) {
                     const roleColor = ROLE_COLORS[staff.position] || ROLE_COLORS['Normal Staff'];
                     staffEntry.weeklySchedule[dayIndex].shifts = [{ 
                         shiftId: null, 
                         // --- FIX 1: Rename the label to "Day Off" ---
                         jobRole: 'Day Off', 
                         timeRange: 'Full Day', 
                         color: roleColor 
                     }];
                     // Fixed Day Off is assigned, skip to next staff member.
                     return;
                }
            }
        });
        
        // --- Re-establish Duty Tracker Counts from Priority Assignments (0, 1, 2, 3) ---
        // This block now runs AFTER the Fixed Day Off is applied, so it accounts for Day Offs.
        staffProfiles.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            if (isScheduled(staffEntry, dayIndex)) {
                const shift = staffEntry.weeklySchedule[dayIndex].shifts[0];
                if (!shift.jobRole.includes('Leave') && !shift.jobRole.includes('Day Off')) { // Check for "Day Off" as well
                    if (shift.shiftId === 1) { // Morning
                        if (shift.jobRole.includes('C1')) dutyTracker.rolesAssigned.Morning.C1++;
                        if (shift.jobRole.includes('C3')) dutyTracker.rolesAssigned.Morning.C3++;
                        if (shift.jobRole.includes('C4')) dutyTracker.rolesAssigned.Morning.C4++;
                        if (shift.jobRole.includes('C5')) dutyTracker.rolesAssigned.Morning.C5++;
                    } else if (shift.shiftId === 2) { // Afternoon
                        if (shift.jobRole.includes('C1')) dutyTracker.rolesAssigned.Afternoon.C1++;
                        if (shift.jobRole.includes('C3')) dutyTracker.rolesAssigned.Afternoon.C3++;
                        if (shift.jobRole.includes('C4')) dutyTracker.rolesAssigned.Afternoon.C4++;
                        if (shift.jobRole.includes('C5')) dutyTracker.rolesAssigned.Afternoon.C5++;
                    } else if (shift.shiftId === 3) { // Night
                        if (shift.jobRole.includes('C1')) dutyTracker.rolesAssigned.Night.C1++;
                        if (shift.jobRole.includes('C2')) dutyTracker.rolesAssigned.Night.C2++;
                    }
                }
            }
        });
        
        // 1. Manager (Step 1 assignment must run after Fixed Day Off check)
        if (manager) {
            const pae = weeklyRosterMap.get(manager.employeeId);
            
            // CRITICAL CHECK: Skip if Manager is already scheduled (Leave/Day Off/Fixed Day Off)
            if (isScheduled(pae, dayIndex)) { /* Skip assignment */ }
            else {
                // Manager default assignment
                pae.weeklySchedule[dayIndex].shifts.push({ shiftId: 1, jobRole: 'C1 (Mgr)', timeRange: MORNING_TIME, color: ROLE_COLORS['Manager'] });
                dutyTracker.rolesAssigned.Morning.C1++; 
            }
        }

        // 2. Delivery Drivers
        deliveryDrivers.forEach((driver, index) => {
             // ... (Delivery logic unchanged) ...
            const driverEntry = weeklyRosterMap.get(driver.employeeId);
            const otherDriver = deliveryDrivers[1 - index];
            const request = getWeeklyRequest(driver);

            if (isScheduled(driverEntry, dayIndex)) { 
                if (driverEntry.weeklySchedule[dayIndex].shifts.length > 0 && !driverEntry.weeklySchedule[dayIndex].shifts[0].jobRole.includes('Leave') && !driverEntry.weeklySchedule[dayIndex].shifts[0].jobRole.includes('Day Off')) {
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
        
        
        // 5. Normal Staff Assignment (Morning/Afternoon/Night) with DUTY ROTATION
        
        const requiredMorning = SHIFTS[1].required; // 6
        const requiredAfternoon = SHIFTS[2].required; // 5
        const requiredNight = 2; // Fixed requirement of 2 Night staff (C1+C2)

        // --- Initialize mutable quota tracking variables (Total required minus C1 roles) ---
        let neededMorningC3 = 1 - dutyTracker.rolesAssigned.Morning.C3; 
        let neededMorningC4 = 1; 
        let neededMorningC5 = 1; 
        
        let neededAfternoonC3 = 1 - dutyTracker.rolesAssigned.Afternoon.C3;
        let neededAfternoonC4 = 1;
        let neededAfternoonC5 = dutyTracker.hasExtendedDeliveryCover ? 0 : 1; 

        let neededNightC2 = requiredNight - (dutyTracker.rolesAssigned.Night.C1 + dutyTracker.rolesAssigned.Night.C2); 
        
        
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
                const duty = getNextDuty(staff, dayIndex, 3, weeklyRosterMap);
                
                // Only assign if the duty is C2 and quota is available
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
                    let jobRole = getNextDuty(staff, dayIndex, targetShiftId, weeklyRosterMap);
                    
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

module.exports = { generateWeeklyRoster };