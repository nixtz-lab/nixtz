// routes/admin_panel_be.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// --- CRITICAL FIX: Import Super Admin Middleware ---
// This assumes 'middleware/auth.js' is in the parent directory (../)
const { superAdminAuthMiddleware } = require('../middleware/auth'); 

// --- NEW MODEL IMPORT METHOD (Breaks Circular Dependency) ---
const User = mongoose.model('User');
const MembershipConfig = mongoose.model('MembershipConfig');
const TmtStockRating = mongoose.model('TmtStockRating');
// --- END NEW MODEL IMPORT METHOD ---

// ===================================================================
// USER MANAGEMENT
// ===================================================================

// GET Pending Users
router.get('/users/pending', async (req, res) => {
    try {
        const pendingUsers = await User.find({ $or: [{ role: 'pending' }, { role: { $exists: false } }] })
            .select('username email createdAt')
            .sort({ createdAt: 1 });
        res.json({ success: true, data: pendingUsers });
    } catch (err) {
        console.error('Pending Users Error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// PUT Approve User
router.put('/users/:id/approve', async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.id, 
            { role: 'standard', membership: 'none', pageAccess: [] }, 
            { new: true }
        );
        res.json({ success: true, message: 'User approved.', data: user });
    } catch (err) {
        console.error('Approve User Error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// GET Active Users
router.get('/users', async (req, res) => {
    try {
        const users = await User.find({ role: { $in: ['standard', 'admin', 'superadmin'] } })
            .select('username email role membership pageAccess');
        res.json({ success: true, data: users });
    } catch (err) {
        console.error('Get Users Error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// PUT Update Membership
router.put('/users/:id/update-membership', async (req, res) => {
    const { membership } = req.body;
    try {
        let pageAccess = [];
        if (membership !== 'none') {
            const config = await MembershipConfig.findOne({ level: membership });
            if (config) pageAccess = config.pages;
        }
        const user = await User.findByIdAndUpdate(req.params.id, { membership, pageAccess }, { new: true });
        res.json({ success: true, message: 'Membership updated.', data: user });
    } catch (err) {
        console.error('Update Membership Error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ===================================================================
// ADMIN MANAGEMENT
// ===================================================================

// POST Create New Admin (Route: /api/admin/create) - NOW SUPERADMIN ONLY
router.post('/create', superAdminAuthMiddleware, async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password || password.length < 8) {
        return res.status(400).json({ success: false, message: 'Please provide username, email, and a password (min 8 chars).' });
    }

    try {
        let userExists = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username }] });
        if (userExists) {
            return res.status(400).json({ success: false, message: 'User with this email or username already exists.' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const newAdmin = new User({
            username,
            email: email.toLowerCase(),
            passwordHash,
            role: 'admin',
            membership: 'vip',
            pageAccess: ['all']
        });

        await newAdmin.save();
        res.status(201).json({ success: true, message: `Admin user ${username} created successfully.` });

    } catch (err) {
        console.error('Create Admin Error:', err);
        res.status(500).json({ success: false, message: 'Server error creating admin.' });
    }
});

// ===================================================================
// MEMBERSHIP CONFIGURATION
// ===================================================================

router.get('/membership-config', async (req, res) => {
    try {
        const levels = ['standard', 'platinum', 'vip'];
        const defaults = { 
            standard: { pages: ['staff_roster', 'budget_tracker'], price: 10 }, 
            platinum: { pages: ['staff_roster', 'asset_tracker'], price: 30 }, 
            vip: { pages: ['all'], price: 50 } 
        };
        
        const configs = await Promise.all(levels.map(async level => {
            let config = await MembershipConfig.findOne({ level });
            if (!config) {
                config = new MembershipConfig({ level, pages: defaults[level].pages, monthlyPrice: defaults[level].price });
                await config.save();
            }
            return config;
        }));
        res.json({ success: true, data: configs });
    } catch (err) {
        console.error('Membership Config Error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

router.put('/membership-config/:level', async (req, res) => {
    const { pages, monthlyPrice } = req.body;
    try {
        const config = await MembershipConfig.findOneAndUpdate({ level: req.params.level }, { pages, monthlyPrice }, { new: true, upsert: true });
        await User.updateMany({ membership: req.params.level }, { $set: { pageAccess: pages } });
        res.json({ success: true, message: 'Config updated.', data: config });
    } catch (err) {
        console.error('Update Config Error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ===================================================================
// STOCK RATINGS
// ===================================================================

router.get('/stock-ratings', async (req, res) => {
    try {
        const ratings = await TmtStockRating.find().sort({ ticker: 1 });
        res.json({ success: true, data: ratings });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

router.post('/stock-rating', async (req, res) => {
    const { ticker, rating, rank, targetPrice } = req.body;
    try {
        const updated = await TmtStockRating.findOneAndUpdate(
            { ticker: ticker.toUpperCase() }, 
            { ticker: ticker.toUpperCase(), rating, rank, targetPrice }, 
            { new: true, upsert: true }
        );
        res.json({ success: true, message: 'Rating saved.', data: updated });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

router.delete('/stock-rating/:ticker', async (req, res) => {
    try {
        await TmtStockRating.deleteOne({ ticker: req.params.ticker.toUpperCase() });
        res.json({ success: true, message: 'Rating deleted.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

module.exports = router;