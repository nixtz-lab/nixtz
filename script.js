/**
 * script.js
 * Global functions for Nixtz landing page interactivity and Access Control.
 */

// --- CORE GLOBAL UTILITIES ---
// FIX: Expose API_BASE_URL globally via the window object
window.API_BASE_URL = window.location.origin; 

// --- UPDATED KEY: nixtz_auth_token ---
const getAuthStatus = () => localStorage.getItem('nixtz_auth_token') !== null;
const getUserRole = () => localStorage.getItem('tmt_user_role'); 

const getPageAccess = () => {
    try {
        const access = localStorage.getItem('nixtz_page_access'); // UPDATED KEY
        
        if (!access) return [];

        const pageSlugs = access.split(',').map(s => s.trim().toLowerCase()).filter(s => s);
        
        if (pageSlugs.length === 0 && access.startsWith('[')) {
             return JSON.parse(access);
        }

        return pageSlugs;

    } catch (e) {
        console.error("Error parsing page access:", e);
        try {
             return access ? JSON.parse(access) : [];
        } catch (e2) {
             return [];
        }
    }
};

const JOIN_PAGE_URL = "auth.html?mode=join";
const COOKIE_CONSENT_KEY = "tmt_cookie_accepted";
let currentUserEmail = null; 

window.getAuthStatus = getAuthStatus;
window.getUserRole = getUserRole;
window.getPageAccess = getPageAccess;

// Function to display messages in the custom message box
function showMessage(text, isError = false) {
    const msgBox = document.getElementById('message-box');
    const msgText = document.getElementById('message-text');

    if (!msgBox || !msgText) {
        console.error("Message box elements not found. Cannot display message.");
        return;
    }

    msgText.textContent = text;
    
    // Set colors and visibility
    msgBox.classList.remove('hidden', 'bg-red-500', 'bg-tmt-primary', 'opacity-0');
    
    if (isError) {
        msgBox.classList.add('bg-red-500'); 
    } else {
        // MODIFIED: Use Nixtz color class name
        msgBox.classList.add('bg-nixtz-primary'); 
    }

    // Trigger transition by removing opacity-0 and adding opacity-100
    msgBox.classList.add('opacity-100');

    // Hide the message after 3 seconds
    setTimeout(() => {
        msgBox.classList.remove('opacity-100');
        
        setTimeout(() => {
            msgBox.classList.add('hidden');
        }, 300); // Match transition duration
        
    }, 3000); 
}
window.showMessage = showMessage; // Explicitly expose showMessage

/**
 * Core function to check user authentication status and access rights before allowing navigation.
 */
function checkAccessAndRedirect(targetUrl, event) {
    // Check for external links
    if (targetUrl.startsWith('http') || targetUrl.startsWith('//')) {
        window.open(targetUrl, '_blank');
        return; 
    }
    
    if (!getAuthStatus()) {
        showMessage("Please join our community to unlock this content and tools.", true);
        setTimeout(() => {
            window.location.href = JOIN_PAGE_URL;
        }, 800); 
        return;
    }
    
    // 1. Extract the "slug" from the target URL 
    const urlParts = targetUrl.split('/');
    const fileName = urlParts.pop(); // e.g., 'stock_market.html?mode=search'
    // FIX: Ensure we only get the base slug, stripping .html and query strings
    const pageSlug = fileName.split('.')[0].split('?')[0]; 

    // 2. Define Public Pages
    const publicPages = ['index', 'auth', 'about', 'contact', 'cookie_policy', 'search_results']; // Added search_results
    if (publicPages.includes(pageSlug)) {
        window.location.href = targetUrl;
        return;
    }
    
    // 3. Check Admin Panel Access (superadmin/admin are the only ones allowed)
    const userRole = getUserRole();
    if (pageSlug === 'admin_panel' && (userRole === 'admin' || userRole === 'superadmin')) {
        window.location.href = targetUrl;
        return;
    }

    // 4. Check Page Access Array
    const allowedPages = getPageAccess();
    
    // Check if the current page slug is in the allowed list OR if the special 'all' slug is present
    if (allowedPages.includes(pageSlug) || allowedPages.includes('all')) {
        showMessage("Access Granted! Loading " + pageSlug, false);
        setTimeout(() => {
            window.location.href = targetUrl;
        }, 300); 
    } else {
        // If the user is logged in but the slug is missing from their allowedPages
        const userMembership = localStorage.getItem('tmt_user_membership') || 'none';
        showMessage(`Access Denied. You are a ${userMembership.toUpperCase()} member. This content is not included in your current subscription.`, true);
        
        // Optional: window.location.href = 'membership_upgrade.html'; 
    }
}
window.checkAccessAndRedirect = checkAccessAndRedirect; // Explicitly expose checkAccessAndRedirect

