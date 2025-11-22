/**
 * routes/api_portfolio.js
 * FINAL VERSION (v3): Implements a robust Tiingo fallback.
 *
 * FIX 1: `fetchYahuPriceAndDividend` now falls back to Tiingo for ANY
 * stock that returns a 0 yield from Yahu (not just foreign ones).
 *
 * FIX 2: `fetchTiingoDividend` is rewritten to use the correct 'distribution'
 * and 'distributionFrequency' fields from the Tiingo API docs,
 * allowing it to correctly annualize weekly, monthly, and quarterly dividends.
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');

// --- Configuration: API Endpoints ---
const SIMFIN_API_KEY = process.env.SIMFIN_API_KEY || "2a8d888b-daef-49fd-9736-b80328a9ea23";
const YAHU_RAPIDAPI_KEY = process.env.YAHU_RAPIDAPI_KEY || "YOUR_RAPIDAPI_KEY"; 
const YAHU_RAPIDAPI_HOST = process.env.YAHU_RAPIDAPI_HOST || "apidojo-yahoo-finance-v1.p.rapidapi.com";

// URL for search bar suggestions
const SIMFIN_SEARCH_URL = "https://backend.simfin.com/api/v3/info/find-id"; 

// --- Tiingo Configuration (For International/Fallback) ---
const TIINGO_API_KEY = "83374e42bec71867f74d1c07074dae2801555325"; 
const TIINGO_DIVIDEND_URL = "https://api.tiingo.com/tiingo/corporate-actions";
const KNOWN_FOREIGN_SUFFIXES = ['.PA', '.AX', '.L', '.TO', '.HK', '.DE', '.SW']; 

// =========================================================================
// ## Core Price and Dividend Functions
// =========================================================================

/**
 * Checks if a ticker is likely foreign based on its suffix.
 */
function isLikelyForeignTicker(ticker) {
    const upperTicker = ticker.toUpperCase();
    return KNOWN_FOREIGN_SUFFIXES.some(suffix => upperTicker.endsWith(suffix));
}

// --- START: YAHU PRIMARY FETCH (Price AND Dividend) ---
/**
 * Fetches Price AND Dividend Yield from Yahu /get-fundamentals.
 * This is now the primary data source for both metrics.
 */
async function fetchYahuPrimaryData(ticker) {
    if (!YAHU_RAPIDAPI_KEY) return { price: 0, dividend_yield: 0.0 };

    const url = `https://${YAHU_RAPIDAPI_HOST}/stock/get-fundamentals`;
    const options = {
        method: 'GET',
        url: url,
        params: { symbol: ticker, modules: 'price,summaryDetail', region: 'US', lang: 'en-US' },
        headers: { 'x-rapidapi-key': YAHU_RAPIDAPI_KEY, 'x-rapidapi-host': YAHU_RAPIDAPI_HOST }
    };
    
    try {
        const response = await axios.request(options);
        const quote = response.data?.quoteSummary?.result?.[0];

        // Get price
        const price = quote?.price?.regularMarketPrice?.raw;
        // Get dividend yield (from the same module as the stock dashboard)
        const divYield = quote?.summaryDetail?.dividendYield?.raw;

        return {
            price: typeof price === 'number' ? price : 0,
            dividend_yield: typeof divYield === 'number' ? divYield : 0.0
        };
    } catch (error) {
        return { price: 0, dividend_yield: 0.0 };
    }
}
// --- END: YAHU PRIMARY FETCH ---

// --- START: YFINANCE FALLBACK PRICE FETCH ---
/**
 * Fallback to get only price if /get-fundamentals fails.
 */
