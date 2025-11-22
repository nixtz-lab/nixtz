/**
 * portfolio_tracker.js
 * FINAL MODULARIZED VERSION: All requested fixes and new features implemented.
 *
 * MODIFIED (LATEST):
 * - Added manual JS validation in saveHolding() to support the 'novalidate'
 * HTML attribute. This fixes the iPad date format bug.
 * - Edit Holding: Users can now edit holdings.
 * - Manual Dividend: Users can add an "Annual Div/Share" amount.
 *
 * MODIFIED (GEMINI):
 * - Changed 'Income by Broker' (drawBrokerAllocationIncomeChart) to a doughnut chart.
 * - Added 'Income by Asset' (drawIncomeByAssetChart) as a new bar chart.
 * - Added 'incomeByAsset' calculations to processPortfolioData.
 * - Updated chart global instances and destroy/draw calls.
 * - Added 'Overall Income Yield' calculation and summary card.
 */

// --- Configuration and Constants ---
const HOLDINGS_API = `${API_BASE_URL}/api/portfolio/holdings`; // User's private holdings API
const PRICE_API = `${API_BASE_URL}/api/v1/prices`;             // Live price proxy API
const SEARCH_API = `${API_BASE_URL}/api/search-tickers`;      
const CACHE_KEY = 'tmt_portfolio_cache'; // Key for localStorage

// --- Global State and Instances ---
let portfolioTableInstance = null;
let assetAllocationChartInstance = null;
let brokerAllocationIncomeChartInstance = null; 
let brokerAllocationValueChartInstance = null; 
let stockAllocationChartInstance = null; 
let myPositionsValueChartInstance = null; 
let incomeByAssetChartInstance = null; // <-- NEW CHART INSTANCE

// =========================================================================
// ## CORE UTILITIES
// =========================================================================

// --- START: AUTH UTILITIES ---
function getAuthToken() {
    return localStorage.getItem('tmt_auth_token');
}
// --- END: AUTH UTILITIES ---

// --- START: FORMATTING UTILITIES ---
function formatCurrency(amount, colorize = false) {
    if (isNaN(parseFloat(amount))) return 'N/A';
    
    const formatted = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);

    if (!colorize) return formatted;
    
    const colorClass = amount >= 0 ? 'text-tmt-green' : 'text-tmt-red';
    return `<span class="${colorClass} font-bold">${formatted}</span>`;
}

function formatPercent(value, colorize = false) {
    if (isNaN(parseFloat(value))) return 'N/A';
    
    const percent = parseFloat(value) * 100;
    const formatted = percent.toFixed(2) + '%';
    
    if (!colorize) return formatted;
    
    const colorClass = percent >= 0 ? 'text-tmt-green' : 'text-tmt-red';
    return `<span class="${colorClass} font-bold">${formatted}</span>`;
}
// --- END: FORMATTING UTILITIES ---

// --- START: CHART UTILITIES ---
function destroyCharts() {
    if (assetAllocationChartInstance) assetAllocationChartInstance.destroy();
    if (brokerAllocationIncomeChartInstance) brokerAllocationIncomeChartInstance.destroy(); 
    if (brokerAllocationValueChartInstance) brokerAllocationValueChartInstance.destroy(); 
    if (stockAllocationChartInstance) stockAllocationChartInstance.destroy(); 
    if (myPositionsValueChartInstance) myPositionsValueChartInstance.destroy(); 
    if (incomeByAssetChartInstance) incomeByAssetChartInstance.destroy(); // <-- DESTROY NEW CHART
}
// --- END: CHART UTILITIES ---

// --- START: FORM UTILITIES ---
function toggleManualBrokerInput(selectedValue) {
    const manualInput = document.getElementById('broker-manual-input');
    if (selectedValue === 'Other') {
        manualInput.classList.remove('hidden');
        manualInput.required = true;
    } else {
        manualInput.classList.add('hidden');
        manualInput.required = false;
        manualInput.value = '';
    }
}
window.toggleManualBrokerInput = toggleManualBrokerInput; 
// --- END: FORM UTILITIES ---

// --- START: CACHE UTILITIES (NEW) ---
function saveDataToCache(liveData) {
    try {
        const cacheEntry = {
            timestamp: new Date().getTime(),
            data: liveData
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheEntry));
    } catch (e) {
        console.warn("Failed to save portfolio data to cache:", e);
    }
}

