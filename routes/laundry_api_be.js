// routes/laundry_api_be.js - Router for Laundry Service Requests
const express = require('express');
const router = express.Router();
// Import models from the main server file
const { LaundryRequest, User } = require('../server.js'); 
const mongoose = require('mongoose');

// Helper to check if the user is authorized for staff actions (e.g., admin or a specific staff role)
// For this example, we will allow anyone with 'standard', 'admin', or 'superadmin' to view the staff page.
const staffAuthMiddleware = (req, res, next) => {
    const role = req.user.role;
    if (role === 'admin' || role === 'superadmin' || role === 'standard') {
        next();
    } else {
        return res.status(403).json({ success: false, message: 'Access denied. Staff role required.' });
    }
};

// --- USER ENDPOINTS (Request Submission) ---

// POST /api/laundry/request - Submit a new request
router.post('/request', async (req, res) => {
    const { department, contactExt, notes, items } = req.body;
    
    // Basic validation
    if (!department || !contactExt || !items || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Missing required request fields (Department, Contact, Items).' });
    }
    
    try {
        // Fetch user data from token payload (req.user)
        const user = await User.findById(req.user.id).select('username');
        if (!user) return res.status(404).json({ success: false, message: 'Requester not found.' });

        const newRequest = new LaundryRequest({
            requesterId: req.user.id,
            requesterUsername: user.username,
            department,
            contactExt,
            notes,
            items
        });

        await newRequest.save();
        res.status(201).json({ success: true, message: 'Laundry request submitted successfully!', data: newRequest });

    } catch (err) {
        console.error('Laundry Request Submission Error:', err);
        res.status(500).json({ success: false, message: 'Server error submitting request.' });
    }
});

// GET /api/laundry/user-requests - Get all requests made by the logged-in user
router.get('/user-requests', async (req, res) => {
    try {
        const requests = await LaundryRequest.find({ requesterId: req.user.id }).sort({ requestedAt: -1 });
        res.json({ success: true, data: requests });
    } catch (err) {
        console.error('Fetch User Requests Error:', err);
        res.status(500).json({ success: false, message: 'Server error fetching user requests.' });
    }
});


// --- STAFF ENDPOINTS (Management) ---

// GET /api/laundry/staff-view - Get all outstanding requests for staff processing
router.get('/staff-view', staffAuthMiddleware, async (req, res) => {
    try {
        // Find requests that are not yet marked 'Completed' or 'Cancelled'
        const outstandingRequests = await LaundryRequest.find({
            status: { $in: ['Pending Pickup', 'Picked Up', 'In Progress', 'Ready for Delivery'] }
        })
        .sort({ requestedAt: 1 }) // Oldest requests first
        .select('-__v'); 

        res.json({ success: true, data: outstandingRequests });
    } catch (err) {
        console.error('Fetch Staff View Error:', err);
        res.status(500).json({ success: false, message: 'Server error fetching staff requests.' });
    }
});

// PUT /api/laundry/update-status/:id - Update the status of a request
router.put('/update-status/:id', staffAuthMiddleware, async (req, res) => {
    const { status } = req.body;
    const requestId = req.params.id;

    if (!status || !mongoose.Types.ObjectId.isValid(requestId)) {
        return res.status(400).json({ success: false, message: 'Invalid request ID or missing status.' });
    }

    if (!['Picked Up', 'In Progress', 'Ready for Delivery', 'Completed', 'Cancelled'].includes(status)) {
         return res.status(400).json({ success: false, message: 'Invalid status provided.' });
    }

    try {
        const updateFields = { status };
        
        if (status === 'Picked Up') {
            updateFields.pickedUpAt = new Date();
            updateFields.staffAssigned = req.user.id; // Assign the staff member who marks it picked up
        }
        if (status === 'Completed') {
            updateFields.completedAt = new Date();
        }

        const updatedRequest = await LaundryRequest.findByIdAndUpdate(
            requestId,
            { $set: updateFields },
            { new: true } // Return the updated document
        );

        if (!updatedRequest) {
            return res.status(404).json({ success: false, message: 'Request not found.' });
        }

        res.json({ success: true, message: `Request status updated to ${status}.`, data: updatedRequest });

    } catch (err) {
        console.error('Update Status Error:', err);
        res.status(500).json({ success: false, message: 'Server error updating status.' });
    }
});


module.exports = router;