/**
 * tmt_dashboard.js
 * Handles fetching and displaying dynamic stock lists
 * and the Fear & Greed gauge for the TMT Dashboard.
 * * --- MODIFIED TO USE SECURE BACKEND API ROUTES AND MACRO INDICATORS ---
 */

// === FEAR & GREED GAUGE ===

/**
 * Fetches the Fear & Greed data from our secure backend.
 */
async function fetchStockFearAndGreedApi() {
    const url = '/api/tmt/fear-and-greed';
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        if (result.success && result.data.fgi && result.data.fgi.now) {
            const value = parseInt(result.data.fgi.now.value, 10);
            const label = result.data.fgi.now.valueText;
            renderStockFearAndGreedGauge(value, label);
        } else {
            console.error("Invalid API response structure", result);
            renderStockFearAndGreedGauge(55, "Neutral"); // Fallback
        }
    } catch (error) {
        console.error('Failed to fetch Fear & Greed data from backend, using mock:', error);
        renderStockFearAndGreedGauge(55, "Neutral"); // Fallback
    }
}


/**
 * Renders the gauge text values, colors, and needle rotation.
 */
function renderStockFearAndGreedGauge(value, label) {
    const valueEl = document.getElementById('stockFearGreedValue');
    const labelEl = document.getElementById('stockFearGreedLabel');
    const needleEl = document.getElementById('gauge-needle'); // Get the needle

    if (!valueEl || !labelEl || !needleEl) {
        console.error("Fear & Greed gauge elements not found.");
        return;
    }

    // 1. Set Text and Color (Based on 1-30 Red, 31-70 Yellow, 71-100 Green)
    valueEl.textContent = value;
    labelEl.textContent = `(${label})`;

    // ****** MODIFICATION: Updated text color logic ******
    let textColor = 'text-yellow-400'; // Default: Neutral (31-70)
    if (value <= 30) {
        textColor = 'text-red-500'; // Fear (1-30)
    } else if (value >= 71) {
        textColor = 'text-green-500'; // Greed (71-100)
    }
    // ****** END MODIFICATION ******

    // Update class names to position text inside the gauge
    valueEl.className = `text-5xl font-extrabold ${textColor} -mt-20 relative z-30`;
    labelEl.className = `text-xl font-bold ${textColor} transition duration-300 relative z-30`;

    // 2. Calculate and Set Needle Rotation
    // Map 0-100 value to -90deg (left) to +90deg (right)
    // 50 (Neutral) = 0deg (straight up)
    // Formula: (value - 50) * 1.8
    const rotation = (value - 50) * 1.8;
    needleEl.style.transform = `rotate(${rotation}deg)`;
}
// === END OF FEAR & GREED GAUGE ===


// === NEW: MACRO INDICATOR FUNCTIONS ===

/**
 * Fetches BTC Mining Cost from the secure backend scraper route.
 */
async function fetchBtcMiningCost() {
    try {
        const response = await fetch('/api/tmt/btc-mining-cost');
        const result = await response.json();
        const element = document.getElementById('btc-mining-cost-value');

        if (result.success && element) {
            element.textContent = `$${result.value}`;
        } else if (element) {
            element.textContent = "N/A";
        }
    } catch (error) {
        console.error("Failed to fetch BTC Mining Cost:", error);
        const element = document.getElementById('btc-mining-cost-value');
        if (element) element.textContent = "Error";
    }
}

/**
 * Fetches Gold Avg. Mining Cost from the backend.
 */
async function fetchGoldMiningCost() {
    try {
        const response = await fetch('/api/tmt/gold-mining-cost');
        const result = await response.json();
        const element = document.getElementById('gold-mining-cost-value');

        if (result.success && element) {
            element.textContent = result.value;
        } else if (element) {
            element.textContent = "N/A";
        }
    } catch (error) {
        console.error("Failed to fetch Gold Mining Cost:", error);
        const element = document.getElementById('gold-mining-cost-value');
        if (element) element.textContent = "Error";
    }
}