function getCachedData(holdings) {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) return null;

        const { data } = JSON.parse(cached);
        
        // Re-build the data map to ensure all current holdings are present
        const liveDataMap = { 'CASH': { price: 1.0, dividend_yield: 0.0 } };
        const allTickers = [...new Set(holdings.map(h => h.ticker))];
        
        allTickers.forEach(ticker => {
            if (data[ticker]) {
                liveDataMap[ticker] = data[ticker];
            } else if (ticker !== 'CASH') {
                // This holding is new since the last cache, default it
                liveDataMap[ticker] = { price: 0, dividend_yield: 0.0 };
            }
        });
        
        return liveDataMap;

    } catch (e) {
        console.warn("Failed to read portfolio cache:", e);
        return null;
    }
}
// --- END: CACHE UTILITIES ---


// =========================================================================
// ## TICKET SEARCH UTILITIES (Local to Add Holding Form)
// =========================================================================

// --- START: SELECT PORTFOLIO SUGGESTION ---
function selectPortfolioSuggestion(ticker, description = null) {
    const formInput = document.getElementById('ticker-input');
    
    if (formInput) {
        formInput.value = ticker;
    }

    document.querySelectorAll('.add-holding-suggestions').forEach(s => s.classList.add('hidden')); 

    const finalDescription = description || ticker.toUpperCase();
    showMessage(`Ticker selected: ${finalDescription}`, false); 
}
window.selectPortfolioSuggestion = selectPortfolioSuggestion; 
// --- END: SELECT PORTFOLIO SUGGESTION ---

// --- START: FETCH TICKER SUGGESTIONS ---
async function fetchTickerSuggestions(query) {
    if (query.length < 2) return [];

    try {
        const response = await fetch(`${SEARCH_API}?q=${query}`);
        if (!response.ok) {
            console.error("Ticker search API failed with bad status.");
            return [];
        }
        const result = await response.json();
        
        if (result.success && Array.isArray(result.data)) {
            return result.data.map(item => ({ 
                ticker: item.ticker, 
                description: `${item.ticker} - ${item.name}` 
            }));
        }
        return [];
    } catch (error) {
        console.error("Network error fetching ticker suggestions:", error);
        return [];
    }
}
// --- END: FETCH TICKER SUGGESTIONS ---

// =========================================================================
// ## API/DATA FETCHING
// =========================================================================

// --- START: FETCH USER HOLDINGS ---
async function fetchUserHoldings() {
    const token = getAuthToken();
    if (!token) {
        showMessage("Please log in to view your portfolio.", true);
        $('#loading-message').html('<p class="text-red-500">Authentication Required. Log in to view and add holdings.</p>');
        return [];
    }
    try {
        const response = await fetch(HOLDINGS_API, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Failed to retrieve holdings.');
        }
        
        // result.data is an array of holding objects from the DB
        return result.data || [];
    } catch (error) {
        console.error("Error fetching user holdings:", error);
        showMessage("Error loading portfolio data from database. Please log in again.", true);
        $('#loading-message').html('<p class="text-red-500">Error loading data. Try logging in again.</p>');
        return [];
    }
}
// --- END: FETCH USER HOLDINGS ---

// --- START: FETCH LIVE DATA (SLOW/CHUNKED CALL) ---
async function fetchLiveData(holdings) {
    const tickers = [...new Set(holdings.map(h => h.ticker).filter(t => t !== 'CASH'))];
    const tickerString = tickers.join(',');

    const liveData = { 'CASH': { price: 1.0, dividend_yield: 0.0000 } };

    if (tickerString.length === 0) return liveData;

    try {
        const response = await fetch(`${PRICE_API}?tickers=${tickerString}`);
        
        if (!response.ok) {
            console.warn(`Live price proxy failed (Status: ${response.status}). Using cached data if available.`);
            return getCachedData(holdings) || liveData; // Return cache on failure
        }
        const apiData = await response.json();
        
        Object.assign(liveData, apiData);
        return liveData;
    } catch (error) {
        console.error("Network error during live data fetch:", error);
        return getCachedData(holdings) || liveData; // Return cache on failure
    }
}
// --- END: FETCH LIVE DATA ---

// =========================================================================
// ## DATA PROCESSING AND UI RENDERING
// =========================================================================

