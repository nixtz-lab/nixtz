// server.js - NIXTZ BUSINESS OPERATIONS PLATFORM BACKEND (CORE SYSTEM ONLY)
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
    console.error("FATAL ERROR: MONGODB_URI is not defined. Application cannot proceed.");
    process.exit(1); 
}

// ===================================================================
// 1. MONGODB CONNECTION & SUPERUSER CREATION LOGIC
// ===================================================================

// Temporary function to create a Super Admin user if one doesn't exist.
// DELETE THIS FUNCTION AFTER SUCCESSFUL LOGIN.
// **FUNCTION REMOVED AS REQUESTED**


const connectDB = async () => {
    try {
        await mongoose.connect(MONGODB_URI, { 
            dbName: DATABASE_NAME,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        console.log('✅ MongoDB Connected Successfully to NIXTZ DB');
        
        // --- NEW CALL: Bootstrap the initial service admin user ---
        await createInitialServiceAdmin(); 

        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });

    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err.message);
        console.log('Retrying connection in 5 seconds...');
        setTimeout(connectDB, 5000); 
    }
};

connectDB(); // Initial connection attempt

// ===================================================================
// 2. SCHEMAS (CORE MODULES & NEW SERVICE MODULES)
// ===================================================================

// Core User & Config (Original, Untouched)
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    currency: { type: String, default: 'USD', enum: ['USD', 'EUR', 'GBP', 'JPY', 'THB', 'AUD'] },
    createdAt: { type: Date, default: Date.now },
    role: { type: String, default: 'pending', enum: ['pending', 'standard', 'admin', 'superadmin'] },
    membership: { type: String, default: 'none', enum: ['none', 'standard', 'platinum', 'vip'] },
    pageAccess: { type: [String], default: [] }, 
});
const User = mongoose.model('User', UserSchema);

// --- NEW DEDICATED SERVICE USER SCHEMA (Physical Separation) ---
const ServiceUserSchema = new mongoose.Schema({
    // Prefixed fields are now part of the independent ServiceUser collection
    susername: { type: String, required: true, unique: true, trim: true },
    semail: { type: String, required: true, unique: true, trim: true, lowercase: true },
    spasswordHash: { type: String, required: true },
    srole: { type: String, default: 'pending', enum: ['pending', 'standard', 'admin', 'superadmin', 'request_only'] }, 
    smembership: { type: String, default: 'none', enum: ['none', 'standard', 'platinum', 'vip'] },
    spageAccess: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
});
const ServiceUser = mongoose.model('ServiceUser', ServiceUserSchema); // <-- NEW MODEL

const MembershipConfigSchema = new mongoose.Schema({
    level: { type: String, required: true, unique: true, enum: ['standard', 'platinum', 'vip'] },
    pages: { type: [String], default: [] },
    monthlyPrice: { type: Number, required: true }
});
const MembershipConfig = mongoose.model('MembershipConfig', MembershipConfigSchema);

// Budget Schemas (Original, link to User model)
const BudgetTransactionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0.01 },
    type: { type: String, enum: ['income', 'expense'], required: true },
    timestamp: { type: Date, default: Date.now }
});
const BudgetTransaction = mongoose.model('BudgetTransaction', BudgetTransactionSchema);

const BudgetProjectionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    monthYear: { type: String, required: true, trim: true },
    projectedIncome: { type: Number, required: true, default: 0 },
    projectedExpenses: { type: Map, of: Number, default: {} }
});
BudgetProjectionSchema.index({ user: 1, monthYear: 1 }, { unique: true });
const BudgetProjection = mongoose.model('BudgetProjection', BudgetProjectionSchema);


// Staff & Roster Schemas (Original, link to User model)
const StaffProfileSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    employeeId: { type: String, unique: true, required: true, trim: true },
    position: { type: String, required: true, enum: ['Manager', 'Supervisor', 'Delivery', 'Normal Staff'] },
    shiftPreference: { type: String, default: 'Morning' }, 
    fixedDayOff: { type: String, enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'None'], default: 'None' },
    isNightRotator: { type: Boolean, default: false },
    currentRotationDay: { type: Number, default: 0 }, 
    // This field is required by the generator/profile router
    nextWeekHolidayRequest: { type: String, default: 'None' }, 
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
                shiftId: { type: mongoose.Schema.Types.Mixed }, // Changed to Mixed to allow string IDs like 'sub_123'
                jobRole: { type: String },
                timeRange: { type: String, default: '' },
                color: { type: String, default: '#FFFFFF' }
            }],
        }],
    }],
});
RosterEntrySchema.index({ user: 1, weekStartDate: 1 }, { unique: true }); 
const StaffRoster = mongoose.model('StaffRoster', RosterEntrySchema); 

