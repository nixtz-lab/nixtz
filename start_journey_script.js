/**
 * start_journey_script.js
 * Global functions for Think Money Tree landing page interactivity and Access Control.
 * NOTE: This file is consolidated from your main script (1).js and previous start_journey_script.js content.
 */

// --- CORE GLOBAL UTILITIES ---
const API_BASE_URL = window.location.origin;
const getAuthStatus = () => localStorage.getItem('tmt_auth_token') !== null;
const getUserRole = () => localStorage.getItem('tmt_user_role');
const getPageAccess = () => {
    try {
        const access = localStorage.getItem('tmt_page_access');
        return access ? JSON.parse(access) : [];
    } catch (e) {
        console.error("Error parsing page access:", e);
        return [];
    }
};
const JOIN_PAGE_URL = "auth.html?mode=join";
const COOKIE_CONSENT_KEY = "tmt_cookie_accepted";
let currentUserEmail = null;


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
        msgBox.classList.add('bg-tmt-primary'); 
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
window.showMessage = showMessage;


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
    const fileName = urlParts.pop();
    const pageSlug = fileName.split('.')[0].split('?')[0]; 

    // 2. Define Public Pages
    const publicPages = ['index', 'auth', 'about', 'contact', 'cookie_policy', 'search_results', 'start_journey', 'financial_foundation', 'value_investing_strategy', 'portfolio_growth'];
    if (publicPages.includes(pageSlug)) {
        window.location.href = targetUrl;
        return;
    }
    
    // 3. Check Admin Panel Access
    const userRole = getUserRole();
    if (pageSlug === 'admin_panel' && (userRole === 'admin' || userRole === 'superadmin')) {
        window.location.href = targetUrl;
        return;
    }

    // 4. Check Page Access Array
    const allowedPages = getPageAccess();
    
    if (allowedPages.includes(pageSlug) || allowedPages.includes('all')) {
        showMessage("Access Granted! Loading " + pageSlug, false);
        setTimeout(() => {
            window.location.href = targetUrl;
        }, 300); 
    } else {
        const userMembership = localStorage.getItem('tmt_user_membership') || 'none';
        showMessage(`Access Denied. You are a ${userMembership.toUpperCase()} member. This content is not included in your current subscription.`, true);
    }
}
window.checkAccessAndRedirect = checkAccessAndRedirect;


/**
 * Placeholder function for handling CTA clicks (used for 'Join' and other non-page buttons).
 */
function buttonAction(actionName) {
    if (actionName === 'Join' || actionName === 'Login') {
        const targetUrl = actionName === 'Join' ? "auth.html?mode=join" : "auth.html?mode=login";
        window.location.href = targetUrl;
        return;
    }
    showMessage(`${actionName} action triggered! Content coming soon.`, false);
}
window.buttonAction = buttonAction;


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
    const role = getUserRole();
    
    const authButtonsContainer = document.getElementById('auth-buttons-container');
    const userMenuContainer = document.getElementById('user-menu-container'); 
    const usernameDisplay = document.getElementById('username-display');
    const username = localStorage.getItem('tmt_username'); 
    const userInitials = document.getElementById('user-initials');
    
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
    localStorage.removeItem('tmt_auth_token'); 
    localStorage.removeItem('tmt_username'); 
    localStorage.removeItem('tmt_user_role');
    localStorage.removeItem('tmt_user_membership');
    localStorage.removeItem('tmt_page_access');
    localStorage.removeItem('tmt_email');

    currentUserEmail = null;

    showMessage("You have been successfully logged out. Updating UI...", false);

    setTimeout(() => {
        window.location.reload(); 
    }, 500);
}
window.handleLogout = handleLogout;


// --- START: PROFILE MODAL FUNCTIONS (Simplified) ---

// Placeholder functions for profile modal logic (assuming it's copied from script (1).js)
async function fetchUserData() {
    if (!getAuthStatus()) return;
    // Simplified fetch logic for demonstration
    const email = localStorage.getItem('tmt_email') || 'user@example.com';
    currentUserEmail = email;
    const modalEmailEl = document.getElementById('modal-email');
    if (modalEmailEl) modalEmailEl.textContent = currentUserEmail;
}

function showProfileModal() {
    if (!getAuthStatus()) {
        return showMessage("Please log in to view your profile.", true);
    }
    const profileModal = document.getElementById('profile-modal');
    const modalUsernameEl = document.getElementById('modal-username');
    const modalEmailEl = document.getElementById('modal-email');

    if (modalUsernameEl) modalUsernameEl.textContent = localStorage.getItem('tmt_username') || 'N/A';
    if (modalEmailEl) modalEmailEl.textContent = currentUserEmail || localStorage.getItem('tmt_email') || 'Loading...'; 

    if (profileModal) {
        profileModal.classList.remove('hidden');
        profileModal.classList.add('flex');
    }
}

