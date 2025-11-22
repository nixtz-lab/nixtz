// stock_valuation.js - FINAL SECURE VERSION (Calls Server Proxy)

// ====================================================================
// === 1. API & GLOBAL CONFIGURATION =================================
// ====================================================================

// NOTE: All API calls are now proxied through the server.
// Client-side API keys have been removed for security.

// Global state to store data for calculations
let currentTicker = 'AAPL';
let currentFinancials = {
    currentRevenueB: null,
    currentEarningsB: null,
    currentMarketCapB: null,
    currentPrice: null
};

// ====================================================================
// === 2. CORE LOGIC & EVENT LISTENERS ===============================
// ====================================================================

/**
 * Runs when the page is fully loaded.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Load Tailwind CSS script
    const tailwindScript = document.createElement('script');
    tailwindScript.src = "https://cdn.tailwindcss.com";
    document.head.appendChild(tailwindScript);

    // Dynamic styles and HTML structure (for future reference, if this was a single HTML file)
    // NOTE: Since this is a .js file, we assume the HTML structure already exists and loads Tailwind.

    const urlParams = new URLSearchParams(window.location.search);
    const initialTicker = (urlParams.get('ticker') || 'AAPL').toUpperCase();

    // Load the data for the initial ticker
    loadValuationData(initialTicker);

    // --- MODIFICATION START ---

    // OLD Enter key listener (REMOVED)
    // document.getElementById('ticker-search').addEventListener('keypress', ...);
    
    // NEW: Add submit listener for the new mobile form
    // We use optional chaining (?) in case the element doesn't exist
    document.getElementById('mobile-search-form')?.addEventListener('submit', function(e) {
        e.preventDefault();
        searchStock(); // Calls the new, robust searchStock function
    });

    // NEW: Add keyup listener for mobile suggestions
    document.getElementById('stock-search-input-mobile')?.addEventListener('keyup', (e) => handleSearchInput(e, 'mobile-search-suggestions'));
    
    // NEW: Global click listener to hide suggestions when clicking outside
    document.addEventListener('click', (event) => {
        // Check if the click was outside any search container
        const isOutside = !event.target.closest('.search-container');
        if (isOutside) {
            document.querySelectorAll('.search-suggestions').forEach(s => s.classList.add('hidden'));
        }
    });

    // --- MODIFICATION END ---


    // Make functions globally accessible for HTML onclick attributes
    window.searchStock = searchStock;
    window.calculateValuation = calculateValuation;
    window.buttonAction = buttonAction;
    window.handleSearchInput = handleSearchInput; // NEW
    window.selectSuggestion = selectSuggestion; // NEW

    // FIX: Update header text for clarity and consistency (Use Avg (5Y) -> Use Avg (5Yr))
    const avg5yHeader = document.getElementById('avg-5y-header');
    if (avg5yHeader) {
        avg5yHeader.textContent = 'Use Avg (5Yr)';
    }
    
    // FIX MOBILE LAYOUT: Removed ineffective JS logic to hide 'Select' text.
    // The text 'Select' is now removed directly in the HTML file for better mobile spacing.

});

/**
 * Main function to load all data for the valuation page.
 */
