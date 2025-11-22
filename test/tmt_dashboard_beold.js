// routes/tmt_dashboard_be.js
const express = require('express');
const axios = require('axios');
const router = express.Router();

const cheerio = require('cheerio'); 
const mongoose = require('mongoose'); 

// Import the shared middleware and model dependency
const { authMiddleware, adminAuthMiddleware } = require('../middleware/auth'); 
const User = mongoose.model('User');
const TickerScan = mongoose.model('TickerScan'); // TickerScan model is used for Top 5

// --- API KEYS (Pulled from .env) ---
const YAHU_RAPIDAPI_KEY = process.env.YAHU_RAPIDAPI_KEY; // For apidojo (52-week-low)
const YFINANCE_RAPIDAPI_KEY = process.env.YFINANCE_RAPIDAPI_KEY; // For yfinance (Top Decliners)

// API Hosts
const YFINANCE_HOST = "yfinance.p.rapidapi.com";
const APIDOJO_HOST = "apidojo-yahoo-finance-v1.p.rapidapi.com";

const FEAR_GREED_API_KEY = process.env.FEAR_GREED_API_KEY; 
const FEAR_GREED_API_HOST = "fear-and-greed-index.p.rapidapi.com";

// Helper function
const isNumber = (val) => typeof val === 'number' && !isNaN(val);


// ===================================================================
// 1. SENTIMENT ROUTES
// ===================================================================
router.get('/fear-and-greed', async (req, res) => {
    if (!FEAR_GREED_API_KEY) {
        console.error("FATAL ERROR: FEAR_GREED_API_KEY is not set in .env file.");
        return res.status(500).json({ success: false, message: "Server API key not configured." });
    }
    const url = 'https://fear-and-greed-index.p.rapidapi.com/v1/fgi';
    const options = {
        method: 'GET',
        headers: {
            'x-rapidapi-key': FEAR_GREED_API_KEY,
            'x-rapidapi-host': FEAR_GREED_API_HOST
        }
    };
    try {
        const response = await axios.get(url, options);
        res.json({ success: true, data: response.data });
    } catch (err) {
        console.error('Fear & Greed API Error:', err.message);
        let statusCode = 500;
        if (axios.isAxiosError(err) && err.response) {
            statusCode = err.response.status;
        }
        res.status(statusCode).json({ success: false, message: 'Failed to fetch Fear & Greed data.' });
    }
});


// ===================================================================
// 2. CRYPTO & COMMODITY BENCHMARKS (SIMULATED FOR STABILITY)
// ===================================================================
router.get('/btc-mining-cost', async (req, res) => {
    const simCost = '28,000'; 
    await new Promise(resolve => setTimeout(resolve, 50)); 
    return res.json({ success: true, value: simCost });
});

router.get('/gold-mining-cost', async (req, res) => {
    const liveCost = 1450; 
    await new Promise(resolve => setTimeout(resolve, 50)); 
    return res.json({ 
        success: true, 
        value: `$${liveCost.toLocaleString()}/oz` 
    });
});


// ===================================================================
// 3. MACRO VALUATION INDICATORS (SIMULATED FOR STABILITY)
// ===================================================================
router.get('/buffett-indicator', async (req, res) => {
    const liveRatio = 220.5; 
    let color = 'text-red-500'; 
    if (liveRatio < 130) color = 'text-yellow-500'; 
    if (liveRatio < 100) color = 'text-green-500';
    await new Promise(resolve => setTimeout(resolve, 50)); 
    return res.json({ 
        success: true, 
        value: `~${liveRatio.toFixed(1)}%`,
        color: color
    });
});

router.get('/sp500-pe-trailing', async (req, res) => {
    const livePe = 27.88; 
    let color = 'text-red-500';
    if (livePe < 24) color = 'text-orange-500';
    if (livePe < 20) color = 'text-yellow-500';
    await new Promise(resolve => setTimeout(resolve, 50)); 
    return res.json({ 
        success: true, 
        value: `${livePe.toFixed(2)}x`,
        color: color
    });
});

router.get('/sp500-cape-ratio', async (req, res) => {
    const liveCape = 39.2; 
    let color = 'text-red-500';
    if (liveCape < 25) color = 'text-orange-500';
    if (liveCape < 20) color = 'text-yellow-500';
    await new Promise(resolve => setTimeout(resolve, 50)); 
    return res.json({ 
        success: true, 
        value: `${liveCape.toFixed(1)}x`,
        color: color 
    });
});

