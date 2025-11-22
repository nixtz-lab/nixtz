// stock_analysis_fixed_metrics.js - Dedicated route for Net Assets & ATH ONLY (FINAL FIX)
const express = require('express');
const axios = require('axios');
const router = express.Router();

// --- Dependencies ---
const SIMFIN_API_KEY = process.env.SIMFIN_API_KEY || "2a8d888b-daef-49fd-9736-b80328a9ea23"; 
const SIMFIN_BASE_URL = "https://backend.simfin.com/api/v3/companies"; 
const isNumber = (val) => typeof val === 'number' && !isNaN(val);

// *** ROUTE PATH: This handles requests to /api/fixedmetrics/:ticker ***
router.get('/:ticker', async (req, res) => {
    const { ticker } = req.params;

    let fixedMetrics = { netAssets: "N/A", ath: "N/A" };
    
    // 1. Statements URL (for Net Assets, which works reliably):
    const statementsUrl = `${SIMFIN_BASE_URL}/statements/compact?ticker=${ticker}&statements=bs&period=q1,q2,q3,q4,fy`; 
    
    // 2. *** CRITICAL FIX: USING THE /prices/compact ENDPOINT (Confirmed by user test) ***
    const priceHistoryUrl = `${SIMFIN_BASE_URL}/prices/compact?ticker=${ticker}`; 

    const options = { method: 'GET', headers: { 'accept': 'application/json', 'Authorization': `api-key ${SIMFIN_API_KEY}` } };

    try {
        console.log(`[fixed_metrics_be] Fetching data for ${ticker}...`);

        const [statementsResponse, priceHistoryResponse] = await Promise.all([
            axios.get(statementsUrl, options),
            // Resilient call for the ATH data source
            axios.get(priceHistoryUrl, options).catch(err => {
                 console.error(`[fixed_metrics_be] Price API failed. Status: ${err.response?.status || 'N/A'}. URL: ${priceHistoryUrl}.`);
                 return { data: [] }; 
            }),
        ]);
        
        const statementsResult = statementsResponse.data;
        let priceHistoryResult = priceHistoryResponse.data;

        // --------------------------------------------------------------------------------
        // --- CRITICAL FIX: DATA STRUCTURE UNWRAP for SimFin's price data ---
        // We must unwrap the data if it comes back in the confirmed array-wrapped format: [ { columns:..., data:... } ]
        if (Array.isArray(priceHistoryResult) && priceHistoryResult.length > 0 && priceHistoryResult[0].data) {
             priceHistoryResult = priceHistoryResult[0]; // Unwrap the core data object
        } else {
             // Default to empty price object structure if unwrapping failed or call failed
             priceHistoryResult = { columns: [], data: [] };
        }
        // --------------------------------------------------------------------------------
        
        // --- 1. NET ASSETS CALCULATION (Functional) ---
        const bsDefinition = statementsResult?.[0]?.statements?.find(s => s.statement === 'BS');
        if (bsDefinition) {
            const bsColumns = bsDefinition.columns;
            const totalAssetsIndex = bsColumns.indexOf("Total Assets");
            const totalLiabilitiesIndex = bsColumns.indexOf("Total Liabilities");
            const latestBsRow = bsDefinition.data.length > 0 ? bsDefinition.data[bsDefinition.data.length - 1] : null;

            if (latestBsRow && totalAssetsIndex !== -1 && totalLiabilitiesIndex !== -1) {
                const assets = parseFloat(latestBsRow[totalAssetsIndex]);
                const liabilities = parseFloat(latestBsRow[totalLiabilitiesIndex]);
                if (isNumber(assets) && isNumber(liabilities)) {
                    const netAssetsRaw = assets - liabilities;
                    fixedMetrics.netAssets = (netAssetsRaw / 1e9).toFixed(2) + "B";
                }
            }
        }
        
        // --- 2. ATH (All-Time High) CALCULATION ---
        const priceData = priceHistoryResult.data || []; 
        const priceColumns = priceHistoryResult.columns || [];
        const highestPriceIndex = priceColumns.indexOf("Highest Price"); // Index 5 in your sample

        if (highestPriceIndex !== -1 && Array.isArray(priceData) && priceData.length > 0) {
            let maxPrice = 0;
            for (const row of priceData) {
                const price = parseFloat(row[highestPriceIndex]);
                if (!isNaN(price) && price > maxPrice) { maxPrice = price; }
            }
            if (maxPrice > 0) {
                fixedMetrics.ath = maxPrice.toFixed(2);
            }
        } else {
             console.warn(`[fixed_metrics_be] ATH is N/A. Reason: API failed or 'Highest Price' column not found.`);
        }
        
        res.json({ success: true, data: fixedMetrics });

    } catch (err) {
        console.error(`Error fetching fixed metrics for ${ticker}:`, err);
        let errorMessage = `Server error fetching fixed metrics for ${ticker}: ${err.message}`;
        let statusCode = 500;
        if (axios.isAxiosError(err) && err.response) {
            errorMessage = `API Error (${err.response.status}): ${err.response.data?.message || 'Check logs for details.'}`;
            statusCode = err.response.status;
        }
        res.status(statusCode).json({ success: false, message: errorMessage });
    }
});

module.exports = router;