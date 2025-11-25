// routes/budget_planner_be.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Retrieve models
const BudgetProjection = mongoose.model('BudgetProjection');
const User = mongoose.model('User'); 

// Helper function to calculate start of the month from a YYYY-MM string
const formatMonthYear = (date) => {
    // Expects date in YYYY-MM format, returns YYYY-MM
    return date.substring(0, 7);
};

/**
 * @route   POST /api/projections/save-plan
 * @desc    Save or update a monthly budget projection plan
 * @access  Private
 */
router.post('/save-plan', async (req, res) => {
    const { monthYear, projectedIncome, projectedExpenses } = req.body;
    const userId = req.user.id;
    
    if (!monthYear || typeof projectedIncome !== 'number' || !projectedExpenses) {
        return res.status(400).json({ success: false, message: 'Missing required projection data.' });
    }
    
    try {
        const result = await BudgetProjection.findOneAndUpdate(
            { user: userId, monthYear: monthYear },
            { 
                projectedIncome: projectedIncome, 
                projectedExpenses: projectedExpenses // Map of category: amount
            },
            { new: true, upsert: true, runValidators: true }
        );

        res.json({ success: true, message: `Budget plan for ${monthYear} saved successfully.`, data: result });
    } catch (err) {
        console.error('Save Budget Plan Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error saving budget plan.' });
    }
});

/**
 * @route   GET /api/projections/load-plan
 * @desc    Load a monthly budget projection plan by month/year
 * @access  Private
 */
router.get('/load-plan', async (req, res) => {
    const { monthYear } = req.query; // Expected format: YYYY-MM

    if (!monthYear) {
        return res.status(400).json({ success: false, message: 'Month and year parameter is required.' });
    }

    try {
        const plan = await BudgetProjection.findOne({ 
            user: req.user.id, 
            monthYear: monthYear 
        });
        
        if (!plan) {
            return res.status(200).json({ success: true, message: 'No plan found for this month.', data: null });
        }
        
        res.json({ success: true, data: plan });
    } catch (err) {
        console.error('Load Budget Plan Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error loading budget plan.' });
    }
});

module.exports = router;