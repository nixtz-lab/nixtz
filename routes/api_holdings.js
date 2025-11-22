/**
 * routes/api_holdings.js
 * Handles CRUD operations for a user's stored portfolio holdings (broker, shares, cost_basis, date).
 *
 * MODIFIED (LATEST):
 * - Added PUT route to handle editing/updating existing holdings.
 * - Added 'annual_dividend' to POST and PUT routes.
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Assuming PortfolioHolding model is globally available via Mongoose or imported
// The model is defined in server.js, so we access it via mongoose.model()
const PortfolioHolding = mongoose.model('PortfolioHolding');

// Import necessary middleware
const { authMiddleware } = require('../middleware/auth'); // Adjust path as necessary

// --- GET: Fetch all holdings for the authenticated user (READ) ---
router.get('/holdings', authMiddleware, async (req, res) => {
    try {
        // Find all holdings linked to the user ID from the JWT payload
        const holdings = await PortfolioHolding.find({ user: req.user.id }).sort({ ticker: 1 });
        
        // Return holdings data
        res.json({ success: true, data: holdings });
    } catch (err) {
        console.error('Fetch Holdings Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching portfolio holdings.' });
    }
});

// --- POST: Add a new holding (CREATE) ---
router.post('/holdings', authMiddleware, async (req, res) => {
    // Added annual_dividend
    const { broker, ticker, shares, buy_price, buy_date, asset_class, annual_dividend } = req.body;
    
    // Basic validation
    if (!broker || !ticker || typeof shares !== 'number' || shares <= 0 || 
        typeof buy_price !== 'number' || buy_price <= 0 || !buy_date) {
        return res.status(400).json({ success: false, message: 'Please provide valid broker, ticker, shares, buy price, and date.' });
    }
    
    try {
        const newHolding = new PortfolioHolding({
            user: req.user.id,
            broker: broker.trim(),
            ticker: ticker.toUpperCase().trim(),
            shares: shares,
            buy_price: buy_price,
            buy_date: new Date(buy_date),
            asset_class: asset_class || 'Equity',
            annual_dividend: annual_dividend || 0 // Save the new field
        });

        const savedHolding = await newHolding.save();
        
        res.status(201).json({ success: true, message: 'Holding successfully added.', data: savedHolding });

    } catch (err) {
        console.error('Add Holding Error:', err.message);
        if (err.name === 'ValidationError') {
             return res.status(400).json({ success: false, message: `Validation Error: ${err.message}` });
        }
        res.status(500).json({ success: false, message: 'Server error saving holding.' });
    }
});

// --- ****** NEW SECTION: UPDATE A HOLDING (UPDATE) ****** ---
router.put('/holdings/:id', authMiddleware, async (req, res) => {
    const { broker, ticker, shares, buy_price, buy_date, asset_class, annual_dividend } = req.body;
    const holdingId = req.params.id;

    // Check for valid MongoDB ID
    if (!mongoose.Types.ObjectId.isValid(holdingId)) {
        return res.status(400).json({ success: false, message: 'Invalid holding ID.' });
    }

    // Build the update object
    const updateFields = {
        broker,
        ticker: ticker.toUpperCase(),
        shares,
        buy_price,
        buy_date,
        asset_class,
        annual_dividend: annual_dividend || 0
    };

    try {
        // Find the holding by its ID and the user ID (to ensure security)
        let holding = await PortfolioHolding.findOne({ _id: holdingId, user: req.user.id });

        if (!holding) {
            return res.status(404).json({ success: false, message: 'Holding not found or user not authorized.' });
        }

        // Update the holding
        holding = await PortfolioHolding.findByIdAndUpdate(
            holdingId,
            { $set: updateFields },
            { new: true } // Return the modified document
        );

        res.json({ success: true, message: 'Holding updated successfully.', data: holding });

    } catch (err) {
        console.error("Error in PUT /api/portfolio/holdings/:id :", err.message);
        res.status(500).json({ success: false, message: 'Server error updating holding.' });
    }
});
// --- ****** END NEW SECTION ****** ---


// --- DELETE: Remove a holding (DELETE) ---
router.delete('/holdings/:id', authMiddleware, async (req, res) => {
    const holdingId = req.params.id;
    
    try {
        // Find and delete the holding, ensuring it belongs to the authenticated user
        const result = await mongoose.model('PortfolioHolding').deleteOne({
            _id: holdingId,
            user: req.user.id
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, message: 'Holding not found or unauthorized.' });
        }

        res.json({ success: true, message: 'Holding successfully deleted.' });

    } catch (err) {
        console.error('Delete Holding Error:', err.message);
        if (err.name === 'CastError') {
             return res.status(400).json({ success: false, message: 'Invalid holding ID format.' });
        }
        res.status(500).json({ success: false, message: 'Server error deleting holding.' });
    }
});

module.exports = router;