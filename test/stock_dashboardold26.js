// stock_dashboard_final_clean.js
// This file is synchronized for the non-destructive fix: 
// 1. Calls the new /api/fixedmetrics/:ticker route for ATH and Net Assets.
// 2. Retains original logic for P/E TTM calculation and 5Yr averages.

// stock_dashboard.js - FINAL STABLE VERSION (P/E TTM CALCULATED FROM RAW DATA)

// ====================================================================
// === 1. API CONFIGURATION (Yahu + SimFin) ==========================
// ====================================================================

// WARNING: Using client-side keys is INSECURE for production! Use a proxy server.
// === YAHU FINANCIALS API CONFIGURATION ===
const YAHU_RAPIDAPI_KEY = "395e634198msh3ce064e80779cb8p161601jsn07aeb51f16ae";
const YAHU_RAPIDAPI_HOST = "apidojo-yahoo-finance-v1.p.rapidapi.com";
const YAHU_SUMMARY_ENDPOINT = "https://apidojo-yahoo-finance-v1.p.rapidapi.com/stock/get-fundamentals";

// Global variables
let currentTicker = null;
let selectedUserRating = 0;
const isNumber = (val) => typeof val === 'number' && !isNaN(val);
// --- Configuration (Extracted from HTML) ---
if (typeof tailwind !== 'undefined') {
    tailwind.config = {
        theme: {
            extend: {
                colors: {
                    'tmt-bg': '#101010', 'tmt-primary': '#00A99D', 'tmt-secondary': '#FFD700',
                    'tmt-red': '#EF4444', 'tmt-orange': '#F97316', 'tmt-yellow': '#FACC15',
                    'tmt-blue': '#3B82F6', 'tmt-green': '#22C55E',
                }
            }
        }
    };
} else { console.warn("Tailwind config object not found."); }

// ====================================================================
// === 2. DATA FETCH AND MAPPING (LIVE API LOGIC) ======================
// ====================================================================

// Mock data generator (Fallback structure with N/A)
function getMockStockData(ticker) {
    let data = {
        companyName: `${ticker} Analytics Corp. (DATA UNAVAILABLE)`, currentPrice: "N/A", priceChange: "N/A", changePercent: "N/A",
        summary: "Data could not be loaded for this ticker.", marketCap: "N/A", revenueTTM: "N/A", netIncomeTTM: "N/A", avgNetIncome5Yr: "N/A",
        peRatio: "N/A", avgPeRatio5Yr: "N/A", epsTTM: "N/A", avgEps5Yr: "N/A", priceToSales: "N/A", profitMarginTTM: "N/A", avgProfitMargin5Yr: "N/A",
        grossProfitMarginTTM: "N/A", compoundRevenueGrowth3Yr: "N/A", compoundRevenueGrowth5Yr: "N/A", compoundRevenueGrowth10Yr: "N/A", totalNetAcquisitions: "N/A",
        freeCashFlowTTM: "N/A", avgFCF5Yr: "N/A", cashFlowPerShare: "N/A", avgCashFlowPerShare5Yr: "N/A", revenuePerShare: "N/A", avgRevenuePerShare5Yr: "N/A",
        priceToFCF: "N/A", priceToFCF5Yr: "N/A", dividendYield: "N/A", dividendsPaid: "N/A", 
        enterpriseValueTraditional: "N/A", netAssets: "N/A", 
        returnOnInvestedCapitalTTM: "N/A", returnOnInvestedCapital5Yr: "N/A", fiftyTwoWeekHigh: "N/A", fiftyTwoWeekLow: "N/A", ath: "N/A",
        ratingScore: 0, userRatingScore: 0, changeClass: 'text-gray-400', changeIcon: '▬',
        // Raw values to enable calculation
        rawMarketCap: null, rawNetIncome: null,
        // *** NEW FIELD ADDED HERE ***
        priceToNetAssets: "N/A",
    }; return data;
}

/**
 * Fetches historical data from SimFin via the backend server.
 * NOTE: This is the original call responsible for 5Yr Averages and CAGRs.
 */
async function fetchSimFinHistoricals(ticker) {
    let historicalAverages = { 
        avgNetIncome5Yr: "N/A", avgProfitMargin5Yr: "N/A", avgFCF5Yr: "N/A",
        avgEps5Yr: "N/A", avgCashFlowPerShare5Yr: "N/A", avgRevenuePerShare5Yr: "N/A",
        compoundRevenueGrowth3Yr: "N/A", compoundRevenueGrowth5Yr: "N/A",
        compoundRevenueGrowth10Yr: "N/A",
        compoundShareGrowth5Yr: "N/A",
        netAssets: "N/A", // This value is now generally obsolete, but kept for merge safety
        avgROIC5Yr: "N/A", 
        ath: "N/A", // This value is now generally obsolete, but kept for merge safety
    };

    try {
        console.log(`Fetching historicals for ${ticker} from OUR backend...`);
        // *** This endpoint points to your untouched stock_analysis_be.js ***
        const response = await fetch(`/api/stockanalysis/historicals/${ticker}`);

        if (!response.ok) {
            throw new Error(`Backend historicals API error! Status: ${response.status}`);
        }

        const result = await response.json();

        if (result.success && result.data) {
            console.log("Received original historicals from backend:", result.data);
            return result.data; // Return the original set of averages
        } else {
            throw new Error(result.message || "Failed to parse historicals from backend.");
        }

    } catch (error) {
        console.error("Error fetching or processing SimFin historical data from backend for ", ticker, ":", error);
        return historicalAverages; // Return defaults on error
    }
}


/**
 * Fetches the TMT Rating from the backend server.
 */
async function fetchTmtRating(ticker) {
    try {
        const response = await fetch(`/api/stock/tmt-rating?ticker=${ticker}`);
        const result = await response.json();

        if (response.ok && result.success) {
            return result.rating || 0; // Returns 0 if N/A, or a number 1-5
        }
        console.warn("Failed to fetch TMT rating from backend. Status:", response.status);
        return 0; // Default to 0 (N/A) on error
    } catch (error) {
        console.error("Network error fetching TMT rating:", error);
        return 0;
    }
}

