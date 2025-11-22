/**
 * tmt_dashboard.js
 * Handles fetching and displaying dynamic stock lists
 * and the Fear & Greed gauge for the TMT Dashboard.
 */

// === NEW: FEAR & GREED GAUGE ===

// --- !!! PASTE YOUR NEW, SECURE API KEY HERE !!! ---
// --- !!! (Get this from your RapidAPI dashboard) ---
const RAPIDAPI_KEY = "YOUR_NEW_API_KEY_HERE"; 
const RAPIDAPI_HOST = "fear-and-greed-index.p.rapidapi.com";

let stockFearGreedChart = null; // To hold the chart instance

/**
 * Fetches the Fear & Greed data from RapidAPI.
 */
async function fetchStockFearAndGreedApi() {
    const url = 'https://fear-and-greed-index.p.rapidapi.com/v1/fgi';
    const options = {
        method: 'GET',
        headers: {
            'x-rapidapi-key': RAPIDAPI_KEY,
            'x-rapidapi-host': RAPIDAPI_HOST
        }
    };

    try {
        const response = await fetch(url, options);
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        
        if (data.fgi && data.fgi.now) {
            const value = parseInt(data.fgi.now.value, 10);
            const label = data.fgi.now.valueText;
            renderStockFearGreedGauge(value, label);
        } else {
            console.error("Invalid API response structure", data);
            renderStockFearGreedGauge(0, "Error");
        }
    } catch (error) {
        console.error('Failed to fetch Fear & Greed data:', error);
        renderStockFearGreedGauge(0, "Error");
    }
}

/**
 * Renders the gauge chart using Chart.js
 * @param {number} value - The index value (0-100)
 * @param {string} label - The text label (e.g., "Fear")
 */
function renderStockFearGreedGauge(value, label) {
    const ctx = document.getElementById('stockFearGreedGauge')?.getContext('2d');
    const valueEl = document.getElementById('stockFearGreedValue');
    const labelEl = document.getElementById('stockFearGreedLabel');

    if (!ctx || !valueEl || !labelEl) {
        console.error("Gauge chart canvas or text elements not found.");
        return;
    }

    // Update text elements
    valueEl.textContent = value;
    labelEl.textContent = label;

    // Determine colors
    // These colors are from the standard F&G index
    const colors = {
        extremeFear: '#D94040', // Red
        fear: '#F29F40',        // Orange
        neutral: '#F2CB05',     // Yellow
        greed: '#88A640',       // Light Green
        extremeGreed: '#30A640' // Dark Green
    };
    
    let gaugeColor = colors.neutral;
    if (value <= 20) gaugeColor = colors.extremeFear;
    else if (value <= 40) gaugeColor = colors.fear;
    else if (value >= 80) gaugeColor = colors.extremeGreed;
    else if (value >= 60) gaugeColor = colors.greed;

    // Update label color to match
    labelEl.style.color = gaugeColor;

    // Data for the gauge
    const data = {
        datasets: [{
            data: [value, 100 - value],
            backgroundColor: [gaugeColor, '#374151'], // Active color, gray background
            borderWidth: 0,
            circumference: 180, // Half circle
            rotation: 270,      // Start at the bottom-left
        }]
    };

    // Chart.js configuration
    const config = {
        type: 'doughnut',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1.5, // Adjust to fit the card
            cutout: '80%',      // Makes it a gauge
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            animation: {
                animateRotate: false
            }
        }
    };

    // Create or update the chart
    if (stockFearGreedChart) {
        stockFearGreedChart.data = data;
        stockFearGreedChart.update();
    } else {
        stockFearGreedChart = new Chart(ctx, config);
    }
}

// === END OF FEAR & GREED GAUGE ===


// === DYNAMIC STOCK LISTS ===

document.addEventListener('DOMContentLoaded', () => {
    // Check if we are on the dashboard page
    const top5List = document.getElementById('tmt-top-5-list');
    if (top5List) {
        console.log("TMT Dashboard JS Loaded.");
        
        // Load all dynamic data
        fetchStockFearAndGreedApi(); // <-- NEW: Call the gauge function
        fetchTmtTop5();
        fetch52WeekLows();
        fetch52WeekHighs();
    }
});

/**
 * Renders a list of stocks into a target element.
 * @param {string} elementId - The ID of the container element.
 * @param {Array} stockData - An array of stock objects.
 * @param {string} errorMessage - Message to show if data is empty or fetch fails.
 */