async function changePassword(e) {
    e.preventDefault(); 
    showMessage("Password change API is not fully implemented yet.", true);
}
// --- END: PROFILE MODAL FUNCTIONS ---


// --- START: TICKER SEARCH SUGGESTION FUNCTIONS ---

async function fetchRealSuggestions(query) {
    if (!query || query.length < 1) return [];

    try {
        const response = await fetch(`${API_BASE_URL}/api/search-tickers?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error(`Search API failed: ${response.status}`);
        const result = await response.json();

        if (result.success && Array.isArray(result.data)) {
            return result.data.map(item => ({ ticker: item.ticker, text: `${item.ticker} - ${item.name}` }));
        }
        return [];
    } catch (error) {
        // Fallback to simple mocked suggestions if API fails
        const mockSuggestions = [
             { ticker: 'AAPL', text: 'AAPL - Apple Inc.' },
             { ticker: 'GOOGL', text: 'GOOGL - Alphabet Inc.' },
             { ticker: 'MSFT', text: 'MSFT - Microsoft Corp.' }
        ];
        return mockSuggestions.filter(s => s.ticker.startsWith(query.toUpperCase()));
    }
}

function handleSearchInput(event, suggestionsId) {
    const inputElement = event.target;
    const query = inputElement.value.trim();
    const suggestionsContainer = document.getElementById(suggestionsId);
    if (!suggestionsContainer) return;

    if (event.key === 'Enter' && query) {
        suggestionsContainer.classList.add('hidden');
        return;
    }

    if (!query) {
        suggestionsContainer.classList.add('hidden');
        suggestionsContainer.innerHTML = '';
        return;
    }

    clearTimeout(inputElement.suggestionTimeout);
    inputElement.suggestionTimeout = setTimeout(async () => {
        const suggestions = await fetchRealSuggestions(query);
        if (suggestions.length > 0) {
            suggestionsContainer.innerHTML = suggestions.map(suggestion =>
                `<div class="suggestion-item" onclick="selectSuggestion('${suggestion.ticker}')">${suggestion.text}</div>`
            ).join('');
            suggestionsContainer.classList.remove('hidden');
        } else {
            suggestionsContainer.classList.add('hidden');
            suggestionsContainer.innerHTML = '';
        }
    }, 250);
}

function selectSuggestion(ticker) {
    const targetUrl = `stock_dashboard.html?ticker=${ticker}`;
    checkAccessAndRedirect(targetUrl);
    document.querySelectorAll('.search-suggestions').forEach(s => s.classList.add('hidden'));
}
window.selectSuggestion = selectSuggestion;
window.handleSearchInput = handleSearchInput;

// --- END: TICKER SEARCH SUGGESTION FUNCTIONS ---


// --- Event Listeners Setup ---
document.addEventListener('DOMContentLoaded', () => {
    
    setupMobileMenuToggle();

    // --- HEADER SEARCH LOGIC ---
    const searchForm = document.getElementById('header-search-form');
    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const searchInput = document.getElementById('stock-search-input');
            const query = searchInput.value.trim().toUpperCase();
            
            if (query) {
                showMessage(`Loading ticker: ${query}`, false);
                setTimeout(() => {
                    checkAccessAndRedirect(`stock_dashboard.html?ticker=${encodeURIComponent(query)}`);
                }, 500);
            }
        });
    }
    // --- END HEADER SEARCH LOGIC ---

    // --- START: ADDED LISTENERS FOR TICKER SUGGESTIONS ---

    document.getElementById('stock-search-input')?.addEventListener('keyup', (e) => handleSearchInput(e, 'stock-search-suggestions'));

    document.addEventListener('click', (event) => {
        const isOutside = !event.target.closest('.search-container');
        if (isOutside) {
            document.querySelectorAll('.search-suggestions').forEach(s => s.classList.add('hidden'));
        }
    });

    // --- END: ADDED LISTENERS FOR TICKER SUGGESTIONS ---


    // --- START: ADDED MODAL LISTENERS ---
    
    const profileButton = document.getElementById('profile-button');
    const profileModal = document.getElementById('profile-modal');
    const closeModalBtn = document.getElementById('close-profile-modal');
    const passwordForm = document.getElementById('change-password-form');

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

    if (getAuthStatus()) {
        fetchUserData();
    }

    const logoutBtn = document.getElementById('logout-button');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
});