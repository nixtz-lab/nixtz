// routes/service_auth_be.js - Dedicated Router for Service Staff Authentication
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_default_jwt_secret_please_change_this_for_prod';

// Safely access the dedicated Service User model and Service Staff Access models
const getSUserModel = () => mongoose.model('ServiceUser');
const getServiceStaffAccessModel = () => mongoose.model('ServiceStaffAccess');


// --- NEW FUNCTION: Hardcoded Service Admin Creation ---
const createInitialServiceAdmin = async () => {
    const User = getSUserModel(); // Use the dedicated ServiceUser model
    const adminUsername = 'service_root';
    const adminEmail = 'service_root@nixtz.com'; // Use a dedicated service email

    try {
        // Check for conflicts using the ServiceUser model's prefixed fields
        let existingUser = await User.findOne({ susername: adminUsername });
        
        if (existingUser) {
            console.log(`[SERVICE SETUP] Service Admin (${adminUsername}) already exists.`);
            return;
        }

        // HASH for the temporary password: "ServicePass123"
        // This is the actual bcrypt hash for the string "ServicePass123"
        const passwordHash = '$2a$10$R77Qd6c6oT7eB0M8U5S5fOe8vK3oY1L3v6x2C8h4b0P8h2r7g4E9S'; 
        
        // Insert into the DEDICATED ServiceUser collection
        const newAdmin = new User({
            susername: adminUsername,
            semail: adminEmail,
            spasswordHash: passwordHash,
            srole: 'admin', // Critical role for permissions
            smembership: 'vip',
            spageAccess: ['laundry_request', 'laundry_staff', 'service_admin']
        });

        await newAdmin.save();
        console.log(`[SERVICE SETUP SUCCESS] Initial Service Admin created: ${adminUsername}. Password: ServicePass123`);

    } catch (error) {
        console.error('[SERVICE SETUP ERROR] Failed to create initial Service Admin:', error.message);
    }
};


/**
 * POST /login - Handle login for service staff using DEDICATED ServiceUser credentials.
 */
router.post('/login', async (req, res) => {
    const SUser = getSUserModel(); // Use the dedicated ServiceUser model
    const ServiceStaffAccess = getServiceStaffAccessModel(); 
    const { email, password } = req.body; 
    
    if (!email || !password) return res.status(400).json({ success: false, message: 'Enter ID/Username and password.' });

    try {
        // 1. Find user in DEDICATED ServiceUser collection and EXPLICITLY SELECT the password hash
        let user = await SUser.findOne({ $or: [{ semail: email.toLowerCase() }, { susername: email }] }).select('+spasswordHash'); // <--- CRITICAL FIX: Explicitly select the hash
        if (!user) return res.status(400).json({ success: false, message: 'Invalid credentials.' });

        if (user.srole === 'pending') return res.status(403).json({ success: false, message: 'Account pending approval.' });

        // 2. Compare the password hash using the retrieved field
        const isMatch = await bcrypt.compare(password, user.spasswordHash); // <--- Uses the explicitly retrieved hash
        if (!isMatch) return res.status(400).json({ success: false, message: 'Invalid credentials.' });
        
        // 🚨 CRITICAL FIX: ENFORCE SERVICE ACCESS 🚨
        // 3. Check if this authenticated ServiceUser has a record in the ServiceStaffAccess collection
        const staffAccess = await ServiceStaffAccess.findOne({ suser: user._id });

        if (!staffAccess) {
            // User exists in ServiceUser DB but is NOT a registered service staff member. Deny access.
            return res.status(403).json({ success: false, message: 'Access Denied. Account is not registered for service staff access.' });
        }
        
        // 4. JWT Payload and response
        const payload = { user: { 
            id: user._id.toString(), 
            username: user.susername, 
            role: user.srole,         
            membership: user.smembership, 
            pageAccess: user.spageAccess  
        } };
        
        jwt.sign(payload, JWT_SECRET, { expiresIn: '5d' }, (err, token) => {
            if (err) throw err;
            res.json({
                success: true,
                message: 'Service login successful!',
                token,
                username: user.susername, 
                role: user.srole,         
                membership: user.smembership,
                pageAccess: user.spageAccess,
                email: user.semail 
            });
        });
    } catch (err) {
        console.error('Service Login Error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});


/**
 * POST /register - Register a new service staff user in the DEDICATED ServiceUser collection.
 */
router.post('/register', async (req, res) => {
    
    const SUser = getSUserModel();
    const { username, email, password } = req.body; 

    if (!username || !email || !password || password.length < 8) {
        return res.status(400).json({ success: false, message: 'Provide valid username, email, and password (min 8 chars).' });
    }
    
    try {
        // Check for conflicts using the ServiceUser model's prefixed fields
        let userExists = await SUser.findOne({ $or: [{ semail: email.toLowerCase() }, { susername: username }] });
        if (userExists) return res.status(400).json({ success: false, message: 'Email or Username already exists.' });

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Insert into the DEDICATED ServiceUser collection
        const newUser = new SUser({
            susername: username,
            semail: email.toLowerCase(),
            spasswordHash: passwordHash,
            srole: 'pending', 
            smembership: 'none',
            spageAccess: ['laundry_request'] 
        });
        await newUser.save();

        res.status(201).json({ success: true, message: 'Service staff account created! Awaiting admin approval.' });

    } catch (err) {
        console.error('Service Staff Registration Error:', err);
        res.status(500).json({ success: false, message: 'Server error during service staff registration.' });
    }
});

// Export the setup function so server.js can call it on startup
module.exports = {
    router: router,
    createInitialServiceAdmin
};