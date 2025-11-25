// server.js - NIXTZ BUSINESS OPERATIONS PLATFORM BACKEND (UNIFIED ADMIN ROUTES)
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

// ===================================================================
// 2. SCHEMAS (CORE & SERVICE SEPARATION)
// ===================================================================

// 🚨 CORE MODEL: USER (Used by Dashboard, Admin Panel, Roster, Index)
const CoreUserSchema = new mongoose.Schema({
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
const User = mongoose.model('User', CoreUserSchema); // Registered as 'User'

// 🚨 SERVICE MODEL: SUSER (Used by Service Admin pages only)
const ServiceUserSchema = new mongoose.Schema({
    susername: { type: String, required: true, unique: true, trim: true },
    semail: { type: String, required: true, unique: true, trim: true, lowercase: true },
    spasswordHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    srole: { type: String, default: 'pending', enum: ['pending', 'standard', 'admin', 'superadmin'] },
    smembership: { type: String, default: 'none', enum: ['none', 'standard', 'platinum', 'vip'] },
    spageAccess: { type: [String], default: [] },
    resetPasswordToken: String,
    resetPasswordExpires: Date
});
const SUser = mongoose.model('SUser', ServiceUserSchema); // Registered as 'SUser'

// User & Config
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

// Staff & Roster (These still link to the Core 'User' model)
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

// --- SERVICE STAFF ACCESS SCHEMA (Links to the NEW 'SUser' model) ---
const ServiceStaffAccessSchema = new mongoose.Schema({
    // Links to the NEW Service User Model ('SUser')
    suser: { type: mongoose.Schema.Types.ObjectId, ref: 'SUser', required: true, unique: true }, 
    sname: { type: String, required: true, trim: true },
    semployeeId: { type: String, unique: true, required: true, trim: true },
    sdepartment: { type: String, required: true, trim: true },
    serviceScope: { type: String, default: 'laundry' } 
});
const ServiceStaffAccess = mongoose.model('ServiceStaffAccess', ServiceStaffAccessSchema);
// --- END NEW SCHEMA ---

// --- LAUNDRY SERVICE SCHEMA (Links to the Core 'User' Model, assuming requester is core user) ---
const LaundryRequestSchema = new mongoose.Schema({
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    requesterUsername: { type: String, required: true },
    department: { type: String, required: true, trim: true },
    contactExt: { type: String, trim: true }, 
    notes: { type: String, trim: true, default: '' },
    items: [{
        type: { type: String, required: true, enum: ['Uniform', 'Towels', 'Linens', 'Staff Clothing', 'Other'] },
        count: { type: Number, required: true, min: 1 },
        details: { type: String, default: '' }
    }],
    status: { 
        type: String, 
        default: 'Pending Pickup', 
        enum: ['Pending Pickup', 'Picked Up', 'In Progress', 'Ready for Delivery', 'Completed', 'Cancelled'] 
    },
    requestedAt: { type: Date, default: Date.now },
    pickedUpAt: { type: Date },
    completedAt: { type: Date },
    staffAssigned: { type: mongoose.Schema.Types.ObjectId, ref: 'SUser' }, // Assign to Service User
});
const LaundryRequest = mongoose.model('LaundryRequest', LaundryRequestSchema);


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

// CRITICAL: Ensure all middleware functions, including superAdminAuthMiddleware, are imported.
const { authMiddleware, adminAuthMiddleware, superAdminAuthMiddleware } = require('./middleware/auth'); 

// --- Router Imports ---
const staffRosterRoutes = require('./routes/staff_roster_api.js'); 
const staffProfileRoutes = require('./routes/staff_profile_api_be.js'); 
// REMOVED: const adminPanelRoutes = require('./routes/admin_panel_be.js'); // DELETE THIS LINE
const laundryRoutes = require('./routes/laundry_api_be.js'); 
const laundryAdminRoutes = require('./routes/laundry_admin_api_be.js'); 
const serviceAdminRoutes = require('./routes/service_admin_be.js'); 

app.use(cors()); 
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ===================================================================
// 4. AUTHENTICATION ROUTES (MUST USE CORE USER MODEL)
// ===================================================================

// Register (Uses Core User Model)
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
            username, email: email.toLowerCase(), passwordHash,
            role: 'pending', membership: 'none', pageAccess: []
        });
        await newUser.save();
        res.status(201).json({ success: true, message: 'Account created! Awaiting admin approval.' });
    } catch (err) {
        console.error('Register Error:', err);
        res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
});

