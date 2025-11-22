// This script provides core functionality (Auth, Currency) and dynamic charting
// and implements client-side CSV report generation.
console.log("Budget Reports Script Loaded (CSV Generation Enabled)"); 

// --- Global Variables and Configuration ---
const API_BASE_URL = window.location.origin;

// Currency API Key removed; proxy logic is used.

// User/Auth state
let authToken = null;
let isAuthReady = false;
let currentCurrency = 'USD';
let currentUserEmail = null; 

// Exchange rate state
let exchangeRates = { USD: 1.00 };
let baseCurrency = 'USD'; // Transactions are stored in this base currency (USD)

// Chart instance reference
let spendingChart = null;
let comparisonChart = null; // Reference for the new comparison chart

// --- Categories (Define colors here for the chart) ---
const CATEGORIES = [
    { id: 'rent', name: 'Rent/Mortgage', type: 'expense', color: '#FF6384' },
    { id: 'utilities', name: 'Utilities', type: 'expense', color: '#36A2EB' },
    { id: 'debt', name: 'Debt Payments', type: 'expense', color: '#FF9F40' },
    { id: 'groceries', name: 'Groceries', type: 'expense', color: '#4BC0C0' },
    { id: 'transportation', name: 'Transportation', type: 'expense', color: '#9966FF' },
    { id: 'entertainment', name: 'Entertainment', type: 'expense', color: '#FFCD56' },
    { id: 'other', name: 'Other Expenses', type: 'expense', color: '#C9CBCF' },
    { id: 'savings', name: 'Savings Goal', type: 'goal', color: '#00A99D' },
    { id: 'investing', name: 'Investment Allocation', type: 'goal', color: '#88D188' },
    { id: 'other-goal', name: 'Other Goal', type: 'goal', color: '#E91E63' }
];

// --- DOM Elements ---
const userInfoEl = document.getElementById('user-info');
const generateReportButton = document.getElementById('generate-report-button');
const reportStatusEl = document.getElementById('report-status');
const dateFromInput = document.getElementById('report-date-from');
const dateToInput = document.getElementById('report-date-to');
const reportTypeSelect = document.getElementById('report-type');
const chartMessageEl = document.getElementById('chart-message');
const chartAreaContainer = document.getElementById('chart-area-container');

// NEW Comparison Chart Elements
const comparisonChartCanvas = document.getElementById('comparison-chart');
const comparisonChartMessageEl = document.getElementById('comparison-chart-message');


// Navigation/Modal Elements
const authButtonsContainer = document.getElementById('auth-buttons-container');
const userMenuContainer = document.getElementById('user-menu-container'); 
const usernameDisplay = document.getElementById('username-display');
const logoutBtn = document.getElementById('logout-button');
const currencySelect = document.getElementById('currency-select');
const userInitialsEl = document.getElementById('user-initials'); 
const profileButton = document.getElementById('profile-button');

// Modal Elements
const profileModal = document.getElementById('profile-modal');
const closeModalBtn = document.getElementById('close-profile-modal');
const modalUsernameEl = document.getElementById('modal-username');
const modalEmailEl = document.getElementById('modal-email');
const passwordForm = document.getElementById('change-password-form');
const passwordMessageBox = document.getElementById('password-message-box');

// --- Utility Functions ---

function showMessage(text, type = 'success') {
    const messageBox = document.getElementById('message-box');
    const messageTextEl = document.getElementById('message-text');
    if (!messageBox || !messageTextEl) {
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
            currentCurrency = localStorage.getItem('tmt_currency') || 'USD';
            currencySelect.value = currentCurrency;
        }
    } else {
        if (userMenuContainer) userMenuContainer.classList.add('hidden');
        if (authButtonsContainer) authButtonsContainer.classList.remove('hidden'); 
    }
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
    return numericAmount * rate;
}

/**
 * Global function to format currency, used by CSV and other outputs.
 */
