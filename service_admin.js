/**
 * service_admin.js
 */

if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = ''; 
}

let currentEditingUserId = null;

document.addEventListener('DOMContentLoaded', () => {
    if (!window.getServiceAuthStatus()) {
        window.checkServiceAccessAndRedirect('service_admin.html');
        return; 
    }

    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    const createStaffForm = document.getElementById('create-staff-form');
    if (createStaffForm) {
        createStaffForm.addEventListener('submit', handleCreateStaffFormSubmit);
    }

    // Attach listener for the Edit User Modal Form
    const editForm = document.getElementById('edit-staff-form');
    if (editForm) {
        editForm.addEventListener('submit', handleSaveUserEdit);
    }

    document.addEventListener('click', closeDropdownOnOutsideClick);
    
    if (typeof window.updateServiceBanner === 'function') {
        window.updateServiceBanner();
    }

    fetchActiveServiceUsers();
});

function toggleUserDropdown() {
    const dropdown = document.getElementById('user-dropdown');
    if (dropdown) {
        const isHidden = dropdown.style.display === 'none' || dropdown.style.display === '';
        dropdown.style.display = isHidden ? 'block' : 'none';
        if (isHidden && typeof lucide !== 'undefined') lucide.createIcons();
    }
}
window.toggleUserDropdown = toggleUserDropdown; 

function closeDropdownOnOutsideClick(event) {
    const userContainer = document.getElementById('user-display-container');
    const dropdown = document.getElementById('user-dropdown');
    const displayButton = document.getElementById('user-display-button');
    if (dropdown && dropdown.style.display === 'block' && 
        userContainer && !userContainer.contains(event.target) && 
        !displayButton.contains(event.target)) {
        dropdown.style.display = 'none';
    }
}

function manageDepartments() {
    const newDept = prompt("Enter the name of the new Department:");
    if (newDept && newDept.trim() !== "") {
        const select = document.getElementById('staff-department');
        const option = document.createElement("option");
        option.text = newDept.trim();
        option.value = newDept.trim().replace(/\s+/g, ''); 
        select.add(option);
        select.value = option.value; 
        window.showMessage(`Department "${newDept}" added to list.`, false);
    }
}
window.manageDepartments = manageDepartments;

