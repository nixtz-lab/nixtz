/**
 * tmt_dashboard.js
 * Handles fetching and displaying dynamic stock lists
 * and the Fear & Greed gauge for the TMT Dashboard.
 * * --- MODIFIED TO USE CUSTOM GAUGES FOR BOTH STOCK AND CRYPTO ---
 */

// === FEAR & GREED GAUGES ===

/**
 * Fetches the STOCK MARKET Fear & Greed data from our secure backend.
 * (Now parses the new /index API response)
 */
async function fetchStockFearAndGreedApi() {
    const url = '/api/tmt/fear-and-greed';
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        
        // --- UPDATED PARSING LOGIC ---
        if (result.success && result.value && result.classification) {
            const value = Math.round(result.value); // Round 14.87 -> 15
            const label = result.classification;   // "extreme fear"
            renderStockFearAndGreedGauge(value, label);
        } else {
            console.error("Invalid API response structure", result);
            renderStockFearAndGreedGauge(50, "Neutral"); // Fallback
        }
        // --- END UPDATED PARSING LOGIC ---

    } catch (error) {
        console.error('Failed to fetch Stock Fear & Greed data from backend, using mock:', error);
        renderStockFearAndGreedGauge(50, "Neutral"); // Fallback
    }
}


/**
 * Renders the STOCK gauge text values, colors, and needle rotation.
 */
function renderStockFearAndGreedGauge(value, label) {
    const valueEl = document.getElementById('stockFearGreedValue');
    const labelEl = document.getElementById('stockFearGreedLabel');
    const needleEl = document.getElementById('gauge-needle'); 

    if (!valueEl || !labelEl || !needleEl) {
        console.error("Stock Fear & Greed gauge elements not found.");
        return;
    }

    // 1. Set Text and Color
    valueEl.textContent = value;
    labelEl.textContent = `(${label})`; // e.g., (extreme fear)

    let textColor = 'text-yellow-400'; // Default: Neutral
    if (value <= 30) {
        textColor = 'text-red-500'; // Fear
    } else if (value >= 71) {
        textColor = 'text-green-500'; // Greed
    }
    
    // Update class names
    valueEl.className = `text-5xl font-extrabold ${textColor} -mt-20 relative z-30`;
    labelEl.className = `text-xl font-bold ${textColor} transition duration-300 relative z-30`;

    // 2. Calculate and Set Needle Rotation
    // Map 0-100 value to -90deg (left) to +90deg (right)
    const rotation = (value - 50) * 1.8;
    needleEl.style.transform = `rotate(${rotation}deg)`;
}


/**
 * Fetches the Crypto Fear & Greed data from our new backend route.
 */
async function fetchCryptoFearAndGreedApi() {
    const url = '/api/tmt/crypto-fear-and-greed';
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        const result = await response.json();
        if (result.success && result.value && result.classification) {
            renderCryptoFearAndGreedGauge(result.value, result.classification);
        } else {
            console.error("Invalid API response structure", result);
            renderCryptoFearAndGreedGauge(50, "Neutral"); // Fallback
        }
    } catch (error) {
        console.error('Failed to fetch Crypto Fear & Greed data from backend, using mock:', error);
        renderCryptoFearAndGreedGauge(50, "Neutral"); // Fallback
    }
}

/**
 * Renders the CRYPTO gauge text values, colors, and needle rotation.
 */
function renderCryptoFearAndGreedGauge(value, label) {
    // Target the new HTML IDs
    const valueEl = document.getElementById('cryptoFearGreedValue');
    const labelEl = document.getElementById('cryptoFearGreedLabel');
    const needleEl = document.getElementById('crypto-gauge-needle'); 

    if (!valueEl || !labelEl || !needleEl) {
        console.error("Crypto Fear & Greed gauge elements not found.");
        return;
    }

    // 1. Set Text and Color
    valueEl.textContent = value;
    labelEl.textContent = `(${label})`;

    // Use the same color logic
    let textColor = 'text-yellow-400'; // Default: Neutral
    if (value <= 30) {
        textColor = 'text-red-500'; // Fear
    } else if (value >= 71) {
        textColor = 'text-green-500'; // Greed
    }

    valueEl.className = `text-5xl font-extrabold ${textColor} -mt-20 relative z-30`;
    labelEl.className = `text-xl font-bold ${textColor} transition duration-300 relative z-30`;

    // 2. Calculate and Set Needle Rotation
    const rotation = (value - 50) * 1.8;
    needleEl.style.transform = `rotate(${rotation}deg)`;
}
// === END OF FEAR & GREED GAUGES ===


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
        fetchCryptoFearAndGreedApi(); // Call for the crypto gauge
        
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