/**
 * Fetches Community Sentiment from the backend server.
 */
async function fetchCommunitySentiment(ticker) {
    try {
        const response = await fetch(`/api/stock/community-sentiment?ticker=${ticker}`);
        const result = await response.json();

        if (response.ok && result.success) {
            return result.sentiment;
        }
        console.warn("Failed to fetch community sentiment from backend. Status:", response.status);
        return { buy: 0, hold: 0, sell: 0, total: 0 }; // Default structure
    } catch (error) {
        console.error("Network error fetching community sentiment:", error);
        return { buy: 0, hold: 0, sell: 0, total: 0 };
    }
}

/**
 * Fetches dedicated metrics (Net Assets, ATH) from the new backend route.
 */
async function fetchFixedMetrics(ticker) {
    try {
        // *** FIX APPLIED HERE: Calling the correct new endpoint path /api/fixedmetrics ***
        const response = await fetch(`/api/fixedmetrics/${ticker}`);
        const result = await response.json();
        if (response.ok && result.success && result.data) {
            return result.data;
        }
        console.warn("Failed to fetch dedicated fixed metrics.", result.message);
        return { netAssets: "N/A", ath: "N/A" }; // Return defaults on failure
    } catch (error) {
        console.error("Network error fetching fixed metrics:", error);
        return { netAssets: "N/A", ath: "N/A" };
    }
}


/**
 * Main function to fetch all dashboard data concurrently.
 */
async function fetchStockData(ticker) {
    let data = getMockStockData(ticker); // Start with default structure

    // Fetch snapshot, original historicals, TMT rating, AND the new fixed metrics simultaneously
    const [yahuResult, simFinAverages, tmtRatingScore, fixedMetrics] = await Promise.all([
        fetchYahuSnapshot(ticker), 
        fetchSimFinHistoricals(ticker), // Gets 5Yr Averages and CAGRs
        fetchTmtRating(ticker),
        fetchFixedMetrics(ticker) // Gets fixed Net Assets and ATH
    ]);

    // Merge Yahu snapshot data if successful
    if (yahuResult) {
        data = { ...data, ...yahuResult };
    }

    // Merge SimFin original historical averages (These are the critical 5Yr metrics)
    if (simFinAverages) {
        if (simFinAverages.avgNetIncome5Yr !== "N/A") data.avgNetIncome5Yr = simFinAverages.avgNetIncome5Yr;
        if (simFinAverages.avgProfitMargin5Yr !== "N/A") data.avgProfitMargin5Yr = simFinAverages.avgProfitMargin5Yr;
        if (simFinAverages.avgFCF5Yr !== "N/A") data.avgFCF5Yr = simFinAverages.avgFCF5Yr;
        if (simFinAverages.avgEps5Yr !== "N/A") data.avgEps5Yr = simFinAverages.avgEps5Yr;
        if (simFinAverages.avgCashFlowPerShare5Yr !== "N/A") data.avgCashFlowPerShare5Yr = simFinAverages.avgCashFlowPerShare5Yr;
        if (simFinAverages.avgRevenuePerShare5Yr !== "N/A") data.avgRevenuePerShare5Yr = simFinAverages.avgRevenuePerShare5Yr;
        
        // Revenue CAGRs
        if (simFinAverages.compoundRevenueGrowth3Yr !== "N/A") data.compoundRevenueGrowth3Yr = simFinAverages.compoundRevenueGrowth3Yr;
        if (simFinAverages.compoundRevenueGrowth5Yr !== "N/A") data.compoundRevenueGrowth5Yr = simFinAverages.compoundRevenueGrowth5Yr;
        if (simFinAverages.compoundRevenueGrowth10Yr !== "N/A") data.compoundRevenueGrowth10Yr = simFinAverages.compoundRevenueGrowth10Yr;

        // Share Growth 
        if (simFinAverages.compoundShareGrowth5Yr !== "N/A") data.compoundShareGrowth5Yr = simFinAverages.compoundShareGrowth5Yr;
        
        // Return on Invested Capital (using the new 5Y Avg ROIC from the server)
        if (simFinAverages.avgROIC5Yr !== "N/A") data.returnOnInvestedCapital5Yr = simFinAverages.avgROIC5Yr; 
        
        // Note: data.netAssets and data.ath are NOT merged from simFinAverages anymore.
    }
    
    // *** NEW FIX: Merge Net Assets and ATH from the dedicated endpoint ***
    if (fixedMetrics) {
        if (fixedMetrics.netAssets !== "N/A") { 
            data.netAssets = fixedMetrics.netAssets; // Use value from dedicated route
        }
        if (fixedMetrics.ath !== "N/A") { 
            data.ath = fixedMetrics.ath; // Use value from dedicated route
        }
    }

    // Apply TMT Rating score
    data.ratingScore = tmtRatingScore;

    // Set remaining N/A values explicitly
    data.totalNetAcquisitions = "N/A";
    data.priceToFCF5Yr = "N/A";
    
    // *** START P/E TTM CALCULATION FIX: Use raw data from the server response ***
    let peTTM = "N/A";
    if (isNumber(data.rawMarketCap) && isNumber(data.rawNetIncome) && data.rawNetIncome !== 0) {
        peTTM = (data.rawMarketCap / data.rawNetIncome).toFixed(2);
    }
    // Use the calculated TTM P/E
    data.peRatio = peTTM;
    // *** END P/E TTM CALCULATION FIX ***
    
    // Calculate 5Yr Avg P/E ratio needed for display
    const currentPriceNum = parseFloat(data.currentPrice);
    const avgEps5YrNum = parseFloat(String(data.avgEps5Yr).replace(/[^0-9.-]+/g,"")); 
    if (isNumber(currentPriceNum) && isNumber(avgEps5YrNum) && avgEps5YrNum !== 0) {
        data.avgPeRatio5Yr = (currentPriceNum / avgEps5YrNum).toFixed(2);
    }

    // *** START: NEW P/NET ASSETS CALCULATION (MODIFIED TO BE PERCENTAGE) ***
    let priceToNetAssets = "N/A";
    // rawMarketCap is a raw number (e.g., 50000000000 for $50B)
    const rawMarketCapNum = parseFloat(data.rawMarketCap); 
    // netAssets is a formatted string (e.g., "50.00B")
    const netAssetsStr = String(data.netAssets); 

    if (isNumber(rawMarketCapNum) && netAssetsStr !== "N/A") {
        // Extract the number and multiplier from the formatted string
        const match = netAssetsStr.match(/([0-9.]+)([BMT])?/);
        if (match) {
            let netAssetsValue = parseFloat(match[1]);
            const unit = match[2];

            // Convert Net Assets to the same unit as rawMarketCap 
            if (unit === 'B') netAssetsValue *= 1e9;
            else if (unit === 'M') netAssetsValue *= 1e6;
            else if (unit === 'T') netAssetsValue *= 1e12; 
            
            if (netAssetsValue !== 0) {
                // Calculation changed to (Ratio * 100).toFixed(2) + "%"
                priceToNetAssets = (rawMarketCapNum / netAssetsValue * 100).toFixed(2) + "%";
            }
        }
    }
    data.priceToNetAssets = priceToNetAssets; // Store it in the data object
    // *** END: NEW P/NET ASSETS CALCULATION ***


    return data;
}


