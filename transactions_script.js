// This script is dedicated to the Transaction History (transactions.html) page.
console.log("Transaction History Script Loaded"); // Log: Script start

// --- Global Variables and Configuration ---
const API_BASE_URL = window.location.origin;

// LIVE ALPHA VANTAGE API CONFIGURATION (REMOVED DIRECT KEY ACCESS)

// User/Auth state
let currentUserId = null;
let authToken = null;
let isAuthReady = false;
let currentCurrency = 'USD'; // DEFAULT CURRENCY
let currentUserEmail = null; 

// Exchange rate state
let exchangeRates = {
    // USD is always 1:1, others will be populated by the API call
    USD: 1.00
};
let baseCurrency = 'USD'; // Transactions are stored in USD (your base currency)

// Data state
let allTransactions = []; // Holds all transactions fetched from the server.

// --- DOM Elements ---
const userInfoEl = document.getElementById('user-info');

// New Filter Elements
const dateFromInput = document.getElementById('date-from');
const dateToInput = document.getElementById('date-to');
const typeFilterSelect = document.getElementById('type-filter');

// New Filter Summary Elements
const filteredIncomeEl = document.getElementById('filtered-income');
const filteredSpendingEl = document.getElementById('filtered-spending');
const filteredNetEl = document.getElementById('filtered-net');

// Transaction List
const transactionList = document.getElementById('transaction-list');

// --- Navigation/Modal Elements ---
const authButtonsContainer = document.getElementById('auth-buttons-container');
const userMenuContainer = document.getElementById('user-menu-container'); 
const usernameDisplay = document.getElementById('username-display');
const logoutBtn = document.getElementById('logout-button');
const currencySelect = document.getElementById('currency-select');
const userInitialsEl = document.getElementById('user-initials'); 
const profileButton = document.getElementById('profile-button');

// --- Modal Elements ---
const profileModal = document.getElementById('profile-modal');
const closeModalBtn = document.getElementById('close-profile-modal');
const modalUsernameEl = document.getElementById('modal-username');
const modalEmailEl = document.getElementById('modal-email');
const passwordForm = document.getElementById('change-password-form');
const passwordMessageBox = document.getElementById('password-message-box');
const searchInput = document.getElementById('transaction-search');


// --- Utility Functions ---

/**
 * Shows a temporary, styled message box for notifications.
 */
function showMessage(text, type = 'success') {
    const messageBox = document.getElementById('message-box');
    const messageTextEl = document.getElementById('message-text');
    if (!messageBox || !messageTextEl) {
        console.warn("Message box elements not found, cannot show message:", text);
        if (type === 'error') console.error(text); else console.log(text);
        return;
    } 
    
    let bgColor = type === 'success' ? 'bg-tmt-primary' : 'bg-red-600';
    messageBox.className = `fixed top-20 right-5 p-4 rounded-xl shadow-2xl text-white z-50 transition-all duration-300 transform ${bgColor} translate-x-10 opacity-0 pointer-events-none`;
    
    messageTextEl.textContent = text;

    requestAnimationFrame(() => {
        messageBox.classList.remove('opacity-0', 'translate-x-10', 'pointer-events-none');
        messageBox.classList.add('opacity-100', 'translate-x-0', 'pointer-events-auto');
    });

    setTimeout(() => {
        messageBox.classList.remove('opacity-100', 'translate-x-0', 'pointer-events-auto');
        messageBox.classList.add('opacity-0', 'translate-x-10', 'pointer-events-none');
    }, 3000);
}

/**
 * Converts an amount from the base currency (USD) to the current selected currency.
 */
function convertToCurrentCurrency(amount) {
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount)) { return 0; }
    
    if (currentCurrency === baseCurrency || typeof exchangeRates[currentCurrency] !== 'number') {
        return numericAmount; 
    }
    
    const rate = exchangeRates[currentCurrency];
    if (isNaN(rate) || rate <= 0) {
        console.warn(`Invalid or missing exchange rate for ${currentCurrency}, using 1.0`);
        return numericAmount; 
    }
    return numericAmount * rate;
}

/**
 * Formats a number as a currency string using the user's current preference.
 * @param {number | string} amount - The amount to format
 * @param {boolean} [includeDecimals=true] - Whether to include decimal places in summary boxes
 * @returns {string}
 */
