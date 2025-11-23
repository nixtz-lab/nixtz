// server.js - NIXTZ BUSINESS OPERATIONS PLATFORM (Fully Merged)
// Includes: Auth, Admin, Finance Tools, Stock Analysis, AND Staff Roster
require('dotenv').config();

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const axios = require('axios');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURATION ---
const JWT_SECRET = process.env.JWT_SECRET || 'your_default_jwt_secret_please_change_this_for_prod';
const MONGODB_URI = process.env.MONGODB_URI;
const DATABASE_NAME = 'nixtz_operations_db'; // Or 'tmt_website_db' based on your preference

// API Keys
const YAHU_RAPIDAPI_KEY = process.env.YAHU_RAPIDAPI_KEY;
const YAHU_RAPIDAPI_HOST = process.env.YAHU_RAPIDAPI_HOST || "apidojo-yahoo-finance-v1.p.rapidapi.com";
const SIMFIN_API_KEY = process.env.SIMFIN_API_KEY || "2a8d888b-daef-49fd-9736-b80328a9ea23";
const SIMFIN_BASE_URL = "https://backend.simfin.com/api/v3/companies";

// Watchlist Cache
const watchlistCache = new Map();

if (!MONGODB_URI) {
    console.error("FATAL ERROR: MONGODB_URI is not defined.");
    // process.exit(1); // Keep running for deployment safety, but check logs
}

// -------------------------------------------------------------------
// 1. MONGODB CONNECTION
// -------------------------------------------------------------------
mongoose.connect(MONGODB_URI, { dbName: DATABASE_NAME })
    .then(() => console.log('MongoDB Connected Successfully to NIXTZ DB'))
    .catch(err => console.error('MongoDB Connection Error:', err.message));

// -------------------------------------------------------------------
// 2. SCHEMAS (ALL MODULES)
// -------------------------------------------------------------------

// --- CORE AUTH & USER ---
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

// --- FINANCE & STOCKS ---
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
UserStockRatingSchema.index({ user: 1, ticker: 1 }, { unique: true });
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

// --- NEW OPERATIONS: STAFF ROSTER & PROFILE ---
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

// -------------------------------------------------------------------
// 3. MIDDLEWARE & CONFIGURATION
// -------------------------------------------------------------------

// Email Transporter
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

// Middleware Import
const { authMiddleware, adminAuthMiddleware, superAdminAuthMiddleware } = require('./middleware/auth'); 

// Router Imports (Operations)
const staffRosterRoutes = require('./routes/staff_roster_api.js'); 
const staffProfileRoutes = require('./routes/staff_profile_api_be.js'); 

app.use(cors()); 
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ===================================================================
// 4. AUTHENTICATION ROUTES
// ===================================================================

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

        // --- Super Admin Init ---
        const superAdminExists = await User.exists({ role: 'superadmin' });
        if (!superAdminExists && user.role !== 'superadmin') {
            user.role = 'superadmin';
            user.membership = 'vip';
            user.pageAccess = ['all']; 
            await user.save();
        }

        // Create Token
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

// Forgot Password
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(200).json({ success: true, message: 'If account exists, email sent.' });

        const token = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        const resetUrl = `https://nixtz.com/reset-password.html?token=${token}`;
        const mailOptions = {
            to: user.email,
            from: process.env.SMTP_USER,
            subject: 'Nixtz Password Reset',
            html: `<p>Click here to reset: <a href="${resetUrl}">Reset Password</a></p>`
        };
        await transporter.sendMail(mailOptions);
        res.status(200).json({ success: true, message: 'Reset link sent.' });
    } catch (err) {
        console.error('Forgot PW Error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// Reset Password
app.post('/api/auth/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword || newPassword.length < 8) {
        return res.status(400).json({ success: false, message: 'Invalid request or password too short.' });
    }
    try {
        const user = await User.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } });
        if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired token.' });

        const salt = await bcrypt.genSalt(10);
        user.passwordHash = await bcrypt.hash(newPassword, salt);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();
        res.json({ success: true, message: 'Password reset successful.' });
    } catch (err) {
        console.error('Reset PW Error:', err);
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

// ===================================================================
// 5. ADMIN ROUTES
// ===================================================================

app.get('/api/admin/users/pending', authMiddleware, adminAuthMiddleware, async (req, res) => {
    try {
        const pendingUsers = await User.find({ $or: [{ role: 'pending' }, { role: { $exists: false } }] }).select('username email createdAt').sort({ createdAt: 1 });
        res.json({ success: true, data: pendingUsers });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

app.put('/api/admin/users/:id/approve', authMiddleware, adminAuthMiddleware, async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(req.params.id, { role: 'standard', membership: 'none', pageAccess: [] }, { new: true });
        res.json({ success: true, message: 'User approved.', data: user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

app.get('/api/admin/users', authMiddleware, adminAuthMiddleware, async (req, res) => {
    try {
        const users = await User.find({ role: { $in: ['standard', 'admin', 'superadmin'] } }).select('username email role membership pageAccess');
        res.json({ success: true, data: users });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

app.put('/api/admin/users/:id/update-membership', authMiddleware, adminAuthMiddleware, async (req, res) => {
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
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

app.get('/api/admin/membership-config', authMiddleware, adminAuthMiddleware, async (req, res) => {
    try {
        const levels = ['standard', 'platinum', 'vip'];
        const defaults = { standard: { pages: ['staff_roster', 'budget_tracker'], price: 10 }, platinum: { pages: ['staff_roster', 'asset_tracker'], price: 30 }, vip: { pages: ['all'], price: 50 } };
        
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
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

app.put('/api/admin/membership-config/:level', authMiddleware, adminAuthMiddleware, async (req, res) => {
    const { pages, monthlyPrice } = req.body;
    try {
        const config = await MembershipConfig.findOneAndUpdate({ level: req.params.level }, { pages, monthlyPrice }, { new: true, upsert: true });
        await User.updateMany({ membership: req.params.level }, { $set: { pageAccess: pages } });
        res.json({ success: true, message: 'Config updated.', data: config });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// TMT Ratings Routes
app.get('/api/admin/stock-ratings', authMiddleware, adminAuthMiddleware, async (req, res) => {
    try {
        const ratings = await TmtStockRating.find().sort({ ticker: 1 });
        res.json({ success: true, data: ratings });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

app.post('/api/admin/stock-rating', authMiddleware, adminAuthMiddleware, async (req, res) => {
    const { ticker, rating, rank, targetPrice } = req.body;
    try {
        const updated = await TmtStockRating.findOneAndUpdate({ ticker: ticker.toUpperCase() }, { ticker: ticker.toUpperCase(), rating, rank, targetPrice }, { new: true, upsert: true });
        res.json({ success: true, message: 'Rating saved.', data: updated });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

app.delete('/api/admin/stock-rating/:ticker', authMiddleware, adminAuthMiddleware, async (req, res) => {
    try {
        await TmtStockRating.deleteOne({ ticker: req.params.ticker.toUpperCase() });
        res.json({ success: true, message: 'Rating deleted.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// ===================================================================
// 6. STOCK & WATCHLIST ROUTES
// ===================================================================

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

// ===================================================================
// 7. OPERATIONS ROUTES (NEW STAFF ROSTER)
// ===================================================================

app.use('/api/staff/profile', authMiddleware, staffProfileRoutes); 
app.use('/api/staff/roster', authMiddleware, staffRosterRoutes); 

// ===================================================================
// 8. START SERVER
// ===================================================================

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Local access: http://localhost:${PORT}`);
});

module.exports = { app, User, StaffRoster, StaffProfile };