/**
 * Fetches snapshot data from Yahu (Yahoo Finance) RapidAPI.
 */
async function fetchYahuSnapshot(ticker) {
    // This now calls the new server route that returns raw MarketCap and NetIncome
    // NOTE: This must match the route added to server.js
    const url = `/api/stock-yahu-snapshot/${ticker}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || `Backend snapshot error! Status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.success && result.data) {
            // The data structure returned by the server snapshot route is designed
            // to be used here.
            return result.data;
        }
        throw new Error(result.message || "Failed to parse snapshot data from backend.");

    } catch (error) {
        console.error(`Error fetching Yahu snapshot for ${ticker}:`, error);
        return null; // Return null on error
    }
}


// ====================================================================
// === 3. UI & DOM MANIPULATION FUNCTIONS =================
// ====================================================================

// --- Helper to Create Metric Row HTML ---
function createMetricRow(label, value, isHighlight = false) {
    let displayValue = value === null || typeof value === 'undefined' || value === "NaN%" || value === "$NaN" ? "N/A" : value;
    const valueBaseClass = isHighlight ? 'text-tmt-secondary font-bold' : 'text-gray-300';
    let valueHighlightClass = valueBaseClass; // Start with base class

    // Apply color highlighting based on value type and sign
    if (displayValue !== "N/A") {
        const stringValue = String(displayValue);
        const numericPart = parseFloat(stringValue.replace(/[^0-9.-]+/g,"")); // Extract number

        if (!isNaN(numericPart)) {
            // *** UPDATED LOGIC: Highlight negative share growth as RED ***
            if (label.includes('Share Growth') && numericPart > 0) {
                valueHighlightClass = 'text-tmt-red'; // Positive share growth (dilution) is bad (red)
            } else if (label.includes('Share Growth') && numericPart < 0) {
                valueHighlightClass = 'text-tmt-green'; // Negative share growth (buybacks) is good (green)
            } else if (numericPart > 0 && (stringValue.includes('%') || stringValue.includes('B') || stringValue.includes('T') || stringValue.startsWith('$'))) {
                valueHighlightClass = 'text-tmt-green'; // Positive %, B, T, $
            } else if (numericPart < 0 && (stringValue.includes('%') || stringValue.startsWith('$'))) {
                valueHighlightClass = 'text-tmt-red'; // Negative % or $
            }
        }
    }

    // Return the HTML structure for the row
    return `<div class="flex justify-between items-center py-2 px-3 hover:bg-gray-700/10 rounded-md transition duration-150">
                <span class="text-gray-400 text-sm">${label}</span>
                <span class="${valueHighlightClass} text-sm">${displayValue}</span>
            </div>`;
}

// --- Load TradingView Chart ---
function loadTradingViewChart(ticker) {
    const container = document.getElementById('tradingview-chart-container');
    if (container && ticker) {
        container.innerHTML = ''; // Clear previous chart
        new TradingView.widget({
            "container_id": "tradingview-chart-container",
            "symbol": ticker,
            "interval": "D", "timezone": "America/New_York", "theme": "dark",
            "style": "1", "locale": "en", "toolbar_bg": "#101010",
            "enable_publishing": false, "with_library_header": false,
            "allow_symbol_change": true, "save_image": false,
            "studies": ["RSI@tv-basicstudies", "MACD@tv-basicstudies"],
            "show_popup_button": true, "popup_width": "1000", "popup_height": "650",
            "hide_side_toolbar": false, "range": "1M",
            "watchlist": [ticker, "BRK-B", "MSFT", "GOOGL"], // Corrected BRK.B
            "details": false, "hotlist": false, "calendar": false, "news": ["headlines"]
        });
    } else if (container) {
        container.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">TradingView Chart requires a valid ticker.</div>';
    }
}

