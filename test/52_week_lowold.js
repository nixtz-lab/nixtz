// 52_week_low.js
// Logic for fetching and displaying the 52-week low stock list.

let allStocks = []; // To store the master list of stocks
let sectorFilter; 
let searchFilter; 
let tableBody; 
let filterControls; 
let filterToggleBtn; 


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

    // --- 4. Load Data and Add Filter Listeners (FIXES Loading Stuck Issue) ---
    load52WeekLowData();

    // Add event listeners for filters (Dropdown uses 'change', Search uses 'input')
    sectorFilter.addEventListener('change', filterAndRender); 
    searchFilter.addEventListener('input', filterAndRender);
});


/**
 * Fetches the 52-week low stock list from the server.
 */
async function load52WeekLowData() {
    // Check for auth token (required by the new endpoint)
    const token = localStorage.getItem('tmt_auth_token');
    if (!token) {
        // Use the global showMessage function from script.js
        if (typeof showMessage === 'function') {
            showMessage("Please log in to view this content.", true);
        }
        // Redirect to login/join page
        tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-red-400">Access Denied. Please log in. Redirecting...</td></tr>`;
        setTimeout(() => {
            if (typeof checkAccessAndRedirect === 'function') {
                checkAccessAndRedirect('52_week_low.html'); // This will trigger the auth flow
            } else {
                window.location.href = 'auth.html?mode=login';
            }
        }, 2000);
        return;
    }

    try {
        // This endpoint will now pull the list of tickers from the database.
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
            renderTable(allStocks); // Render the full list initially
        } else {
            throw new Error(result.message || "Failed to load stock data.");
        }

    } catch (error) {
        console.error("Failed to load 52-week low data:", error);
        tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-red-400">Error: ${error.message}. (API key issue or no stocks near low)</td></tr>`;
        if (typeof showMessage === 'function') {
            showMessage(error.message, true);
        }
    }
}

/**
 * Applies filters to the master list and re-renders the table.
 */
function filterAndRender() {
    // Read value from SELECT dropdown. If "All Sectors" is selected, sectorQuery will be an empty string.
    const sectorQuery = sectorFilter.value.toLowerCase();
    const searchQuery = searchFilter.value.toLowerCase();

    const filteredStocks = allStocks.filter(stock => {
        // Sector Filter: Check if the stock sector either contains the query (if query is not empty) 
        // OR if the sectorQuery is empty ("All Sectors")
        const matchesSector = !sectorQuery || (stock.sector?.toLowerCase().includes(sectorQuery) ?? false);
        
        const matchesSearch = (stock.ticker?.toLowerCase().includes(searchQuery) ?? false) || 
                              (stock.name?.toLowerCase().includes(searchQuery) ?? false);
        
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

    if (stocks.length === 0) {
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

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-tmt-primary">${stock.ticker}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">${stock.name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">${stock.sector || 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-white text-right">$${stock.currentPrice}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300 text-right">$${stock.low52}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-tmt-secondary text-right">${stock.proximityPct}%</td>
        `;
        tableBody.appendChild(row);
    });
}