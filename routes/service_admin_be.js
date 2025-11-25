// routes/service_admin_be.js - Router for Service Staff User Management
const express = require('express');
const router = express.Router();
// Import models (using mongoose.model() to prevent circular dependency issues)
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); 

// Get models from globally registered Mongoose models
const sUser = mongoose.model('sUser');
const ServiceStaffAccess = mongoose.model('ServiceStaffAccess');

/**
 * POST /api/service/admin/create-staff-v2 - Create a new service staff user
 * Accepts Name, Employee ID (semployeeId), Password, Department, and Role.
 * Creates a linked User account for login and a ServiceStaffAccess record.
 */
router.post('/create-staff-v2', async (req, res) => {
    // Note: The frontend sends the unique ID as 'semployeeId'
    const { sname, semployeeId, spassword, sdepartment, srole } = req.body; 
    
    // 1. Validate required fields and role
    if (!sname || !semployeeId || !spassword || !sdepartment || !['sstandard', 'sadmin'].includes(srole)) {
        return res.status(400).json({ success: false, message: 'Invalid or missing user data (Name, ID, Password, Department, Role). Role must be standard or admin.' });
    }
    
    try {
        // 2. Prepare unique identifiers for the core User account
        const susername = semployeeId; // Using unique Employee ID as username for login
        const semail = `${semployeeId.toLowerCase()}@nixtz.service.temp`; // Placeholder email
        
        // Check for conflicts in the core User collection (using username or placeholder email)
        let userExists = await sUser.findOne({ $or: [{ semail: semail }, { susername }] });
        if (userExists) return res.status(400).json({ success: false, message: 'Employee ID is already registered as a core user.' });
        
        // Check for conflicts in the ServiceStaffAccess collection
        let serviceStaffExists = await ServiceStaffAccess.findOne({ semployeeId });
        if (serviceStaffExists) return res.status(400).json({ success: false, message: 'Employee ID already exists in service staff records.' });

        // 3. Hash Password
        const salt = await bcrypt.genSalt(10);
        const spasswordHash = await bcrypt.hash(spassword, salt);

        // 4. Create the core User account
        const newsUser = new sUser({
            susername,
            semail: email.toLowerCase(),
            spasswordHash,
            srole, 
            smembership: 'none',
            spageAccess: ['laundry_request', 'laundry_staff'] // Grant access to service pages
        });
        await newsUser.save();
        
        // 5. Create the linked ServiceStaffAccess document
        const newStaffAccess = new ServiceStaffAccess({
             suser: newsUser._id,
             sname: sname, 
             semployeeId: semployeeId, 
             sdepartment: sdepartment, 
             serviceScope: 'laundry'
        });
        await newStaffAccess.save();
        
        res.status(201).json({ success: true, message: `Staff account created for ${sname} (${semployeeId}).` });
    } catch (err) {
        console.error('Service Admin Create Staff Error:', err);
        if (err.code === 11000) { 
             return res.status(400).json({ success: false, message: 'Employee ID or related user ID already exists.' });
        }
        res.status(500).json({ success: false, message: 'Server error during staff creation.' });
    }
});


// Placeholder for future staff listing/config endpoint
router.get('/staff-list', async (req, res) => {
    try {
        const staffList = await ServiceStaffAccess.find({})
            .populate('suser', 'srole') // Pulls in the user's core role
            .select('name semployeeId department serviceScope');
            
        res.json({ success: true, data: staffList });
    } catch (err) {
        console.error('Service Staff List Error:', err);
        res.status(500).json({ success: false, message: 'Server error fetching staff list.' });
    }
});


module.exports = router;