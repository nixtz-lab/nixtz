// This file assumes your MongoDB backend is running and accessible via API endpoints.
console.log("Budget Tracker Script Loaded"); // Log: Script start

// --- Global Variables and Configuration ---
const API_BASE_URL = window.location.origin; // ADDED

// The placeholder variables are no longer used for the API call.
// const ALPHA_VANTAGE_HOST = 'alpha-vantage.p.rapidapi.com'; // REMOVED
// const ALPHA_VANTAGE_URL = `https://${ALPHA_VANTAGE_HOST}/query`; // REMOVED

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

// --- Categories (Copied from planner script for calculations) ---
const CATEGORIES = [
    { id: 'rent', name: 'Rent/Mortgage', type: 'expense', icon: 'home' },
    { id: 'utilities', name: 'Utilities', type: 'expense', icon: 'plug-zap' },
    { id: 'debt', name: 'Debt Payments', type: 'expense', icon: 'credit-card' },
    { id: 'groceries', name: 'Groceries', type: 'expense', icon: 'shopping-cart' },
    { id: 'transportation', name: 'Transportation', type: 'expense', icon: 'car' },
    { id: 'entertainment', name: 'Entertainment', type: 'expense', icon: 'popcorn' },
    { id: 'other', name: 'Other Expenses', type: 'expense', icon: 'circle-dot' },
    { id: 'savings', name: 'Savings Goal', type: 'goal', icon: 'piggy-bank' },
    { id: 'investing', name: 'Investment Allocation', type: 'goal', icon: 'trending-up' },
    { id: 'other-goal', name: 'Other Goal', type: 'goal', icon: 'archive' }
];


// --- DOM Elements ---
// Ensure all elements are retrieved safely
const monthlyIncomeEl = document.getElementById('monthly-income');
const monthlySpendingEl = document.getElementById('monthly-spending');
const monthlyNetBalanceEl = document.getElementById('monthly-net-balance');
const dateInput = document.getElementById('date-input');
const toggleFormButton = document.getElementById('toggle-form-button');
const transactionFormContainer = document.getElementById('transaction-form-container');
const form = document.getElementById('transaction-form');
const descriptionSelect = document.getElementById('description-select'); 
const descriptionManual = document.getElementById('description-manual'); 
const descriptionHiddenInput = document.getElementById('description'); 
const amountInput = document.getElementById('amount');
const typeInput = document.getElementById('type');
const transactionList = document.getElementById('transaction-list');
const monthlyHistoryList = document.getElementById('monthly-history-list');
const totalIncomeEl = document.getElementById('total-income');
const totalSpendingEl = document.getElementById('total-spending');
const netBalanceEl = document.getElementById('net-balance');
const spendingPercentEl = document.getElementById('spending-percent');
const savingsPercentEl = document.getElementById('savings-percent');
const userIdEl = document.getElementById('current-user-id'); 
const userInfoEl = document.getElementById('user-info');
const addButton = document.getElementById('add-entry-button');

// --- NEW: Projected Summary DOM Elements ---
const projectedIncomeEl = document.getElementById('projected-income');
const projectedExpensesEl = document.getElementById('projected-expenses');
const projectedNetBalanceEl = document.getElementById('projected-net-balance');

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


// --- Utility Functions ---

/**
 * Shows a temporary, styled message box for notifications (replacing alert()).
 */
function showMessage(text, type = 'success') {
    const messageBox = document.getElementById('message-box');
    const messageTextEl = document.getElementById('message-text');
    // Ensure elements exist before using them
    if (!messageBox || !messageTextEl) {
        console.warn("Message box elements not found, cannot show message:", text);
        // Fallback to console log
        if (type === 'error') console.error(text); else console.log(text);
        return;
    } 
    
    let bgColor = type === 'success' ? 'bg-tmt-primary' : 'bg-red-600';
    // Use className assignment for simplicity, ensure all necessary classes are included
    messageBox.className = `fixed top-20 right-5 p-4 rounded-xl shadow-2xl text-white z-50 transition-all duration-300 transform ${bgColor} translate-x-10 opacity-0 pointer-events-none`;
    
    messageTextEl.textContent = text;

    // Trigger transition
    requestAnimationFrame(() => {
        messageBox.classList.remove('opacity-0', 'translate-x-10', 'pointer-events-none');
        messageBox.classList.add('opacity-100', 'translate-x-0', 'pointer-events-auto');
    });

    // Automatically hide after a delay
    setTimeout(() => {
        messageBox.classList.remove('opacity-100', 'translate-x-0', 'pointer-events-auto');
        messageBox.classList.add('opacity-0', 'translate-x-10', 'pointer-events-none');
    }, 3000);
}

/**
 * Converts an amount from the base currency (USD) to the current selected currency.
 */
function convertToCurrentCurrency(amount) {
    // Ensure amount is a number
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount)) {
        console.warn("Invalid amount passed to convertToCurrentCurrency:", amount);
        return 0; // Or handle as an error
    }
    
    // Check if conversion is needed and rate exists
    if (currentCurrency === baseCurrency || typeof exchangeRates[currentCurrency] !== 'number') {
        return numericAmount; 
    }
    
    const rate = exchangeRates[currentCurrency];
    // Ensure rate is a valid positive number
    if (isNaN(rate) || rate <= 0) {
        console.warn(`Invalid or missing exchange rate for ${currentCurrency}, using 1.0`);
        return numericAmount; // Fallback to original amount if rate is invalid
    }
    return numericAmount * rate;
}

/**
 * Converts an amount from the current selected currency back to the base currency (USD).
 */
function convertFromCurrentCurrencyToBase(amount) {
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount)) {
        console.warn("Invalid amount passed to convertFromCurrentCurrencyToBase:", amount);
        return 0;
    }

    // If we are already in the base currency, no conversion needed
    if (currentCurrency === baseCurrency) {
        return numericAmount;
    }

    const rate = exchangeRates[currentCurrency];

    // Check if the rate is valid
    if (typeof rate !== 'number' || isNaN(rate) || rate <= 0) {
        console.warn(`Invalid or missing exchange rate for ${currentCurrency} in convertFromCurrentCurrencyToBase. Returning original amount.`);
        // A rate of 1.0 is a safer assumption if the API failed.
        const fallbackRate = exchangeRates[currentCurrency] || 1.0;
        if (fallbackRate <= 0) return numericAmount; // Final safety
        return numericAmount / fallbackRate;
    }

    // To convert back to base (USD), we divide by the rate
    // e.g., 2000 THB / (32.39 THB/USD) = 61.74 USD
    return numericAmount / rate;
}

// -------------------------------------------------------------------
// LIVE Currency Rate Fetching (Updated to use Backend Proxy)
// -------------------------------------------------------------------

/**
 * Fetches the latest exchange rate by proxying the request through the secure backend.
 */