const formatCurrency = (amount, includeDecimals = true) => {
    const numericAmount = parseFloat(amount); 
    if (isNaN(numericAmount) || !isFinite(numericAmount)) { amount = 0; } else { amount = numericAmount; }
    const digits = includeDecimals ? 2 : 0;

    // --- Force Baht symbol specifically ---
    if (currentCurrency === 'THB') {
         try {
             const numberFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits, });
             const formattedNumber = numberFormatter.format(amount);
             return `฿${formattedNumber}`;
         } catch (formatError) {
             return `฿${amount.toFixed(digits)}`;
         }
    }
    // --- End THB Update ---

    const options = { 
        style: 'currency', 
        currency: currentCurrency, 
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    };
    try {
        return new Intl.NumberFormat('en-US', options).format(amount);
    } catch (e) {
        const formattedAmount = amount.toFixed(digits); 
        return `${currentCurrency} ${formattedAmount}`;
    }
};


/**
 * Formats a timestamp to a readable date.
 * @param {string|number|Date|object} timestamp - ISO string, number, Date object, or similar object.
 * @returns {string}
 */
const formatDate = (timestamp) => {
    if (timestamp === null || typeof timestamp === 'undefined') return 'N/A';
    
    let date;
    try {
        if (timestamp instanceof Date) {
            date = timestamp;
        } else if (timestamp && typeof timestamp.toDate === 'function') {
            date = timestamp.toDate();
        } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
            date = new Date(timestamp);
        } else {
            return 'Invalid Date Input';
        }

        if (isNaN(date.getTime())) {
            return 'Invalid Date'; 
        }
        
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC'
        });

    } catch (e) {
        return 'Date Parse Error';
    }
};


// -------------------------------------------------------------------
// LIVE Currency Rate Fetching (Updated to use Backend Proxy)
// -------------------------------------------------------------------

/**
 * Fetches the latest exchange rate for the currently selected currency and updates the global rates object.
 */
async function fetchExchangeRates(callback) {
    if (currentCurrency === baseCurrency) {
        // Run callback (fetch transactions) even if we skip API call
        if (callback) callback();
        return; 
    }
    
    // *** MODIFIED: Call the secure backend proxy route instead of the external API ***
    const url = `${API_BASE_URL}/api/currency/currency-rate?to_currency=${currentCurrency}`;
    
    try {
        const response = await fetch(url); // No headers required now, as the backend handles the key
        
        if (!response.ok) {
            // Attempt to parse JSON error message
            let errorMsg = `Backend proxy failed (Status: ${response.status}).`;
             try {
                 const errorResult = await response.json();
                 errorMsg = errorResult.message || errorMsg;
             } catch(e) { /* Non-JSON response, ignore */ } 
            throw new Error(errorMsg);
        }
        
        const data = await response.json(); // Expected format: { rate: X.XXX }
        const rate = parseFloat(data.rate); // Expecting { rate: 32.50 } structure from your proxy

        if (rate && rate > 0) {
            exchangeRates[currentCurrency] = rate;
            showMessage(`Live rate for ${currentCurrency} updated to ${rate.toFixed(4)}!`, 'success');
        } else {
             throw new Error("Proxy returned invalid or no rate data (rate was 0 or invalid).");
        }

    } catch (error) {
        console.error("Currency Proxy Fetch Error:", error);
        // Removed specific Alpha Vantage error messages
        showMessage(`Failed to fetch live rate: ${error.message}. Using default rate (1.0).`, 'error');
        if (!exchangeRates[currentCurrency]) {
            exchangeRates[currentCurrency] = 1.0;
        }
    } finally {
        // IMPORTANT: Call the callback (fetch transactions) in finally block
        if (callback) callback();
    }
}


// -------------------------------------------------------------------
// Initialization & Auth
// -------------------------------------------------------------------

/**
 * Updates the navigation bar UI based on authentication status.
 * Also updates the currency display in the form.
 */
function updateNavAuthUI() {
    const isLoggedIn = !!authToken;
    const username = localStorage.getItem('tmt_username'); 

    if (isLoggedIn) {
        if (userMenuContainer) userMenuContainer.classList.remove('hidden');
        if (authButtonsContainer) authButtonsContainer.classList.add('hidden');
        
        if (usernameDisplay && username) {
            const displayUsername = username.charAt(0).toUpperCase() + username.slice(1);
            usernameDisplay.textContent = displayUsername;
            if (userInitialsEl) userInitialsEl.textContent = displayUsername; 
        }
        
        if (currencySelect) {
            currencySelect.value = currentCurrency;
        }
    } else {
        if (userMenuContainer) userMenuContainer.classList.add('hidden');
        if (authButtonsContainer) authButtonsContainer.classList.remove('hidden'); 
    }
}


