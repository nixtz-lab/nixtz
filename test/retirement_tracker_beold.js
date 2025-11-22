// routes/retirement_tracker_be.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authMiddleware } = require('../middleware/auth');
const axios = require('axios');

// Schemas are retrieved from server.js
const RetirementProfile = mongoose.model('RetirementProfile');
const FinancialAsset = mongoose.model('FinancialAsset');
const PropertyAsset = mongoose.model('PropertyAsset');
const BusinessAsset = mongoose.model('BusinessAsset');
const NetWorthSnapshot = mongoose.model('NetWorthSnapshot');

// Mock API Call (Simulates fetching a live price for an asset)
async function getLivePrice(ticker) {
    // In a real application, this would call Yahoo/Polygon/RapidAPI
    // Since we don't have that context, we provide a mock price range.
    const basePrice = 100 + (ticker.length * 5); // Base price fluctuates by ticker length
    return basePrice + Math.floor(Math.random() * 10); 
}

// ===================================================================
// CORE API FOR FRONTEND DASHBOARD
// ===================================================================

/**
 * @route   GET /api/retirement/dashboard
 * @desc    Aggregates all asset data and history for the dashboard view.
 * @access  Private
 */
router.get('/dashboard', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    try {
        const profile = await RetirementProfile.findOne({ user: userId });
        const financial = await FinancialAsset.find({ user: userId });
        const property = await PropertyAsset.find({ user: userId });
        const business = await BusinessAsset.find({ user: userId });
        const snapshots = await NetWorthSnapshot.find({ user: userId }).sort({ date: 1 });

        // Calculate current aggregated totals for the cards
        let currentFinancialValue = 0;
        let currentPassiveIncome = 0;
        
        // Financial Assets: Handle Ticker AND Broker Accounts
        currentFinancialValue = financial.reduce((sum, asset) => {
            // Check for Broker Account structure (simplistic check based on presence of key fields)
            const isBrokerAccount = asset.nickname && (asset.totalValue !== undefined && asset.totalValue !== null);

            if (isBrokerAccount) {
                // Broker Account logic
                const value = parseFloat(asset.totalValue) || 0;
                const income = parseFloat(asset.annualIncome) || 0;
                currentPassiveIncome += income;
                return sum + value;
            } else {
                // Individual Ticker logic
                const price = asset.lastPrice || 0;
                const value = asset.shares * price;
                const income = value * (asset.annualYieldPct / 100);
                currentPassiveIncome += income;
                return sum + value;
            }
        }, 0);

        const propertyTotals = property.reduce((acc, prop) => {
            acc.value += prop.marketValue;
            acc.equity += prop.marketValue - prop.loanBalance;
            acc.netIncome += (prop.rentalIncome * 12) - (prop.loanPayment * 12);
            return acc;
        }, { value: 0, equity: 0, netIncome: 0 });

        currentPassiveIncome += propertyTotals.netIncome;
        
        const businessIncome = business.reduce((sum, asset) => sum + (asset.monthlyProfit * 12), 0);
        currentPassiveIncome += businessIncome;
        
        const totalNetWorth = currentFinancialValue + propertyTotals.equity + business.reduce((sum, a) => sum + a.currentValuation, 0);

        // --- FI Number Calculation Update ---
        // Sum Annual Living Expenses and Annual Travel Spending
        const annualExpenses = parseFloat(profile?.annualExpenses) || 0;
        const annualTravelSpending = parseFloat(profile?.annualTravelSpending) || 0;
        const totalAnnualExpenses = annualExpenses + annualTravelSpending;

        res.json({
            success: true,
            profile,
            financial,
            property,
            business,
            snapshots,
            currentTotals: {
                totalNetWorth,
                totalPassiveIncome: currentPassiveIncome,
                // UPDATED FI NUMBER CALCULATION
                fiNumber: profile && profile.safeWithdrawalRate > 0 ? (totalAnnualExpenses / (profile.safeWithdrawalRate / 100)) : 0 
            }
        });

    } catch (err) {
        console.error('Dashboard aggregation error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to load dashboard data.' });
    }
});


// ===================================================================
// CORE PROFILE CRUD ENDPOINTS
// ===================================================================

