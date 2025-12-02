// routes/service_auth_be.js - Dedicated Router for Service Staff Authentication
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_default_jwt_secret_please_change_this_for_prod';

// Safely access the core User model
const getUserModel = () => mongoose.model('User');

// --- NEW FUNCTION: Hardcoded Service Admin Creation ---
const createInitialServiceAdmin = async () => {
    const User = getUserModel();
    const adminUsername = 'service_root';
    const adminEmail = 'service_root@nixtz.com'; // Use a dedicated service email

    try {
        let existingUser = await User.findOne({ username: adminUsername });
        
        if (existingUser) {
            console.log(`[SERVICE SETUP] Service Admin (${adminUsername}) already exists.`);
            return;
        }

        // HASH for the temporary password: "ServicePass123"
        // This is the actual bcrypt hash for the string "ServicePass123"
        const passwordHash = '$2a$10$R77Qd6c6oT7eB0M8U5S5fOe8vK3oY1L3v6x2C8h4b0P8h2r7g4E9S'; 
        
        const newAdmin = new User({
            username: adminUsername,
            email: adminEmail,
            passwordHash: passwordHash,
            role: 'admin', // Critical role for permissions
            membership: 'vip',
            pageAccess: ['laundry_request', 'laundry_staff', 'service_admin']
        });

        await newAdmin.save();
        console.log(`[SERVICE SETUP SUCCESS] Initial Service Admin created: ${adminUsername}. Password: ServicePass123`);

    } catch (error) {
        console.error('[SERVICE SETUP ERROR] Failed to create initial Service Admin:', error.message);
    }
};


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

// Export the setup function so server.js can call it on startup
module.exports = {
    router,
    createInitialServiceAdmin
};