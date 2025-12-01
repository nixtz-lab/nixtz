// routes/service_auth_be.js - Dedicated Router for Service Staff Authentication
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken'); // Assuming JWT is accessible or imported here

const JWT_SECRET = process.env.JWT_SECRET || 'your_default_jwt_secret_please_change_this_for_prod';

// Safely access the core User model
const getUserModel = () => mongoose.model('User');
const getServiceStaffAccessModel = () => mongoose.model('ServiceStaffAccess');


/**
 * POST /login - Handle login for service staff using core User credentials.
 * NOTE: This is a duplicate of the core /api/auth/login logic but mounted separately.
 */
router.post('/login', async (req, res) => {
    const User = getUserModel();
    const { email, password } = req.body; // Using 'email' to handle ID/Username input
    
    if (!email || !password) return res.status(400).json({ success: false, message: 'Enter ID/Username and password.' });

    try {
        // Find user by either email or username (Employee ID)
        let user = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username: email }] });
        if (!user) return res.status(400).json({ success: false, message: 'Invalid credentials.' });

        if (user.role === 'pending') return res.status(403).json({ success: false, message: 'Account pending approval.' });

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) return res.status(400).json({ success: false, message: 'Invalid credentials.' });
        
        // --- CRITICAL STEP: Verification (Optional) ---
        // You could add a check here to ensure the user is linked to a ServiceStaffAccess record 
        // to prevent non-staff core users from logging in via the service portal.
        
        const payload = { user: { 
            id: user._id.toString(), 
            username: user.username, 
            role: user.role, 
            membership: user.membership, 
            pageAccess: user.pageAccess 
        } };
        
        jwt.sign(payload, JWT_SECRET, { expiresIn: '5d' }, (err, token) => {
            if (err) throw err;
            res.json({
                success: true,
                message: 'Service login successful!',
                token,
                username: user.username,
                role: user.role,
                membership: user.membership,
                pageAccess: user.pageAccess,
                email: user.email
            });
        });
    } catch (err) {
        console.error('Service Login Error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});


/**
 * POST /register - Register a new service staff user (from previous step)
 * This route is maintained here for the complete service authentication router.
 */
router.post('/register', async (req, res) => {
    
    const User = getUserModel();
    const { username, email, password } = req.body; 

    if (!username || !email || !password || password.length < 8) {
        return res.status(400).json({ success: false, message: 'Provide valid username, email, and password (min 8 chars).' });
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
            role: 'pending', 
            membership: 'none',
            pageAccess: ['laundry_request'] 
        });
        await newUser.save();

        res.status(201).json({ success: true, message: 'Service staff account created! Awaiting admin approval.' });

    } catch (err) {
        console.error('Service Staff Registration Error:', err);
        res.status(500).json({ success: false, message: 'Server error during service staff registration.' });
    }
});

module.exports = router;