/**
 * service_script.js
 * Consolidated script for Laundry Service pages (laundry_auth.html, laundry_staff.html, etc.).
 * Handles service-specific authentication and access checks.
 */

// --- CORE SERVICE UTILITIES & AUTH CHECKERS ---
const SERVICE_TOKEN_KEY = 'nixtz_service_auth_token'; // Dedicated service token key

/**
 * Returns true if a service token is present.
 */
window.getServiceAuthStatus = () => {
    // Check the dedicated service key
    return localStorage.getItem(SERVICE_TOKEN_KEY) !== null;
};

/**
 * Handles access control for service-specific pages.
 */
window.checkServiceAccessAndRedirect = (targetPage) => {
    if (!window.getServiceAuthStatus()) {
        window.showMessage("Access Denied. Please sign in to the service panel.", true);
        setTimeout(() => {
            // Redirect to the service login page
            window.location.href = `service_auth.html?service=true`;
        }, 500);
        return false;
    }
    // If authenticated, proceed.
    window.location.href = targetPage;
    return true;
};

// Helper to use global showMessage or fallback to console.error
const showMsg = (text, isError) => {
    if (typeof window.showMessage === 'function') {
        window.showMessage(text, isError);
    } else {
        console.error(`AUTH MSG (${isError ? 'ERROR' : 'INFO'}): ${text}`);
    }
};

// --- SERVICE LOGIN FORM HANDLER ---

/**
 * Handles the service login process (designed to run on service_auth.html).
 */
async function handleServiceLogin(e) {
    e.preventDefault();
    
    // Assumes the HTML uses IDs: login-email (for ID/Username) and login-password
    const loginValue = document.getElementById('login-email')?.value.trim();
    const password = document.getElementById('login-password')?.value.trim();

    if (!loginValue || !password) {
        return showMsg("Please enter your Employee ID/Username and password.", true);
    }
    
    // Prepare Payload
    const data = { email: loginValue, password: password };
    
    // CRITICAL FIX: Use the dedicated service login route
    const url = `${window.API_BASE_URL}/api/serviceauth/login`; 
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        const result = await response.json();
        
        if (response.ok && result.success) {
            
            // 1. Save session data using the dedicated SERVICE TOKEN KEY
            localStorage.setItem(SERVICE_TOKEN_KEY, result.token);
            
            // 2. ISOLATE PROFILE DATA using nixtz_service_ prefix
            localStorage.setItem('nixtz_service_username', result.username);
            localStorage.setItem('nixtz_service_user_role', result.role);
            localStorage.setItem('nixtz_service_user_membership', result.membership || 'none');
            
            showMsg("Service Login successful! Redirecting to Staff Panel.", false);
            
            // 3. Redirect to the Staff Panel
            setTimeout(() => {
                window.location.href = 'laundry_staff.html';
            }, 1000);

        } else {
            showMsg(result.message || 'Access denied. Invalid credentials.', true);
        }

    } catch (error) {
        console.error('Service Auth Error:', error);
        showMsg('Network error. Check server status.', true);
    }
}
window.handleServiceLogin = handleServiceLogin;


// --- INITIAL SETUP ---
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    
    if (loginForm) {
        // --- Logic specific to service_auth.html ---
        const urlParams = new URLSearchParams(window.location.search);
        const isServiceRedirect = urlParams.get('service') === 'true';

        if (isServiceRedirect) {
            // Hijack the form to use service login logic
            loginForm.addEventListener('submit', handleServiceLogin);
        }
    }
});