/**
 * Initializes the app by fetching rates and extracting the JWT token.
 */
function initializeAppAndAuth() {
    authToken = localStorage.getItem('tmt_auth_token');
    currentUserId = localStorage.getItem('tmt_username');
    currentUserEmail = localStorage.getItem('tmt_email');
    currentCurrency = localStorage.getItem('tmt_currency') || 'USD'; 

    if (!authToken || !currentUserId) {
        if (userInfoEl) userInfoEl.textContent = "Authentication Status: Not Logged In. Please log in to view transactions.";
        showMessage("Authentication token not found. Please log in.", 'error');
        isAuthReady = false; 
    } else {
        isAuthReady = true;
        if (userInfoEl) userInfoEl.textContent = `Authentication Status: Connected as ${currentUserId}`;
        
        if (!currentUserEmail) {
            fetchUserData();
        }
        
        // Fetch rates, and then in the callback, fetch transactions
        fetchExchangeRates(fetchTransactions); 
    }
    
    updateNavAuthUI();
}

/**
 * Handles the user logout process.
 */
async function handleLogout() {
    localStorage.removeItem('tmt_auth_token'); 
    localStorage.removeItem('tmt_username'); 
    localStorage.removeItem('tmt_currency');
    localStorage.removeItem('tmt_email'); 
    
    authToken = null;
    currentUserId = null;
    currentUserEmail = null;
    isAuthReady = false;
    currentCurrency = 'USD';

    showMessage("You have been successfully logged out. Redirecting...", 'success');

    updateNavAuthUI(); 
    if (transactionList) transactionList.innerHTML = '<p class.text-center text-gray-500 p-4">Logged out.</p>';
    
    setTimeout(() => {
        window.location.href = 'budget_tracker.html'; 
    }, 1500);
}


/**
 * Fetches the user's full profile data from the API. (Needed for currency sync)
 */
async function fetchUserData() {
    if (!isAuthReady || !authToken) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/user/profile`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${authToken}` },
        });
        const result = await response.json();

        if (!response.ok || !result.data) {
             throw new Error(result.message || `HTTP error! status: ${response.status}`);
        }
        
        currentUserEmail = result.data.email || currentUserEmail;
        
        if (result.data.currency && typeof result.data.currency === 'string' && /^[A-Z]{3}$/.test(result.data.currency)) {
             currentCurrency = result.data.currency;
             localStorage.setItem('tmt_currency', result.data.currency);
        }
        if (result.data.email) localStorage.setItem('tmt_email', result.data.email);
        
        // Update modal details
        if (modalUsernameEl) modalUsernameEl.textContent = currentUserId;
        if (modalEmailEl) modalEmailEl.textContent = currentUserEmail || 'N/A';
        
        updateNavAuthUI();

    } catch (error) {
        console.error("Error fetching profile:", error);
        showMessage(`Error fetching profile: ${error.message}`, "error");
    }
}

/**
 * Handles showing the profile modal and populating user details. (Unchanged)
 */
function showProfileModal() {
    if (!isAuthReady) {
        return showMessage("Please log in to view your profile.", 'error');
    }
    
    if (modalUsernameEl) modalUsernameEl.textContent = currentUserId || 'N/A';
    if (modalEmailEl) modalEmailEl.textContent = currentUserEmail || 'N/A';

    if (passwordForm) passwordForm.reset();
    if (passwordMessageBox) {
        passwordMessageBox.classList.add('hidden');
        passwordMessageBox.textContent = '';
    }
    const savePasswordButton = document.getElementById('save-password-button');
    if (savePasswordButton) savePasswordButton.disabled = false;

    if (profileModal) {
        profileModal.classList.remove('hidden');
        profileModal.classList.add('flex');
    } else {
        console.error("Profile modal element not found!");
    }
}

/**
 * Handles changing the user's password. (Unchanged)
 */