// --- START: PROCESS PORTFOLIO DATA ---
function processPortfolioData(holdings, liveData) {
    let totalPortfolioValue = 0;
    let totalAnnualIncome = 0;
    let totalCostBasis = 0;
    const processedData = [];

    const assetAllocation = {};
    const brokerIncome = {};
    const brokerValue = {}; 
    const stockAllocation = {}; 
    const positionsValue = {}; 
    const incomeByAsset = {}; // <-- NEW DATA OBJECT
    
    holdings.forEach(h => {
        const costBasis = h.shares * h.buy_price; 
        const data = liveData[h.ticker] || { price: 0, dividend_yield: 0 };
        let currentPrice = 0;
        let priceIsLive = false; 

        if (h.ticker === 'CASH') {
            currentPrice = h.buy_price; // Which is 1
            priceIsLive = true;
        } else {
            currentPrice = data.price || 0;
            priceIsLive = currentPrice > 0;
        }
        
        // ****** MODIFICATION: MANUAL DIVIDEND LOGIC ******
        // Get manual dividend per share (e.g., 1.25) from the holding object
        const manualAnnualDividend = h.annual_dividend || 0;
        // Get live yield (e.g., 0.04) from the API data
        const apiYield = data.dividend_yield || 0;
        
        let currentYield = 0;
        
        if (manualAnnualDividend > 0 && currentPrice > 0) {
            // 1. Use manual dividend if provided. 
            // Yield = (Manual Annual Div Amount / Current Price)
            currentYield = manualAnnualDividend / currentPrice;
        } else {
            // 2. Otherwise, use the live API yield
            currentYield = apiYield;
        }
        // ****** END MODIFICATION ******

        const currentValue = h.shares * currentPrice;
        const gainLossAmount = currentValue - costBasis;
        const gainLossPercent = costBasis > 0 ? gainLossAmount / costBasis : 0;
        
        // Annual Income is now calculated based on our new currentYield
        const annualIncome = currentValue * currentYield; 
        
        totalPortfolioValue += currentValue;
        totalAnnualIncome += annualIncome;
        totalCostBasis += costBasis;

        const assetClass = h.asset_class || 'Equity';
        const broker = h.broker || 'N/A';
        
        assetAllocation[assetClass] = (assetAllocation[assetClass] || 0) + currentValue;
        brokerIncome[broker] = (brokerIncome[broker] || 0) + annualIncome;
        brokerValue[broker] = (brokerValue[broker] || 0) + currentValue; 
        stockAllocation[h.ticker] = (stockAllocation[h.ticker] || 0) + currentValue;
        positionsValue[h.ticker] = (positionsValue[h.ticker] || 0) + currentValue; 
        incomeByAsset[assetClass] = (incomeByAsset[assetClass] || 0) + annualIncome; // <-- AGGREGATE NEW DATA

        processedData.push({
            _id: h._id,
            ticker: h.ticker,
            broker: h.broker,
            asset_class: h.asset_class,
            shares: h.shares.toFixed(4),
            buy_price: formatCurrency(h.buy_price),
            buy_date: h.buy_date, // Pass this for the edit form
            annual_dividend: h.annual_dividend || 0, // Pass this for the edit form
            
            current_price: priceIsLive ? formatCurrency(currentPrice) : '<span class="text-tmt-red font-semibold">N/A</span>',
            
            current_value: currentValue, 
            
            gain_loss_percent_raw: priceIsLive ? gainLossPercent : null,
            
            div_yield: priceIsLive ? formatPercent(currentYield) : '<span class="text-gray-400">N/A</span>',
            annual_income_raw: annualIncome 
        });
    });

    const lifetimePLPercent = totalCostBasis > 0 ? (totalPortfolioValue - totalCostBasis) / totalCostBasis : 0;
    const totalMonthlyIncome = totalAnnualIncome / 12;
    
    // ****** NEW CALCULATION ******
    const overallIncomeYield = totalPortfolioValue > 0 ? totalAnnualIncome / totalPortfolioValue : 0;
    // ****** END NEW CALCULATION ******

    return {
        processedData,
        summary: {
            totalPortfolioValue: formatCurrency(totalPortfolioValue),
            totalAnnualIncome: formatCurrency(totalAnnualIncome),
            totalMonthlyIncome: formatCurrency(totalMonthlyIncome), 
            lifetimePLPercent: formatPercent(lifetimePLPercent, true),
            totalHoldings: holdings.length,
            lifetimePLRaw: lifetimePLPercent,
            
            // ****** NEW SUMMARY PROPERTIES ******
            overallIncomeYield: formatPercent(overallIncomeYield, false), // Pass false, we'll color it ourselves
            overallIncomeYieldRaw: overallIncomeYield 
            // ****** END NEW SUMMARY PROPERTIES ******
        },
        allocationData: { assetAllocation, brokerIncome, brokerValue, stockAllocation, positionsValue, incomeByAsset } // <-- RETURN NEW DATA
    };
}
// --- END: PROCESS PORTFOLIO DATA ---

