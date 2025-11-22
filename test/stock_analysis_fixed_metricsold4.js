// stock_analysis_fixed_metrics.js - Dedicated route for Net Assets & ATH ONLY
const express = require('express');
const axios = require('axios');
const router = express.Router();

// --- Dependencies ---
const SIMFIN_API_KEY = process.env.SIMFIN_API_KEY || "2a8d888b-daef-49fd-9736-b80328a9ea23"; 
// Base URL for statements (which works)
const SIMFIN_BASE_URL = "https://backend.simfin.com/api/v3/companies"; 
const isNumber = (val) => typeof val === 'number' && !isNaN(val);

// *** ROUTE PATH: This handles requests to /api/fixedmetrics/:ticker ***
router.get('/:ticker', async (req, res) => {
    const { ticker } = req.params;

    let fixedMetrics = { netAssets: "N/A", ath: "N/A" };
    
    // API Endpoints: Fetch all Q/FY BS data and Daily Price History (for ATH)
    // Statements URL (remains the working structure):
    const statementsUrl = `${SIMFIN_BASE_URL}/statements/compact?ticker=${ticker}&statements=bs&period=q1,q2,q3,q4,fy`; 
    
    // *** CRITICAL FIX FOR ATH 404 ERROR (New attempt using a bulk price endpoint) ***
    // This new endpoint often works for simple price retrieval when others fail.
    const priceHistoryUrl = `https://backend.simfin.com/api/v3/bulk/prices/daily?ticker=${ticker}`; 

    const options = { method: 'GET', headers: { 'accept': 'application/json', 'Authorization': `api-key ${SIMFIN_API_KEY}` } };

    try {
        console.log(`[fixed_metrics_be] Fetching data for ${ticker}...`);

        // Use Promise.all to fetch statements and price history concurrently
        const [statementsResponse, priceHistoryResponse] = await Promise.all([
            axios.get(statementsUrl, options),
            // *** ATH CALL FIX: Use the corrected Price History URL ***
            axios.get(priceHistoryUrl, options).catch(err => {
                 console.warn(`[fixed_metrics_be] ATH/Price History API call failed: ${err.message}. URL: ${priceHistoryUrl}. Defaulting to empty result.`);
                 return { data: { columns: [], data: [] } }; 
            }),
        ]);
        
        // Assign the actual data payloads from Axios responses
        const statementsResult = statementsResponse.data;
        const priceHistoryResult = priceHistoryResponse.data; 

        // --- 1. NET ASSETS (Balance Sheet) CALCULATION (UNCHANGED) ---
        
        // Check for basic statements data integrity
        if (!statementsResult || statementsResult.length === 0 || !statementsResult[0].statements) { 
             return res.json({ success: true, data: fixedMetrics }); 
        } 
        
        const bsDefinition = statementsResult[0].statements.find(s => s.statement === 'BS');

        if (bsDefinition) {
            const bsColumns = bsDefinition.columns;
            const totalAssetsIndex = bsColumns.indexOf("Total Assets");
            const totalLiabilitiesIndex = bsColumns.indexOf("Total Liabilities");
            
            // Get the absolute latest filing (Q or FY) - CORE LOGIC
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
        
        // --- 2. ATH (All-Time High) CALCULATION (UNCHANGED LOGIC) ---
        const priceData = priceHistoryResult?.data || []; 
        const priceColumns = priceHistoryResult?.columns || [];
        const highestPriceIndex = priceColumns.indexOf("Highest Price");

        if (highestPriceIndex !== -1 && Array.isArray(priceData)) {
            let maxPrice = 0;
            for (const row of priceData) {
                const price = parseFloat(row[highestPriceIndex]);
                if (!isNaN(price) && price > maxPrice) {
                    maxPrice = price;
                }
            }
            if (maxPrice > 0) {
                fixedMetrics.ath = maxPrice.toFixed(2);
            }
        }
        
        // Final return of the calculated metrics
        res.json({ success: true, data: fixedMetrics });

    } catch (err) {
        console.error(`Error fetching fixed metrics for ${ticker}:`, err);
        // Include detailed error message from Axios if possible for debugging purposes
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