async function fetchExchangeRates() {
    console.log(`Fetching exchange rates for: ${currentCurrency} via proxy.`);

    // 1. Check if conversion is needed
    if (currentCurrency === baseCurrency) {
        fetchTransactions(); // Must fetch transactions if skipping API
        return; 
    }
    
    // CRITICAL FIX: Use the new modular endpoint path: /api/currency/currency-rate
    const url = `${API_BASE_URL}/api/currency/currency-rate?to_currency=${currentCurrency}`;
    
    try {
        const response = await fetch(url);
        
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
        // CRITICAL: Ensure we use 1.0 if the proxy fails completely
        showMessage(`Failed to fetch live rate: ${error.message}. Using default rate (1.0).`, 'error');
        if (!exchangeRates[currentCurrency] || exchangeRates[currentCurrency] <= 0) {
            exchangeRates[currentCurrency] = 1.0;
            console.warn(`Setting default rate 1.0 for ${currentCurrency}`);
        }
    } finally {
        // Trigger transactions fetch after rates are determined (success or failure)
        fetchTransactions(); 
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
    console.log("Updating Nav UI, Auth Token:", !!authToken, "Current Currency:", currentCurrency); // Log: Update Nav UI Start
    const isLoggedIn = !!authToken;
    const username = localStorage.getItem('tmt_username'); 

    // Ensure elements exist before updating
    const userMenuContainer = document.getElementById('user-menu-container');
    const authButtonsContainer = document.getElementById('auth-buttons-container');
    const usernameDisplay = document.getElementById('username-display'); // Moved inside for safety
    const userInitialsEl = document.getElementById('user-initials'); // Moved inside for safety
    const currencySelect = document.getElementById('currency-select'); // Moved inside for safety
    const amountInput = document.getElementById('amount'); // Moved inside for safety

    if (isLoggedIn) {
        console.log("User is logged in.");
        if (userMenuContainer) userMenuContainer.classList.remove('hidden');
        if (authButtonsContainer) authButtonsContainer.classList.add('hidden');
        
        if (usernameDisplay && username) {
            const displayUsername = username.charAt(0).toUpperCase() + username.slice(1);
            usernameDisplay.textContent = displayUsername;
            if (userInitialsEl) userInitialsEl.textContent = displayUsername; 
            console.log("Username updated:", displayUsername);
        } else {
             console.warn("Username display element or username missing.");
        }
        
        if (currencySelect) {
            currencySelect.value = currentCurrency;
            console.log("Currency select dropdown updated:", currentCurrency);
            
            let currencySymbol = currentCurrency; // Default to code if formatting fails
            try {
                // Formatting 0 to get symbol
                const formattedZero = new Intl.NumberFormat('en-US', { 
                    style: 'currency', 
                    currency: currentCurrency,
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0
                }).format(0); // Format 0 directly
                console.log(`Formatted zero for ${currentCurrency}: ${formattedZero}`); // Log: Formatted Zero
                
                // Regex to strip numbers, spaces, commas, periods. Should leave only the symbol.
                // Added potential negative sign and parentheses used in some locales
                currencySymbol = formattedZero.replace(/[\d\s,.\-()]/g, ''); 
                
                // If symbol is still empty or just the currency code, use the code
                // SPECIAL CASE for THB to ensure Baht symbol
                if (currentCurrency === 'THB' && !currencySymbol) {
                    currencySymbol = '฿';
                } else if (!currencySymbol || currencySymbol === currentCurrency) {
                     console.warn(`Could not extract symbol for ${currentCurrency}, using code.`);
                     currencySymbol = currentCurrency; 
                } else {
                    console.log(`Extracted symbol: ${currencySymbol}`); // Log: Extracted Symbol
                }
            } catch (e) {
                console.error(`Error formatting currency (${currentCurrency}) for symbol extraction:`, e);
                 // SPECIAL CASE for THB even in error
                if (currentCurrency === 'THB') {
                    currencySymbol = '฿';
                } else {
                    currencySymbol = currentCurrency; // Fallback to code on error
                }
            }
            
            if(amountInput) {
                 amountInput.placeholder = `0.00 (${currencySymbol})`;
                 console.log("Amount placeholder updated:", amountInput.placeholder);
            } else {
                console.error("Amount input element not found!");
            }
        } else {
             console.error("Currency select element not found!");
        }

    } else {
        console.log("User is logged out.");
        if (userMenuContainer) userMenuContainer.classList.add('hidden');
        // Ensure auth buttons are shown if not logged in
        if (authButtonsContainer) authButtonsContainer.classList.remove('hidden'); 
         // Reset placeholder if logged out
         if(amountInput) amountInput.placeholder = `0.00 ($)`; // Default back to USD symbol
    }
}


/**
 * Initializes the app by fetching rates and extracting the JWT token.
 */
function initializeAppAndAuth() {
    console.log("Initializing App and Auth..."); // Log: Init Start
    // 1. Load auth state - MUST load currency first for UI initialization
    authToken = localStorage.getItem('tmt_auth_token');
    currentUserId = localStorage.getItem('tmt_username');
    currentUserEmail = localStorage.getItem('tmt_email');
    currentCurrency = localStorage.getItem('tmt_currency') || 'USD'; 
    console.log("Loaded from localStorage - Auth Token:", !!authToken, "UserID:", currentUserId, "Currency:", currentCurrency);

     // Ensure addButton exists before accessing its 'disabled' property
    if (addButton) {
        if (!authToken || !currentUserId) {
            if (userInfoEl) userInfoEl.textContent = "Authentication Status: Not Logged In.";
            showMessage("Authentication token not found. Please log in.", 'error');
            addButton.disabled = true; // Explicitly ensure disabled state
            isAuthReady = false; // Set auth state
            console.log("Auth token not found, setting isAuthReady=false, button disabled.");
        } else {
            isAuthReady = true;
            if (userInfoEl) userInfoEl.textContent = `Authentication Status: Connected as ${currentUserId}`;
            addButton.disabled = false; // Enable button only on successful auth check
            console.log("Auth token found, setting isAuthReady=true, button enabled.");
            
            // Fetch user data only if logged in
            if (!currentUserEmail) {
                console.log("Fetching user data...");
                fetchUserData();
            }
            
            // Fetch rates only if logged in
            console.log("Initiating exchange rate fetch...");
            fetchExchangeRates(); // Intentionally letting this run async
            
            // ############### NEWLY ADDED ###############
            console.log("Initiating projections fetch...");
            fetchProjections(); // Fetch the projection data for the dashboard
            // #########################################
        }
    } else {
        console.error("Add button element not found during initialization!");
    }
    
    // CRITICAL: Run UI update AFTER determining auth state
    console.log("Running initial UI update...");
    updateNavAuthUI();
    console.log("Initialization complete."); // Log: Init End
}

/**
 * Handles the user logout process.
 */
async function handleLogout() {
    console.log("Handling logout..."); // Log: Logout Start
    // Clear local storage first
    localStorage.removeItem('tmt_auth_token'); 
    localStorage.removeItem('tmt_username'); 
    localStorage.removeItem('tmt_currency');
    localStorage.removeItem('tmt_email'); 
    console.log("Local storage cleared.");
    
    // Reset global state variables
    authToken = null;
    currentUserId = null;
    currentUserEmail = null;
    isAuthReady = false;
    currentCurrency = 'USD'; // Reset to default currency
    console.log("Global state reset.");

    showMessage("You have been successfully logged out. Redirecting...", 'success'); // Changed type to success

    // Update UI immediately after clearing state
    updateNavAuthUI(); 
    // Disable add button
    if (addButton) {
         addButton.disabled = true;
         console.log("Add button disabled.");
    }
    // Clear transaction list and summary (optional, but good practice)
    if (transactionList) transactionList.innerHTML = '<p class.text-center text-gray-500 p-4">Logged out.</p>';
    console.log("Transaction list cleared.");
    updateSummary([]); // Update summary with empty data
    console.log("Summary updated.");
    
    // ############### NEWLY ADDED ###############
    updateProjectedSummary(null); // Clear projected summary on logout
    // #########################################

    setTimeout(() => {
        // Redirect after showing message and updating UI
        console.log("Redirecting to budget_tracker.html"); // Log: Redirect
        window.location.href = 'budget_tracker.html'; 
    }, 1500); // Slightly shorter delay
}

// -------------------------------------------------------------------
// REST OF budget_tracker_script.js CODE (for completeness)
// -------------------------------------------------------------------

/**
 * Formats a number as a currency string using the user's current preference.
 * @param {number | string} amount - The amount to format
 * @param {boolean} [includeDecimals=true] - Whether to include decimal places in summary boxes
 * @returns {string}
 */
const formatCurrency = (amount, includeDecimals = true) => {
    // Ensure amount is treated as a number
    const numericAmount = parseFloat(amount); 
    
    // Check if the conversion resulted in a valid number
    if (isNaN(numericAmount) || !isFinite(numericAmount)) {
        console.warn(`Invalid amount passed to formatCurrency: "${amount}". Defaulting to 0.`);
        amount = 0; 
    } else {
        amount = numericAmount; // Use the valid number
    }

    const digits = includeDecimals ? 2 : 0; // Determine digits based on flag

    // --- UPDATED: Force Baht symbol specifically ---
    if (currentCurrency === 'THB') {
         console.log(`Formatting THB amount: ${amount} with decimals: ${includeDecimals}`);
         try {
             // Use Intl just for number formatting respecting decimals
             const numberFormatter = new Intl.NumberFormat('en-US', { // Using en-US locale for consistent number format
                 minimumFractionDigits: digits,
                 maximumFractionDigits: digits,
             });
             const formattedNumber = numberFormatter.format(amount);
             return `฿${formattedNumber}`; // Prepend the Baht symbol
         } catch (formatError) {
             console.error("Error during THB number formatting fallback:", formatError);
             // Absolute fallback if even number formatting fails
             return `฿${amount.toFixed(digits)}`;
         }
    }
    // --- END UPDATED ---

    // Standard formatting for other currencies
    const options = { 
        style: 'currency', 
        currency: currentCurrency, 
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    };
    try {
        // Attempt standard formatting
        return new Intl.NumberFormat('en-US', options).format(amount);
    } catch (e) {
        // Catch errors (e.g., unsupported currency code)
        console.error(`Error formatting currency (${currentCurrency}) for amount (${amount}):`, e);
        
        // --- Fallback logic for NON-THB currencies ---
        const formattedAmount = amount.toFixed(digits); 
        console.log(`Using fallback code for ${currentCurrency}.`);
        return `${currentCurrency} ${formattedAmount}`;
        // --- END Fallback logic ---
    }
};


/**
 * Formats a timestamp to a readable date and time.
 * @param {string|number|Date|object} timestamp - ISO string, number, Date object, or Firebase Timestamp.
 * @returns {string}
 */
const formatDate = (timestamp) => {
    if (timestamp === null || typeof timestamp === 'undefined') return 'N/A';
    
    let date;
    try {
        if (timestamp instanceof Date) {
            date = timestamp;
        } else if (timestamp && typeof timestamp.toDate === 'function') {
            // Handle Firebase Timestamp objects (or similar objects with toDate)
            date = timestamp.toDate();
        } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
            // Attempt to parse string or number
            date = new Date(timestamp);
        } else {
            console.warn("Invalid timestamp type received by formatDate:", timestamp);
            return 'Invalid Date Input';
        }

        // Check if the resulting date is valid
        if (isNaN(date.getTime())) {
            console.warn("Timestamp resulted in invalid date:", timestamp);
            return 'Invalid Date'; 
        }
        
        // Use locale date string formatting
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            timeZone: 'UTC' // <-- Add this to ensure consistency with UTC storage
        });

    } catch (e) {
        console.error("Error parsing timestamp in formatDate:", timestamp, e);
        return 'Date Parse Error';
    }
};

