/**
 * staff_roster.js
 * Custom logic for the 7-Eleven Staff Roster page.
 * NOTE: Relies on global variables and functions defined in script.js (e.g., API_BASE_URL, getAuthStatus, showMessage).
 */

const API_URL = `${window.API_BASE_URL}/api/staff/roster`;
const PROFILE_API_URL = `${window.API_BASE_URL}/api/staff/profile`;
const SHIFTS = { 
    1: { name: 'Morning', time: '07:00-16:00', required: 6, roles: ['C1', 'C4', 'C3'] },
    2: { name: 'Afternoon', time: '13:30-22:30', required: 5, roles: ['C1', 'C5', 'C3'] },
    3: { name: 'Night', time: '22:00-07:00', required: 'N/A', roles: ['C1', 'C2'] }
};
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

let currentRosterData = []; 
let currentWeekStartDate = null;
let currentStaffData = {}; // Cache for single profile editing

// --- CORE ROSTER UTILITIES ---

function getRosterForSave() {
    const rows = document.querySelectorAll('#roster-body tr');
    const rosterData = [];

    rows.forEach(row => {
        const nameInput = row.querySelector('.staff-name-input');
        const idInput = row.querySelector('.staff-id-input');
        if (!nameInput || !idInput || !nameInput.value.trim()) return;

        const weeklySchedule = [];
        DAYS.forEach((day, dayIndex) => {
            const shiftCell = row.querySelector(`[data-day="${day}"]`);
            if (shiftCell) {
                const textContent = shiftCell.textContent.trim();
                const shifts = [];
                
                if (textContent.includes('Leave')) { 
                    shifts.push({ shiftId: null, jobRole: textContent, timeRange: 'Full Day' });
                } else if (textContent) {
                    const cellDisplay = shiftCell.innerHTML;
                    const shiftMatch = cellDisplay.match(/^(\d+)\s+([A-Za-z0-9\s()]+)<span/);
                    const timeMatch = cellDisplay.match(/<span[^>]*>([^<]+)<\/span>/);
                    
                    if (shiftMatch) {
                        const shiftId = parseInt(shiftMatch[1]);
                        const jobRole = shiftMatch[2].trim();
                        const timeRange = timeMatch ? timeMatch[1].trim() : SHIFTS[shiftId].time;
                        
                        shifts.push({
                            shiftId: shiftId,
                            jobRole: jobRole,
                            timeRange: timeRange
                        });
                    }
                }

                weeklySchedule.push({
                    dayOfWeek: day,
                    shifts: shifts
                });
            }
        });

        const employeeId = idInput.value.trim() || nameInput.value.trim().toLowerCase().replace(/[\s\(\)]/g, '-');
        
        rosterData.push({
            employeeName: nameInput.value.trim(),
            employeeId: employeeId,
            weeklySchedule: weeklySchedule
        });
    });

    return rosterData;
}

function updateShiftSummaries() {
    const counts = {};
    const daysMap = {};
    
    DAYS.forEach(day => {
        daysMap[day] = { 1: { actual: 0, required: SHIFTS[1].required }, 2: { actual: 0, required: SHIFTS[2].required }, 3: { actual: 0, required: 'N/A' } };
    });

    DAYS.forEach(day => {
        document.querySelectorAll(`#roster-body [data-day="${day}"]`).forEach(cell => {
            const cellText = cell.textContent.trim(); 
            if (!cellText || cellText.includes('Leave')) return;

            const shiftIdMatch = cellText.match(/^(\d+)/);
            if (shiftIdMatch) {
                const shiftId = parseInt(shiftIdMatch[1]);
                if (shiftId && daysMap[day][shiftId]) {
                    daysMap[day][shiftId].actual++;
                }
            }
        });
    });

    DAYS.forEach(day => {
        const summaryCell = document.getElementById(`shift-summary-${day.toLowerCase()}`);
        if (!summaryCell) return;
        
        let content = '';
        for (const shiftId in daysMap[day]) {
            const data = daysMap[day][shiftId];
            const required = data.required === 'N/A' ? '' : data.required;
            const statusClass = (data.required !== 'N/A' && data.actual < data.required) ? 'text-red-400' : 'text-nixtz-secondary';

            if(data.actual > 0 || required !== '') {
                content += `<div class="shift-summary">
                                <span class="text-gray-400 font-normal mr-1">${shiftId} (${required}):</span>
                                <span class="${statusClass}">${data.actual}</span>
                            </div>`;
            }
        }
        summaryCell.innerHTML = content;
    });
}

