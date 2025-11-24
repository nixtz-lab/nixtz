/**
 * service_auth_script.js
 * Enforces 'login' mode and hides the registration option when the user is redirected 
 * from a service-specific page (like laundry staff or admin) using the ?service=true flag.
 * * MODIFICATION: This script now handles the login submission directly, overriding the 
 * email-based login in auth_script.js, to use Employee ID (username) instead.
 */

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const isServiceRedirect = urlParams.get('service') === 'true';

    // If the service flag is not present, let auth_script.js handle the standard flow.
    if (!isServiceRedirect) {
        return;
    }

    // --- References ---
    const pageTitle = document.getElementById('page-title');
    const formTitle = document.getElementById('form-title');
    const formSubtitle = document.getElementById('form-subtitle');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const switchTextP = document.getElementById('switch-text');
    
    // Get inputs from the login form (Assuming you updated the HTML with these IDs)
    const staffIdInput = document.getElementById('login-email'); // We hijack the existing email field ID
    const passwordInput = document.getElementById('login-password');
    const emailLabel = document.querySelector('label[for="login-email"]');
    
    // Helper to use global showMessage or fallback to alert
    const showMsg = (text, isError) => {
        if (typeof window.showMessage === 'function') {
            window.showMessage(text, isError);
        } else {
            alert(text);
        }
    };


    // 1. Force LOGIN mode display and update text/labels
    if(pageTitle) pageTitle.textContent = 'Nixtz | Service Sign In';
    if(formTitle) formTitle.textContent = 'Service Access Required.';
    if(formSubtitle) formSubtitle.textContent = 'Please sign in with your authorized staff credentials.';
    
    // Change label text from Email to Employee ID/Username
    if(emailLabel) emailLabel.textContent = 'Employee ID / Username';
    if(staffIdInput) staffIdInput.placeholder = 'Enter Employee ID or Username';


    // Ensure the correct forms are visible/hidden
    if(loginForm) loginForm.classList.remove('hidden');
    if(registerForm) registerForm.classList.add('hidden'); 

    // 2. Hide/override the registration switch link
    if(switchTextP) {
        switchTextP.innerHTML = `<p class="text-gray-400">Account creation is managed by the system administrator.</p>`;
    }
    
    // --- OVERRIDE LOGIN SUBMISSION LOGIC ---
    
    if (loginForm) {
        // Remove the original event listener from auth_script.js to prevent conflicts
        // This is necessary because the original script submits 'email' and 'password'.
        if (typeof loginForm.handleAuthSubmit === 'function') { 
            loginForm.removeEventListener('submit', loginForm.handleAuthSubmit);
        }
        
        // Add the new, service-specific handler
        loginForm.addEventListener('submit', handleServiceAuthSubmit);
    }
    
    async function handleServiceAuthSubmit(e) {
        e.preventDefault();
        
        // 1. COLLECT DATA: Use Employee ID (maps to username on backend)
        const employeeId = staffIdInput?.value.trim(); 
        const password = passwordInput?.value.trim();
        
        if (!employeeId || !password) {
             return showMsg("Please enter your Employee ID and password.", true);
        }
        
        // 2. Prepare Payload: Send Employee ID as 'email' field for the API
        // NOTE: This relies on the backend's /api/auth/login route being updated to 
        // accept EITHER email OR username/employeeId in the 'email' field.
        const data = { email: employeeId, password: password }; 
        const url = '/api/auth/login'; 
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            const result = await response.json();
            
            if (response.ok && result.success) {
                showMsg("Service Login successful!", false);
                // e.target.reset(); // Don't reset immediately, shows user their ID is valid

                // 3. Save session data (Using correct nixtz_ keys)
                // Note: If you haven't corrected the key in your auth_script.js, 
                // you must ensure the correct key is used here and globally.
                localStorage.setItem('nixtz_auth_token', result.token); 
                localStorage.setItem('nixtz_username', result.username); 
                localStorage.setItem('nixtz_user_role', result.role);
                localStorage.setItem('nixtz_user_membership', result.membership || 'none');
                
                // 4. Redirect to the Staff Panel
                setTimeout(() => {
                    window.location.href = 'laundry_staff.html'; 
                }, 1000);

            } else {
                showMsg(result.message || 'Access denied. Invalid Employee ID or password.', true);
            }

        } catch (error) {
            console.error('Service Auth Error:', error);
            showMsg('Network error. Check server status.', true);
        }
    }
    
    // Note: All other form submission handlers (forgot password) remain managed by auth_script.js.
});