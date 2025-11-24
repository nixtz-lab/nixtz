// routes/laundry_admin_api_be.js - Router for Laundry Service Admin Management
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); 

// --- NEW MODEL IMPORT METHOD (Breaks Circular Dependency) ---
const LaundryRequest = mongoose.model('LaundryRequest'); 
const User = mongoose.model('User'); 
const ServiceStaffAccess = mongoose.model('ServiceStaffAccess'); 
// --- END NEW MODEL IMPORT METHOD ---


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

/**
 * POST /api/laundry/admin/create-staff-v2 - Create a new service staff user 
 * This route uses Name, Employee ID, Password, and Role, and creates a linked 
 * ServiceStaffAccess document, decoupling it from StaffRoster.
 */
router.post('/create-staff-v2', async (req, res) => {
    const { name, employeeId, password, role } = req.body;
    
    // Validate required fields and role
    if (!name || !employeeId || !password || !['standard', 'admin'].includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid or missing user data (Name, ID, Password, Role).' });
    }
    
    try {
        // 1. Prepare unique identifiers for the core User account
        const username = employeeId; // Using Employee ID as unique username for login
        const email = `${employeeId.toLowerCase()}@nixtz.service.temp`; // Placeholder email
        
        // Check for existing User (by ID/username or placeholder email)
        let userExists = await User.findOne({ $or: [{ email: email }, { username }] });
        if (userExists) return res.status(400).json({ success: false, message: 'Employee ID is already registered as a core user.' });
        
        // Check for existing ServiceStaffAccess (by Employee ID)
        let serviceStaffExists = await ServiceStaffAccess.findOne({ employeeId });
        if (serviceStaffExists) return res.status(400).json({ success: false, message: 'Employee ID already exists in service staff records.' });

        // 2. Hash Password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // 3. Create the core User account
        const newUser = new User({
            username,
            email: email.toLowerCase(),
            passwordHash,
            role, 
            membership: 'none',
            pageAccess: ['laundry_request', 'laundry_staff'] // Grant access to service pages
        });
        await newUser.save();
        
        // 4. Create the linked ServiceStaffAccess document
        const newStaffAccess = new ServiceStaffAccess({
             user: newUser._id,
             name: name, 
             employeeId: employeeId,
             serviceScope: 'laundry'
        });
        await newStaffAccess.save();
        
        res.status(201).json({ success: true, message: `Staff account created for ${name} (${employeeId}).` });
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