router.get('/sp500-pb-ratio', async (req, res) => {
    const livePb = 5.0; 
    let color = 'text-red-500';
    if (livePb < 4.2) color = 'text-yellow-500';
    if (livePb < 3.5) color = 'text-green-500';
    await new Promise(resolve => setTimeout(resolve, 50)); 
    return res.json({ 
        success: true, 
        value: `~${livePb.toFixed(1)}x`,
        color: color
    });
});


// ===================================================================
// 4. RENTAL PROPERTY ANALYSIS ROUTE
// ===================================================================
router.post('/analyze-property', authMiddleware, async (req, res) => {
    const { 
        purchasePrice, rentalIncome, operatingExpenses, 
        downPaymentPct, interestRate, loanTermYears, monthlyPmi, 
        closingCosts, repairBudget, vacancyPct
    } = req.body;
    if (isNaN(purchasePrice) || isNaN(rentalIncome) || isNaN(operatingExpenses) || isNaN(downPaymentPct)) {
        return res.status(400).json({ success: false, message: 'Invalid input. Ensure all fields are valid numbers.' });
    }
    const downPaymentRatio = downPaymentPct / 100;
    const vacancyRatio = vacancyPct / 100;
    const pp = parseFloat(purchasePrice) || 0;
    const ri = parseFloat(rentalIncome) || 0;
    const oe = parseFloat(operatingExpenses) || 0;
    const ir = parseFloat(interestRate) || 0;
    const lty = parseInt(loanTermYears) || 0;
    const pmi = parseFloat(monthlyPmi) || 0;
    const cc = parseFloat(closingCosts) || 0;
    const rb = parseFloat(repairBudget) || 0;
    const annualGrossIncome = ri * 12;
    const annualVacancyCost = annualGrossIncome * vacancyRatio;
    const annualOperatingExpenses = oe * 12;
    const noi = annualGrossIncome - annualVacancyCost - annualOperatingExpenses;
    const capRate = pp > 0 ? (noi / pp) : 0;
    const downPayment = pp * downPaymentRatio;
    const totalInitialInvestment = downPayment + cc + rb;
    let annualDebtService = 0;
    let loanAmount = pp - downPayment;
    if (loanAmount > 0 && lty > 0 && ir > 0) {
        const monthlyInterestRate = (ir / 100) / 12;
        const totalPayments = lty * 12;
        const monthlyPmt = loanAmount * (
            monthlyInterestRate * Math.pow(1 + monthlyInterestRate, totalPayments)
        ) / (
            Math.pow(1 + monthlyInterestRate, totalPayments) - 1
        );
        annualDebtService = (monthlyPmt + pmi) * 12;
    }
    const annualCashFlow = noi - annualDebtService;
    const cocReturn = totalInitialInvestment > 0 ? (annualCashFlow / totalInitialInvestment) : 0;
    const results = {
        noi: noi.toFixed(2),
        capRate: (capRate * 100).toFixed(2), // as percentage
        cocReturn: (cocReturn * 100).toFixed(2), // as percentage
        monthlyCashFlow: (annualCashFlow / 12).toFixed(2),
        totalInvestment: totalInitialInvestment.toFixed(2),
        downPayment: downPayment.toFixed(2)
    };
    res.json({ success: true, data: results });
});


// ===================================================================
// 5. DYNAMIC STOCK LISTS (LIVE FETCHING)
// ===================================================================

// ****** MODIFICATION START: This route now fetches live prices ******
/**
 * @route   GET /api/tmt/tmt-top-5
 * @desc    Get TMT Top 5 Stocks from DB, then get LIVE prices.
 * @access  Private (requires auth)
 */