/**
 * Fetches the Buffett Indicator (Market Cap to GDP Ratio).
 */
async function fetchBuffettIndicator() {
    try {
        const response = await fetch('/api/tmt/buffett-indicator');
        const result = await response.json();
        const element = document.getElementById('buffett-indicator-value');

        if (result.success && element) {
            element.textContent = result.value;
            element.className = `text-2xl font-extrabold ${result.color || 'text-white'}`; 
        } else if (element) {
            element.textContent = "N/A";
        }
    } catch (error) {
        console.error("Failed to fetch Buffett Indicator:", error);
        const element = document.getElementById('buffett-indicator-value');
        if (element) element.textContent = "Error";
    }
}


/**
 * Fetches S&P 500 Trailing P/E Ratio from the backend.
 */
async function fetchSP500PeRatio() {
    try {
        const response = await fetch('/api/tmt/sp500-pe-trailing');
        const result = await response.json();
        const element = document.getElementById('sp500-pe-ratio-value');

        if (result.success && element) {
            element.textContent = result.value;
            element.className = `text-2xl font-extrabold ${result.color || 'text-white'}`; 
        } else if (element) {
            element.textContent = "N/A";
        }
    } catch (error) {
        console.error("Failed to fetch S&P 500 P/E Ratio:", error);
        const element = document.getElementById('sp500-pe-ratio-value');
        if (element) element.textContent = "Error";
    }
}

/**
 * Fetches S&P 500 Shiller P/E (CAPE) Ratio from the backend.
 */
async function fetchSP500CapeRatio() {
    try {
        const response = await fetch('/api/tmt/sp500-cape-ratio');
        const result = await response.json();
        const element = document.getElementById('sp500-cape-ratio-value');

        if (result.success && element) {
            element.textContent = result.value;
            element.className = `text-2xl font-extrabold ${result.color || 'text-white'}`; 
        } else if (element) {
            element.textContent = "N/A";
        }
    } catch (error) {
        console.error("Failed to fetch S&P 500 CAPE Ratio:", error);
        const element = document.getElementById('sp500-cape-ratio-value');
        if (element) element.textContent = "Error";
    }
}

/**
 * Fetches S&P 500 Price-to-Book (P/B) Ratio from the backend.
 */
async function fetchSP500PbRatio() {
    try {
        const response = await fetch('/api/tmt/sp500-pb-ratio');
        const result = await response.json();
        const element = document.getElementById('sp500-pb-ratio-value');

        if (result.success && element) {
            element.textContent = result.value;
            element.className = `text-2xl font-extrabold ${result.color || 'text-white'}`; 
        } else if (element) {
            element.textContent = "N/A";
        }
    } catch (error) {
        console.error("Failed to fetch S&P 500 P/B Ratio:", error);
        const element = document.getElementById('sp500-pb-ratio-value');
        if (element) element.textContent = "Error";
    }
}


// === DYNAMIC STOCK LISTS ===

document.addEventListener('DOMContentLoaded', () => {
    // Check if we are on the dashboard page
    const top5List = document.getElementById('tmt-top-5-list');
    if (top5List) {
        console.log("TMT Dashboard JS Loaded.");
        
        // Load all dynamic data
        fetchStockFearAndGreedApi(); 
        fetchTmtTop5();
        fetch52WeekLows();
  
        fetchTopDecliners();
        
        // --- MACRO CALLS ---
        fetchBtcMiningCost(); 
        fetchGoldMiningCost();
        fetchBuffettIndicator();
        fetchSP500PeRatio(); 
        fetchSP500CapeRatio();
        fetchSP500PbRatio();
    }
});
/**
 * Renders a list of stocks into a target element.
 * * FIX: Modified to correctly handle Top Decliners (changePct) 
 * and to include secondary metrics (proximityPct) for 52-Week Lows.
 */