// --- START: INITIALIZE DATATABLES ---
function initializeDataTables(data) {
    if (portfolioTableInstance) {
        portfolioTableInstance.destroy();
        portfolioTableInstance = null;
    }

    const totalValue = data.reduce((sum, d) => sum + d.current_value, 0);
    const totalIncome = data.reduce((sum, d) => sum + d.annual_income_raw, 0);

    portfolioTableInstance = $('#portfolio-table').DataTable({
        data: data,
        columns: [
            { data: 'ticker' },
            { data: 'broker' },
            { data: 'asset_class' },
            { data: 'shares' },
            { data: 'buy_price' },
            { data: 'current_price' }, 
            { 
                data: 'current_value', 
                render: function (data) { return formatCurrency(data); }
            },
            {
                data: 'gain_loss_percent_raw',
                render: function (data) { return formatPercent(data, true); }
            },
            { data: 'div_yield' },
            {
                data: 'annual_income_raw',
                render: function (data) { return formatCurrency(data); }
            },
            { 
                // ****** MODIFICATION: ACTIONS COLUMN ******
                data: '_id', // Use _id as the base data
                orderable: false, 
                render: function(data, type, row) { // 'row' is the full object
                    if (data && data.length > 5) { 
                        // Pass the full 'row' object as a JSON string
                        // Replace single quotes with &apos; to prevent breaking the HTML
                        const rowJson = JSON.stringify(row).replace(/'/g, "&apos;");

                        return `
                            <button onclick='startEditHolding(${rowJson})' class="text-tmt-primary hover:text-tmt-secondary transition duration-150 mr-2" title="Edit Holding">
                                <i data-lucide="edit-2" class="w-4 h-4 inline"></i>
                            </button>
                            <button onclick="deleteHolding('${data}')" class="text-tmt-red hover:text-red-700 transition duration-150" title="Delete Holding">
                                <i data-lucide="trash-2" class="w-4 h-4 inline"></i>
                            </button>
                        `;
                    }
                    return ''; 
                }
                // ****** END MODIFICATION ******
            }
        ],
        paging: true,
        searching: true,
        responsive: true,
        order: [[6, 'desc']], // Column 6 is Current Value
        info: true,
        className: 'w-full text-white', 
        language: { paginate: { previous: '←', next: '→' } },
        drawCallback: function() {
            try { lucide.createIcons(); } catch (e) {} 
        }
    });

    $('#table-footer-value').html(formatCurrency(totalValue));
    $('#table-footer-income').html(formatCurrency(totalIncome));

    $('#loading-message').addClass('hidden');
    $('#portfolio-table').removeClass('hidden');
}
// --- END: INITIALIZE DATATABLES ---

// --- START: DRAW CHART FUNCTIONS ---

// Helper function to render all charts
function drawAllCharts(allocationData, totalPortfolioValueRaw) {
    drawAssetAllocationChart(allocationData);
    drawStockAllocationChart(allocationData, totalPortfolioValueRaw);
    drawBrokerAllocationIncomeChart(allocationData); // <-- MODIFIED TO DOUGHNUT
    drawBrokerAllocationChartByValue(allocationData);
    drawMyPositionsValueChart(allocationData);
    drawIncomeByAssetChart(allocationData); // <-- NEW CHART
}


function drawAssetAllocationChart(allocationData) {
    const data = allocationData.assetAllocation;
    const labels = Object.keys(data);
    const values = Object.values(data);
    
    if (values.every(v => v === 0)) return;

    const chartColors = labels.map(label => {
        if (label.includes('Tech') || label.includes('Equity')) return '#36A2EB'; 
        if (label.includes('Value')) return '#FF6384'; 
        if (label.includes('Income')) return '#00A99D'; 
        if (label.includes('Crypto')) return '#FFC700'; 
        if (label.includes('Cash')) return '#C9CBCF'; 
        return '#9966FF'; 
    });

    assetAllocationChartInstance = new Chart(document.getElementById('asset-allocation-chart'), {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: chartColors,
                borderColor: '#121212',
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'right', labels: { color: 'white' } },
                title: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            return `${label}: ${formatCurrency(value)}`;
                        }
                    }
                }
            }
        }
    });
}

function drawStockAllocationChart(allocationData, totalPortfolioValue) {
    const data = allocationData.stockAllocation;
    const labels = Object.keys(data);
    const values = Object.values(data);

    if (values.every(v => v === 0)) return;

    const chartColors = [
        '#00A99D', '#FFC700', '#36A2EB', '#EF4444', '#F97316', 
        '#22C55E', '#14B8A6', '#FBBF24', '#60A5FA', '#10B981'
    ]; 

    stockAllocationChartInstance = new Chart(document.getElementById('stock-allocation-chart'), {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: chartColors.slice(0, labels.length),
                borderColor: '#121212',
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'right', labels: { color: 'white' } },
                title: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const percentage = totalPortfolioValue > 0 ? (value / totalPortfolioValue * 100).toFixed(1) + '%' : '0.0%';
                            return `${label}: ${formatCurrency(value)} (${percentage})`;
                        }
                    }
                }
            }
        }
    });
}