async function loadValuationData(ticker) {
    const requestedTicker = ticker.toUpperCase();

    // Set Loading State
    document.getElementById('page-title').textContent = `Loading ${requestedTicker}... | TMT`;
    document.getElementById('stock-ticker').textContent = requestedTicker;
    document.getElementById('stock-company').textContent = "Loading financial data...";
    document.getElementById('current-price').textContent = "...";
    document.getElementById('valuation-results-container').classList.add('hidden');

    // Calls your server routes for BOTH snapshot and historicals
    const [snapshot, historicals] = await Promise.all([
        fetchSnapshotData(requestedTicker), // Calls the NEW dedicated valuation snapshot route
        fetchHistoricalAverages(requestedTicker) // Calls /api/stock/valuation/:ticker (SimFin) - CORRECT ROUTE FOR HISTORICALS
    ]);

    if (!snapshot || !historicals) {
        buttonAction('error', `Failed to load all data for ${requestedTicker}. Please try again.`);
        document.getElementById('stock-company').textContent = `Failed to load data for ${requestedTicker}.`;
        return;
    }

    // --- Success! Store data and populate UI ---
    currentTicker = requestedTicker;

    currentFinancials = {
        ...snapshot.financials,
        currentPrice: snapshot.currentPrice
    };

    // 1. Update Header Info
    document.getElementById('page-title').textContent = `${currentTicker} Valuation | TMT`;
    document.getElementById('stock-company').textContent = snapshot.companyName;
    document.getElementById('current-price').textContent = snapshot.currentPrice ? `$${formatNumber(snapshot.currentPrice)}` : "N/A";
    
    // --- === FIX 1: Use the correct ID 'stock-search-input' from the new header === ---
    const headerSearchInput = document.getElementById('stock-search-input');
    if (headerSearchInput) {
        headerSearchInput.value = currentTicker;
    }
    
    // ALSO update the mobile search input value
    const mobileInput = document.getElementById('stock-search-input-mobile');
    if (mobileInput) mobileInput.value = currentTicker;


    // 2. Populate Historical Metrics Table
    const formatPct = (val, decimals = 2) => (val !== "N/A" && isNumber(parseFloat(val))) ? `${parseFloat(val).toFixed(decimals)}%` : "N/A";
    const formatNum = (val, decimals = 2) => (val !== "N/A" && isNumber(parseFloat(val))) ? `${parseFloat(val).toFixed(decimals)}` : "N/A";

    // Calculate P/E 5Y Average
    const avgEps5YrNum = parseFloat(String(historicals.avgEps5Yr).replace('$', ''));
    const pe5YAvg = (isNumber(snapshot.currentPrice) && isNumber(avgEps5YrNum) && avgEps5YrNum !== 0)
                    ? (snapshot.currentPrice / avgEps5YrNum) : null;

    // Calculate P/E 3Y Average using the new backend metric
    const avgEps3YrNum = parseFloat(String(historicals.avgEps3Yr).replace('$', ''));
    const pe3YAvg = (isNumber(snapshot.currentPrice) && isNumber(avgEps3YrNum) && avgEps3YrNum !== 0)
                    ? (snapshot.currentPrice / avgEps3YrNum) : null;


    // --- Data Mapping from Server Response ---

    // Helper: Gets value for a column, falling back to TTM if necessary
    const getHistoricalValue = (historicalValue, ttmValue) => historicalValue !== "N/A" ? historicalValue : ttmValue;

    // Helper: Gets value for 5Yr column, falling back to 3Yr column content if 5Yr is missing
    const getRobust5YrValue = (historical5YrValue, fallback3YrElementId) => {
        if (historical5YrValue !== "N/A") return historical5YrValue;
        
        const fallbackEl = document.getElementById(fallback3YrElementId);
        if (fallbackEl) return fallbackEl.textContent;
        return "N/A"; // Final fallback
    };


    // Revenue Growth
    const revGrowth3YrRobust = getHistoricalValue(historicals.compoundRevenueGrowth3Yr, snapshot.historical_TTM.revGrowth);
    document.getElementById('historical-revGrowth-current').textContent = formatPct(snapshot.historical_TTM.revGrowth);
    document.getElementById('historical-revGrowth-3yr').textContent = formatPct(revGrowth3YrRobust);
    document.getElementById('historical-revGrowth-5yr').textContent = getRobust5YrValue(historicals.compoundRevenueGrowth5Yr, 'historical-revGrowth-3yr');


    // Earning Growth
    const earnGrowth3YrRobust = getHistoricalValue(historicals.compoundEarningGrowth3Yr, snapshot.historical_TTM.earningsGrowth);
    document.getElementById('historical-earningsGrowth-current').textContent = formatPct(snapshot.historical_TTM.earningsGrowth);
    document.getElementById('historical-earningsGrowth-3yr').textContent = formatPct(earnGrowth3YrRobust);
    document.getElementById('historical-earningsGrowth-5yr').textContent = getRobust5YrValue(historicals.compoundEarningGrowth5Yr, 'historical-earningsGrowth-3yr');


    // Net Earning Margin (Profit Margin)
    // Use the 3Yr Avg Profit Margin from server as the 3Yr value.
    const netMargin3YrRobust = getHistoricalValue(historicals.avgProfitMargin3Yr || historicals.avgProfitMargin5Yr, snapshot.historical_TTM.profitMargin);
    document.getElementById('historical-profitMargin-current').textContent = formatPct(snapshot.historical_TTM.profitMargin);
    document.getElementById('historical-profitMargin-3yr').textContent = formatPct(netMargin3YrRobust);
    // Map 5Yr Avg Margin from server, falling back to the now-robust 3Yr column.
    document.getElementById('historical-profitMargin-5yr').textContent = getRobust5YrValue(historicals.avgProfitMargin5Yr, 'historical-profitMargin-3yr');


    // ROIC (ROI %)
    // FIX: Ensure ROIC values are mapped correctly from the server response
    document.getElementById('historical-roic-current').textContent = formatPct(snapshot.historical_TTM.roic);
    document.getElementById('historical-roic-3yr').textContent = historicals.avgROIC3Yr !== "N/A" ? historicals.avgROIC3Yr : "N/A"; // Use string from server (e.g., "33.28%")
    document.getElementById('historical-roic-5yr').textContent = historicals.avgROIC5Yr !== "N/A" ? historicals.avgROIC5Yr : "N/A"; // Use string from server (e.g., "35.88%")


    // Terminal P/E (MCap/Earning Multiple)
    // Use the calculated 3Y P/E (from 3Y Avg EPS), falling back to 5Y P/E, then TTM.
    const pe3YrRobust = pe3YAvg !== null ? pe3YAvg : (pe5YAvg !== null ? pe5YAvg : snapshot.historical_TTM.pe);
    document.getElementById('historical-pe-current').textContent = formatNum(snapshot.historical_TTM.pe);
    document.getElementById('historical-pe-3yrAvg').textContent = formatNum(pe3YrRobust); // Uses distinct 3Y Avg PE
    // Ensure 5Yr Avg P/E is correctly formatted and robustly pulled, rounded to 2 decimals.
    document.getElementById('historical-pe-5yrAvg').textContent = getRobust5YrValue(
        pe5YAvg !== null ? formatNum(pe5YAvg) : "N/A", // Applies formatNum (2 decimal places)
        'historical-pe-3yrAvg'
    );


    // Expected Annual Return % (Placeholder)
    // --- FIX: Change 'N/A' placeholder to be blank ("") ---
    document.getElementById('historical-annReturn-current').textContent = "";
    document.getElementById('historical-annReturn-3yr').textContent = "";
    document.getElementById('historical-annReturn-5yr').textContent = "";
    // ----------------------------------------------------

    // 3. Set default assumptions
    // Map assumption values to the 5Yr column data.
    const defaultRevGrowth = parseFloat(document.getElementById('historical-revGrowth-5yr').textContent) || 5.0; // PULL FROM 5YR COLUMN
    const defaultEarningGrowth = parseFloat(document.getElementById('historical-earningsGrowth-5yr').textContent) || 7.0; // PULL FROM 5YR COLUMN
    const defaultMargin = parseFloat(document.getElementById('historical-profitMargin-5yr').textContent) || 20.0; // PULL FROM 5YR COLUMN
    const defaultPE = parseFloat(document.getElementById('historical-pe-5yrAvg').textContent) || 20; // PULL FROM 5YR COLUMN
    const defaultReturn = 10.0;
    
    // FIX: Set P/E My Assumption default to 15
    const myReturn = 9.0;
    const myPE = 15.0; 

    // Assumption: Use Avg (5Yr) column
    document.getElementById('assumption-rev-avg').value = defaultRevGrowth.toFixed(2);
    document.getElementById('assumption-earnings-avg').value = defaultEarningGrowth.toFixed(2);
    document.getElementById('assumption-margin-avg').value = defaultMargin.toFixed(2);
    document.getElementById('assumption-pe-avg').value = defaultPE.toFixed(2);
    document.getElementById('assumption-return-avg').value = defaultReturn.toFixed(2);

    // Assumption: My Assumption column
    document.getElementById('assumption-rev-my').value = defaultRevGrowth.toFixed(2);
    document.getElementById('assumption-earnings-my').value = defaultEarningGrowth.toFixed(2);
    document.getElementById('assumption-margin-my').value = defaultMargin.toFixed(2);
    document.getElementById('assumption-pe-my').value = myPE.toFixed(2); // <-- FIXED TO 15.00
    document.getElementById('assumption-return-my').value = myReturn.toFixed(2);

    // Set radio buttons to default (as per original HTML)
    // NOTE: This logic uses '5y' for the IDs, which we assume exists in the HTML.
    document.getElementById('rev-use-my').checked = true;
    document.getElementById('earning-use-my').checked = false;
    document.getElementById('margin-use-my').checked = true;
    document.getElementById('pe-use-my').checked = true;
    document.getElementById('return-use-my').checked = true;
}

