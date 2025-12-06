/**
 * service_admin.js
 */

if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = ''; 
}

let currentEditingUserId = null;
let currentItemConfig = { pickup: [], supply: [] }; // Global cache for item types

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

    const editForm = document.getElementById('edit-staff-form');
    if (editForm) {
        editForm.addEventListener('submit', handleSaveUserEdit);
    }
    
    // Handle Department Form Submission inside the modal
    const addDeptForm = document.getElementById('add-department-form');
    if (addDeptForm) {
        handleAddDeptForm.addEventListener('submit', handleAddDepartmentSubmit);
    }
    
    // NEW: Handle Item Config Form Submission
    const itemConfigForm = document.getElementById('item-config-form');
    if (itemConfigForm) {
        itemConfigForm.addEventListener('submit', handleSaveItemConfig);
    }

    document.addEventListener('click', closeDropdownOnOutsideClick);
    
    if (typeof window.updateServiceBanner === 'function') {
        window.updateServiceBanner();
    }

    fetchActiveServiceUsers();
    // NEW: Fetch item configuration on startup
    fetchItemConfig();
});

// ------------------------------------
// UI LOGIC
// ------------------------------------

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

// ------------------------------------
// DYNAMIC DROPDOWN MANAGEMENT (DEPARTMENTS)
// ------------------------------------

function getCurrentDepartmentOptions() {
    const select = document.getElementById('staff-department');
    if (!select) return [];
    return Array.from(select.options)
        .filter(option => option.value !== '')
        .map(option => ({ name: option.text.trim(), value: option.value.trim() }));
}

function updateDepartmentDropdowns(newDeptName, newContact) {
    const departmentName = newDeptName.trim();
    if (!departmentName) return;

    const selectIds = ['staff-department', 'edit-staff-department'];

    selectIds.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            if (!Array.from(select.options).some(opt => opt.value === departmentName)) {
                const option = document.createElement("option");
                option.text = departmentName;
                option.value = departmentName; 
                select.add(option);
            }
        }
    });

    const list = document.getElementById('current-departments-list');
    if (list) {
        if (!Array.from(list.children).some(li => li.textContent.trim().startsWith(departmentName))) {
            const listItem = document.createElement("li");
            // Display name and contact
            listItem.textContent = `${departmentName} (Ext: ${newContact})`;
            list.appendChild(listItem);
        }
    }
}

function populateDepartmentListForModal() {
    const list = document.getElementById('current-departments-list');
    if (!list) return;

    list.innerHTML = '';
    const currentOptions = getCurrentDepartmentOptions();
    currentOptions.forEach(dept => {
        const listItem = document.createElement("li");
        // NOTE: Contact info is not stored in the HTML option element, so we show the simple name.
        listItem.textContent = dept.name; 
        list.appendChild(listItem);
    });
}

function manageDepartments() {
    const modal = document.getElementById('manage-options-modal');
    if (modal) modal.style.display = 'flex';
    populateDepartmentListForModal();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}
window.manageDepartments = manageDepartments;

function closeManageOptionsModal() {
    const modal = document.getElementById('manage-options-modal');
    if (modal) modal.style.display = 'none';
    document.getElementById('add-department-form').reset();
}
window.closeManageOptionsModal = closeManageOptionsModal;

async function handleAddDepartmentSubmit(e) {
    e.preventDefault();
    const newDept = document.getElementById('new-department-name').value.trim();
    const newContact = document.getElementById('new-department-contact').value.trim(); // NEW FIELD
    
    if (newDept === "" || newContact === "") {
        return window.showMessage("Department name and contact are required.", true);
    }
    
    const existing = getCurrentDepartmentOptions().some(opt => opt.name.toLowerCase() === newDept.toLowerCase());
    
    if (existing) {
        window.showMessage(`Department "${newDept}" already exists.`, true);
        return;
    }

    updateDepartmentDropdowns(newDept, newContact); 
    window.showMessage(`Department "${newDept}" added. Contact: ${newContact}.`, false);
    e.target.reset();
}

// ------------------------------------
// ITEM MANAGEMENT LOGIC
// ------------------------------------