// --- Render Community Sentiment Donut Chart ---
function renderCommunitySentiment(sentiment) {
    const buyPct = sentiment.buy?.toFixed(0) ?? 0;
    const holdPct = sentiment.hold?.toFixed(0) ?? 0;
    const sellPct = sentiment.sell?.toFixed(0) ?? 0;
    const totalVotes = sentiment.total ?? 0;

    // Determine label and percentage for center text
    let largestLabel = 'N/A';
    let largestValue = 0;
    if (totalVotes > 0) {
        if (sentiment.buy >= sentiment.hold && sentiment.buy >= sentiment.sell) {
            largestValue = sentiment.buy; largestLabel = 'Buy';
        } else if (sentiment.hold >= sentiment.buy && sentiment.hold >= sentiment.sell) {
            largestValue = sentiment.hold; largestLabel = 'Hold';
        } else {
            largestValue = sentiment.sell; largestLabel = 'Sell';
        }
    }

    // === *** FIX: RE-ORDER OFFSETS (Buy -> Hold -> Sell) *** ===
    // This puts Buy on the right, Hold in the middle, Sell on the left
    const buyOffset = 0; // Buy starts at 0 (right side)
    const holdOffset = parseFloat(buyPct); // Hold starts after Buy
    const sellOffset = parseFloat(buyPct) + parseFloat(holdPct); // Sell starts after Buy + Hold

    // Update center text elements
    const percentEl = document.getElementById('sentiment-donut-percent');
    const labelEl = document.getElementById('sentiment-donut-label');
    if (percentEl) percentEl.textContent = totalVotes > 0 ? `${largestValue.toFixed(0)}%` : 'N/A';
    if (labelEl) labelEl.textContent = largestLabel;

    // Update legend text elements
    const buyTextEl = document.getElementById('sentiment-buy-text');
    const holdTextEl = document.getElementById('sentiment-hold-text');
    const sellTextEl = document.getElementById('sentiment-sell-text');
    if (buyTextEl) buyTextEl.textContent = `${buyPct}%`;
    if (holdTextEl) holdTextEl.textContent = `${holdPct}%`;
    if (sellTextEl) sellTextEl.textContent = `${sellPct}%`;

    // Update SVG circle stroke attributes
    const sellCircle = document.getElementById('sentiment-sell-circle');
    const holdCircle = document.getElementById('sentiment-hold-circle');
    const buyCircle = document.getElementById('sentiment-buy-circle');

    if (sellCircle) {
        sellCircle.setAttribute('stroke-dasharray', `${sellPct} ${100 - sellPct}`);
        sellCircle.setAttribute('stroke-dashoffset', `-${sellOffset}`); // Use new sellOffset (starts after Buy + Hold)
        sellCircle.setAttribute('stroke', totalVotes > 0 ? '#EF4444' : '#4B5563'); // Use tmt-red or gray
    }
    if (holdCircle) {
        holdCircle.setAttribute('stroke-dasharray', `${holdPct} ${100 - holdPct}`);
        holdCircle.setAttribute('stroke-dashoffset', `-${holdOffset}`); // Use new holdOffset (starts after Buy)
        holdCircle.setAttribute('stroke', totalVotes > 0 ? '#FACC15' : 'transparent'); // Use tmt-yellow or hide
    }
    if (buyCircle) {
        buyCircle.setAttribute('stroke-dasharray', `${buyPct} ${100 - buyPct}`);
        buyCircle.setAttribute('stroke-dashoffset', `${buyOffset}`); // Use new buyOffset (starts at 0)
        buyCircle.setAttribute('stroke', totalVotes > 0 ? '#00A99D' : 'transparent'); // Use tmt-primary or hide
    }
    // === *** END FIX *** ===

    // Ensure base circle is visible when no data
     const baseCircle = sellCircle?.previousElementSibling; // Assuming base circle is right before sellCircle
     if(baseCircle && totalVotes === 0) {
         baseCircle.setAttribute('stroke', '#4B5563'); // Ensure gray background is visible
     } else if (baseCircle) {
         baseCircle.setAttribute('stroke', '#1F2937'); // Default dark background
     }
}

// === NEW FUNCTION FOR SUMMARY TOGGLE (FIX 3) ===
/**
 * Sets up the "Show more" / "Show less" toggle for the company summary.
 * It checks if the text is overflowing before showing the button.
 */
function setupSummaryToggle() {
    const summaryP = document.getElementById('company-summary');
    const toggleBtn = document.getElementById('toggle-summary-btn');

    if (!summaryP || !toggleBtn) return;

    // Reset to default state
    summaryP.classList.add('summary-clamped');
    toggleBtn.textContent = 'Show more';
    toggleBtn.classList.add('hidden');
    let isExpanded = false;

    // Check if the text is overflowing its clamped container
    // We use a small timeout to ensure the browser has rendered the clamp
    setTimeout(() => {
        // Check scrollHeight vs clientHeight to see if text is truncated
        const isOverflowing = summaryP.scrollHeight > summaryP.clientHeight;

        if (isOverflowing) {
            toggleBtn.classList.remove('hidden'); // Show the button

            // Remove previous listener if any (to prevent multiple)
            const newBtn = toggleBtn.cloneNode(true);
            toggleBtn.parentNode.replaceChild(newBtn, toggleBtn);

            newBtn.addEventListener('click', () => {
                isExpanded = !isExpanded;
                if (isExpanded) {
                    summaryP.classList.remove('summary-clamped');
                    newBtn.textContent = 'Show less';
                } else {
                    summaryP.classList.add('summary-clamped');
                    newBtn.textContent = 'Show more';
                }
            });
        } else {
            // If not overflowing, hide the button and remove the clamp
            toggleBtn.classList.add('hidden');
            summaryP.classList.remove('summary-clamped');
        }
    }, 100); // 100ms delay to allow for render
}
// === END NEW FUNCTION ===


// --- User Rating Interaction Logic ---
function selectUserRating(score) {
    selectedUserRating = score; // Store the selected score
    updateUserRatingDisplay(); // Update the UI
    // Uncheck the "Cannot Rate" checkbox if a specific rating is chosen
    const checkbox = document.getElementById('cannot-rate-checkbox');
    if (checkbox) checkbox.checked = false;
    const checkboxIcon = document.getElementById('checkbox-icon');
    if (checkboxIcon) checkboxIcon.classList.add('hidden');
}

function toggleCannotRate() {
    const checkbox = document.getElementById('cannot-rate-checkbox');
    const checkboxIcon = document.getElementById('checkbox-icon');
    if (checkbox && checkboxIcon) {
        if (checkbox.checked) {
            selectedUserRating = 0; // Set rating to 0 (represents "Cannot Rate")
            checkboxIcon.classList.remove('hidden'); // Show checkmark
        } else {
            // If unchecked, don't change selectedUserRating (it might be 1-5 or already 0)
            selectedUserRating = 0;
            checkboxIcon.classList.add('hidden'); // Hide checkmark
        }
        updateUserRatingDisplay(); // Update UI based on the new state
    }
}

