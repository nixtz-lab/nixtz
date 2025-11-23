// routes/laundry_admin_api_be.js - Router for Laundry Service Admin Management
const express = require('express');
const router = express.Router();
const { LaundryRequest, User } = require('../server (14).js'); 
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // Need bcrypt for staff creation

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

// POST /api/laundry/admin/create-staff - Create a new staff user (requires adminAuthMiddleware, handled in server.js)
router.post('/create-staff', async (req, res) => {
    const { username, email, password, role } = req.body;
    
    // Admin can only create 'standard' or 'admin' roles for services
    if (!username || !email || !password || !['standard', 'admin'].includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid or missing user data. Role must be "standard" or "admin".' });
    }
    
    try {
        let userExists = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username }] });
        if (userExists) return res.status(400).json({ success: false, message: 'Email or Username already exists.' });

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const newUser = new User({
            username,
            email: email.toLowerCase(),
            passwordHash,
            role, // Set the requested role (standard or admin)
            membership: 'none',
            pageAccess: ['laundry_request', 'laundry_staff'] // Grant access to service pages
        });
        await newUser.save();
        res.status(201).json({ success: true, message: `Staff account (${role}) created successfully!` });
    } catch (err) {
        console.error('Create Staff Account Error:', err);
        res.status(500).json({ success: false, message: 'Server error during staff creation.' });
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