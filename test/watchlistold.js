/**
 * watchlist.js
 * Handles fetching, displaying, adding, and removing stocks from the user's watchlist.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initial setup
    setupWatchlistPage();

/**
 * Sets up the watchlist page: checks auth, adds listeners, fetches initial data.
 */
async function setupWatchlistPage() {
    // Check Authentication using the global function from script.js
    if (!getAuthStatus()) {
        // Use the global showMessage from script.js
        if (typeof showMessage === 'function') {
            showMessage("Please log in to view and manage your watchlist.", true);
        }
        
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

    watchlistContainer.innerHTML = '<p class="text-gray-500 text-center py-6">Loading your watchlist...</p>';

    try {
        const token = localStorage.getItem('tmt_auth_token');
        if (!token) throw new Error("Authentication token not found.");

        // --- BACKEND CALL 1: Get Watchlist Tickers ---
        const response = await fetch(`${API_BASE_URL}/api/user/watchlist`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });

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
            renderWatchlist(detailedStocks);

        } else {
             throw new Error(result.message || "Invalid watchlist data format received.");
        }

    } catch (error) {
        console.error("Error loading watchlist:", error);
        if (typeof showMessage === 'function') {
            showMessage(error.message || "Could not load watchlist.", true);
        }
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
        // --- START OF MODIFICATIONS ---

        // 1. The main wrapper is now a 'group' and handles positioning
        stockElement.className = "group bg-tmt-card rounded-lg shadow-lg border border-gray-700/50 relative overflow-hidden";
        stockElement.id = `watchlist-item-${stock.ticker}`;

        // Get color and icon logic
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

        // 2. New innerHTML with a hidden delete area and a sliding content area
        // *** FIX 2: Ticker color changed to text-tmt-primary ***
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
        // --- END OF MODIFICATIONS ---

        watchlistContainer.appendChild(stockElement);
    });

    // Re-render Lucide icons after adding new elements
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

    // --- START: Watchlist Limit Check (FIX 1) ---
    const watchlistContainer = document.getElementById('watchlist-container');
    // We query for '.group' which is the class we assigned to each stock item
    const currentStockCount = watchlistContainer.querySelectorAll('.group').length; 
    
    if (currentStockCount >= 20) {
        showMessage('Watchlist is full (max 20). Please remove a stock to add a new one.', true);
        return; // Stop here
    }
    // --- END: Watchlist Limit Check ---

    // Hide suggestions
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

        // --- BACKEND CALL 3: Add to Watchlist ---
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

        // Use the message from the server (e.g. "Watchlist is full" or "Already in list")
        if (typeof showMessage === 'function') {
            showMessage(result.message, !result.success); // Show error if not success
        }
        
        // Only refresh if the stock was actually added
        if (result.message.includes('added')) {
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
        
        // --- BACKEND CALL 4: Remove from Watchlist ---
        const response = await fetch(`${API_BASE_URL}/api/user/watchlist/remove`, {
            method: 'POST', // Using POST as defined in server.js
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
        
        // Optimistically remove the item from the DOM for faster feedback
        const itemToRemove = document.getElementById(`watchlist-item-${ticker}`);
        if(itemToRemove) {
            itemToRemove.remove();
            // Check if watchlist is now empty
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
         // --- BACKEND CALL 5: Get Batch Stock Details ---
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
         // Return tickers only as fallback on network error
         return tickers.map(t => ({ ticker: t, name: 'Error', price: null, changePercent: null, changeClass: 'text-gray-400' }));
     }
}


// --- Search Suggestions Logic (Adapted from your API) ---

async function fetchRealSuggestions(query) {
    if (!query || query.length < 1) return []; 
    try {
        // --- BACKEND CALL 6: Ticker Search ---
        // This endpoint already exists in your server.js
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
// FIX 1: ADDED SEMICOLON
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

}); // <-- Added the closing '});' here to wrap the entire script