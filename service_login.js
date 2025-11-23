/**
 * service_login.js
 * Handles the authentication process exclusively for service staff using the dedicated service_auth.html page.
 */

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('service-login-form');
    
    if (loginForm) {
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
    
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();

    if (!email || !password) {
        return window.showMessage("Enter email and password.", true);
    }

    try {
        const response = await fetch(`${window.API_BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();

        if (response.ok && data.success) {
            // Save Data (using nixtz_ and tmt_ keys for compatibility)
            localStorage.setItem('nixtz_auth_token', data.token); 
            localStorage.setItem('tmt_username', data.username);
            localStorage.setItem('tmt_user_role', data.role);
            localStorage.setItem('tmt_user_membership', data.membership || 'none');
            localStorage.setItem('nixtz_page_access', data.pageAccess);
            
            // Check if the user has access to the service pages (standard, admin, superadmin)
            const serviceRoles = ['standard', 'admin', 'superadmin'];
            if (serviceRoles.includes(data.role)) {
                window.showMessage("Service login successful!", false);
                setTimeout(() => {
                    // Redirect to the general business dashboard after successful login
                    window.location.href = 'business_dashboard.html'; 
                }, 500);
            } else {
                // Deny access if the user is only 'pending' or a restricted role
                if (typeof window.handleLogout === 'function') {
                    window.handleLogout(); // Clear token immediately
                } else {
                    localStorage.removeItem('nixtz_auth_token'); // Manual clear if handleLogout isn't available yet
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