function createShiftDropdown(cell) {
    if (cell.querySelector('.shift-dropdown')) return;
    
    const existingText = cell.textContent.trim();
    const shiftMatch = existingText.match(/^(\d+)\s+([A-Za-z0-9\s()]+)/);
    const initialShiftId = shiftMatch ? parseInt(shiftMatch[1]) : null;
    const initialJobRole = shiftMatch ? shiftMatch[2].trim() : null;

    const day = cell.dataset.day;
    const shiftDropdown = document.createElement('div');
    shiftDropdown.className = 'shift-dropdown';
    shiftDropdown.onclick = (e) => e.stopPropagation(); 

    shiftDropdown.innerHTML += `<button class="dropdown-button bg-red-600 hover:bg-red-500" onclick="setShiftSelection(event, '${day}', null, 'Leave', 'Full Day')">LEAVE (휴가)</button>`;

    [1, 2, 3].forEach(shiftId => {
        const shiftConfig = SHIFTS[shiftId];
        if (!shiftConfig) return;

        shiftDropdown.innerHTML += `<div class="text-xs text-gray-400 mt-2 border-t border-gray-600 pt-1">${shiftConfig.name} (${shiftConfig.time})</div>`;

        shiftConfig.roles.forEach(role => {
            const fullRole = (role === 'C1' && shiftId !== 3) ? `${role} (Sup/Mgr)` : role;
            const isSelected = (initialShiftId === shiftId && initialJobRole === fullRole);
            
            shiftDropdown.innerHTML += `
                <button 
                    class="dropdown-button ${isSelected ? 'bg-nixtz-secondary' : ''}" 
                    onclick="setShiftSelection(event, '${day}', ${shiftId}, '${fullRole}', '${shiftConfig.time}')"
                >
                    ${shiftId} ${fullRole}
                </button>
            `;
        });
    });

    cell.appendChild(shiftDropdown);
    
    const rect = cell.getBoundingClientRect();
    if (rect.right > window.innerWidth - 200) {
        shiftDropdown.style.right = '0';
        shiftDropdown.style.left = 'auto';
    } else {
        shiftDropdown.style.left = '0';
        shiftDropdown.style.right = 'auto';
    }
    
    shiftDropdown.classList.remove('hidden');
}
window.createShiftDropdown = createShiftDropdown;

function setShiftSelection(event, day, shiftId, jobRole, timeRange) {
    const button = event.target;
    const cell = button.closest('.roster-cell');
    
    cell.removeAttribute('style');
    if (jobRole === 'Leave') {
        cell.innerHTML = jobRole; 
        cell.classList.remove('bg-gray-700', 'bg-nixtz-card');
        cell.classList.add('bg-red-800', 'font-bold');
    } else {
        cell.innerHTML = `${shiftId} ${jobRole}<span class="text-xs text-gray-500 block leading-none">${timeRange}</span>`;
        cell.classList.remove('bg-red-800', 'bg-nixtz-card', 'font-bold');
        cell.classList.add('bg-gray-700');
    }
    
    cell.querySelector('.shift-dropdown')?.remove();
    
    updateShiftSummaries();
}
window.setShiftSelection = setShiftSelection;


function hideAllDropdowns(event) {
    const isInsideDropdown = event.target.closest('.shift-dropdown');
    const isCell = event.target.closest('.roster-cell');
    
    if (!isInsideDropdown && !isCell) {
        document.querySelectorAll('.shift-dropdown').forEach(d => d.remove());
    } else if (isCell && !isInsideDropdown) {
        document.querySelectorAll('.shift-dropdown').forEach(d => {
            if (d.closest('.roster-cell') !== isCell) {
                d.remove();
            }
        });
    }
}
document.addEventListener('click', hideAllDropdowns);


