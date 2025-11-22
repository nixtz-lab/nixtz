//
// ─── BUDGET PLANNER SCRIPT (USING MONGODB API) ───────────────────────────────────
//
// This script REPLACES the Firebase version.
// It uses the same server.js API as budget_tracker_script.js
//

// --- Global API & Auth State ---
const API_BASE_URL = window.location.origin;
let apiAuthToken = null; // This is the JWT token for your server.js API
let apiUsername = null; // This is the username for your server.js API
let isAuthReady = false;

// --- Categories (Must match tracker and planner) ---
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

// --- Currency & API Config ---
// ALPHA_VANTAGE_HOST, and ALPHA_VANTAGE_URL
let currentCurrency = 'USD'; // Default currency
let exchangeRates = { USD: 1.00 };
let baseCurrency = 'USD'; // Transactions are stored in USD

// --- Global Data Cache ---
let allProjections = [];
let currentViewedProjection = null;

// --- DOM Elements ---
let userInfoEl, logoutBtn, profileButton, currencySelect, userInitialsEl, usernameDisplay;
let monthSelector, projectedIncomeInput, expenseGoalsContainer, plannedLeftoverEl, saveButton;
let projectionsList, summaryMonthNameEl, totalProjectedIncomeEl, totalProjectedExpenseEl;
let projectedNetBalanceEl, projectedAllocationEl; // 'viewProjectionButton' removed
let toggleFormButton, projectionFormContainer;
// 'totalActualIncomeEl', 'totalActualExpenseEl', 'actualNetBalanceEl' REMOVED

// --- Utility Functions ---

function showMessage(text, type = 'success') {
    if (!document.getElementById('message-box') || !document.getElementById('message-text')) return;
    const box = document.getElementById('message-box');
    const textEl = document.getElementById('message-text');
    let bgColor = type === 'success' ? 'bg-tmt-primary' : 'bg-red-600';
    box.className = `fixed top-20 right-5 p-4 rounded-xl shadow-2xl text-white z-50 transition-all duration-300 transform ${bgColor} translate-x-10 opacity-0`;
    textEl.textContent = text;
    box.classList.remove('opacity-0', 'translate-x-10', 'pointer-events-none');
    box.classList.add('opacity-100', 'translate-x-0', 'pointer-events-auto');
    setTimeout(() => {
        box.classList.remove('opacity-100', 'translate-x-0', 'pointer-events-auto');
        box.classList.add('opacity-0', 'translate-x-10', 'pointer-events-none');
    }, 3000);
}

function convertToCurrentCurrency(amount) {
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount)) return 0; 
    if (currentCurrency === baseCurrency || typeof exchangeRates[currentCurrency] !== 'number') {
        return numericAmount; 
    }
    const rate = exchangeRates[currentCurrency];
    if (isNaN(rate) || rate <= 0) return numericAmount; 
    return numericAmount * rate;
}

function convertFromCurrentCurrencyToBase(amount) {
    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount)) return 0;
    if (currentCurrency === baseCurrency) return numericAmount;
    const rate = exchangeRates[currentCurrency];
    if (typeof rate !== 'number' || isNaN(rate) || rate <= 0) {
        const fallbackRate = exchangeRates[currentCurrency] || 1.0;
        if (fallbackRate <= 0) return numericAmount; 
        return numericAmount / fallbackRate;
    }
    return numericAmount / rate;
}

