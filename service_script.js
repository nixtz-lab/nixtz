/**
 * service_script.js
 * Global utility functions and authentication helpers for ALL service-related pages 
 * (e.g., laundry_staff.html, service_admin.html, laundry_request.html).
 * FIX: This script is fully decoupled from business_dashboard.html checks.
 */

// --- GLOBAL AUTHENTICATION HELPERS (Dual Token Check) ---

/**
 * Determines which active token key to use for API calls (nixtz_ OR tmt_).
 * Returns the key string ('nixtz_auth_token' or 'tmt_auth_token') or null.
 */
const getActiveTokenKey = () => {
    // Priority 1: Check for the new service token
    if (localStorage.getItem('nixtz_auth_token')) return 'nixtz_auth_token';
    // Priority 2: Check for the legacy main site token
    if (localStorage.getItem('tmt_auth_token')) return 'tmt_auth_token';
    return null;
};
window.getActiveTokenKey = getActiveTokenKey; // Expose globally

/**
 * Retrieves user data (e.g., role, username) regardless of the token prefix used during login.
 * @param {string} keySuffix - The end of the key (e.g., 'user_role', 'username').
 */
const getServiceUserData = (keySuffix) => {
    // Check nixtz_ prefix first
    let data = localStorage.getItem(`nixtz_${keySuffix}`);
    if (data) return data;
    
    // Fallback to tmt_ prefix
    data = localStorage.getItem(`tmt_${keySuffix}`);
    return data;
};
window.getServiceUserData = getServiceUserData; // Expose globally

// --- CORE SERVICE AUTH FUNCTIONS ---

/**
 * Checks if ANY valid token exists.
 */
const getAuthStatus = () => getActiveTokenKey() !== null;
window.getAuthStatus = getAuthStatus; // Expose globally

/**
 * Retrieves the user's role (essential for access control).
 */
const getUserRole = () => getServiceUserData('user_role');
window.getUserRole = getUserRole; // Expose globally


// --- LAUNDRY SERVICE SPECIFIC UTILITIES ---

/**
 * Retrieves the service staff member's department, which is necessary for form routing.
 * This is a placeholder function and assumes you will add an API call here.
 */
window.getServiceStaffDepartment = async () => {
    const token = localStorage.getItem(getActiveTokenKey());
    if (!token) return null;
    
    try {
        // You MUST create this new backend endpoint to return the staff's department.
        const response = await fetch(`${window.API_BASE_URL}/api/service/staff/my-department`, { 
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        
        if (response.ok && result.success) {
            return result.department; // Assumes backend returns { success: true, department: "Housekeeping" }
        }
        return null;
    } catch (e) {
        console.error("Failed to fetch staff department.", e);
        return null;
    }
};

// --- INITIALIZATION CHECK ---

document.addEventListener('DOMContentLoaded', () => {
    // CRITICAL: business_dashboard is NOT in this list, ensuring it's not interfered with.
    const servicePages = ['laundry_staff', 'service_admin', 'laundry_request'];
    const currentPageSlug = window.location.pathname.split('/').pop().split('.')[0];
    
    if (servicePages.includes(currentPageSlug)) {
        
        // 1. Check Auth Status (If no token, redirect to service login)
        if (!getAuthStatus()) {
             window.location.href = 'service_auth.html?service=true';
             return;
        }
        
        // 2. Check Role Status (If logged in, check if they have service privileges)
        const role = getUserRole();
        if (role !== 'admin' && role !== 'superadmin' && role !== 'standard') {
            window.showMessage("Access Denied. Insufficient staff privileges.", true);
            setTimeout(() => {
                 // Redirect unauthorized users away from service pages
                 window.location.href = 'business_dashboard.html'; 
            }, 800);
        }
    }
});