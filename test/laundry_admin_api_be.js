// routes/laundry_admin_api_be.js - Router for Laundry Service Request Management
const express = require('express');
const router = express.Router();
// IMPORT FIX: Use mongoose.model() to prevent circular dependency warnings.
const mongoose = require('mongoose');
const User = mongoose.model('User');
const LaundryRequest = mongoose.model('LaundryRequest');

// GET /api/laundry/admin/analytics - Get aggregated counts of requests by status
router.get('/analytics', async (req, res) => {
    try {
        // Aggregate to count requests by status
        const analytics = await LaundryRequest.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Transform array into an object for easier lookup on the frontend
        const statusCounts = analytics.reduce((acc, item) => {
            acc[item._id.replace(/\s/g, '')] = item.count;
            return acc;
        }, {});

        // Calculate totals
        const totalRequests = analytics.reduce((sum, item) => sum + item.count, 0);
        statusCounts.Total = totalRequests;

        res.json({ success: true, data: statusCounts });

    } catch (err) {
        console.error('Laundry Admin Analytics Error:', err);
        res.status(500).json({ success: false, message: 'Server error fetching analytics.' });
    }
});

// GET /api/laundry/admin/all-requests - Get all requests (including completed/cancelled)
router.get('/all-requests', async (req, res) => {
    try {
        const requests = await LaundryRequest.find({})
            .sort({ requestedAt: -1 }) // Newest first
            .select('-__v'); 

        res.json({ success: true, data: requests });
    } catch (err) {
        console.error('Laundry Admin All Requests Error:', err);
        res.status(500).json({ success: false, message: 'Server error fetching all requests.' });
    }
});


// DELETE /api/laundry/admin/:id - Delete a specific request by ID
router.delete('/:id', async (req, res) => {
    const requestId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({ success: false, message: 'Invalid request ID.' });
    }

    try {
        const result = await LaundryRequest.findByIdAndDelete(requestId);

        if (!result) {
            return res.status(404).json({ success: false, message: 'Request not found.' });
        }

        res.json({ success: true, message: `Request ${requestId} deleted successfully.` });

    } catch (err) {
        console.error('Laundry Admin Delete Error:', err);
        res.status(500).json({ success: false, message: 'Server error deleting request.' });
    }
});

module.exports = router;