/**
 * Renders the list of transactions to the DOM.
 */
function renderTransactions(transactions) {
    console.log("Rendering transactions...", transactions ? transactions.length : 0, "items"); // Log: Render Start
    const loadingMessage = document.getElementById('loading-message');
    if (loadingMessage) loadingMessage.remove();
    
    if (!transactionList) {
        console.error("Transaction list element not found. Cannot render.");
        return; 
    }
    transactionList.innerHTML = ''; // Clear previous list

    if (!Array.isArray(transactions) || transactions.length === 0) {
        transactionList.innerHTML = '<p class="text-center text-gray-500 p-4">No transactions recorded yet.</p>';
        console.log("No transactions to render.");
        return;
    }

    // Sort transactions ensuring valid dates
    let invalidDateCount = 0;
    const sortedTransactions = transactions
        .filter(t => {
             if (!t || typeof t.timestamp === 'undefined') {
                 console.warn("Filtering out transaction with missing timestamp:", t);
                 return false;
             }
             return true; 
        })
        .sort((a, b) => {
            // Robust date parsing within sort
            let timeA = 0, timeB = 0;
            try {
                const dateA = a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
                if (!isNaN(dateA.getTime())) timeA = dateA.getTime(); else invalidDateCount++;
            } catch(e) { invalidDateCount++; console.error("Error parsing date A:", a.timestamp, e); }
            try {
                const dateB = b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
                 if (!isNaN(dateB.getTime())) timeB = dateB.getTime(); else invalidDateCount++;
            } catch(e) { invalidDateCount++; console.error("Error parsing date B:", b.timestamp, e); }
            
            return timeB - timeA; // Descending order
        });
    
    if (invalidDateCount > 0) {
         console.warn(`Found ${invalidDateCount} transactions with invalid dates during sorting.`);
    }

    sortedTransactions.forEach((t, index) => {
        // More robust check for essential properties
        if (!t || typeof t.amount === 'undefined' || !t.type || !t.description || !t._id) {
            console.warn(`Skipping rendering invalid transaction data at index ${index}:`, t);
            return; // Skip invalid transaction objects
        }
        
        const isIncome = t.type === 'income';
        const colorClass = isIncome ? 'text-tmt-primary' : 'text-red-500';
        const sign = isIncome ? '+' : '-';
        const amountValue = parseFloat(t.amount);
        
        // Ensure amount is valid before proceeding
        if (isNaN(amountValue)) {
            console.warn(`Skipping transaction with invalid amount at index ${index}:`, t);
            return;
        }

        const transactionEl = document.createElement('div');
        // Add a unique ID for potential future use/debugging
        transactionEl.id = `transaction-${t._id}`; 
        transactionEl.className = 'flex justify-between items-center bg-gray-800/80 p-4 rounded-xl shadow-md border border-gray-700/50 hover:bg-gray-700/50 transition duration-200';
        
        // --- Create Elements Safely ---
        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'flex flex-col flex-grow truncate min-w-[50%]';

        const descriptionP = document.createElement('p');
        descriptionP.className = 'font-semibold text-white truncate max-w-xs';
        descriptionP.textContent = t.description; // Use textContent for safety

        const dateP = document.createElement('p');
        dateP.className = 'text-xs text-gray-400 mt-1';
        dateP.textContent = formatDate(t.timestamp);

        detailsDiv.appendChild(descriptionP);
        detailsDiv.appendChild(dateP);

        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'flex items-center space-x-2 sm:space-x-4 flex-shrink-0';

        const amountP = document.createElement('p');
        amountP.className = `text-lg font-bold ${colorClass} text-right`;
        // Pass 'true' to include decimals for the transaction list
        amountP.textContent = `${sign}${formatCurrency(convertToCurrentCurrency(amountValue), true)}`; 

        const deleteButton = document.createElement('button');
        deleteButton.dataset.id = t._id; // Store ID on the button
        deleteButton.className = 'delete-button text-gray-500 hover:text-red-500 p-1 sm:p-2 rounded-full transition duration-150 transform hover:scale-110';
        deleteButton.setAttribute('aria-label', `Delete transaction: ${t.description}`); // Accessibility
        // Create icon using innerHTML but ensure it's trusted or simple SVG
        deleteButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2 pointer-events-none"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>'; 
        
        controlsDiv.appendChild(amountP);
        controlsDiv.appendChild(deleteButton);

        transactionEl.appendChild(detailsDiv);
        transactionEl.appendChild(controlsDiv);

        transactionList.appendChild(transactionEl);
    });
    console.log(`Finished rendering ${sortedTransactions.length} transactions.`); // Log: Render End
    
    // CRITICAL: Re-apply filter after rendering is complete to handle search terms
    // We add a slight delay to ensure the DOM elements are fully painted.
    setTimeout(() => {
        // Get the current search term from the desktop input (it's synced from mobile)
        const currentSearchTerm = document.getElementById('transaction-search')?.value;
        if (currentSearchTerm) {
             filterDashboardTransactions(currentSearchTerm);
        }
    }, 50); // Small delay
}