// --- FUNCTIONS BELOW HERE ARE FOR UI/AUTH AND CAN REMAIN IN GLOBAL SCOPE ---

function toggleMobileDropdown(buttonElement) {
    const dropdownContent = buttonElement.nextElementSibling;
    const icon = buttonElement.querySelector('svg');

    if (dropdownContent) {
        dropdownContent.classList.toggle('hidden');
        if (icon) {
            icon.classList.toggle('rotate-180');
        }
    }
}
window.toggleMobileDropdown = toggleMobileDropdown;


function setupMobileMenuToggle() {
    const toggleButton = document.getElementById('menu-toggle');
    const mobileMenu = document.getElementById('mobile-menu');
    const iconOpen = document.getElementById('icon-open');
    const iconClose = document.getElementById('icon-close');

    if (toggleButton && mobileMenu && iconOpen && iconClose) {
        toggleButton.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
            iconOpen.classList.toggle('hidden');
            iconClose.classList.toggle('hidden');
        });
    } else {
        console.error("Mobile menu elements not found. Mobile menu disabled.");
    }
}


function acceptCookies() {
    const banner = document.getElementById('cookie-consent-banner');
    
    localStorage.setItem(COOKIE_CONSENT_KEY, 'true');

    if (banner) {
        banner.classList.add('opacity-0', 'transition', 'duration-500');
        setTimeout(() => {
             banner.classList.add('hidden');
        }, 500);
    }

    showMessage("Cookies accepted. Thank you!", false);
}
window.acceptCookies = acceptCookies;


function checkCookieConsent() {
    const banner = document.getElementById('cookie-consent-banner');
    
    if (!banner) return; 

    const consentGiven = localStorage.getItem(COOKIE_CONSENT_KEY) === 'true';

    if (consentGiven) {
        banner.classList.add('hidden');
    } else {
        banner.classList.remove('hidden', 'opacity-0');
        banner.classList.add('opacity-100');
    }
}


function updateAuthUI() {
    const isLoggedIn = getAuthStatus();
    const role = getUserRole(); // Get role
    
    const authButtonsContainer = document.getElementById('auth-buttons-container');
    const userMenuContainer = document.getElementById('user-menu-container'); 
    const usernameDisplay = document.getElementById('username-display');
    const username = localStorage.getItem('tmt_username'); 
    const userInitials = document.getElementById('user-initials'); // For dropdown
    
    // NEW: Admin Link
    const adminLinkContainer = document.getElementById('admin-link-container');
    if (adminLinkContainer) {
        if (role === 'admin' || role === 'superadmin') {
            adminLinkContainer.classList.remove('hidden');
        } else {
            adminLinkContainer.classList.add('hidden');
        }
    }


    if (isLoggedIn) {
        if (authButtonsContainer) authButtonsContainer.classList.add('hidden');
        if (userMenuContainer) userMenuContainer.classList.remove('hidden');
        
        if (usernameDisplay && username) {
            const formattedUsername = username.charAt(0).toUpperCase() + username.slice(1);
            usernameDisplay.textContent = formattedUsername;
            
            // Update dropdown initials
            if(userInitials) {
                userInitials.textContent = formattedUsername;
            }
        }

    } else {
        if (authButtonsContainer) authButtonsContainer.classList.remove('hidden');
        if (userMenuContainer) userMenuContainer.classList.add('hidden');
    }
}


function handleLogout() {
    localStorage.removeItem('nixtz_auth_token'); // UPDATED KEY
    localStorage.removeItem('tmt_username'); 
    localStorage.removeItem('tmt_user_role'); // NEW
    localStorage.removeItem('tmt_user_membership'); // NEW
    localStorage.removeItem('nixtz_page_access'); // UPDATED KEY
    localStorage.removeItem('tmt_email'); // ADDED: Clear email on logout

    // Reset global state
    currentUserEmail = null; // ADDED

    showMessage("You have been successfully logged out. Updating UI...", false);

    setTimeout(() => {
        window.location.reload(); 
    }, 500);
}
window.handleLogout = handleLogout;


// --- START: ADDED PROFILE MODAL FUNCTIONS ---

/**
 * Fetches the user's full profile data from the API (e.g., to get email).
 */
