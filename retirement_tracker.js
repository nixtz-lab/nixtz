// retirement_tracker.js

let freedomChartInstance = null;
let currentProfileData = null; 
const FI_COLOR = '#FFC700'; // TMT Secondary (Gold)
const NW_COLOR = '#00A99D'; // TMT Primary (Teal)
// FIX: Removed conflicting API_BASE_URL declaration. It is now accessed from global scope (script.js).
const SEARCH_API = `/api/search-tickers`; // Ticker search API (Using relative path)

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Icons
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    // 2. Fetch Data on Load
    // Read initial timeframe from HTML select (defaults to 'yearly')
    const initialTimeframe = document.getElementById('chart-timeframe')?.value || 'yearly';
    fetchDashboardData(initialTimeframe);

    // 3. Attach Snapshot Button Listener
    const snapshotBtn = document.getElementById('record-snapshot-btn');
    if (snapshotBtn) {
        snapshotBtn.addEventListener('click', recordSnapshot);
    }

    // 4. Attach Form Save Listeners (for Core Profile)
    const form = document.getElementById('retirement-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveRetirementProfile();
        });
    }

    // 5. Attach Chart Timeframe Listener (NEW)
    document.getElementById('chart-timeframe')?.addEventListener('change', (e) => {
        fetchDashboardData(e.target.value);
    });
});

// Expose core global functions for HTML buttons
window.switchTab = switchTab;
window.recordSnapshot = recordSnapshot;
window.addFinancialAssetRow = addFinancialAssetRow;
window.addPropertyAssetRow = addPropertyAssetRow;
window.addBusinessAssetRow = addBusinessAssetRow;
window.deleteAsset = deleteAsset;
window.editAsset = editAsset; 
window.cancelEdit = cancelEdit; 
window.showAssetOptions = showAssetOptions; 
window.hideAssetOptions = hideAssetOptions; 
window.showAssetForm = showAssetForm; 


// =========================================================================
// ## TICKET SEARCH UTILITIES
// =========================================================================

function selectRetirementSuggestion(ticker, description = null) {
    // Targets the ticker input in both new and edit forms
    const formInput = document.getElementById('new-ticker') || document.getElementById('edit-ticker');
    
    if (formInput) {
        formInput.value = ticker;
    }

    // Hides suggestions for both new and edit forms
    document.querySelectorAll('#add-holding-suggestions-retirement').forEach(s => s.classList.add('hidden')); 

    const finalDescription = description || ticker.toUpperCase();
    window.showMessage(`Ticker selected: ${finalDescription}`, false); 
}
window.selectRetirementSuggestion = selectRetirementSuggestion; 


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
                name: item.name 
            }));
        }
        return [];
    } catch (error) {
        console.error("Network error fetching ticker suggestions:", error);
        return [];
    }
}

async function handleRetirementSearchInput(query) {
    // Target the suggestion container dynamically
    const suggestionsDiv = document.getElementById('add-holding-suggestions-retirement');
    if (!suggestionsDiv) return;

    suggestionsDiv.innerHTML = '';
    
    if (query.length < 2) {
        suggestionsDiv.classList.add('hidden');
        return;
    }
    
    const results = await fetchTickerSuggestions(query);
    
    if (results.length > 0) {
        results.forEach(item => {
            const description = `${item.ticker} - ${item.name}`;
            const suggestionItem = document.createElement('div');
            suggestionItem.textContent = description;
            suggestionItem.className = 'p-2 cursor-pointer hover:bg-tmt-primary hover:text-tmt-bg transition duration-150 text-sm';
            suggestionItem.setAttribute('onclick', `selectRetirementSuggestion('${item.ticker}', '${description.replace(/'/g, "\\'")}')`); 
            
            suggestionsDiv.appendChild(suggestionItem);
        });
        suggestionsDiv.classList.remove('hidden');
    } else {
        suggestionsDiv.classList.add('hidden');
    }
}
window.handleRetirementSearchInput = handleRetirementSearchInput;

// --- NEW HELPER FUNCTION: Toggle Manual Broker Input Visibility ---
function toggleManualBrokerInput(selectedValue) {
    // This is primarily for the Individual Ticker manual input field
    const manualInput = document.getElementById('broker-manual-input-financial');
    if (manualInput) {
        if (selectedValue === 'Other') {
            manualInput.classList.remove('hidden');
            manualInput.required = true;
        } else {
            manualInput.classList.add('hidden');
            manualInput.required = false;
            manualInput.value = '';
        }
    }
}
window.toggleManualBrokerInput = toggleManualBrokerInput;


// ===================================================================
// DATA HANDLING (FETCH/SAVE)
// ===================================================================

/**
 * Fetches all necessary data for the dashboard and inputs in one call.
 * @param {string} [timeframe='yearly'] - 'yearly' or 'monthly' for chart projection.
 */
