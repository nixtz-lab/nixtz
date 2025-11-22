// stock_analysis_be.js
// stock_analysis_be_complete_fix.js (Includes all 5Yr Avg, CAGRs, Net Assets, and ATH logic)

const express = require('express');
const axios = require('axios');
const router = express.Router();

// --- Dependencies ---
const SIMFIN_API_KEY = process.env.SIMFIN_API_KEY || "2a8d888b-daef-49fd-9736-b80328a9ea23"; 
const SIMFIN_BASE_URL = "https://backend.simfin.com/api/v3/companies";
const isNumber = (val) => typeof val === 'number' && !isNaN(val);

// --- 1. COMPLETE SIMFIN HISTORICALS ROUTE ---
router.get('/historicals/:ticker', async (req, res) => {
    const { ticker } = req.params;

    if (!SIMFIN_API_KEY || SIMFIN_API_KEY.includes("YOUR_API_KEY") || (SIMFIN_API_KEY === "2a8d888b-daef-49fd-9736-b80328a9ea23" && process.env.NODE_ENV === 'production' && !process.env.SIMFIN_API_KEY)) {
        console.warn("SimFin API key not set via environment variable or is using default key in production.");
        return res.status(500).json({ success: false, message: "Server not properly configured for SimFin historical data." });
    }

    let historicalAverages = {
        avgNetIncome5Yr: "N/A", avgProfitMargin5Yr: "N/A", avgFCF5Yr: "N/A",
        avgEps5Yr: "N/A", avgCashFlowPerShare5Yr: "N/A", avgRevenuePerShare5Yr: "N/A",
        compoundRevenueGrowth3Yr: "N/A", compoundRevenueGrowth5Yr: "N/A",
        compoundRevenueGrowth10Yr: "N/A", compoundShareGrowth5Yr: "N/A", 
        netAssets: "N/A", avgROIC5Yr: "N/A",
        ath: "N/A", // Initialize ATH
    };
    
    const statementsUrl = `${SIMFIN_BASE_URL}/statements/compact?ticker=${ticker}&statements=pl,cf,bs&period=fy`;
    const sharesUrl = `${SIMFIN_BASE_URL}/weighted-shares-outstanding?ticker=${ticker}&period=fy`; 
    // ADDED: Endpoint for fetching daily price history (needed for ATH)
    const priceHistoryUrl = `${SIMFIN_BASE_URL}/timeseries/daily?ticker=${ticker}`; 
    const options = { method: 'GET', headers: { 'accept': 'application/json', 'Authorization': `api-key ${SIMFIN_API_KEY}` } };

    try {
        console.log(`[stock_analysis_be] Fetching SimFin data for ${ticker}...`);

        // MODIFIED: Added priceHistoryResponse to the concurrent calls
        const [statementsResponse, sharesResponse, priceHistoryResponse] = await Promise.all([
            axios.get(statementsUrl, options),
            axios.get(sharesUrl, options),
            // Use a catch block for price history as fallback
            axios.get(priceHistoryUrl, options).catch(err => {
                 console.warn(`[stock_analysis_be] ATH/Price History API call failed: ${err.message}. Defaulting to empty result.`);
                 return { data: { columns: [], data: [] } }; 
            }),
        ]);

        const statementsResult = statementsResponse.data;
        const priceHistoryResult = priceHistoryResponse.data; // Added Price History result
        if (!statementsResult || statementsResult.length === 0 || !statementsResult[0].statements) { return res.json({ success: true, data: historicalAverages }); }
        
        const companyData = statementsResult[0];
        const plDefinition = companyData.statements.find(s => s.statement === 'PL');
        const cfDefinition = companyData.statements.find(s => s.statement === 'CF');
        const bsDefinition = companyData.statements.find(s => s.statement === 'BS');

        if (!plDefinition || !cfDefinition || !bsDefinition) { return res.json({ success: true, data: historicalAverages }); }

        // Find Indices
        const plColumns = plDefinition.columns; const cfColumns = cfDefinition.columns;
        const revenueIndex = plColumns.indexOf("Revenue");
        const netIncomeIndex = plColumns.indexOf("Net Income");
        let opCashFlowIndex = cfColumns.indexOf("Cash from Operating Activities"); 
        if (opCashFlowIndex === -1) opCashFlowIndex = cfColumns.indexOf("Net Cash from Operating Activities"); 
        let capExIndex = cfColumns.indexOf("Acquisition of Fixed Assets & Intangibles"); 
        if (capExIndex === -1) capExIndex = cfColumns.indexOf("Capital Expenditures"); 
        const bsColumns = bsDefinition.columns;
        const totalAssetsIndex = bsColumns.indexOf("Total Assets");
        const totalLiabilitiesIndex = bsColumns.indexOf("Total Liabilities");

        // Process Shares
        const sharesMap = new Map();
        if (Array.isArray(sharesResponse.data)) { sharesResponse.data.forEach(item => { if (item.fyear && item.period === 'FY' && isNumber(item.diluted)) { sharesMap.set(item.fyear, item.diluted); } }); }

        // Filter Data Rows
        const plDataRows = plDefinition.data.filter(row => row[0] === 'FY'); 
        const cfDataRows = cfDefinition.data.filter(row => row[0] === 'FY');
        const bsDataRows = bsDefinition.data.filter(row => row[0] === 'FY'); 
        const yearIndexPL = plColumns.indexOf("Fiscal Year"); 

        const plRecentRowsRaw = plDataRows.slice(-10); 
        const cfRecentRowsRaw = cfDataRows.slice(-10); 
        const latestBsRow = bsDataRows.length > 0 ? bsDataRows[bsDataRows.length - 1] : null;

        const plYears = new Set(plRecentRowsRaw.map(row => row[yearIndexPL])); 
        const cfYears = new Set(cfRecentRowsRaw.map(row => row[yearIndexPL]));
        const commonYears = [...plYears].filter(year => cfYears.has(year)).sort((a,b) => a-b); 
        const recentCommonYearsForAvg = commonYears.slice(-5); 

        // Calculation variables
        let sumNetIncome = 0, sumProfitMargin = 0, sumFCF = 0, sumEPS = 0, sumRevPerShare = 0, sumCFPerShare = 0;
        let countNetIncome = 0, countProfitMargin = 0, countFCF = 0, countEPS = 0, countRevPerShare = 0, countCFPerShare = 0;
        let revenueData = [];

        // 1. Populate revenueData (for CAGR)
        for (const year of commonYears) { 
            const plRowData = plRecentRowsRaw.find(row => row[yearIndexPL] === year);
            const revenue = plRowData.length > revenueIndex ? parseFloat(plRowData[revenueIndex]) : null;
            if (isNumber(revenue)) { revenueData.push({ year: year, value: revenue }); }
        }
        revenueData.sort((a, b) => a.year - b.year); 

        // 2. Calculate 5-year averages (THE MISSING LOOP)
        for (const year of recentCommonYearsForAvg) { 
            const plRow = plRecentRowsRaw.find(row => row[yearIndexPL] === year);
            const cfRow = cfRecentRowsRaw.find(row => row[cfColumns.indexOf("Fiscal Year")] === year);

            if (!plRow || !cfRow) continue;

            const netIncome = plRow.length > netIncomeIndex ? parseFloat(plRow[netIncomeIndex]) : null;
            const revenue = plRow.length > revenueIndex ? parseFloat(plRow[revenueIndex]) : null;
            const opCashFlow = cfRow.length > opCashFlowIndex ? parseFloat(cfRow[opCashFlowIndex]) : null;
            const capEx = cfRow.length > capExIndex ? parseFloat(cfRow[capExIndex]) : 0; 
            const shares = sharesMap.get(year); 

            // Calculate Net Income & Profit Margin
            if (isNumber(netIncome) && isNumber(revenue) && revenue !== 0) {
                sumNetIncome += netIncome;
                sumProfitMargin += (netIncome / revenue);
                countNetIncome++;
                countProfitMargin++;
            }

            // Calculate FCF
            if (isNumber(opCashFlow)) {
                const validCapEx = isNumber(capEx) ? capEx : 0;
                const fcf = opCashFlow + validCapEx; 
                sumFCF += fcf;
                countFCF++;
            }

            // Calculate Per-Share Metrics
            if (isNumber(shares) && shares !== 0) {
                if (isNumber(netIncome)) { sumEPS += (netIncome / shares); countEPS++; }
                if (isNumber(revenue)) { sumRevPerShare += (revenue / shares); countRevPerShare++; }
                if (isNumber(opCashFlow)) {
                    const validCapEx = isNumber(capEx) ? capEx : 0;
                    const fcf = opCashFlow + validCapEx;
                    sumCFPerShare += (fcf / shares);
                    countCFPerShare++;
                }
            }
        } 

        // 3. Apply Averages
        if (countNetIncome > 0) historicalAverages.avgNetIncome5Yr = ((sumNetIncome / countNetIncome) / 1e9).toFixed(2) + "B";
        if (countProfitMargin > 0) historicalAverages.avgProfitMargin5Yr = `${((sumProfitMargin / countProfitMargin) * 100).toFixed(2)}%`;
        if (countFCF > 0) historicalAverages.avgFCF5Yr = ((sumFCF / countFCF) / 1e9).toFixed(2) + "B";
        if (countEPS > 0) historicalAverages.avgEps5Yr = `$${(sumEPS / countEPS).toFixed(2)}`;
        if (countRevPerShare > 0) historicalAverages.avgRevenuePerShare5Yr = `$${(sumRevPerShare / countRevPerShare).toFixed(2)}`;
        if (countCFPerShare > 0) historicalAverages.avgCashFlowPerShare5Yr = `$${(sumCFPerShare / countCFPerShare).toFixed(2)}`;

        // 4. Calculate CAGRs (Revenue & Shares)
        const getCAGR = (dataArray, periods) => {
            if (!dataArray || dataArray.length < periods + 1) return null;
            const startValue = dataArray[dataArray.length - periods - 1].value;
            const endValue = dataArray[dataArray.length - 1].value;
            if (isNumber(startValue) && isNumber(endValue) && startValue !== 0) {
                const cagr = (Math.pow(endValue / startValue, 1 / periods) - 1) * 100;
                return isNaN(cagr) ? "N/A" : `${cagr.toFixed(2)}%`; 
            }
            return "N/A"; 
        };
        if (revenueData.length >= 3) historicalAverages.compoundRevenueGrowth3Yr = getCAGR(revenueData, 2);
        if (revenueData.length >= 5) historicalAverages.compoundRevenueGrowth5Yr = getCAGR(revenueData, 4);
        if (revenueData.length >= 10) historicalAverages.compoundRevenueGrowth10Yr = getCAGR(revenueData, 9);

        // CAGR (Shares)
        const sortedShareYears = [...sharesMap.keys()].sort((a, b) => a - b);
        if (sortedShareYears.length >= 5) {
            const sharesNow = sharesMap.get(sortedShareYears[sortedShareYears.length - 1]);
            const shares5yrAgo = sharesMap.get(sortedShareYears[sortedShareYears.length - 5]);
            if (isNumber(sharesNow) && isNumber(shares5yrAgo) && shares5yrAgo > 0) {
                const cagr5Share = (Math.pow(sharesNow / shares5yrAgo, 1 / 4) - 1) * 100;
                if (!isNaN(cagr5Share)) historicalAverages.compoundShareGrowth5Yr = `${cagr5Share.toFixed(2)}%`;
            }
        }
        
        // 5. Net Assets Calculation (Working via this route, hence keeping it here)
        if (latestBsRow && totalAssetsIndex !== -1 && totalLiabilitiesIndex !== -1) {
             const assets = parseFloat(latestBsRow[totalAssetsIndex]);
             const liabilities = parseFloat(latestBsRow[totalLiabilitiesIndex]);

             if (isNumber(assets) && isNumber(liabilities)) {
                 const netAssetsRaw = assets - liabilities;
                 historicalAverages.netAssets = (netAssetsRaw / 1e9).toFixed(2) + "B";
                 console.log(`[stock_analysis_be] Calculated Net Assets for ${ticker}: ${historicalAverages.netAssets}`);
             }
        }
        
        // 6. ATH (All-Time High) CALCULATION (ADDED: Same implementation as net assets)
        const priceData = priceHistoryResult?.data || []; 
        const priceColumns = priceHistoryResult?.columns || [];
        const highestPriceIndex = priceColumns.indexOf("Highest Price");

        if (highestPriceIndex !== -1 && Array.isArray(priceData)) {
            let maxPrice = 0;
            // Assuming price data rows are nested arrays [Date, Div, Shares, Last Close, Adj Close, Highest Price, ...]
            for (const row of priceData) {
                const price = parseFloat(row[highestPriceIndex]); 
                if (!isNaN(price) && price > maxPrice) {
                    maxPrice = price;
                }
            }
            if (maxPrice > 0) {
                historicalAverages.ath = maxPrice.toFixed(2);
                console.log(`[stock_analysis_be] Calculated ATH for ${ticker}: ${historicalAverages.ath}`);
            }
        }

        res.json({ success: true, data: historicalAverages });

    } catch (err) {
        let errorMessage = `Server error fetching SimFin data for ${ticker}.`; 
        let statusCode = 500;
        if (axios.isAxiosError(err)) { 
            if (err.response) statusCode = err.response.status; 
            else if (err.request) statusCode = 504; 
        } 
        res.status(statusCode).json({ success: false, message: errorMessage });
    }
});

module.exports = router;