async function fetchUserData() {
    if (!getAuthStatus()) return;
    console.log("Fetching user profile data from API...");

    try {
        const response = await fetch(`${API_BASE_URL}/api/user/profile`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('nixtz_auth_token')}`, // UPDATED KEY
                'Content-Type': 'application/json',
            },
        });
        if (!response.ok) {
             let errorMsg = `HTTP error! status: ${response.status}`;
             try { const errData = await response.json(); errorMsg = errData.message || errorMsg; } catch(e){}
             throw new Error(errorMsg);
        }
        const result = await response.json();
        console.log("User profile data received:", result);

        if (result.data) {
            currentUserEmail = result.data.email || null;
            
            // Store email in local storage for persistence
            if (result.data.email) {
                localStorage.setItem('tmt_email', result.data.email);
            }
            
            // Update modal elements if they exist
            const modalEmailEl = document.getElementById('modal-email');
            if (modalEmailEl) {
                modalEmailEl.textContent = currentUserEmail || 'N/A';
            }
        } else {
            console.error("Profile Fetch Error: Data missing in response", result);
        }

    } catch (error) {
        console.error("Network error fetching profile:", error);
        // Don't show a popup for a background fetch failure
    }
}

/**
 * Handles showing the profile modal and populating user details.
 */
function showProfileModal() {
    if (!getAuthStatus()) {
        return showMessage("Please log in to view your profile.", true);
    }
    console.log("Showing profile modal.");
    
    // Get elements
    const profileModal = document.getElementById('profile-modal');
    const modalUsernameEl = document.getElementById('modal-username');
    const modalEmailEl = document.getElementById('modal-email');
    const passwordForm = document.getElementById('change-password-form');
    const passwordMessageBox = document.getElementById('password-message-box');
    const savePasswordButton = document.getElementById('save-password-button');

    // Populate details
    if (modalUsernameEl) modalUsernameEl.textContent = localStorage.getItem('tmt_username') || 'N/A';
    if (modalEmailEl) modalEmailEl.textContent = currentUserEmail || localStorage.getItem('tmt_email') || 'Loading...'; // Use global or local storage

    // Reset password form
    if (passwordForm) passwordForm.reset();
    if (passwordMessageBox) {
        passwordMessageBox.classList.add('hidden');
        passwordMessageBox.textContent = '';
    }
    if (savePasswordButton) savePasswordButton.disabled = false;

    if (profileModal) {
        profileModal.classList.remove('hidden');
        profileModal.classList.add('flex'); // Ensure it's displayed as flex
    } else {
        console.error("Profile modal element not found!");
    }
}

/**
 * Handles changing the user's password.
 */
async function changePassword(e) {
    e.preventDefault(); 
    if (!getAuthStatus()) return;
    console.log("Attempting to change password...");
    
    // Get elements
    const currentPasswordInput = document.getElementById('current-password');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-new-password');
    const savePasswordButton = document.getElementById('save-password-button');
    const passwordMessageBox = document.getElementById('password-message-box');

    if (!currentPasswordInput || !newPasswordInput || !confirmPasswordInput || !savePasswordButton || !passwordMessageBox) {
         console.error("Password change form elements not found. Aborting.");
         return;
    }

    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
         passwordMessageBox.textContent = "Please fill in all password fields.";
         passwordMessageBox.className = 'p-3 rounded-lg text-white mb-3 bg-red-600'; 
         return;
    }
    if (newPassword !== confirmPassword) {
        passwordMessageBox.textContent = "New passwords do not match.";
        passwordMessageBox.className = 'p-3 rounded-lg text-white mb-3 bg-red-600';
        return;
    }
    if (newPassword.length < 8) {
        passwordMessageBox.textContent = "New password must be at least 8 characters.";
        passwordMessageBox.className = 'p-3 rounded-lg text-white mb-3 bg-red-600';
        return;
    }

    savePasswordButton.disabled = true;
    passwordMessageBox.classList.add('hidden'); 

    try {
        const response = await fetch(`${API_BASE_URL}/api/user/change-password`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('nixtz_auth_token')}`, // UPDATED KEY
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ currentPassword, newPassword }),
        });

        const result = await response.json(); 
        console.log("Change password API response:", response.status, result);

        if (!response.ok) {
             throw new Error(result.message || `HTTP error! status: ${response.status}`);
        }

        // Success
        passwordMessageBox.textContent = result.message || "Password updated successfully!";
        // MODIFIED: Use Nixtz color class name
        passwordMessageBox.className = 'p-3 rounded-lg text-white mb-3 bg-nixtz-primary'; 
        document.getElementById('change-password-form').reset();
        
        showMessage("Password updated. Please log in again.", false);
        const profileModal = document.getElementById('profile-modal');
        if (profileModal) profileModal.classList.add('hidden');
        
        setTimeout(handleLogout, 2000); 

    } catch (error) {
        // Failure
        console.error("Error changing password:", error);
        if (passwordMessageBox) {
            passwordMessageBox.textContent = error.message || "Network error or failed to update password.";
            passwordMessageBox.className = 'p-3 rounded-lg text-white mb-3 bg-red-600';
            passwordMessageBox.classList.remove('hidden');
        } else {
             showMessage(error.message || "Network error or failed to update password.", true);
        }
    } finally {
        if (savePasswordButton) savePasswordButton.disabled = false;
    }
}