function renderList(elementId, stockData, errorMessage = "Failed to load data.") {
    const listContainer = document.getElementById(elementId);
    if (!listContainer) return;

    // Clear the "Loading..." placeholder
    listContainer.innerHTML = "";

    // Check if data is valid
    if (!stockData || stockData.length === 0) {
        listContainer.innerHTML = `<p class="text-gray-500 text-sm text-center">${errorMessage}</p>`;
        return;
    }

    // Create and append stock items
    stockData.forEach(stock => {
        // Example: { ticker: 'AAPL', name: 'Apple Inc.', price: '150.00' }
        const stockEl = document.createElement('a');
        stockEl.href = `javascript:void(0)`;
        // Use the global checkAccessAndRedirect function from script.js
        stockEl.onclick = () => checkAccessAndRedirect(`stock_dashboard.html?ticker=${stock.ticker}`);
        
        stockEl.className = "flex justify-between items-center p-3 -mx-3 rounded-lg hover:bg-gray-800 transition duration-200 cursor-pointer";
        
        stockEl.innerHTML = `
            <div>
                <span class="text-tmt-secondary font-bold text-sm">${stock.ticker}</span>
                <p class="text-gray-400 text-xs truncate">${stock.name || 'N/A'}</p>
            </div>
            <div class="text-right">
                <span class="text-white font-medium text-sm">${stock.price ? `$${stock.price}` : 'N/A'}</span>
            </div>
        `;
        listContainer.appendChild(stockEl);
    });
}

/**
 * Fetches the TMT Top 5 list from your API.
 * * !!! THIS IS A MOCK FUNCTION. YOU MUST UPDATE THE 'fetch' URL. !!!
 */
async function fetchTmtTop5() {
    try {
        // --- !!! UPDATE THIS URL to your actual API endpoint ---
        // const response = await fetch('/api/stocks/tmt-top-5'); 
        // if (!response.ok) throw new Error('Network response was not ok');
        // const data = await response.json();
        
        // --- Mock Data (Replace with API call) ---
        const mockData = [
            { ticker: 'GOOGL', name: 'Alphabet Inc.', price: '140.50' },
            { ticker: 'MSFT', name: 'Microsoft Corp.', price: '330.20' },
            { ticker: 'BRK.B', name: 'Berkshire Hathaway', price: '360.00' },
            { ticker: 'V', name: 'Visa Inc.', price: '245.10' },
            { ticker: 'JPM', name: 'JPMorgan Chase', price: '150.75' }
        ];
        // --- End Mock Data ---
        
        // renderList('tmt-top-5-list', data.stocks); // Use this for real API
        renderList('tmt-top-5-list', mockData); // Use this for mock data

    } catch (error) {
        console.error("Failed to fetch TMT Top 5:", error);
        renderList('tmt-top-5-list', [], "Error loading list.");
    }
}

/**
 * Fetches the 52-Week Lows list from your API.
 * * !!! THIS IS A MOCK FUNCTION. YOU MUST UPDATE THE 'fetch' URL. !!!
 */
async function fetch52WeekLows() {
    try {
        // --- !!! UPDATE THIS URL to your actual API endpoint ---
        // const response = await fetch('/api/stocks/52-week-low'); 
        // if (!response.ok) throw new Error('Network response was not ok');
        // const data = await response.json();

        // --- Mock Data (Replace with API call) ---
        const mockData = [
            { ticker: 'PFE', name: 'Pfizer Inc.', price: '30.12' },
            { ticker: 'DIS', name: 'Walt Disney Co.', price: '80.40' },
            { ticker: 'PYPL', name: 'PayPal Holdings', price: '58.22' }
        ];
        // --- End Mock Data ---
        
        renderList('52-week-low-list', mockData);

    } catch (error) {
        console.error("Failed to fetch 52-Week Lows:", error);
        renderList('52-week-low-list', [], "Error loading list.");
    }
}

/**
 * Fetches the 52-Week Highs list from your API.
 * * !!! THIS IS A MOCK FUNCTION. YOU MUST UPDATE THE 'fetch' URL. !!!
 */
async function fetch52WeekHighs() {
    try {
        // --- !!! UPDATE THIS URL to your actual API endpoint ---
        // const response = await fetch('/api/stocks/52-week-high'); 
        // if (!response.ok) throw new Error('Network response was not ok');
        // const data = await response.json();

        // --- Mock Data (Replace with API call) ---
        const mockData = [
            { ticker: 'NVDA', name: 'NVIDIA Corp.', price: '450.00' },
            { ticker: 'LLY', name: 'Eli Lilly & Co.', price: '580.10' },
            { ticker: 'AVGO', name: 'Broadcom Inc.', price: '900.50' }
        ];
        // --- End Mock Data ---
        
        renderList('52-week-high-list', mockData);

    } catch (error) {
        console.error("Failed to fetch 52-Week Highs:", error);
        renderList('52-week-high-list', [], "Error loading list.");
    }
}