/**
 * Calculates and updates the financial summary dashboard.
 */
function updateSummary(transactions) {
    console.log("Updating summary..."); // Log: Summary Start
    let totalIncome = 0;
    let totalSpending = 0;
    let monthlyBalances = {};

    // Ensure transactions is an array before proceeding
    if (!Array.isArray(transactions)) {
        console.error("updateSummary received invalid data type:", typeof transactions);
        transactions = []; // Default to empty array if data is invalid
    }

    transactions.forEach(t => {
        // Add checks for valid transaction structure
        if (!t || typeof t.amount === 'undefined' || typeof t.type === 'undefined' || !t.timestamp) {
             console.warn("Skipping invalid transaction in summary calculation:", t);
             return; // Skip if transaction object is malformed
        }
        
        const amount = parseFloat(t.amount); // Stored amount is always in base currency (USD)
        
        // Skip if amount is not a valid number
        if (isNaN(amount)) {
            console.warn("Skipping transaction with invalid amount in summary:", t);
            return;
        }

        // Calculate totals in base currency
        if (t.type === 'income') {
            totalIncome += amount;
        } else if (t.type === 'expense') {
            totalSpending += amount;
        }
        
        // Robust date handling for monthly balance calculation
        let date;
        try {
             if (t.timestamp.toDate && typeof t.timestamp.toDate === 'function') {
                 date = t.timestamp.toDate();
             } else {
                 date = new Date(t.timestamp);
             }
         
             // Skip if timestamp is invalid
            if (isNaN(date.getTime())) {
                 console.warn("Skipping transaction with invalid timestamp in monthly summary:", t);
                 return;
            }
            
            // Use UTC methods to avoid timezone issues when grouping by month
            const year = date.getUTCFullYear();
            const month = (date.getUTCMonth() + 1).toString().padStart(2, '0'); // months are 0-indexed
            const yearMonth = `${year}-${month}`;

            if (!monthlyBalances[yearMonth]) {
                monthlyBalances[yearMonth] = { income: 0, expense: 0 };
            }
            // Add amounts safely
            if (t.type === 'income') {
                monthlyBalances[yearMonth].income += amount;
            } else if (t.type === 'expense') {
                monthlyBalances[yearMonth].expense += amount;
            }
        } catch (e) {
            console.error("Error processing date for monthly balance:", t.timestamp, e);
            return; // Skip this transaction if date processing fails
        }
    });
    console.log("Calculated Totals (Base Currency) - Income:", totalIncome, "Spending:", totalSpending);
    console.log("Calculated Monthly Balances:", monthlyBalances);

    const netBalance = totalIncome - totalSpending;
    // --- Current Month Calculation ---
    const now = new Date();
    // Use UTC methods for consistent month grouping across timezones
    const currentYearMonth = `${now.getUTCFullYear()}-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}`;
    
    const currentMonthData = monthlyBalances[currentYearMonth] || { income: 0, expense: 0 };
    const currentMonthIncome = currentMonthData.income;
    const currentMonthSpending = currentMonthData.expense;
    const currentMonthNetBalance = currentMonthIncome - currentMonthSpending;

    console.log("Current Month Totals (Base Currency) - Income:", currentMonthIncome, "Spending:", currentMonthSpending, "Net:", currentMonthNetBalance);

    // CONVERSION: Convert the current month totals to the current display currency
    const displayMonthlyIncome = convertToCurrentCurrency(currentMonthIncome);
    const displayMonthlySpending = convertToCurrentCurrency(currentMonthSpending);
    const displayMonthlyNetBalance = convertToCurrentCurrency(currentMonthNetBalance);
    
    // Update New Monthly DOM Elements (no decimals)
    if (monthlyIncomeEl) monthlyIncomeEl.textContent = formatCurrency(displayMonthlyIncome, false);
    if (monthlySpendingEl) monthlySpendingEl.textContent = formatCurrency(displayMonthlySpending, false);
    if (monthlyNetBalanceEl) monthlyNetBalanceEl.textContent = formatCurrency(displayMonthlyNetBalance, false);

    if (monthlyNetBalanceEl) {
        if (displayMonthlyNetBalance >= 0) {
            monthlyNetBalanceEl.classList.remove('text-red-500');
            monthlyNetBalanceEl.classList.add('text-tmt-secondary');
        } else {
            monthlyNetBalanceEl.classList.remove('text-tmt-secondary');
            monthlyNetBalanceEl.classList.add('text-red-500');
        }
    }
    // --- End Current Month Calculation ---

    // Prevent division by zero, handle NaN
    const spendingPercent = totalIncome > 0 && isFinite(totalIncome) ? (totalSpending / totalIncome) * 100 : 0;
    const savingsPercent = totalIncome > 0 && isFinite(totalIncome) ? (netBalance / totalIncome) * 100 : 0;

    // CONVERSION: Convert the final totals to the current display currency
    const displayIncome = convertToCurrentCurrency(totalIncome);
    const displaySpending = convertToCurrentCurrency(totalSpending);
    const displayNetBalance = convertToCurrentCurrency(netBalance);
    console.log("Display Totals - Income:", displayIncome, "Spending:", displaySpending, "Net:", displayNetBalance);


    // Update DOM Elements safely - PASS 'false' to formatCurrency for no decimals
    if (totalIncomeEl) totalIncomeEl.textContent = formatCurrency(displayIncome, false); 
    if (totalSpendingEl) totalSpendingEl.textContent = formatCurrency(displaySpending, false); 
    if (netBalanceEl) netBalanceEl.textContent = formatCurrency(displayNetBalance, false); 

    if (netBalanceEl) {
        if (displayNetBalance >= 0) {
            netBalanceEl.classList.remove('text-red-500');
            netBalanceEl.classList.add('text-tmt-secondary');
        } else {
            netBalanceEl.classList.remove('text-tmt-secondary');
            netBalanceEl.classList.add('text-red-500');
        }
    }

    // Ensure percentages are numbers before formatting and handle NaN/Infinity
    const spendingPercentNum = isFinite(spendingPercent) ? spendingPercent : 0;
    const savingsPercentNum = isFinite(savingsPercent) ? savingsPercent : 0;
    if (spendingPercentEl) spendingPercentEl.textContent = `${Math.max(0, spendingPercentNum).toFixed(2)}%`;
    if (savingsPercentEl) savingsPercentEl.textContent = `${savingsPercentNum.toFixed(2)}%`;
    
    console.log("Summary DOM updated.");
    renderMonthlyHistory(monthlyBalances); 
}

/**
 * Renders the monthly history tiles.
 */