function updateUserRatingDisplay() {
    const ratingCircles = document.querySelectorAll('.user-rating-circle');
    const userRatingLabel = document.getElementById('user-rating-selection-label');
    const cannotRateCheckbox = document.getElementById('cannot-rate-checkbox');

    if (!userRatingLabel || !cannotRateCheckbox) return; // Exit if elements are missing

    // Reset styles on all user rating circles
    ratingCircles.forEach(circle => {
        circle.classList.remove('ring-2', 'ring-offset-2', 'ring-offset-tmt-bg', 'ring-tmt-red', 'ring-tmt-orange', 'ring-tmt-yellow', 'ring-tmt-blue', 'ring-tmt-green');
        circle.classList.add('border-2'); // Ensure border is visible by default
    });

    // Get rating details using the *standardized* function defined in loadStockData
    const details = getTMTInternalRating(selectedUserRating); // Use the current selected rating

    if (selectedUserRating > 0) {
        // Apply ring highlight to the selected circle
        const selectedCircle = document.getElementById(`user-rating-${selectedUserRating}`);
        if (selectedCircle && details) {
            selectedCircle.classList.add('ring-2', 'ring-offset-2', 'ring-offset-tmt-bg', details.ring);
            selectedCircle.classList.remove('border-2'); // Hide border when ring is active
            userRatingLabel.textContent = details.label;
            userRatingLabel.className = `text-2xl font-bold ${details.textColor} h-8 flex items-center justify-center`;
        }
    } else if (cannotRateCheckbox.checked) {
        // Style for "Cannot Rate"
        userRatingLabel.textContent = "Cannot Rate";
        // Use a neutral or specific color for this state if desired
        userRatingLabel.className = `text-2xl font-bold text-gray-400 h-8 flex items-center justify-center`;
    } else {
        // Default state: No selection, checkbox unchecked
        userRatingLabel.textContent = ""; // Clear the label
        userRatingLabel.className = `text-2xl font-bold text-gray-400 h-8 flex items-center justify-center`;
    }
}


// --- Search Suggestions Logic ---
async function fetchRealSuggestions(query) {
    if (!query || query.length < 1) return []; // Basic validation

    try {
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
                `<div class="suggestion-item" onclick="selectSuggestion('${suggestion.ticker}')">${suggestion.text}</div>`
            ).join('');
            suggestionsContainer.classList.remove('hidden'); // Show container
        } else {
            suggestionsContainer.classList.add('hidden'); // Hide if no suggestions
            suggestionsContainer.innerHTML = '';
        }
    }, 250); // 250ms debounce
}

// --- Selecting a Suggestion ---
function selectSuggestion(ticker) {
    const targetUrl = `stock_dashboard.html?ticker=${ticker}`;
    // Use global navigation function if available
    if (typeof checkAccessAndRedirect === 'function') {
        checkAccessAndRedirect(targetUrl);
    } else {
        console.warn("checkAccessAndRedirect not found, using basic redirect.");
        window.location.href = targetUrl;
    }
    // Hide all suggestion dropdowns after selection
    document.querySelectorAll('.search-suggestions').forEach(s => s.classList.add('hidden'));
}
window.selectSuggestion = selectSuggestion; // Make accessible globally for onclick


// ====================================================================
// === 4. MAIN PAGE LOAD & RENDER LOGIC ===============================
// ====================================================================

// --- Standardized Helper Function for Rating Styles (uses Tailwind config) ---
// Define this globally or ensure it's accessible within loadStockData scope
function getTMTInternalRating(score) {
    score = parseInt(score) || 0; // Ensure score is a number, default to 0
    switch (score) {
        case 1: return { label: "Strong Sell", bgColor: "bg-tmt-red", ring: "ring-tmt-red", textColor: "text-tmt-red", number: 1 };
        case 2: return { label: "Sell", bgColor: "bg-tmt-orange", ring: "ring-tmt-orange", textColor: "text-tmt-orange", number: 2 };
        case 3: return { label: "Hold", bgColor: "bg-tmt-yellow", ring: "ring-tmt-yellow", textColor: "text-tmt-yellow", number: 3 };
        case 4: return { label: "Buy", bgColor: "bg-tmt-blue", ring: "ring-tmt-blue", textColor: "text-tmt-blue", number: 4 };
        case 5: return { label: "Strong Buy", bgColor: "bg-tmt-green", ring: "ring-tmt-green", textColor: "text-tmt-green", number: 5 };
        default: return { label: "N/A", bgColor: "bg-gray-500", ring: "ring-gray-400", textColor: "text-gray-400", number: 0 };
    }
}


