// server.js - NIXTZ BUSINESS OPERATIONS PLATFORM BACKEND
require('dotenv').config();

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURATION ---
const JWT_SECRET = process.env.JWT_SECRET || 'your_default_jwt_secret_please_change_this_for_prod';
const MONGODB_URI = process.env.MONGODB_URI;
const DATABASE_NAME = 'nixtz_operations_db'; 

if (!MONGODB_URI) {
    console.error("FATAL ERROR: MONGODB_URI is not defined.");
}

// 1. MONGODB CONNECTION
mongoose.connect(MONGODB_URI, { dbName: DATABASE_NAME })
    .then(() => console.log('MongoDB Connected Successfully to NIXTZ DB'))
    .catch(err => console.error('MongoDB Connection Error:', err.message));

// 2. SCHEMAS (ALL MODULES)

// User & Config
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    currency: { type: String, default: 'USD', enum: ['USD', 'EUR', 'GBP', 'JPY', 'THB', 'AUD'] },
    createdAt: { type: Date, default: Date.now },
    role: { type: String, default: 'pending', enum: ['pending', 'standard', 'admin', 'superadmin'] },
    membership: { type: String, default: 'none', enum: ['none', 'standard', 'platinum', 'vip'] },
    pageAccess: { type: [String], default: [] },
    watchlist: { type: [String], default: [] },
    resetPasswordToken: String,
    resetPasswordExpires: Date
});
const User = mongoose.model('User', UserSchema);

const MembershipConfigSchema = new mongoose.Schema({
    level: { type: String, required: true, unique: true, enum: ['standard', 'platinum', 'vip'] },
    pages: { type: [String], default: [] },
    monthlyPrice: { type: Number, required: true }
});
const MembershipConfig = mongoose.model('MembershipConfig', MembershipConfigSchema);

// Finance & Stocks
const BudgetTransactionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0.01 },
    type: { type: String, enum: ['income', 'expense'], required: true },
    timestamp: { type: Date, default: Date.now }
});
const BudgetTransaction = mongoose.model('BudgetTransaction', BudgetTransactionSchema);

const TmtStockRatingSchema = new mongoose.Schema({
    ticker: { type: String, required: true, unique: true, uppercase: true, trim: true },
    rating: { type: Number, required: true, min: 0, max: 5 },
    rank: { type: String, trim: true, default: '' },
    targetPrice: { type: Number, default: null }
});
const TmtStockRating = mongoose.model('TmtStockRating', TmtStockRatingSchema);

const UserStockRatingSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ticker: { type: String, required: true, uppercase: true, trim: true },
    rating: { type: Number, required: true, min: 0, max: 5 }
});
const UserStockRating = mongoose.model('UserStockRating', UserStockRatingSchema);

const PortfolioHoldingSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    broker: { type: String, required: true, trim: true },
    ticker: { type: String, required: true, uppercase: true, trim: true },
    shares: { type: Number, required: true, min: 0 },
    buy_price: { type: Number, required: true, min: 0 },
    buy_date: { type: Date, required: true },
    asset_class: { type: String, default: 'Equity' },
    annual_dividend: { type: Number, default: 0 } 
});
const PortfolioHolding = mongoose.model('PortfolioHolding', PortfolioHoldingSchema);

// Staff & Roster
const StaffProfileSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    employeeId: { type: String, unique: true, required: true, trim: true },
    position: { type: String, required: true, enum: ['Manager', 'Supervisor', 'Delivery', 'Normal Staff'] },
    shiftPreference: { type: String, default: 'Morning' }, 
    fixedDayOff: { type: String, enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'None'], default: 'None' },
    isNightRotator: { type: Boolean, default: false },
    currentRotationDay: { type: Number, default: 0 }, 
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
});
StaffProfileSchema.index({ user: 1, employeeId: 1 }, { unique: true });
const StaffProfile = mongoose.model('StaffProfile', StaffProfileSchema); 