// ====================================================================
// === 3. DATA FETCHING FUNCTIONS (UPDATED) =========================
// ====================================================================

/**
 * Fetches historical averages *specifically calculated for valuation* from our backend server.
 */
async function fetchHistoricalAverages(ticker) {
    try {
        // *** IMPORTANT: Calls the DEDICATED SimFin valuation route ***
        const response = await fetch(`/api/stock/valuation/${ticker}`);
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || `Backend valuation API error! Status: ${response.status}`);
        }
        const result = await response.json();
        if (result.success && result.data) {
            console.log("Fetched Valuation Metrics:", result.data);
            return result.data;
        }
        throw new Error(result.message || "Failed to parse valuation historicals.");
    } catch (error) {
        console.error("Error fetching valuation historical averages:", error.message);
        buttonAction('error', `Could not load historical valuation data for ${ticker}.`);
        return null;
    }
}


/**
 * Fetches snapshot data from our *own* backend proxy.
 */
async function fetchSnapshotData(ticker) {
    // Calls the dedicated valuation snapshot route
    const url = `/api/stock-valuation-snapshot/${ticker}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || `Backend snapshot error! Status: ${response.status}`);
        }

        const result = await response.json();
        if (result.success && result.data) {
            console.log("Fetched Snapshot (from server proxy):", result.data);
            return result.data;
        }
        throw new Error(result.message || "Failed to parse snapshot data from backend.");

    } catch (error) {
        console.error(`Error fetching snapshot data for ${ticker}:`, error.message);
        buttonAction('error', `Could not load snapshot data for ${ticker}.`);
        return null; // Return null on error
    }
}

// --- START: ADDED TICKER SEARCH SUGGESTION FUNCTIONS (from stock_dashboard.js) ---

/**
 * Fetches ticker suggestions from the backend API.
 */
async function fetchRealSuggestions(query) {
    if (!query || query.length < 1) return []; // Basic validation

    try {
        // This API_BASE_URL is defined in script.js, but we can use a relative path
        const response = await fetch(`/api/search-tickers?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error(`Search API failed: ${response.status}`);
        const result = await response.json();

        if (result.success && Array.isArray(result.data)) {
            return result.data.map(item => ({ ticker: item.ticker, text: `${item.ticker} - ${item.name}` }));
        }
        console.warn("Search suggestions API returned success=false or invalid data.");
        return [];
    } catch (error) {
        console.error("Error fetching real suggestions:", error);
        return [];
    }
}