/**
 * @route   POST /api/retirement/save
 * @desc    Updates the core RetirementProfile with user inputs.
 * @access  Private
 */
router.post('/save', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    // EXTRACT THE NEW FIELD HERE
    const { monthlyContribution, annualExpenses, annualTravelSpending, expectedReturn, safeWithdrawalRate } = req.body;
    
    try {
        const profile = await RetirementProfile.findOneAndUpdate(
            { user: userId },
            // ADD THE NEW FIELD TO THE UPDATE OBJECT
            { monthlyContribution, annualExpenses, annualTravelSpending, expectedReturn, safeWithdrawalRate },
            // Create the profile if it doesn't exist (upsert) and return the new document (new: true)
            { new: true, upsert: true } 
        );

        res.json({ success: true, message: 'Core profile updated successfully!', data: profile });

    } catch (err) {
        console.error('Save retirement profile error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to save retirement profile.' });
    }
});


// ===================================================================
// SNAPSHOT AND CARRY-FORWARD LOGIC
// ===================================================================

/**
 * @route   POST /api/retirement/snapshot/record
 * @desc    Records a new timestamped snapshot by aggregating existing assets.
 * Implements carry-forward and live price logic.
 * @access  Private
 */
router.post('/snapshot/record', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    try {
        const profile = await RetirementProfile.findOne({ user: userId });
        const financialAssets = await FinancialAsset.find({ user: userId });
        const propertyAssets = await PropertyAsset.find({ user: userId });
        const businessAssets = await BusinessAsset.find({ user: userId });

        if (!profile) throw new Error("Core profile must be saved before recording a snapshot.");
        
        // 1. ASSET CARRY-FORWARD AND RE-CALCULATION
        let totalFinancialValue = 0;
        let totalPassiveIncome = 0;
        let totalPropertyEquity = 0;

        // Financial Assets: Handle Ticker AND Broker Accounts
        for (const asset of financialAssets) {
            const isBrokerAccount = asset.nickname && (asset.totalValue !== undefined && asset.totalValue !== null);

            if (isBrokerAccount) {
                 // Broker Account logic (no price fetch needed)
                 totalFinancialValue += parseFloat(asset.totalValue) || 0;
                 totalPassiveIncome += parseFloat(asset.annualIncome) || 0;
            } else {
                 // Individual Ticker logic
                 const livePrice = await getLivePrice(asset.ticker); 
                 
                 asset.lastPrice = livePrice; // Save live price for next snapshot's starting point
                 await asset.save();
                 
                 const value = asset.shares * livePrice;
                 const income = value * (asset.annualYieldPct / 100);
                 
                 totalFinancialValue += value;
                 totalPassiveIncome += income;
            }
        }

        // Property Assets: Amortize loan (carry-forward) and calculate net income
        for (const prop of propertyAssets) {
            totalPropertyEquity += prop.marketValue - prop.loanBalance;
            totalPassiveIncome += (prop.rentalIncome * 12) - (prop.loanPayment * 12);
            
            // Simplified Amortization (Reduce loan balance by monthly payment)
            if (prop.loanBalance > 0) {
                 prop.loanBalance = Math.max(0, prop.loanBalance - prop.loanPayment); 
                 prop.yearsRemaining = Math.max(0, prop.yearsRemaining - (1/12));
                 await prop.save();
            }
        }
        
        // Business Assets: Aggregate carry-forward income
        totalPassiveIncome += businessAssets.reduce((sum, asset) => sum + (asset.monthlyProfit * 12), 0);
        
        const totalNetWorth = totalFinancialValue + totalPropertyEquity + businessAssets.reduce((sum, a) => sum + a.currentValuation, 0);

        // 2. SAVE THE SNAPSHOT
        const newSnapshot = new NetWorthSnapshot({
            user: userId,
            date: new Date(),
            totalNetWorth,
            totalPassiveIncome,
            financialAssetsValue: totalFinancialValue,
            propertyEquity: totalPropertyEquity
        });
        await newSnapshot.save();

        res.json({ success: true, message: 'Monthly snapshot recorded successfully!', data: newSnapshot });
        
    } catch (err) {
        console.error('Snapshot recording error:', err.message);
        res.status(500).json({ success: false, message: err.message || 'Failed to record snapshot.' });
    }
});


