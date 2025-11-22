// watchlist.js - FINAL (Cache Removed)

/**
 * watchlist.js
 * Handles fetching, displaying, adding, and removing stocks from the user's watchlist.
 */

// NEW: Waiter function to ensure script.js is loaded and its globals are ready
function waitForGlobals() {
    if (typeof window.getAuthStatus === 'function') {
        // Globals are ready, run the setup
        console.log("Watchlist: script.js loaded. Running setup...");
        setupWatchlistPage();
    } else {
        // Globals not ready, wait 100ms and try again
        console.warn("Watchlist: Waiting for script.js globals...");
        setTimeout(waitForGlobals, 100);
    }
}

// FIX: Call the waiter function when the DOM is ready.
document.addEventListener('DOMContentLoaded', waitForGlobals);

// *** ALL CODE BELOW IS NOW IN THE GLOBAL SCOPE (NOT inside DOMContentLoaded) ***

/**
 * Sets up the watchlist page: checks auth, adds listeners, fetches initial data.
 */
async function setupWatchlistPage() {
    // Check Authentication using the global function from script.js
    if (!getAuthStatus()) {
        // Display empty state for logged-out users
        const watchlistContainer = document.getElementById('watchlist-container');
        if (watchlistContainer) {
            watchlistContainer.innerHTML = '<p class="text-gray-500 text-center py-6">Please log in to see your watchlist.</p>';
        }
        // Disable add form if logged out
        const addForm = document.getElementById('add-stock-form');
        if (addForm) {
            addForm.querySelector('input').disabled = true;
            addForm.querySelector('button').disabled = true;
        }

        // Hide the '+' buttons if logged out
        const showButton = document.getElementById('show-add-stock-form');
        const showButtonDesktop = document.getElementById('show-add-stock-form-desktop');
        if(showButton) showButton.classList.add('hidden');
        if(showButtonDesktop) showButtonDesktop.classList.add('hidden');
        
        return; 
    }
    
    // Add event listener for the "Add Stock" form
    const addStockForm = document.getElementById('add-stock-form');
    if (addStockForm) {
        addStockForm.addEventListener('submit', handleAddStockSubmit);
    }

    // --- START: Add Stock Form Toggle Logic ---
    const showButton = document.getElementById('show-add-stock-form');
    const showButtonDesktop = document.getElementById('show-add-stock-form-desktop');
    const hideButton = document.getElementById('hide-add-stock-form');
    const addStockContainer = document.getElementById('add-stock-container');

    if (hideButton && addStockContainer) {
        // Listener for the 'X' button inside the box
        hideButton.addEventListener('click', () => {
            addStockContainer.classList.add('hidden');
        });

        // Listener for the mobile '+' button
        if (showButton) {
            showButton.addEventListener('click', () => {
                addStockContainer.classList.remove('hidden');
            });
        }
        // Listener for the desktop '+' button
        if (showButtonDesktop) {
            showButtonDesktop.addEventListener('click', () => {
                addStockContainer.classList.remove('hidden');
            });
        }
    }
    // --- END: Add Stock Form Toggle Logic ---

    // Fetch and render the initial watchlist
    await loadWatchlist();

     // Global click listener to hide suggestions when clicking outside
     document.addEventListener('click', (event) => {
        const isOutside = !event.target.closest('.search-container');
        if (isOutside) {
            document.querySelectorAll('.search-suggestions').forEach(s => s.classList.add('hidden'));
        }
    });
}

/**
 * Fetches the user's watchlist from the backend and renders it.
 */