async function fetchItemConfig() {
    const token = localStorage.getItem('nixtz_service_auth_token');
    if (!token) return;

    try {
        const response = await fetch(`${window.API_BASE_URL}/api/laundry/items/config`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        
        if (response.ok && result.success) {
            currentItemConfig = result.data;
        } else {
            console.error('Failed to fetch item configuration:', result.message);
        }
    } catch (error) {
        console.error('Network error fetching item config:', error);
    }
}
window.fetchItemConfig = fetchItemConfig;

// Function to populate the modal lists
function populateItemManagementModal() {
    const pickupList = document.getElementById('pickup-items-list');
    const supplyList = document.getElementById('supply-items-list');
    
    if (!pickupList || !supplyList) return;

    // Helper to generate list item HTML (includes delete button)
    const createItemHtml = (item, type) => `
        <div class="flex justify-between items-center text-sm p-1.5 bg-gray-700/50 rounded-md" data-item="${item}">
            <span class="text-gray-300">${item}</span>
            <button type="button" onclick="removeItemTypeFromList('${item}', '${type}')" class="text-red-400 hover:text-red-500 transition">
                <i data-lucide="x" class="w-4 h-4"></i>
            </button>
        </div>
    `;

    pickupList.innerHTML = currentItemConfig.pickup.length > 0
        ? currentItemConfig.pickup.map(item => createItemHtml(item, 'pickup')).join('')
        : '<p class="text-gray-500 text-sm">No pickup items configured.</p>';
        
    supplyList.innerHTML = currentItemConfig.supply.length > 0
        ? currentItemConfig.supply.map(item => createItemHtml(item, 'supply')).join('')
        : '<p class="text-gray-500 text-sm">No supply items configured.</p>';

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Function to add a new item (triggered by buttons inside the modal)
function addItemTypeToList(listType) {
    const newItem = prompt(`Enter the new item name for ${listType}:`);
    if (newItem && newItem.trim()) {
        const item = newItem.trim();
        
        if (currentItemConfig[listType].includes(item)) {
            return window.showMessage(`Item "${item}" already exists in the ${listType} list.`, true);
        }

        currentItemConfig[listType].push(item);
        populateItemManagementModal(); // Re-render the lists
        window.showMessage(`Item "${item}" added to the list. Click Save to confirm.`, false);
    }
}
window.addItemTypeToList = addItemTypeToList; // Expose to HTML buttons

// Function to remove an item (triggered by x buttons inside the modal)
function removeItemTypeFromList(item, listType) {
    const index = currentItemConfig[listType].indexOf(item);
    if (index > -1) {
        currentItemConfig[listType].splice(index, 1);
        populateItemManagementModal(); // Re-render the lists
        window.showMessage(`Item "${item}" removed. Click Save to confirm.`, false);
    }
}
window.removeItemTypeFromList = removeItemTypeFromList; // Expose to HTML buttons


// Function for the new sidebar button: opens the Item Management Modal
function manageItemTypes() {
    const modal = document.getElementById('manage-items-modal');
    if (modal) modal.style.display = 'flex';
    populateItemManagementModal();
}
window.manageItemTypes = manageItemTypes;

function closeItemManagementModal() {
    const modal = document.getElementById('manage-items-modal');
    if (modal) modal.style.display = 'none';
}
window.closeItemManagementModal = closeItemManagementModal;


// Submit handler for the item configuration form (sends data to backend)
async function handleSaveItemConfig(e) {
    e.preventDefault();
    
    // Data is already updated in the global currentItemConfig object
    const payload = { 
        pickup: currentItemConfig.pickup, 
        supply: currentItemConfig.supply 
    };

    const token = localStorage.getItem('nixtz_service_auth_token');

    try {
        const response = await fetch(`${window.API_BASE_URL}/api/service/admin/items/config`, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (response.ok && result.success) {
            window.showMessage("Item lists updated and saved to server!", false);
            closeItemManagementModal();
            fetchItemConfig(); // Refresh cache for confirmation
        } else {
            window.showMessage(result.message || 'Failed to save item lists.', true);
        }
    } catch (error) {
        console.error('Item Update Error:', error);
        window.showMessage('Network error during item list save.', true);
    }
}


// ------------------------------------
// DATA FETCHING & RENDERING (STAFF LIST)
// ------------------------------------

async function fetchActiveServiceUsers() {
    const container = document.getElementById('active-users-list');
    const token = localStorage.getItem('nixtz_service_auth_token');
    
    if (!container || !token) return;

    container.innerHTML = '<p class="text-gray-500 text-center py-4">Loading active staff list...</p>';

    const cacheBuster = `?t=${new Date().getTime()}`;

    try {
        const response = await fetch(`${window.API_BASE_URL}/api/service/admin/staff-list${cacheBuster}`, {
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
        
        // Map Codes to Readable Names
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

        // Escaping data for onclick safety
        const safeName = encodeURIComponent(user.sname || '');
        const safeDept = encodeURIComponent(user.sdepartment || '');
        
        return `
        <tr class="bg-gray-900 border-b border-gray-800 hover:bg-gray-800 transition">
            <td class="px-4 py-3 font-medium text-white">${user.sname || 'N/A'}</td>
            <td class="px-4 py-3 text-gray-400">${user.semployeeId || 'N/A'}</td>
            <td class="px-4 py-3 text-gray-400">${user.sdepartment || 'N/A'}</td>
            <td class="px-4 py-3">
                <span class="px-2 py-1 text-xs font-bold rounded-full ${roleColor}">
                    ${displayRole}
                </span>
            </td>
            <td class="px-4 py-3 text-sm text-gray-500">${user.serviceScope}</td>
            <td class="px-4 py-3 text-right">
                <button onclick="openEditModal('${user._id}', decodeURIComponent('${safeName}'), decodeURIComponent('${safeDept}'), '${role}')" 
                        class="p-2 text-nixtz-secondary hover:text-white transition rounded-full hover:bg-gray-700" 
                        title="Edit User">
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

// ------------------------------------
// EDIT MODAL LOGIC
// ------------------------------------

function openEditModal(staffAccessId, currentName, currentDept, currentRole) {
    const modal = document.getElementById('edit-user-modal');
    if (!modal) {
        alert("Error: Edit Modal HTML missing.");
        return;
    }

    currentEditingUserId = staffAccessId;
    
    const nameInput = document.getElementById('edit-staff-name');
    const deptInput = document.getElementById('edit-staff-department');
    const roleInput = document.getElementById('edit-staff-role');
    const passInput = document.getElementById('edit-staff-password');
    
    // Set Values
    if(nameInput) nameInput.value = currentName;
    if(deptInput) deptInput.value = currentDept; 
    if(roleInput) roleInput.value = currentRole;
    if(passInput) passInput.value = ''; 

    modal.style.display = 'flex';
}
window.openEditModal = openEditModal;

function closeEditModal() {
    const modal = document.getElementById('edit-user-modal');
    if (modal) modal.style.display = 'none';
    currentEditingUserId = null;
}
window.closeEditModal = closeEditModal;

async function handleSaveUserEdit(e) {
    e.preventDefault();
    if (!currentEditingUserId) return;

    const newName = document.getElementById('edit-staff-name').value.trim();
    const newDept = document.getElementById('edit-staff-department').value;
    const newRole = document.getElementById('edit-staff-role').value;
    const newPassElement = document.getElementById('edit-staff-password');
    const newPass = newPassElement ? newPassElement.value.trim() : '';

    if (newPass && newPass.length < 8) {
        return window.showMessage("New password must be at least 8 characters.", true);
    }

    const token = localStorage.getItem('nixtz_service_auth_token');

    try {
        const response = await fetch(`${window.API_BASE_URL}/api/service/admin/update-staff/${currentEditingUserId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ 
                sname: newName, 
                sdepartment: newDept, 
                srole: newRole,
                spassword: newPass 
            })
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

// ------------------------------------
// CREATE STAFF LOGIC
// ------------------------------------

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
    if (department === "") {
        return window.showMessage("Please select an Assigned Department.", true);
    }


    const payload = { 
        sname: name,             
        semployeeId: semployeeId,
        spassword: password,     
        sdepartment: department, 
        srole: role              
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