function renderMonthlyHistory(monthlyBalances) {
    console.log("Rendering monthly history..."); // Log: Monthly History Start
    const monthlyLoading = document.getElementById('monthly-loading-message');
    if (monthlyLoading) monthlyLoading.remove();
    
    if (!monthlyHistoryList) {
        console.error("Monthly history list element not found.");
        return; 
    }
    monthlyHistoryList.innerHTML = ''; // Clear previous

    const now = new Date();
    const currentYear = now.getFullYear().toString();
    
    // Check if monthlyBalances is a valid object
    if (typeof monthlyBalances !== 'object' || monthlyBalances === null) {
        monthlyHistoryList.innerHTML = '<p class="text-center text-gray-500 col-span-full p-4">Error loading monthly data.</p>';
        return;
    }

    // Get keys, filter, and sort
    const sortedMonths = Object.keys(monthlyBalances)
        .filter(m => m && typeof m === 'string' && m.startsWith(currentYear) && /^\d{4}-\d{2}$/.test(m)) // Validate key format
        .sort((a, b) => a.localeCompare(b)); // **MODIFIED:** Sort ascending (A-B) for oldest-to-newest display
    
    console.log("Sorted months for current year (Oldest to Newest):", sortedMonths);

    if (sortedMonths.length === 0) {
        monthlyHistoryList.innerHTML = '<p class="text-center text-gray-500 col-span-full p-4">No monthly data available for this year.</p>';
        return;
    }

    sortedMonths.forEach(monthYear => {
        const data = monthlyBalances[monthYear];
        // Validate data structure and numeric values
        if (!data || typeof data.income !== 'number' || typeof data.expense !== 'number' || isNaN(data.income) || isNaN(data.expense)) {
            console.warn(`Skipping invalid or non-numeric monthly balance data for: ${monthYear}`, data);
            return;
        }
        
        // Use validated numbers
        const incomeNum = data.income;
        const expenseNum = data.expense;
        const netBase = incomeNum - expenseNum; 
        
        const netDisplay = convertToCurrentCurrency(netBase);

        // Prevent division by zero
        const savingsRate = incomeNum > 0 ? (netBase / incomeNum) * 100 : 0;

        // Safer date parsing for month name using UTC to avoid timezone shifts
        let monthName = 'N/A';
        try {
             // Extract year and month (adjust month to be 0-indexed for Date)
             const [year, month] = monthYear.split('-').map(Number);
             const monthDate = new Date(Date.UTC(year, month - 1, 1)); // Use UTC
             if (!isNaN(monthDate.getTime())) {
                  // Specify UTC timezone for formatting to match the UTC date created
                  monthName = monthDate.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }); 
             } else {
                 throw new Error("Date object resulted in NaN");
             }
        } catch(e) { console.error("Error parsing month for display:", monthYear, e); }
        
        const netColor = netBase >= 0 ? 'bg-tmt-primary/10 border-tmt-primary/30 text-tmt-primary' : 'bg-red-500/10 border-red-500/30 text-red-500';
        
        const tile = document.createElement('div');
        tile.className = `p-3 rounded-xl shadow-lg border text-center transition duration-200 hover:scale-105 ${netColor}`;

        // Use textContent for safety and ensure values are valid numbers before formatting
        const monthP = document.createElement('p');
        monthP.className = "text-xs font-semibold text-gray-300 mb-1";
        monthP.textContent = monthName;

        const netP = document.createElement('p');
        netP.className = "text-sm font-extrabold";
        // Pass 'false' for no decimals in monthly tile
        netP.textContent = formatCurrency(netDisplay, false); 
        
        const rateP = document.createElement('p');
        rateP.className = "text-xs text-gray-400 mt-1";
        // Ensure savingsRate is a finite number before formatting
        const savingsRateNum = isFinite(savingsRate) ? savingsRate : 0;
        rateP.textContent = `${savingsRateNum.toFixed(0)}% Rate`;

        tile.appendChild(monthP);
        tile.appendChild(netP);
        tile.appendChild(rateP);
        
        monthlyHistoryList.appendChild(tile);
    });
    console.log("Finished rendering monthly history."); // Log: Monthly History End
}


/**
 * Handles the description selector logic.
 */
// ############### THIS IS THE UPDATED FUNCTION ###############
function handleDescriptionSelect() {
    // --- Check for hidden category ID input ---
    let categoryIdInput = document.getElementById('category-id-hidden');
    if (!categoryIdInput) {
        categoryIdInput = document.createElement('input');
        categoryIdInput.type = 'hidden';
        categoryIdInput.id = 'category-id-hidden';
        if (form) { // Check if form exists
            form.appendChild(categoryIdInput); // Add it to the form
        } else {
            console.error("Cannot find form to append categoryId input!");
            return;
        }
    }
    // --- End Check ---

    if (!descriptionSelect || !descriptionManual || !descriptionHiddenInput || !typeInput) {
        console.error("Description select/manual/hidden/type elements missing in handleDescriptionSelect.");
        return; 
    }
    
    const selectedValue = descriptionSelect.value;
    const selectedIndex = descriptionSelect.selectedIndex; 
    const selectedOption = (selectedIndex >= 0 && selectedIndex < descriptionSelect.options.length) 
                            ? descriptionSelect.options[selectedIndex] 
                            : null;

    if (selectedValue === 'Other') {
        descriptionManual.classList.remove('hidden');
        descriptionManual.required = true;
        try { descriptionManual.focus(); } catch(e) {} 
        descriptionHiddenInput.value = ''; 
        categoryIdInput.value = 'other'; // Default category for manual
    } else {
        descriptionManual.classList.add('hidden');
        descriptionManual.required = false;
        descriptionManual.value = ''; 

        descriptionHiddenInput.value = selectedValue; 
        
        if (selectedOption) {
            const transactionType = selectedOption.getAttribute('data-type');
            // --- NEW: Get the categoryId ---
            const categoryId = selectedOption.getAttribute('data-category-id');
            
            if (transactionType) {
                typeInput.value = transactionType;
            } else {
                 console.warn(`Option "${selectedValue}" missing data-type attribute.`);
            }
            
            if (categoryId) {
                categoryIdInput.value = categoryId;
            } else {
                categoryIdInput.value = (transactionType === 'income') ? 'income' : 'other';
            }
            
        } else if (selectedValue !== '') { 
             console.warn(`Could not find selected option for value: ${selectedValue}`);
        }
    }
     console.log("Description select handled. Hidden Desc:", descriptionHiddenInput.value, "Hidden CatID:", categoryIdInput.value, "Type:", typeInput.value);
}

/**
 * Fetches the user's full profile data from the API.
 */
async function fetchUserData() {
    if (!isAuthReady || !authToken) return;
    console.log("Fetching user profile data from API..."); // Log: Fetch User Start

    try {
        const response = await fetch(`${API_BASE_URL}/api/user/profile`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
        });
        if (!response.ok) {
             let errorMsg = `HTTP error! status: ${response.status}`;
             try { const errData = await response.json(); errorMsg = errData.message || errorMsg; } catch(e){}
             throw new Error(errorMsg);
        }
        const result = await response.json();
        console.log("User profile data received:", result); // Log: User Data Received

        if (result.data) { // Assuming success means data exists
            currentUserEmail = result.data.email || currentUserEmail; // Keep old if null/undefined
            
            // Update currency only if fetched data has it, it's a string, and valid format
            if (result.data.currency && typeof result.data.currency === 'string' && /^[A-Z]{3}$/.test(result.data.currency)) {
                 console.log(`Updating currency from profile: ${result.data.currency}`);
                 currentCurrency = result.data.currency;
                 localStorage.setItem('tmt_currency', result.data.currency);
            } else if (result.data.currency) {
                 console.warn(`Received invalid currency format from profile: ${result.data.currency}`);
            }
            // Update email in local storage only if it exists in response
            if (result.data.email) localStorage.setItem('tmt_email', result.data.email);
            
            // Update modal elements if they exist
            if (modalUsernameEl) modalUsernameEl.textContent = currentUserId;
            if (modalEmailEl) modalEmailEl.textContent = currentUserEmail || 'N/A'; // Show N/A if still null
            
            updateNavAuthUI(); // Update main UI with potentially new currency
        } else {
            // Handle cases where response is ok but data might be missing/malformed
            console.error("Profile Fetch Error: Data missing or malformed in response", result);
            showMessage("Could not fully load profile data.", "error");
        }

    } catch (error) {
        console.error("Network error or fetch failure fetching profile:", error);
        showMessage(`Error fetching profile: ${error.message}`, "error");
         // Don't change currency on network error, keep local setting
    }
}

/**
 * Handles showing the profile modal and populating user details.
 */