/**
 * Handles user input in a search box to show suggestions.
 */
function handleSearchInput(event, suggestionsId) {
    const inputElement = event.target;
    const query = inputElement.value.trim();
    const suggestionsContainer = document.getElementById(suggestionsId);
    if (!suggestionsContainer) return; // Exit if container doesn't exist

    // If Enter key pressed, let the form submit handle it (hide suggestions)
    if (event.key === 'Enter' && query) {
        suggestionsContainer.classList.add('hidden');
        return;
    }

    // Hide suggestions if query is empty
    if (!query) {
        suggestionsContainer.classList.add('hidden');
        suggestionsContainer.innerHTML = '';
        return;
    }

    // Debounce the API call
    clearTimeout(inputElement.suggestionTimeout);
    inputElement.suggestionTimeout = setTimeout(async () => {
        const suggestions = await fetchRealSuggestions(query);
        if (suggestions.length > 0) {
            suggestionsContainer.innerHTML = suggestions.map(suggestion =>
                // Use the custom selectSuggestion function for this page
                `<div class="suggestion-item" onclick="selectSuggestion('${suggestion.ticker}')">${suggestion.text}</div>`
            ).join('');
            suggestionsContainer.classList.remove('hidden'); // Show container
        } else {
            suggestionsContainer.classList.add('hidden'); // Hide if no suggestions
            suggestionsContainer.innerHTML = '';
        }
    }, 250); // 250ms debounce
}