// --- ****** MODIFIED FUNCTION: Changed to Doughnut Chart ****** ---
function drawBrokerAllocationIncomeChart(allocationData) {
    const data = allocationData.brokerIncome;
    const labels = Object.keys(data);
    const values = Object.values(data);

    if (values.every(v => v === 0)) return;

    const chartColors = labels.map((_, index) => {
        const colors = ['#00A99D', '#FFC700', '#36A2EB', '#FF6384', '#C9CBCF'];
        return colors[index % colors.length]; 
    });

    brokerAllocationIncomeChartInstance = new Chart(document.getElementById('broker-allocation-income-chart'), {
        type: 'doughnut', // <-- CHANGED
        data: {
            labels: labels,
            datasets: [{
                label: 'Annual Income',
                data: values,
                backgroundColor: chartColors, // <-- CHANGED
                borderColor: '#121212', // <-- CHANGED
                borderWidth: 2, // <-- CHANGED
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'right', labels: { color: 'white' } }, // <-- CHANGED
                title: { display: false }, // <-- NEW
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? (value / total * 100).toFixed(1) + '%' : '';
                            return `${label}: ${formatCurrency(value)} (${percentage})`;
                        }
                    }
                }
            }
            // --- REMOVED SCALES ---
        }
    });
}
// --- ****** END MODIFICATION ****** ---


function drawBrokerAllocationChartByValue(allocationData) {
    const data = allocationData.brokerValue;
    const labels = Object.keys(data);
    const values = Object.values(data);

    if (values.every(v => v === 0)) return;

    const chartColors = labels.map((_, index) => {
        const colors = ['#00A99D', '#FFC700', '#36A2EB', '#FF6384', '#C9CBCF'];
        return colors[index % colors.length]; 
    });

    brokerAllocationValueChartInstance = new Chart(document.getElementById('broker-allocation-value-chart'), {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: chartColors,
                borderColor: '#121212',
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'right', labels: { color: 'white' } },
                title: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? (value / total * 100).toFixed(1) + '%' : '';
                            return `${label}: ${formatCurrency(value)} (${percentage})`;
                        }
                    }
                }
            }
        }
    });
}

function drawMyPositionsValueChart(allocationData) {
    const data = allocationData.positionsValue; 
    
    // Filter out CASH position
    const sortedData = Object.entries(data)
        .filter(([ticker, value]) => value > 0 && ticker !== 'CASH')
        .sort((a, b) => b[1] - a[1]); 

    const labels = sortedData.map(([ticker]) => ticker);
    const values = sortedData.map(([, value]) => value);
    
    if (values.every(v => v === 0)) return;

    const chartColors = labels.map(() => '#10B981'); 

    if (myPositionsValueChartInstance) {
        myPositionsValueChartInstance.destroy(); 
    }
    
    myPositionsValueChartInstance = new Chart(document.getElementById('my-positions-value-chart'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Position Value',
                data: values,
                backgroundColor: chartColors,
                borderColor: '#00A99D', 
                borderWidth: 1,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'x', 
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed.y || 0;
                            return `Value: ${formatCurrency(value)}`;
                        }
                    }
                }
            },
            scales: {
                x: { 
                    ticks: { color: 'white', autoSkip: false }, 
                    grid: { color: 'rgba(255,255,255,0.1)' } 
                },
                y: { 
                    beginAtZero: true, 
                    ticks: { 
                        color: 'white',
                        callback: function(value) { 
                            return formatCurrency(value).replace(/\$/g, '$');
                        }
                    },
                    grid: { color: 'rgba(255,255,255,0.1)' }
                }
            }
        }
    });
}

// --- ****** NEW FUNCTION: Income by Asset Chart ****** ---
function drawIncomeByAssetChart(allocationData) {
    const data = allocationData.incomeByAsset; 
    
    // Sort by income value, descending
    const sortedData = Object.entries(data)
        .filter(([, value]) => value > 0)
        .sort((a, b) => b[1] - a[1]); 

    const labels = sortedData.map(([assetClass]) => assetClass);
    const values = sortedData.map(([, value]) => value);
    
    if (values.every(v => v === 0)) return;

    // Use tmt-secondary color as requested
    const chartColors = labels.map(() => '#FFC700'); 

    if (incomeByAssetChartInstance) {
        incomeByAssetChartInstance.destroy(); 
    }
    
    incomeByAssetChartInstance = new Chart(document.getElementById('income-by-asset-chart'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Annual Income by Asset',
                data: values,
                backgroundColor: chartColors,
                borderColor: '#E5B800', 
                borderWidth: 1,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'x', 
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.parsed.y || 0;
                            return `Annual Income: ${formatCurrency(value)}`;
                        }
                    }
                }
            },
            scales: {
                x: { 
                    ticks: { color: 'white', autoSkip: false }, 
                    grid: { color: 'rgba(255,255,255,0.1)' } 
                },
                y: { 
                    beginAtZero: true, 
                    ticks: { 
                        color: 'white',
                        callback: function(value) { 
                            return formatCurrency(value).replace(/\$/g, '$');
                        }
                    },
                    grid: { color: 'rgba(255,255,255,0.1)' }
                }
            }
        }
    });
}
// --- ****** END NEW FUNCTION ****** ---