function showProfileModal() {
    if (!isAuthReady) {
        return showMessage("Please log in to view your profile.", 'error');
    }
    console.log("Showing profile modal."); // Log: Show Modal
    
    // Ensure modal elements exist before updating
    if (modalUsernameEl) modalUsernameEl.textContent = currentUserId || 'N/A';
    if (modalEmailEl) modalEmailEl.textContent = currentUserEmail || 'N/A'; // Show N/A if null

    // Reset password form elements if they exist
    if (passwordForm) passwordForm.reset();
    if (passwordMessageBox) {
        passwordMessageBox.classList.add('hidden');
        passwordMessageBox.textContent = '';
    }
    // Ensure save button is enabled when modal opens
    const savePasswordButton = document.getElementById('save-password-button');
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
    e.preventDefault(); // Prevent default form submission
    if (!isAuthReady || !authToken) return;
    console.log("Attempting to change password..."); // Log: Change Password Start
    
    // Ensure form elements exist
    const currentPasswordInput = document.getElementById('current-password');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-new-password');
    const savePasswordButton = document.getElementById('save-password-button');
    
    // Check required elements
    if (!currentPasswordInput || !newPasswordInput || !confirmPasswordInput || !savePasswordButton || !passwordMessageBox) {
         console.error("Password change form elements not found. Aborting.");
         return;
    }

    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    // --- Validation ---
    if (!currentPassword || !newPassword || !confirmPassword) {
         passwordMessageBox.textContent = "Please fill in all password fields.";
         passwordMessageBox.className = 'p-3 rounded-lg text-white mb-3 bg-red-600'; // Set all classes
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
    // --- End Validation ---


    savePasswordButton.disabled = true;
    passwordMessageBox.classList.add('hidden'); // Hide message during attempt

    try {
        const response = await fetch(`${API_BASE_URL}/api/user/change-password`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ currentPassword, newPassword }),
        });

        // Get response body regardless of status for potential error messages
        const result = await response.json(); 
        console.log("Change password API response:", response.status, result); // Log API response

        if (!response.ok) {
             // Throw error with message from API if available
             throw new Error(result.message || `HTTP error! status: ${response.status}`);
        }

        // --- Success ---
        console.log("Password changed successfully:", result); // Log: Password Success
        passwordMessageBox.textContent = result.message || "Password updated successfully!";
        // Use className for success message styling
        passwordMessageBox.className = 'p-3 rounded-lg text-white mb-3 bg-tmt-primary'; 
        if (passwordForm) passwordForm.reset(); // Reset form on success
        
        showMessage("Password updated. Please log in again.", 'success');
        // Close modal before logout/redirect
         if (profileModal) profileModal.classList.add('hidden');
        setTimeout(handleLogout, 2000); 

    } catch (error) {
        // --- Failure --- CORRECTED CATCH BLOCK ---
        console.error("Error changing password:", error); // Log: Password Error
        // Display error message from caught error
        // Ensure passwordMessageBox exists before setting textContent
        if (passwordMessageBox) {
            passwordMessageBox.textContent = error.message || "Network error or failed to update password.";
             // Use className for error message styling
            passwordMessageBox.className = 'p-3 rounded-lg text-white mb-3 bg-red-600'; // Make sure this line sets the class correctly
             passwordMessageBox.classList.remove('hidden'); // Ensure message box is visible
        } else {
             console.error("Password message box not found to display error.");
             showMessage(error.message || "Network error or failed to update password.", 'error'); // Fallback
        }
    } finally {
        // Ensure button exists before enabling
        const savePasswordButton = document.getElementById('save-password-button');
        if (savePasswordButton) savePasswordButton.disabled = false;
    }
}


/**
 * Sends the new currency preference to the backend API.
 */
async function saveCurrencyPreference(newCurrency) {
    if (!isAuthReady || !authToken) {
        showMessage('Authentication not ready. Cannot save preference.', 'error');
        // Revert UI potentially? Or just don't save.
        if (currencySelect) currencySelect.value = currentCurrency; // Revert dropdown
        return;
    }
    console.log(`Attempting to save currency preference: ${newCurrency}`); // Log: Save Currency Start
    
    // FIX: Prevent saving if the currency hasn't changed
    if (newCurrency === currentCurrency) {
        console.log("Currency preference unchanged, skipping save.");
        updateNavAuthUI(); // Still ensure UI is correct
        return; 
    }

    // Basic validation for currency code format
    if (!/^[A-Z]{3}$/.test(newCurrency)) {
         showMessage(`Invalid currency code format: ${newCurrency}`, 'error');
         if(currencySelect) currencySelect.value = currentCurrency; // Revert dropdown
         return;
    }

    // Optimistically update local state and UI
    const previousCurrency = currentCurrency; // Store previous in case of error
    currentCurrency = newCurrency;
    localStorage.setItem('tmt_currency', newCurrency);
    updateNavAuthUI(); // Update placeholder immediately
    
    // Fetch new rates (await to ensure rates/transactions update before potential API save confirmation)
    await fetchExchangeRates(); // fetchExchangeRates handles calling fetchTransactions internally

    // --- Asynchronously save preference to backend ---
    try {
        const response = await fetch(`${API_BASE_URL}/api/user/settings`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ currency: newCurrency }),
        });
        
        console.log("Save currency API response status:", response.status); // Log: Save Currency Response

        if (!response.ok) {
            // Try to get error message from response
             let errorMsg = `HTTP error! status: ${response.status}`;
             try {
                 const result = await response.json();
                 errorMsg = result.message || errorMsg;
             } catch(e) {} // Ignore if no JSON body
             throw new Error(errorMsg); // Throw to be caught below
        } 
        // Optional: Show confirmation only if backend save succeeds
        showMessage(`Currency preference saved to server.`, 'success'); 
        console.log("Currency preference saved successfully to backend."); // Log: Save Success

    } catch (error) {
        console.error("Error saving currency preference to backend:", error); // Log: Save Currency Error
        showMessage(`Failed to save currency to server: ${error.message}. Local setting kept.`, 'error');
        // Decide on error handling: Keep optimistic update or revert?
        // Keeping it local is often okay.
    }
}

/**
 * Adds a new transaction via the MongoDB API endpoint.
 * FIX: This function now correctly reads the Category ID and uses the selected date.
 */
