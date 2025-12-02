/**
 * service_login.js
 * Handles the authentication process exclusively for service staff using the dedicated service_auth.html page.
 */

// **CRITICAL FIX:** Removed the duplicate declaration of SERVICE_TOKEN_KEY.
// The constant is now solely loaded from the global utility script (service_script.js).

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form'); 
    
    // Check if the form is present before attaching listeners
    if (loginForm) {
        // We attach the handleServiceLogin handler to the form element itself
        // to prevent conflicts with other auth scripts if they were loaded.
        loginForm.addEventListener('submit', handleServiceLogin); 
    }
    
    // Attach listener for Forgot Password link
    const forgotPasswordLink = document.getElementById('forgot-password-link'); 
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', handleForgotPassword); 
    }
});

/**
 * NEW FUNCTION: Toggles visibility of the password field and changes the icon.
 */
window.togglePasswordVisibility = function() {
    const passwordField = document.getElementById('login-password');
    const icon = document.getElementById('toggle-icon');

    if (passwordField.type === 'password') {
        passwordField.type = 'text';
        icon.setAttribute('data-lucide', 'eye');
    } else {
        passwordField.type = 'password';
        icon.setAttribute('data-lucide', 'eye-off');
    }
    // Re-render the Lucide icon to ensure it displays correctly after changing the attribute
    if (typeof lucide !== 'undefined') lucide.createIcons();
};


/**
 * Handles the actual login API call.
 */
async function handleServiceLogin(e) {
    e.preventDefault(); 
    
    // Renamed 'email' to 'loginValue' for clarity (it handles Employee ID or Email)
    const loginValue = document.getElementById('login-email').value.trim(); 
    const password = document.getElementById('login-password').value.trim();

    if (!loginValue || !password) {
        return window.showMessage("Enter your ID/Username and password.", true); 
    }

    try {
        // CRITICAL FIX: Using a relative path to call the new, dedicated service login endpoint.
        const response = await fetch('/api/serviceauth/login', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ email: loginValue, password }) 
        });
        
        const data = await response.json(); 

        if (response.ok && data.success) {
            
            // --- CRITICAL FIX: Use the dedicated service key and prefixed profile data ---
            
            // 1. Save dedicated service token
            localStorage.setItem(SERVICE_TOKEN_KEY, data.token); 
            
            // 2. ISOLATE PROFILE DATA (using nixtz_service_ prefix)
            localStorage.setItem('nixtz_service_username', data.username); 
            localStorage.setItem('nixtz_service_user_role', data.role);
            localStorage.setItem('nixtz_service_user_membership', data.membership || 'none');
            
            // 3. Check access roles
            const serviceRoles = ['standard', 'admin', 'superadmin']; 
            if (serviceRoles.includes(data.role)) { 
                window.showMessage("Service login successful! Redirecting to Staff Panel.", false); 
                setTimeout(() => {
                    // Redirect to the specific Staff Panel
                    window.location.href = 'laundry_staff.html'; 
                }, 500);
            } else {
                // Deny access if the user is only 'pending' or a restricted role
                if (typeof window.handleLogout === 'function') {
                    // Here we ensure the new service key is cleared if access is denied.
                    localStorage.removeItem(SERVICE_TOKEN_KEY); 
                }
                window.showMessage("Access Denied: Your account role does not permit service access.", true); 
            }

        } else {
            window.showMessage(data.message || 'Login failed. Invalid credentials or pending approval.', true); 
        }
    } catch (error) {
        console.error('Login Error:', error); 
        window.showMessage('Network error during login.', true); 
    }
}

/**
 * Handles the forgot password prompt (reused from auth_script.js logic).
 */
async function handleForgotPassword() {
    // Note: This is left calling the core reset route, as password reset functionality is usually universal.
    const email = prompt("Enter your email to receive a reset link:"); 
    if (!email) return; 

    try {
        const res = await fetch('/api/auth/forgot-password', {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ email: email.trim() }) 
        });
        const data = await res.json(); 
        window.showMessage(data.message, !data.success); 
    } catch (e) {
        window.showMessage("Network error sending request.", true); 
    }
}