const formatCurrency = (amount, includeDecimals = true) => {
    const numericAmount = parseFloat(amount); 
    if (isNaN(numericAmount) || !isFinite(numericAmount)) { amount = 0; } else { amount = numericAmount; }
    const digits = includeDecimals ? 2 : 0;

    if (currentCurrency === 'THB') {
         try {
             const numberFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits, });
             const formattedNumber = numberFormatter.format(amount);
             return `฿${formattedNumber}`;
         } catch (formatError) {
             return `฿${amount.toFixed(digits)}`;
         }
    }

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
 * Handles the user logout process (copied from budget_tracker_script.js logic).
 */
async function handleLogout() {
    localStorage.removeItem('tmt_auth_token'); 
    localStorage.removeItem('tmt_username'); 
    localStorage.removeItem('tmt_currency');
    localStorage.removeItem('tmt_email'); 
    
    authToken = null;
    isAuthReady = false;
    currentCurrency = 'USD'; 

    showMessage("You have been successfully logged out. Redirecting...", 'success'); 
    updateNavAuthUI(); 

    setTimeout(() => {
        window.location.href = 'budget_tracker.html'; 
    }, 1500); 
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
    
    // We initiate the data chain here to fetch new rates and refresh the chart immediately.
    await initializeDataChain(); 

    // Asynchronously save preference to backend 
    try {
        const response = await fetch(`${API_BASE_URL}/api/user/settings`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json',
            },
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


// -------------------------------------------------------------------
// ASYNC DATA CHAINING
// -------------------------------------------------------------------

/**
 * Fetches the latest exchange rate by proxying the request through the secure backend.
 */
async function fetchExchangeRates() {
    console.log(`Fetching exchange rates for: ${currentCurrency} via proxy.`);
    
    if (currentCurrency === baseCurrency) {
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
        
        const data = await response.json();
        const rate = parseFloat(data.rate); // Expecting { rate: X.XXX } structure from your proxy

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
        }
    }
}


/**
 * Orchestrates the full initialization: Auth -> Rates -> Chart Draw.
 */
async function initializeDataChain() {
    // 1. Initial Auth Check (Set local state)
    authToken = localStorage.getItem('tmt_auth_token');
    const username = localStorage.getItem('tmt_username');
    currentCurrency = localStorage.getItem('tmt_currency') || 'USD';
    
    if (authToken && username) {
        isAuthReady = true;
        
        // 2. CRITICAL: Await exchange rates before loading chart data.
        await fetchExchangeRates(); 
        
        // 3. Update UI and load chart data if report type is 'category'
        updateNavAuthUI();
        if (reportTypeSelect.value === 'category') {
            loadChartData(); 
        } else {
            destroyChart(); 
            destroyComparisonChart(); // Destroy comparison chart too
             if (chartMessageEl) {
               chartMessageEl.textContent = `Visual analysis is shown for the 'Category Spending Breakdown' report type.`;
               chartMessageEl.classList.remove('hidden');
            }
        }
        
        if (userInfoEl) userInfoEl.textContent = `Authentication Status: Connected as ${username}`;
        if (generateReportButton) generateReportButton.disabled = false;
        
    } else {
        isAuthReady = false; 
        if (userInfoEl) userInfoEl.textContent = "Authentication Status: Not Logged In.";
        if (generateReportButton) generateReportButton.disabled = true;
        updateNavAuthUI();
        
        // Ensure chart shows login message if not authenticated
        if (chartMessageEl) {
             chartMessageEl.textContent = "Please log in to view analysis.";
             chartMessageEl.classList.remove('hidden');
        }
        destroyComparisonChart();
    }
}


// --- CHARTING FUNCTIONS ---

/**
 * Destroys any existing spending chart instance.
 */
function destroyChart() {
    if (spendingChart) {
        spendingChart.destroy();
        spendingChart = null;
    }
}

/**
 * Destroys any existing comparison chart instance.
 */
function destroyComparisonChart() {
    if (comparisonChart) {
        comparisonChart.destroy();
        comparisonChart = null;
    }
    if (comparisonChartMessageEl) {
         comparisonChartMessageEl.classList.add('hidden');
    }
}


/**
 * Draws a Pie Chart showing expense category breakdown for the filtered data.
 * @param {object} categoryTotals - Object where keys are category IDs and values are total amounts (in base currency).
 */
function drawSpendingChart(categoryTotals) {
    destroyChart(); // Clear old chart first

    const expenseCategories = CATEGORIES.filter(c => 
        c.type === 'expense' && categoryTotals.hasOwnProperty(c.id) && categoryTotals[c.id] > 0
    );
    
    if (expenseCategories.length === 0) {
        if (chartMessageEl) {
            chartMessageEl.textContent = "Not enough expense data in the selected range to generate a chart.";
            chartMessageEl.classList.remove('hidden');
        }
        return;
    }
    if (chartMessageEl) chartMessageEl.classList.add('hidden');
    
    const labels = expenseCategories.map(c => c.name);
    const dataValues = expenseCategories.map(c => convertToCurrentCurrency(categoryTotals[c.id]));
    const colors = expenseCategories.map(c => c.color);

    const ctx = document.getElementById('spending-chart');
    if (!ctx) return;
    
    // --- Currency Formatting for Tooltip (Consistent with Budget Tracker) ---
    const tooltipCurrencyFormatter = new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: currentCurrency, 
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
    // --- END Currency Formatting ---

    spendingChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: dataValues,
                backgroundColor: colors,
                borderColor: 'rgba(31, 31, 31, 1)', 
                borderWidth: 2,
                hoverOffset: 16 
            }]
        },
        options: {
            responsive: true,
            aspectRatio: 1, 
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: 'rgb(209, 213, 219)', 
                        font: { size: 14 }
                    }
                },
                title: {
                    display: true,
                    text: 'Expense Breakdown by Category',
                    color: 'white',
                    font: { size: 18, weight: 'bold' }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (context.parsed !== null) {
                                label += tooltipCurrencyFormatter.format(context.parsed);
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Draws a multi-metric bar chart comparing Planned vs Actual Income/Expenses/Net.
 * @param {object} monthlyData - Aggregated monthly data including actuals and projections.
 */
function drawComparisonChart(monthlyData) {
    destroyComparisonChart();

    const months = Object.keys(monthlyData).sort();
    if (months.length === 0) {
        if (comparisonChartMessageEl) comparisonChartMessageEl.classList.remove('hidden');
        return;
    }
    if (comparisonChartMessageEl) comparisonChartMessageEl.classList.add('hidden');

    const labels = months.map(m => {
        // Format YYYY-MM into Month Abbreviation
        const [year, month] = m.split('-');
        return new Date(year, month - 1).toLocaleString('en-US', { month: 'short', year: '2-digit' });
    });

    // Prepare data arrays (converting to display currency)
    const actualIncome = [];
    const actualExpenses = [];
    const projectedIncome = [];
    const projectedExpenses = [];
    const actualNet = []; // For Net Bar
    const plannedNet = []; // For Net Bar

    months.forEach(month => {
        const data = monthlyData[month];
        
        // Actuals (from Transactions)
        actualIncome.push(convertToCurrentCurrency(data.actualIncome));
        actualExpenses.push(convertToCurrentCurrency(data.actualExpense));
        actualNet.push(convertToCurrentCurrency(data.actualIncome - data.actualExpense));
        
        // Planned (from Projections)
        projectedIncome.push(convertToCurrentCurrency(data.projectedIncome));
        projectedExpenses.push(convertToCurrentCurrency(data.projectedExpense));
        plannedNet.push(convertToCurrentCurrency(data.projectedIncome - data.projectedExpense));
    });

    const ctx = document.getElementById('comparison-chart');
    if (!ctx) return;
    
    // --- Currency Formatting for Tooltip ---
    const tooltipCurrencyFormatter = new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: currentCurrency, 
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    comparisonChart = new Chart(ctx, {
        type: 'bar', // Base type is bar
        data: {
            labels: labels,
            datasets: [
                // 1. Actual Income (Bar)
                {
                    label: 'Actual Income',
                    data: actualIncome,
                    backgroundColor: '#00A99D', // Teal
                    borderColor: 'white',
                    borderWidth: 1,
                },
                // 2. Projected Income (Bar)
                {
                    label: 'Projected Income',
                    data: projectedIncome,
                    backgroundColor: 'rgba(0, 169, 157, 0.4)', // Light Teal
                    borderColor: '#00A99D',
                    borderWidth: 1,
                },
                // 3. Actual Expenses (Bar)
                {
                    label: 'Actual Expenses',
                    data: actualExpenses.map(v => -v), // Display as negative bars
                    backgroundColor: '#FF6384', // Red
                    borderColor: 'white',
                    borderWidth: 1,
                },
                 // 4. Projected Expenses (Bar)
                {
                    label: 'Projected Expenses',
                    data: projectedExpenses.map(v => -v), // Display as negative bars
                    backgroundColor: 'rgba(255, 99, 132, 0.4)', // Light Red
                    borderColor: '#FF6384',
                    borderWidth: 1,
                },
                
                // 5. Net Actual (BAR) - CONVERTED TO BAR TYPE
                {
                    type: 'bar', // CHANGED FROM 'line' to 'bar'
                    label: 'Actual Net',
                    data: actualNet,
                    backgroundColor: '#FFC700', // Gold/Yellow
                    borderColor: '#121212', 
                    borderWidth: 1,
                    // REMOVED 'yAxisID' and 'stack' to make it a separate bar group
                },
                // 6. Net Planned (BAR - Dashed effect via borders) - CONVERTED TO BAR TYPE
                {
                    type: 'bar', // CHANGED FROM 'line' to 'bar'
                    label: 'Planned Net',
                    data: plannedNet,
                    backgroundColor: 'rgba(255, 199, 0, 0.5)', // Duller Gold/Yellow
                    borderColor: 'rgba(255, 199, 0, 0.8)',
                    borderWidth: 2, // Added border for distinction
                    borderDash: [5, 5], // Added dashed effect to border
                    // REMOVED 'yAxisID' and 'stack' to make it a separate bar group
                },
            ]
        },
        options: {
            responsive: true,
            // ASPECT RATIO FIX: Setting maintainAspectRatio to false allows the chart to use the available height (min-h-[400px])
            maintainAspectRatio: false, // <--- FIX 1: Set to false (already done in previous step)
            // ASPECT RATIO FIX: Setting the desired initial aspect ratio for non-mobile views, but it's overruled by maintainAspectRatio: false on mobile.
            aspectRatio: 1, // <--- FIX 2: Restored original setting, but will rely on maintainAspectRatio: false and removal of internal chart title.
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                x: {
                    stacked: false, // FIX: Set to false to prevent stacking of Income/Expense Actual/Projected
                    title: { display: false, text: 'Month', color: 'gray' }, // Removed title to save space
                    ticks: { color: 'gray' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                y: {
                    stacked: false, // FIX: Set to false to prevent stacking of Income/Expense Actual/Projected
                    beginAtZero: false,
                    // Y-AXIS TITLE FIX: Reduced title size/content
                    title: { display: false, text: 'Amount', color: 'gray' },
                    ticks: {
                        color: 'gray',
                        // FIX: Format Y-axis labels as currency (shorthand for large numbers)
                        callback: function(value, index, values) {
                            const symbol = tooltipCurrencyFormatter.resolvedOptions().currency;
                            if (Math.abs(value) > 1000) {
                                return tooltipCurrencyFormatter.format(value / 1000).replace(symbol, '') + 'K';
                            }
                            return tooltipCurrencyFormatter.format(value).replace(/\s/g, ''); 
                        }
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: 'rgb(209, 213, 219)', font: { size: 10 } } // Smaller font size for legend on mobile
                },
                title: {
                    display: false, // <--- FIX 3: Set to false to remove internal title
                    text: 'Monthly Budget Performance (Planned vs. Actual)',
                    color: 'white',
                    font: { size: 14, weight: 'bold' }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (context.parsed.y !== null) {
                                label += ': ' + tooltipCurrencyFormatter.format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Fetches transactions and processes them for the chart.
 * This function now also calls the backend for projections and combines the data.
 */
async function loadChartData() {
// ... (rest of loadChartData is unchanged and omitted for brevity)
    if (!dateFromInput.value || !dateToInput.value) {
        if (chartMessageEl) chartMessageEl.textContent = "Please select a Start Date and End Date.";
        destroyChart();
        destroyComparisonChart();
        return;
    }

    if (!isAuthReady || !authToken) {
        if (chartMessageEl) chartMessageEl.textContent = "Please log in to view analysis.";
        destroyChart();
        destroyComparisonChart();
        return;
    }
    
    // Check if the current selection is 'category' before loading chart data
    if (reportTypeSelect.value !== 'category') {
        destroyChart();
        destroyComparisonChart();
        if (chartMessageEl) {
           chartMessageEl.textContent = `Visual analysis is shown for the 'Category Spending Breakdown' report type.`;
           chartMessageEl.classList.remove('hidden');
        }
        return;
    }
    
    // Ensure visualization is loading
    if (chartMessageEl) chartMessageEl.classList.add('hidden');
    if (chartAreaContainer) chartAreaContainer.classList.add('opacity-50');

    // Use a short delay for network resilience
    await new Promise(resolve => setTimeout(resolve, 50));
    
    const dateFrom = dateFromInput.value;
    const dateTo = dateToInput.value;
    
    try {
        const [transactionsResponse, projectionsResponse] = await Promise.all([
            fetch(`${API_BASE_URL}/api/transactions`, { method: 'GET', headers: { 'Authorization': `Bearer ${authToken}` } }),
            fetch(`${API_BASE_URL}/api/projections`, { method: 'GET', headers: { 'Authorization': `Bearer ${authToken}` } })
        ]);

        const transactionsResult = await transactionsResponse.json();
        const projectionsResult = await projectionsResponse.json();

        if (!transactionsResponse.ok) throw new Error(transactionsResult.message || "Failed to fetch transactions.");
        if (!projectionsResponse.ok) throw new Error(projectionsResult.message || "Failed to fetch projections.");

        const transactions = transactionsResult.data || [];
        const projections = projectionsResult.data || [];

        const categoryTotals = {};
        const monthlyComparisonData = {}; // Stores actuals and planned for the chart
        
        const startTimestamp = new Date(dateFrom + 'T00:00:00Z').getTime();
        const endTimestamp = new Date(dateTo + 'T23:59:59Z').getTime();

        // 1. Process Transactions (Actuals and Category Breakdown)
        transactions.forEach(t => {
            let date;
            try {
                 date = t.timestamp && typeof t.timestamp.toDate === 'function' ? t.timestamp.toDate() : new Date(t.timestamp);
            } catch (e) { return; }

            const timestamp = date.getTime();
            
            if (timestamp >= startTimestamp && timestamp <= endTimestamp) {
                
                // --- CATEGORIZATION FIX FOR HISTORICAL DATA ---
                let categoryId = t.categoryId || null;

                if (!categoryId && t.type === 'expense') {
                    const desc = t.description ? t.description.toLowerCase() : '';
                    if (desc.includes('rent') || desc.includes('mortgage')) { categoryId = 'rent'; }
                    else if (desc.includes('utilities')) { categoryId = 'utilities'; }
                }
                categoryId = categoryId || (t.type === 'expense' ? 'other' : null);
                // --- END CATEGORIZATION FIX ---

                // Expense breakdown (Pie Chart data)
                if (t.type === 'expense' && categoryId) {
                    const amount = parseFloat(t.amount);
                    if (!isNaN(amount) && amount > 0) {
                        categoryTotals[categoryId] = (categoryTotals[categoryId] || 0) + amount; 
                    }
                }

                // Monthly Comparison Data (Actuals)
                const yearMonth = `${date.getUTCFullYear()}-${(date.getUTCMonth() + 1).toString().padStart(2, '0')}`;
                if (!monthlyComparisonData[yearMonth]) {
                    // Initialize with zeros for the current month's transactions
                    monthlyComparisonData[yearMonth] = { actualIncome: 0, actualExpense: 0, projectedIncome: 0, projectedExpense: 0 };
                }
                const amount = parseFloat(t.amount) || 0;
                if (t.type === 'income') {
                    monthlyComparisonData[yearMonth].actualIncome += amount;
                } else if (t.type === 'expense') {
                    monthlyComparisonData[yearMonth].actualExpense += amount;
                }
            }
        });

        // 2. Integrate Projections (Planned)
        projections.forEach(p => {
            const yearMonth = p.monthYear;
            // Only include projections within the report date range
            const planTimestamp = new Date(yearMonth + '-01T00:00:00Z').getTime();
            if (planTimestamp >= startTimestamp && planTimestamp <= endTimestamp) {
                if (!monthlyComparisonData[yearMonth]) {
                    // This month only has a projection, initialize actuals to 0
                    monthlyComparisonData[yearMonth] = { actualIncome: 0, actualExpense: 0, projectedIncome: 0, projectedExpense: 0 };
                }

                const pIncome = parseFloat(p.projectedIncome) || 0;
                let pExpenses = 0;
                
                // Sum only expense types from projectedExpenses Map
                Object.entries(p.projectedExpenses || {}).forEach(([catId, amount]) => {
                    const category = CATEGORIES.find(c => catId && c.id === catId); // FIX: Ensure category check uses 'c.id === catId'
                    if (category && category.type === 'expense') { // Ensure category exists and is expense type
                        pExpenses += parseFloat(amount) || 0;
                    }
                });

                monthlyComparisonData[yearMonth].projectedIncome = pIncome;
                monthlyComparisonData[yearMonth].projectedExpense = pExpenses;
            }
        });

        // 3. Render Charts
        drawSpendingChart(categoryTotals);
        drawComparisonChart(monthlyComparisonData);

    } catch (error) {
        console.error("Error loading chart data:", error);
        destroyChart();
        destroyComparisonChart();
        if (chartMessageEl) {
            chartMessageEl.textContent = `Error loading data: ${error.message}`;
            chartMessageEl.classList.remove('hidden');
        }
    } finally {
        if (chartAreaContainer) chartAreaContainer.classList.remove('opacity-50');
    }
}


// --- NEW FUNCTION: Download Report ---

function downloadCSV(csvString, filename) {
// ... (downloadCSV is unchanged and omitted for brevity)
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    if (link.download !== undefined) { 
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click(); // Use click() instead of remove/revoke sequence for better support
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } else {
        showMessage("Your browser does not fully support automatic downloads. Please save the page source.", 'error');
    }
}

function generateRawTransactionsCSV(transactions, dateFrom, dateTo) {
// ... (generateRawTransactionsCSV is unchanged and omitted for brevity)
    if (!transactions || transactions.length === 0) {
        showMessage("No transactions found in the selected date range.", 'error');
        return;
    }

    const headers = [
        'Date', 
        'Description', 
        'Type', 
        'Category',
        `Amount (${baseCurrency})`, 
        `Amount (${currentCurrency})`
    ];
    let csvContent = headers.join(',') + '\n';

    transactions.forEach(t => {
        const category = CATEGORIES.find(c => t.categoryId && c.id === t.categoryId);
        const categoryName = category ? category.name : 'Other';

        const amountBase = parseFloat(t.amount) || 0;
        const amountCurrent = convertToCurrentCurrency(amountBase);

        const row = [
            `"${t.timestamp.substring(0, 10)}"`, 
            `"${t.description.replace(/"/g, '""')}"`, 
            t.type,
            categoryName,
            amountBase.toFixed(2),
            amountCurrent.toFixed(2)
        ];
        csvContent += row.join(',') + '\n';
    });

    const filename = `TMT_Transactions_${dateFrom}_to_${dateTo}.csv`;
    downloadCSV(csvContent, filename);
}


// --- CORE FUNCTIONALITY (Report Generation) ---

async function generateReport(e) {
// ... (generateReport is unchanged and omitted for brevity)
    e.preventDefault();
    
    if (!isAuthReady || !authToken) {
        showMessage('Please log in to generate reports.', 'error');
        return;
    }

    const dateFrom = dateFromInput.value;
    const dateTo = dateToInput.value;
    const reportType = reportTypeSelect.value;
    
    if (!dateFrom || !dateTo) {
        showMessage('Please select both a Start Date and End Date.', 'error');
        return;
    }

    reportStatusEl.textContent = `Generating ${reportType} report for ${dateFrom} to ${dateTo}...`;
    reportStatusEl.classList.remove('hidden', 'text-gray-400', 'text-red-500', 'text-tmt-primary');
    reportStatusEl.classList.add('text-tmt-secondary');
    generateReportButton.disabled = true;

    try {
        if (reportType === 'transactions') {
            const response = await fetch(`${API_BASE_URL}/api/transactions`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${authToken}` },
            });
            const result = await response.json();
            
            if (!response.ok || !result.data) {
                 throw new Error(result.message || "Failed to fetch transactions from server.");
            }
            
            const startTimestamp = new Date(dateFrom + 'T00:00:00Z').getTime();
            const endTimestamp = new Date(dateTo + 'T23:59:59Z').getTime();
            
            const filteredTransactions = result.data.filter(t => {
                let date;
                try {
                     date = t.timestamp && typeof t.timestamp.toDate === 'function' ? t.timestamp.toDate() : new Date(t.timestamp);
                } catch (e) {
                     return false;
                }
                const timestamp = date.getTime();
                return timestamp >= startTimestamp && timestamp <= endTimestamp;
            });
            
            if (filteredTransactions.length === 0) {
                 showMessage("No transactions found in the selected date range.", 'error');
                 reportStatusEl.textContent = `No data found for ${dateFrom} to ${dateTo}.`;
            } else {
                 generateRawTransactionsCSV(filteredTransactions, dateFrom, dateTo);
                 showMessage("Raw transactions CSV download initiated.", 'success');
                 reportStatusEl.textContent = `[SUCCESS] Raw Transactions CSV generated.`;
            }

        } else if (reportType === 'category') {
             await loadChartData();
             showMessage("Category analysis updated.", 'success');
             reportStatusEl.textContent = `[SUCCESS] Visual Analysis Updated.`;
             
        } else {
            const placeholderPDFLink = "https://placehold.co/600x400/36A2EB/FFFFFF?text=Monthly+Summary+Report+PDF";

            setTimeout(() => {
                 showMessage("Monthly Summary Report generated. Opening placeholder.", 'success');
                 window.open(placeholderPDFLink, '_blank'); 
                 reportStatusEl.textContent = `[SUCCESS] Monthly Summary Report Placeholder Generated.`;
            }, 1500); 
        }

        reportStatusEl.classList.remove('text-tmt-secondary');
        reportStatusEl.classList.add('text-tmt-primary');

    } catch (error) {
        console.error("Report Generation Error:", error);
        showMessage(`Report generation failed: ${error.message}`, 'error');
        reportStatusEl.textContent = `[ERROR] Failed to generate report.`;
        reportStatusEl.classList.remove('text-tmt-secondary', 'text-tmt-primary');
        reportStatusEl.classList.add('text-red-500');
    } finally {
        generateReportButton.disabled = false;
    }
}

// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', () => {
// ... (rest of Event Listeners is unchanged and omitted for brevity)
    
    if (generateReportButton) {
        generateReportButton.addEventListener('click', generateReport);
        if (reportStatusEl) {
             if (reportTypeSelect.value !== 'category' && reportTypeSelect.value !== 'transactions') {
                  reportStatusEl.textContent = "Report generation is complex and is currently a placeholder.";
                  reportStatusEl.classList.remove('hidden');
             }
        }
    }
    
    [dateFromInput, dateToInput, reportTypeSelect].forEach(input => {
        if (input) {
            if (input.id === 'report-type') {
                input.addEventListener('change', () => {
                    if (input.value === 'category') {
                        loadChartData();
                    } else {
                        destroyChart();
                        destroyComparisonChart(); // Destroy comparison chart too
                        if (chartMessageEl) {
                           chartMessageEl.textContent = `Visual analysis is shown for the 'Category Spending Breakdown' report type.`;
                           chartMessageEl.classList.remove('hidden');
                        }
                    }
                });
            } else {
                input.addEventListener('change', loadChartData);
            }
        }
    });
    
    // Initialize Auth and Data Chain
    initializeDataChain();
    
    // Use the robust logout handler
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    
    // Use the robust currency change handler
    if (currencySelect) {
         currencySelect.addEventListener('change', (e) => saveCurrencyPreference(e.target.value));
    }
    
    // Profile Modal handlers (simplified)
    if (profileButton) profileButton.addEventListener('click', () => {
        showMessage("Profile settings view triggered.", 'info');
        if (profileModal) profileModal.classList.remove('hidden');
    });
    if (closeModalBtn) closeModalBtn.addEventListener('click', () => { 
         if (profileModal) profileModal.classList.add('hidden');
    });

});