async function loadWatchlist() {
    const watchlistContainer = document.getElementById('watchlist-container');
    if (!watchlistContainer) return;

    // --- FIX: Client-side cache removed ---
    // Always show loading message and fetch from server.
    watchlistContainer.innerHTML = '<p class="text-gray-500 text-center py-6">Loading your watchlist...</p>';

    try {
        const token = localStorage.getItem('tmt_auth_token');
        if (!token) throw new Error("Authentication token not found.");

        // --- BACKEND CALL 1: Get Watchlist Tickers ---
        let response;
        try {
             response = await fetch(`${API_BASE_URL}/api/user/watchlist`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (e) {
             console.error("Fetch Error (api/user/watchlist):", e.message);
             throw new Error(`Error connecting to server. Please try again. (Code: W101)`);
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Failed to fetch watchlist' }));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        if (result.success && Array.isArray(result.data)) {
            const tickers = result.data;
            
            if (tickers.length === 0) {
                // Render empty state if no tickers
                renderWatchlist([]);
                return;
            }

            // --- BACKEND CALL 2: Get Details for Tickers ---
            const detailedStocks = await fetchStockDetailsBatch(tickers, token); 
            
            // --- FIX: Client-side cache save REMOVED ---
            
            // Render fresh data
            renderWatchlist(detailedStocks);

        } else {
             throw new Error(result.message || "Invalid watchlist data format received.");
        }

    } catch (error) {
        console.error("Error loading watchlist:", error);
        if (typeof showMessage === 'function') {
            showMessage(error.message || "Could not load watchlist.", true);
        }
        // --- FIX: Simplified error display ---
        watchlistContainer.innerHTML = `<p class="text-red-500 text-center py-6">Error loading watchlist: ${error.message}</p>`;
    }
}


/**
 * Renders the watchlist items in the container.
 * @param {Array} stocks - Array of stock objects { ticker, name, price, changePercent, changeClass }
 */
function renderWatchlist(stocks) {
    const watchlistContainer = document.getElementById('watchlist-container');
    if (!watchlistContainer) return;

    watchlistContainer.innerHTML = ""; // Clear previous content

    if (!stocks || stocks.length === 0) {
        watchlistContainer.innerHTML = '<p class="text-gray-500 text-center py-6">Your watchlist is empty. Add stocks using the form above.</p>';
        return;
    }

    stocks.forEach(stock => {
        const stockElement = document.createElement('div');
        stockElement.className = "group bg-tmt-card rounded-lg shadow-lg border border-gray-700/50 relative overflow-hidden";
        stockElement.id = `watchlist-item-${stock.ticker}`;

        const change = parseFloat(stock.changePercent);
        let changeClass = 'text-gray-400';
        let changeIcon = '▬';
        
        if (!isNaN(change)) {
            if (change > 0) {
                changeIcon = '▲';
                changeClass = 'text-green-500';
            } else if (change < 0) {
                changeIcon = '▼';
                changeClass = 'text-red-500';
            }
        }
        
        const priceDisplay = stock.price ? `$${stock.price}` : 'N/A';
        const changeDisplay = stock.changePercent ? `${changeIcon} ${Math.abs(change).toFixed(2)}%` : '';

        stockElement.innerHTML = `
            <div class="absolute inset-y-0 right-0 w-16 bg-red-600 flex items-center justify-center transition-transform duration-300 ease-in-out transform translate-x-full group-hover:translate-x-0">
                <button 
                    onclick="handleRemoveStock('${stock.ticker}')" 
                    class="p-2 text-white hover:text-gray-200"
                    title="Remove ${stock.ticker}">
                    <i data-lucide="trash-2" class="w-6 h-6"></i>
                </button>
            </div>

            <div class="relative bg-tmt-card p-3 flex items-center justify-between gap-4 transition-transform duration-300 ease-in-out transform group-hover:-translate-x-16">
                <div class="flex-grow min-w-0">
                    <a href="javascript:void(0)" onclick="checkAccessAndRedirect('stock_dashboard.html?ticker=${stock.ticker}')" class="block">
                        <h3 class="text-lg font-bold text-tmt-primary truncate">${stock.ticker}</h3>
                        <p class="text-sm text-gray-400 truncate">${stock.name || 'N/A'}</p>
                    </a>
                </div>
                <div class="text-right flex-shrink-0">
                    <p class="text-lg font-semibold text-white">${priceDisplay}</p>
                    <p class="text-sm ${changeClass}">${changeDisplay}</p>
                </div>
            </div>
        `;

        watchlistContainer.appendChild(stockElement);
    });

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

/**
 * Handles the submission of the "Add Stock" form.
 * @param {Event} event - The form submission event.
 */
async function handleAddStockSubmit(event) {
    event.preventDefault(); // Prevent page reload
    const inputElement = document.getElementById('add-stock-input');
    const ticker = inputElement.value.trim().toUpperCase();

    const watchlistContainer = document.getElementById('watchlist-container');
    const currentStockCount = watchlistContainer.querySelectorAll('.group').length; 
    
    if (currentStockCount >= 20) {
        if (typeof showMessage === 'function') showMessage('Watchlist is full (max 20). Please remove a stock to add a new one.', true);
        return; 
    }

    const suggestionsContainer = document.getElementById('add-stock-suggestions');
     if (suggestionsContainer) suggestionsContainer.classList.add('hidden');

    if (!ticker) {
        if (typeof showMessage === 'function') showMessage("Please enter a stock ticker.", true);
        return;
    }

    await addStockToWatchlistApi(ticker);

    inputElement.value = ''; // Clear input after submission
}

/**
 * Makes the API call to add a stock to the backend watchlist.
 * @param {string} ticker - The stock ticker to add.
 */
async function addStockToWatchlistApi(ticker) {
    try {
        const token = localStorage.getItem('tmt_auth_token');
        if (!token) throw new Error("Authentication token not found.");

        const response = await fetch(`${API_BASE_URL}/api/user/watchlist/add`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ticker: ticker }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || `Failed to add stock. Status: ${response.status}`);
        }

        if (typeof showMessage === 'function') {
            showMessage(result.message, !result.success); 
        }
        
        if (result.message.includes('added') || result.message.includes('already in')) {
             // --- FIX: Client-side cache clear REMOVED ---
            await loadWatchlist(); // Refresh the list
        }

    } catch (error) {
        console.error("Error adding stock:", error);
        if (typeof showMessage === 'function') showMessage(error.message || "Could not add stock to watchlist.", true);
    }
}

/**
 * Handles the click on the remove button for a watchlist item.
 * @param {string} ticker - The stock ticker to remove.
 */
async function handleRemoveStock(ticker) {
    try {
        const token = localStorage.getItem('tmt_auth_token');
        if (!token) throw new Error("Authentication token not found.");
        
        const response = await fetch(`${API_BASE_URL}/api/user/watchlist/remove`, {
            method: 'POST', 
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ ticker: ticker }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || `Failed to remove stock. Status: ${response.status}`);
        }

        if (typeof showMessage === 'function') showMessage(`${ticker} removed from your watchlist.`, false);
        
        // --- FIX: Client-side cache clear REMOVED ---

        // Optimistically remove the item from the DOM for faster feedback
        const itemToRemove = document.getElementById(`watchlist-item-${ticker}`);
        if(itemToRemove) {
            itemToRemove.remove();
            const watchlistContainer = document.getElementById('watchlist-container');
            if (watchlistContainer && watchlistContainer.children.length === 0) {
                 renderWatchlist([]); // Show empty message
            }
        } else {
            await loadWatchlist(); // Fallback to full refresh
        }

    } catch (error) {
        console.error("Error removing stock:", error);
        if (typeof showMessage === 'function') showMessage(error.message || "Could not remove stock from watchlist.", true);
    }
}