// --- START: RENDER HELPER FUNCTIONS ---
function updateSummaryCards(summary) {
    document.getElementById('summary-total-value').innerHTML = summary.totalPortfolioValue;
    document.getElementById('summary-annual-income').innerHTML = summary.totalAnnualIncome;
    document.getElementById('summary-monthly-income').innerHTML = summary.totalMonthlyIncome;
    document.getElementById('summary-total-holdings').textContent = summary.totalHoldings;
    
    const plElement = document.getElementById('summary-gain-loss-percent');
    plElement.innerHTML = summary.lifetimePLPercent;
    plElement.classList.remove('text-white', 'text-tmt-green', 'text-tmt-red');
    plElement.classList.add(summary.lifetimePLRaw >= 0 ? 'text-tmt-green' : 'text-tmt-red');
    
    // ****** NEW LINES TO UPDATE THE YIELD CARD ******
    const yieldElement = document.getElementById('summary-overall-yield');
    yieldElement.innerHTML = summary.overallIncomeYield;
    yieldElement.classList.remove('text-white');
    // Set color to match other income cards
    yieldElement.classList.add('text-tmt-primary'); 
    // ****** END NEW LINES ******
}
// --- END: RENDER HELPER FUNCTIONS ---

// =========================================================================
// ## CRUD OPERATIONS (FRONTEND)
// =========================================================================

// --- ****** NEW FUNCTION: START EDIT HOLDING ****** ---
/**
 * Populates the form with existing holding data to start an edit.
 * @param {object} holding - The full holding object from the table row.
 */
function startEditHolding(holding) {
    // 1. Populate the form
    document.getElementById('holding-id').value = holding._id;
    document.getElementById('broker-select').value = holding.broker;
    document.getElementById('ticker-input').value = holding.ticker;
    document.getElementById('asset-class').value = holding.asset_class;
    document.getElementById('shares-input').value = holding.shares;
    document.getElementById('buy-price').value = holding.buy_price.replace(/[^0-9.]+/g,""); // Clean currency formatting
    
    // Format date from ISO string (e.g., "2023-10-20T00:00:00.000Z") to "yyyy-MM-dd"
    const buyDate = new Date(holding.buy_date);
    document.getElementById('buy-date').value = buyDate.toISOString().split('T')[0];
    
    document.getElementById('annual-dividend-input').value = holding.annual_dividend || '';

    // 2. Handle "Other" broker
    const brokerSelect = document.getElementById('broker-select');
    // If the broker isn't one of the standard options, select "Other" and show the manual input
    if ([...brokerSelect.options].every(opt => opt.value !== holding.broker)) {
        brokerSelect.value = 'Other';
        toggleManualBrokerInput('Other');
        document.getElementById('broker-manual-input').value = holding.broker;
    } else {
        toggleManualBrokerInput(holding.broker);
    }

    // 3. Update UI to "Edit Mode"
    document.getElementById('save-holding-button').textContent = 'Update Holding';
    document.getElementById('cancel-edit-button').classList.remove('hidden');
    
    // 4. Show the form and scroll to it
    const formContainer = $('#input-form-container');
    if (!formContainer.is(':visible')) {
        formContainer.slideDown(300);
        const icon = $('#toggle-input-form i');
        icon.attr('data-lucide', 'minus');
        try { lucide.createIcons(); } catch (e) {} 
    }
    $('html, body').animate({
        scrollTop: formContainer.offset().top - 100 // Scroll to form, -100px offset for header
    }, 500);
}
window.startEditHolding = startEditHolding; // Make accessible from HTML

/**
 * Resets the form from "Edit Mode" back to "Add Mode".
 */
function cancelEdit() {
    const form = document.getElementById('add-holding-form');
    form.reset(); // Clear all inputs
    
    document.getElementById('holding-id').value = ''; // Clear hidden ID
    document.getElementById('save-holding-button').textContent = 'Save Holding';
    document.getElementById('cancel-edit-button').classList.add('hidden');
    toggleManualBrokerInput(''); // Hide manual broker input
    
    // Optionally close the form
    $('#input-form-container').slideUp(300, function() {
        const icon = $('#toggle-input-form i');
        icon.attr('data-lucide', 'plus');
        try { lucide.createIcons(); } catch (e) {} 
    });
}
window.cancelEdit = cancelEdit; // Make accessible from HTML
// --- ****** END NEW FUNCTIONS ****** ---