// Login (Uses Core User Model)
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Enter email and password.' });

    try {
        let user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(400).json({ success: false, message: 'Invalid credentials.' });

        if (user.role === 'pending') return res.status(403).json({ success: false, message: 'Account pending approval.' });

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) return res.status(400).json({ success: false, message: 'Invalid credentials.' });

        // Payload uses CORE fields
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

// Get Profile (Uses Core User Model)
app.get('/api/user/profile', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-passwordHash');
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
        res.json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Forgot & Reset Password (Uses Core User Model)
app.post('/api/auth/forgot-password', async (req, res) => res.json({success:false, message:"Implemented in original"}));
app.post('/api/auth/reset-password', async (req, res) => res.json({success:false, message:"Implemented in original"}));


// ===================================================================
// 5. CONSOLIDATED ADMIN PANEL ROUTES (MUST USE CORE USER MODEL)
// ===================================================================

// GET Pending Users
app.get('/api/admin/users/pending', authMiddleware, adminAuthMiddleware, async (req, res) => {
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
app.put('/api/admin/users/:id/approve', authMiddleware, adminAuthMiddleware, async (req, res) => {
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
app.get('/api/admin/users', authMiddleware, adminAuthMiddleware, async (req, res) => {
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
        console.error('Update Membership Error:', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// POST Create New Admin
app.post('/api/admin/create', authMiddleware, superAdminAuthMiddleware, async (req, res) => {
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

// GET Membership Config
app.get('/api/admin/membership-config', authMiddleware, adminAuthMiddleware, async (req, res) => {
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

// PUT Update Membership Config
app.put('/api/admin/membership-config/:level', authMiddleware, adminAuthMiddleware, async (req, res) => {
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

// GET Stock Ratings
app.get('/api/admin/stock-ratings', authMiddleware, adminAuthMiddleware, async (req, res) => {
    try {
        const ratings = await TmtStockRating.find().sort({ ticker: 1 });
        res.json({ success: true, data: ratings });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// POST/PUT Stock Rating
app.post('/api/admin/stock-rating', authMiddleware, adminAuthMiddleware, async (req, res) => {
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

// DELETE Stock Rating
app.delete('/api/admin/stock-rating/:ticker', authMiddleware, adminAuthMiddleware, async (req, res) => {
    try {
        await TmtStockRating.deleteOne({ ticker: req.params.ticker.toUpperCase() });
        res.json({ success: true, message: 'Rating deleted.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});
// ===================================================================
// END CONSOLIDATED ADMIN PANEL ROUTES
// ===================================================================


// 6. MOUNT OTHER ROUTERS

// NEW: LAUNDRY SERVICE ADMIN ROUTES - Requires full admin access
app.use('/api/laundry/admin', authMiddleware, adminAuthMiddleware, laundryAdminRoutes);

// Operations Routes
app.use('/api/staff/profile', authMiddleware, staffProfileRoutes); 
app.use('/api/staff/roster', authMiddleware, staffRosterRoutes); 
app.use('/api/service/admin', authMiddleware, adminAuthMiddleware, serviceAdminRoutes);
// Standard Laundry API
app.use('/api/laundry', authMiddleware, laundryRoutes);


// 7. STOCK WATCHLIST
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

// 8. START SERVER
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Local access: http://localhost:${PORT}`);
});

// Updated Export:
module.exports = { app, User, SUser, StaffRoster, StaffProfile, LaundryRequest, ServiceStaffAccess };