function addStaffRow(initialData = {}) {
    const rosterBody = document.getElementById('roster-body');
    const newRow = document.createElement('tr');
    newRow.className = 'hover:bg-gray-800 transition duration-150 border-b border-gray-700';

    const staffName = initialData.employeeName || '';
    const staffId = initialData.employeeId || '';

    let rowHTML = `
        <td class="p-2 bg-gray-900 sticky left-0 z-10 border-r border-gray-700">
            <input type="text" value="${staffName}" placeholder="Staff Name" class="staff-name-input bg-transparent font-semibold w-full" data-key="name">
            <input type="text" value="${staffId}" placeholder="ID" class="staff-id-input bg-transparent text-xs text-gray-500 w-full mt-1" data-key="id">
        </td>
    `;

    DAYS.forEach(day => {
        const daySchedule = initialData.weeklySchedule?.find(s => s.dayOfWeek === day);
        let cellContent = '';
        let cellClasses = 'bg-nixtz-card';
        let customColor = '';
        
        if (daySchedule && daySchedule.shifts.length > 0) {
            const shift = daySchedule.shifts[0]; 
            const shiftId = shift.shiftId;
            const jobRole = shift.jobRole;
            const timeRange = shift.timeRange;
            
            if (jobRole && jobRole.includes('Leave')) {
                cellContent = jobRole; 
                cellClasses = 'bg-red-800 font-bold';
            } else if (shiftId && jobRole && timeRange) {
                cellContent = `${shiftId} ${jobRole}<span class="text-xs text-gray-500 block leading-none">${timeRange}</span>`;
                cellClasses = 'bg-gray-700';

                if (shift.color) {
                    customColor = `style="background-color: ${shift.color}40; border-left: 4px solid ${shift.color};"`;
                }
            }
        }
        
        rowHTML += `
            <td class="roster-cell p-2 border-r border-gray-700 ${cellClasses}" 
                data-day="${day}" 
                onclick="createShiftDropdown(this)"
                ${customColor}>
                ${cellContent}
            </td>
        `;
    });
    
    rowHTML += `<td class="p-2 text-center bg-gray-900 border-l border-gray-700">
                    <button onclick="deleteStaffRow(this)" class="text-red-500 hover:text-red-400 transition duration-200" title="Delete Row">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </td>`;

    newRow.innerHTML = rowHTML;
    rosterBody.appendChild(newRow);
    
    lucide.createIcons();
    updateShiftSummaries();
}
window.addStaffRow = addStaffRow;

function deleteStaffRow(button) {
    button.closest('tr').remove();
    updateShiftSummaries();
}
window.deleteStaffRow = deleteStaffRow;

