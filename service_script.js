/**
 * service_script.js
 * Consolidated script for Laundry Service pages (laundry_auth.html, laundry_staff.html, etc.).
 * Handles service-specific authentication and access checks.
 */

// --- CORE SERVICE UTILITIES & AUTH CHECKERS ---
const SERVICE_TOKEN_KEY = 'nixtz_service_auth_token'; // Dedicated service token key

// 🚨 CRITICAL FIX: Define the global window.showMessage function here
window.showMessage = (message, isError = false) => {
    const box = document.getElementById('message-box');
    const text = document.getElementById('message-text');

    if (!box || !text) {
        console.warn('Cannot display message: Message box elements not found.');
        console.error(message);
        return;
    }
    
    // Clear previous classes and reset box
    box.className = 'fixed top-4 right-4 p-4 rounded-lg shadow-2xl z-[9999] opacity-0 transition-opacity duration-300 text-white';
    box.style.display = 'block';

    // Apply color based on type
    if (isError) {
        box.classList.add('bg-red-600');
    } else {
        box.classList.add('bg-nixtz-secondary'); // Use your success/primary color
    }

    text.textContent = message;
    
    // Show the box
    setTimeout(() => {
        box.classList.remove('opacity-0');
        box.classList.add('opacity-100');
    }, 50);

    // Hide after 5 seconds
    setTimeout(() => {
        box.classList.remove('opacity-100');
        box.classList.add('opacity-0');
        // Delay display: none until transition is complete
        setTimeout(() => {
            box.style.display = 'none';
        }, 300);
    }, 5000);
};


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
        // Use the newly defined global function
        window.showMessage("Access Denied. Please sign in to the service panel.", true);
        setTimeout(() => {
            // Redirect to the service login page with redirect parameter
            // FIX: Ensure we pass the current page so we can come back!
            const currentPage = window.location.pathname.split('/').pop() || 'index.html'; 
            // If targetPage is provided use it, otherwise use current page
            const redirectDest = targetPage || currentPage;
            
            window.location.href = `service_auth.html?service=true&redirect=${redirectDest}`;
        }, 500);
        return false;
    }
    // If authenticated, proceed.
    // If targetPage is different from current page, redirect
    if (targetPage && window.location.pathname.split('/').pop() !== targetPage) {
         window.location.href = targetPage;
    }
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

// --- BANNER DISPLAY LOGIC (NEW FEATURE) ---

/**
 * Function to update the header banner based on the isolated service user session.
 */
function updateServiceBanner() {
    // 1. Get isolated data from local storage
    const token = localStorage.getItem(SERVICE_TOKEN_KEY);
    const username = localStorage.getItem('nixtz_service_username'); 
    const role = localStorage.getItem('nixtz_service_user_role'); 
    
    // --- Target IDs on your HTML pages (Checking for both possibilities) ---
    const usernameDisplayElement = document.getElementById('username-display');
    const requestPageUserContainer = document.getElementById('user-menu-container'); // Used by laundry_request.html
    const staffPageUserContainer = document.getElementById('user-display-container'); // Used by laundry_staff.html, service_admin.html
    
    // Select the container that is actually present on the page
    const activeUserContainer = requestPageUserContainer || staffPageUserContainer;
    
    const adminButton = document.getElementById('admin-button'); 
    const staffPanelButton = document.getElementById('staff-panel-button'); 
    const loginButtons = document.getElementById('auth-buttons-container'); 
    const defaultLogoutButton = document.getElementById('default-logout-button');
    // ----------------------------------------------------

    if (token && username && role) {
        // Logged In: Hide login/default logout, show user data
        
        // A. Update Visibility
        if (activeUserContainer) {
            // Set to 'flex' as Tailwind uses it for header alignment
            activeUserContainer.style.display = 'flex'; 
        }
        if (loginButtons) {
            loginButtons.style.display = 'none';
        }
        if (defaultLogoutButton) {
            defaultLogoutButton.style.display = 'none'; 
        }
        
        // B. Show Username and Role (Inner Content)
        if (usernameDisplayElement) {
            // Display: Username (Role) - The ID is usually the username in service context
            const displayRole = role.charAt(0).toUpperCase() + role.slice(1);
            // Use different display content depending on the active container (Staff/Admin often show role, Request often shows just username)
            if (staffPageUserContainer) {
                usernameDisplayElement.innerHTML = `${username} (<b>${displayRole}</b>)`; 
            } else {
                // This targets the laundry_request page which just uses textContent
                usernameDisplayElement.textContent = username;
            }
        }
        
        // C. Check Role and Conditionally Show Admin/Staff Panel Button
        const isAdmin = ['admin', 'superadmin'].includes(role);
        
        if (adminButton) {
            if (isAdmin) {
                adminButton.style.display = 'block';
            } else {
                adminButton.style.display = 'none'; 
            }
        }
        // Staff Panel Button (for request page and general visibility)
        if (staffPanelButton) {
             if (['standard', 'admin', 'superadmin'].includes(role)) {
                staffPanelButton.style.display = 'block';
            } else {
                staffPanelButton.style.display = 'none'; 
            }
        }
    } else {
        // Not Logged In: Show login/default logout. Hide user menu and staff buttons.
        if (activeUserContainer) activeUserContainer.style.display = 'none';
        if (adminButton) adminButton.style.display = 'none';
        if (staffPanelButton) staffPanelButton.style.display = 'none';
        if (loginButtons) loginButtons.style.display = 'flex'; 
        if (defaultLogoutButton) defaultLogoutButton.style.display = 'block'; 
    }
}
window.updateServiceBanner = updateServiceBanner;


// --- SERVICE LOGIN FORM HANDLER ---

/**
 * Handles the service login process (designed to run on service_auth.html).
 */
async function handleServiceLogin(e) {
    e.preventDefault(); 
    
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
            
            showMsg("Service Login successful! Redirecting...", false); 
            
            // 3. REDIRECT LOGIC
            // Check for 'redirect' query parameter in the current URL
            const urlParams = new URLSearchParams(window.location.search);
            const redirectTarget = urlParams.get('redirect');

            setTimeout(() => {
                if (redirectTarget) {
                    // Redirect to the page that sent us here
                    window.location.href = redirectTarget;
                } else {
                    // Default fallback
                    window.location.href = 'laundry_staff.html'; 
                }
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

// Helper function for service page logout
window.handleServiceLogout = () => {
    localStorage.removeItem(SERVICE_TOKEN_KEY);
    localStorage.removeItem('nixtz_service_username');
    localStorage.removeItem('nixtz_service_user_role');
    localStorage.removeItem('nixtz_service_user_membership');
    window.location.href = 'service_auth.html';
};


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