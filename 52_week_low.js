// 52_week_low.js
// Logic for fetching and displaying the 52-week low stock list.

let allStocks = []; // To store the master list of stocks
let sectorFilter; 
let searchFilter; 
let tableBody; 
let filterControls; 
let filterToggleBtn; 

// *** NEW: LOCAL STORAGE KEY ***
const CLIENT_CACHE_KEY_52WK = 'tmt_52wk_client_cache';

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Element References (MUST be inside DOMContentLoaded) ---
    sectorFilter = document.getElementById('sector-filter');
    searchFilter = document.getElementById('search-filter');
    tableBody = document.getElementById('stock-list-body');
    // References for the filter toggle functionality
    filterControls = document.getElementById('filter-controls'); 
    filterToggleBtn = document.getElementById('toggle-filter-btn'); 


    // --- 2. Critical Element Check ---
    if (!sectorFilter || !searchFilter || !tableBody || !filterControls || !filterToggleBtn) {
        console.error("CRITICAL ERROR: One or more required page elements (filters, table body, or toggle button) are missing. Check HTML IDs.");
        if (tableBody) {
             tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-red-400">Initialization Error. Please check application logs and ensure all required elements exist.</td></tr>`;
        }
        return; 
    }

    // --- 3. Add Filter Toggle Logic (FIXES Button Issue) ---
    filterToggleBtn.addEventListener('click', () => {
        filterControls.classList.toggle('hidden');
    });

    // --- 4. Load Data and Add Filter Listeners ---
    load52WeekLowData();
    sectorFilter.addEventListener('input', filterAndRender);
    searchFilter.addEventListener('input', filterAndRender);
});


/**
 * Fetches the list of stocks near 52-week low from the backend and renders it.
 * Implements client-side caching (stale data load) for instant loading.
 */
async function load52WeekLowData() {
    // Check for auth token (required by the new endpoint)
    const token = localStorage.getItem('tmt_auth_token');
    if (!token) {
        // ... (Auth check and redirection logic remains unchanged)
        if (typeof showMessage === 'function') {
            showMessage("Please log in to view this content.", true);
        }
        tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-red-400">Access Denied. Please log in. Redirecting...</td></tr>`;
        setTimeout(() => {
            if (typeof checkAccessAndRedirect === 'function') {
                checkAccessAndRedirect('52_week_low.html');
            } else {
                window.location.href = 'auth.html?mode=login';
            }
        }, 2000);
        return;
    }

    // *** NEW: 1. Check client-side cache and render immediately (Stale Data Load) ***
    let cachedData = null;
    try {
        const storedData = localStorage.getItem(CLIENT_CACHE_KEY_52WK);
        if (storedData) {
            cachedData = JSON.parse(storedData);
            renderTable(cachedData);
            console.log("52 Week Low: Rendered stale data from client cache.");
        } else {
             // Only show 'Loading fresh data' if no cache available
             tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-gray-500">Loading fresh data...</td></tr>`;
        }
    } catch (e) {
        console.error("Failed to parse client cache:", e);
        localStorage.removeItem(CLIENT_CACHE_KEY_52WK); // Clear bad cache
    }
    // *** END NEW ***

    try {
        // This endpoint will now pull the list of tickers from the server-side cache.
        const response = await fetch('/api/tmt/52-week-low', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || `Error fetching data: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.success && Array.isArray(result.data)) {
            allStocks = result.data; // Store the master list
            
            // *** NEW: 2. Save fresh data to client cache ***
            localStorage.setItem(CLIENT_CACHE_KEY_52WK, JSON.stringify(allStocks));
            
            // 3. Render fresh data (will overwrite stale data if present, or replace loading message)
            renderTable(allStocks); 
            
        } else {
            throw new Error(result.message || "Failed to load stock data.");
        }

    } catch (error) {
        console.error("Failed to load 52-week low data:", error);
        // Only show fatal error if no cache was available
        if (!cachedData) {
            tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-red-400">Error: ${error.message}. (API key issue or no stocks near low)</td></tr>`;
            if (typeof showMessage === 'function') {
                showMessage(error.message, true);
            }
        } else {
             // If cache was present but fetch failed, show a subtle warning
            console.warn("Using stale cache due to failed fresh data fetch.");
        }
    }
}


/**
 * Applies filters to the master list and re-renders the table.
 */
function filterAndRender() {
    const sectorQuery = sectorFilter.value.toLowerCase();
    const searchQuery = searchFilter.value.toLowerCase();

    const filteredStocks = allStocks.filter(stock => {
        // Filter by Sector
        const matchesSector = stock.sector?.toLowerCase().includes(sectorQuery) ?? true;
        
        // Filter by Search (Ticker or Name)
        const matchesSearch = (stock.ticker?.toLowerCase().includes(searchQuery) ?? false) || 
                              (stock.name?.toLowerCase().includes(searchQuery) ?? false);
        
        // This page only shows stocks near 52Wk low, so no explicit rank filtering needed here.
        
        return matchesSector && matchesSearch;
    });

    renderTable(filteredStocks);
}

/**
 * Renders a list of stocks into the table body.
 * @param {Array} stocks - The array of stock objects to render.
 */
function renderTable(stocks) {
    // Clear current table content
    tableBody.innerHTML = '';

    if (!stocks || stocks.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-gray-500">No stocks found matching your criteria.</td></tr>`;
        return;
    }

    // Create and append a row for each stock
    stocks.forEach(stock => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-800 transition duration-150 cursor-pointer';
        // Make row clickable to go to dashboard
        row.onclick = () => {
            if (typeof checkAccessAndRedirect === 'function') {
                checkAccessAndRedirect(`stock_dashboard.html?ticker=${stock.ticker}`);
            } else {
                window.location.href = `stock_dashboard.html?ticker=${stock.ticker}`;
            }
        };

        // Determine price color based on proximity (closer to low is greener, farther is redder)
        const proximity = parseFloat(stock.proximityPct);
        let proximityColorClass = 'text-white';
        let proximityText = stock.proximityPct ? `${stock.proximityPct}%` : 'N/A';
        
        if (!isNaN(proximity)) {
             if (proximity <= 0.00) { // Below or exactly at 52-week low
                 proximityColorClass = 'text-green-500 font-bold';
             } else if (proximity <= 2.00) { // Within 2%
                 proximityColorClass = 'text-tmt-primary';
             } else if (proximity <= 5.00) { // Within 5%
                 proximityColorClass = 'text-yellow-400';
             } else {
                 proximityColorClass = 'text-red-400'; // Further away
             }
        } else {
             proximityText = 'N/A';
        }


        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-tmt-primary">${stock.ticker}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">${stock.name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">${stock.sector || 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-white text-right">$${stock.currentPrice}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300 text-right">$${stock.low52}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm ${proximityColorClass} text-right font-medium">${proximityText}</td>
        `;
        tableBody.appendChild(row);
    });
}