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
    
    // NOTE: SHIFT times for output must match the user's config saved on the frontend (staff_roster.js).
    // The generator will now use the DYNAMIC_TIME placeholders.
    const MORNING_TIME = SHIFTS[1].time || '07:00-16:00';
    const AFTERNOON_TIME = SHIFTS[2].time || '13:30-22:30';
    const NIGHT_TIME = SHIFTS[3].time || '22:00-07:00';
    
    const weekStartString = weekStartDate.toISOString().split('T')[0]; 

    // --- Utility function to check and extract request ---
    function getWeeklyRequest(profile) {
        
        // 1. Check for PERMANENT CLEAR (set by frontend Update modal)
        if (profile.nextWeekHolidayRequest === 'None') { 
            return { type: 'None' };
        }
        
        if (!profile.nextWeekHolidayRequest || typeof profile.nextWeekHolidayRequest !== 'string') {
            return { type: 'None' };
        }
        
        const parts = profile.nextWeekHolidayRequest.split(':');
        
        if (parts.length !== 2) {
            return { type: 'None' };
        }
        
        const [requestWeek, requestValue] = parts;

        // 2. Check if the request date has already passed. 
        if (requestWeek < weekStartString) {
             return { type: 'None' };
        }
        
        // 3. Check if the request applies to the CURRENT week being generated
        if (requestWeek === weekStartString) {
            if (DAYS_FULL.includes(requestValue) || requestValue === 'Full Week') {
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
    let nightStaffPool = staffProfiles.filter(s => s.position === 'Normal Staff' && s.isNightRotator);
    let coveragePool = staffProfiles.filter(s => s.position === 'Normal Staff' && !s.isNightRotator);
    
    // 1. Initial Assignments and Roster Map: Use employeeId as the map key
    const weeklyRosterMap = new Map(staffProfiles.map(s => [s.employeeId, { ...s, weeklySchedule: new Array(7).fill({ shifts: [] }) }]));
    
    // --- Main Daily Scheduling Loop ---
    DAYS_FULL.forEach((day, dayIndex) => {
        
        // --- Role tracking for the current day ---
        // Tracks roles assigned to Normal Staff (non-Delivery Drivers)
        const morningShiftRolesAssigned = { C3: 0, C4: 0, C5: 0 };
        const afternoonShiftRolesAssigned = { C3: 0, C4: 0, C5: 0 };
        let hasExtendedDeliveryCover = false; // Tracks 07:00-21:00 shift
        // ----------------------------------------
        
        // 0. CHECK WEEKLY REQUEST OVERRIDE (Temporary Leave/Shift Change)
        staffProfiles.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            const request = getWeeklyRequest(staff);
            
            if (request.type === 'Leave') {
                if (request.day === day || request.day === 'Full Week') {
                    // Overwrite default schedule with Leave
                    staffEntry.weeklySchedule[dayIndex].shifts = [{ shiftId: null, jobRole: `Leave (${request.day === 'Full Week' ? 'Week Off' : 'Requested'})`, timeRange: 'Full Day', color: '#B91C1C' }];
                }
            } 
        });
        
        // 1. Manager 
        if (manager) {
            const pae = weeklyRosterMap.get(manager.employeeId);
            
            if (pae.weeklySchedule[dayIndex].shifts.length > 0) { /* Already handled by request override */ }
            else if (pae.fixedDayOff === day) { // Use ONLY fixedDayOff
                pae.weeklySchedule[dayIndex].shifts.push({ shiftId: null, jobRole: 'Leave (Mgr)', timeRange: 'Full Day', color: ROLE_COLORS['Manager'] });
            } else {
                // Use MORNING_TIME from dynamic SHIFTS structure
                pae.weeklySchedule[dayIndex].shifts.push({ shiftId: 1, jobRole: 'C1 (Mgr)', timeRange: MORNING_TIME, color: ROLE_COLORS['Manager'] });
            }
        }

        // 2. Delivery Drivers
        deliveryDrivers.forEach((driver, index) => {
            const driverEntry = weeklyRosterMap.get(driver.employeeId);
            const otherDriver = deliveryDrivers[1 - index];
            const request = getWeeklyRequest(driver);

            if (driverEntry.weeklySchedule[dayIndex].shifts.length > 0) { return; }

            // Apply Fixed Day Off for Driver
            if (driver.fixedDayOff === day) { 
                driverEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: null, jobRole: 'Leave (Del)', timeRange: 'Full Day', color: ROLE_COLORS['Delivery'] });
            } else {
                // Use dynamic times for shift assignments
                const tempShiftPref = (request.type === 'ShiftChange') ? request.shift : driver.shiftPreference; 
                
                let shiftDetails;
                let jobRole = 'C3 (Del)';

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
            }
            
            // Track C3 assignment from the dedicated Delivery Drivers
            if (driverEntry.weeklySchedule[dayIndex].shifts.length > 0 && driverEntry.weeklySchedule[dayIndex].shifts[0].jobRole.includes('C3')) {
                if (driverEntry.weeklySchedule[dayIndex].shifts[0].shiftId === 1) {
                    morningShiftRolesAssigned.C3++;
                } else if (driverEntry.weeklySchedule[dayIndex].shifts[0].shiftId === 2) {
                    afternoonShiftRolesAssigned.C3++;
                }
            }
        });

        // 3. Supervisors (REMOVED COMPLEX ROTATION, RELY ON FIXED DAY OFF)
        supervisors.forEach(sup => {
            const supEntry = weeklyRosterMap.get(sup.employeeId);
            const request = getWeeklyRequest(sup);

            if (supEntry.weeklySchedule[dayIndex].shifts.length > 0) { return; }
            
            const tempShiftPref = (request.type === 'ShiftChange') ? request.shift : sup.shiftPreference;
            
            // Apply Fixed Day Off for Supervisor
            if (sup.fixedDayOff === day) { 
                supEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: null, jobRole: 'Leave (Sup)', timeRange: 'Full Day', color: ROLE_COLORS['Supervisor'] });
            } 
            // Fallback to simple shift assignment based on preference.
            else {
                let shiftId;
                let timeRange;
                
                if (tempShiftPref === 'Morning') { shiftId = 1; timeRange = MORNING_TIME; }
                else if (tempShiftPref === 'Afternoon') { shiftId = 2; timeRange = AFTERNOON_TIME; }
                else { shiftId = 3; timeRange = NIGHT_TIME; }

                supEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: shiftId, jobRole: 'C1 (Sup)', timeRange: timeRange, color: ROLE_COLORS['Supervisor'] });
            }
        });

        // 4. Night Normal Staff (Rotators) and Coverage
        nightStaffPool.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            const request = getWeeklyRequest(staff);

            if (staffEntry.weeklySchedule[dayIndex].shifts.length > 0) { return; }
            
            // Night staff relies on fixedDayOff for stability
            if (staff.fixedDayOff === day) {
                staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: null, jobRole: 'Leave (Night)', timeRange: 'Full Day' });
            } else {
                // Use NIGHT_TIME from dynamic SHIFTS structure
                staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: 3, jobRole: 'C2', timeRange: NIGHT_TIME });
            }
        });
        
        let actualNightStaff = nightStaffPool.filter(s => weeklyRosterMap.get(s.employeeId).weeklySchedule[dayIndex].shifts.length > 0 && !weeklyRosterMap.get(s.employeeId).weeklySchedule[dayIndex].shifts[0].jobRole.includes('Leave')).length;
        let neededNightCoverage = 2 - actualNightStaff;
        
        if (neededNightCoverage > 0) {
            let availableCover = coveragePool.filter(s => !weeklyRosterMap.get(s.employeeId).weeklySchedule[dayIndex].shifts.length);
            
            for(let i=0; i < neededNightCoverage && i < availableCover.length; i++) {
                const coverStaff = availableCover[i];
                // Use NIGHT_TIME from dynamic SHIFTS structure
                weeklyRosterMap.get(coverStaff.employeeId).weeklySchedule[dayIndex].shifts.push({ shiftId: 3, jobRole: 'C4 (Night Cov)', timeRange: NIGHT_TIME });
            }
        }
        
        // 5. Morning/Afternoon Normal Staff (Fill-in)
        
        // Re-calculate how many staff are already scheduled for Morning/Afternoon (Sup, Mgr, Night Cover)
        let totalMorningStaff = 0;
        let totalAfternoonStaff = 0;
        
        staffProfiles.forEach(s => {
            const entry = weeklyRosterMap.get(s.employeeId);
            if (entry.weeklySchedule[dayIndex].shifts.length > 0) {
                const shiftId = entry.weeklySchedule[dayIndex].shifts[0].shiftId;
                if (shiftId === 1) totalMorningStaff++;
                if (shiftId === 2) totalAfternoonStaff++;
            }
        });
        
        // Adjust Morning/Afternoon roles assigned counts based on existing assignments (Mgr, Sup, Del)
        // Note: The Delivery Driver logic (Step 2) already updates the C3 counts correctly.
        
        // Define quotas for Normal Staff roles that need to be filled.
        const requiredMorningC3 = 1; 
        const requiredMorningC4 = 1; 
        const requiredMorningC5 = 1;
        
        const requiredAfternoonC3 = 1;
        const requiredAfternoonC4 = 1;
        const requiredAfternoonC5 = hasExtendedDeliveryCover ? 0 : 1; // C5 not required if extended delivery cover is present.

        const requiredMorning = SHIFTS[1].required; // 6
        const requiredAfternoon = SHIFTS[2].required; // 5

        // Use the coveragePool (non-rotators) to fill Morning/Afternoon slots
        coveragePool.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            const request = getWeeklyRequest(staff);
            
            const alreadyScheduled = staffEntry.weeklySchedule[dayIndex].shifts.length > 0;

            if (alreadyScheduled) return;
            
            // Check for Fixed Day Off or Leave Requests (already done in step 0, but added here for the specific pool loop)
            if (staff.fixedDayOff === day || (request.type === 'Leave' && request.day === day)) {
                 staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: null, jobRole: 'Leave (Off)', timeRange: 'Full Day' });
                 return;
            }

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
                // 4. Fill remaining slots with C4 (as requested: "the rest can me C2 and C4")
                else {
                    // We primarily use C4 for day shifts. C2 is for night.
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