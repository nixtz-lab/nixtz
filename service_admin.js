/**
 * service_admin.js
 */

if (typeof window.API_BASE_URL === 'undefined') {
    window.API_BASE_URL = ''; 
}

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

    document.addEventListener('click', closeDropdownOnOutsideClick);
    
    if (typeof window.updateServiceBanner === 'function') {
        window.updateServiceBanner();
    }
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
        } else {
            window.showMessage(result.message || 'Failed to create staff account.', true);
        }
    } catch (error) {
        console.error('Staff Creation Error:', error);
        window.showMessage('Network error.', true);
    }
}