async function fetchActiveServiceUsers() {
    const container = document.getElementById('active-users-list');
    const token = localStorage.getItem('nixtz_service_auth_token');
    
    if (!container || !token) return;

    container.innerHTML = '<p class="text-gray-500 text-center py-4">Loading active staff list...</p>';

    try {
        const response = await fetch(`${window.API_BASE_URL}/api/service/admin/staff-list`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const result = await response.json();

        if (response.ok && result.success) {
            if (result.data.length === 0) {
                container.innerHTML = '<p class="text-gray-400 text-center py-4">No active service staff found.</p>';
            } else {
                renderUserList(result.data);
            }
        } else {
            container.innerHTML = `<p class="text-red-400 text-center py-4">${result.message || 'Failed to load users.'}</p>`;
        }
    } catch (error) {
        console.error('Fetch Users Error:', error);
        container.innerHTML = '<p class="text-red-400 text-center py-4">Network error loading users.</p>';
    }
}
window.fetchActiveServiceUsers = fetchActiveServiceUsers;

function renderUserList(users) {
    const container = document.getElementById('active-users-list');
    if (!container) return;

    const rows = users.map(user => {
        const role = user.suser ? user.suser.srole : 'unknown';
        
        // --- FIX: Map Raw Codes to Readable Names ---
        const roleNames = {
            'admin': 'Service Admin',
            'standard': 'Laundry Staff',
            'request_only': 'Request Staff',
            'unknown': 'Unknown'
        };
        const displayRole = roleNames[role] || role.toUpperCase();

        // Color Logic
        let roleColor = 'bg-gray-700 text-gray-300';
        if (role === 'admin') roleColor = 'bg-purple-600 text-white';
        if (role === 'request_only') roleColor = 'bg-blue-600 text-white';
        if (role === 'standard') roleColor = 'bg-nixtz-primary text-white';

        // Escaping data
        const safeName = user.sname.replace(/'/g, "\\'");
        const safeDept = user.sdepartment.replace(/'/g, "\\'");
        
        return `
        <tr class="bg-gray-900 border-b border-gray-800 hover:bg-gray-800 transition">
            <td class="px-4 py-3 font-medium text-white">${user.sname}</td>
            <td class="px-4 py-3 text-gray-400">${user.semployeeId}</td>
            <td class="px-4 py-3 text-gray-400">${user.sdepartment}</td>
            <td class="px-4 py-3">
                <span class="px-2 py-1 text-xs font-bold rounded-full ${roleColor}">
                    ${displayRole}
                </span>
            </td>
            <td class="px-4 py-3 text-sm text-gray-500">${user.serviceScope}</td>
            <td class="px-4 py-3 text-right">
                <button onclick="openEditModal('${user._id}', '${safeName}', '${safeDept}', '${role}')" 
                        class="text-nixtz-secondary hover:text-white transition" title="Edit User">
                    <i data-lucide="edit-2" class="w-4 h-4"></i>
                </button>
            </td>
        </tr>
    `}).join('');

    container.innerHTML = `
        <div class="overflow-x-auto rounded-lg">
            <table class="min-w-full divide-y divide-gray-700">
                <thead class="bg-gray-800">
                    <tr>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Name</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">ID</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Dept</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Role</th>
                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Scope</th>
                        <th class="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Actions</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-700 bg-gray-900">
                    ${rows}
                </tbody>
            </table>
        </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// --- EDIT MODAL LOGIC ---

function openEditModal(staffAccessId, currentName, currentDept, currentRole) {
    currentEditingUserId = staffAccessId;
    
    document.getElementById('edit-staff-name').value = currentName;
    document.getElementById('edit-staff-department').value = currentDept; 
    document.getElementById('edit-staff-role').value = currentRole;

    document.getElementById('edit-user-modal').style.display = 'flex';
}
window.openEditModal = openEditModal;

function closeEditModal() {
    document.getElementById('edit-user-modal').style.display = 'none';
    currentEditingUserId = null;
}
window.closeEditModal = closeEditModal;

async function handleSaveUserEdit(e) {
    e.preventDefault();
    if (!currentEditingUserId) return;

    const newName = document.getElementById('edit-staff-name').value.trim();
    const newDept = document.getElementById('edit-staff-department').value;
    const newRole = document.getElementById('edit-staff-role').value;

    const token = localStorage.getItem('nixtz_service_auth_token');

    try {
        const response = await fetch(`${window.API_BASE_URL}/api/service/admin/update-staff/${currentEditingUserId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ sname: newName, sdepartment: newDept, srole: newRole })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            window.showMessage("User updated successfully.", false);
            closeEditModal();
            fetchActiveServiceUsers(); 
        } else {
            window.showMessage(result.message || 'Failed to update user.', true);
        }
    } catch (error) {
        console.error('Update Error:', error);
        window.showMessage('Network error updating user.', true);
    }
}

async function handleCreateStaffFormSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('staff-name').value.trim();
    const semployeeId = document.getElementById('staff-employee-id').value.trim();
    const password = document.getElementById('staff-password').value.trim();
    const department = document.getElementById('staff-department').value;
    const role = document.getElementById('staff-role').value;

    if (!name || !semployeeId || !password || !department || !role) {
        return window.showMessage("All fields are required.", true);
    }
    if (password.length < 8) {
         return window.showMessage("Password must be at least 8 characters long.", true);
    }

    const payload = { 
        sname: name, semployeeId: semployeeId, spassword: password, 
        sdepartment: department, srole: role              
    }; 
    
    const token = localStorage.getItem('nixtz_service_auth_token');

    try {
        const response = await fetch(`${window.API_BASE_URL}/api/service/admin/create-staff-v2`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (response.ok && result.success) {
            window.showMessage(result.message, false);
            e.target.reset(); 
            fetchActiveServiceUsers();
        } else {
            window.showMessage(result.message || 'Failed to create staff account.', true);
        }
    } catch (error) {
        console.error('Staff Creation Error:', error);
        window.showMessage('Network error.', true);
    }
}