async function changePassword(e) {
    e.preventDefault();
    if (!isAuthReady || !authToken) return;
    
    const currentPasswordInput = document.getElementById('current-password');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-new-password');
    const savePasswordButton = document.getElementById('save-password-button');

    if (!currentPasswordInput || !newPasswordInput || !confirmPasswordInput || !savePasswordButton || !passwordMessageBox) {
         console.error("Password change form elements not found. Aborting.");
         return;
    }

    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

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
            headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPassword, newPassword }),
        });

        const result = await response.json(); 

        if (!response.ok) {
             throw new Error(result.message || `HTTP error! status: ${response.status}`);
        }

        passwordMessageBox.textContent = result.message || "Password updated successfully!";
        passwordMessageBox.className = 'p-3 rounded-lg text-white mb-3 bg-tmt-primary'; 
        if (passwordForm) passwordForm.reset(); 
        
        showMessage("Password updated. Please log in again.", 'success');
        if (profileModal) profileModal.classList.add('hidden');
        setTimeout(handleLogout, 2000); 

    } catch (error) {
        if (passwordMessageBox) {
            passwordMessageBox.textContent = error.message || "Network error or failed to update password.";
            passwordMessageBox.className = 'p-3 rounded-lg text-white mb-3 bg-red-600';
            passwordMessageBox.classList.remove('hidden');
        }
    } finally {
        if (savePasswordButton) savePasswordButton.disabled = false;
    }
}

/**
 * Sends the new currency preference to the backend API.
 */
async function saveCurrencyPreference(newCurrency) {
    if (!isAuthReady || !authToken) {
        showMessage('Authentication not ready. Cannot save preference.', 'error');
        if (currencySelect) currencySelect.value = currentCurrency;
        return;
    }
    
    if (newCurrency === currentCurrency) {
        updateNavAuthUI();
        return; 
    }

    if (!/^[A-Z]{3}$/.test(newCurrency)) {
         showMessage(`Invalid currency code format: ${newCurrency}`, 'error');
         if(currencySelect) currencySelect.value = currentCurrency;
         return;
    }

    const previousCurrency = currentCurrency;
    currentCurrency = newCurrency;
    localStorage.setItem('tmt_currency', newCurrency);
    updateNavAuthUI(); 
    
    // Fetch new rates and then apply filters immediately
    await fetchExchangeRates(applyFilters); 

    try {
        const response = await fetch(`${API_BASE_URL}/api/user/settings`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ currency: newCurrency }),
        });
        
        if (!response.ok) {
             let errorMsg = `HTTP error! status: ${response.status}`;
             try {
                 const result = await response.json();
                 errorMsg = result.message || errorMsg;
             } catch(e) {}
             throw new Error(errorMsg);
        } 
        showMessage(`Currency preference saved to server.`, 'success'); 

    } catch (error) {
        console.error("Error saving currency preference to backend:", error);
        showMessage(`Failed to save currency to server: ${error.message}. Local setting kept.`, 'error');
    }
}


/**
 * Fetches transactions from the MongoDB API endpoint and stores them.
 */
async function fetchTransactions() {
    if (!isAuthReady || !authToken) {
        console.log("Cannot fetch transactions: Not authenticated.");
        return;
    }
    
    if(transactionList) transactionList.innerHTML = '<p id="loading-message" class="text-center text-gray-500 p-4">Loading transactions...</p>';

    try {
        const response = await fetch(`${API_BASE_URL}/api/transactions`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${authToken}` },
        });

        const status = response.status;
        let result;
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            result = await response.json(); 
        } else {
             const textResult = await response.text();
             throw new Error(`Server returned non-JSON response (Status: ${status})`);
        }
        
        if (!response.ok) {
             throw new Error(result.message || `HTTP error! status: ${status}`);
        }

        if (Array.isArray(result.data)) {
            allTransactions = result.data; // Store all transactions globally
            console.log(`Received ${allTransactions.length} transactions. Applying filters.`);
            applyFilters(); // Apply filters immediately after fetching all data
        } else {
             showMessage('Received invalid transaction data from server.', 'error');
             allTransactions = [];
             applyFilters();
        }

    } catch (error) {
        console.error("Network or API Fetch Error (Transactions):", error);
        showMessage(`Could not load transactions: ${error.message}`, 'error');
        allTransactions = [];
        applyFilters();
        const loadingMessage = document.getElementById('loading-message');
        if (loadingMessage) loadingMessage.remove(); 
        if(transactionList) transactionList.innerHTML = '<p class="text-center text-red-500 p-4">Error loading transactions.</p>';
    }
}

/**
 * Deletes a transaction via the MongoDB API endpoint.
 */
async function deleteTransaction(id) {
    if (!isAuthReady || !authToken || !id) {
         showMessage('Authentication not ready or invalid ID.', 'error');
         return;
    }
    
    const buttonToDelete = transactionList ? transactionList.querySelector(`button[data-id="${id}"]`) : null;
    if (buttonToDelete) buttonToDelete.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/api/transactions/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` },
        });
        
         if (!response.ok) {
             let errorMsg = `HTTP error! status: ${response.status}`;
             try {
                 const errorResult = await response.json();
                 errorMsg = errorResult.message || errorMsg;
             } catch (e) {}
             throw new Error(errorMsg);
        }
        
        showMessage('Transaction deleted successfully.', 'success');
        
        // Re-fetch all data to ensure the global array is updated
        fetchTransactions(); 
        
    } catch (error) {
        console.error("Error deleting transaction:", error);
        showMessage(`Failed to delete transaction: ${error.message}`, 'error');
         if (buttonToDelete) buttonToDelete.disabled = false;
    }
}