async function addTransaction(e) {
    e.preventDefault(); 
    console.log("Add transaction form submitted."); 
    
    if (!isAuthReady || !authToken) {
        showMessage('Authentication not ready. Cannot add transaction.', 'error');
        return; 
    }
    
    // --- Get the hidden category ID input ---
    const categoryIdInput = document.getElementById('category-id-hidden');

    if (!descriptionHiddenInput || !amountInput || !typeInput || !descriptionManual || !addButton || !descriptionSelect || !dateInput || !categoryIdInput) {
        console.error("Add transaction form elements missing!");
        showMessage("A form element is missing. Please refresh and try again.", "error");
        return;
    }

    const descriptionValue = descriptionHiddenInput.value.trim();
    const manualDescriptionValue = descriptionManual.value.trim();
    const finalDescription = (descriptionSelect.value === 'Other') ? manualDescriptionValue : descriptionValue;
    
    const amountStr = amountInput.value; 
    const type = typeInput.value;
    // CRITICAL FIX 1: Get the categoryId value
    const categoryId = categoryIdInput.value || (type === 'income' ? 'income' : 'other');

    if (!finalDescription) {
         showMessage('Please select a description or enter a custom one.', 'error');
         return; 
    }
    if (!amountStr) { 
        showMessage('Please enter an amount.', 'error');
        return;
    }
    
    const amountInCurrentCurrency = parseFloat(amountStr); 
    if (isNaN(amountInCurrentCurrency) || amountInCurrentCurrency <= 0 || !isFinite(amountInCurrentCurrency)) {
        showMessage('Please enter a valid positive amount.', 'error');
        return; 
    }
    const dateValue = dateInput.value; // e.g., "2025-11-06"
    
    if (!dateValue) {
        showMessage('Please select a date for the transaction.', 'error');
        return; 
    }
    
    // CRITICAL FIX 2: Use the exact timestamp from the user's date input
    // Using T12:00:00.000Z ensures the UTC date is respected regardless of local timezone offset
    const transactionTimestamp = new Date(dateValue + 'T12:00:00.000Z').toISOString();
    
    const amountInBaseCurrency = convertFromCurrentCurrencyToBase(amountInCurrentCurrency);

    console.log(`Adding transaction: Desc='${finalDescription}', CatID='${categoryId}', Amount=${amountInCurrentCurrency} (${currentCurrency}), Base=${amountInBaseCurrency} (${baseCurrency}), Type='${type}'`);
    addButton.disabled = true; 

    try {
        const transactionData = {
            description: finalDescription, 
            amount: amountInBaseCurrency, 
            type,
            categoryId: categoryId, // <--- NOW INCLUDED
            timestamp: transactionTimestamp, // <--- NOW INCLUDED
        };
        console.log("Sending transaction data:", transactionData); 
        
        const response = await fetch(`${API_BASE_URL}/api/transactions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(transactionData),
        });

        const result = await response.json(); 
        console.log("Add transaction API response:", response.status, result); 

        if (!response.ok) {
             throw new Error(result.message || `HTTP error! status: ${response.status}`);
        }

        showMessage(`Successfully added ${type} for ${formatCurrency(amountInCurrentCurrency)}: ${finalDescription}`, 'success');
        if (form) form.reset(); 
        handleDescriptionSelect(); 
        
        if (dateInput) {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            dateInput.value = `${yyyy}-${mm}-${dd}`;
        }
        
        console.log("Transaction added successfully, fetching updated list..."); 
        fetchTransactions(); // This will refresh all summaries (Actual and Projected)
        
    } catch (error) {
        console.error("Error adding transaction:", error); 
        showMessage(`Failed to add transaction: ${error.message}`, 'error');
    } finally {
        if (addButton) addButton.disabled = false; 
        console.log("Add button re-enabled."); 
    }
}


/**
 * Fetches transactions from the MongoDB API endpoint.
 */
async function fetchTransactions() {
    if (!isAuthReady || !authToken) {
        console.log("Cannot fetch transactions: Not authenticated."); // Log: Auth Guard
        return;
    }
    console.log("Fetching transactions from API..."); // Log: Fetch Start

    // Show loading state
    if(transactionList) transactionList.innerHTML = '<p id="loading-message" class="text-center text-gray-500 p-4">Loading transactions...</p>';

    // --- NEW: Also fetch projections when transactions are fetched ---
    // This ensures the "Projected" summary is always in sync
    fetchProjections();
    // -------------------------------------------------------------

    try {
        const response = await fetch(`${API_BASE_URL}/api/transactions`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
        });

        // Get response status and potentially body even on error
        const status = response.status;
        // IMPORTANT: Check for content type before assuming JSON
        let result;
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            result = await response.json(); 
        } else {
             // Handle non-JSON responses (e.g., HTML error pages from server)
             const textResult = await response.text();
             console.error("Received non-JSON response from API:", status, textResult);
             throw new Error(`Server returned non-JSON response (Status: ${status})`);
        }
        
        console.log("Fetch transactions API response:", status, result); // Log: Fetch Response

        if (!response.ok) {
             throw new Error(result.message || `HTTP error! status: ${status}`);
        }

        // Ensure result.data is an array before passing it
        if (Array.isArray(result.data)) {
            console.log(`Received ${result.data.length} transactions.`); // Log: Fetch Success Count
            updateSummary(result.data); 
            renderTransactions(result.data);
        } else {
             console.error("API returned invalid data format for transactions (expected data array):", result);
             showMessage('Received invalid transaction data from server.', 'error');
             updateSummary([]); // Update with empty data
             renderTransactions([]);
        }

    } catch (error) {
        console.error("Network or API Fetch Error (Transactions):", error); // Log: Fetch Error
        showMessage(`Could not load transactions: ${error.message}`, 'error');
        updateSummary([]); // Update with empty data on network error
        renderTransactions([]);
        // Ensure loading message is removed on error too
        const loadingMessage = document.getElementById('loading-message');
        if (loadingMessage) loadingMessage.remove(); 
        if(transactionList) transactionList.innerHTML = '<p class="text-center text-red-500 p-4">Error loading transactions.</p>'; // Show error in list
    }
}

/**
 * Deletes a transaction via the MongoDB API endpoint.
 */
async function deleteTransaction(id) {
    if (!isAuthReady || !authToken || !id) {
         showMessage('Authentication not ready or invalid ID.', 'error');
         console.warn("Delete prevented: Auth Ready:", isAuthReady, "Token:", !!authToken, "ID:", id); // Log: Delete Guard
         return;
    }
    console.log(`Attempting to delete transaction ID: ${id}`); // Log: Delete Start

    // Optional: Add UI feedback that deletion is in progress
    const buttonToDelete = transactionList ? transactionList.querySelector(`button[data-id="${id}"]`) : null;
    if (buttonToDelete) buttonToDelete.disabled = true; // Disable button during request

    try {
        const response = await fetch(`${API_BASE_URL}/api/transactions/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`,
            },
        });
        
        console.log("Delete transaction API response status:", response.status); // Log: Delete Response Status

         if (!response.ok) {
             let errorMsg = `HTTP error! status: ${response.status}`;
             try {
                 // Try to get more specific error from response body
                 const errorResult = await response.json();
                 errorMsg = errorResult.message || errorMsg;
             } catch (e) {
                 // Body might not be JSON or might be empty
                 console.warn("Could not parse error response body for delete.", e);
             }
             throw new Error(errorMsg);
        }
        
        // --- Success ---
        console.log(`Transaction ${id} deleted successfully.`); // Log: Delete Success
        showMessage('Transaction deleted successfully.', 'success');
        
        // Re-fetch everything to ensure all summaries (Actual and Projected) are updated.
        fetchTransactions(); 
        
    } catch (error) {
        // --- Failure ---
        console.error("Error deleting transaction:", error); // Log: Delete Error
        showMessage(`Failed to delete transaction: ${error.message}`, 'error');
         // Re-enable button on failure if it exists
         if (buttonToDelete) buttonToDelete.disabled = false;
    }
}

// ############### NEW FUNCTIONS FOR PROJECTED DATA ###############

/**
 * Fetches all projections and finds the one for the CURRENT month.
 */
async function fetchProjections() {
    if (!isAuthReady) {
        console.log("Cannot fetch projections: Not authenticated.");
        updateProjectedSummary(null); // Clear the boxes
        return;
    }
    console.log("Fetching projections from API...");

    try {
        const response = await fetch(`${API_BASE_URL}/api/projections`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || "Failed to fetch projections");
        }

        const result = await response.json();
        const allProjections = result.data || [];

        // Find the projection for the CURRENT month
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = String(now.getMonth() + 1).padStart(2, '0'); // e.g., "11" for November
        const currentMonthYear = `${currentYear}-${currentMonth}`; // e.g., "2025-11"

        const currentMonthProjection = allProjections.find(p => p.monthYear === currentMonthYear);

        if (currentMonthProjection) {
            console.log("Found projection for current month:", currentMonthYear);
            updateProjectedSummary(currentMonthProjection);
        } else {
            console.log("No projection found for current month:", currentMonthYear);
            updateProjectedSummary(null); // No plan found, show $0
        }

    } catch (error) {
        console.error("Error fetching projections:", error);
        showMessage(`Could not load projection data: ${error.message}`, 'error');
        updateProjectedSummary(null); // Show $0 on error
    }
}

/**
 * Updates the NEW "Projected Summary" boxes.
 * @param {object | null} projection - The projection object for the current month, or null if none.
 */
function updateProjectedSummary(projection) {
    let pIncome = 0;
    let pExpenses = 0;
    let pNet = 0;

    if (projection) {
        pIncome = parseFloat(projection.projectedIncome) || 0;
        
        // Convert the projectedExpenses object back into a Map to read it
        const expenseMap = new Map(Object.entries(projection.projectedExpenses || {}));

        expenseMap.forEach((amount, catId) => {
            const category = CATEGORIES.find(c => c.id === catId);
            const numAmount = parseFloat(amount) || 0;
            
            // We only sum 'expense' types for this box, not goals
            if (category && category.type === 'expense') {
                pExpenses += numAmount;
            }
            // Note: We don't show "To Invest/Save" on this page
        });

        pNet = pIncome - pExpenses;
    }

    // Convert to display currency and update DOM
    if (projectedIncomeEl) projectedIncomeEl.textContent = formatCurrency(convertToCurrentCurrency(pIncome), false);
    if (projectedExpensesEl) projectedExpensesEl.textContent = formatCurrency(convertToCurrentCurrency(pExpenses), false);
    if (projectedNetBalanceEl) {
        projectedNetBalanceEl.textContent = formatCurrency(convertToCurrentCurrency(pNet), false);
        if (pNet >= 0) {
            projectedNetBalanceEl.classList.remove('text-red-500');
            projectedNetBalanceEl.classList.add('text-tmt-secondary');
        } else {
            projectedNetBalanceEl.classList.remove('text-tmt-secondary');
            projectedNetBalanceEl.classList.add('text-red-500');
        }
    }
}
// #############################################################

// --- NEW FUNCTION: Client-Side Filtering for Dashboard ---
/**
 * Filters the currently rendered transactions on the dashboard based on the search input.
 * This is efficient because it only filters the small list already loaded in the DOM.
 * @param {string} searchTerm - The text to filter by.
 */
function filterDashboardTransactions(searchTerm) {
    if (!transactionList) {
        console.warn("Transaction list not available for search filtering.");
        return;
    }
    const searchTermLower = searchTerm.toLowerCase().trim();
    
    // Select all rendered transaction items
    const transactions = transactionList.querySelectorAll('div.flex.justify-between.items-center'); 
    
    transactions.forEach(transaction => {
        const descriptionElement = transaction.querySelector('p.font-semibold');
        if (descriptionElement) {
            const description = descriptionElement.textContent.toLowerCase();
            // Show/hide based on search term match
            transaction.style.display = description.includes(searchTermLower) ? 'flex' : 'none';
        }
    });
}
// --- END NEW FUNCTION ---


// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed. Setting up listeners."); // Log: DOMContentLoaded

    // Initial check for add button state
    if (addButton) {
        console.log("Add button found, ensuring it's disabled initially.");
        addButton.disabled = true; 
    } else {
        console.error("FATAL: Add button element ('add-entry-button') not found!");
    }
    
    // Initialize Auth and fetch initial data
    initializeAppAndAuth();
    // --- Date Input Initialization ---
    if (dateInput) {
        // Get today's date in YYYY-MM-DD format
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0'); // Months start at 0
        const dd = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
        console.log("Date input initialized to:", dateInput.value);
    } else {
        console.error("Date input element ('date-input') not found!");
    }
    
    // --- Attach Listeners Safely ---

    // 1. Transaction Form Handlers
    if (form) {
        console.log("Attaching submit listener to transaction form.");
        form.addEventListener('submit', addTransaction);
    } else {
         console.error("Transaction form element ('transaction-form') not found!");
    }
    
    // 2. Description Dropdown and Manual Input Toggling
    if (descriptionSelect) {
        console.log("Attaching change listener to description select.");
        descriptionSelect.addEventListener('change', handleDescriptionSelect);
        
        if (descriptionManual) {
             console.log("Attaching input listener to manual description input.");
            descriptionManual.addEventListener('input', () => {
                // Ensure other elements exist before updating
                if (descriptionSelect && descriptionHiddenInput && descriptionSelect.value === 'Other') {
                    descriptionHiddenInput.value = descriptionManual.value.trim();
                }
            });
        } else {
            console.error("Manual description input element ('description-manual') not found!");
        }
        
        // Run once on load to initialize hidden input value and type dropdown
        handleDescriptionSelect();
    } else {
         console.error("Description select element ('description-select') not found!");
    }
    
    // 3. Delete button handler (event delegation on transactionList)
    if (transactionList) {
        console.log("Attaching click listener for delete buttons on transaction list.");
        transactionList.addEventListener('click', (e) => {
            // Ensure the click happened on or inside a delete button
            const deleteButton = e.target.closest('.delete-button'); 
            if (deleteButton) {
                const transactionId = deleteButton.dataset.id; // Access data attribute correctly
                if (transactionId) {
                    console.log(`Delete button clicked for ID: ${transactionId}`);
                     // Optional Confirmation (using a simple confirm for now)
                    // Replace with a custom modal in production
                    // Use window.confirm for now, replace later
                    if (window.confirm('Are you sure you want to delete this transaction?')) {
                         showMessage('Attempting to delete transaction...', 'info'); 
                         deleteTransaction(transactionId);
                     } else {
                          console.log("Deletion cancelled by user.");
                     }
                } else {
                    console.warn("Delete button clicked but no data-id found.", deleteButton);
                }
            }
        });
    } else {
        console.error("Transaction list element ('transaction-list') not found!");
    }

    // 4. Logout button handler
    if (logoutBtn) {
         console.log("Attaching click listener to logout button.");
        logoutBtn.addEventListener('click', handleLogout);
    } else {
        // This might be expected if the user isn't logged in initially
        console.warn("Logout button element ('logout-button') not found (might be hidden)."); 
    }
    
    // 5. Currency selector change handler
    if (currencySelect) {
         console.log("Attaching change listener to currency select.");
        currencySelect.addEventListener('change', (e) => {
            console.log(`Currency select changed to: ${e.target.value}`);
            saveCurrencyPreference(e.target.value);
        });
    } else {
        console.error("Currency select element ('currency-select') not found!");
    }

    // 6. Profile Modal Handlers
    if (profileButton) {
        console.log("Attaching click listener to profile button.");
        profileButton.addEventListener('click', showProfileModal);
    } else {
         // This might be expected if the user isn't logged in initially
        console.warn("Profile button element ('profile-button') not found (might be hidden).");
    }
    if (closeModalBtn) {
         console.log("Attaching click listener to close modal button.");
        closeModalBtn.addEventListener('click', () => {
             if (profileModal) profileModal.classList.add('hidden');
             else console.error("Profile modal element not found when trying to close.");
        });
    }
    if (passwordForm) {
         console.log("Attaching submit listener to password form.");
        passwordForm.addEventListener('submit', changePassword);
    } else {
         console.error("Password form element ('change-password-form') not found!");
    }
    
    // 7. Search handler: ATTACH LIVE FILTERING FUNCTION
    const searchInput = document.getElementById('transaction-search');
    if (searchInput) {
         console.log("Attaching input listener to search input for live filtering.");
        searchInput.addEventListener('input', (e) => filterDashboardTransactions(e.target.value));
    } else {
        console.warn("Search input element ('transaction-search') not found.");
    }
    
    // 8. Form Toggle Handler
    if (toggleFormButton && transactionFormContainer) {
         console.log("Attaching click listener to form toggle button.");
        toggleFormButton.addEventListener('click', () => {
            const isHidden = transactionFormContainer.classList.toggle('hidden');
            // Change icon based on state
            const icon = toggleFormButton.querySelector('i');
            if (icon) {
                 // The easiest way to change the lucide icon is to update the data-lucide attribute
                 icon.setAttribute('data-lucide', isHidden ? 'plus' : 'minus');
                 lucide.createIcons(); // Re-render icons after changing attribute
                 toggleFormButton.setAttribute('title', isHidden ? 'Open Add Transaction Form' : 'Close Add Transaction Form');
            }
        });
    } else {
        console.error("Form toggle button or container not found!");
    }
    
    console.log("All event listeners attached."); // Log: Listeners End
});