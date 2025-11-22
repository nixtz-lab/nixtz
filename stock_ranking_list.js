// stock_ranking_list.js
// Logic for fetching and displaying the TMT Stock Ranking List.

let allStocks = []; // To store the master list of stocks
let rankFilter = document.getElementById('rank-filter');
let sectorFilter = document.getElementById('sector-filter');
let searchFilter = document.getElementById('search-ticker');
let tableBody = document.getElementById('stock-ranking-body');
let filterToggleBtn = document.getElementById('toggle-filter-btn');
let filterControls = document.getElementById('filter-controls');

// *** NEW: LOCAL STORAGE KEY ***
const CLIENT_CACHE_KEY_RANKING = 'tmt_ranking_client_cache';

document.addEventListener('DOMContentLoaded', () => {
    // Ensure critical elements exist
    if (!rankFilter || !sectorFilter || !searchFilter || !tableBody) {
        console.error("Critical page elements (filters or table body) are missing.");
        return;
    }

    // Load the data
    loadStockRankingData();

    // Add event listeners for filters
    rankFilter.addEventListener('input', filterAndRender);
    sectorFilter.addEventListener('input', filterAndRender);
    searchFilter.addEventListener('input', filterAndRender);

    // Add listener for the new filter toggle button
    if (filterToggleBtn && filterControls) {
        filterToggleBtn.addEventListener('click', () => {
            filterControls.classList.toggle('hidden');
        });
    } else {
        console.warn("Filter toggle button or controls not found.");
    }
});

/**
 * Fetches the TMT Stock Ranking List from the server.
 */
async function loadStockRankingData() {
    // *** NEW: 1. Check client-side cache and render immediately (Stale Data Load) ***
    let cachedData = null;
    try {
        const storedData = localStorage.getItem(CLIENT_CACHE_KEY_RANKING);
        if (storedData) {
            cachedData = JSON.parse(storedData);
            allStocks = cachedData; // Update master list with stale data
            renderTable(allStocks);
            console.log("Stock Ranking List: Rendered stale data from client cache.");
        } else {
             // Only show 'Loading fresh data' if no cache available
             tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-gray-500">Loading fresh data...</td></tr>`;
        }
    } catch (e) {
        console.error("Failed to parse client cache:", e);
        localStorage.removeItem(CLIENT_CACHE_KEY_RANKING); // Clear bad cache
    }
    // *** END NEW ***
    
    try {
        // This is a public endpoint, no token needed
        const response = await fetch('/api/stock-ranking-list');

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || `Error fetching data: ${response.statusText}`);
        }

        const result = await response.json();

        if (result.success && Array.isArray(result.data)) {
            allStocks = result.data; // Store the master list
            
            // *** NEW: 2. Save fresh data to client cache before rendering ***
            localStorage.setItem(CLIENT_CACHE_KEY_RANKING, JSON.stringify(allStocks));
            
            // 3. Render fresh data (will overwrite stale data if present)
            renderTable(allStocks); // Render the full list initially
        } else {
            throw new Error(result.message || "Failed to load stock data.");
        }

    } catch (error) {
        console.error("Failed to load TMT Stock Ranking data:", error);
        // Only show fatal error if no cache was available
        if (!cachedData) {
            tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-red-400">Error: ${error.message}</td></tr>`;
            if (typeof showMessage === 'function') {
                showMessage(error.message, true);
            }
        }
    }
}

/**
 * Applies filters to the master list and re-renders the table.
 */
function filterAndRender() {
    const rankQuery = rankFilter.value; // e.g., "1", "2", "3", "all"
    const sectorQuery = sectorFilter.value.toLowerCase();
    const searchQuery = searchFilter.value.toLowerCase();

    const filteredStocks = allStocks.filter(stock => {
        // Filter by Sector
        const matchesSector = stock.sector?.toLowerCase().includes(sectorQuery) ?? true;
        
        // Filter by Search
        const matchesSearch = (stock.ticker?.toLowerCase().includes(searchQuery) ?? false) || 
                              (stock.name?.toLowerCase().includes(searchQuery) ?? false);
        
        // Filter by Rank (A bit abstract, so we'll just filter by our "A+" rank for now)
        // This filter is less useful now but we leave the logic in
        let matchesRank = true;
        if (rankQuery !== 'all') {
            // Since we only load "A+" (Strong Buys) and (buy), any rank filter other than "all" will match
            // You could make this more complex if you add B, C ranks later
            matchesRank = stock.rank?.toLowerCase().includes('a'); // Simple check
        }
        
        return matchesSector && matchesSearch && matchesRank;
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
        // Updated message to be more specific
        tableBody.innerHTML = `<tr><td colspan="6" class="px-6 py-10 text-center text-gray-500">No 'Strong Buy' and 'Buy' stocks found with current filters.</td></tr>`;
        return;
    }

    // Create and append a row for each stock
    stocks.forEach(stock => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-800 transition duration-150 cursor-pointer';
        // Make row clickable to go to dashboard
        row.onclick = () => {
            if (typeof checkAccessAndRedirect === 'function') {
                // We assume stock_ranking_list is public, so we don't need checkAccess
                window.location.href = `stock_dashboard.html?ticker=${stock.ticker}`;
            } else {
                window.location.href = `stock_dashboard.html?ticker=${stock.ticker}`;
            }
        };
        
        // --- MODIFICATIONS START ---

        // 1. Determine rank color
        let rankColor = 'text-tmt-primary'; // Default A+
        if (stock.rank?.includes('B')) rankColor = 'text-tmt-secondary';
        if (stock.rank?.includes('C')) rankColor = 'text-orange-400';

        // 2. Format TMT Target (Req 2 & 3)
        let tmtTargetDisplay = 'N/A';
        const hasTarget = stock.tmtTarget !== null && stock.tmtTarget !== undefined;
        const tmtTargetNum = Number(stock.tmtTarget);
        
        if (hasTarget && !isNaN(tmtTargetNum)) {
            // Format as string with $ and 2 decimal places
            tmtTargetDisplay = `$${tmtTargetNum.toFixed(2)}`;
        }

        // 3. Determine Current Price color (Req 4)
        let priceColorClass = 'text-white'; // Default
        const currentPriceNum = Number(stock.currentPrice);

        if (hasTarget && !isNaN(currentPriceNum) && !isNaN(tmtTargetNum)) {
            if (currentPriceNum < tmtTargetNum) {
                priceColorClass = 'text-green-400'; // Green
            } else if (currentPriceNum > tmtTargetNum) {
                priceColorClass = 'text-red-400'; // Red
            }
            // If equal, it stays 'text-white'
        }
        
        // 4. Format Current Price
        const isNumber = (val) => typeof val === 'number' && !isNaN(val);
        const currentPriceDisplay = isNaN(currentPriceNum) ? 'N/A' : `$${currentPriceNum.toFixed(2)}`;

        // --- MODIFICATIONS END ---

        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-bold ${rankColor}">${stock.rank || 'A+'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold text-tmt-secondary">${stock.ticker}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">${stock.name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">${stock.sector || 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm ${priceColorClass} text-right">${currentPriceDisplay}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-tmt-primary text-right">${tmtTargetDisplay}</td>
        `;
        tableBody.appendChild(row);
    });
}