router.get('/tmt-top-5', authMiddleware, async (req, res) => {
    try {
        // Step 1: Get the Top 5 ranked stocks from our database
        const topStocksDB = await TickerScan.find()
            .sort({ rank: 1 }) // Sorts by rank ("A+" first)
            .limit(5)
            .select('ticker name rank'); // Get the tickers and names

        if (!topStocksDB || topStocksDB.length === 0) {
            return res.json({ success: true, data: [], message: "No ranked stocks found in database." });
        }

        const tickersToFetch = topStocksDB.map(stock => stock.ticker);

        // Step 2: Fetch LIVE data for these 5 tickers from Yahoo API
        if (!YAHU_RAPIDAPI_KEY) {
            console.error("FATAL ERROR: YAHU_RAPIDAPI_KEY is missing. Live data cannot be fetched for Top 5.");
            return res.status(503).json({ success: false, message: "Live data service unavailable." });
        }

        const url = `https://${APIDOJO_HOST}/stock/get-fundamentals`;
        const optionsTemplate = {
            method: 'GET',
            url: url,
            params: { modules: 'price' }, // We only need the price module
            headers: { 'x-rapidapi-key': YAHU_RAPIDAPI_KEY, 'x-rapidapi-host': APIDOJO_HOST }
        };

        const pricePromises = tickersToFetch.map(ticker => {
            const options = { ...optionsTemplate, params: { ...optionsTemplate.params, symbol: ticker } };
            return axios.request(options);
        });

        const priceResponses = await Promise.allSettled(pricePromises);

        // Step 3: Combine the data and send response
        const formattedData = priceResponses.map((response, index) => {
            const dbInfo = topStocksDB[index]; // Get the stock info from our DB query

            if (response.status === 'fulfilled' && response.value.data?.quoteSummary?.result?.[0]) {
                const quote = response.value.data.quoteSummary.result[0];
                const priceData = quote.price;
                
                return {
                    ticker: dbInfo.ticker,
                    name: priceData?.longName || dbInfo.name, // Prefer live name, fallback to DB name
                    price: priceData?.regularMarketPrice?.raw ? priceData.regularMarketPrice.raw.toFixed(2) : 'N/A'
                };
            } else {
                // If API fails for one ticker, return DB info with N/A price
                console.warn(`Failed to fetch live price for ${dbInfo.ticker}: ${response.reason?.message}`);
                return {
                    ticker: dbInfo.ticker,
                    name: dbInfo.name,
                    price: 'N/A'
                };
            }
        });

        res.json({ success: true, data: formattedData });

    } catch (err) {
        console.error('Error fetching TMT Top 5 from database:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching Top 5 list.' });
    }
});
// ****** MODIFICATION END ******


router.get('/52-week-low', authMiddleware, async (req, res) => {
    let tickersToScan = [];
    try {
        const scanEntries = await TickerScan.find().select('ticker');
        tickersToScan = scanEntries.map(entry => entry.ticker);
        if (tickersToScan.length === 0) {
            console.log("52-Week Low Scan: No tickers found in database. Returning empty list.");
            return res.json({ success: true, data: [] });
        }
    } catch (dbErr) {
         console.error('DB Error fetching TickerScan list:', dbErr.message);
         tickersToScan = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'JPM']; 
         console.warn("Using minimal fallback list due to DB error.");
    }

    if (!YAHU_RAPIDAPI_KEY) {
        console.error("FATAL ERROR: YAHU_RAPIDAPI_KEY is missing. Live data cannot be fetched.");
        return res.status(503).json({ success: false, message: "Live data service unavailable: Missing YAHU_RAPIDAPI_KEY configuration." });
    }
    
    const CHUNK_SIZE = 5; 
    const DELAY_MS = 1000; 
    const url = `https://${APIDOJO_HOST}/stock/get-fundamentals`;
    const optionsTemplate = {
        method: 'GET',
        url: url,
        params: { 
            symbol: '', 
            modules: 'price,summaryDetail,summaryProfile',
            region: 'US',
            lang: 'en-US'
        },
        headers: { 'x-rapidapi-key': YAHU_RAPIDAPI_KEY, 'x-rapidapi-host': APIDOJO_HOST }
    };
    let allResults = [];
    let filteredStocks = [];
    try {
        for (let i = 0; i < tickersToScan.length; i += CHUNK_SIZE) {
            const chunk = tickersToScan.slice(i, i + CHUNK_SIZE);
            const chunkPromises = chunk.map(ticker => {
                const options = { ...optionsTemplate, params: { ...optionsTemplate.params, symbol: ticker } };
                return axios.request(options);
            });
            const chunkResponses = await Promise.allSettled(chunkPromises);
            allResults.push(...chunkResponses);
            if (i + CHUNK_SIZE < tickersToScan.length) {
                await new Promise(resolve => setTimeout(resolve, DELAY_MS));
            }
        }
        allResults.forEach((response, index) => {
            const ticker = tickersToScan[index];
            if (response.status === 'fulfilled' && response.value.data?.quoteSummary?.result?.[0]) {
                const quote = response.value.data.quoteSummary.result[0];
                const priceData = quote.price;
                const detailData = quote.summaryDetail;
                const profileData = quote.summaryProfile;
                if (priceData && detailData) {
                    const currentPrice = priceData.regularMarketPrice?.raw;
                    const low52 = detailData.fiftyTwoWeekLow?.raw;
                    const high52 = detailData.fiftyTwoWeekHigh?.raw;
                    if (isNumber(currentPrice) && isNumber(low52) && low52 > 0) {
                        const proximity = (currentPrice - low52) / low52;
                        if (proximity >= 0 && proximity < 0.05) { 
                            filteredStocks.push({
                                ticker: ticker,
                                name: priceData.longName || priceData.shortname || 'N/A',
                                sector: profileData?.sector || 'N/A',
                                currentPrice: currentPrice.toFixed(2),
                                low52: low52.toFixed(2),
                                high52: isNumber(high52) ? high52.toFixed(2) : 'N/A',
                                proximityPct: (proximity * 100).toFixed(2)
                            });
                        }
                    }
                }
            } else if (response.status === 'rejected') {
                 console.warn(`Live data fetch rejected for ${ticker}: ${response.reason?.message}`);
            }
        });
        filteredStocks.sort((a, b) => parseFloat(a.proximityPct) - parseFloat(b.proximityPct));
        res.json({ success: true, data: filteredStocks });
    } catch (err) {
        console.error(`Catastrophic Error during 52-week-low live scan:`, err.message);
        return res.status(500).json({ success: false, message: `Failed to fetch live data from external API: ${err.message}` });
    }
});


