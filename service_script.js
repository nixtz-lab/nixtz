/**
 * service_script.js
 * Consolidated script for Laundry Service pages.
 * Handles service-specific authentication, access checks, and dynamic redirects.
 */

// --- CORE SERVICE UTILITIES & AUTH CHECKERS ---
const SERVICE_TOKEN_KEY = 'nixtz_service_auth_token'; 

// Global Message Display
window.showMessage = (message, isError = false) => {
    const box = document.getElementById('message-box');
    const text = document.getElementById('message-text');

    if (!box || !text) return;
    
    box.className = 'fixed top-4 right-4 p-4 rounded-lg shadow-2xl z-[9999] opacity-0 transition-opacity duration-300 text-white';
    box.style.display = 'block';

    if (isError) {
        box.classList.add('bg-red-600');
    } else {
        box.classList.add('bg-nixtz-secondary');
    }

    text.textContent = message;
    
    setTimeout(() => {
        box.classList.remove('opacity-0');
        box.classList.add('opacity-100');
    }, 50);

    setTimeout(() => {
        box.classList.remove('opacity-100');
        box.classList.add('opacity-0');
        setTimeout(() => {
            box.style.display = 'none';
        }, 300);
    }, 5000);
};

window.getServiceAuthStatus = () => {
    return localStorage.getItem(SERVICE_TOKEN_KEY) !== null;
};

// Access Control with Session Storage Redirect
window.checkServiceAccessAndRedirect = (targetPage) => {
    if (!window.getServiceAuthStatus()) {
        window.showMessage("Access Denied. Please sign in.", true);
        
        // SAVE the target page to session storage (more reliable than URL params)
        sessionStorage.setItem('service_redirect_url', targetPage);
        
        setTimeout(() => {
            window.location.href = 'service_auth.html?service=true';
        }, 500);
        return false;
    }
    return true;
};

const showMsg = (text, isError) => {
    if (typeof window.showMessage === 'function') {
        window.showMessage(text, isError); 
    } else {
        console.error(text); 
    }
};

// --- BANNER DISPLAY LOGIC ---
function updateServiceBanner() {
    const token = localStorage.getItem(SERVICE_TOKEN_KEY);
    const username = localStorage.getItem('nixtz_service_username'); 
    const role = localStorage.getItem('nixtz_service_user_role'); 
    
    const usernameDisplayElement = document.getElementById('username-display');
    const userContainer = document.getElementById('user-display-container'); // Standardized ID
    
    const adminButton = document.getElementById('admin-button'); 
    const staffPanelButton = document.getElementById('staff-panel-button'); 
    const loginButtons = document.getElementById('auth-buttons-container'); 
    const defaultLogoutButton = document.getElementById('default-logout-button');

    if (token && username && role) {
        // LOGGED IN
        if (userContainer) userContainer.style.display = 'flex'; 
        if (loginButtons) loginButtons.style.display = 'none';
        if (defaultLogoutButton) defaultLogoutButton.style.display = 'none'; 
        
        if (usernameDisplayElement) {
             usernameDisplayElement.innerHTML = `${username} <span class="hidden sm:inline font-normal opacity-75">(${role})</span>`;
        }
        
        // Buttons
        const isAdmin = ['admin', 'superadmin'].includes(role);
        if (adminButton) adminButton.style.display = isAdmin ? 'block' : 'none';
        
        if (staffPanelButton) {
             const isStaff = ['standard', 'admin', 'superadmin'].includes(role);
             staffPanelButton.style.display = isStaff ? 'block' : 'none';
        }
    } else {
        // LOGGED OUT
        if (userContainer) userContainer.style.display = 'none';
        if (adminButton) adminButton.style.display = 'none';
        if (staffPanelButton) staffPanelButton.style.display = 'none';
        if (loginButtons) loginButtons.style.display = 'flex'; 
        if (defaultLogoutButton) defaultLogoutButton.style.display = 'block'; 
    }
}
window.updateServiceBanner = updateServiceBanner;

// Helper to save redirect before clicking login link
window.setLoginRedirect = (page) => {
    sessionStorage.setItem('service_redirect_url', page);
};

// --- LOGIN HANDLER ---
async function handleServiceLogin(e) {
    e.preventDefault(); 
    
    const loginValue = document.getElementById('login-email')?.value.trim(); 
    const password = document.getElementById('login-password')?.value.trim(); 

    if (!loginValue || !password) return showMsg("Please enter credentials.", true); 
    
    const data = { email: loginValue, password: password }; 
    const url = `${window.API_BASE_URL}/api/serviceauth/login`; 
    
    try {
        const response = await fetch(url, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(data), 
        });

        const result = await response.json(); 
        
        if (response.ok && result.success) {
            localStorage.setItem(SERVICE_TOKEN_KEY, result.token); 
            localStorage.setItem('nixtz_service_username', result.username); 
            localStorage.setItem('nixtz_service_user_role', result.role); 
            
            showMsg("Login successful!", false); 
            
            // --- ROBUST REDIRECT CHECK ---
            // 1. Check Session Storage first
            const storedRedirect = sessionStorage.getItem('service_redirect_url');
            // 2. Check URL param second
            const urlParams = new URLSearchParams(window.location.search);
            const paramRedirect = urlParams.get('redirect');
            
            const finalRedirect = storedRedirect || paramRedirect || 'laundry_staff.html';

            // Clear the storage so it doesn't persist forever
            sessionStorage.removeItem('service_redirect_url');

            setTimeout(() => {
                window.location.href = finalRedirect;
            }, 1000);

        } else {
            showMsg(result.message || 'Access denied.', true); 
        }

    } catch (error) {
        console.error('Auth Error:', error); 
        showMsg('Network error.', true); 
    }
}
window.handleServiceLogin = handleServiceLogin;

window.handleServiceLogout = () => {
    localStorage.removeItem(SERVICE_TOKEN_KEY);
    localStorage.removeItem('nixtz_service_username');
    localStorage.removeItem('nixtz_service_user_role');
    sessionStorage.removeItem('service_redirect_url'); // Clean up
    window.location.href = 'service_auth.html';
};

// --- INITIAL SETUP ---
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form'); 
    
    if (loginForm) {
        const urlParams = new URLSearchParams(window.location.search); 
        const isServiceRedirect = urlParams.get('service') === 'true'; 

        if (isServiceRedirect) {
            loginForm.addEventListener('submit', handleServiceLogin); 
        }
    }
});