async function fetchYfinanceFallbackPrice(ticker) {
     if (!YAHU_RAPIDAPI_KEY) return { price: 0, dividend_yield: 0.0 };
     
     const url = `https://${YAHU_RAPIDAPI_HOST}/stock/get-price`; 
     
     const options = {
         method: 'GET',
         url: url,
         params: { symbol: ticker, region: 'US' }, 
         headers: { 'x-rapidapi-key': YAHU_RAPIDAPI_KEY, 'x-rapidapi-host': YAHU_RAPIDAPI_HOST }
     };
     
     try {
         const response = await axios.request(options);
         const price = response.data?.regularMarketPrice?.raw;
         return {
            price: typeof price === 'number' ? price : 0,
            dividend_yield: 0.0 // This endpoint cannot provide dividend yield
         };
     } catch (error) {
         return { price: 0, dividend_yield: 0.0 };
     }
}
// --- END: YFINANCE FALLBACK PRICE FETCH ---

// --- ****** START: MODIFIED TIINGO DIVIDEND FUNCTION ****** ---
/**
 * Fetches and annualizes dividends from Tiingo using the correct
 * 'distribution' and 'distributionFrequency' fields.
 */
async function fetchTiingoDividend(ticker, currentPrice) {
    if (!TIINGO_API_KEY || currentPrice === 0) return { dividend_yield: 0.0 };

    try {
        // Fetch distributions. The API returns history by default.
        const response = await axios.get(
            `${TIINGO_DIVIDEND_URL}/${ticker}/distributions`, // Matches doc
            { 
                headers: { 
                    'Authorization': `Token ${TIINGO_API_KEY}` // Correct Tiingo Auth
                } 
            }
        );

        const distributions = response.data;
        if (!distributions || distributions.length === 0) return { dividend_yield: 0.0 };

        // Find the latest valid cash distribution
        const latestCashDividend = distributions
            .filter(d => d.distribution > 0 && d.type === 'Cash') // Use 'distribution' field
            .sort((a, b) => new Date(b.exDate) - new Date(a.exDate))[0];

        if (!latestCashDividend) return { dividend_yield: 0.0 };

        // Get the latest payment and its frequency
        const latestAmount = latestCashDividend.distribution; 
        const frequency = latestCashDividend.distributionFrequency; // 'w', 'm', 'q', etc.

        let annualizedDPS = 0;

        // Annualize the dividend based on its frequency
        switch (frequency) {
            case 'w': // Weekly
                annualizedDPS = latestAmount * 52;
                break;
            case 'm': // Monthly
                annualizedDPS = latestAmount * 12;
                break;
            case 'q': // Quarterly
                annualizedDPS = latestAmount * 4;
                break;
            case 'sa': // Semiannually
                annualizedDPS = latestAmount * 2;
                break;
            case 'a': // Annually
                annualizedDPS = latestAmount;
                break;
            default: // Default to quarterly if irregular or unknown
                annualizedDPS = latestAmount * 4;
                break;
        }
        
        const yieldValue = annualizedDPS / currentPrice;

        return {
            dividend_yield: Math.max(0, Math.min(yieldValue, 0.50)) // Cap yield at 50%
        };

    } catch (error) {
        console.warn(`Warning: Tiingo dividend fetch failed for ${ticker}. Using 0.0 yield.`);
        return { dividend_yield: 0.0 };
    }
}
// --- ****** END: MODIFIED TIINGO DIVIDEND FUNCTION ****** ---


// --- ****** START: MODIFIED MASTER ROUTER ****** ---
/**
 * MASTER ROUTER: Uses Yahu for Price & Dividend.
 * NEW LOGIC: If Yahu returns 0 yield, it will check Tiingo as a fallback
 * for *any* ticker, not just foreign ones.
 */