async function loadStockData() {
    console.log("loadStockData started.");

    const urlParams = new URLSearchParams(window.location.search);
    const tickerFromUrl = urlParams.get('ticker');
    currentTicker = tickerFromUrl ? tickerFromUrl.trim().toUpperCase() : null;
    console.log("Current Ticker:", currentTicker);

    // Get references to main containers and search elements
    const mainContentContainer = document.getElementById('stock-details-container');
    const searchPromptContainer = document.getElementById('search-prompt-container');
    const headerSearchForm = document.getElementById('header-search-form');
    const mobileSearchForm = document.getElementById('mobile-search-form');
    const desktopInput = document.getElementById('stock-search-input');
    const mobileInput = document.getElementById('stock-search-input-mobile');
    const mainInput = document.getElementById('main-search-input');

    // Basic check for essential elements
    if (!mainContentContainer || !searchPromptContainer || !headerSearchForm || !mobileSearchForm) {
        console.error("Critical layout elements missing. Cannot render page.");
        return;
    }

    // --- Conditional Rendering based on Ticker Presence ---
    if (!currentTicker) {
        // No ticker: Show search prompt, hide details and header search bars
        mainContentContainer.classList.add('hidden');
        searchPromptContainer.classList.remove('hidden');
        // *** FIX 1 (from previous turn): Remove 'sm:block' to hide on all screens. 'hidden' class from HTML is respected.
        headerSearchForm.classList.remove('sm:block'); 
        mobileSearchForm.classList.add('hidden'); // This is the one from the *body*, not header
        document.getElementById('page-title').textContent = 'TMT Stock Analyzer | Search';
        // Clear all search inputs
        if(mainInput) mainInput.value = '';
        if(desktopInput) desktopInput.value = '';
        if(mobileInput) mobileInput.value = '';
        return; // Stop further execution
    } else {
        // Ticker present: Hide search prompt, show details and header search bars
        searchPromptContainer.classList.add('hidden');
        mainContentContainer.classList.remove('hidden');
        // *** FIX 1 (from previous turn): Add 'sm:block' to ensure it shows on desktop. 'hidden' class from HTML hides on mobile.
        headerSearchForm.classList.add('sm:block'); 
        // *** FIX 2: Show the in-body mobile search form ***
        mobileSearchForm.classList.remove('hidden'); 
        
        // Pre-fill search bars, clear main prompt input
        const tickerValue = currentTicker || '';
        if(mainInput) mainInput.value = '';
        if(desktopInput) desktopInput.value = tickerValue;
        if(mobileInput) mobileInput.value = tickerValue;
    }

    // --- Start Data Fetching and Rendering ---
    document.getElementById('page-title').textContent = `Loading ${currentTicker}... | TMT Dashboard`;
    document.getElementById('company-summary').textContent = 'Loading company data...'; // Placeholder

    try {
        const [data, sentiment] = await Promise.all([
            fetchStockData(currentTicker),
            fetchCommunitySentiment(currentTicker)
        ]);
        console.log("Rendering data for:", currentTicker, data);

        // --- Update Header Elements ---
        document.getElementById('page-title').textContent = `${currentTicker} (${data.companyName || 'Details'}) | TMT Dashboard`;
        document.getElementById('stock-ticker').textContent = currentTicker;
        document.getElementById('stock-company').textContent = data.companyName;
        document.getElementById('current-price').textContent = data.currentPrice !== "N/A" ? `$${data.currentPrice}` : "N/A";
        const priceChangeEl = document.getElementById('price-change');
        if (priceChangeEl) {
            priceChangeEl.className = `text-lg font-semibold ${data.changeClass}`;
            priceChangeEl.textContent = (data.priceChange !== "N/A" && data.changePercent !== "N/A") ? `${data.priceChange} (${data.changePercent})` : "N/A";
        }
        const priceIconEl = document.getElementById('price-icon');
         if (priceIconEl) {
             priceIconEl.textContent = data.changeIcon;
             priceIconEl.className = `text-lg ${data.changeClass}`; // Match icon color to text
         }

        // --- Update Main Content ---
        document.getElementById('company-summary').textContent = data.summary;
        
        // === FIX 3: CALL THE SUMMARY TOGGLE FUNCTION ===
        setupSummaryToggle(); 
        // === END FIX 3 ===

        loadTradingViewChart(currentTicker);
        renderCommunitySentiment(sentiment);
        
        // --- *** MODIFIED: Calculate 5Yr Avg P/E *** ---
        let avgPe5Yr = "N/A";
        const currentPriceNum = parseFloat(data.currentPrice);
        const avgEps5YrNum = parseFloat(String(data.avgEps5Yr).replace(/[^0-9.-]+/g,"")); 
        if (isNumber(currentPriceNum) && isNumber(avgEps5YrNum) && avgEps5YrNum !== 0) {
            avgPe5Yr = (currentPriceNum / avgEps5YrNum).toFixed(2);
        }

        // --- Render Metric Panels ---
        const leftMetricsHtml = [
            createMetricRow('Market Cap', data.marketCap), createMetricRow('Revenue (TTM)', data.revenueTTM),
            createMetricRow('Net Income (TTM)', data.netIncomeTTM), createMetricRow('5Yr Avg Net Income', data.avgNetIncome5Yr),
            createMetricRow('P/E (TTM)', data.peRatio),
            createMetricRow('5Yr Avg P/E', avgPe5Yr), // *** ADDED THIS LINE ***
            createMetricRow('EPS (TTM)', data.epsTTM, true), 
            createMetricRow('5Yr Avg EPS', data.avgEps5Yr, true), 
            createMetricRow('P/S (TTM)', data.priceToSales), createMetricRow('Profit Margin (TTM)', data.profitMarginTTM),
            createMetricRow('5Yr Avg Profit Margin', data.avgProfitMargin5Yr), createMetricRow('Gross Profit Margin (TTM)', data.grossProfitMarginTTM),
            createMetricRow('3Yr Compound Revenue Growth', data.compoundRevenueGrowth3Yr, true),
            createMetricRow('5Yr Compound Revenue Growth', data.compoundRevenueGrowth5Yr, true),
            createMetricRow('10Yr Compound Revenue Growth', data.compoundRevenueGrowth10Yr, true),
            createMetricRow('5yr Outstanding Share Growth', data.compoundShareGrowth5Yr, true),
        ].join('');
        document.getElementById('left-metrics-panel').innerHTML = leftMetricsHtml;

        const rightMetricsHtml = [
            createMetricRow('Free Cash Flow (TTM)', data.freeCashFlowTTM), createMetricRow('5Yr Avg FCF', data.avgFCF5Yr),
            createMetricRow('Cash Flow Per Share (TTM)', data.cashFlowPerShare, true), createMetricRow('5Yr Avg CF per Share', data.avgCashFlowPerShare5Yr, true),
            createMetricRow('Revenue Per Share (TTM)', data.revenuePerShare), createMetricRow('5Yr Avg Revenue per Share', data.avgRevenuePerShare5Yr), // Corrected typo
            createMetricRow('Price/FCF (TTM)', data.priceToFCF),
            createMetricRow('Dividend Yield', data.dividendYield, true), createMetricRow('Dividends Paid', data.dividendsPaid),
            // createMetricRow('Forward Dividend Yield', data.forwardDividendYield), // *** DELETED THIS LINE ***
            createMetricRow('Enterprise Value', data.enterpriseValueTraditional),
            createMetricRow('Return on Invested Capital (TTM)', data.returnOnInvestedCapitalTTM, true),
            createMetricRow('52 WK High', data.fiftyTwoWeekHigh), createMetricRow('52 WK Low', data.fiftyTwoWeekLow),
            createMetricRow('ATH', data.ath),
            createMetricRow('Net Assets', data.netAssets, true), // *** ADDED THIS LINE ***
            // *** NEW FIELD ADDED HERE - LABEL CHANGED TO SHOW PERCENTAGE ***
            createMetricRow('Price/Net Assets %', data.priceToNetAssets, true), 
        ].join('');
        document.getElementById('right-metrics-panel').innerHTML = rightMetricsHtml;

        // --- Render TMT Rating Box and Bar ---
        const tmtRatingDetails = getTMTInternalRating(data.ratingScore); // Use standardized function
        const ratingLabelEl = document.getElementById('current-rating-label');
        if (ratingLabelEl) ratingLabelEl.textContent = tmtRatingDetails.label;
        const ratingBoxEl = document.getElementById('current-rating-box');
        if (ratingBoxEl) {
            // Reset classes carefully, keeping base styles
            ratingBoxEl.className = 'p-3 rounded-xl text-tmt-bg font-extrabold text-xl shadow-inner transition duration-300';
            ratingBoxEl.classList.add(tmtRatingDetails.bgColor); // Apply correct background
        }

        // --- *** CORRECTED LOOP FOR HORIZONTAL BAR *** ---
        for (let i = 1; i <= 5; i++) {
            const circle = document.getElementById(`rating-circle-${i}`);
            if (!circle) continue; // Skip if element not found

            // Get style details for the segment number 'i'
            const segmentDetails = getTMTInternalRating(i);

            // Reset classes, keeping essential layout/transition classes
            circle.className = 'w-1/5 h-full flex items-center justify-center transition duration-300';

            // Always apply the correct background color for this segment
            circle.classList.add(segmentDetails.bgColor);

            // Apply rounding to the end segments
            if (i === 1) circle.classList.add('rounded-l-full');
            if (i === 5) circle.classList.add('rounded-r-full');

            // Apply the ring highlight *only* if this segment matches the actual TMT score
            if (i === tmtRatingDetails.number) {
                circle.classList.add(
                    'ring-2',                // Add ring outline
                    'ring-offset-2',         // Add offset space
                    'ring-offset-tmt-bg',    // Offset color matches main background
                    tmtRatingDetails.ring    // Use the ring color corresponding to the actual TMT score
                );
            }
        }
        // --- END OF RENDER ---

        const valuationLink = document.getElementById('valuation-cta');
        if (valuationLink) {
            valuationLink.href = `stock_valuation.html?ticker=${currentTicker}`;
        }

        updateUserRatingDisplay();

    } catch (error) {
        console.error("Error loading or rendering stock data:", error);
        // Display an error message to the user if appropriate
        document.getElementById('company-summary').textContent = 'Failed to load stock data. Please try again or search for another ticker.';
        // Optionally hide other sections or show specific error UI
    }
}