async function fetchExchangeRates() {
    console.log(`Fetching exchange rates for: ${currentCurrency}`);
    if (currentCurrency === baseCurrency) {
        console.log("Current currency is base currency (USD), skipping fetch.");
        forceUIRefresh(); 
        return; 
    }
    
    // *** MODIFIED: Call the secure backend proxy route instead of the external API ***
    const url = `${API_BASE_URL}/api/currency/currency-rate?to_currency=${currentCurrency}`;

    try {
        const response = await fetch(url); // No headers required now, as the backend handles the key
        
        if (!response.ok) {
            const errorJson = await response.json();
            throw new Error(errorJson.message || `HTTP error ${response.status}.`);
        }
        
        const data = await response.json(); // Expected format: { rate: X.XXX }
        const rate = parseFloat(data.rate);

        if (isNaN(rate) || rate <= 0) { 
            throw new Error(`Invalid rate received from backend: ${data.rate}`); 
        }
        
        exchangeRates[currentCurrency] = rate;
        showMessage(`Live rate for ${currentCurrency} updated to ${rate.toFixed(4)}!`, 'success');

    } catch (error) {
        console.error("Currency API Fetch Catch Error:", error);
        // Removed specific Alpha Vantage error messages
        showMessage(`Failed to fetch live rate: ${error.message}. Using default.`, 'error');
        if (!exchangeRates[currentCurrency]) { exchangeRates[currentCurrency] = 1.0; }
    } finally {
        forceUIRefresh(); 
    }
}
// --- REST OF THE FILE IS UNCHANGED ---
const formatCurrency = (amount, includeDecimals = true) => {
    const numericAmount = parseFloat(amount); 
    if (isNaN(numericAmount) || !isFinite(numericAmount)) { amount = 0; } else { amount = numericAmount; }
    const digits = includeDecimals ? 2 : 0;
    if (currentCurrency === 'THB') {
         try {
             const numberFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
             const formattedNumber = numberFormatter.format(amount);
             return `฿${formattedNumber}`;
         } catch (formatError) { return `฿${amount.toFixed(digits)}`; }
    }
    const options = { style: 'currency', currency: currentCurrency, minimumFractionDigits: digits, maximumFractionDigits: digits };
    try {
        return new Intl.NumberFormat('en-US', options).format(amount);
    } catch (e) {
        const formattedAmount = amount.toFixed(digits); 
        return `${currentCurrency} ${formattedAmount}`;
    }
};

function forceUIRefresh() {
    console.log("Forcing UI refresh due to currency change...");
    updateSummaryDisplay(currentViewedProjection); 
    renderProjectionsList(allProjections); 
    updateFormCalculations(); 
    updateNavAuthUI(); 
}

// --- API-based Initialization ---
async function initializeApp() {
    // 1. Get tokens and settings from localStorage
    apiAuthToken = localStorage.getItem('tmt_auth_token');
    apiUsername = localStorage.getItem('tmt_username');
    currentCurrency = localStorage.getItem('tmt_currency') || 'USD'; 

    initializePlannerUI(); // Build the form
    
    // 2. Check if user is logged in
    if (apiAuthToken && apiUsername) {
        isAuthReady = true;
        if (userInfoEl) userInfoEl.textContent = `Authentication Status: Connected as ${apiUsername}`;
        if (currencySelect) currencySelect.value = currentCurrency;

        fetchProjections(); 
        fetchExchangeRates(); 
        
        if (saveButton) saveButton.disabled = false;
        if (toggleFormButton) toggleFormButton.disabled = false;
    } else {
        isAuthReady = false;
        if (userInfoEl) userInfoEl.textContent = "Authentication Status: Not Logged In.";
        if (saveButton) saveButton.disabled = true;
        if (toggleFormButton) toggleFormButton.disabled = false; 
        showMessage("Please log in to use the Budget Planner.", 'error');
        renderProjectionsList([]);
    }
    
    updateNavAuthUI();
}

/**
 * Updates the navigation bar UI.
 */
