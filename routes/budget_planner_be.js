// routes/budget_planner_be.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Import the shared middleware
// Note the '../' to go up one directory from 'routes' to 'middleware'
const { authMiddleware } = require('../middleware/auth'); 

// Get the BudgetProjection model defined in server.js
const BudgetProjection = mongoose.model('BudgetProjection');

// ===================================================================
// 1. BUDGET PLANNER (PROJECTION) API ROUTES
// ===================================================================

/**
 * @route   GET /api/projections/
 * @desc    Get all projections for the logged-in user
 * @access  Private
 */
router.get('/', authMiddleware, async (req, res) => {
    try {
        const projections = await BudgetProjection.find({ user: req.user.id })
                                                .sort({ monthYear: -1 }); // Newest first
        res.json({ success: true, data: projections });
    } catch (err) {
        console.error('Fetch Projections Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching projections.' });
    }
});

/**
 * @route   POST /api/projections/
 * @desc    Save or Update (upsert) a projection for a specific month
 * @access  Private
 */
router.post('/', authMiddleware, async (req, res) => {
    const { monthYear, projectedIncome, projectedExpenses } = req.body;

    if (!monthYear || typeof projectedIncome === 'undefined' || !projectedExpenses) {
        return res.status(400).json({ success: false, message: 'Missing required projection data.' });
    }

    try {
        const projectionData = {
            user: req.user.id,
            monthYear,
            projectedIncome,
            projectedExpenses
        };
        
        // Find by user and month, and update it or create it if it doesn't exist
        const updatedProjection = await BudgetProjection.findOneAndUpdate(
            { user: req.user.id, monthYear: monthYear }, // Find query
            projectionData,                             // Data to update/insert
            { new: true, upsert: true, runValidators: true } // Options
        );

        res.status(201).json({ success: true, message: `Plan for ${monthYear} saved.`, data: updatedProjection });

    } catch (err) {
        console.error('Save Projection Error:', err.message);
        if (err.code === 11000) {
            return res.status(400).json({ success: false, message: 'A plan for this month already exists (concurrent error).' });
        }
        res.status(500).json({ success: false, message: 'Server error saving projection.' });
    }
});

/**
 * @route   DELETE /api/projections/:monthYear
 * @desc    Delete a projection for a specific month
 * @access  Private
 */
router.delete('/:monthYear', authMiddleware, async (req, res) => {
    const { monthYear } = req.params;
    if (!monthYear) {
        return res.status(400).json({ success: false, message: 'Month-Year parameter is required.' });
    }

    try {
        const result = await BudgetProjection.deleteOne({ 
            user: req.user.id, 
            monthYear: monthYear 
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, message: 'Projection not found or you are not authorized.' });
        }

        res.json({ success: true, message: `Plan for ${monthYear} deleted.` });
    } catch (err) {
        console.error('Delete Projection Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error deleting projection.' });
    }
});

module.exports = router;