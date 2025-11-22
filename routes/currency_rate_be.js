// routes/currency_rate_be.js
const express = require('express');
const axios = require('axios'); 
const router = express.Router();

// Configuration (MUST match your Coolify environment variables)
const ALPHA_VANTAGE_HOST = 'alpha-vantage.p.rapidapi.com';
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY; 
const BASE_CURRENCY = 'USD'; // Transactions are stored in USD

// *** NEW: In-memory cache and configuration ***
// Stores { 'THB': { rate: 32.50, timestamp: 1700000000000 } }
const exchangeRateCache = new Map();
const CACHE_DURATION_MS = 120 * 1000; // 2 minutes

/**
 * Checks the in-memory cache for the exchange rate.
 * If found and not expired, returns the cached rate. Otherwise, returns null.
 * @param {string} currency 
 * @returns {number | null}
 */
function getCachedRate(currency) {
    const cachedEntry = exchangeRateCache.get(currency);
    if (cachedEntry && Date.now() < cachedEntry.timestamp + CACHE_DURATION_MS) {
        console.log(`[CACHE HIT] Exchange rate for ${currency} is valid.`);
        return cachedEntry.rate;
    }
    // Cache miss or expired
    if (cachedEntry) {
        console.log(`[CACHE MISS] Exchange rate for ${currency} expired.`);
    }
    return null;
}

/**
 * @route   GET /api/currency/currency-rate?to_currency=X
 * @desc    Securely fetches the live currency exchange rate via proxy (with 2-minute cache).
 * @access  Public (proxied)
 */
router.get('/currency-rate', async (req, res) => {
    const toCurrency = req.query.to_currency; 

    // 1. Validation and Base Currency Check
    if (!toCurrency) {
        return res.status(400).json({ message: 'Query parameter to_currency is required.' });
    }
    if (toCurrency === BASE_CURRENCY) {
        return res.json({ rate: 1.00 });
    }
    if (!ALPHA_VANTAGE_KEY) {
         console.error("ALPHA_VANTAGE_API_KEY is missing on the server.");
         return res.status(500).json({ message: 'Server configuration error: Currency API key missing.' });
    }

    // 2. CHECK CACHE
    const cachedRate = getCachedRate(toCurrency);
    if (cachedRate !== null) {
        return res.json({ rate: cachedRate });
    }

    // 3. FETCH FROM EXTERNAL API (Cache Miss)
    try {
        const response = await axios.get(
            `https://${ALPHA_VANTAGE_HOST}/query`,
            {
                params: {
                    function: 'CURRENCY_EXCHANGE_RATE',
                    from_currency: BASE_CURRENCY,
                    to_currency: toCurrency
                },
                headers: {
                    'x-rapidapi-key': ALPHA_VANTAGE_KEY,
                    'x-rapidapi-host': ALPHA_VANTAGE_HOST
                }
            }
        );

        const data = response.data;
        const exchangeRateField = "Realtime Currency Exchange Rate";
        const rateKey = "5. Exchange Rate";
        const rateStr = data?.[exchangeRateField]?.[rateKey];
        const rate = parseFloat(rateStr);

        if (rate && rate > 0) {
            // Success: Store in cache and return
            exchangeRateCache.set(toCurrency, { rate: rate, timestamp: Date.now() });
            console.log(`[CACHE STORE] New rate stored for ${toCurrency}.`);
            return res.json({ rate: rate });
        } else if (data["Error Message"]) {
            console.error('Alpha Vantage Error:', data["Error Message"]);
            return res.status(502).json({ message: `Currency API Error: ${data["Error Message"]}` });
        } else {
            return res.status(500).json({ message: "Could not parse rate from external API response." });
        }

    } catch (error) {
        console.error("Backend Currency Proxy Error:", error.message);
        return res.status(500).json({ message: "Backend network error connecting to Alpha Vantage." });
    }
});

module.exports = router;