// --- END: ADDED PROFILE MODAL FUNCTIONS ---

// --- START: ADDED TICKER SEARCH SUGGESTION FUNCTIONS (from stock_dashboard.js) ---

/**
 * Fetches ticker suggestions from the backend API.
 */
async function fetchRealSuggestions(query) {
    // MODIFIED: This function is now irrelevant to Nixtz and will be mocked/removed in the future.
    // For now, let's keep it mocked to prevent errors if UI elements call it.
    console.warn("Stock search suggestions are mocked/disabled in Nixtz.");
    return [];
}

/**
 * Handles user input in a search box to show suggestions.
 */
function handleSearchInput(event, suggestionsId) {
    // MODIFIED: Disabled for Nixtz
    // console.log("Search input disabled.");
}

/**
 * Handles selecting a suggestion from the dropdown.
 */
function selectSuggestion(ticker) {
    // MODIFIED: Disabled for Nixtz
    // console.log("Search selection disabled.");
}
// Make accessible globally for onclick attributes
window.selectSuggestion = selectSuggestion;
window.handleSearchInput = handleSearchInput;

// --- END: ADDED TICKER SEARCH SUGGESTION FUNCTIONS ---


// --- Event Listeners Setup ---
document.addEventListener('DOMContentLoaded', () => {
    
    setupMobileMenuToggle();

    // --- MODIFIED: SITE SEARCH LOGIC (REMOVED) ---
    // Since we removed the search form from index.html, this is commented out
    /*
    const searchForm = document.getElementById('header-search-form'); 
    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault(); 
            const searchInput = document.getElementById('stock-search-input'); 
            const query = searchInput.value.trim().toUpperCase(); 
            
            if (query) {
                showMessage(`Search is disabled in Nixtz. Use navigation links.`, true); 
                // checkAccessAndRedirect(`stock_dashboard.html?ticker=${encodeURIComponent(query)}`); 
            }
        });
    }
    */
    // --- END MODIFIED SITE SEARCH LOGIC ---

    // --- START: ADDED LISTENERS FOR TICKER SUGGESTIONS ---

    // document.getElementById('stock-search-input')?.addEventListener('keyup', (e) => handleSearchInput(e, 'stock-search-suggestions'));

    // Global click listener to hide suggestions when clicking outside
    document.addEventListener('click', (event) => {
        // Check if the click was outside any search container
        const isOutside = !event.target.closest('.search-container');
        if (isOutside) {
            document.querySelectorAll('.search-suggestions').forEach(s => s.classList.add('hidden'));
        }
    });

    // --- END: ADDED LISTENERS FOR TICKER SUGGESTION FUNCTIONS ---


    // --- START: ADDED MODAL LISTENERS ---
    
    // Get modal elements
    const profileButton = document.getElementById('profile-button');
    const profileModal = document.getElementById('profile-modal');
    const closeModalBtn = document.getElementById('close-profile-modal');
    const passwordForm = document.getElementById('change-password-form');

    // Attach listeners
    if (profileButton) {
        profileButton.addEventListener('click', showProfileModal);
    }
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            if (profileModal) profileModal.classList.add('hidden');
        });
    }
    if (passwordForm) {
        passwordForm.addEventListener('submit', changePassword);
    }

    // --- END: ADDED MODAL LISTENERS ---


    checkCookieConsent(); 
    updateAuthUI(); 

    // Fetch user email if logged in
    if (getAuthStatus()) {
        fetchUserData();
    }

    const logoutBtn = document.getElementById('logout-button');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    console.log("Authentication status:", getAuthStatus());
});