// -------------------------------------------------------------------
// CORE LOGIC: Filtering and Rendering
// -------------------------------------------------------------------

/**
 * Applies current filter settings to the allTransactions array and triggers rendering.
 */
function applyFilters() {
    const dateFrom = dateFromInput ? dateFromInput.value : null;
    const dateTo = dateToInput ? dateToInput.value : null;
    const typeFilter = typeFilterSelect ? typeFilterSelect.value : 'all';
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    let filteredTransactions = allTransactions.filter(t => {
        // --- 1. Date Filter ---
        if (dateFrom || dateTo) {
             let transactionDate;
             try {
                 transactionDate = t.timestamp.toDate ? t.timestamp.toDate() : new Date(t.timestamp);
                 if (isNaN(transactionDate.getTime())) return false; // Skip invalid dates
             } catch(e) { return false; }

             // Convert to date strings for comparison (YYYY-MM-DD)
             const transactionDateStr = transactionDate.toISOString().split('T')[0];
             
             if (dateFrom && transactionDateStr < dateFrom) return false;
             // For 'dateTo', ensure we include the entire day by comparing to a date string
             if (dateTo && transactionDateStr > dateTo) return false;
        }

        // --- 2. Type Filter ---
        if (typeFilter !== 'all' && t.type !== typeFilter) return false;

        // --- 3. Search Filter ---
        if (searchTerm) {
            const description = t.description ? t.description.toLowerCase() : '';
            if (!description.includes(searchTerm)) return false;
        }

        return true; // Passed all filters
    });

    // Update the filtered summary boxes
    updateFilteredSummary(filteredTransactions);
    
    // Render the filtered list
    renderTransactions(filteredTransactions);
}

/**
 * Renders the filtered list of transactions to the DOM.
 */
function renderTransactions(transactions) {
    const loadingMessage = document.getElementById('loading-message');
    if (loadingMessage) loadingMessage.remove();
    
    if (!transactionList) return;
    transactionList.innerHTML = '';

    if (!Array.isArray(transactions) || transactions.length === 0) {
        transactionList.innerHTML = '<p class="text-center text-gray-500 p-4">No transactions match your current filters.</p>';
        return;
    }

    // Sort transactions by date (Descending order: newest first)
    const sortedTransactions = transactions
        .sort((a, b) => {
            let timeA = 0, timeB = 0;
            try { timeA = (b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp)).getTime(); } catch(e) {}
            try { timeB = (a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp)).getTime(); } catch(e) {}
            return timeB - timeA; // Descending order
        });

    sortedTransactions.forEach((t) => {
        if (!t || typeof t.amount === 'undefined' || !t.type || !t.description || !t._id) return;
        
        const isIncome = t.type === 'income';
        const colorClass = isIncome ? 'text-tmt-primary' : 'text-red-500';
        const sign = isIncome ? '+' : '-';
        const amountValue = parseFloat(t.amount);
        
        if (isNaN(amountValue)) return;

        const convertedAmount = convertToCurrentCurrency(amountValue);

        const transactionEl = document.createElement('div');
        transactionEl.id = `transaction-${t._id}`; 
        // Modified class for better mobile/desktop rendering flexibility
        transactionEl.className = 'flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gray-800/80 p-4 rounded-xl shadow-md border border-gray-700/50 hover:bg-gray-700/50 transition duration-200';
        
        // --- Date & Description Div (Mobile: Stacked, Desktop: Row) ---
        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'flex flex-col sm:flex-row sm:w-7/12 truncate mb-2 sm:mb-0';

        const dateP = document.createElement('p');
        dateP.className = 'text-xs text-gray-400 sm:w-1/3 sm:flex-shrink-0';
        dateP.textContent = formatDate(t.timestamp);

        const descriptionP = document.createElement('p');
        descriptionP.className = 'font-semibold text-white truncate sm:w-2/3 max-w-full mt-1 sm:mt-0';
        descriptionP.textContent = t.description;

        detailsDiv.appendChild(dateP);
        detailsDiv.appendChild(descriptionP);

        // --- Amount & Controls Div ---
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'flex items-center justify-end w-full sm:w-5/12 space-x-4 sm:space-x-6 pt-2 sm:pt-0 border-t border-gray-700/50 sm:border-none';

        const amountP = document.createElement('p');
        amountP.className = `text-lg font-bold ${colorClass} text-right w-3/4 sm:w-2/3`;
        amountP.textContent = `${sign}${formatCurrency(convertedAmount, true)}`; 

        const deleteButton = document.createElement('button');
        deleteButton.dataset.id = t._id;
        deleteButton.className = 'delete-button text-gray-500 hover:text-red-500 p-1 rounded-full transition duration-150 transform hover:scale-110';
        deleteButton.setAttribute('aria-label', `Delete transaction: ${t.description}`);
        deleteButton.innerHTML = '<i data-lucide="trash-2" class="w-5 h-5 pointer-events-none"></i>';
        
        controlsDiv.appendChild(amountP);
        controlsDiv.appendChild(deleteButton);

        transactionEl.appendChild(detailsDiv);
        transactionEl.appendChild(controlsDiv);

        transactionList.appendChild(transactionEl);
    });

    // Re-render Lucide icons for the newly added delete buttons
    lucide.createIcons();
}