/**
 * Handles selecting a suggestion from the dropdown.
 * CUSTOMIZED for stock_valuation.html: This reloads data, not navigates.
 */
function selectSuggestion(ticker) {
    const tickerUpper = ticker.toUpperCase();
    
    // Update the URL
    const url = new URL(window.location);
    url.searchParams.set('ticker', tickerUpper);
    window.history.pushState({}, '', url); 

    // Load the data for the selected ticker
    loadValuationData(tickerUpper); 

    // Hide all suggestion dropdowns
    document.querySelectorAll('.search-suggestions').forEach(s => s.classList.add('hidden'));
}

// --- END: ADDED TICKER SEARCH SUGGESTION FUNCTIONS ---


// ====================================================================
// === 4. CALCULATION & UI FUNCTIONS (UNCHANGED) =====================
// ====================================================================

/**
 * Main calculation logic.
 */
function calculateValuation() {
    const financials = currentFinancials;
    if (!financials || !isNumber(financials.currentPrice) || !isNumber(financials.currentEarningsB) || !isNumber(financials.currentRevenueB) || !isNumber(financials.currentMarketCapB)) {
        buttonAction('error', 'Missing critical financial data. Please re-load the ticker.');
        return;
    }
    const currentPrice = financials.currentPrice;
    const years = 5;

    let revGrowthValue, netMarginValue, terminalPEValue, desiredReturnValue, earningGrowthValue;
    let isEarningGrowthSelected = false;

    // 1. Determine which assumption to use for each metric

    // Revenue Growth
    if (document.getElementById('rev-use-5y').checked) { // Corresponds to 'assumption-rev-avg' input
        revGrowthValue = parseFloat(document.getElementById('assumption-rev-avg').value);
    } else { // Corresponds to 'assumption-rev-my' input
        revGrowthValue = parseFloat(document.getElementById('assumption-rev-my').value);
    }

    // Earning Growth (Check if selected to override Revenue/Margin)
    if (document.getElementById('earning-use-5y').checked) { // Corresponds to 'assumption-earnings-avg' input
        earningGrowthValue = parseFloat(document.getElementById('assumption-earnings-avg').value);
        isEarningGrowthSelected = true;
    } else if (document.getElementById('earning-use-my').checked) { // Corresponds to 'assumption-earnings-my' input
        earningGrowthValue = parseFloat(document.getElementById('assumption-earnings-my').value);
        isEarningGrowthSelected = true;
    }

    // Net Margin
    if (document.getElementById('margin-use-5y').checked) { // Corresponds to 'assumption-margin-avg' input
        netMarginValue = parseFloat(document.getElementById('assumption-margin-avg').value);
    } else { // Corresponds to 'assumption-margin-my' input
        netMarginValue = parseFloat(document.getElementById('assumption-margin-my').value);
    }

    // Terminal P/E
    if (document.getElementById('pe-use-5y').checked) { // Corresponds to 'assumption-pe-avg' input
        terminalPEValue = parseFloat(document.getElementById('assumption-pe-avg').value);
    } else { // Corresponds to 'assumption-pe-my' input
        terminalPEValue = parseFloat(document.getElementById('assumption-pe-my').value);
    }

    // Expected Annual Return (Discount Rate)
    if (document.getElementById('return-use-5y').checked) { // Corresponds to 'assumption-return-avg' input
        desiredReturnValue = parseFloat(document.getElementById('assumption-return-avg').value);
    } else { // Corresponds to 'assumption-return-my' input
        desiredReturnValue = parseFloat(document.getElementById('assumption-return-my').value);
    }

    // 2. Convert rates to calculation values
    const revGrowth = revGrowthValue / 100;
    const netMargin = netMarginValue / 100;
    const earningGrowth = earningGrowthValue / 100; // Only used if isEarningGrowthSelected is true
    const terminalPE = terminalPEValue;
    const desiredReturn = desiredReturnValue / 100;

    // 3. Check for invalid inputs
    if (isNaN(revGrowth) || isNaN(netMargin) || isNaN(terminalPE) || isNaN(desiredReturn) || (isEarningGrowthSelected && isNaN(earningGrowth))) {
        buttonAction('error', 'Please ensure all assumptions are valid numbers.');
        return;
    }

    let estRevenue5Yr, estEarnings5Yr;

    // --- 4. Calculate Estimated Future Metrics (5 Years) ---
    if (isEarningGrowthSelected) {
        // If Earning Growth is explicitly selected, use it directly
        estEarnings5Yr = financials.currentEarningsB * Math.pow((1 + earningGrowth), years);
        // Still calculate revenue for display, using the selected revenue growth assumption
        estRevenue5Yr = financials.currentRevenueB * Math.pow((1 + revGrowth), years);

    } else {
        // If Earning Growth is NOT selected, calculate earnings based on revenue and margin assumptions
        estRevenue5Yr = financials.currentRevenueB * Math.pow((1 + revGrowth), years);
        estEarnings5Yr = estRevenue5Yr * netMargin;
    }

    // --- 5. Calculate Estimated Future Market Cap ---
    const estMarketCap5Yr = estEarnings5Yr * terminalPE;

    // --- 6. Calculate Target Price in 5 Years ---
    // Handle potential division by zero if currentMarketCapB is 0 or null
    const targetPrice5Yr = (financials.currentMarketCapB && financials.currentMarketCapB !== 0)
                            ? (estMarketCap5Yr / financials.currentMarketCapB) * currentPrice
                            : 0; // Or handle as an error/N/A

    // --- 7. Calculate Target Price Now (Discounted back 5 years) ---
    const targetPriceNow = targetPrice5Yr / Math.pow((1 + desiredReturn), years);

    // --- 8. Calculate Upside ---
    // Handle potential division by zero if currentPrice is 0 or null
    const upsidePercent = (currentPrice && currentPrice !== 0)
                            ? ((targetPriceNow / currentPrice) - 1) * 100
                            : 0; // Or handle as an error/N/A

    // --- 9. Calculate Avg Yearly Return ---
    // Handle cases where currentPrice is 0 or null, or targetPrice5Yr is negative
    let avgYearlyReturn = 0; // Default
    if (currentPrice && currentPrice > 0 && targetPrice5Yr >= 0) {
       avgYearlyReturn = (Math.pow(targetPrice5Yr / currentPrice, 1/years) - 1) * 100;
    } else if (currentPrice && currentPrice > 0 && targetPrice5Yr < 0) {
        // Handle negative future price scenario if needed (e.g., loss)
        avgYearlyReturn = -100; // Example: Represent total loss
    } // Otherwise stays 0 or could be 'N/A'


    // --- 10. Display Results ---
    const upsideClass = upsidePercent > 0 ? 'text-green-400' : 'text-red-400';
    const returnClass = avgYearlyReturn > (desiredReturn * 100) ? 'text-green-400' : 'text-red-400';
    
    // NEW FIX: Determine color class for Target Price Now
    const targetPriceClass = targetPriceNow > currentPrice ? 'text-green-400' : 'text-red-400';

    const currentPriceFormatted = formatNumber(currentPrice);

    document.getElementById('result-estRevenue5Yr').textContent = `$${formatNumber(estRevenue5Yr)}B`;
    document.getElementById('result-estEarnings5Yr').textContent = `$${formatNumber(estEarnings5Yr)}B`;
    document.getElementById('result-estMarketCap5Yr').textContent = `$${formatNumber(estMarketCap5Yr)}B`;
    document.getElementById('result-targetPrice5Yr').textContent = `$${formatNumber(targetPrice5Yr)}`;
    
    // Apply the new dynamic color class to Target Price Now
    document.getElementById('result-targetPriceNow').textContent = `$${formatNumber(targetPriceNow)}`;
    document.getElementById('result-targetPriceNow').className = `text-3xl font-extrabold ${targetPriceClass}`;

    document.getElementById('result-currentPrice').textContent = `$${currentPriceFormatted}`; // Already formatted
    document.getElementById('result-avgYearlyReturn').textContent = `${formatNumber(avgYearlyReturn)}%`;
    document.getElementById('result-avgYearlyReturn').className = `text-base font-semibold ${returnClass}`;
    document.getElementById('result-upsidePercent').textContent = `${formatNumber(upsidePercent)}%`;
    document.getElementById('result-upsidePercent').className = `text-lg font-bold ${upsideClass}`;
    document.getElementById('discount-rate-display').textContent = `${formatNumber(desiredReturnValue)}%`;

    // Show the results section
    document.getElementById('valuation-results-container').classList.remove('hidden');

    buttonAction('calculated');
}