// --- NEW SERVICE SCHEMAS (Laundry) ---

const LaundryItemSchema = new mongoose.Schema({
    type: { type: String, required: true },
    count: { type: Number, required: true, min: 1 },
    details: { type: String, trim: true }
}, { _id: false }); // Do not create _id for sub-documents

const LaundryRequestSchema = new mongoose.Schema({
    // Requestors are still core Users
    requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, 
    requesterUsername: { type: String, required: true }, // Store username directly for lookup
    department: { type: String, required: true, trim: true },
    contactExt: { type: String, required: true, trim: true },
    notes: { type: String, trim: true },
    items: [LaundryItemSchema],
    requestedAt: { type: Date, default: Date.now },
    // --- NEW FIELD: Request Type ---
    requestType: { 
        type: String, 
        default: 'pickup', 
        enum: ['pickup', 'supply'] // 'pickup' = Dirty/Soiled, 'supply' = Clean/Stock
    },
    status: { type: String, default: 'Pending Pickup',  enum: ['Pending Pickup', 'Pending Delivery', 'Picked Up', 'In Progress', 'Ready for Delivery', 'Completed', 'Cancelled'] },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceUser', required: false } // <-- CRITICAL: ProcessedBy links to ServiceUser
});
const LaundryRequest = mongoose.model('LaundryRequest', LaundryRequestSchema);

const ServiceStaffAccessSchema = new mongoose.Schema({
    // CRITICAL CHANGE: Link staff details to the dedicated ServiceUser model
    suser: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceUser', required: true, unique: true }, // <-- CRITICAL: Link to ServiceUser
    sname: { type: String, required: true },
    semployeeId: { type: String, required: true, unique: true },
    sdepartment: { type: String, required: true },
    serviceScope: { type: String, default: 'laundry' }
});
// Index on suser for fast lookups
// ServiceStaffAccessSchema.index({ semployeeId: 1 }, { unique: true });
const ServiceStaffAccess = mongoose.model('ServiceStaffAccess', ServiceStaffAccessSchema);


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

// Import the shared middleware
const { authMiddleware, adminAuthMiddleware, superAdminAuthMiddleware } = require('./middleware/auth'); 
// IMPORT THE NEW SERVICE MIDDLEWARE
const { serviceAuthMiddleware } = require('./middleware/service_auth');

// --- Router Imports (Core Routers) ---
const budgetPlannerRoutes = require('./routes/budget_planner_be.js');
const staffRosterRoutes = require('./routes/staff_roster_api.js'); 
const staffProfileRoutes = require('./routes/staff_profile_api_be.js'); 
const laundryRoutes = require('./routes/laundry_api_be.js'); // NEW ROUTER IMPORT
const serviceAdminRoutes = require('./routes/laundry_admin_api_be.js'); // NEW ADMIN ROUTER IMPORT
const serviceStaffAdminRoutes = require('./routes/service_admin_be.js'); // CORRECTLY ADDED IMPORT
const { router: serviceAuthRoutes, createInitialServiceAdmin } = require('./routes/service_auth_be.js'); // <-- NEW: Structured Import for auth router and bootstrap function

app.use(cors()); 
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ===================================================================
// 4. AUTHENTICATION & CORE USER ROUTES
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
        // Find user by either email or username (Employee ID)
        let user = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username: email }] }); // Search by email OR username
        if (!user) return res.status(400).json({ success: false, message: 'Invalid credentials.' });

        if (user.role === 'pending') return res.status(403).json({ success: false, message: 'Account pending approval.' });

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) return res.status(400).json({ success: false, message: 'Invalid credentials.' });

        // CRITICAL FIX: Convert user ID to string before putting it into the JWT payload.
        const payload = { user: { 
            id: user._id.toString(), // <-- FIX applied here
            username: user.username, 
            role: user.role, 
            membership: user.membership, 
            pageAccess: user.pageAccess 
        } };
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
                pageAccess: user.pageAccess,
                // Ensure email is returned for front-end local storage
                email: user.email // <-- ADDED for clean session management
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
        // FIX APPLIED HERE: Removed .select() to ensure the role field is always retrieved
        const user = await User.findById(req.user.id); 
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
        res.json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// ===================================================================