async function fetchYahuPriceAndDividend(ticker) {
    
    // 1. Fetch Price AND Dividend from Yahu
    let result = await fetchYahuPrimaryData(ticker);

    // 2. Try fallback price if primary call failed
    if (result.price === 0) {
         result = await fetchYfinanceFallbackPrice(ticker); 
    }

    // 3. Give up if no price
    if (result.price === 0) {
        return { price: 0, dividend_yield: 0.0 };
    }

    // 4. *** NEW FALLBACK LOGIC ***
    // If Yahu returns 0 yield, it could be wrong (like for BRKW).
    // Let's try Tiingo as a fallback, *unless* it's a known non-dividend stock.
    if (result.dividend_yield === 0.0) {
        
        // Add any known zero-dividend stocks here to prevent useless API calls
        const KNOWN_ZERO_DIV_TICKERS = ['BRK-B', 'GOOG', 'GOOGL', 'AMZN']; 
        
        if (!KNOWN_ZERO_DIV_TICKERS.includes(ticker.toUpperCase())) {
            // This ticker is not on our "zero-div" list, so let's double-check with Tiingo.
            // This will now correctly catch BRKW.
            console.log(`Yahu returned 0 yield for ${ticker}. Checking Tiingo as a fallback...`);
            const tiingoData = await fetchTiingoDividend(ticker, result.price);
            
            if (tiingoData.dividend_yield > 0) {
                 result.dividend_yield = tiingoData.dividend_yield;
            }
        }
    }
    
    // 5. Return the final result.
    return {
        price: result.price,
        dividend_yield: result.dividend_yield
    };
}
// --- ****** END: MODIFIED MASTER ROUTER ****** ---


// =========================================================================
// ## ROUTES
// =========================================================================

// --- START: FETCH LIVE PRICES ---
/**
 * GET /api/v1/prices
 * Fetches real-time price data using the new MASTER ROUTER (Yahu/Tiingo).
 */
router.get('/prices', async (req, res) => {
    const tickerString = req.query.tickers;
    if (!tickerString) {
        return res.status(400).json({ message: 'Missing required query parameter: tickers' });
    }

    const tickers = tickerString.split(',').map(t => t.trim().toUpperCase()).filter(t => t !== 'CASH');
    
    if (tickers.length > 30) {
        return res.status(400).json({ message: 'Too many tickers requested. Max 30 allowed per batch.' });
    }
    
    const liveDataMap = {};
    const DELAY_MS = 100; 

    for (const ticker of tickers) {
        // Uses the new MASTER ROUTER fetch function
        const result = await fetchYahuPriceAndDividend(ticker); 
        liveDataMap[ticker] = result;
        
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
    
    liveDataMap['CASH'] = { price: 1.0, dividend_yield: 0.0 };

    return res.status(200).json(liveDataMap);
});
// --- END: FETCH LIVE PRICES ---


// --- START: TICKER SEARCH SUGGESTIONS ---
/**
 * GET /api/search-tickers
 * Implements the search endpoint (Unchanged, still uses SimFin for search).
 */
router.get('/search-tickers', async (req, res) => {
    const query = req.query.q;

    if (!query || query.length < 2) {
        return res.json({ success: true, data: [] });
    }
    
    if (!SIMFIN_API_KEY) {
        console.error("SimFin API Key missing for live search functionality.");
        return res.status(500).json({ success: false, message: 'API key missing for search.' });
    }

    // --- LIVE SIMFIN SEARCH API CALL ---
    const headers = { 'accept': 'application/json', 'Authorization': `api-key ${SIMFIN_API_KEY}` };
    const searchOptions = { 
        method: 'GET', 
        url: `${SIMFIN_SEARCH_URL}/${encodeURIComponent(query)}`,
        headers 
    };

    try {
        const searchResponse = await axios(searchOptions);
        const apiResults = searchResponse.data;
        
        const mappedResults = apiResults
            .filter(item => item.ticker && item.name)
            .map(item => ({
                ticker: item.ticker,
                name: item.name
            }));
            
        return res.json({ success: true, data: mappedResults.slice(0, 10) });

    } catch (error) {
        console.error(`Error searching SimFin for ${query}: Status ${error.response?.status || 'No Status'}. Message: ${error.message}`);
        return res.status(500).json({ success: false, message: 'Failed to retrieve search results from external API.' }); 
    }
});
// --- END: TICKER SEARCH SUGGESTIONS ---


module.exports = router;