const RosterEntrySchema = new mongoose.Schema({
    weekStartDate: { type: Date, required: true }, 
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rosterData: [{ 
        employeeName: { type: String, required: true, trim: true },
        employeeId: { type: String, trim: true },
        weeklySchedule: [{
            dayOfWeek: { type: String, enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], required: true },
            shifts: [{ 
                shiftId: { type: Number },
                jobRole: { type: String },
                timeRange: { type: String, default: '' },
                color: { type: String, default: '#FFFFFF' }
            }],
        }],
    }],
});
RosterEntrySchema.index({ user: 1, weekStartDate: 1 }, { unique: true }); 
const StaffRoster = mongoose.model('StaffRoster', RosterEntrySchema);

// 3. MIDDLEWARE & CONFIG
const transporter = nodemailer.createTransport({
    host: 'smtpout.secureserver.net',
    port: 465,
    secure: true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD 
    },
    tls: { rejectUnauthorized: false }
});

const { authMiddleware, adminAuthMiddleware } = require('./middleware/auth'); 

// --- Router Imports ---
const staffRosterRoutes = require('./routes/staff_roster_api.js'); 
const staffProfileRoutes = require('./routes/staff_profile_api_be.js'); 
const adminPanelRoutes = require('./routes/admin_panel_be.js'); // Admin Router

app.use(cors()); 
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// 4. AUTHENTICATION ROUTES

// Register
app.post('/api/auth/register', async (req, res) => {
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
            pageAccess: []
        });
        await newUser.save();
        res.status(201).json({ success: true, message: 'Account created! Awaiting admin approval.' });
    } catch (err) {
        console.error('Register Error:', err);
        res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Enter email and password.' });

    try {
        let user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(400).json({ success: false, message: 'Invalid credentials.' });

        if (user.role === 'pending') return res.status(403).json({ success: false, message: 'Account pending approval.' });

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) return res.status(400).json({ success: false, message: 'Invalid credentials.' });

        const payload = { user: { id: user.id, username: user.username, role: user.role, membership: user.membership, pageAccess: user.pageAccess } };
        jwt.sign(payload, JWT_SECRET, { expiresIn: '5d' }, (err, token) => {
            if (err) throw err;
            res.json({
                success: true,
                message: 'Login successful!',
                token,
                username: user.username,
                currency: user.currency,
                role: user.role,
                membership: user.membership,
                pageAccess: user.pageAccess
            });
        });
    } catch (err) {
        console.error('Login Error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// Get Profile
app.get('/api/user/profile', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-passwordHash');
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
        res.json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Forgot & Reset Password (keep your existing logic here if needed, abbreviated for clarity)
app.post('/api/auth/forgot-password', async (req, res) => res.json({success:false, message:"Implemented in original"}));
app.post('/api/auth/reset-password', async (req, res) => res.json({success:false, message:"Implemented in original"}));


// 5. MOUNT ROUTES (Admin & Operations)

// Admin Routes - Prefixed with /api/admin
app.use('/api/admin', authMiddleware, adminAuthMiddleware, adminPanelRoutes);

// Operations Routes
app.use('/api/staff/profile', authMiddleware, staffProfileRoutes); 
app.use('/api/staff/roster', authMiddleware, staffRosterRoutes); 

// 6. STOCK WATCHLIST
app.post('/api/user/watchlist/add', authMiddleware, async (req, res) => {
    const { ticker } = req.body;
    if (!ticker) return res.status(400).json({ success: false, message: 'Ticker required.' });
    try {
        const upperTicker = ticker.toUpperCase().trim();
        const user = await User.findById(req.user.id);
        if (user.watchlist.includes(upperTicker)) return res.json({ success: true, message: 'Already in watchlist.' });
        user.watchlist.push(upperTicker);
        await user.save();
        res.json({ success: true, message: 'Added.', data: user.watchlist });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

app.get('/api/user/watchlist', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        res.json({ success: true, data: user.watchlist });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// 7. START SERVER
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Local access: http://localhost:${PORT}`);
});

module.exports = { app, User, StaffRoster, StaffProfile };