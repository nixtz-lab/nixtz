/**
 * staff_roster.js
 * FINAL STABLE VERSION. Fixes: Generate Button & Fixed Day Off logic.
 */

// Global constants and API endpoints
window.API_BASE_URL = window.API_BASE_URL || window.location.origin;
const API_URL = `${window.API_BASE_URL}/api/staff/roster`;
const PROFILE_API_URL = `${window.API_BASE_URL}/api/staff/profile`;

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_OFF_MARKER = 'หยุด'; 
const AUTH_TOKEN_KEY = localStorage.getItem('nixtz_auth_token') ? 'nixtz_auth_token' : 'tmt_auth_token'; 

// --- AUTHENTICATION ---
function getAuthStatus() { return !!localStorage.getItem(AUTH_TOKEN_KEY); }
function getUsernameFromToken() { return localStorage.getItem('nixtz_username') || 'Superwayno'; }

function updateAuthUI() {
    const isLoggedIn = getAuthStatus(); 
    const authButtons = document.getElementById('auth-buttons-container');
    const userMenu = document.getElementById('user-menu-container');
    const usernameDisplay = document.getElementById('username-display');

    if (isLoggedIn) {
        if(authButtons) authButtons.style.display = 'none';
        if(userMenu) userMenu.style.display = 'flex';
        if(usernameDisplay) usernameDisplay.textContent = getUsernameFromToken(); 
    } else {
        if(authButtons) authButtons.style.display = 'flex';
        if(userMenu) userMenu.style.display = 'none';
    }
}

// --- CORE ROSTER FUNCTIONS ---

// 1. ADD ROW
function addStaffRow(initialData = {}) {
    const rosterBody = document.getElementById('roster-body');
    if (!rosterBody) return;
    
    // Clear placeholder
    if (rosterBody.innerHTML.includes('Click Regenerate') || rosterBody.innerHTML.includes('Loading')) {
        rosterBody.innerHTML = '';
    }
    
    const staffRowHtml = `
        <tr data-id="${initialData.employeeId || 'temp'}">
            <td class="p-3 text-left font-medium text-white border-b border-gray-800">
                ${initialData.employeeName} <span class="text-xs text-gray-500">(${initialData.employeeId})</span>
            </td>
            ${DAYS.map(day => {
                // Find shift for this day
                const dayData = initialData.weeklySchedule?.find(d => d.dayOfWeek === day);
                const shiftInfo = dayData?.shifts[0] || {};
                const val = shiftInfo.jobRole || DAY_OFF_MARKER;
                
                return `
                <td class="roster-cell bg-gray-900 border-l border-b border-gray-800 p-2 text-center text-sm" data-day="${day}">
                    <input type="text" class="duty-input text-white w-full text-center bg-transparent focus:outline-none" value="${val}" />
                </td>`;
            }).join('')}
        </tr>
    `;
    rosterBody.insertAdjacentHTML('beforeend', staffRowHtml);
}

// 2. LOAD ROSTER
async function loadRoster(startDateString) {
    if (!startDateString || !getAuthStatus()) return; 
    
    const rosterBody = document.getElementById('roster-body');
    rosterBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400">Loading...</td></tr>';

    try {
        const response = await fetch(`${API_URL}/${startDateString}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)}` }
        });
        const result = await response.json();

        rosterBody.innerHTML = ''; // Clear loading

        if (response.ok && result.success && Array.isArray(result.data) && result.data.length > 0) {
            result.data.forEach(data => addStaffRow(data));
        } else {
            rosterBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-500">No roster found. Click "Regenerate" (Green Button).</td></tr>';
        }
    } catch (error) {
        console.error("Load Roster Error:", error);
        rosterBody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-red-500">Connection Error.</td></tr>';
    }
}

// 3. REGENERATE ROSTER (The Fix)
window.forceRosterRegeneration = async function() {
    const dateInput = document.getElementById('week-start-date');
    const dateVal = dateInput ? dateInput.value : null;

    if (!dateVal || !getAuthStatus()) {
        alert("Please log in and select a date first.");
        return;
    }

    const confirmGen = confirm(`Generate NEW roster for week starting ${dateVal}? This will overwrite existing data.`);
    if (!confirmGen) return;

    // Show loading indicator
    const btn = document.querySelector('button[title="Regenerate Roster"]'); // Assuming the green button has this title or use onclick
    if(btn) btn.disabled = true;

    try {
        const response = await fetch(`${API_URL}/generate/${dateVal}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)}` }
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            // alert("Success! Roster generated.");
            loadRoster(dateVal); // Immediate reload
        } else {
            alert("Generation Failed: " + (result.message || "Unknown error"));
        }
    } catch (e) {
        console.error(e);
        alert("Network Error: Could not generate roster.");
    } finally {
        if(btn) btn.disabled = false;
    }
};

// 4. UTILS
window.snapToMonday = function(dateString) {
    const date = new Date(dateString);
    const day = date.getDay(); 
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    return date.toISOString().split('T')[0];
};

window.handleDateChange = function(input) {
    if(!input.value) return;
    const monday = window.snapToMonday(input.value);
    if(input.value !== monday) input.value = monday;
    
    // Update headers
    const start = new Date(monday);
    DAYS.forEach((d, i) => {
        const curr = new Date(start);
        curr.setDate(start.getDate() + i);
        const el = document.getElementById(`header-${d.toLowerCase()}`);
        if(el) el.innerHTML = `<span class="day-header">${d}</span><br><span class="date-header text-xs text-gray-500">${curr.getDate()}/${curr.getMonth()+1}</span>`;
    });

    loadRoster(monday);
};

// 5. MODAL STUBS (Simplified for functionality)
let staffCache = [];
window.showAddStaffModal = () => document.getElementById('add-staff-modal').classList.remove('hidden');
window.openStaffListModal = async () => {
    document.getElementById('staff-list-modal').classList.remove('hidden');
    const container = document.getElementById('staff-profiles-container');
    container.innerHTML = 'Loading...';
    
    const res = await fetch(PROFILE_API_URL, { headers: { 'Authorization': `Bearer ${localStorage.getItem(AUTH_TOKEN_KEY)}` } });
    const json = await res.json();
    if(json.success) {
        staffCache = json.data;
        container.innerHTML = staffCache.map(s => `
            <div class="flex justify-between p-2 border-b border-gray-700">
                <span>${s.name} (${s.position})</span>
                <button onclick="openEditModal('${s.employeeId}')" class="text-blue-400">Edit</button>
            </div>
        `).join('');
    }
};
window.openEditModal = (id) => {
    const s = staffCache.find(x => x.employeeId === id);
    if(!s) return;
    // Populate your edit modal IDs here
    // Example: document.getElementById('edit-name').value = s.name;
    document.getElementById('single-staff-modal').classList.remove('hidden');
};

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    
    // Set initial date to this Monday
    const today = new Date();
    const d = document.getElementById('week-start-date');
    if(d) {
        const monday = window.snapToMonday(today.toISOString());
        d.value = monday;
        window.handleDateChange(d);
    }
});