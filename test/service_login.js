/**
 * service_login.js
 * Handles the authentication process exclusively for service staff using the dedicated service_auth.html page.
 */

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form'); // Assumes HTML ID changed to 'login-form'
    
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
        // We must send the value as 'email' because the backend /api/auth/login 
        // expects that key, and the backend is assumed to check (email OR username).
        const response = await fetch(`${window.API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: loginValue, password })
        });
        
        const data = await response.json();

        if (response.ok && data.success) {
            
            // --- UPDATED LOCAL STORAGE KEYS FOR CONSISTENCY ---
            localStorage.setItem('nixtz_auth_token', data.token); 
            localStorage.setItem('nixtz_username', data.username); // Changed tmt_ to nixtz_
            localStorage.setItem('nixtz_user_role', data.role);    // Changed tmt_ to nixtz_
            localStorage.setItem('nixtz_user_membership', data.membership || 'none'); // Changed tmt_ to nixtz_
            localStorage.setItem('nixtz_page_access', data.pageAccess);
            
            // Check if the user has access to the service pages (standard, admin, superadmin)
            const serviceRoles = ['standard', 'admin', 'superadmin'];
            if (serviceRoles.includes(data.role)) {
                window.showMessage("Service login successful! Redirecting to Staff Panel.", false);
                setTimeout(() => {
                    // Redirect to the specific Staff Panel
                    window.location.href = 'laundry_staff.html'; // Changed redirect target
                }, 500);
            } else {
                // Deny access if the user is only 'pending' or a restricted role
                if (typeof window.handleLogout === 'function') {
                    window.handleLogout(); // Clear token immediately
                } else {
                    localStorage.removeItem('nixtz_auth_token'); // Manual clear
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