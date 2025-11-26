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

    // --- Utility function to check and extract request ---
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
    
    // Split Normal Staff into Rotators (Night) and General Coverage
    let allNormalStaff = staffProfiles.filter(s => s.position === 'Normal Staff');
    let nightStaffPool = allNormalStaff.filter(s => s.isNightRotator);
    let coveragePool = allNormalStaff.filter(s => !s.isNightRotator);
    
    
    // 1. Initial Assignments and Roster Map: Use employeeId as the map key
    const weeklyRosterMap = new Map(staffProfiles.map(s => [s.employeeId, { ...s, weeklySchedule: new Array(7).fill({ shifts: [] }) }]));
    
    // --- Utility to check if a staff member is already assigned a shift or leave ---
    function isScheduled(staffEntry, dayIndex) {
        return staffEntry.weeklySchedule[dayIndex].shifts.length > 0;
    }

    // --- Main Daily Scheduling Loop ---
    DAYS_FULL.forEach((day, dayIndex) => {
        
        // --- Role tracking for the current day ---
        const morningShiftRolesAssigned = { C3: 0, C4: 0, C5: 0 };
        const afternoonShiftRolesAssigned = { C3: 0, C4: 0, C5: 0 };
        let hasExtendedDeliveryCover = false;
        // ----------------------------------------
        
        // 0. CHECK WEEKLY REQUEST & FIXED DAY OFF OVERRIDE (HIGH PRIORITY)
        staffProfiles.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            const request = getWeeklyRequest(staff);
            
            // 0a. Requested Leave Override
            if (request.type === 'Leave') {
                
                // CRITICAL FIX START: Check for requested day, full week, or specific leave type
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
                    // If staff has a valid request applied today, stop here for this staff member,
                    // but continue the outer loop to check other staff.
                    return; 
                }
                // CRITICAL FIX END: If a single-day request is active but does not match the current day,
                // the staff member is available for scheduling (Steps 1-5).
            } 
            
            // 0b. Fixed Day Off Assignment (Only assign if not already scheduled)
            // CHECK 1: Ensure staff is NOT already scheduled by a previous step (i.e., not a requested day off or a shift)
            if (!isScheduled(staffEntry, dayIndex)) {
                
                // CHECK 2: Is today their fixed day off?
                if (staff.fixedDayOff === day) {
                     const roleColor = ROLE_COLORS[staff.position] || ROLE_COLORS['Normal Staff'];
                     staffEntry.weeklySchedule[dayIndex].shifts = [{ 
                         shiftId: null, 
                         jobRole: 'Leave (Fixed)', 
                         timeRange: 'Full Day', 
                         color: roleColor 
                     }];
                     // Fixed Day Off is assigned, skip to next staff member.
                     return;
                }
            }
        });
        
        // 1. Manager 
        if (manager) {
            const pae = weeklyRosterMap.get(manager.employeeId);
            
            // CRITICAL CHECK: Skip if Manager is already scheduled (Leave/Fixed Day Off)
            if (isScheduled(pae, dayIndex)) { /* Skip assignment */ }
            else {
                // Manager default assignment
                pae.weeklySchedule[dayIndex].shifts.push({ shiftId: 1, jobRole: 'C1 (Mgr)', timeRange: MORNING_TIME, color: ROLE_COLORS['Manager'] });
            }
        }

        // 2. Delivery Drivers
        deliveryDrivers.forEach((driver, index) => {
            const driverEntry = weeklyRosterMap.get(driver.employeeId);
            const otherDriver = deliveryDrivers[1 - index];
            const request = getWeeklyRequest(driver);

            // CRITICAL CHECK: Skip if Driver is already scheduled (Leave/Fixed Day Off)
            if (isScheduled(driverEntry, dayIndex)) { 
                // If they are scheduled with a shift (not Leave), count C3
                if (driverEntry.weeklySchedule[dayIndex].shifts.length > 0 && driverEntry.weeklySchedule[dayIndex].shifts[0].jobRole.includes('C3')) {
                    const shiftId = driverEntry.weeklySchedule[dayIndex].shifts[0].shiftId;
                    if (shiftId === 1) morningShiftRolesAssigned.C3++;
                    if (shiftId === 2) afternoonShiftRolesAssigned.C3++;
                }
                return; 
            }

            // Assign shift if not on leave
            const tempShiftPref = (request.type === 'ShiftChange') ? request.shift : driver.shiftPreference; 
            
            let shiftDetails;
            let jobRole = 'C3 (Del)';

            // Determine if using CORE shift 1 or 2 times
            if (tempShiftPref.includes('Morning')) {
                shiftDetails = { id: 1, time: MORNING_TIME };
            } else {
                shiftDetails = { id: 2, time: AFTERNOON_TIME };
            }

            if (otherDriver && otherDriver.fixedDayOff === day) {
                // If covering a fellow driver, use an extended shift time
                jobRole = 'C3 (Del Cov)';
                driverEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: 1, jobRole: jobRole, timeRange: '07:00-21:00', color: ROLE_COLORS['Delivery'] });
                hasExtendedDeliveryCover = true; // Set flag
            } else {
                driverEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: shiftDetails.id, jobRole: jobRole, timeRange: shiftDetails.time, color: ROLE_COLORS['Delivery'] });
            }
        
            // Track C3 assignment from the dedicated Delivery Drivers
            const shiftId = driverEntry.weeklySchedule[dayIndex].shifts[0].shiftId;
            if (shiftId === 1) morningShiftRolesAssigned.C3++;
            if (shiftId === 2) afternoonShiftRolesAssigned.C3++;
        });

        // 3. Supervisors
        supervisors.forEach(sup => {
            const supEntry = weeklyRosterMap.get(sup.employeeId);
            const request = getWeeklyRequest(sup);

            // CRITICAL CHECK: Skip if Supervisor is already scheduled (Leave/Fixed Day Off)
            if (isScheduled(supEntry, dayIndex)) { return; }
            
            const tempShiftPref = (request.type === 'ShiftChange') ? request.shift : sup.shiftPreference;
            
            // Assign shift if not on leave
            let shiftId;
            let timeRange;
            
            if (tempShiftPref === 'Morning') { shiftId = 1; timeRange = MORNING_TIME; }
            else if (tempShiftPref === 'Afternoon') { shiftId = 2; timeRange = AFTERNOON_TIME; }
            else { shiftId = 3; timeRange = NIGHT_TIME; } // Night shift for supervisors

            supEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: shiftId, jobRole: 'C1 (Sup)', timeRange: timeRange, color: ROLE_COLORS['Supervisor'] });
        });

        // 4. Night Normal Staff (Rotators) and Coverage
        nightStaffPool.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            
            // CRITICAL CHECK: Skip if Night Rotator is already scheduled (Leave/Fixed Day Off)
            if (isScheduled(staffEntry, dayIndex)) { return; }
            
            // Assign Night shift (ID 3)
            staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: 3, jobRole: 'C2', timeRange: NIGHT_TIME });
        });
        
        let actualNightStaff = nightStaffPool.filter(s => isScheduled(weeklyRosterMap.get(s.employeeId), dayIndex)).length;
        let neededNightCoverage = 2 - actualNightStaff;
        
        if (neededNightCoverage > 0) {
            // Find staff in the coveragePool who are NOT yet scheduled
            let availableCover = coveragePool.filter(s => !isScheduled(weeklyRosterMap.get(s.employeeId), dayIndex));
            
            for(let i=0; i < neededNightCoverage && i < availableCover.length; i++) {
                const coverStaff = availableCover[i];
                // Assign Night shift (ID 3) to fill coverage gap
                weeklyRosterMap.get(coverStaff.employeeId).weeklySchedule[dayIndex].shifts.push({ shiftId: 3, jobRole: 'C4 (Night Cov)', timeRange: NIGHT_TIME });
            }
        }
        
        // 5. Morning/Afternoon Normal Staff (Fill-in)
        
        // Recalculate scheduled staff counts *after* all priority assignments (Mgr, Sup, Del, Night)
        let totalMorningStaff = 0;
        let totalAfternoonStaff = 0;
        
        staffProfiles.forEach(s => {
            const entry = weeklyRosterMap.get(s.employeeId);
            if (isScheduled(entry, dayIndex)) {
                const shiftId = entry.weeklySchedule[dayIndex].shifts[0].shiftId;
                if (shiftId === 1) totalMorningStaff++;
                if (shiftId === 2) totalAfternoonStaff++;
            }
        });
        
        // Define quotas for Normal Staff roles that need to be filled.
        const requiredMorningC3 = 1; 
        const requiredMorningC4 = 1; 
        const requiredMorningC5 = 1;
        
        const requiredAfternoonC3 = 1;
        const requiredAfternoonC4 = 1;
        const requiredAfternoonC5 = hasExtendedDeliveryCover ? 0 : 1; 

        const requiredMorning = SHIFTS[1].required; // 6
        const requiredAfternoon = SHIFTS[2].required; // 5

        // Use the coveragePool (non-rotators) to fill Morning/Afternoon slots
        coveragePool.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            
            // CRITICAL CHECK: Skip if staff is already scheduled
            if (isScheduled(staffEntry, dayIndex)) return; 
            
            const request = getWeeklyRequest(staff);
            const tempShiftPref = (request.type === 'ShiftChange') ? request.shift : staff.shiftPreference;
            
            let assigned = false;

            // --- A. Prioritize Morning (Shift 1) based on preference and quota ---
            if ((tempShiftPref === 'Morning' || totalMorningStaff < totalAfternoonStaff) && totalMorningStaff < requiredMorning) {
                let jobRole = 'C4'; // Default general role
                
                // 1. Assign C5 (if needed)
                if (morningShiftRolesAssigned.C5 < requiredMorningC5) {
                    jobRole = 'C5';
                    morningShiftRolesAssigned.C5++;
                } 
                // 2. Assign C4 (if needed)
                else if (morningShiftRolesAssigned.C4 < requiredMorningC4) {
                    jobRole = 'C4';
                    morningShiftRolesAssigned.C4++;
                }
                // 3. Assign C3 (if needed - required one C3 from Normal Staff)
                else if (morningShiftRolesAssigned.C3 < requiredMorningC3) {
                    jobRole = 'C3';
                    morningShiftRolesAssigned.C3++;
                }
                // 4. Fill remaining slots with C4
                else {
                    jobRole = 'C4'; 
                }
                
                staffEntry.weeklySchedule[dayIndex].shifts.push({ 
                    shiftId: 1, 
                    jobRole: jobRole, 
                    timeRange: MORNING_TIME 
                });
                totalMorningStaff++;
                assigned = true;
            }
            
            // --- B. Assign Afternoon (Shift 2) if not scheduled and quota remains ---
            if (!assigned && totalAfternoonStaff < requiredAfternoon) {
                
                let jobRole = 'C4';
                
                // 1. Assign C3 (if needed - required 1 C3 for afternoon from Normal Staff)
                if (afternoonShiftRolesAssigned.C3 < requiredAfternoonC3) {
                    jobRole = 'C3';
                    afternoonShiftRolesAssigned.C3++;
                } 
                // 2. Assign C4 (if needed)
                else if (afternoonShiftRolesAssigned.C4 < requiredAfternoonC4) {
                    jobRole = 'C4';
                    afternoonShiftRolesAssigned.C4++;
                }
                // 3. Assign C5 (Conditional assignment based on extended delivery cover)
                else if (afternoonShiftRolesAssigned.C5 < requiredAfternoonC5) { 
                    jobRole = 'C5';
                    afternoonShiftRolesAssigned.C5++;
                }
                // 4. Fill remaining slots with C4
                else {
                    jobRole = 'C4';
                }
                
                staffEntry.weeklySchedule[dayIndex].shifts.push({ 
                    shiftId: 2, 
                    jobRole: jobRole, 
                    timeRange: AFTERNOON_TIME 
                });
                totalAfternoonStaff++;
                assigned = true;
            } 
            
            // --- C. Assign Day Off if all quotas are met for both shifts ---
            if (!assigned) {
                staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: null, jobRole: 'Leave (Auto Off)', timeRange: 'Full Day' });
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