/**
 * Function triggered by the search button
 * --- MODIFIED ---
 * Now checks both header and mobile inputs.
 */
function searchStock(event) {
    if (event) event.preventDefault(); // Prevent form submission

    // --- === FIX 2: This function is ONLY for the mobile form. === ---
    // The main header form is handled by script.js
    
    const mobileInput = document.getElementById('stock-search-input-mobile');
    let ticker = '';

    if (mobileInput && mobileInput.offsetParent !== null && mobileInput.value.trim()) {
        // Use offsetParent check to see if it's visible (not hidden by md:hidden)
        ticker = mobileInput.value.trim().toUpperCase();
    }

    // Hide suggestion dropdowns
    document.querySelectorAll('.search-suggestions').forEach(s => s.classList.add('hidden'));

    if (ticker) {
        const url = new URL(window.location);
        url.searchParams.set('ticker', ticker);
        window.history.pushState({}, '', url); // Update URL without reloading

        loadValuationData(ticker); // Reload data for the new ticker
    } else {
        buttonAction('error', 'Please enter a stock ticker.');
    }
}

// ====================================================================
// === 5. UTILITY FUNCTIONS (UNCHANGED) ==============================
// ====================================================================

const isNumber = (val) => typeof val === 'number' && !isNaN(val);

const formatNumber = (num, decimals = 2) => {
    if (!isNumber(num)) return "N/A";
    // Use toLocaleString for formatting, handles large numbers and decimals
    return num.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
};