// --- ****** MODIFIED: Renamed addHolding to saveHolding ****** ---
/**
 * Handles both CREATE (POST) and UPDATE (PUT) for a holding.
 */
async function saveHolding(e) {
    e.preventDefault();
    const token = getAuthToken();
    const saveButton = document.getElementById('save-holding-button');
    const form = document.getElementById('add-holding-form');
    
    if (!token) return showMessage("Authentication required. Please log in first.", true);

    saveButton.disabled = true;

    // --- Get Broker (same as before) ---
    const selectedBroker = document.getElementById('broker-select').value;
    let finalBroker = selectedBroker;
    if (selectedBroker === 'Other') {
        finalBroker = document.getElementById('broker-manual-input').value;
        if (!finalBroker) {
            saveButton.disabled = false;
            return showMessage("Broker name is required for 'Other'.", true);
        }
    }
    if (!finalBroker || finalBroker === 'Select or choose Other...') {
        saveButton.disabled = false;
        return showMessage("Please select or enter a Broker Name.", true);
    }
    
    // --- Get Holding ID and determine Method/URL ---
    const holdingId = document.getElementById('holding-id').value;
    const isEditMode = holdingId.length > 5; // Check if we have an ID
    
    const method = isEditMode ? 'PUT' : 'POST';
    const url = isEditMode ? `${HOLDINGS_API}/${holdingId}` : HOLDINGS_API;
    
    // --- ****** MODIFICATION: NEW VALIDATION BLOCK ****** ---
    // We add this because 'novalidate' on the form disables browser checks
    
    const ticker = document.getElementById('ticker-input').value;
    const shares = parseFloat(document.getElementById('shares-input').value);
    const buy_price = parseFloat(document.getElementById('buy-price').value);
    const buy_date = document.getElementById('buy-date').value;
    const asset_class = document.getElementById('asset-class').value;

    if (!ticker) {
        saveButton.disabled = false;
        return showMessage("Ticker is required.", true);
    }
    if (!asset_class) {
        saveButton.disabled = false;
        return showMessage("Asset Class is required.", true);
    }
    if (isNaN(shares) || shares <= 0) {
         saveButton.disabled = false;
         return showMessage("Shares/Amount must be a number greater than zero.", true);
    }
     if (isNaN(buy_price) || buy_price <= 0) {
         saveButton.disabled = false;
         return showMessage("Buy Price must be a number greater than zero.", true);
    }
    if (!buy_date) {
        saveButton.disabled = false;
        return showMessage("Buy Date is required.", true);
    }
    // --- ****** END NEW VALIDATION BLOCK ****** ---


    // --- Build Payload (with new annual_dividend field) ---
    const payload = {
        broker: finalBroker, 
        ticker: ticker,
        shares: shares,
        buy_price: buy_price,
        buy_date: buy_date,
        asset_class: asset_class,
        annual_dividend: parseFloat(document.getElementById('annual-dividend-input').value) || 0
    };

    try {
        const response = await fetch(url, {
            method: method, // Use dynamic method (POST or PUT)
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || `API error (${response.status})`);
        }

        const message = isEditMode ? "Holding successfully updated!" : "Holding successfully added!";
        showMessage(message, false);
        
        cancelEdit(); // Reset and close the form
        
        // Clear cache so the change is reflected on next load
        localStorage.removeItem(CACHE_KEY);
        await initializePortfolioTracker(); // Refresh the table
        
    } catch (error) {
        console.error("Error saving holding:", error);
        showMessage(error.message || "Failed to save holding (Check console for details).", true);
    } finally {
        saveButton.disabled = false;
    }
}
// --- ****** END MODIFICATION ****** ---

// --- START: DELETE HOLDING ---
async function deleteHolding(id) {
    if (!confirm("Are you sure you want to delete this holding? This cannot be undone.")) return;

    const token = getAuthToken();
    if (!token) return showMessage("Authentication required.", true);
    
    try {
        const response = await fetch(`${HOLDINGS_API}/${id}`, {
            method: 'DELETE',
            headers: { 
                'Authorization': `Bearer ${token}`
            }
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.message || 'Failed to delete holding.');
        }

        showMessage("Holding successfully deleted!", false);
        // Clear cache so the deleted holding is removed on next load
        localStorage.removeItem(CACHE_KEY);
        await initializePortfolioTracker(); 
        
    } catch (error) {
        console.error("Error deleting holding:", error);
        showMessage(error.message || "Failed to delete holding.", true);
    }
}
window.deleteHolding = deleteHolding; 
// --- END: DELETE HOLDING ---