// --- API CALLS ---
async function loadRoster(startDateString) {
    if (!startDateString) return;
    if (!window.getAuthStatus || !getAuthStatus()) return showMessage("Please log in to load the roster.", true);

    const isoDate = new Date(startDateString).toISOString().split('T')[0];
    const token = localStorage.getItem('tmt_auth_token');
    
    showMessage(`Loading roster for week starting ${isoDate}...`, false);
    
    try {
        // --- STEP 1: Attempt to Load Existing Roster ---
        let response = await fetch(`${API_URL}/${isoDate}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        
        let result = await response.json();
        let rosterData = result.data; 
        let generated = false;

        // --- STEP 2: If no roster found, attempt to GENERATE it ---
        if (!rosterData || rosterData.length === 0) {
            showMessage(`No saved roster found for this week. Attempting automatic generation...`, false);
            
            response = await fetch(`${API_URL}/generate/${isoDate}`, { 
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to generate roster data.');
            }
            
            result = await response.json();
            rosterData = result.data; 
            generated = true;
        }

        // --- STEP 3: Render the Roster ---
        
        document.getElementById('roster-body').innerHTML = '';
        currentRosterData = rosterData;
        currentWeekStartDate = startDateString;

        if (currentRosterData.length === 0) {
            showMessage('Could not generate or find a roster. Start adding staff profiles!', true);
            for(let i = 0; i < 2; i++) addStaffRow({});
        } else {
            currentRosterData.forEach(data => addStaffRow(data));
            const successMsg = generated 
                ? `Roster automatically generated for ${currentRosterData.length} employees.`
                : `Roster loaded successfully for ${currentRosterData.length} employees.`;
            showMessage(successMsg, false);
        }

    } catch (error) {
        console.error("Load/Generate Roster Error:", error);
        showMessage(`Error loading/generating roster: ${error.message}`, true);
    }
}
window.loadRoster = loadRoster;


async function saveRoster() {
    if (!currentWeekStartDate) return showMessage("Please select a Week Start Date before saving.", true);
    if (!window.getAuthStatus || !getAuthStatus()) return showMessage("Please log in to save the roster.", true);
    
    const rosterData = getRosterForSave();
    if (rosterData.length === 0) return showMessage("Add at least one staff member before saving.", true);

    const saveButton = document.getElementById('save-roster-btn');
    saveButton.disabled = true;
    showMessage("Saving roster...", false);

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('tmt_auth_token')}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                weekStartDate: currentWeekStartDate, 
                rosterData: rosterData
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Failed to save roster.');
        }

        const result = await response.json();
        showMessage(`Roster saved successfully! Total entries: ${result.totalEntries}.`, false);

    } catch (error) {
        console.error("Save Roster Error:", error);
        showMessage(`Error saving roster: ${error.message}`, true);
    } finally {
        saveButton.disabled = false;
    }
}
window.saveRoster = saveRoster;

// --- STAFF PROFILE ADD/EDIT LOGIC ---

function showAddStaffModal() {
    document.getElementById('add-staff-modal').classList.remove('hidden');
    document.getElementById('add-staff-modal').classList.add('flex');
    document.getElementById('add-staff-form').reset();
}
window.showAddStaffModal = showAddStaffModal;

async function handleAddStaff(e) {
    e.preventDefault();
    if (!getAuthStatus()) return showMessage("Please log in to add staff.", true);
    
    const submitBtn = e.submitter;
    submitBtn.disabled = true;
    
    const staffData = {
        name: document.getElementById('new-staff-name').value,
        employeeId: document.getElementById('new-staff-id').value,
        position: document.getElementById('new-staff-position').value,
        shiftPreference: document.getElementById('new-staff-shift-preference').value,
        fixedDayOff: document.getElementById('new-staff-fixed-dayoff').value,
        isNightRotator: document.getElementById('new-staff-is-rotator').checked
    };
    
    showMessage("Saving new staff profile...", false);

    try {
        const response = await fetch(`${PROFILE_API_URL}/add`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('tmt_auth_token')}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(staffData)
        });

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || 'Failed to add staff.');
        }

        showMessage(`Staff member ${staffData.name} added. Please generate a new roster.`, false);
        document.getElementById('add-staff-modal').classList.add('hidden');
        document.getElementById('add-staff-modal').classList.remove('flex');
        
    } catch (error) {
        showMessage(`Error adding profile: ${error.message}`, true);
    } finally {
        submitBtn.disabled = false;
    }
}

// --- STAFF LIST MANAGEMENT LOGIC ---

async function loadStaffProfiles() {
    const container = document.getElementById('staff-profiles-container');
    const msgBox = document.getElementById('staff-list-message');
    container.innerHTML = '<p class="text-gray-500 text-center py-4">Loading staff data...</p>';
    msgBox.classList.add('hidden');

    const token = localStorage.getItem('tmt_auth_token');
    
    try {
        const response = await fetch(PROFILE_API_URL, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Failed to fetch profiles.');
        }

        if (result.data.length === 0) {
            container.innerHTML = '<p class="text-yellow-500 text-center py-4">No staff profiles found. Use the "+ Add Staff" button to begin.</p>';
            return;
        }

        // Render the list as cards or table rows
        container.innerHTML = result.data.map(p => `
            <div class="flex justify-between items-center bg-gray-800 p-4 rounded-lg border-l-4 ${p.position === 'Supervisor' || p.position === 'Manager' ? 'border-red-500' : p.position === 'Delivery' ? 'border-blue-400' : 'border-nixtz-secondary'} shadow-md">
                <div>
                    <p class="font-bold text-white">${p.name} <span class="text-xs text-gray-400">(${p.employeeId})</span></p>
                    <p class="text-sm text-nixtz-primary uppercase">${p.position}</p>
                    <p class="text-xs text-gray-500">Day Off: ${p.fixedDayOff}, Shift: ${p.shiftPreference}</p>
                </div>
                <button onclick="openSingleEditModal('${p._id}')" data-id="${p._id}" class="bg-nixtz-secondary hover:bg-[#0da070] text-white px-4 py-2 rounded-full text-sm font-bold transition">
                    Edit
                </button>
            </div>
        `).join('');
        if(window.lucide) window.lucide.createIcons();


    } catch (error) {
        msgBox.textContent = `Error: ${error.message}`;
        msgBox.classList.remove('hidden');
    }
}
window.loadStaffProfiles = loadStaffProfiles;


function openStaffListModal() {
    document.getElementById('staff-list-modal').classList.remove('hidden');
    document.getElementById('staff-list-modal').classList.add('flex');
    loadStaffProfiles(); 
}
window.openStaffListModal = openStaffListModal;


async function openSingleEditModal(profileId) {
    const token = localStorage.getItem('tmt_auth_token');
    
    try {
        const response = await fetch(PROFILE_API_URL, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        
        if (!response.ok || !result.success) {
             throw new Error("Error fetching profile data.");
        }

        const staff = result.data.find(p => p._id === profileId);
        if (!staff) return showMessage("Profile not found.", true);

        currentStaffData = staff; 

        // 2. Populate the edit form
        document.getElementById('edit-profile-id').value = staff._id;
        document.getElementById('single-staff-title').textContent = `Edit Profile: ${staff.name}`;
        document.getElementById('edit-staff-name').value = staff.name;
        document.getElementById('edit-staff-id').value = staff.employeeId; 

        document.getElementById('edit-staff-position').value = staff.position;
        document.getElementById('edit-staff-shift-preference').value = staff.shiftPreference;
        document.getElementById('edit-staff-fixed-dayoff').value = staff.fixedDayOff;
        document.getElementById('edit-staff-is-rotator').checked = staff.isNightRotator;

        // 3. Display the modal and hide the list modal
        document.getElementById('staff-list-modal').classList.add('hidden');
        document.getElementById('single-staff-modal').classList.remove('hidden');
        document.getElementById('single-staff-modal').classList.add('flex');
    } catch(error) {
        showMessage(`Error: ${error.message}`, true);
    }
}
window.openSingleEditModal = openSingleEditModal;


document.getElementById('edit-staff-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const profileId = document.getElementById('edit-profile-id').value;
    const submitBtn = e.submitter;
    submitBtn.disabled = true;

    const updatedData = {
        name: document.getElementById('edit-staff-name').value,
        employeeId: document.getElementById('edit-staff-id').value,
        position: document.getElementById('edit-staff-position').value,
        shiftPreference: document.getElementById('edit-staff-shift-preference').value,
        fixedDayOff: document.getElementById('edit-staff-fixed-dayoff').value,
        isNightRotator: document.getElementById('edit-staff-is-rotator').checked,
        currentRotationDay: currentStaffData.currentRotationDay 
    };

    const token = localStorage.getItem('tmt_auth_token');
    
    try {
        const response = await fetch(`${PROFILE_API_URL}/${profileId}`, {
            method: 'PUT',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedData)
        });

        const result = await response.json();
        
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Update failed.');
        }

        showMessage(`Profile for ${updatedData.name} updated.`, false);
        
        document.getElementById('single-staff-modal').classList.add('hidden');
        openStaffListModal(); 
        
    } catch (error) {
        showMessage(`Error updating profile: ${error.message}`, true);
    } finally {
        submitBtn.disabled = false;
    }
});


// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    if (!window.getAuthStatus || !getAuthStatus()) {
        showMessage("You need to log in to access the Roster Management.", true);
        return; 
    }

    // Initialize the profile submission form listener
    document.getElementById('add-staff-form')?.addEventListener('submit', handleAddStaff);

    // Default date logic (same as previous)
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));

    const isoString = monday.toISOString().split('T')[0];
    
    document.getElementById('week-start-date').value = isoString;
    loadRoster(isoString);

    updateShiftSummaries();
    lucide.createIcons();
});