function buttonAction(type, messageOverride = null) {
     const messageBox = document.getElementById('message-box');
     const messageText = document.getElementById('message-text');
     if (!messageBox || !messageText) {
        console.error("Message box elements not found!");
        return;
     }

     let message;

     // Reset classes
     messageBox.classList.remove('hidden', 'opacity-0', 'bg-red-600', 'bg-tmt-secondary', 'bg-tmt-primary', 'text-tmt-bg', 'text-white');

     // Determine message and style based on type
     switch (type) {
         case 'calculated':
             message = "Valuation calculated successfully!";
             messageBox.classList.add('bg-tmt-primary', 'text-tmt-bg');
             break;
         case 'error':
             message = messageOverride || "An error occurred.";
             messageBox.classList.add('bg-red-600', 'text-white');
             break;
         case 'searched': // Although searchStock redirects, this might be useful elsewhere
             message = messageOverride || "Search successful.";
             messageBox.classList.add('bg-tmt-secondary', 'text-tmt-bg');
             break;
         default:
             message = messageOverride || "Action complete.";
             messageBox.classList.add('bg-tmt-primary', 'text-tmt-bg');
             break;
     }

     // Display the message
     messageText.textContent = message;
     messageBox.classList.remove('hidden');
     // Force reflow for transition
     void messageBox.offsetWidth;
     messageBox.classList.add('opacity-100');


     // Set timeout to hide the message
     // Clear any existing timeout to prevent overlaps if called rapidly
     if (messageBox.hideTimeout) clearTimeout(messageBox.hideTimeout);

     messageBox.hideTimeout = setTimeout(() => {
         messageBox.classList.remove('opacity-100');
         // Wait for fade-out transition to complete before adding 'hidden'
         setTimeout(() => {
             messageBox.classList.add('hidden');
         }, 300); // Should match transition duration
     }, 3000); // Display duration
}