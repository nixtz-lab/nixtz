// routes/service_admin_be.js - Router for Service Staff User Management
const express = require('express');
const router = express.Router();
// Import core modules
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); 

// --- CRITICAL FIX: Use helper functions to safely access models inside route handlers ---
// The models are registered globally as 'User' and 'ServiceStaffAccess'
const getSUserModel = () => mongoose.model('User');
const getServiceStaffAccessModel = () => mongoose.model('ServiceStaffAccess');

/**
 * POST /api/service/admin/create-staff-v2 - Create a new service staff user
 * Creates a linked User account for login and a ServiceStaffAccess record.
 */
router.post('/create-staff-v2', async (req, res) => {
    
    // 🚨 FIX: Model access delayed and aliased
    const SUser = getSUserModel(); 
    const ServiceStaffAccess = getServiceStaffAccessModel(); 

    // Destructure prefixed local variables from req.body
    const { sname, semployeeId, spassword, sdepartment, srole } = req.body; 
    
    // 1. Validate required fields and role
    if (!sname || !semployeeId || !spassword || !sdepartment || !['standard', 'admin'].includes(srole)) {
        return res.status(400).json({ success: false, message: 'Invalid or missing user data (Name, ID, Password, Department, Role). Role must be standard or admin.' });
    }
    
    try {
        // 2. Prepare unique identifiers for the core User account
        const susername = semployeeId; // Using unique Employee ID as username for login
        const semail = `${semployeeId.toLowerCase()}@nixtz.service.temp`; // Placeholder email
        
        // Check for conflicts in the core User collection using the ORIGINAL NON-PREFIXED FIELD NAMES
        let userExists = await SUser.findOne({ $or: [{ email: semail }, { username: susername }] }); 
        if (userExists) return res.status(400).json({ success: false, message: 'Employee ID is already registered as a core user.' });
        
        // Check for conflicts in the ServiceStaffAccess collection
        let serviceStaffExists = await ServiceStaffAccess.findOne({ semployeeId });
        if (serviceStaffExists) return res.status(400).json({ success: false, message: 'Employee ID already exists in service staff records.' });

        // 3. Hash Password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(spassword, salt); 

        // 4. Create the core User account (using SUser model)
        const newSUser = new SUser({
            // MAPPING FIX: Map prefixed local variables to NON-prefixed CORE User schema fields
            username: susername, 
            email: semail.toLowerCase(), 
            passwordHash: passwordHash, 
            role: srole, 
            membership: 'none', 
            pageAccess: ['laundry_request', 'laundry_staff'] 
        });
        await newSUser.save();
        
        // 5. Create the linked ServiceStaffAccess document
        const newStaffAccess = new ServiceStaffAccess({
             // MAPPING: Use the prefixed field names for the ServiceStaffAccess model schema
             suser: newSUser._id,
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
    // 🚨 FIX: Model access delayed
    const ServiceStaffAccess = getServiceStaffAccessModel();
    
    try {
        const staffList = await ServiceStaffAccess.find({})
            // CRITICAL: Populate fields must use the original core User fields to select
            .populate('suser', 'username role') 
            // Select must use the prefixed field names
            .select('sname semployeeId sdepartment serviceScope'); 
            
        res.json({ success: true, data: staffList });
    } catch (err) {
        console.error('Service Staff List Error:', err);
        res.status(500).json({ success: false, message: 'Server error fetching staff list.' });
    }
});


module.exports = router;