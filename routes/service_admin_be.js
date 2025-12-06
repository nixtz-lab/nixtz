// routes/service_admin_be.js - Router for Service Staff User Management
const express = require('express');
const router = express.Router();
// Import core modules
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); 

// --- CRITICAL FIX: Use helper functions to safely access DEDICATED Service models ---
// The models are registered globally as 'ServiceUser' and 'ServiceStaffAccess'
const getSUserModel = () => mongoose.model('ServiceUser'); // <-- NOW POINTS TO DEDICATED USER TABLE
const getServiceStaffAccessModel = () => mongoose.model('ServiceStaffAccess');

/**
 * POST /api/service/admin/create-staff-v2 - Create a new service staff user
 * Creates a linked ServiceUser account for login and a ServiceStaffAccess record.
 */
router.post('/create-staff-v2', async (req, res) => {
    
    // 🚨 FIX: Model access delayed and aliased
    const SUser = getSUserModel(); // ServiceUser Model
    const ServiceStaffAccess = getServiceStaffAccessModel(); 

    // Destructure prefixed local variables from req.body
    const { sname, semployeeId, spassword, sdepartment, srole } = req.body; 
    
    // 1. Validate required fields and role
    // UPDATED: Added 'request_only' to the allowed roles list
    if (!sname || !semployeeId || !spassword || !sdepartment || !['standard', 'admin', 'request_only'].includes(srole)) {
        return res.status(400).json({ success: false, message: 'Invalid role. Role must be standard, admin, or request_only.' });
    }
    
    try {
        // 2. Prepare unique identifiers for the ServiceUser account
        const susername = semployeeId; // Using unique Employee ID as username for login
        const semail = `${semployeeId.toLowerCase()}@nixtz.service.temp`; // Placeholder email
        
        // Check for conflicts in the DEDICATED ServiceUser collection
        let userExists = await SUser.findOne({ $or: [{ semail: semail }, { susername: susername }] }); 
        if (userExists) return res.status(400).json({ success: false, message: 'Employee ID is already registered as a service user.' });
        
        // Check for conflicts in the ServiceStaffAccess collection
        let serviceStaffExists = await ServiceStaffAccess.findOne({ semployeeId });
        if (serviceStaffExists) return res.status(400).json({ success: false, message: 'Employee ID already exists in service staff records.' });

        // 3. Hash Password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(spassword, salt); 

        // 4. Create the DEDICATED ServiceUser account
        const newSUser = new SUser({
            // MAPPING: Use the prefixed field names for the DEDICATED ServiceUser schema
            susername: susername, 
            semail: semail.toLowerCase(), 
            spasswordHash: passwordHash, // Storing the hashed password
            srole: srole, 
            smembership: 'none', 
            spageAccess: ['laundry_request', 'laundry_staff'] 
        });
        await newSUser.save();
        
        // 5. Create the linked ServiceStaffAccess document
        const newStaffAccess = new ServiceStaffAccess({
             // suser links to the new ServiceUser's _id
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
            // CRITICAL: Populate fields now selects prefixed fields from the DEDICATED ServiceUser model
            .populate('suser', 'susername srole') 
            // Select must use the prefixed field names
            .select('sname semployeeId sdepartment serviceScope'); 
            
        res.json({ success: true, data: staffList });
    } catch (err) {
        console.error('Service Staff List Error:', err);
        res.status(500).json({ success: false, message: 'Server error fetching staff list.' });
    }
});

/**
 * PUT /api/service/admin/update-staff/:id
 * Update staff details (Name, Dept, Role) AND Password (Optional)
 * This route is required for the Edit Modal to work.
 */
router.put('/update-staff/:id', async (req, res) => {
    const SUser = getSUserModel();
    const ServiceStaffAccess = getServiceStaffAccessModel();
    
    const staffAccessId = req.params.id;
    // Extract spassword from body (optional)
    const { sname, sdepartment, srole, spassword } = req.body;

    const validRoles = ['standard', 'admin', 'request_only'];
    if (!sname || !sdepartment || !validRoles.includes(srole)) {
        return res.status(400).json({ success: false, message: 'Invalid data or Role.' });
    }

    try {
        // 1. Find the Staff Access Record
        const staffRecord = await ServiceStaffAccess.findById(staffAccessId);
        if (!staffRecord) return res.status(404).json({ success: false, message: 'Staff record not found.' });

        // 2. Update Staff Details
        staffRecord.sname = sname;
        staffRecord.sdepartment = sdepartment;
        await staffRecord.save();

        // 3. Update Linked User Account (Role & Password)
        if (staffRecord.suser) {
            const updateData = { srole: srole };

            // NEW: Only update password if a new one was sent (and is valid)
            if (spassword && spassword.trim() !== "") {
                if (spassword.length < 8) {
                    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
                }
                const salt = await bcrypt.genSalt(10);
                updateData.spasswordHash = await bcrypt.hash(spassword, salt);
            }

            await SUser.findByIdAndUpdate(staffRecord.suser, updateData);
        }

        res.json({ success: true, message: 'Staff updated successfully.' });

    } catch (err) {
        console.error('Update Staff Error:', err);
        res.status(500).json({ success: false, message: 'Server error updating staff.' });
    }
});


module.exports = router;