/**
 * Fetches details (name, price, change) for a batch of tickers.
 * @param {string[]} tickers - Array of stock tickers.
 * @param {string} token - The user's auth token.
 * @returns {Promise<Array>} - Promise resolving to an array of stock objects.
 */
async function fetchStockDetailsBatch(tickers, token) {
     if (!tickers || tickers.length === 0) {
        return [];
    }
     
     try {
         const response = await fetch(`${API_BASE_URL}/api/stock/batch-details`, {
             method: 'POST',
             headers: {
                 'Authorization': `Bearer ${token}`,
                 'Content-Type': 'application/json',
             },
             body: JSON.stringify({ tickers: tickers }),
         });

         if (!response.ok) {
             throw new Error(`Batch stock details fetch failed: ${response.status}`);
         }
         const result = await response.json();

         if (result.success && result.data) {
             return result.data; 
         } else {
             console.warn("Batch stock details API returned success=false or no data.");
             return tickers.map(t => ({ ticker: t, name: 'N/A', price: null, changePercent: null, changeClass: 'text-gray-400' }));
         }
     } catch (error) {
         console.error("Error fetching batch stock details:", error);
         return tickers.map(t => ({ ticker: t, name: 'Error', price: null, changePercent: null, changeClass: 'text-gray-400' }));
     }
}


// --- Search Suggestions Logic (Adapted from your API) ---

async function fetchRealSuggestions(query) {
    if (!query || query.length < 1) return []; 
    try {
        const response = await fetch(`/api/search-tickers?q=${encodeURIComponent(query)}`);
        if (!response.ok) throw new Error(`Search API failed: ${response.status}`);
        const result = await response.json();

        if (result.success && Array.isArray(result.data)) {
            return result.data.map(item => ({ ticker: item.ticker, text: `${item.ticker} - ${item.name}` }));
        }
        return [];
    } catch (error) {
        console.error("Error fetching real suggestions:", error);
        return [];
    }
}

function handleWatchlistSearchInput(event) {
    const inputElement = event.target; 
    const query = inputElement.value.trim();
    const suggestionsContainer = document.getElementById('add-stock-suggestions');
    if (!suggestionsContainer) return; 

    if (event.key === 'Enter' && query) {
        suggestionsContainer.classList.add('hidden');
        return;
    }
    if (!query) {
        suggestionsContainer.classList.add('hidden');
        suggestionsContainer.innerHTML = '';
        return;
    }

    clearTimeout(inputElement.suggestionTimeout);
    inputElement.suggestionTimeout = setTimeout(async () => {
        const suggestions = await fetchRealSuggestions(query);
        if (suggestions.length > 0) {
            suggestionsContainer.innerHTML = suggestions.map(suggestion =>
                `<div class="suggestion-item p-3 hover:bg-gray-700 cursor-pointer text-sm text-gray-300" 
                      onclick="selectWatchlistSuggestion('${suggestion.ticker}')">
                      ${suggestion.text}
                 </div>`
            ).join('');
            suggestionsContainer.classList.remove('hidden'); 
        } else {
            suggestionsContainer.classList.add('hidden'); 
            suggestionsContainer.innerHTML = '';
        }
    }, 250); // 250ms debounce
}

// Make necessary functions global for use in inline HTML (like onclick events)
window.handleWatchlistSearchInput = handleWatchlistSearchInput; 

function selectWatchlistSuggestion(ticker) {
    const inputElement = document.getElementById('add-stock-input');
    const suggestionsContainer = document.getElementById('add-stock-suggestions');
    
    if (inputElement) inputElement.value = ticker; 
    if (suggestionsContainer) suggestionsContainer.classList.add('hidden'); 
    
    inputElement.focus(); 
}
window.selectWatchlistSuggestion = selectWatchlistSuggestion;
window.handleRemoveStock = handleRemoveStock; // Make remove function global for onclick