// ===================================================================
// ASSET CRUD ENDPOINTS 
// ===================================================================

/**
 * @route   POST /api/retirement/assets/financial/save
 * NOTE: This endpoint now accepts either a 'ticker' structure or a 'nickname/totalValue' (Broker) structure.
 */
router.post('/assets/financial/save', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    // Catch all fields that might come from Ticker or Broker form
    const { _id, ticker, shares, annualYieldPct, nickname, totalValue, annualIncome, broker } = req.body; 
    
    try {
        let update;
        let filter;

        if (ticker) {
            // Individual Ticker Update/Creation
            filter = _id ? { _id, user: userId } : { ticker: ticker.toUpperCase(), user: userId };
            
            // Set broker-related fields to null when saving a ticker
            update = { 
                user: userId, 
                ticker: ticker.toUpperCase(), 
                shares, 
                annualYieldPct, 
                broker, // <-- ADDED BROKER FIELD
                totalValue: null, 
                annualIncome: null, 
                nickname: null 
            };
        } else if (nickname && totalValue !== undefined) {
            // Broker/Account Total Update/Creation
            filter = _id ? { _id, user: userId } : { nickname, user: userId };
            // Set ticker-related fields to null when saving a broker account
            update = { 
                user: userId, 
                nickname, 
                totalValue, 
                annualIncome, 
                ticker: null, 
                shares: null, 
                annualYieldPct: null,
                broker: nickname // Use nickname as broker name for aggregated accounts
            };
        } else {
            return res.status(400).json({ success: false, message: 'Invalid financial asset data provided.' });
        }

        const asset = await FinancialAsset.findOneAndUpdate(filter, update, { new: true, upsert: true });
        res.json({ success: true, message: 'Financial asset saved.', data: asset });
    } catch (err) {
        console.error('Save financial asset error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to save financial asset.' });
    }
});

/**
 * @route   POST /api/retirement/assets/property/save
 */
router.post('/assets/property/save', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { _id, nickname, marketValue, loanBalance, rentalIncome, loanPayment, yearsRemaining } = req.body;
    
    try {
        const filter = _id ? { _id, user: userId } : { nickname, user: userId };
        const update = { userId, nickname, marketValue, loanBalance, rentalIncome, loanPayment, yearsRemaining };

        const asset = await PropertyAsset.findOneAndUpdate(filter, update, { new: true, upsert: true });
        res.json({ success: true, message: 'Property asset saved.', data: asset });
    } catch (err) {
        console.error('Save property asset error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to save property asset.' });
    }
});

/**
 * @route   POST /api/retirement/assets/business/save
 */
router.post('/assets/business/save', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { _id, nickname, currentValuation, monthlyProfit } = req.body;
    
    try {
        const filter = _id ? { _id, user: userId } : { nickname, user: userId };
        const update = { userId, nickname, currentValuation, monthlyProfit };

        const asset = await BusinessAsset.findOneAndUpdate(filter, update, { new: true, upsert: true });
        res.json({ success: true, message: 'Business income saved.', data: asset });
    } catch (err) {
        console.error('Save business asset error:', err.message);
        res.status(500).json({ success: false, message: 'Failed to save business asset.' });
    }
});


/**
 * @route   DELETE /api/retirement/assets/:type/delete/:id
 * @desc    Deletes an asset of any type.
 */
router.delete('/assets/:type/delete/:id', authMiddleware, async (req, res) => {
    const { type, id } = req.params;
    const userId = req.user.id;
    let Model;

    if (type === 'financial') Model = FinancialAsset;
    else if (type === 'property') Model = PropertyAsset;
    else if (type === 'business') Model = BusinessAsset;
    else return res.status(400).json({ success: false, message: 'Invalid asset type.' });

    try {
        const result = await Model.deleteOne({ _id: id, user: userId });
        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, message: 'Asset not found.' });
        }
        res.json({ success: true, message: `${type} asset deleted.` });
    } catch (err) {
        console.error(`Delete ${type} asset error:`, err.message);
        res.status(500).json({ success: false, message: `Failed to delete ${type} asset.` });
    }
});

module.exports = router;