// 5. CONSOLIDATED ADMIN PANEL ROUTES (CORE MANAGEMENT ONLY)
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
        console.error('Update Membership Error:', err.message);
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
        console.error('Update Config Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});


// ===================================================================
// 6. MOUNT CORE ROUTERS (Staff and Budget) AND NEW SERVICE ROUTERS
// ===================================================================

app.use('/api/staff/profile', authMiddleware, staffProfileRoutes); 
app.use('/api/staff/roster', authMiddleware, staffRosterRoutes); 
app.use('/api/projections', authMiddleware, budgetPlannerRoutes); 

// --- NEW SERVICE ROUTERS (Using Dedicated Service Auth Middleware) ---
// The main laundry router handles user requests and staff status updates
app.use('/api/laundry', serviceAuthMiddleware, laundryRoutes); // <-- UPDATED: Uses serviceAuthMiddleware
// The service admin router handles analytics and staff/request management
app.use('/api/laundry/admin', serviceAuthMiddleware, serviceAdminRoutes); // <-- UPDATED: Uses serviceAuthMiddleware
// The service staff admin router handles staff user creation
app.use('/api/service/admin', serviceAuthMiddleware, serviceStaffAdminRoutes); // <-- UPDATED: Uses serviceAuthMiddleware
// NEW: Dedicated service authentication router
app.use('/api/serviceauth', serviceAuthRoutes); // <-- Correct: Login routes do not need middleware


// ===================================================================
// 7. BUDGET/FINANCE ROUTES (CONSOLIDATED)
// ===================================================================

app.get('/api/transactions', authMiddleware, async (req, res) => {
    try { 
        const transactions = await BudgetTransaction.find({ user: req.user.id }).sort({ timestamp: -1 }); 
        res.json({ success: true, data: transactions }); 
    } catch (err) { 
        console.error('Fetch Transactions Error:', err.message); 
        res.status(500).json({ success: false, message: 'Server error fetching transactions.' }); 
    }
});
app.post('/api/transactions', authMiddleware, async (req, res) => {
    const { description, amount, type } = req.body; 
    const validTypes = ['income', 'expense']; 
    if (!description || typeof amount !== 'number' || amount <= 0 || !type || !validTypes.includes(type)) { 
        return res.status(400).json({ success: false, message: 'Please provide a valid description, positive amount, and type (income/expense).' }); 
    } 
    try { 
        const newTransaction = new BudgetTransaction({ user: req.user.id, description: description.trim(), amount: amount, type }); 
        const savedTransaction = await newTransaction.save(); 
        res.status(201).json({ success: true, message: 'Transaction saved.', data: savedTransaction }); 
    } catch (err) { 
        console.error('Add Transaction Error:', err.message); 
        if (err.name === 'ValidationError') { 
            return res.status(400).json({ success: false, message: `Validation Error: ${err.message}` }); 
        } 
        res.status(500).json({ success: false, message: 'Server error saving transaction.' }); 
    }
});
app.delete('/api/transactions/:id', authMiddleware, async (req, res) => { 
    try { 
        const transactionId = req.params.id; 
        let query = { _id: transactionId, user: req.user.id }; 
        if (req.user.role === 'superadmin') { 
            query = { _id: transactionId }; 
        } 
        const transaction = await BudgetTransaction.findOne(query); 
        if (!transaction) { 
            return res.status(404).json({ success: false, message: 'Transaction not found or you are not authorized to delete it.' });
        } 
        await BudgetTransaction.deleteOne({ _id: transactionId }); 
        res.json({ success: true, message: 'Transaction deleted.' }); 
    } catch (err) { 
        console.error('Delete Transaction Error:', err.message); 
        if (err.name === 'CastError') { 
            return res.status(400).json({ success: false, message: 'Invalid transaction ID format.' }); 
        } 
        res.status(500).json({ success: false, message: 'Server error deleting transaction.' }); 
    }
});

// 9. START SERVER
// The original app.listen(PORT, ...) has been REMOVED from here 
// and moved into the connectDB function to ensure stability.

// Updated Export:
module.exports = { 
    app, 
    User, 
    StaffRoster, 
    StaffProfile, 
    BudgetTransaction, 
    BudgetProjection, 
    MembershipConfig,
    // Export New Models
    LaundryRequest,
    ServiceStaffAccess
};