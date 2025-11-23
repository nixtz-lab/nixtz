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
    
    const weekStartString = weekStartDate.toISOString().split('T')[0]; 

    // --- Utility function to check and extract request ---
    function getWeeklyRequest(profile) {
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

        if (requestWeek < weekStartString) {
             return { type: 'None' };
        }
        
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
    
    // --- Day Off Assignments: THIS BLOCK IS NOW REMOVED OR NEUTRALIZED ---
    // We are relying ONLY on staff.fixedDayOff, NOT hardcoded positional rotation indexes.
    
    // The previous logic for supervisorDayOffs and nightStaffDaysOff is removed 
    // to stop the hardcoded leave inheritance bug.
    
    // --- Main Daily Scheduling Loop ---
    DAYS_FULL.forEach((day, dayIndex) => {
        
        // 0. CHECK WEEKLY REQUEST OVERRIDE
        staffProfiles.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId); // Lookup by ID
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
                pae.weeklySchedule[dayIndex].shifts.push({ shiftId: 1, jobRole: 'C1 (Mgr)', timeRange: '08:00-17:00', color: ROLE_COLORS['Manager'] });
            }
        }

        // 2. Delivery Drivers
        deliveryDrivers.forEach((driver, index) => {
            const driverEntry = weeklyRosterMap.get(driver.employeeId);
            const otherDriver = deliveryDrivers[1 - index];
            const request = getWeeklyRequest(driver);

            if (driverEntry.weeklySchedule[dayIndex].shifts.length > 0) { return; }

            if (driver.fixedDayOff === day) { // Use ONLY fixedDayOff
                driverEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: null, jobRole: 'Leave (Del)', timeRange: 'Full Day', color: ROLE_COLORS['Delivery'] });
            } else {
                if (otherDriver && otherDriver.fixedDayOff === day) {
                    driverEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: 1, jobRole: 'C3 (Del Cov)', timeRange: '07:00-21:00', color: ROLE_COLORS['Delivery'] });
                } else {
                    const tempShiftPref = (request.type === 'ShiftChange') ? request.shift : driver.shiftPreference; 
                    
                    const shiftDetails = (tempShiftPref.includes('Morning')) 
                        ? (dayIndex < 4 ? { id: 1, time: '07:00-16:00' } : { id: 2, time: '10:00-21:00' })
                        : (dayIndex < 4 ? { id: 2, time: '10:00-21:00' } : { id: 1, time: '07:00-16:00' });
                    
                    driverEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: shiftDetails.id, jobRole: 'C3 (Del)', timeRange: shiftDetails.time, color: ROLE_COLORS['Delivery'] });
                }
            }
        });

        // 3. Supervisors (FIXED LOGIC: ONLY USE fixedDayOff)
        supervisors.forEach(sup => {
            const supEntry = weeklyRosterMap.get(sup.employeeId);
            const request = getWeeklyRequest(sup);

            if (supEntry.weeklySchedule[dayIndex].shifts.length > 0) { return; }
            
            const tempShiftPref = (request.type === 'ShiftChange') ? request.shift : sup.shiftPreference;
            
            if (sup.fixedDayOff === day) { // Use ONLY fixedDayOff
                supEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: null, jobRole: 'Leave (Sup)', timeRange: 'Full Day', color: ROLE_COLORS['Supervisor'] });
            } 
            // Removed all complex shift coverage logic that was causing the error. 
            // Fallback to simple shift assignment based on preference.
            else {
                const shiftId = tempShiftPref === 'Morning' ? 1 : tempShiftPref === 'Afternoon' ? 2 : 3;
                supEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: shiftId, jobRole: 'C1 (Sup)', timeRange: SHIFTS[shiftId].time, color: ROLE_COLORS['Supervisor'] });
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
                staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: 3, jobRole: 'C2', timeRange: SHIFTS[3].time });
            }
        });
        
        let actualNightStaff = nightStaffPool.filter(s => weeklyRosterMap.get(s.employeeId).weeklySchedule[dayIndex].shifts.length > 0 && !weeklyRosterMap.get(s.employeeId).weeklySchedule[dayIndex].shifts[0].jobRole.includes('Leave')).length;
        let neededNightCoverage = 2 - actualNightStaff;
        
        if (neededNightCoverage > 0) {
            let availableCover = coveragePool.filter(s => !weeklyRosterMap.get(s.employeeId).weeklySchedule[dayIndex].shifts.length);
            
            for(let i=0; i < neededNightCoverage && i < availableCover.length; i++) {
                const coverStaff = availableCover[i];
                weeklyRosterMap.get(coverStaff.employeeId).weeklySchedule[dayIndex].shifts.push({ shiftId: 3, jobRole: 'C4 (Night Cov)', timeRange: SHIFTS[3].time });
            }
        }
        
        // 5. Morning/Afternoon Normal Staff (Fill-in)
        let staffCounter = 0;
        coveragePool.forEach(staff => {
            const staffEntry = weeklyRosterMap.get(staff.employeeId);
            const request = getWeeklyRequest(staff);
            
            const alreadyScheduled = staffEntry.weeklySchedule[dayIndex].shifts.length > 0;

            if (alreadyScheduled) return;
            
            const assignedDayOff = (staffCounter % 5) + 2;
            if (assignedDayOff === dayIndex) {
                 staffEntry.weeklySchedule[dayIndex].shifts.push({ shiftId: null, jobRole: 'Leave', timeRange: 'Full Day' });
            } else {
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
        employeeId: staff.employeeId, // Retain ID for the roster entry
        position: staff.position, 
        weeklySchedule: staff.weeklySchedule.map((daySchedule, index) => ({
            dayOfWeek: DAYS_FULL[index],
            shifts: daySchedule.shifts
        }))
    }));
}

module.exports = { generateWeeklyRoster };