async function fetchDashboardData(timeframe = 'yearly') {
    try {
        const token = localStorage.getItem('tmt_auth_token');
        if(!token) return; 

        const response = await fetch('/api/retirement/dashboard', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (result.success) {
            currentProfileData = result.profile;
            
            // Pass the timeframe to the render function
            renderDashboard(result, timeframe);
            renderAssetInputs(result);
            renderHistory(result.snapshots);
        } else {
            console.error("Dashboard API failed:", result.message);
            document.getElementById('display-fi-number').textContent = "ERROR";
            document.getElementById('display-years-left').textContent = "---";
            document.getElementById('display-progress-pct').textContent = "---";
            window.showMessage(result.message || "Failed to load dashboard data. Check network.", true);
        }
    } catch (error) {
        console.error("Error loading dashboard data:", error);
        document.getElementById('display-fi-number').textContent = "OFFLINE";
        document.getElementById('display-years-left').textContent = "---";
        document.getElementById('display-progress-pct').textContent = "---";
        window.showMessage("Network error during dashboard load. Check console.", true);
    }
}

/**
 * Saves the core profile inputs (expenses, rates) to the backend.
 */
async function saveRetirementProfile() {
    const data = getFormData();
    const token = localStorage.getItem('tmt_auth_token');
    const showMessage = window.showMessage || console.log;

    try {
        const response = await fetch('/api/retirement/save', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (result.success) {
            showMessage("Core plan updated successfully!", false);
            // Re-fetch dashboard data to update calculations on the UI
            await fetchDashboardData(); 
        } else {
            showMessage(result.message || "Error saving core plan. Check console.", true);
        }
    } catch (error) {
        console.error("Network error saving core plan:", error);
        showMessage("Network error saving core plan. Check console.", true);
    }
}

/**
 * Triggers the backend logic to aggregate all assets and record a new snapshot.
 */
async function recordSnapshot() {
    const btn = document.getElementById('record-snapshot-btn');
    const oldText = btn.textContent;
    btn.textContent = "Recording...";
    btn.disabled = true;

    try {
        const token = localStorage.getItem('tmt_auth_token');
        const response = await fetch('/api/retirement/snapshot/record', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (result.success) {
            window.showMessage("Monthly snapshot recorded successfully! (NW updated)", false);
            // Refresh all data
            await fetchDashboardData(); 
        } else {
            window.showMessage(result.message || "Failed to record snapshot. Check console.", true);
        }
    } catch (error) {
        window.showMessage("Network error during snapshot.", true);
    } finally {
        btn.textContent = oldText;
        btn.disabled = false;
    }
}

/**
 * Helper: Extracts values from the HTML inputs and parses them as floats.
 */
function getFormData() {
    return {
        // FIX/IMPROVEMENT: Use parseFloat() for all numerical inputs
        monthlyContribution: parseFloat(document.getElementById('monthly-contrib')?.value) || 0,
        annualExpenses: parseFloat(document.getElementById('annual-expenses')?.value) || 0,
        annualTravelSpending: parseFloat(document.getElementById('annual-travel-spending')?.value) || 0, 
        expectedReturn: parseFloat(document.getElementById('exp-return')?.value) || 0,
        safeWithdrawalRate: parseFloat(document.getElementById('withdrawal-rate')?.value) || 0,
    };
}


// ===================================================================
// UI RENDERING & CALCULATION
// ===================================================================

/**
 * Filters the snapshot array to include only the latest snapshot entry for each unique date.
 */
function getLatestSnapshotPerDay(snapshots) {
    const dailyMap = new Map();

    snapshots.forEach(s => {
        const date = new Date(s.date);
        const dateKey = date.toISOString().split('T')[0];
        
        const existing = dailyMap.get(dateKey);
        
        // Keep only the latest snapshot (by time) for the day
        if (!existing || date.getTime() > new Date(existing.date).getTime()) {
            dailyMap.set(dateKey, s);
        }
    });

    return Array.from(dailyMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
}

/**
 * Calculates projected portfolio growth (NEW: Supports monthly or yearly steps).
 */
function calculateProjection(initialNW, monthlyContribution, expectedReturn, periods, isMonthly = false) {
    let projectedData = [];
    let currentNW = initialNW;
    
    // Convert inputs based on frequency
    let rate, contribution;

    if (isMonthly) {
        rate = (expectedReturn / 100) / 12;
        contribution = monthlyContribution;
        // periods is 12 months
    } else { // Yearly
        rate = expectedReturn / 100;
        contribution = monthlyContribution * 12;
        // periods is 10 years
    }
    
    projectedData.push(currentNW);

    // Iteration loop uses periods (months or years)
    for (let i = 1; i <= periods; i++) {
        // Compound previous balance, then add contribution
        currentNW = (currentNW * (1 + rate)) + contribution;
        projectedData.push(currentNW);
    }
    return projectedData;
}


/**
 * Handles Tab Switching and styling.
 */
function switchTab(tabId) {
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));

    document.getElementById(`tab-${tabId}`).classList.add('active');
    document.getElementById(`content-${tabId}`).classList.remove('hidden');
}


function renderDashboard(data, timeframe = 'yearly') {
    const totals = data.currentTotals;
    const profile = data.profile;
    
    // --- CARD RENDERING & NEW FIGURES ---
    const fiNumberFormatted = `$${Math.round(totals.fiNumber).toLocaleString()}`;
    const nwFormatted = `$${Math.round(totals.totalNetWorth).toLocaleString()}`;
    const incomeFormatted = `$${Math.round(totals.totalPassiveIncome).toLocaleString()}`;
    
    document.getElementById('display-fi-number').textContent = fiNumberFormatted;
    
    // 1. Current Progress Card Enhancement
    const progressPct = totals.fiNumber > 0 ? (totals.totalNetWorth / totals.fiNumber) * 100 : 0;
    
    document.getElementById('display-progress-pct').textContent = `${progressPct.toFixed(1)}%`;
    // NEW: Display Dollar Figures on Card
    document.getElementById('display-total-nw').textContent = `NW: ${nwFormatted}`;
    document.getElementById('display-total-income').textContent = `Income: ${incomeFormatted}/yr`;
    
    // --- TIME TO FREEDOM (Unchanged logic) ---
    const target = totals.fiNumber; 
    const currentNW = totals.totalNetWorth || 0;
    const monthlyContrib = parseFloat(profile.monthlyContribution) || 0;
    const expectedReturn = parseFloat(profile.expectedReturn) / 100 || 0;
    
    let yearsLeft = 50; 

    if (currentNW < target && monthlyContrib > 0) {
        let simulatedNW = currentNW;
        let months = 0;
        const monthlyRate = expectedReturn / 12;
        
        while (simulatedNW < target && months < 600) { 
            simulatedNW = simulatedNW * (1 + monthlyRate) + monthlyContrib;
            months++;
        }
        yearsLeft = months < 600 ? Math.ceil(months / 12) : 50;
    }
    
    // 2. Update Progress Bar & Years Left Display
    document.getElementById('progress-bar').style.width = `${Math.min(progressPct, 100)}%`;
    
    const yearsEl = document.getElementById('display-years-left');
    if (yearsEl) {
        if (progressPct >= 100) {
            yearsEl.textContent = "FI Reached!";
            yearsEl.classList.add('text-tmt-primary', 'font-bold');
        } else {
            yearsEl.textContent = `${Math.min(yearsLeft, 50)} Years`;
            yearsEl.classList.remove('text-tmt-primary', 'font-bold');
        }
    }
    
    // --- CHART LOGIC (MODIFIED FOR TIMEFRAME) ---
    const chartSnapshots = getLatestSnapshotPerDay(data.snapshots);
    const initialNW = totals.totalNetWorth || 0; 
    
    let periods, isMonthly;
    if (timeframe === 'monthly') {
        periods = 12; 
        isMonthly = true;
    } else { // 'yearly'
        periods = 10;
        isMonthly = false;
    }

    // Actual History Data Points
    const historyLabels = chartSnapshots.map(s => new Date(s.date).toLocaleDateString());
    const currentYear = new Date().getFullYear();

    // Projected Future Data Points
    const projectedData = calculateProjection(
        initialNW, 
        profile.monthlyContribution, 
        profile.expectedReturn, 
        periods, // Use periods for number of steps
        isMonthly
    );

    // Create Labels for the chart's X-axis
    let futureLabels;
    if (isMonthly) {
        // Generate labels for the next 12 months (starting next month)
        const start = new Date();
        futureLabels = Array.from({length: periods}, (_, i) => {
            const date = new Date(start.getFullYear(), start.getMonth() + i + 1, 1);
            return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        });
    } else {
        // Generate labels for the next 10 years (starting next year)
        futureLabels = Array.from({length: periods}, (_, i) => `${currentYear + i + 1}`); 
    }
    
    // Combine history dates with future labels
    const combinedLabels = historyLabels.concat(futureLabels.slice(historyLabels.length > 0 ? 0 : 1));
    const historyNetWorth = chartSnapshots.map(s => s.totalNetWorth);

    // Fill FI and Actual data arrays to match the length of the combined labels
    const combinedFI = combinedLabels.map(() => totals.fiNumber);
    
    // Combine historical net worth (Actuals) with the corresponding future projection segments
    const projectionStart = historyNetWorth.length > 0 ? historyNetWorth[historyNetWorth.length - 1] : initialNW;
    
    // Recalculate projection starting from the last actual point
    const projectedFutureOnly = calculateProjection(
        projectionStart, 
        profile.monthlyContribution, 
        profile.expectedReturn, 
        periods,
        isMonthly
    );

    const fullProjectedLine = historyNetWorth.concat(projectedFutureOnly.slice(historyNetWorth.length > 0 ? 1 : 0));
    
    // Create the actual history line (dots on history, null on future)
    const actualHistoryLine = historyNetWorth.concat(Array(fullProjectedLine.length - historyNetWorth.length).fill(null));


    drawChart(
        combinedLabels, 
        actualHistoryLine, 
        combinedFI, 
        fullProjectedLine, 
        profile,
        isMonthly // Pass flag to chart for tooltip formatting
    );
}


function renderAssetInputs(data) {
    // 1. Render Core Profile/Expense form
    if(currentProfileData) {
        // Ensure that if a value is null/undefined in the DB, it displays as an empty string (not '0') in the input field
        const getVal = (prop) => currentProfileData[prop] || ''; 
        
        document.getElementById('monthly-contrib').value = getVal('monthlyContribution');
        document.getElementById('annual-expenses').value = getVal('annualExpenses');
        document.getElementById('annual-travel-spending').value = getVal('annualTravelSpending'); 
        document.getElementById('exp-return').value = getVal('expectedReturn');
        document.getElementById('withdrawal-rate').value = getVal('safeWithdrawalRate');
    }

    // 2. Render Asset Lists (Visualizations based on stored data)
    const financialList = document.getElementById('financial-asset-list');
    const propertyList = document.getElementById('property-asset-list');
    const businessList = document.getElementById('business-asset-list'); 

    financialList.innerHTML = '';
    propertyList.innerHTML = '';
    businessList.innerHTML = ''; 

    // Render saved financial assets (UPDATED WITH Broker display)
    if (data.financial && data.financial.length > 0) {
        data.financial.forEach(asset => {
             financialList.innerHTML += `
             <div class="p-3 bg-gray-800 rounded-lg flex justify-between items-center asset-row" data-asset-id="${asset._id}" data-asset-type="financial">
                 <span class="font-bold text-tmt-secondary">${asset.ticker || asset.nickname}</span>
                 <span class="text-sm text-gray-400">
                    ${asset.ticker ? 
                        `Broker: ${asset.broker || 'N/A'} | ${asset.shares.toFixed(2)} sh @ $${asset.lastPrice ? asset.lastPrice.toFixed(2) : '---'} | Yield: ${asset.annualYieldPct}%` :
                        `Account: ${asset.nickname} | Value: $${asset.totalValue?.toLocaleString() || '---'} | Income: $${asset.annualIncome?.toLocaleString() || '---'}/yr`}
                 </span>
                 <div class="space-x-3">
                    <button onclick="editAsset('financial', '${asset._id}')" class="text-gray-400 hover:text-white">Edit</button>
                    <button onclick="deleteAsset('financial', '${asset._id}')" class="text-red-500 hover:text-red-300">Delete</button>
                 </div>
             </div>`;
        });
    } else {
        financialList.innerHTML = `<p class="text-center text-gray-500 text-sm">No financial assets saved. Use 'Add New Asset' to track.</p>`;
    }

    // Render saved property assets (UPDATED WITH EDIT BUTTON AND CORRECT DISPLAY)
    if (data.property && data.property.length > 0) {
        data.property.forEach(asset => {
             propertyList.innerHTML += `
             <div class="p-3 bg-gray-800 rounded-lg flex justify-between items-center asset-row" data-asset-id="${asset._id}" data-asset-type="property">
                 <span class="font-bold text-tmt-primary">${asset.nickname}</span>
                 <span class="text-xs text-gray-400 text-right space-y-1">
                    <p>Value: $${Math.round(asset.marketValue).toLocaleString()} | Loan: $${Math.round(asset.loanBalance).toLocaleString()}</p>
                    <p>Rent: $${asset.rentalIncome.toLocaleString()}/mo | Pmt: $${asset.loanPayment.toLocaleString()}/mo</p>
                 </span>
                 <div class="space-x-3">
                    <button onclick="editAsset('property', '${asset._id}')" class="text-gray-400 hover:text-white">Edit</button>
                    <button onclick="deleteAsset('property', '${asset._id}')" class="text-red-500 hover:text-red-300">Delete</button>
                 </div>
             </div>`;
        });
    } else {
        propertyList.innerHTML = `<p class="text-center text-gray-500 text-sm">No properties saved. Use 'Add New Property' to track.</p>`;
    }

    // Render saved business assets (UPDATED WITH EDIT BUTTON)
    if (data.business && data.business.length > 0) {
        data.business.forEach(asset => {
             businessList.innerHTML += `
             <div class="p-3 bg-gray-800 rounded-lg flex justify-between items-center asset-row" data-asset-id="${asset._id}" data-asset-type="business">
                 <span class="font-bold text-blue-500">${asset.nickname}</span>
                 <span class="text-sm text-gray-400">Valuation: $${Math.round(asset.currentValuation).toLocaleString()} | Monthly Profit: $${asset.monthlyProfit.toLocaleString()}</span>
                 <div class="space-x-3">
                    <button onclick="editAsset('business', '${asset._id}')" class="text-gray-400 hover:text-white">Edit</button>
                    <button onclick="deleteAsset('business', '${asset._id}')" class="text-red-500 hover:text-red-300">Delete</button>
                 </div>
             </div>`;
        });
    } else {
        businessList.innerHTML = `<p class="text-center text-gray-500 text-sm">Business income tracking form pending final implementation.</p>`;
    }
    
    // Store data globally to simplify editing logic
    window.allFinancialAssets = data.financial;
    window.allPropertyAssets = data.property;
    window.allBusinessAssets = data.business;
}

function renderHistory(snapshots) {
    const tbody = document.getElementById('history-table-body');
    tbody.innerHTML = '';
    if (!snapshots || snapshots.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">No snapshots recorded yet.</td></tr>`;
        return;
    }
    
    // Check if profile data exists to calculate fiNumber safely
    const fiNumber = currentProfileData && currentProfileData.safeWithdrawalRate > 0 ? 
                     currentProfileData.annualExpenses / (currentProfileData.safeWithdrawalRate / 100) : 0;

    snapshots.forEach(s => {
        const progress = fiNumber > 0 ? (s.totalNetWorth / fiNumber) * 100 : 0;
        
        const row = document.createElement('tr');
        row.className = 'border-b border-gray-700 hover:bg-gray-800/50';
        row.innerHTML = `
            <td class="py-3 px-6">${new Date(s.date).toLocaleString()}</td>
            <td class="py-3 px-6 text-tmt-secondary">$${Math.round(s.totalNetWorth).toLocaleString()}</td>
            <td class="py-3 px-6 text-tmt-primary">$${Math.round(s.totalPassiveIncome).toLocaleString()}</td>
            <td class="py-3 px-6 ${progress >= 100 ? 'text-tmt-primary font-bold' : 'text-white'}">${progress.toFixed(1)}%</td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * Renders the Chart.js Line Chart with three datasets.
 */
function drawChart(labels, portfolioData, fiData, projectedData, profile, isMonthly) {
    const ctx = document.getElementById('freedomChart').getContext('2d');
    
    if (freedomChartInstance) {
        freedomChartInstance.destroy();
    }

    const tooltipCallback = isMonthly ? 
        function(context) { 
            return `${context.dataset.label} (${labels[context.dataIndex]}): $${Math.round(context.raw).toLocaleString()}`;
        } :
        function(context) {
            return context.dataset.label + ': $' + Math.round(context.raw).toLocaleString();
        };

    const xTitle = isMonthly ? 'Projection (Months)' : 'Projection (Years)';
    
    freedomChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Projected Wealth (Plan)',
                    data: projectedData,
                    borderColor: '#2196F3', // Light Blue for projection/plan
                    backgroundColor: 'rgba(33, 150, 243, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: false,
                    borderDash: [8, 4], // Dashed line for projection
                    pointRadius: 0
                },
                {
                    label: 'Actual Portfolio Wealth',
                    data: portfolioData, 
                    borderColor: NW_COLOR, // TMT Primary (Teal)
                    backgroundColor: 'rgba(0, 169, 157, 0.2)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true,
                    // Use pointRadius > 0 only for historical data points
                    pointRadius: (ctx) => {
                        const index = ctx.dataIndex;
                        // Only show a point if the data is not null (i.e., it's a historical data point)
                        return portfolioData[index] !== null ? 3 : 0; 
                    },
                },
                {
                    label: 'Financial Independence Number',
                    data: fiData,
                    borderColor: FI_COLOR, // TMT Secondary (Gold)
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: 'white' } },
                tooltip: {
                    callbacks: {
                        label: tooltipCallback
                    }
                }
            },
            scales: {
                x: { 
                    title: { display: true, text: xTitle, color: '#9CA3AF' },
                    ticks: { color: '#9CA3AF' }, 
                    grid: { color: '#374151' } 
                },
                y: { 
                    ticks: { 
                        color: '#9CA3AF',
                        callback: function(value) { return '$' + value / 1000 + 'k'; } 
                    }, 
                    grid: { color: '#374151' } 
                }
            }
        }
    });
}

// ===================================================================
// DYNAMIC ASSET ROW & CRUD IMPLEMENTATION
// ===================================================================

async function saveFinancialAsset(data) {
    const token = localStorage.getItem('tmt_auth_token');
    const showMessage = window.showMessage || console.log;
    const url = '/api/retirement/assets/financial/save';

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (result.success) {
            showMessage(`Financial asset ${data._id ? 'updated' : 'saved'} successfully!`, false);
            // Only hide the form containers, don't remove them completely
            hideAssetOptions(); 
            document.querySelector('.edit-form-container')?.remove(); 
            await fetchDashboardData(); 
        } else {
            showMessage(result.message || "Error saving asset. Check console.", true);
        }
    } catch (error) {
        console.error("Network error saving financial asset:", error);
        showMessage("Network error saving financial asset. Check console.", true);
    }
}

async function savePropertyAsset(data) {
    const token = localStorage.getItem('tmt_auth_token');
    const showMessage = window.showMessage || console.log;
    const url = '/api/retirement/assets/property/save';

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (result.success) {
            showMessage(`Property asset ${data._id ? 'updated' : 'saved'} successfully!`, false);
            document.querySelector('.new-property-form')?.remove(); 
            document.querySelector('.edit-form-container')?.remove(); 
            await fetchDashboardData(); 
        } else {
            showMessage(result.message || "Error saving property. Check console.", true);
        }
    } catch (error) {
        console.error("Network error saving property asset:", error);
        showMessage("Network error saving property asset. Check console.", true);
    }
}

async function saveBusinessAsset(data) {
    const token = localStorage.getItem('tmt_auth_token');
    const showMessage = window.showMessage || console.log;
    const url = '/api/retirement/assets/business/save';

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (result.success) {
            showMessage(`Business asset ${data._id ? 'updated' : 'saved'} successfully!`, false);
            document.querySelector('.new-business-form')?.remove(); 
            document.querySelector('.edit-form-container')?.remove(); 
            await fetchDashboardData(); 
        } else {
            showMessage(result.message || "Error saving business income. Check console.", true);
        }
    } catch (error) {
        showMessage("Network error saving business income:", error);
        showMessage("Network error saving business income. Check console.", true);
    }
}

// ===================================================================
// ADD ASSET FUNCTIONS (UPDATED WITH BROKER & SEARCH)
// ===================================================================

function showAssetOptions() {
    // Hide the main "Add New Asset" button
    document.getElementById('add-asset-button').classList.add('hidden');
    // Show the dropdown and form containers
    document.getElementById('financial-add-options').classList.remove('hidden');
    // Ensure no form is showing initially
    document.getElementById('form-ticker-container').classList.add('hidden');
    document.getElementById('form-broker-container').classList.add('hidden');
    document.getElementById('asset-entry-type').value = "";
    
    // Clear any temporary forms
    document.querySelector('.new-asset-form')?.remove(); 
    document.querySelector('.edit-form-container')?.remove();
}

function hideAssetOptions() {
    // Show the main "Add New Asset" button
    document.getElementById('add-asset-button').classList.remove('hidden');
    // Hide the dropdown and form containers
    document.getElementById('financial-add-options').classList.add('hidden');
    document.getElementById('form-ticker-container').classList.add('hidden');
    document.getElementById('form-broker-container').classList.add('hidden');
    
    // Clear any temporary forms
    document.querySelector('.new-asset-form')?.remove(); 
    document.querySelector('.edit-form-container')?.remove();
}

function showAssetForm(type) {
    const tickerContainer = document.getElementById('form-ticker-container');
    const brokerContainer = document.getElementById('form-broker-container');
    
    // Reset containers
    tickerContainer.innerHTML = '';
    brokerContainer.innerHTML = '';
    tickerContainer.classList.add('hidden');
    brokerContainer.classList.add('hidden');

    // --- Broker Dropdown Options Fragment ---
    const brokerDropdownOptions = `
        <option value="" disabled selected>Select or choose Other...</option>
        <option value="Fidelity Investments">Fidelity Investments</option>
        <option value="Charles Schwab">Charles Schwab</option>
        <option value="Interactive Brokers">Interactive Brokers (IBKR)</option>
        <option value="E-Trade">E-Trade</option>
        <option value="Robinhood">Robinhood</option>
        <option value="Webull">Webull</option>
        <option value="Merrill Edge">Merrill Edge</option>
        <option value="Trading 212">Trading 212</option>
        <option value="eToro">eToro</option>
        <option value="Other">Other (Manual Entry)</option>
    `;


    if (type === 'ticker') {
        tickerContainer.classList.remove('hidden');
        tickerContainer.innerHTML = `
            <h4 class="font-semibold text-tmt-secondary">Individual Ticker Details</h4>
            <form id="new-financial-form" class="space-y-2">
                
                <div>
                    <label for="new-broker-select-ticker" class="block text-sm font-medium text-gray-400 mb-1">Broker Name</label>
                    <select id="new-broker-select-ticker" class="input-field p-2 text-sm" required onchange="toggleManualBrokerInput(this.value)">
                        ${brokerDropdownOptions}
                    </select>
                    <input type="text" id="broker-manual-input-financial" class="input-field p-2 text-sm mt-2 hidden" placeholder="Enter Broker Name Manually">
                </div>
                <div class="relative search-container">
                    <input 
                        type="text" 
                        placeholder="Ticker (e.g., VTI)" 
                        id="new-ticker" 
                        class="input-field p-2 text-sm uppercase" 
                        required
                        onkeyup="handleRetirementSearchInput(this.value)"
                    >
                    <div id="add-holding-suggestions-retirement" class="search-suggestions hidden"></div> 
                </div>
                <input type="number" placeholder="Shares Owned" id="new-shares" class="input-field p-2 text-sm" required min="0" step="0.01">
                <input type="number" placeholder="Annual Yield % (e.g., 2.5)" id="new-yield" class="input-field p-2 text-sm" required min="0" step="0.01">
                <button type="submit" class="w-full bg-tmt-secondary text-tmt-bg font-bold py-2 rounded-lg text-sm hover:bg-[#E5B800] transition duration-200">Save Ticker Asset</button>
            </form>
        `;
        document.getElementById('new-financial-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // Broker Logic
            const selectedBroker = document.getElementById('new-broker-select-ticker').value;
            let finalBroker = selectedBroker;
            if (selectedBroker === 'Other') {
                finalBroker = document.getElementById('broker-manual-input-financial').value;
                if (!finalBroker) {
                    return window.showMessage("Broker name is required for 'Other'.", true);
                }
            }
            if (!finalBroker || finalBroker === 'Select or choose Other...') {
                return window.showMessage("Please select or enter a Broker Name.", true);
            }
            
            await saveFinancialAsset({
                broker: finalBroker, // Include broker in the payload
                ticker: document.getElementById('new-ticker').value,
                shares: parseFloat(document.getElementById('new-shares').value),
                annualYieldPct: parseFloat(document.getElementById('new-yield').value),
            });
        });

    } else if (type === 'broker') {
        brokerContainer.classList.remove('hidden');
        brokerContainer.innerHTML = `
            <h4 class="font-semibold text-tmt-primary">Broker/Account Total</h4>
            <form id="new-broker-form" class="space-y-2">
                
                <div>
                    <label for="new-broker-nickname-select" class="block text-sm font-medium text-gray-400 mb-1">Account Nickname (e.g., Fidelity IRA)</label>
                    <select id="new-broker-nickname-select" class="input-field p-2 text-sm" required>
                        ${brokerDropdownOptions}
                    </select>
                </div>
                
                <input type="text" placeholder="Custom Nickname (if 'Other' selected)" id="new-broker-nickname-input" class="input-field p-2 text-sm hidden" required>
                <input type="number" placeholder="Total Account Value ($)" id="new-total-value" class="input-field p-2 text-sm" required min="0">
                <input type="number" placeholder="Total Annual Income/Yield ($)" id="new-annual-income" class="input-field p-2 text-sm" required min="0">
                <button type="submit" class="w-full bg-tmt-primary text-tmt-bg font-bold py-2 rounded-lg text-sm hover:bg-[#009287] transition duration-200">Save Broker Account</button>
            </form>
        `;
        
        const selectElement = document.getElementById('new-broker-nickname-select');
        const customInputElement = document.getElementById('new-broker-nickname-input');

        if (selectElement) {
            selectElement.addEventListener('change', function() {
                const isCustom = this.value === 'Other';
                
                if (isCustom) {
                    customInputElement.classList.remove('hidden');
                    customInputElement.required = true;
                    customInputElement.value = ''; // Clear custom input
                    customInputElement.focus();
                } else {
                    customInputElement.classList.add('hidden');
                    customInputElement.required = false;
                    customInputElement.value = '';
                }
            });
        }
        
        document.getElementById('new-broker-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const selectedValue = selectElement.value;
            let finalNickname = '';
            
            if (selectedValue === 'Other') {
                finalNickname = customInputElement.value;
            } else {
                finalNickname = selectedValue;
            }

            if (!finalNickname || finalNickname === 'Select or choose Other...') {
                return window.showMessage("Please select a Broker or enter a Custom Nickname.", true);
            }
            
            await saveFinancialAsset({ 
                nickname: finalNickname, // Use the final nickname
                totalValue: parseFloat(document.getElementById('new-total-value').value),
                annualIncome: parseFloat(document.getElementById('new-annual-income').value),
            });
        });
        
    }
}

async function addFinancialAssetRow() { 
    showAssetOptions(); 
}


async function addPropertyAssetRow() { 
    const listContainer = document.getElementById('property-asset-list');
    if (listContainer.querySelector('.new-property-form, .edit-form-container')) {
        window.showMessage("Please save or cancel the current form first.", true);
        return;
    }
    
    const newFormHtml = `
        <div class="p-4 bg-gray-700 rounded-lg space-y-3 mb-4 new-property-form">
            <h4 class="text-lg font-semibold text-tmt-primary">Add New Property Asset</h4>
            <form id="new-property-form" class="space-y-2">
                <input type="text" placeholder="Property Nickname (e.g., Rental 1)" id="new-nickname" class="input-field p-2 text-sm" required>
                <div class="grid grid-cols-2 gap-4">
                    <input type="number" placeholder="Market Value ($)" id="new-market-value" class="input-field p-2 text-sm" required min="0">
                    <input type="number" placeholder="Loan Balance ($)" id="new-loan-balance" class="input-field p-2 text-sm" required min="0">
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <input type="number" placeholder="Monthly Rental Income ($)" id="new-rental-income" class="input-field p-2 text-sm" required min="0">
                    <input type="number" placeholder="Monthly Loan Payment ($)" id="new-loan-payment" class="input-field p-2 text-sm" required min="0">
                </div>
                <input type="number" placeholder="Loan Years Remaining (e.g., 20)" id="new-years-remaining" class="input-field p-2 text-sm" required min="0">
                
                <div class="flex space-x-2 pt-2">
                    <button type="submit" class="flex-1 bg-tmt-primary text-tmt-bg font-bold py-2 rounded-lg text-sm hover:bg-[#009287] transition duration-200">Save Property</button>
                    <button type="button" onclick="this.closest('.new-property-form').remove()" class="flex-1 bg-gray-500 text-white py-2 rounded-lg text-sm hover:bg-gray-400 transition duration-200">Cancel</button>
                </div>
            </form>
        </div>
    `;

    listContainer.insertAdjacentHTML('afterbegin', newFormHtml);
    const newForm = document.getElementById('new-property-form');
    if (newForm) {
        newForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await savePropertyAsset({
                nickname: document.getElementById('new-nickname').value,
                marketValue: parseFloat(document.getElementById('new-market-value').value),
                loanBalance: parseFloat(document.getElementById('new-loan-balance').value),
                rentalIncome: parseFloat(document.getElementById('new-rental-income').value),
                loanPayment: parseFloat(document.getElementById('new-loan-payment').value),
                yearsRemaining: parseFloat(document.getElementById('new-years-remaining').value),
            });
        });
    }
}

async function addBusinessAssetRow() { 
    const listContainer = document.getElementById('business-asset-list');
    if (listContainer.querySelector('.new-business-form, .edit-form-container')) {
        window.showMessage("Please save or cancel the current form first.", true);
        return;
    }
    
    const newFormHtml = `
        <div class="p-4 bg-gray-700 rounded-lg space-y-3 mb-4 new-business-form">
            <h4 class="text-lg font-semibold text-blue-500">Add New Business/Income Stream</h4>
            <form id="new-business-form" class="space-y-2">
                <input type="text" placeholder="Income Nickname (e.g., Side Gig, YouTube)" id="new-business-nickname" class="input-field p-2 text-sm" required>
                <input type="number" placeholder="Current Valuation ($) - Optional" id="new-current-valuation" class="input-field p-2 text-sm" min="0">
                <input type="number" placeholder="Average Monthly Profit/Income ($)" id="new-monthly-profit" class="input-field p-2 text-sm" required min="0">
                <div class="flex space-x-2 pt-2">
                    <button type="submit" class="flex-1 bg-blue-500 text-tmt-bg font-bold py-2 rounded-lg text-sm hover:bg-blue-400 transition duration-200">Save Income</button>
                    <button type="button" onclick="this.closest('.new-business-form').remove()" class="flex-1 bg-gray-500 text-white py-2 rounded-lg text-sm hover:bg-gray-400 transition duration-200">Cancel</button>
                </div>
            </form>
        </div>
    `;

    listContainer.insertAdjacentHTML('afterbegin', newFormHtml);
    const newForm = document.getElementById('new-business-form');
    if (newForm) {
        newForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveBusinessAsset({
                nickname: document.getElementById('new-business-nickname').value,
                currentValuation: parseFloat(document.getElementById('new-current-valuation').value || 0),
                monthlyProfit: parseFloat(document.getElementById('new-monthly-profit').value),
            });
        });
    }
}

// ===================================================================
// EDIT ASSET FUNCTIONS
// ===================================================================

/**
 * Finds an asset by ID and renders an editable form in its place.
 */
function editAsset(type, id) {
    // 1. Find the current row element
    const currentAssetRow = document.querySelector(`.asset-row[data-asset-id="${id}"]`);
    if (!currentAssetRow) return;

    // Check if another form is open
    if (document.querySelector('.new-asset-form, .edit-form-container, #financial-add-options:not(.hidden)')) {
        window.showMessage("Please save or cancel the existing open form first.", true);
        return;
    }

    // 2. Get the asset data
    let asset = null;
    if (type === 'financial') asset = window.allFinancialAssets.find(a => a._id === id);
    else if (type === 'property') asset = window.allPropertyAssets.find(a => a._id === id);
    else if (type === 'business') asset = window.allBusinessAssets.find(a => a._id === id);

    if (!asset) {
        window.showMessage("Asset data not found for editing.", true);
        return;
    }

    // 3. Generate and inject the edit form
    let formHtml = '';
    let submitHandler = '';
    let color = '';
    
    // --- Broker Options Fragment for Edit Mode ---
    const brokerEditOptions = `
        <div>
            <label for="edit-broker-select" class="block text-sm font-medium text-gray-400 mb-1">Broker Name</label>
            <select id="edit-broker-select" class="input-field p-2 text-sm" required onchange="toggleManualBrokerInput(this.value)">
                <option value="" disabled>Select or choose Other...</option>
                <option value="Fidelity Investments">Fidelity Investments</option>
                <option value="Charles Schwab">Charles Schwab</option>
                <option value="Interactive Brokers">Interactive Brokers (IBKR)</option>
                <option value="E-Trade">E-Trade</option>
                <option value="Robinhood">Robinhood</option>
                <option value="Webull">Webull</option>
                <option value="Merrill Edge">Merrill Edge</option>
                <option value="Trading 212">Trading 212</option>
                <option value="eToro">eToro</option>
                <option value="Other">Other (Manual Entry)</option>
            </select>
            <input type="text" id="broker-manual-input-financial" class="input-field p-2 text-sm mt-2 hidden" placeholder="Enter Broker Name Manually">
        </div>
    `;

    if (type === 'financial') {
        color = 'tmt-secondary';
        // Check if the asset is a simple Ticker or a Broker Account (based on available keys)
        const isBroker = asset.hasOwnProperty('nickname'); 
        
        if(isBroker) {
             formHtml = `
                <h4 class="text-lg font-semibold text-tmt-primary">Edit Broker/Account Total</h4>
                <form id="edit-financial-form" class="space-y-2">
                    ${brokerEditOptions}
                    <input type="text" value="${asset.nickname}" placeholder="Account Nickname (e.g., Fidelity IRA)" id="edit-nickname" class="input-field p-2 text-sm" required>
                    <input type="number" value="${asset.totalValue}" placeholder="Total Account Value ($)" id="edit-total-value" class="input-field p-2 text-sm" required min="0">
                    <input type="number" value="${asset.annualIncome}" placeholder="Total Annual Income/Yield ($)" id="edit-annual-income" class="input-field p-2 text-sm" required min="0">
            `;
            // Logic to populate broker dropdown for Broker Account
            setTimeout(() => {
                const brokerSelect = document.getElementById('edit-broker-select');
                const manualInput = document.getElementById('broker-manual-input-financial');
                const assetBroker = asset.nickname || ''; // Use nickname as broker for broker accounts
                
                if (brokerSelect) {
                    if ([...brokerSelect.options].some(opt => opt.value === assetBroker)) {
                        brokerSelect.value = assetBroker;
                        toggleManualBrokerInput(assetBroker);
                    } else if (assetBroker) {
                        brokerSelect.value = 'Other';
                        toggleManualBrokerInput('Other');
                        if (manualInput) manualInput.value = assetBroker;
                    }
                }
            }, 0);

            submitHandler = `(async () => {
                const selectedBroker = document.getElementById('edit-broker-select').value;
                let finalNickname = document.getElementById('edit-nickname').value;
                const manualInput = document.getElementById('broker-manual-input-financial');

                if (selectedBroker === 'Other' && manualInput.value) {
                    finalNickname = manualInput.value;
                } else if (selectedBroker !== 'Other' && selectedBroker !== 'Select or choose Other...') {
                    finalNickname = selectedBroker;
                }

                if (!finalNickname) {
                    return window.showMessage("Account Nickname or Broker Name is required.", true);
                }

                await saveFinancialAsset({
                    _id: '${id}',
                    nickname: finalNickname,
                    totalValue: parseFloat(document.getElementById('edit-total-value').value),
                    annualIncome: parseFloat(document.getElementById('edit-annual-income').value),
                });
            })()`;


        } else {
             // Logic for Individual Ticker Edit (must include Broker name and search)
             const brokerOptions = `
                <div>
                    <label for="edit-broker-select" class="block text-sm font-medium text-gray-400 mb-1">Broker Name</label>
                    <select id="edit-broker-select" class="input-field p-2 text-sm" required onchange="toggleManualBrokerInput(this.value)">
                        <option value="" disabled>Select or choose Other...</option>
                        <option value="Fidelity Investments">Fidelity Investments</option>
                        <option value="Charles Schwab">Charles Schwab</option>
                        <option value="Interactive Brokers">Interactive Brokers (IBKR)</option>
                        <option value="E-Trade">E-Trade</option>
                        <option value="Robinhood">Robinhood</option>
                        <option value="Webull">Webull</option>
                        <option value="Merrill Edge">Merrill Edge</option>
                        <option value="Trading 212">Trading 212</option>
                        <option value="eToro">eToro</option>
                        <option value="Other">Other (Manual Entry)</option>
                    </select>
                    <input type="text" id="broker-manual-input-financial" class="input-field p-2 text-sm mt-2 hidden" placeholder="Enter Broker Name Manually">
                </div>
             `;
             
             formHtml = `
                <h4 class="text-lg font-semibold text-${color}">Edit Financial Asset</h4>
                <form id="edit-financial-form" class="space-y-2">
                    ${brokerOptions}
                    <div class="relative search-container">
                        <input type="text" value="${asset.ticker}" placeholder="Ticker (e.g., VTI)" id="edit-ticker" class="input-field p-2 text-sm uppercase" required onkeyup="handleRetirementSearchInput(this.value)">
                        <div id="add-holding-suggestions-retirement" class="search-suggestions hidden"></div>
                    </div>
                    <input type="number" value="${asset.shares}" placeholder="Shares Owned" id="edit-shares" class="input-field p-2 text-sm" required min="0" step="0.01">
                    <input type="number" value="${asset.annualYieldPct}" placeholder="Annual Yield %" id="edit-yield" class="input-field p-2 text-sm" required min="0" step="0.01">
            `;

            // Function to dynamically set broker value (runs once form is injected)
            setTimeout(() => {
                const brokerSelect = document.getElementById('edit-broker-select');
                const manualInput = document.getElementById('broker-manual-input-financial');
                const assetBroker = asset.broker || ''; // Get current saved broker

                if (brokerSelect) {
                    // Try to find the broker in the standard list
                    if ([...brokerSelect.options].some(opt => opt.value === assetBroker)) {
                        brokerSelect.value = assetBroker;
                        toggleManualBrokerInput(assetBroker);
                    } else if (assetBroker) {
                        // If not found, select "Other" and populate manual input
                        brokerSelect.value = 'Other';
                        toggleManualBrokerInput('Other');
                        if (manualInput) manualInput.value = assetBroker;
                    }
                }
            }, 0);


            submitHandler = `(async () => {
                const selectedBroker = document.getElementById('edit-broker-select').value;
                let finalBroker = selectedBroker;
                const manualInput = document.getElementById('broker-manual-input-financial');
                
                if (selectedBroker === 'Other' && manualInput) {
                    finalBroker = manualInput.value;
                    if (!finalBroker) {
                        return window.showMessage("Broker name is required for 'Other'.", true);
                    }
                }
                
                await saveFinancialAsset({
                    _id: '${id}',
                    broker: finalBroker, 
                    ticker: document.getElementById('edit-ticker').value,
                    shares: parseFloat(document.getElementById('edit-shares').value),
                    annualYieldPct: parseFloat(document.getElementById('edit-yield').value)
                });
            })()`;
        }


    } else if (type === 'property') {
        color = 'tmt-primary';
        formHtml = `
            <h4 class="text-lg font-semibold text-${color}">Edit Property Asset</h4>
            <form id="edit-property-form" class="space-y-2">
                <input type="text" value="${asset.nickname}" placeholder="Nickname" id="edit-nickname" class="input-field p-2 text-sm" required>
                <div class="grid grid-cols-2 gap-4">
                    <input type="number" value="${asset.marketValue}" placeholder="Market Value ($)" id="edit-market-value" class="input-field p-2 text-sm" required min="0">
                    <input type="number" value="${asset.loanBalance}" placeholder="Loan Balance ($)" id="edit-loan-balance" class="input-field p-2 text-sm" required min="0">
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <input type="number" value="${asset.rentalIncome}" placeholder="Monthly Rent" id="edit-rental-income" class="input-field p-2 text-sm" required min="0">
                    <input type="number" value="${asset.loanPayment}" placeholder="Monthly Loan Pmt" id="edit-loan-payment" class="input-field p-2 text-sm" required min="0">
                </div>
                <input type="number" value="${asset.yearsRemaining}" placeholder="Loan Years Remaining" id="edit-years-remaining" class="input-field p-2 text-sm" required min="0">
        `;
        submitHandler = `savePropertyAsset({
            _id: '${id}',
            nickname: document.getElementById('edit-nickname').value,
            marketValue: parseFloat(document.getElementById('edit-market-value').value),
            loanBalance: parseFloat(document.getElementById('edit-loan-balance').value),
            rentalIncome: parseFloat(document.getElementById('edit-rental-income').value),
            loanPayment: parseFloat(document.getElementById('edit-loan-payment').value),
            yearsRemaining: parseFloat(document.getElementById('edit-years-remaining').value)
        });`;

    } else if (type === 'business') {
        color = 'blue-500';
        formHtml = `
            <h4 class="text-lg font-semibold text-${color}">Edit Business/Income Stream</h4>
            <form id="edit-business-form" class="space-y-2">
                <input type="text" value="${asset.nickname}" placeholder="Nickname" id="edit-nickname" class="input-field p-2 text-sm" required>
                <input type="number" value="${asset.currentValuation}" placeholder="Current Valuation ($)" id="edit-current-valuation" class="input-field p-2 text-sm" min="0">
                <input type="number" value="${asset.monthlyProfit}" placeholder="Monthly Profit/Income ($)" id="edit-monthly-profit" class="input-field p-2 text-sm" required min="0">
        `;
        submitHandler = `saveBusinessAsset({
            _id: '${id}',
            nickname: document.getElementById('edit-nickname').value,
            currentValuation: parseFloat(document.getElementById('edit-current-valuation').value || 0),
            monthlyProfit: parseFloat(document.getElementById('edit-monthly-profit').value)
        });`;
    }

    const editContainer = document.createElement('div');
    editContainer.className = 'p-4 bg-gray-700 rounded-lg space-y-3 mb-4 edit-form-container';
    editContainer.innerHTML = formHtml + `
        <div class="flex space-x-2 pt-2">
            <button type="submit" onclick="${submitHandler}" class="flex-1 bg-${color} text-tmt-bg font-bold py-2 rounded-lg text-sm hover:bg-blue-400 transition duration-200">Save Changes</button>
            <button type="button" onclick="cancelEdit()" class="flex-1 bg-gray-500 text-white py-2 rounded-lg text-sm hover:bg-gray-400 transition duration-200">Cancel</button>
        </div>
    </form>`;

    // Store the original row's HTML temporarily before replacement
    currentAssetRow.setAttribute('data-original-html', currentAssetRow.outerHTML);
    
    // Replace the row with the edit form
    currentAssetRow.parentNode.replaceChild(editContainer, currentAssetRow);
}

/**
 * Cancels the edit process and restores the original asset row.
 */
function cancelEdit() {
    const editContainer = document.querySelector('.edit-form-container');
    if (editContainer) {
        const parent = editContainer.parentNode;
        const originalHtml = editContainer.getAttribute('data-original-html');
        
        if (originalHtml) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = originalHtml;
            const originalRow = tempDiv.firstChild;
            
            parent.replaceChild(originalRow, editContainer);
        } else {
             editContainer.remove();
             fetchDashboardData();
        }
    }
}


async function deleteAsset(type, id) {
    const showMessage = window.showMessage || console.log;
    if (!confirm(`Are you sure you want to delete this ${type} asset?`)) return;

    try {
        const token = localStorage.getItem('tmt_auth_token');
        const response = await fetch(`/api/retirement/assets/${type}/delete/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        
        if (result.success) {
            showMessage(`Asset deleted. Recalculating dashboard...`, false);
            await fetchDashboardData();
        } else {
            showMessage(result.message || "Failed to delete asset.", true);
        }
    } catch (error) {
        showMessage("Network error during deletion.", true);
    }
}