/**
 * Fetches snapshot data from Yahu (Yahoo Finance) RapidAPI.
 */
async function fetchYahuSnapshot(ticker) {
    // This now calls the new server route that returns raw MarketCap and NetIncome
    // NOTE: This must match the route added to server.js
    const url = `/api/stock-yahu-snapshot/${ticker}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.message || `Backend snapshot error! Status: ${response.status}`);
        }
        
        const result = await response.json();
        if (result.success && result.data) {
            // The data structure returned by the server snapshot route is designed
            // to be used here.
            return result.data;
        }
        throw new Error(result.message || "Failed to parse snapshot data from backend.");

    } catch (error) {
        console.error(`Error fetching Yahu snapshot for ${ticker}:`, error);
        return null; // Return null on error
    }
}


// ====================================================================
// === 5. EVENT HANDLERS & GLOBAL FUNCTIONS ==========================
// ====================================================================

// --- START: NEW WATCHLIST FUNCTION ---

/**
 * Handles adding the current stock to the user's watchlist.
 */
async function addToWatchlist() {
    // Requires global functions: getAuthStatus(), showMessage() (from script.js)
    // Requires global var: currentTicker (from this file)
    
    if (typeof getAuthStatus !== 'function' || typeof showMessage !== 'function') {
        console.error("Global auth/message functions not found. Is script.js loaded?");
        return;
    }

    if (!getAuthStatus()) {
        return showMessage("Login required to add to watchlist.", true);
    }

    if (!currentTicker) {
        return showMessage("No stock loaded. Cannot add to watchlist.", true);
    }

    const token = localStorage.getItem('tmt_auth_token');
    // Assumes your API endpoint is /api/user/watchlist/add
    const apiUrl = '/api/user/watchlist/add'; 

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ ticker: currentTicker }),
        });
        const result = await response.json();

        if (response.ok && result.success) {
            showMessage(`Added ${currentTicker} to your watchlist!`, false);
            
            // Update button to show "Added" state
            const btn = document.getElementById('add-to-watchlist-btn');
            if (btn) {
                btn.innerHTML = `<i data-lucide="check" class="w-4 h-4"></i><span class="text-sm hidden sm:block">Added</span>`;
                btn.classList.add('bg-tmt-primary', 'text-tmt-bg');
                btn.disabled = true;
                // Re-render the new icon
                if (typeof lucide !== 'undefined') lucide.createIcons(); 
            }
        } else {
            // Handle specific error like "Already in watchlist"
            showMessage(result.message || 'Server error saving to watchlist.', true);
        }
    } catch (error) {
        console.error("Network error saving to watchlist:", error);
        showMessage('Network error. Could not save to watchlist.', true);
    }
}
// --- END: NEW WATCHLIST FUNCTION ---


// --- Button Action Handler (Includes Rating Save) ---
async function buttonAction(type) {
    if (typeof showMessage !== 'function') {
        console.error("showMessage function not available."); return;
    }

    if (type === 'rate-stock') {
        if (typeof getAuthStatus !== 'function' || !getAuthStatus()) {
            return showMessage("Login required to save your rating.", true);
        }

        let ratingValue = null; // Default to null if nothing selected
        if (selectedUserRating > 0) {
            ratingValue = selectedUserRating;
        } else {
            const checkbox = document.getElementById('cannot-rate-checkbox');
            if (checkbox && checkbox.checked) ratingValue = 0; // 0 means "Cannot Rate"
        }

        if (ratingValue === null) {
            return showMessage("Select a rating or 'Cannot Rate' before saving.", true);
        }
        if (!currentTicker) {
            return showMessage("No stock loaded. Cannot save rating.", true);
        }

        const token = localStorage.getItem('tmt_auth_token');
        const apiUrl = '/api/user/save-rating';

        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ ticker: currentTicker, rating: ratingValue }),
            });
            const result = await response.json();

            if (response.ok && result.success) {
                const label = ratingValue === 0 ? "Cannot Rate" : (getTMTInternalRating(ratingValue)?.label || 'Rating');
                showMessage(`Your '${label}' rating for ${currentTicker} saved!`, false);
                // Refresh community sentiment display
                fetchCommunitySentiment(currentTicker).then(renderCommunitySentiment);
            } else {
                showMessage(result.message || 'Server error saving rating.', true);
            }
        } catch (error) {
            console.error("Network error saving rating:", error);
            showMessage('Network error. Could not save rating.', true);
        }
        return; // Rating action handled
    }

    // --- Handle other simulated actions ---
    const messageBox = document.getElementById('message-box');
    const messageText = document.getElementById('message-text');
    if (!messageBox || !messageText) return;

    let message = "Action simulated."; // Default message
    if (type === 'search-error') message = "Please enter a stock ticker.";
    else if (['real-estate', 'retirement', 'economics', 'login', '1D', '1W', '1M', '1Y'].includes(type)) {
        message = `${type.charAt(0).toUpperCase() + type.slice(1)} action simulated.`;
    }

    // Show feedback message
    messageText.textContent = message;
    messageBox.classList.remove('hidden', 'opacity-0');
    messageBox.classList.add('opacity-100');
    setTimeout(() => { // Auto-hide
        messageBox.classList.remove('opacity-100');
        messageBox.classList.add('opacity-0');
        setTimeout(() => { messageBox.classList.add('hidden'); }, 300);
    }, 3000);
}


// --- Search Form Submission Handler ---
function searchStock(event) {
    if (event) event.preventDefault(); // Prevent page reload
    console.log("searchStock triggered.");

    if (typeof checkAccessAndRedirect !== 'function') {
        // --- MODIFIED: checkAccessAndRedirect is in script.js, which is now loaded.
        // This check should pass, but if it fails, it's a real error.
        console.error("Navigation function checkAccessAndRedirect not found!");
        if (typeof showMessage === 'function') showMessage("Navigation error.", true);
        return;
    }

    // Determine ticker from the active input field
    const desktopInput = document.getElementById('stock-search-input');
    const mobileInput = document.getElementById('stock-search-input-mobile');
    const mainInput = document.getElementById('main-search-input');
    let ticker = '';

    // Prioritize visible input with value
    if (mainInput && mainInput.offsetParent !== null && mainInput.value.trim()) {
        ticker = mainInput.value.trim().toUpperCase();
    } else if (desktopInput && desktopInput.offsetParent !== null && desktopInput.value.trim()) {
        // --- MODIFIED: Added offsetParent check for new header
        ticker = desktopInput.value.trim().toUpperCase();
    } else if (mobileInput && mobileInput.offsetParent !== null && mobileInput.value.trim()) {
        // --- MODIFIED: Added offsetParent check
        ticker = mobileInput.value.trim().toUpperCase();
    }

    // Hide suggestions immediately
    document.querySelectorAll('.search-suggestions').forEach(s => s.classList.add('hidden'));

    if (!ticker) {
        buttonAction('search-error'); // Show error if no ticker
        return;
    }

    // Navigate
    const targetUrl = `stock_dashboard.html?ticker=${ticker}`;
    console.log("Navigating to:", targetUrl);
    checkAccessAndRedirect(targetUrl);
}

// ====================================================================
// === 6. INITIALIZATION & EVENT LISTENERS ===========================
// ====================================================================

document.addEventListener('DOMContentLoaded', () => {
    loadStockData(); // Initial data load

    // Attach submit listeners to forms
    document.getElementById('header-search-form')?.addEventListener('submit', searchStock);
    document.getElementById('mobile-search-form')?.addEventListener('submit', searchStock);
    document.getElementById('main-search-input')?.closest('form')?.addEventListener('submit', searchStock); // Main search form

    // Attach keyup listeners for search suggestions
    document.getElementById('stock-search-input')?.addEventListener('keyup', (e) => handleSearchInput(e, 'stock-search-suggestions'));
    document.getElementById('stock-search-input-mobile')?.addEventListener('keyup', (e) => handleSearchInput(e, 'mobile-search-suggestions'));
    document.getElementById('main-search-input')?.addEventListener('keyup', (e) => handleSearchInput(e, 'main-search-suggestions'));

    // Global click listener to hide suggestions when clicking outside
    document.addEventListener('click', (event) => {
        // Check if the click was outside any search container
        const isOutside = !event.target.closest('.search-container');
        if (isOutside) {
            document.querySelectorAll('.search-suggestions').forEach(s => s.classList.add('hidden'));
        }
    });

    // --- MODIFIED: Call updateAuthUI from script.js ---
    // This will correctly show/hide the login/user menu in the new header
    if (typeof updateAuthUI === 'function') {
        updateAuthUI();
    }
    // Also fetch user data if logged in (for profile modal)
    if (typeof getAuthStatus === 'function' && getAuthStatus() && typeof fetchUserData === 'function') {
        fetchUserData();
    }
});

// Expose necessary functions globally for HTML onclick attributes
window.selectUserRating = selectUserRating;
window.toggleCannotRate = toggleCannotRate;
window.buttonAction = buttonAction;
window.searchStock = searchStock;       // Keep for potential direct calls if needed
window.handleSearchInput = handleSearchInput; // Keep for potential direct calls if needed
window.selectSuggestion = selectSuggestion;   // Must be global for onclick in suggestions
window.addToWatchlist = addToWatchlist; // <-- ADDED