// =========================================================================
// ## INITIALIZATION ORCHESTRATOR (Refactored for Caching)
// =========================================================================

// --- START: INITIALIZE PORTFOLIO TRACKER ---
async function initializePortfolioTracker() {
    $('#loading-message').removeClass('hidden').html('<i data-lucide="loader-circle" class="w-8 h-8 animate-spin mx-auto"></i><p class="mt-3">Loading portfolio data...</p>');
    $('#portfolio-table').addClass('hidden');
    
    const userHoldings = await fetchUserHoldings();
    
    try { lucide.createIcons(); } catch (e) {}

    if (userHoldings.length === 0) {
        $('#loading-message').html('<p>No holdings found. Use the "Add Holding" button above to get started!</p>');
        destroyCharts();
        return;
    }

    // --- PHASE 1: Load from Cache Immediately ---
    const cachedLiveData = getCachedData(userHoldings);
    let isInitialRenderDone = false;

    if (cachedLiveData) {
        console.log("Rendering from cached data...");
        // Pass userHoldings (from DB) and cachedLiveData (from cache)
        const { processedData, summary, allocationData } = processPortfolioData(userHoldings, cachedLiveData);
        const totalPortfolioValueRaw = parseFloat(summary.totalPortfolioValue.replace(/[^0-9.]+/g,""));

        // Render all UI with stale data
        updateSummaryCards(summary);
        initializeDataTables(processedData); 
        
        destroyCharts();
        drawAllCharts(allocationData, totalPortfolioValueRaw);
        
        isInitialRenderDone = true;
        
        // Show a subtle "updating" indicator
        $('#holdings-title-status').html('<i data-lucide="loader-circle" class="w-4 h-4 animate-spin ml-2 text-tmt-secondary" title="Fetching live prices..."></i>');
        try { lucide.createIcons(); } catch (e) {}
    }

    // --- PHASE 2: Fetch Live Data in Background ---
    const liveData = await fetchLiveData(userHoldings); // This is the SLOW, chunked call
    
    // Save new data to cache
    saveDataToCache(liveData);

    // --- PHASE 3: Re-Render with Live Data ---
    console.log("Re-rendering with live data...");
    // Pass userHoldings (from DB) and fresh liveData
    const { processedData, summary, allocationData } = processPortfolioData(userHoldings, liveData);
    const totalPortfolioValueRaw = parseFloat(summary.totalPortfolioValue.replace(/[^0-9.]+/g,""));

    // Update all UI components with the fresh data
    updateSummaryCards(summary);
    initializeDataTables(processedData); 
    
    destroyCharts();
    drawAllCharts(allocationData, totalPortfolioValueRaw);

    // Hide subtle indicator
    $('#holdings-title-status').empty();
}
// --- END: INITIALIZE PORTFOLIO TRACKER ---


// --- START: DOM READY EVENT LISTENER ---
$(document).ready(function() {
    initializePortfolioTracker();

    $('#toggle-input-form').on('click', function() {
        const formContainer = $('#input-form-container');
        // If we're clicking "Add" and the form is in edit mode, cancel edit first
        if (document.getElementById('holding-id').value) {
            cancelEdit();
        }
        
        formContainer.slideToggle(300, function() {
            const isVisible = formContainer.is(':visible');
            const icon = $('#toggle-input-form i');
            icon.attr('data-lucide', isVisible ? 'minus' : 'plus');
            try { lucide.createIcons(); } catch (e) {} 
        });
    });

    // ****** MODIFICATION: Point to the new saveHolding function ******
    $('#add-holding-form').on('submit', saveHolding);
    
    // API-driven Ticker Autocomplete for Add Holding form
    $('#ticker-input').on('keyup', async function() {
        const query = $(this).val().toUpperCase();
        const suggestionsDiv = $('#add-holding-suggestions');
        suggestionsDiv.empty();
        
        if (query.length < 2) {
            suggestionsDiv.addClass('hidden');
            return;
        }
        
        const results = await fetchTickerSuggestions(query);
        
        if (results.length > 0) {
            results.forEach(item => {
                const suggestionItem = $('<div>')
                    .text(item.description) 
                    .addClass('p-2 cursor-pointer hover:bg-tmt-primary hover:text-tmt-bg transition duration-150 text-sm')
                    .attr('onclick', `selectPortfolioSuggestion('${item.ticker}', '${item.description.replace(/'/g, "\\'")}')`); 
                suggestionsDiv.append(suggestionItem);
            });
            suggestionsDiv.removeClass('hidden');
        } else {
            suggestionsDiv.addClass('hidden');
        }
    });
});
// --- END: DOM READY EVENT LISTENER ---