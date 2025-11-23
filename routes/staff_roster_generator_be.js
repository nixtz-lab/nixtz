// staff_roster_generator_be.js

/**
 * Configuration for Shifts
 */
const SHIFTS = { 
    1: { name: 'Morning', time: '07:00-16:00', roles: ['C1', 'C4', 'C3'] },
    2: { name: 'Afternoon', time: '13:30-22:30', roles: ['C1', 'C5', 'C3'] },
    3: { name: 'Night', time: '22:00-07:00', roles: ['C1', 'C2'] }
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
 * Generates a weekly roster based on the current staff profiles and complex rotation rules.
 * @param {Array} staffProfiles - List of staff fetched from the database.
 * @param {Date} weekStartDate - The Monday start date of the week to generate.
 */
function generateWeeklyRoster(staffProfiles, weekStartDate) {
    
    // Format the weekStartDate for comparison with the stored request string
    const weekStartString = weekStartDate.toISOString().split('T')[0]; 

    // --- Utility function to check and extract request ---
    function getWeeklyRequest(profile) {
        // If the permanent value is 'None', the staff member is available for standard scheduling
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

        if (requestWeek === weekStartString) {
            // Check if the value is a day/leave (Mon-Sun, Full Week)
            if (DAYS_FULL.includes(requestValue) || requestValue === 'Full Week') {
                 return { type: 'Leave', day: requestValue };
            } 
            // Check if the value is a shift preference
            else if (['Morning', 'Afternoon', 'Night'].includes(requestValue)) {
                return { type: 'ShiftChange', shift: requestValue };
            }
        }
        return { type: 'None' }; // Request is for a different week or malformed
    }
    
    // Filter staff into specific functional groups based on the profiles
    let manager = staffProfiles.find(s => s.position === 'Manager');
    let supervisors = staffProfiles.filter(s => s.position === 'Supervisor').sort((a, b) => a.shiftPreference.localeCompare(b.shiftPreference));
    let deliveryDrivers = staffProfiles.filter(s => s.position === 'Delivery').sort((a, b) => a.fixedDayOff.localeCompare(b.fixedDayOff));
    let nightStaffPool = staffProfiles.filter(s => s.position === 'Normal Staff' && s.isNightRotator);
    let coveragePool = staffProfiles.filter(s => s.position === 'Normal Staff' && !s.isNightRotator);
    

    // 1. Initial Assignments and Roster Map
    const weeklyRosterMap = new Map(staffProfiles.map(s => [s.name, { ...s, weeklySchedule: new Array(7).fill({ shifts: [] }) }]));
    
    // --- Day Off Assignments for this week (Rule-based initial setup) ---
    // If profiles exist, use them. Fallback if the database is missing fixed days off.
    const supervisorDayOffs = new Map();
    if (supervisors.length >= 3) {
        // Assign Day Offs based on shift rotation slots (Morning, Afternoon, Night)
        supervisorDayOffs.set(supervisors.find(s => s.shiftPreference === 'Morning')?.name || supervisors[0].name, 0); // Monday
        supervisorDayOffs.set(supervisors.find(s => s.shiftPreference === 'Afternoon')?.name || supervisors[1].name, 3); // Thursday
        supervisorDayOffs.set(supervisors.find(s => s.shiftPreference === 'Night')?.name || supervisors[2].name, 6); // Sunday
    }

    const nightStaffDaysOff = new Map();
    if (nightStaffPool.length >= 2) {
        nightStaffDaysOff.set(nightStaffPool[0].name, 0); // Monday
        nightStaffDaysOff.set(nightStaffPool[1].name, 1); // Tuesday
    }
    
    // --- Main Daily Scheduling Loop ---
    DAYS_FULL.forEach((day, dayIndex) => {
        
        // 0. CHECK WEEKLY REQUEST OVERRIDE
        staffProfiles.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.name);
            const request = getWeeklyRequest(staff);
            
            if (request.type === 'Leave') {
                if (request.day === day || request.day === 'Full Week') {
                    // Overwrite default schedule with Leave for this day/week
                    staffEntry.weeklySchedule[dayIndex].shifts = [{ shiftId: null, jobRole: `Leave (${request.day === 'Full Week' ? 'Week Off' : 'Requested'})`, timeRange: 'Full Day', color: '#B91C1C' }];
                }
            } 
            // If it's a ShiftChange, we'll use the new shift preference in the main scheduling logic below
        });
        
        // 1. Manager 
        if (manager) {
            const pae = weeklyRosterMap.get(manager.name);
            const request = getWeeklyRequest(manager);
            
            if (pae.weeklySchedule[dayIndex].shifts.length > 0) { /* Already handled by request override */ }
            else if (pae.fixedDayOff === day) {
                pae.weeklySchedule[dayIndex].shifts.push({ shiftId: null, jobRole: 'Leave (Mgr)', timeRange: 'Full Day', color: ROLE_COLORS['Manager'] });
            } else {
                // Check for ShiftChange request, but Managers typically stick to Morning
                const shiftToUse = (request.type === 'ShiftChange') ? request.shift : 'Morning'; 
                
                pae.weeklySchedule[dayIndex].shifts.push({ shiftId: 1, jobRole: 'C1 (Mgr)', timeRange: '08:00-17:00', color: ROLE_COLORS['Manager'] });
            }
        }

        // 2. Delivery Drivers
        deliveryDrivers.forEach((driver, index) => {
            const driverEntry = weeklyRosterMap.get(driver.name);
            const otherDriver = deliveryDrivers[1 - index];
            const request = getWeeklyRequest(driver);

            if (driverEntry.weeklySchedule[dayIndex].shifts.length > 0) { return; /* Already handled by request override */ }

            if (driver.fixedDayOff === day) {
                driverEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: null, jobRole: 'Leave (Del)', timeRange: 'Full Day', color: ROLE_COLORS['Delivery'] });
            } else {
                if (otherDriver && otherDriver.fixedDayOff === day) {
                    driverEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: 1, jobRole: 'C3 (Del Cov)', timeRange: '07:00-21:00', color: ROLE_COLORS['Delivery'] });
                } else {
                    // Apply temporary shift preference if requested
                    const tempShiftPref = (request.type === 'ShiftChange') ? request.shift : driver.shiftPreference; 
                    
                    const shiftDetails = (tempShiftPref.includes('Morning')) 
                        ? (dayIndex < 4 ? { id: 1, time: '07:00-16:00' } : { id: 2, time: '10:00-21:00' })
                        : (dayIndex < 4 ? { id: 2, time: '10:00-21:00' } : { id: 1, time: '07:00-16:00' });
                    
                    driverEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: shiftDetails.id, jobRole: 'C3 (Del)', timeRange: shiftDetails.time, color: ROLE_COLORS['Delivery'] });
                }
            }
        });

        // 3. Supervisors
        supervisors.forEach(sup => {
            const supEntry = weeklyRosterMap.get(sup.name);
            const request = getWeeklyRequest(sup);

            if (supEntry.weeklySchedule[dayIndex].shifts.length > 0) { return; /* Already handled by request override */ }

            const isDayOff = supervisorDayOffs.get(sup.name) === dayIndex;
            let supShift;
            
            // Apply temporary shift preference if requested
            const tempShiftPref = (request.type === 'ShiftChange') ? request.shift : sup.shiftPreference;
            
            if (isDayOff) {
                supShift = { shiftId: null, jobRole: 'Leave (Sup)', timeRange: 'Full Day', color: ROLE_COLORS['Supervisor'] };
            } 
            else if (tempShiftPref === 'Morning' && supervisorDayOffs.get(supervisors.find(s => s.shiftPreference === 'Afternoon')?.name) === dayIndex) {
                supShift = { shiftId: 1, jobRole: 'C1 (Sup Cov)', timeRange: '08:00-20:00', color: ROLE_COLORS['Supervisor'] }; 
            } else if (tempShiftPref === 'Afternoon' && supervisorDayOffs.get(supervisors.find(s => s.shiftPreference === 'Morning')?.name) === dayIndex) {
                supShift = { shiftId: 2, jobRole: 'C1 (Sup Cov)', timeRange: '08:00-20:00', color: ROLE_COLORS['Supervisor'] };
            } else if (tempShiftPref !== 'Night' && supervisorDayOffs.get(supervisors.find(s => s.shiftPreference === 'Night')?.name) === dayIndex) {
                supShift = { shiftId: 3, jobRole: 'C1 (Sup Cov)', timeRange: '20:00-08:00', color: ROLE_COLORS['Supervisor'] };
            }
            else {
                const shiftId = tempShiftPref === 'Morning' ? 1 : tempShiftPref === 'Afternoon' ? 2 : 3;
                supShift = { shiftId: shiftId, jobRole: 'C1 (Sup)', timeRange: SHIFTS[shiftId].time, color: ROLE_COLORS['Supervisor'] };
            }

            supEntry.weeklySchedule[dayIndex].shifts.push(supShift);
        });

        // 4. Night Normal Staff (Rotators) and Coverage
        nightStaffPool.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.name);
            const request = getWeeklyRequest(staff);

            if (staffEntry.weeklySchedule[dayIndex].shifts.length > 0) { return; /* Already handled by request override */ }
            
            // Note: Shift change requests for night staff who are rotators are ignored, they must do night.
            
            const isDayOff = nightStaffDaysOff.get(staff.name) === dayIndex;
            if (isDayOff) {
                staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: null, jobRole: 'Leave (Night)', timeRange: 'Full Day' });
            } else {
                staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: 3, jobRole: 'C2', timeRange: SHIFTS[3].time });
            }
        });
        
        let actualNightStaff = nightStaffPool.filter(s => weeklyRosterMap.get(s.name).weeklySchedule[dayIndex].shifts.length > 0 && !weeklyRosterMap.get(s.name).weeklySchedule[dayIndex].shifts[0].jobRole.includes('Leave')).length;
        let neededNightCoverage = 2 - actualNightStaff;
        
        if (neededNightCoverage > 0) {
            let availableCover = coveragePool.filter(s => !weeklyRosterMap.get(s.name).weeklySchedule[dayIndex].shifts.length);
            
            for(let i=0; i < neededNightCoverage && i < availableCover.length; i++) {
                const coverStaff = availableCover[i];
                weeklyRosterMap.get(coverStaff.name).weeklySchedule[dayIndex].shifts.push({ shiftId: 3, jobRole: 'C4 (Night Cov)', timeRange: SHIFTS[3].time });
            }
        }
        
        // 5. Morning/Afternoon Normal Staff (Fill-in)
        let staffCounter = 0;
        coveragePool.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.name);
            const request = getWeeklyRequest(staff);
            
            const alreadyScheduled = staffEntry.weeklySchedule[dayIndex].shifts.length > 0;

            if (alreadyScheduled) return;
            
            const assignedDayOff = (staffCounter % 5) + 2;
            if (assignedDayOff === dayIndex) {
                 staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: null, jobRole: 'Leave', timeRange: 'Full Day' });
            } else {
                // Apply temporary shift preference if requested
                const tempShiftPref = (request.type === 'ShiftChange') ? request.shift : staff.shiftPreference;
                
                const shiftId = tempShiftPref === 'Morning' ? 1 : 2;
                const jobRole = tempShiftPref === 'Morning' ? 'C4' : 'C5';
                staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: shiftId, jobRole: jobRole, timeRange: SHIFTS[shiftId].time });
            }
            staffCounter++;
        });

    }); 

    // Final Formatting - ATTACH POSITION FOR FRONTEND SORTING
    return Array.from(weeklyRosterMap.values()).map(staff => ({
        employeeName: staff.name,
        employeeId: staff.employeeId,
        position: staff.position, // New field attached for sorting
        weeklySchedule: staff.weeklySchedule.map((daySchedule, index) => ({
            dayOfWeek: DAYS_FULL[index],
            shifts: daySchedule.shifts
        }))
    }));
}

module.exports = { generateWeeklyRoster };