function renderList(elementId, stockData, errorMessage = "Failed to load data.") {
    const listContainer = document.getElementById(elementId);
    if (!listContainer) return;
    listContainer.innerHTML = "";

    if (!stockData || stockData.length === 0) {
        listContainer.innerHTML = `<p class="text-gray-500 text-sm text-center">${errorMessage}</p>`;
        return;
    }

    stockData.forEach(stock => {
        const stockEl = document.createElement('a');
        stockEl.href = `javascript:void(0)`;
        stockEl.onclick = () => checkAccessAndRedirect(`stock_dashboard.html?ticker=${stock.ticker}`);
        
        stockEl.className = "flex justify-between items-center p-3 rounded-lg hover:bg-gray-800 transition duration-200 cursor-pointer";
        
        let priceHtml = '';
        let secondaryText = stock.name || 'N/A'; // Default secondary text

        if (stock.price) {
            // TMT Top 5 and 52-Week Lows list style
            priceHtml = `$${stock.price}`;

            // Add proximityPct for 52-Week Lows list (Issue 2 Fix)
            if (elementId === '52-week-low-list' && stock.proximityPct) {
                secondaryText = `Near Low: ${stock.proximityPct}%`;
            } else {
                secondaryText = stock.name || 'N/A';
            }

        } else if (stock.changePct) {
            // Top Decliners list style (Issue 1 Fix)
            let color = 'text-red-400';
            if (stock.changePct.startsWith('+')) {
                 color = 'text-green-400'; // Though it's Top Decliners, we cover the edge case.
            }
            priceHtml = `<span class="${color}">${stock.changePct}</span>`;
            secondaryText = stock.name || 'N/A'; // Use name for decliners list
        } else {
            priceHtml = 'N/A';
        }

        stockEl.innerHTML = `
            <div>
                <span class="text-tmt-secondary font-bold text-sm">${stock.ticker}</span>
                <p class="text-gray-400 text-xs truncate">${secondaryText}</p> 
            </div>
            <div class="text-right">
                <span class="text-white font-medium text-sm">${priceHtml}</span>
            </div>
        `;
        listContainer.appendChild(stockEl);
    });
}

/**
 * Fetches the TMT Top 5 list from your API.
 */
async function fetchTmtTop5() {
    try {
        const token = localStorage.getItem('tmt_auth_token');
        const response = await fetch('/api/tmt/tmt-top-5', {
             headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (result.success && result.data) {
             renderList('tmt-top-5-list', result.data);
        } else {
            throw new Error(result.message || 'Failed to fetch TMT Top 5');
        }
    } catch (error) {
        console.error("Failed to fetch TMT Top 5:", error);
        renderList('tmt-top-5-list', [], "Error loading list.");
    }
}

/**
 * Fetches the 52-Week Lows list from your API.
 * * FIX: Maps 'proximityPct' into the list data for display on the dashboard.
 */
async function fetch52WeekLows() {
    try {
        const token = localStorage.getItem('tmt_auth_token');
        const response = await fetch('/api/tmt/52-week-low', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (result.success && result.data) {
            // Map the data to include the proximityPct for the dashboard view
            const stockData = result.data.map(stock => ({
                ticker: stock.ticker,
                name: stock.name,
                price: stock.currentPrice,
                proximityPct: stock.proximityPct // Included for better context (Issue 2 Fix)
            }));
            renderList('52-week-low-list', stockData);
        } else {
            throw new Error(result.message || 'Failed to fetch 52-week-lows');
        }
    } catch (error) {
        console.error("Failed to fetch 52-Week Lows:", error);
        renderList('52-week-low-list', [], "Error loading list.");
    }
}

/**
 * Fetches the Top Decliners list from your API.
 */
async function fetchTopDecliners() {
    try {
        const token = localStorage.getItem('tmt_auth_token');
        const response = await fetch('/api/tmt/top-decliners', { // New API route
             headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();

        if (result.success && result.data) {
             // Data format is { ticker, name, changePct }
             renderList('top-decliners-list', result.data, "No major decliners found.");
        } else {
            throw new Error(result.message || 'Failed to fetch top decliners');
        }
    } catch (error) {
        console.error("Failed to fetch Top Decliners:", error);
        renderList('top-decliners-list', [], "Error loading list.");
    }
}