/**
 * Calculates and updates the financial summary boxes based on the filtered transactions.
 */
function updateFilteredSummary(filteredTransactions) {
    let totalIncome = 0;
    let totalSpending = 0;

    if (Array.isArray(filteredTransactions)) {
        filteredTransactions.forEach(t => {
            if (!t || typeof t.amount !== 'number' || isNaN(t.amount)) return;
            
            const amount = t.amount; // Base currency (USD)
            
            if (t.type === 'income') {
                totalIncome += amount;
            } else if (t.type === 'expense') {
                totalSpending += amount;
            }
        });
    }

    const netBalance = totalIncome - totalSpending;
    
    // Convert to display currency
    const displayIncome = convertToCurrentCurrency(totalIncome);
    const displaySpending = convertToCurrentCurrency(totalSpending);
    const displayNetBalance = convertToCurrentCurrency(netBalance);

    // Update DOM Elements
    if (filteredIncomeEl) filteredIncomeEl.textContent = formatCurrency(displayIncome, true); // Use decimals for summary
    if (filteredSpendingEl) filteredSpendingEl.textContent = formatCurrency(displaySpending, true); 
    
    if (filteredNetEl) {
        filteredNetEl.textContent = formatCurrency(displayNetBalance, true);
        if (displayNetBalance >= 0) {
            filteredNetEl.classList.remove('text-red-500');
            filteredNetEl.classList.add('text-tmt-secondary');
        } else {
            filteredNetEl.classList.remove('text-tmt-secondary');
            filteredNetEl.classList.add('text-red-500');
        }
    }
}


// --- Event Listeners Setup ---

document.addEventListener('DOMContentLoaded', () => {
    
    // Initialize Auth and fetch initial data (which calls fetchTransactions -> applyFilters)
    initializeAppAndAuth();
    
    // --- Attach Listeners Safely ---

    // 1. Filter Handlers (triggers filtering and re-rendering of the list)
    [dateFromInput, dateToInput, typeFilterSelect].forEach(input => {
        if (input) {
            input.addEventListener('change', applyFilters);
        }
    });

    // 2. Search Handler (attached to desktop input, will be synced by the small script block)
    if (searchInput) {
        searchInput.addEventListener('input', applyFilters);
    }
    
    // 3. Delete button handler (event delegation on transactionList)
    if (transactionList) {
        transactionList.addEventListener('click', (e) => {
            const deleteButton = e.target.closest('.delete-button'); 
            if (deleteButton) {
                const transactionId = deleteButton.dataset.id;
                if (transactionId) {
                    if (window.confirm('Are you sure you want to delete this transaction?')) {
                         showMessage('Attempting to delete transaction...', 'info'); 
                         deleteTransaction(transactionId);
                     }
                }
            }
        });
    }

    // 4. Logout button handler
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // 5. Currency selector change handler
    if (currencySelect) {
        currencySelect.addEventListener('change', (e) => {
            saveCurrencyPreference(e.target.value);
        });
    }

    // 6. Profile Modal Handlers (from budget_tracker_script.js)
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
    
    console.log("All event listeners attached.");
});