router.get('/top-decliners', authMiddleware, async (req, res) => {
    if (!YFINANCE_RAPIDAPI_KEY) {
        console.error("FATAL ERROR: YFINANCE_RAPIDAPI_KEY is missing. Live data cannot be fetched.");
        return res.status(503).json({ success: false, message: "Live data service unavailable: Missing YFINANCE_RAPIDAPI_KEY configuration." });
    }
    const options = {
        method: 'GET',
        url: `https://${YFINANCE_HOST}/set:marketGetDayLosers`,
        params: { count: '5', start: '0', region: 'US' }, // Get top 5
        headers: {
            'x-rapidapi-key': YFINANCE_RAPIDAPI_KEY, 
            'x-rapidapi-host': YFINANCE_HOST
        }
    };
    try {
        const response = await axios.request(options);
        const quotes = response.data?.result; 
        if (!quotes || !Array.isArray(quotes)) {
             throw new Error('Invalid data structure from YFinance API. Expected "result" array.');
        }
        const formattedData = quotes.map(quote => ({
            ticker: quote.symbol,
            name: quote.shortName || quote.longName || 'N/A',
            price: quote.regularMarketPrice?.fmt || null,
            changePct: quote.regularMarketChangePercent?.fmt || '0.00%'
        }));
        res.json({ success: true, data: formattedData });
    } catch (err) {
        console.error(`Error fetching Top Decliners from YFinance:`, err.message);
        if (err.response) {
            console.error("Error Response Data:", err.response.data);
        }
        return res.status(500).json({ success: false, message: `Failed to fetch live data from external API: ${err.message}` });
    }
});


// ===================================================================
// 6. ADMIN - 52 WEEK LOW SCAN LIST MANAGEMENT
// ===================================================================

router.get('/admin/52-week-scan', authMiddleware, adminAuthMiddleware, async (req, res) => {
    try {
        const scanList = await TickerScan.find().select('ticker notes').sort({ ticker: 1 });
        res.json({ success: true, data: scanList });
    } catch (err) {
        console.error('Fetch 52-Week Scan List Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching scan list.' });
    }
});

router.post('/admin/52-week-scan', authMiddleware, adminAuthMiddleware, async (req, res) => {
    const { ticker, notes } = req.body;
    if (!ticker) {
        return res.status(400).json({ success: false, message: 'Ticker is required.' });
    }
    try {
        const newTicker = await TickerScan.findOneAndUpdate(
            { ticker: ticker.toUpperCase().trim() },
            { ticker: ticker.toUpperCase().trim(), notes: notes || '' },
            { new: true, upsert: true, runValidators: true }
        );
        res.json({ success: true, message: `${newTicker.ticker} added/updated successfully.`, data: newTicker });
    } catch (err) {
        if (err.code === 11000) {
             return res.status(400).json({ success: false, message: 'Ticker already exists in the scan list.' });
        }
        console.error('Add Ticker to Scan List Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error adding ticker.' });
    }
});

router.delete('/admin/52-week-scan/:ticker', authMiddleware, adminAuthMiddleware, async (req, res) => {
    const { ticker } = req.params;
    if (!ticker) {
        return res.status(400).json({ success: false, message: 'Ticker parameter is required.' });
    }
    try {
        const result = await TickerScan.deleteOne({ ticker: ticker.toUpperCase().trim() });
        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, message: `Ticker ${ticker} not found in the scan list.` });
        }
        res.json({ success: true, message: `${ticker} successfully removed from the scan list.` });
    } catch (err) {
        console.error('Delete Ticker from Scan List Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error deleting ticker.' });
    }
});


module.exports = router;