function updateNavAuthUI() {
    const username = apiUsername || 'User'; 
    if (usernameDisplay) {
        const displayUsername = username.charAt(0).toUpperCase() + username.slice(1);
        usernameDisplay.textContent = displayUsername;
        if (userInitialsEl) userInitialsEl.textContent = displayUsername; 
    }
    
    let currencySymbol = currentCurrency;
    try {
        const formattedZero = new Intl.NumberFormat('en-US', { style: 'currency', currency: currentCurrency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(0);
        currencySymbol = formattedZero.replace(/[\d\s,.\-()]/g, ''); 
        if (currentCurrency === 'THB' && !currencySymbol) { currencySymbol = '฿';
        } else if (!currencySymbol || currencySymbol === currentCurrency) { currencySymbol = currentCurrency; }
    } catch (e) {
        if (currentCurrency === 'THB') currencySymbol = '฿';
        else currencySymbol = currentCurrency;
    }
    
    const currencySymbolFormEl = document.getElementById('currency-symbol-form');
    if (currencySymbolFormEl) { currencySymbolFormEl.textContent = `(${currencySymbol})`; }
    if (projectedIncomeInput) { projectedIncomeInput.placeholder = `e.g. 5000 (${currencySymbol})`; }
}

/**
 * Saves the new currency preference to the API.
 */
async function saveCurrencyPreference(newCurrency) {
    if (!/^[A-Z]{3}$/.test(newCurrency)) {
         showMessage(`Invalid currency code format: ${newCurrency}`, 'error');
         if(currencySelect) currencySelect.value = currentCurrency; 
         return;
    }
    if (newCurrency === currentCurrency) { return; }

    currentCurrency = newCurrency;
    localStorage.setItem('tmt_currency', newCurrency);
    updateNavAuthUI(); 
    
    await fetchExchangeRates(); 
    
    if (!apiAuthToken) {
        showMessage("Currency saved locally, but not logged into server.", "info");
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/user/settings`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${apiAuthToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ currency: newCurrency }),
        });
        if (!response.ok) { throw new Error(`Server error: ${response.status}`); } 
        showMessage(`Currency preference saved to server.`, 'success'); 
    } catch (error) {
        console.error("Error saving currency preference to backend:", error);
        showMessage(`Failed to save currency to server: ${error.message}.`, 'error');
    }
}

/**
 * Handles the user logout process.
 */
async function handleLogout() {
    localStorage.removeItem('tmt_auth_token'); 
    localStorage.removeItem('tmt_username'); 
    localStorage.removeItem('tmt_currency');
    localStorage.removeItem('tmt_email'); 

    showMessage("You have been successfully logged out. Redirecting...", 'success');

    setTimeout(() => {
        window.location.href = 'budget_planner.html'; 
    }, 500);
}

// --- Planner UI Logic ---

function updateFormCalculations() {
    if (!projectedIncomeInput || !expenseGoalsContainer || !plannedLeftoverEl) return; 
    const incomeInCurrent = parseFloat(projectedIncomeInput.value) || 0;
    const income = convertFromCurrentCurrencyToBase(incomeInCurrent);
    let totalExpense = 0; 
    let totalGoals = 0; 
    
    const inputs = expenseGoalsContainer.querySelectorAll('.cat-input');
    inputs.forEach(input => {
        const amountInCurrent = parseFloat(input.value) || 0;
        const amount = convertFromCurrentCurrencyToBase(amountInCurrent);
        const categoryId = input.getAttribute('data-category-id');
        const category = CATEGORIES.find(c => c.id === categoryId);
        if (category && category.type === 'expense') { totalExpense += amount; } 
        else if (category && category.type === 'goal') { totalGoals += amount; }
    });

    const plannedLeftover = income - totalExpense - totalGoals; 
    plannedLeftoverEl.textContent = formatCurrency(convertToCurrentCurrency(plannedLeftover), false);
    if (plannedLeftover >= 0) {
        plannedLeftoverEl.classList.remove('text-red-500');
        plannedLeftoverEl.classList.add('text-tmt-secondary');
    } else {
        plannedLeftoverEl.classList.remove('text-tmt-secondary');
        plannedLeftoverEl.classList.add('text-red-500');
    }
}

function initializePlannerUI() {
    if (!monthSelector) return; 
    
    // *** MODIFIED: Set the default to the current month/year ***
    const now = new Date();
    // Get the current year and current month
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    
    // Set the default value to the current month/year (e.g., "2025-11")
    monthSelector.value = `${yyyy}-${mm}`;
    
    // Set minimum selectable date to a historical date to allow planning for previous months
    monthSelector.min = `2000-01`; 
    // *** END MODIFICATION ***
    
    if (projectedIncomeInput && expenseGoalsContainer) {
        projectedIncomeInput.addEventListener('input', updateFormCalculations);
        expenseGoalsContainer.addEventListener('input', (e) => {
            if (e.target.classList.contains('cat-input')) { updateFormCalculations(); }
        });
    }
    updateFormCalculations();
}

function loadProjectionToForm(projection) {
    if (!projection || !monthSelector || !projectedIncomeInput) return; 
    monthSelector.value = projection.monthYear;
    projectedIncomeInput.value = convertToCurrentCurrency(projection.projectedIncome).toFixed(0);
    CATEGORIES.forEach(cat => {
        const input = document.getElementById(`cat-${cat.id}`);
        if (input) {
            // Use Map.get() for projectedExpenses (which is a Map)
            const amountInBase = projection.projectedExpenses.get(cat.id) || 0;
            input.value = convertToCurrentCurrency(amountInBase).toFixed(0);
        }
    });
    updateFormCalculations(); 
    showMessage(`Loaded plan for ${projection.monthYear} into the form.`, 'success');
    if (projectionFormContainer.classList.contains('hidden')) {
        toggleFormButton.click();
    }
}


// --- API Operations (For *Projections*) ---

/**
 * Fetches projections from the server.js API
 */
async function fetchProjections() {
    if (!isAuthReady) return;

    try {
        const response = await fetch(`${API_BASE_URL}/api/projections`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiAuthToken}` }
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || "Failed to fetch projections");
        }
        const result = await response.json();
        
        // Convert plain object from JSON back into a Map
        allProjections = result.data.map(proj => {
            return {
                ...proj,
                // The server saves projectedExpenses as a Map, but JSON stringifies it
                // We must convert it back to a Map object for consistency
                projectedExpenses: new Map(Object.entries(proj.projectedExpenses || {}))
            };
        });
        
        renderProjectionsList(allProjections); 

        const sorted = allProjections.sort((a, b) => b.monthYear.localeCompare(a.monthYear));
        
        if (!currentViewedProjection && sorted.length > 0) {
            currentViewedProjection = sorted[0]; 
        }
        
        // This function no longer needs to be awaited
        updateSummaryDisplay(currentViewedProjection);
    } catch (error) {
        console.error("Error listening to projections:", error);
        showMessage(`Failed to load plans: ${error.message}`, 'error');
    }
}

/**
 * Renders the list of projections.
 */
function renderProjectionsList(projections) {
    if (!projectionsList) return; 
    projectionsList.innerHTML = '';
    
    if (!projections || projections.length === 0) {
        projectionsList.innerHTML = '<p class="text-center text-gray-500 p-4">No monthly plans saved yet.</p>';
        return;
    }

    const sortedProjections = projections.sort((a, b) => b.monthYear.localeCompare(a.monthYear));

    sortedProjections.forEach(p => {
        const incomeInBase = parseFloat(p.projectedIncome) || 0;
        
        // Calculate total from the Map
        let totalExpensesAndGoalsInBase = 0;
        if (p.projectedExpenses instanceof Map) {
            p.projectedExpenses.forEach(amount => {
                totalExpensesAndGoalsInBase += (parseFloat(amount) || 0);
            });
        }
        
        const netBalanceInBase = incomeInBase - totalExpensesAndGoalsInBase;
        const netColor = netBalanceInBase >= 0 ? 'text-tmt-primary' : 'text-red-500';
        
        const projectionEl = document.createElement('div');
        projectionEl.className = 'flex justify-between items-center bg-gray-800/80 p-4 rounded-xl shadow-md border border-gray-700/50 hover:bg-gray-700/50 transition duration-200';
        
        const monthName = new Date(p.monthYear + '-01').toLocaleString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long' });

        projectionEl.innerHTML = `
            <div class="flex flex-col flex-grow truncate min-w-[50%]">
                <p class="font-semibold text-white text-lg">${monthName}</p>
                <p class="text-sm text-gray-400 mt-1">Income: ${formatCurrency(convertToCurrentCurrency(incomeInBase), false)}</p>
                <p class="text-sm font-bold ${netColor} mt-1">Planned Outflow: ${formatCurrency(convertToCurrentCurrency(totalExpensesAndGoalsInBase), false)}</p>
            </div>
            <div class="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">
                <button data-id="${p._id}" data-month-year="${p.monthYear}" class="view-button text-gray-500 hover:text-tmt-secondary p-1 sm:p-2 rounded-full transition duration-150 transform hover:scale-110" title="View in Summary">
                    <i data-lucide="eye" class="w-5 h-5 pointer-events-none"></i>
                </button>
                <button data-id="${p._id}" data-month-year="${p.monthYear}" class="load-button text-gray-500 hover:text-tmt-primary p-1 sm:p-2 rounded-full transition duration-150 transform hover:scale-110" title="Load to Edit">
                    <i data-lucide="edit" class="w-5 h-5 pointer-events-none"></i>
                </button>
                <button data-id="${p._id}" data-month-year="${p.monthYear}" class="delete-button text-gray-500 hover:text-red-500 p-1 sm:p-2 rounded-full transition duration-150 transform hover:scale-110" title="Delete Plan">
                    <i data-lucide="trash-2" class="w-5 h-5 pointer-events-none"></i>
                </button>
            </div>
        `;
        projectionsList.appendChild(projectionEl);
    });

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

/**
 * Calculates and updates ONLY the projected summary cards.
 */
function updateSummaryDisplay(projection) {
    if (!summaryMonthNameEl) return; 

    // --- Handle No Projection Selected ---
    if (!projection) {
        summaryMonthNameEl.textContent = 'No Plan Selected';
        totalProjectedIncomeEl.textContent = formatCurrency(0);
        totalProjectedExpenseEl.textContent = formatCurrency(0);
        projectedNetBalanceEl.textContent = formatCurrency(0);
        projectedAllocationEl.textContent = formatCurrency(0);
        projectedNetBalanceEl.classList.remove('text-red-500');
        projectedNetBalanceEl.classList.add('text-tmt-secondary');
        currentViewedProjection = null; 
        return;
    }
    
    currentViewedProjection = projection; 
    
    // --- 1. UPDATE PROJECTED SUMMARY (From MongoDB) ---
    const income = parseFloat(projection.projectedIncome) || 0;
    let totalExpense = 0; 
    let totalGoals = 0; 
    
    if (projection.projectedExpenses instanceof Map) {
        projection.projectedExpenses.forEach((amount, catId) => {
            const category = CATEGORIES.find(c => c.id === catId);
            const numAmount = parseFloat(amount) || 0;
            
            if (category && category.type === 'expense') { totalExpense += numAmount; } 
            else if (category && category.type === 'goal') { totalGoals += numAmount; }
        });
    }

    const netBalance = income - totalExpense; 
    const allocation = totalGoals;
    const monthName = new Date(projection.monthYear + '-01').toLocaleString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
    summaryMonthNameEl.textContent = monthName;
    totalProjectedIncomeEl.textContent = formatCurrency(convertToCurrentCurrency(income), false);
    totalProjectedExpenseEl.textContent = formatCurrency(convertToCurrentCurrency(totalExpense), false);
    projectedNetBalanceEl.textContent = formatCurrency(convertToCurrentCurrency(netBalance), false);
    projectedAllocationEl.textContent = formatCurrency(convertToCurrentCurrency(allocation), false);
    if (netBalance >= 0) {
        projectedNetBalanceEl.classList.remove('text-red-500');
        projectedNetBalanceEl.classList.add('text-tmt-secondary');
    } else {
        projectedNetBalanceEl.classList.remove('text-tmt-secondary');
        projectedNetBalanceEl.classList.add('text-red-500');
    }

    // --- 2. "Actual Summary" logic has been removed ---
}


/**
 * Submits the projection data to the server.js API.
 */
async function saveProjection(e) {
    e.preventDefault();
    if (!isAuthReady) return showMessage('Authentication required to save plan.', 'error');
    
    saveButton.disabled = true;

    const monthYear = monthSelector.value;
    const incomeInCurrent = parseFloat(projectedIncomeInput.value) || 0;
    const income = convertFromCurrentCurrencyToBase(incomeInCurrent);

    // Convert the form inputs into an object for JSON
    let expensesObject = {}; 
    expenseGoalsContainer.querySelectorAll('.cat-input').forEach(input => {
        const categoryId = input.getAttribute('data-category-id');
        const amountInCurrent = parseFloat(input.value) || 0;
        const amount = convertFromCurrentCurrencyToBase(amountInCurrent);
        expensesObject[categoryId] = amount;
    });

    const totalOutflow = Object.values(expensesObject).reduce((sum, amount) => sum + amount, 0);
    if (totalOutflow > income) {
        const overageInCurrent = convertToCurrentCurrency(totalOutflow - income);
        showMessage(`Planned outflow exceeds income by ${formatCurrency(overageInCurrent, false)}. Please adjust.`, 'error');
        saveButton.disabled = false;
        return;
    }

    const projectionData = {
        monthYear: monthYear,
        projectedIncome: income, 
        projectedExpenses: expensesObject, // Send the plain object
    };
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/projections`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiAuthToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(projectionData)
        });
        
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.message || `Server error: ${response.status}`);
        }
        
        showMessage(`Plan for ${monthYear} saved/updated successfully!`, 'success');
        
        // Manually refresh the list from the server
        fetchProjections(); 
        
        if (!projectionFormContainer.classList.contains('hidden')) {
            toggleFormButton.click();
        }
        
    } catch (error) {
        console.error("Error saving projection:", error);
        showMessage(`Failed to save plan: ${error.message}`, 'error');
    } finally {
        saveButton.disabled = false;
    }
}

/**
 * Deletes a projection document via the server.js API.
 */
async function deleteProjection(monthYear) {
    if (!isAuthReady || !monthYear) return;

    if (!confirm(`Are you sure you want to delete the plan for ${monthYear}?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/projections/${monthYear}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${apiAuthToken}` }
        });

        const result = await response.json();
        if (!response.ok) {
             throw new Error(result.message || `Server error: ${response.status}`);
        }

        showMessage(`Plan for ${monthYear} deleted.`, 'success');
        
        // Manually refresh the list
        fetchProjections(); 
        
        if (currentViewedProjection && currentViewedProjection.monthYear === monthYear) {
            updateSummaryDisplay(null); 
        }
    } catch (error) {
        console.error("Error deleting projection:", error);
        showMessage(`Failed to delete plan: ${error.message}`, 'error');
    }
}


// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', () => {
    
    // --- Assign all DOM elements ---
    userInfoEl = document.getElementById('user-info');
    logoutBtn = document.getElementById('logout-button');
    profileButton = document.getElementById('profile-button');
    currencySelect = document.getElementById('currency-select');
    userInitialsEl = document.getElementById('user-initials'); 
    usernameDisplay = document.getElementById('username-display');
    monthSelector = document.getElementById('month-selector');
    projectedIncomeInput = document.getElementById('projected-income');
    expenseGoalsContainer = document.getElementById('expense-goals-container');
    plannedLeftoverEl = document.getElementById('planned-leftover');
    saveButton = document.getElementById('save-projection-button');
    projectionsList = document.getElementById('projections-list');
    summaryMonthNameEl = document.getElementById('summary-month-name');
    totalProjectedIncomeEl = document.getElementById('total-projected-income');
    totalProjectedExpenseEl = document.getElementById('total-projected-expense');
    projectedNetBalanceEl = document.getElementById('projected-net-balance');
    projectedAllocationEl = document.getElementById('projected-allocation');
    // viewProjectionButton removed
    toggleFormButton = document.getElementById('toggle-form-button');
    projectionFormContainer = document.getElementById('projection-form-container');
    
    // --- "Actual" Elements REMOVED ---
    
    initializeApp(); // Call the new API-based init function

    // 1. Plan Form Handler
    if (document.getElementById('projection-form')) {
        document.getElementById('projection-form').addEventListener('submit', saveProjection);
    }
    
    // 2. Projections List Delegation (Load/View/Delete)
    if (projectionsList) {
        projectionsList.addEventListener('click', (e) => {
            const target = e.target.closest('button');
            if (!target) return;

            const monthYear = target.getAttribute('data-month-year');
            
            if (target.classList.contains('delete-button')) {
                deleteProjection(monthYear);
            } else if (target.classList.contains('load-button') || target.classList.contains('view-button')) {
                const projectionToUse = allProjections.find(p => p.monthYear === monthYear);
                if (projectionToUse) {
                    if (target.classList.contains('load-button')) {
                        loadProjectionToForm(projectionToUse);
                    } else if (target.classList.contains('view-button')) {
                        updateSummaryDisplay(projectionToUse);
                        showMessage(`Viewing plan for ${projectionToUse.monthYear}.`, 'success');
                    }
                } else {
                    showMessage("Could not find projection data to load.", "error");
                }
            }
        });
    }

    // viewProjectionButton listener removed

    // 3. Navigation/Auth Handlers 
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    if (currencySelect) {
        currencySelect.addEventListener('change', (e) => {
            saveCurrencyPreference(e.target.value);
        });
    }

    // 4. Simplified profile button handling for this page
    if (profileButton) {
        profileButton.addEventListener('click', () => {
            showMessage("Profile settings are managed on the Dashboard page.", 'info');
        });
    }

    // 5. Form Toggle Handler
    if (toggleFormButton && projectionFormContainer) {
        toggleFormButton.addEventListener('click', () => {
            const isHidden = projectionFormContainer.classList.toggle('hidden');
            const icon = toggleFormButton.querySelector('i');
            if (icon) {
                icon.setAttribute('data-lucide', isHidden ? 'plus' : 'minus');
                if (window.lucide) {
                    window.lucide.createIcons();
                }
                toggleFormButton.setAttribute('title', isHidden ? 'Open Planner Form' : 'Close Planner Form');
            }
        });
    } else {
        console.error("Form toggle button or container not found!");
    }

    // --- RENDER ALL ICONS ---
    if (window.lucide) {
        window.lucide.createIcons();
    }
});