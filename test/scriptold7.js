// server.js - Fully Functional Backend with MongoDB/Mongoose (Based on User Upload)
// *** FINAL MODIFICATION: ADDED WATCHLIST CACHING & SIMFIN NET ASSETS ***
// *** ROLLED BACK: ALL PREVIOUS EXPERIMENTAL CHANGES HAVE BEEN REMOVED ***

// 1. Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors'); // Import CORS
const axios = require('axios'); // ** Using Axios, which is in your package.json **
// Add these with your other requires:
const nodemailer = require('nodemailer');
const crypto = require('crypto');

// *** NEW: In-memory cache for watchlist and 52wk list ***
// This will store data by userId
const watchlistCache = new Map();
const CACHE_DURATION_MS = 120 * 1000; // 2 minutes
const LOW_LIST_CACHE_KEY = 'global_52wk_lows';

// server.js (Replacing lines 18-28)

// --- Configure Email Transport (TITAN/HOSTINGER/GODADDY SMTP) ---
const transporter = nodemailer.createTransport({
    // *** CHANGE REQUIRED HERE ***
    host: 'smtpout.secureserver.net', // Changed from smtp.titan.email
    port: 465,
    secure: true, // Port 465 requires SSL
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD 
    },
    // Keep this for Coolify deployment security
    tls: {
        rejectUnauthorized: false
    }
});

// *** NEW CRITICAL VALIDATION CHECK ***
if (!process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
    console.error("FATAL ERROR: SMTP_USER or SMTP_PASSWORD is not defined in environment variables. Email service cannot start.");
    // Do not process.exit(1) here, let the app run, but log the error
    // The transporter will fail later, which is fine, but the log must be clear.
}
// --- User Schema (Original) --- paste to new location to fix server error---
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true }, // Storing the hashed password
    currency: { type: String, default: 'USD', enum: ['USD', 'EUR', 'GBP', 'JPY', 'THB', 'AUD'] },
    createdAt: { type: Date, default: Date.now },
    role: { type: String, default: 'pending', enum: ['pending', 'standard', 'admin', 'superadmin'] },
    membership: { type: String, default: 'none', enum: ['none', 'standard', 'platinum', 'vip'] },
    pageAccess: { type: [String], default: [] }, // List of page slugs the user can access
    watchlist: { type: [String], default: [] },
    resetPasswordToken: String,
    resetPasswordExpires: Date
});
const User = mongoose.model('User', UserSchema);

// --- Budget Transaction Schema (Original) ---
const BudgetTransactionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    amount: {
        type: Number, // Use Number for currency values in Mongoose
        required: true,
        min: 0.01 // Ensures positive amounts
    },
    type: {
        type: String,
        enum: ['income', 'expense'],
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});
const BudgetTransaction = mongoose.model('BudgetTransaction', BudgetTransactionSchema);

// --- Membership Config Schema (Original) ---
const MembershipConfigSchema = new mongoose.Schema({
    level: { type: String, required: true, unique: true, enum: ['standard', 'platinum', 'vip'] },
    pages: { type: [String], default: [] }, // Slugs of pages accessible by this level
    monthlyPrice: { type: Number, required: true }
});
const MembershipConfig = mongoose.model('MembershipConfig', MembershipConfigSchema);


// *** NEW SCHEMA: TMT (Admin) Stock Rating ***
const TmtStockRatingSchema = new mongoose.Schema({
    ticker: { type: String, required: true, unique: true, uppercase: true, trim: true },
    rating: { type: Number, required: true, min: 0, max: 5 }, // 0=N/A, 1-5=Ratings
    rank: { type: String, trim: true, default: '' }, // e.g., "A+", "B"
    targetPrice: { type: Number, default: null } // NEW: TMT Target Price
});
const TmtStockRating = mongoose.model('TmtStockRating', TmtStockRatingSchema);

// *** NEW SCHEMA: User Stock Rating ***
const UserStockRatingSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ticker: { type: String, required: true, uppercase: true, trim: true },
    rating: { type: Number, required: true, min: 0, max: 5 } // 0=Cannot Rate, 1-5=Ratings
});
// Create a compound index to ensure one user can only rate one ticker once
UserStockRatingSchema.index({ user: 1, ticker: 1 }, { unique: true });
const UserStockRating = mongoose.model('UserStockRating', UserStockRatingSchema);
// -- end user schemas ---

// --- NEW SCHEMA: 52 Week Low Scan Ticker ---
const TickerScanSchema = new mongoose.Schema({
    ticker: { type: String, required: true, unique: true, uppercase: true, trim: true },
    notes: { type: String, default: '' } // Optional field for admin notes
});
const TickerScan = mongoose.model('TickerScan', TickerScanSchema);
// -- end new schema ---

// ############### NEW SCHEMA FOR BUDGET PLANNER ###############
/**
 * New Schema to store monthly budget projections in MongoDB
 */
const BudgetProjectionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // e.g., "2025-11"
    monthYear: { 
        type: String, 
        required: true,
        trim: true 
    },
    // All amounts are stored in base currency (USD)
    projectedIncome: {
        type: Number,
        required: true,
        default: 0
    },
    // This stores { rent: 1000, groceries: 400, savings: 200 }
    projectedExpenses: {
        type: Map,
        of: Number,
        default: {}
    }
});
// Create a compound index to ensure one user can only have one plan per month
BudgetProjectionSchema.index({ user: 1, monthYear: 1 }, { unique: true });
const BudgetProjection = mongoose.model('BudgetProjection', BudgetProjectionSchema);
// -- end new schema for BUDGET PLANNER---############################

// Import the shared middleware
const { authMiddleware, adminAuthMiddleware, superAdminAuthMiddleware } = require('./middleware/auth');

// Import your new route files
const tmtDashboardRoutes = require('./routes/tmt_dashboard_be');
const budgetPlannerRoutes = require('./routes/budget_planner_be.js');
// *** NEW IMPORT ***
const currencyRateRoutes = require('./routes/currency_rate_be.js');
const stockAnalysisRoutes = require('./routes/stock_analysis_be.js');
// *** NEW: Import the dedicated fixed metrics route file ***
const fixedMetricsRoutes = require('./routes/stock_analysis_fixed_metrics.js'); 

const app = express();
// Coolify provides the PORT environment variable; fall back to 3000 for local use
const PORT = process.env.PORT || 3000;

// --- CRITICAL CONFIGURATION ---
const JWT_SECRET = process.env.JWT_SECRET || 'your_default_jwt_secret_please_change_this_for_prod';
const MONGODB_URI = process.env.MONGODB_URI;
const DATABASE_NAME = 'tmt_website_db';

// --- API KEYS ---
// IMPORTANT: Removed the fallback key here. The key MUST be in the environment variables.
const YAHU_RAPIDAPI_KEY = process.env.YAHU_RAPIDAPI_KEY; // Only uses the environment variable now
const YAHU_RAPIDAPI_HOST = process.env.YAHU_RAPIDAPI_HOST || "apidojo-yahoo-finance-v1.p.rapidapi.com";
// Use your provided SimFin Key as the fallback
const SIMFIN_API_KEY = process.env.SIMFIN_API_KEY || "2a8d888b-daef-49fd-9736-b80328a9ea23"; // Your key
const SIMFIN_BASE_URL = "https://backend.simfin.com/api/v3/companies";

// Ensure the URI is present
if (!MONGODB_URI) {
    console.error("FATAL ERROR: MONGODB_URI is not defined in environment variables. Server cannot start.");
    process.exit(1);
}

// -------------------------------------------------------------------
// 2. MONGODB CONNECTION & SCHEMAS (Copied from your uploaded file)
// -------------------------------------------------------------------

mongoose.connect(MONGODB_URI, { dbName: DATABASE_NAME })
    .then(() => console.log('MongoDB Connected Successfully'))
    .catch(err => {
        console.error('MongoDB Connection Error:', err.message);
        // Important: Exit if connection fails to prevent app from running without DB
        process.exit(1);
    });

// -------------------------------------------------------------------
// 3. MIDDLEWARE SETUP (Copied from your uploaded file)
// -------------------------------------------------------------------

app.use(cors()); // **FIX: Enable CORS for all routes**
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ===================================================================
// 4. AUTHENTICATION & ADMIN INITIALIZATION ROUTES (Copied from your uploaded file)
// ===================================================================

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user (default role: pending)
 * @access  Public
 */
app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;

    // Validate input
    if (!username || !email || !password || password.length < 8) {
        return res.status(400).json({ success: false, message: 'Please provide valid username, email, and a password of at least 8 characters.' });
    }

    try {
        // Check if email or username already exists
        let userByEmail = await User.findOne({ email: email.toLowerCase() });
        if (userByEmail) {
            return res.status(400).json({ success: false, message: 'This email is already registered.' });
        }
        let userByUsername = await User.findOne({ username });
         if (userByUsername) {
            return res.status(400).json({ success: false, message: 'This username is already taken.' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // Create new user with pending status
        const newUser = new User({
            username,
            email: email.toLowerCase(),
            passwordHash,
            role: 'pending', // Default role
            membership: 'none', // Default membership
            pageAccess: [] // Default page access
        });
        await newUser.save();

        // Respond successfully
        res.status(201).json({ success: true, message: 'Account created successfully! Awaiting admin approval.' });

    } catch (err) {
        console.error('Registration Error:', err.message);
         // Handle potential duplicate key errors during save just in case findOne misses due to race condition
         if (err.code === 11000) {
             return res.status(400).json({ success: false, message: 'Email or username already exists.' });
         }
        res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
});


/**
 * @route   POST /api/auth/login
 * @desc    Login a user and return JWT token
 * @access  Public
 */
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    // Basic input validation
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Please fill in both email and password.' });
    }

    try {
        // Find user by email
        let user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            // User not found
            return res.status(400).json({ success: false, message: 'Invalid credentials.' });
        }

        // Check if account is pending approval
        if (user.role === 'pending') {
            return res.status(403).json({ success: false, message: 'Your account is pending admin approval.' });
        }

        // Compare provided password with stored hash
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            // Passwords don't match
            return res.status(400).json({ success: false, message: 'Invalid credentials.' });
        }
        
        // --- SUPER ADMIN INITIALIZATION LOGIC ---
        // Check if any superadmin exists. If not, promote the first non-pending user to log in.
        const superAdminExists = await User.exists({ role: 'superadmin' });
        if (!superAdminExists && user.role !== 'superadmin') {
            user.role = 'superadmin';
            user.membership = 'vip'; // Assign VIP membership

            // Attempt to fetch VIP page access, provide defaults if config missing
            let vipConfig = await MembershipConfig.findOne({ level: 'vip' });
            if (vipConfig && vipConfig.pages) {
                 user.pageAccess = vipConfig.pages;
            } else {
                 console.warn("VIP Membership config not found, assigning default pages to Superadmin.");
                 user.pageAccess = ['stock_dashboard', 'budget_tracker', 'tmt_dashboard', 'admin_panel', 'all']; // Fallback pages
            }

            await user.save();
            console.log(`User ${user.username} (ID: ${user.id}) promoted to SUPERADMIN.`);
        }
        // ----------------------------------------

        // Prepare JWT payload
        const payload = {
            user: {
                id: user.id, // Use user.id which is the MongoDB _id
                username: user.username,
                role: user.role,
                membership: user.membership,
                pageAccess: user.pageAccess
            }
        };

        // Sign the JWT
        jwt.sign(
            payload,
            JWT_SECRET,
            { expiresIn: '5d' }, // Token expires in 5 days
            (err, token) => {
                if (err) {
                    console.error('JWT Signing Error:', err);
                    throw err; // Throw error to be caught by outer catch block
                }
                // Send successful response with token and user details
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
            }
        );

    } catch (err) {
        console.error('Login Process Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error during login process.' });
    }
});
       // ----start Forgot Password Route ------
        /**
        * @route   POST /api/auth/forgot-password
        * @desc    Generates a reset token, saves it to DB, and sends the email.
        * @access  Public
         */
        app.post('/api/auth/forgot-password', async (req, res) => {
        try {
        const { email } = req.body;
        // NOTE: User model must be defined higher up
        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            // Send a generic success message even if the user isn't found for security reasons
            return res.status(200).json({ success: true, message: 'If an account exists, a password reset link has been sent to your email.' });
        }

        // 1. Generate a unique token (Requires 'crypto' module)
        const token = crypto.randomBytes(20).toString('hex');
        
        // 2. Set token and expiration time (1 hour)
        // NOTE: UserSchema must have resetPasswordToken and resetPasswordExpires fields
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour expiration
        await user.save();

        // 3. Construct the reset URL (!!! CHANGE 'https://yourdomain.com' to your actual deployed URL !!!)
        const resetUrl = `https://thinkmoneytree.com/reset-password.html?token=${token}`;

        // 4. Send Email (Requires 'nodemailer' and 'transporter' setup higher up)
        const mailOptions = {
            to: user.email,
            from: process.env.SMTP_USER,
            subject: 'Think Money Tree Password Reset Request',
            html: `
                <p>Hello,</p>
                <p>You recently requested to reset the password for your Think Money Tree account.</p>
                <p>Please click the link below to set a new password:</p>
                <p><a href="${resetUrl}" style="background-color: #00A99D; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a></p>
                <p>This link will expire in one hour.</p>
                <p>If you did not request a password reset, please ignore this email.</p>
                <br>
                <p>The Think Money Tree Team</p>
            `
        };

        // NOTE: This call relies on the global 'transporter' object you set up
        await transporter.sendMail(mailOptions); 

        res.status(200).json({ success: true, message: 'Password reset link sent successfully.' });

        } catch (err) {
        console.error('Forgot Password Process Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error processing password reset.' });
        }
        });
        // ----END Forgot Password Route ------
        // ----START Reset Password Route ------
        /**
        * @route   POST /api/auth/reset-password
        * @desc    Validates token and updates user's password.
        * @access  Public (Requires valid token in body)
        */
        app.post('/api/auth/reset-password', async (req, res) => {
        const { token, newPassword } = req.body;

        // 1. Basic validation
        if (!token || !newPassword || newPassword.length < 8) {
        return res.status(400).json({ success: false, message: 'Invalid request: Token and a password of at least 8 characters are required.' });
        }

        try {
        // 2. Find user by token and ensure token is not expired
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() } // Check if expiration date is greater than now
        });

        if (!user) {
            // Token is invalid, expired, or was already used
            return res.status(400).json({ success: false, message: 'Password reset link is invalid or has expired.' });
        }

        // 3. Hash the new password and clear token fields
        const salt = await bcrypt.genSalt(10);
        user.passwordHash = await bcrypt.hash(newPassword, salt);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.json({ success: true, message: 'Password has been successfully reset. You may now log in.' });

        } catch (err) {
        console.error('Password Reset Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error during password reset.' });
        }
        });
        // ----END Reset Password Route ------

// ===================================================================
// 5. ADMIN PANEL API ROUTES (Copied from your uploaded file)
// ===================================================================

/**
 * @route   GET /api/admin/users/pending
 * @desc    Admin gets list of pending users
 * @access  Admin/Superadmin
 */
app.get('/api/admin/users/pending', authMiddleware, adminAuthMiddleware, async (req, res) => {
    try {
        // Find users with role 'pending', select specific fields, sort by creation date

        // --- !!! ---
        // *** FIX APPLIED (Original line 408) ***
        // Find users who are 'pending' OR whose 'role' field doesn't exist
        const pendingUsers = await User.find({
            $or: [
                { role: 'pending' },
                { role: { $exists: false } }
            ]
        })
        // --- !!! ---
                                        .select('username email createdAt')
                                        .sort({ createdAt: 1 }); // Sort oldest first
        res.json({ success: true, data: pendingUsers });
    } catch (err) {
        console.error('Fetch Pending Users Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching pending users.' });
    }
});

/**
 * @route   PUT /api/admin/users/:id/approve
 * @desc    Admin approves a pending user, setting role to 'standard'
 * @access  Admin/Superadmin
 */
app.put('/api/admin/users/:id/approve', authMiddleware, adminAuthMiddleware, async (req, res) => {
    try {
        const userId = req.params.id;
        // Find user by ID and update their role and membership
        const user = await User.findByIdAndUpdate(
            userId,
            // Set role to 'standard' and membership to 'none' upon approval
            { role: 'standard', membership: 'none', pageAccess: [] }, // Reset page access too
            { new: true } // Return the updated document
        ).select('username role membership'); // Select fields to return

        if (!user) {
            // User with the given ID was not found
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        // Respond with success message and updated user data
        res.json({ success: true, message: `${user.username} approved as Standard User.`, data: user });
    } catch (err) {
        console.error('Approve User Error:', err.message);
         // Handle potential errors like invalid ObjectId format
        if (err.name === 'CastError') {
             return res.status(400).json({ success: false, message: 'Invalid user ID format.' });
        }
        res.status(500).json({ success: false, message: 'Server error approving user.' });
    }
});

/**
 * @route   GET /api/admin/users
 * @desc    Admin gets list of all approved (non-pending) users
 * @access  Admin/Superadmin
 */
app.get('/api/admin/users', authMiddleware, adminAuthMiddleware, async (req, res) => {
    try {
        // Find users whose role is NOT 'pending'

        // --- !!! ---
        // *** FIX APPLIED (Original line 470) ***
        // Only find users whose role is explicitly 'standard', 'admin', or 'superadmin'
        const users = await User.find({
            role: { $in: ['standard', 'admin', 'superadmin'] }
        })
        // --- !!! ---
                                .select('username email membership role pageAccess')
                                .sort({ username: 1 }); // Sort alphabetically by username
        res.json({ success: true, data: users });
    } catch (err) {
        console.error('Fetch All Users Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching users.' });
    }
});


/**
 * @route   PUT /api/admin/users/:id/update-membership
 * @desc    Admin updates a user's membership level and associated page access
 * @access  Admin/Superadmin
 */
app.put('/api/admin/users/:id/update-membership', authMiddleware, adminAuthMiddleware, async (req, res) => {
    const { membership } = req.body;
    const userId = req.params.id;

    // Validate membership level input
    const validMemberships = ['none', 'standard', 'platinum', 'vip'];
    if (!validMemberships.includes(membership)) {
        return res.status(400).json({ success: false, message: 'Invalid membership level provided.' });
    }

    try {
        let pageAccess = []; // Default to empty access list

        // If assigning a membership level (not 'none'), find its configuration
        if (membership !== 'none') {
            const config = await MembershipConfig.findOne({ level: membership });
            if (config && config.pages) {
                pageAccess = config.pages; // Assign pages from config
            } else {
                 // Warn if config is missing for a specific level, but proceed (maybe assign defaults?)
                 console.warn(`Membership config for level '${membership}' not found or has no pages defined.`);
                 // Decide: either assign no pages, default pages, or return an error
                 // For now, assign no pages if config is missing
                 pageAccess = [];
                 // Alternative: return res.status(404).json({ success: false, message: `Configuration for membership level '${membership}' not found.` });
            }
        }

        // Update the user's membership and pageAccess
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { membership, pageAccess },
            { new: true, runValidators: true } // Return updated doc, run schema validators
        ).select('username membership pageAccess'); // Select fields to return

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        // Respond with success
        res.json({ success: true, message: `${updatedUser.username} membership updated to ${membership}.`, data: updatedUser });

    } catch (err) {
        console.error('Update Membership Error:', err.message);
        if (err.name === 'CastError') {
             return res.status(400).json({ success: false, message: 'Invalid user ID format.' });
        }
        res.status(500).json({ success: false, message: 'Server error updating membership.' });
    }
});

/**
 * @route   POST /api/admin/admins/create
 * @desc    Superadmin creates a new Admin user
 * @access  Superadmin
 */
app.post('/api/admin/admins/create', authMiddleware, superAdminAuthMiddleware, async (req, res) => {
    const { username, email, password } = req.body;

    // Validate input
    if (!username || !email || !password || password.length < 8) {
        return res.status(400).json({ success: false, message: 'Provide valid username, email, and password (min 8 characters).' });
    }

    try {
        // Check if email or username already exists
        if (await User.exists({ email: email.toLowerCase() })) {
            return res.status(400).json({ success: false, message: 'Email already exists.' });
        }
         if (await User.exists({ username })) {
            return res.status(400).json({ success: false, message: 'Username already exists.' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

         // Find page access for default 'standard' membership
         let standardPageAccess = [];
         const standardConfig = await MembershipConfig.findOne({ level: 'standard' });
         if (standardConfig && standardConfig.pages) {
             standardPageAccess = standardConfig.pages;
         } else {
              console.warn("Standard membership config not found when creating admin, assigning empty page access.");
         }

        // Create new admin user
        const newAdmin = new User({
            username,
            email: email.toLowerCase(),
            passwordHash,
            role: 'admin', // Explicitly set role
            membership: 'standard', // Admins get standard membership by default
            pageAccess: standardPageAccess // Assign pages based on standard config
        });
        await newAdmin.save();

        // Respond successfully
        res.status(201).json({ success: true, message: `Admin user ${username} created successfully.` });

    } catch (err) {
        console.error('Create Admin Error:', err.message);
         if (err.code === 11000) {
             return res.status(400).json({ success: false, message: 'Email or username already exists.' });
         }
        res.status(500).json({ success: false, message: 'Server error creating admin user.' });
    }
});

// ===================================================================
// 6. MEMBERSHIP CONFIGURATION ROUTES (Copied from your uploaded file)
// ===================================================================

/**
 * @route   GET /api/admin/membership-config
 * @desc    Admin gets all membership configurations, creates defaults if missing
 * @access  Admin/Superadmin
 */
app.get('/api/admin/membership-config', authMiddleware, adminAuthMiddleware, async (req, res) => {
    try {
        const levels = ['standard', 'platinum', 'vip'];
        const defaultConfigs = {
            standard: { pages: ['stock_dashboard', 'budget_tracker'], monthlyPrice: 10 },
            platinum: { pages: ['stock_dashboard', 'budget_tracker', 'stock_valuation'], monthlyPrice: 30 },
            vip: { pages: ['stock_dashboard', 'budget_tracker', 'stock_valuation', 'admin_panel', 'all'], monthlyPrice: 50 } // Added more defaults
        };

        // Use Promise.all to fetch or create configs concurrently
        const configs = await Promise.all(levels.map(async level => {
            let config = await MembershipConfig.findOne({ level });
            // If config doesn't exist, create it with defaults
            if (!config) {
                console.log(`Membership config for '${level}' not found, creating default.`);
                config = new MembershipConfig({
                    level,
                    pages: defaultConfigs[level].pages,
                    monthlyPrice: defaultConfigs[level].monthlyPrice
                });
                await config.save();
            }
            return config; // Return the found or newly created config
        }));

        res.json({ success: true, data: configs });
    } catch (err) {
        console.error('Fetch/Create Membership Config Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error processing membership configurations.' });
    }
});

/**
 * @route   PUT /api/admin/membership-config/:level
 * @desc    Admin updates a specific membership configuration and applies changes to users
 * @access  Admin/Superadmin
 */
app.put('/api/admin/membership-config/:level', authMiddleware, adminAuthMiddleware, async (req, res) => {
    const { pages, monthlyPrice } = req.body;
    const level = req.params.level;

    // Validate level parameter
    if (!['standard', 'platinum', 'vip'].includes(level)) {
        return res.status(400).json({ success: false, message: 'Invalid membership level provided.' });
    }

    // Validate request body
    if (!Array.isArray(pages) || typeof monthlyPrice !== 'number' || monthlyPrice < 0) {
        return res.status(400).json({ success: false, message: 'Invalid data: pages must be an array and monthlyPrice must be a non-negative number.' });
    }

    try {
        // Find the config and update it, or create if it doesn't exist (upsert)
        const updatedConfig = await MembershipConfig.findOneAndUpdate(
            { level }, // Find by level
            { pages, monthlyPrice }, // Data to update
            { new: true, upsert: true, runValidators: true } // Options: return new, create if not found, run schema validation
        );

        // IMPORTANT: Update pageAccess for all users currently assigned to this membership level
        const updateResult = await User.updateMany(
            { membership: level }, // Filter for users with this membership level
            { $set: { pageAccess: pages } } // Update only the pageAccess field
        );

         console.log(`Updated page access for ${updateResult.modifiedCount} users with membership level '${level}'.`);


        res.json({ success: true, message: `Membership config for ${level} updated. User access synchronized.`, data: updatedConfig });
    } catch (err) {
        console.error('Update Membership Config Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error updating membership configuration.' });
    }
});


// ===================================================================
// 7. STOCK DASHBOARD API ROUTES (SimFin Route Updated)
// ===================================================================

/**
 * @route   GET /api/search-tickers
 * @desc    Get live stock ticker suggestions from Yahu (Yahoo Finance) via RapidAPI
 * @access  Public (proxied to hide API key)
 */
app.get('/api/search-tickers', async (req, res) => {
    const query = req.query.q; // Get search query from URL parameter 'q'
    if (!query) {
        return res.status(400).json({ success: false, message: 'Query parameter "q" is required.' });
    }

    // Prepare request for Yahu RapidAPI endpoint
    const url = `https://${YAHU_RAPIDAPI_HOST}/auto-complete?q=${encodeURIComponent(query)}&region=US`;
    const options = {
        method: 'GET',
        headers: {
            'x-rapidapi-key': YAHU_RAPIDAPI_KEY,
            'x-rapidapi-host': YAHU_RAPIDAPI_HOST
        }
    };

    try {
        // Make the external API call using Axios
        const apiResponse = await axios.get(url, options);
        const jsonData = apiResponse.data; // Axios returns data in .data property

        // Check if quotes array exists
         if (!jsonData || !Array.isArray(jsonData.quotes)) {
              console.warn('Yahu API response format unexpected or missing quotes array:', jsonData);
              return res.json({ success: true, data: [] }); // Return empty array if format is wrong
         }


        // Transform the Yahu response into a simpler format for the frontend
        const suggestions = jsonData.quotes
            // Filter for valid equity quotes with necessary info
            .filter(quote => quote.symbol && (quote.longname || quote.shortname) && quote.quoteType === 'EQUITY')
            // Map to the desired structure
            .map(quote => ({
                ticker: quote.symbol,
                name: quote.longname || quote.shortname // Prefer long name
            }))
            .slice(0, 7); // Limit to top 7 suggestions

        res.json({ success: true, data: suggestions }); // Send formatted suggestions

    } catch (err) {
        // Handle Axios errors (network issues, API errors)
        if (axios.isAxiosError(err)) {
             if (err.response) {
                 // The request was made and the server responded with a status code
                 console.error(`Yahu API Error: Status ${err.response.status}`, err.response.data);
                 // Forward the status code and a generic message
                 res.status(err.response.status).json({ success: false, message: `Error from external stock API (Status: ${err.response.status}).` });
             } else if (err.request) {
                  // The request was made but no response was received
                 console.error('Yahu Ticker Search Request Error (No Response):', err.request);
                 res.status(504).json({ success: false, message: 'No response received from external stock API.' }); // Gateway Timeout
             } else {
                 // Something happened in setting up the request that triggered an Error
                 console.error('Yahu Ticker Search Axios Setup Error:', err.message);
                 res.status(500).json({ success: false, message: 'Server error setting up request to external stock API.' });
             }
         } else {
              // Handle non-Axios errors
             console.error('Ticker Search Internal Error:', err.message);
             res.status(500).json({ success: false, message: 'Internal server error during ticker search.' });
         }
    }
});

// *** MODIFIED SIMFIN HISTORICALS ROUTE (Uses Weighted Shares + 10yr CAGR + Separated Logic) ***
app.get('/api/stock/historicals/:ticker', async (req, res) => {
    const { ticker } = req.params;

    // API Key Check
    if (!SIMFIN_API_KEY || SIMFIN_API_KEY.includes("YOUR_API_KEY") || (SIMFIN_API_KEY === "2a8d888b-daef-49fd-9736-b80328a9ea23" && process.env.NODE_ENV === 'production' && !process.env.SIMFIN_API_KEY)) {
        console.warn("SimFin API key not set via environment variable or is using default key in production.");
        return res.status(500).json({ success: false, message: "Server not properly configured for SimFin historical data." });
    }

    const isNumber = (val) => typeof val === 'number' && !isNaN(val);

    // *** MODIFIED: Added 'bs' (Balance Sheet) to statements ***
    const statementsUrl = `${SIMFIN_BASE_URL}/statements/compact?ticker=${ticker}&statements=pl,cf,bs&period=fy`;
    const sharesUrl = `${SIMFIN_BASE_URL}/weighted-shares-outstanding?ticker=${ticker}&period=fy`; // Use WEIGHTED shares endpoint

    // --- Default Averages (Add 10yr Growth Key) ---
    let historicalAverages = {
        avgNetIncome5Yr: "N/A", avgProfitMargin5Yr: "N/A", avgFCF5Yr: "N/A",
        avgEps5Yr: "N/A", avgCashFlowPerShare5Yr: "N/A", avgRevenuePerShare5Yr: "N/A",
        compoundRevenueGrowth3Yr: "N/A", compoundRevenueGrowth5Yr: "N/A",
        compoundRevenueGrowth10Yr: "N/A", // <-- Added Key
        compoundShareGrowth5Yr: "N/A", // *** NEWLY ADDED KEY ***
        netAssets: "N/A", // *** NEW: Add Net Assets default ***
    };
    const options = { method: 'GET', headers: { 'accept': 'application/json', 'Authorization': `api-key ${SIMFIN_API_KEY}` } };

    try {
        console.log(`Fetching PL/CF/BS statements for ${ticker} from SimFin...`);
        console.log(`Fetching Weighted Shares Outstanding for ${ticker} from SimFin...`);

        // Make API calls concurrently
        const [statementsResponse, sharesResponse] = await Promise.all([
            axios.get(statementsUrl, options),
            axios.get(sharesUrl, options)
        ]);

        // Process Statements Response (PL, CF)
        const statementsResult = statementsResponse.data;
        if (!statementsResult || statementsResult.length === 0 || !statementsResult[0].statements) { console.warn(`No PL/CF/BS statement data found for ${ticker}.`); return res.json({ success: true, data: historicalAverages }); }
        const companyData = statementsResult[0];
        const plDefinition = companyData.statements.find(s => s.statement === 'PL');
        const cfDefinition = companyData.statements.find(s => s.statement === 'CF');
        // *** MODIFIED: Add 'bs' (Balance Sheet) definition ***
        const bsDefinition = companyData.statements.find(s => s.statement === 'BS');

        // *** MODIFIED: Check for 'bs' as well ***
        if (!plDefinition || !cfDefinition || !bsDefinition) { console.warn(`Could not find PL, CF, or BS statements for ${ticker}.`); return res.json({ success: true, data: historicalAverages }); }

        // Find PL and CF column indices
        const plColumns = plDefinition.columns; const cfColumns = cfDefinition.columns; let missingColumn = null;
        const revenueIndex = plColumns.indexOf("Revenue"); if (revenueIndex === -1) missingColumn = "Revenue (PL)";
        const netIncomeIndex = plColumns.indexOf("Net Income"); if (netIncomeIndex === -1 && !missingColumn) missingColumn = "Net Income (PL)";
        let opCashFlowIndex = cfColumns.indexOf("Cash from Operating Activities"); if (opCashFlowIndex === -1) opCashFlowIndex = cfColumns.indexOf("Net Cash from Operating Activities"); if (opCashFlowIndex === -1 && !missingColumn) missingColumn = "Operating Cash Flow (CF)";
        let capExIndex = cfColumns.indexOf("Acquisition of Fixed Assets & Intangibles"); if (capExIndex === -1) capExIndex = cfColumns.indexOf("Capital Expenditures"); if (capExIndex === -1 && !missingColumn) missingColumn = "Capital Expenditures (CF)";

        // *** NEW: Balance Sheet Indices for Net Assets ***
        const bsColumns = bsDefinition.columns;
        const totalAssetsIndex = bsColumns.indexOf("Total Assets");
        const totalLiabilitiesIndex = bsColumns.indexOf("Total Liabilities");


        // Process Weighted Shares Response
        const sharesResult = sharesResponse.data;
        const sharesMap = new Map();
        if (Array.isArray(sharesResult)) { sharesResult.forEach(item => { if (item.fyear && item.period === 'FY' && isNumber(item.diluted)) { sharesMap.set(item.fyear, item.diluted); } }); }
        else { console.warn(`No Weighted Shares array found for ${ticker}.`); }
        console.log(`Weighted Shares map created for ${ticker} with ${sharesMap.size} FY entries.`);

        // Combine and Calculate
        const plDataRows = plDefinition.data.filter(row => row[0] === 'FY'); const cfDataRows = cfDefinition.data.filter(row => row[0] === 'FY');
        // *** MODIFIED: Get 'bs' (Balance Sheet) data rows ***
        const bsDataRows = bsDefinition.data.filter(row => row[0] === 'FY');

        const yearIndexPL = plColumns.indexOf("Fiscal Year"); const yearIndexCF = cfColumns.indexOf("Fiscal Year");
        if (yearIndexPL === -1 || yearIndexCF === -1) { console.error(`Missing 'Fiscal Year' column in PL/CF for ${ticker}.`); return res.json({ success: true, data: historicalAverages }); }

        // Fetch up to 10 years for CAGR calculation
        const yearsToFetch = 10;
        const plRecentRowsRaw = plDataRows.slice(-yearsToFetch); // Get last 10 years of PL
        const cfRecentRowsRaw = cfDataRows.slice(-yearsToFetch); // Get last 10 years of CF
        // *** NEW: Get only the most recent BS row for Net Assets ***
        const latestBsRow = bsDataRows.length > 0 ? bsDataRows[bsDataRows.length - 1] : null;


        const plYears = new Set(plRecentRowsRaw.map(row => row[yearIndexPL])); const cfYears = new Set(cfRecentRowsRaw.map(row => row[yearIndexCF]));
        const commonYears = [...plYears].filter(year => cfYears.has(year)).sort((a,b) => a-b); // All common years found (max 10)

        // Create a specific list for 5-year averages
        const recentCommonYearsForAvg = commonYears.slice(-5); // Last 5

        if (recentCommonYearsForAvg.length === 0) { console.warn(`No common FY years found for ${ticker}.`); return res.json({ success: true, data: historicalAverages }); }
        console.log(`Processing ${recentCommonYearsForAvg.length} common years for averages: ${recentCommonYearsForAvg.join(', ')}`);
        console.log(`Found ${commonYears.length} total common years for CAGR: ${commonYears.join(', ')}`);

        // Calculation Loop
        // *** NEW: Separated counters and sums ***
        let sumNetIncome = 0, sumProfitMargin = 0, sumFCF = 0, sumEPS = 0, sumRevPerShare = 0, sumCFPerShare = 0;
        let countNetIncome = 0, countProfitMargin = 0, countFCF = 0, countEPS = 0, countRevPerShare = 0, countCFPerShare = 0;
        let revenueData = []; // This will hold ALL (up to 10) revenue points

        // First loop: populate revenueData from ALL common years
        for (const year of commonYears) { // Loop through up to 10 years
            const plRow = plRecentRowsRaw.find(row => row[yearIndexPL] === year);

            // **FIX 1a: Check for plRow, not plRow[2]**
            if (plRow) {
                // **FIX 1b: Use plRow, not plRow[2]**
                const plRowData = plRow;
                // **FIX 2a: Parse data to a number**
                const revenue = plRowData.length > revenueIndex ? parseFloat(plRowData[revenueIndex]) : null;

                if (isNumber(revenue)) {
                    revenueData.push({ year: year, value: revenue });
                }
            }
        }
        revenueData.sort((a, b) => a.year - b.year); // Ensure sorted oldest to newest for CAGR calculation

        // Second loop: calculate 5-year averages using only the last 5 years
        for (const year of recentCommonYearsForAvg) { // Loop through only last 5
            const plRow = plRecentRowsRaw.find(row => row[yearIndexPL] === year);
            const cfRow = cfRecentRowsRaw.find(row => row[yearIndexCF] === year);

            // **FIX 1c: Check for plRow/cfRow, not plRow[2]/cfRow[2]**
            if (!plRow || !cfRow) continue;

            // **FIX 1d: Use plRow/cfRow, not plRow[2]/cfRow[2]**
            const plRowData = plRow; const cfRowData = cfRow;

            // Extract all potential data points
            // **FIX 2b: Parse all data to numbers**
            const netIncome = plRowData.length > netIncomeIndex ? parseFloat(plRowData[netIncomeIndex]) : null;
            const revenue = plRowData.length > revenueIndex ? parseFloat(plRowData[revenueIndex]) : null;
            const opCashFlow = cfRowData.length > opCashFlowIndex ? parseFloat(cfRowData[opCashFlowIndex]) : null;
            const capEx = cfRowData.length > capExIndex ? parseFloat(cfRowData[capExIndex]) : 0; // Default CapEx to 0
            const shares = sharesMap.get(year); // Get weighted diluted shares

            // *** DEBUG LOGGING ***
            console.log(`--- Processing Year ${year} for ${ticker} (Avg Loop) ---`);
            console.log(`Revenue: ${revenue} (Type: ${typeof revenue}), isNumber: ${isNumber(revenue)}`);
            console.log(`Net Income: ${netIncome} (Type: ${typeof netIncome}), isNumber: ${isNumber(netIncome)}`);
            console.log(`Op. Cash Flow: ${opCashFlow} (Type: ${typeof opCashFlow}), isNumber: ${isNumber(opCashFlow)}`);
            console.log(`Shares: ${shares} (Type: ${typeof shares}), isNumber: ${isNumber(shares)}`);
            // *** END DEBUG LOGGING ***

            // --- *** NEW: SEPARATED CALCULATIONS *** ---

            // Calculate Net Income & Profit Margin
            if (isNumber(netIncome) && isNumber(revenue) && revenue !== 0) {
                console.log(`Year ${year}: Valid for NetIncome/ProfitMargin`);
                sumNetIncome += netIncome;
                sumProfitMargin += (netIncome / revenue);
                countNetIncome++;
                countProfitMargin++;
            }

            // Calculate FCF
            if (isNumber(opCashFlow)) {
                console.log(`Year ${year}: Valid for FCF`);
                const validCapEx = isNumber(capEx) ? capEx : 0;
                const fcf = opCashFlow + validCapEx; // Note: CapEx is often negative
                sumFCF += fcf;
                countFCF++;
            }

            // Calculate Per-Share Metrics (only if shares are valid)
            if (isNumber(shares) && shares !== 0) {
                if (isNumber(netIncome)) {
                    console.log(`Year ${year}: Valid for EPS`);
                    sumEPS += (netIncome / shares);
                    countEPS++;
                }
                if (isNumber(revenue)) {
                    console.log(`Year ${year}: Valid for RevPerShare`);
                    sumRevPerShare += (revenue / shares);
                    countRevPerShare++;
                }
                // Check for FCF per share
                if (isNumber(opCashFlow)) {
                    console.log(`Year ${year}: Valid for CFPerShare`);
                    const validCapEx = isNumber(capEx) ? capEx : 0;
                    const fcf = opCashFlow + validCapEx;
                    sumCFPerShare += (fcf / shares);
                    countCFPerShare++;
                }
            } else if (isNumber(netIncome) || isNumber(revenue) || isNumber(opCashFlow)) {
                // Only warn if we had other data but were missing shares
                console.warn(`Weighted shares missing/invalid for ${ticker}, year ${year}. Per-share metrics will be N/A for this year.`);
            }
            // --- *** END SEPARATED CALCULATIONS *** ---

        } // End 5-year average loop

        // Calculate Averages based on new counts
        if (countNetIncome > 0) {
            historicalAverages.avgNetIncome5Yr = ((sumNetIncome / countNetIncome) / 1e9).toFixed(2) + "B";
        }
        if (countProfitMargin > 0) {
            historicalAverages.avgProfitMargin5Yr = `${((sumProfitMargin / countProfitMargin) * 100).toFixed(2)}%`;
        }
        if (countFCF > 0) {
            historicalAverages.avgFCF5Yr = ((sumFCF / countFCF) / 1e9).toFixed(2) + "B";
        }
        if (countEPS > 0) {
            historicalAverages.avgEps5Yr = `$${(sumEPS / countEPS).toFixed(2)}`;
        }
        if (countRevPerShare > 0) {
            historicalAverages.avgRevenuePerShare5Yr = `$${(sumRevPerShare / countRevPerShare).toFixed(2)}`;
        }
        if (countCFPerShare > 0) {
            historicalAverages.avgCashFlowPerShare5Yr = `$${(sumCFPerShare / countCFPerShare).toFixed(2)}`;
        }


        // Calculate CAGR (using the revenueData array built from up to 10 years)
        const numRevenueYears = revenueData.length;
        if (numRevenueYears >= 3) { // 3 years needed for 3yr CAGR (2 periods)
            const revenueNow = revenueData[numRevenueYears - 1].value;
            const revenue3yrAgo = revenueData[numRevenueYears - 3].value;
            if (isNumber(revenueNow) && isNumber(revenue3yrAgo) && revenue3yrAgo > 0) {
                const cagr3 = (Math.pow(revenueNow / revenue3yrAgo, 1 / 2) - 1) * 100;
                if (!isNaN(cagr3)) historicalAverages.compoundRevenueGrowth3Yr = `${cagr3.toFixed(2)}%`;
            }
        }
        if (numRevenueYears >= 5) { // 5 years needed for 5yr CAGR (4 periods)
            const revenueNow = revenueData[numRevenueYears - 1].value;
            const revenue5yrAgo = revenueData[numRevenueYears - 5].value;
            if (isNumber(revenueNow) && isNumber(revenue5yrAgo) && revenue5yrAgo > 0) {
                const cagr5 = (Math.pow(revenueNow / revenue5yrAgo, 1 / 4) - 1) * 100;
                if (!isNaN(cagr5)) historicalAverages.compoundRevenueGrowth5Yr = `${cagr5.toFixed(2)}%`;
            }
        }
        // *** ADD 10 YEAR CAGR CALCULATION ***
        if (numRevenueYears >= 10) { // Need 10 years of data for 10yr CAGR (9 periods)
            const revenueNow = revenueData[numRevenueYears - 1].value;       // Most recent year's revenue
            const revenue10yrAgo = revenueData[numRevenueYears - 10].value; // 10th year's revenue
            if (isNumber(revenueNow) && isNumber(revenue10yrAgo) && revenue10yrAgo > 0) {
                const cagr10 = (Math.pow(revenueNow / revenue10yrAgo, 1 / 9) - 1) * 100; // 9 periods (10 data points)
                 if (!isNaN(cagr10)) historicalAverages.compoundRevenueGrowth10Yr = `${cagr10.toFixed(2)}%`;
            } else { console.warn(`Could not calculate 10yr CAGR for ${ticker}, insufficient valid revenue data points.`); }
        } else { console.log(`Insufficient revenue history (${numRevenueYears} years) to calculate 10yr CAGR for ${ticker}.`); }
        // *** END 10 YEAR CAGR CALCULATION ***

        // *** ADD 5 YEAR SHARE GROWTH CALCULATION ***
        const sortedShareYears = [...sharesMap.keys()].sort((a, b) => a - b);
        const numShareYears = sortedShareYears.length;
        if (numShareYears >= 5) { // Need 5 years of data for 5yr CAGR (4 periods)
            const sharesNow = sharesMap.get(sortedShareYears[numShareYears - 1]);
            const shares5yrAgo = sharesMap.get(sortedShareYears[numShareYears - 5]);
            if (isNumber(sharesNow) && isNumber(shares5yrAgo) && shares5yrAgo > 0) {
                const cagr5Share = (Math.pow(sharesNow / shares5yrAgo, 1 / 4) - 1) * 100; // 4 periods
                if (!isNaN(cagr5Share)) historicalAverages.compoundShareGrowth5Yr = `${cagr5Share.toFixed(2)}%`;
            } else { console.warn(`Could not calculate 5yr Share CAGR for ${ticker}, insufficient valid share data points.`); }
        } else { console.log(`Insufficient share history (${numShareYears} years) to calculate 5yr Share CAGR for ${ticker}.`); }
        // *** END 5 YEAR SHARE GROWTH CALCULATION ***

        console.log("Calculated SimFin averages (using weighted shares) for", ticker, ":", historicalAverages);
        res.json({ success: true, data: historicalAverages });

    } catch (err) {
        // Combined Error Handling
        let errorMessage = `Server error fetching SimFin data for ${ticker}.`; let statusCode = 500;
        if (axios.isAxiosError(err)) { if (err.response) { console.error(`SimFin API Error: Status ${err.response.status}`, err.response.data); statusCode = err.response.status; const errorDetail = err.response.data?.message || err.response.statusText || 'Unknown API error'; if (statusCode === 401) errorMessage = "Invalid SimFin API Key."; else if (statusCode === 404) { console.warn(`SimFin data not found (404) for ${ticker}.`); return res.json({ success: true, data: historicalAverages }); } else errorMessage = `Error from SimFin API: ${errorDetail} (Status ${statusCode})`; } else if (err.request) { console.error('SimFin Request Error (No Response):', err.request); errorMessage = "No response from SimFin API."; statusCode = 504; } else { console.error('SimFin Axios Setup Error:', err.message); errorMessage = `Error setting up request to SimFin: ${err.message}`; } } else { console.error("SimFin Data Processing Error:", err.message, err.stack); errorMessage = `Internal error processing SimFin data: ${err.message}`; }
        res.status(statusCode).json({ success: false, message: errorMessage });
    }
});
// *** END CORRECTED STOCK DASHBOARD-- SIMFIN ROUTE ***

// *** NEW DEDICATED ROUTE FOR STOCK VALUATION PAGE *** SIMFIN--
app.get('/api/stock/valuation/:ticker', async (req, res) => {
    const { ticker } = req.params;

    if (!SIMFIN_API_KEY) {
        return res.status(500).json({ success: false, message: "Server not configured for SimFin historical data." });
    }

    const isNumber = (val) => typeof val === 'number' && !isNaN(val);

    // Fetch PL, CF, and BS to get all required metrics
    const statementsUrl = `${SIMFIN_BASE_URL}/statements/compact?ticker=${ticker}&statements=pl,cf,bs&period=fy`;
    const sharesUrl = `${SIMFIN_BASE_URL}/weighted-shares-outstanding?ticker=${ticker}&period=fy`;

    let valuationMetrics = {
        avgProfitMargin3Yr: "N/A",
        avgProfitMargin5Yr: "N/A",
        avgEps3Yr: "N/A",           // <-- NEW: 3Y Avg EPS
        avgEps5Yr: "N/A",           // 5Y Avg EPS used for P/E calculation
        avgROIC3Yr: "N/A",
        avgROIC5Yr: "N/A",
        compoundRevenueGrowth3Yr: "N/A",
        compoundRevenueGrowth5Yr: "N/A",
        compoundEarningGrowth3Yr: "N/A",
        compoundEarningGrowth5Yr: "N/A",
    };

    const options = { method: 'GET', headers: { 'accept': 'application/json', 'Authorization': `api-key ${SIMFIN_API_KEY}` } };

    try {
        const [statementsResponse, sharesResponse] = await Promise.all([
            axios.get(statementsUrl, options),
            axios.get(sharesUrl, options)
        ]);

        const statementsResult = statementsResponse.data;
        if (!statementsResult || statementsResult.length === 0 || !statementsResult[0].statements) { return res.json({ success: true, data: valuationMetrics }); }
        const companyData = statementsResult[0];
        const plDefinition = companyData.statements.find(s => s.statement === 'PL');
        const cfDefinition = companyData.statements.find(s => s.statement === 'CF');
        const bsDefinition = companyData.statements.find(s => s.statement === 'BS');

        if (!plDefinition || !cfDefinition) { return res.json({ success: true, data: valuationMetrics }); }

        // Find necessary column indices
        const plColumns = plDefinition.columns; const cfColumns = cfDefinition.columns;
        const revenueIndex = plColumns.indexOf("Revenue");
        const netIncomeIndex = plColumns.indexOf("Net Income");
        const opCashFlowIndex = cfColumns.indexOf("Cash from Operating Activities");
        const capExIndex = cfColumns.indexOf("Acquisition of Fixed Assets & Intangibles");
        const interestExpenseIndex = plColumns.indexOf("Interest Expense");

        // ROIC specific indices (may be missing data)
        const bsColumns = bsDefinition?.columns || [];
        let equityIndex = bsColumns.indexOf("Total Equity");
        const totalDebtIndex = bsColumns.indexOf("Total Debt");

        // Final check on required indices
        if (revenueIndex === -1 || netIncomeIndex === -1 || opCashFlowIndex === -1 || capExIndex === -1 || interestExpenseIndex === -1) {
            console.warn(`Critical SimFin columns missing for ${ticker}.`);
            return res.json({ success: true, data: valuationMetrics });
        }

        const sharesMap = new Map();
        if (Array.isArray(sharesResponse.data)) { sharesResponse.data.forEach(item => { if (item.fyear && item.period === 'FY' && isNumber(item.diluted)) { sharesMap.set(item.fyear, item.diluted); } }); }

        const plDataRows = plDefinition.data.filter(row => row[0] === 'FY');
        const cfDataRows = cfDefinition.data.filter(row => row[0] === 'FY');
        const bsDataRows = bsDefinition?.data?.filter(row => row[0] === 'FY') || [];

        const yearIndexPL = plColumns.indexOf("Fiscal Year");

        // Find all years with PL and CF data
        const commonYearsForGrowth = [...new Set(plDataRows.map(row => row[yearIndexPL]))]
                                .filter(year => cfDataRows.some(row => row[plColumns.indexOf("Fiscal Year")] === year))
                                .sort((a,b) => a-b);

        const recentCommonYearsForAvg5Y = commonYearsForGrowth.slice(-5);
        const recentCommonYearsForAvg3Y = commonYearsForGrowth.slice(-3); // <-- 3-YEAR PERIODS

        if (recentCommonYearsForAvg5Y.length === 0) { return res.json({ success: true, data: valuationMetrics }); }

        // --- Data storage arrays ---
        let revenueData = [];
        let earningsData = [];
        let profitMarginData3Y = [];
        let profitMarginData5Y = [];
        let epsData3Y = [];          // <-- ADDED for 3Y P/E fix
        let epsData5Y = [];
        let roicData3Y = [];
        let roicData5Y = [];

        // --- Loop for Data Extraction & Calculation ---
        for (const year of commonYearsForGrowth) {
            const plRow = plDataRows.find(row => row[yearIndexPL] === year);
            const cfRow = cfDataRows.find(row => row[yearIndexPL] === year);
            const bsRow = bsDataRows.find(row => row[plColumns.indexOf("Fiscal Year")] === year); // May be null

            if (!plRow || !cfRow) continue;

            // Extract Raw Values
            const netIncome = parseFloat(plRow[netIncomeIndex]);
            const revenue = parseFloat(plRow[revenueIndex]);
            const shares = sharesMap.get(year);
            const interestExpense = parseFloat(plRow[interestExpenseIndex]) || 0;

            // Populate data arrays for all years (for CAGR)
            if (isNumber(revenue)) revenueData.push({ year, value: revenue });
            if (isNumber(netIncome)) earningsData.push({ year, value: netIncome });

            const netMargin = (isNumber(netIncome) && isNumber(revenue) && revenue !== 0) ? (netIncome / revenue) : null;
            const eps = (isNumber(shares) && shares !== 0 && isNumber(netIncome)) ? (netIncome / shares) : null;

            // ROIC required inputs
            const totalEquity = (bsRow && equityIndex !== -1) ? parseFloat(bsRow[equityIndex]) : null;
            const totalDebt = (bsRow && totalDebtIndex !== -1) ? parseFloat(bsRow[totalDebtIndex]) : null;

            // --- Populate 5Y AVERAGE data arrays ---
            if (recentCommonYearsForAvg5Y.includes(year)) {
                if (netMargin !== null) profitMarginData5Y.push({ year, value: netMargin });
                if (eps !== null) epsData5Y.push({ year, value: eps });

                // ROIC 5Y
                if (bsRow && isNumber(netIncome) && isNumber(interestExpense) && isNumber(totalDebt) && isNumber(totalEquity)) {
                    const nopat = netIncome + interestExpense;
                    const investedCapital = totalDebt + totalEquity;
                    if (investedCapital !== 0) roicData5Y.push({ year, value: (nopat / investedCapital) });
                }
            }

            // --- Populate 3Y AVERAGE data arrays ---
            if (recentCommonYearsForAvg3Y.includes(year)) {
                if (netMargin !== null) profitMarginData3Y.push({ year, value: netMargin });
                if (eps !== null) epsData3Y.push({ year, value: eps }); // <-- ADDED: 3Y Avg EPS Data

                // ROIC 3Y
                if (bsRow && isNumber(netIncome) && isNumber(interestExpense) && isNumber(totalDebt) && isNumber(totalEquity)) {
                    const nopat = netIncome + interestExpense;
                    const investedCapital = totalDebt + totalEquity;
                    if (investedCapital !== 0) roicData3Y.push({ year, value: (nopat / investedCapital) });
                }
            }
        }

        // --- Helper functions (Unchanged) ---
        const getAverage = (dataArray) => {
            if (!dataArray || dataArray.length === 0) return null;
            const sum = dataArray.reduce((acc, item) => acc + item.value, 0);
            return sum / dataArray.length;
        };
        const getCAGR = (dataArray, periods) => {
            if (!dataArray || dataArray.length < periods + 1) return null;
            const startValue = dataArray[dataArray.length - periods - 1].value;
            const endValue = dataArray[dataArray.length - 1].value;
            if (isNumber(startValue) && isNumber(endValue) && startValue !== 0) {
                const ratio = endValue / startValue;
                const cagr = (Math.pow(ratio, 1 / periods) - 1);
                return isNaN(cagr) ? null : cagr;
            }
            return null;
        };

        // --- Calculate Final Metrics ---
        // MARGINS
        const avgProfitMargin3Y = getAverage(profitMarginData3Y);
        const avgProfitMargin5Y = getAverage(profitMarginData5Y);
        // ROIC
        const avgROIC3Y = getAverage(roicData3Y);
        const avgROIC5Y = getAverage(roicData5Y);
        // EPS (NEW: Calculate 3Y Avg EPS)
        const avgEps3Y = getAverage(epsData3Y);
        const avgEps5Y = getAverage(epsData5Y);
        // GROWTH
        const cagrRev3Y = getCAGR(revenueData, 2);
        const cagrRev5Y = getCAGR(revenueData, 4);
        const cagrEarn3Y = getCAGR(earningsData, 2);
        const cagrEarn5Y = getCAGR(earningsData, 4);

        // --- Populate final object ---
        if (isNumber(avgProfitMargin3Y)) valuationMetrics.avgProfitMargin3Yr = `${(avgProfitMargin3Y * 100).toFixed(2)}%`;
        if (isNumber(avgProfitMargin5Y)) valuationMetrics.avgProfitMargin5Yr = `${(avgProfitMargin5Y * 100).toFixed(2)}%`;

        if (isNumber(avgROIC3Y)) valuationMetrics.avgROIC3Yr = `${(avgROIC3Y * 100).toFixed(2)}%`;
        if (isNumber(avgROIC5Y)) valuationMetrics.avgROIC5Yr = `${(avgROIC5Y * 100).toFixed(2)}%`;

        if (isNumber(avgEps3Y)) valuationMetrics.avgEps3Yr = `$${avgEps3Y.toFixed(2)}`; // <-- ADDED 3Y EPS
        if (isNumber(avgEps5Y)) valuationMetrics.avgEps5Yr = `$${avgEps5Y.toFixed(2)}`;

        if (isNumber(cagrRev3Y)) valuationMetrics.compoundRevenueGrowth3Yr = `${(cagrRev3Y * 100).toFixed(2)}%`;
        if (isNumber(cagrRev5Y)) valuationMetrics.compoundRevenueGrowth5Yr = `${(cagrRev5Y * 100).toFixed(2)}%`;
        if (isNumber(cagrEarn3Y)) valuationMetrics.compoundEarningGrowth3Yr = `${(cagrEarn3Y * 100).toFixed(2)}%`;
        if (isNumber(cagrEarn5Y)) valuationMetrics.compoundEarningGrowth5Yr = `${(cagrEarn5Y * 100).toFixed(2)}%`;

        console.log("Calculated SimFin metrics for valuation page:", valuationMetrics);

        res.json({ success: true, data: valuationMetrics });

    } catch (err) {
        // ... (Keep the detailed error logging section exactly as it was) ...
        let errorMessage = `Server error fetching SimFin data for ${ticker}.`; let statusCode = 500;
        if (axios.isAxiosError(err)) { if (err.response) statusCode = err.response.status; else if (err.request) statusCode = 504; }
        res.status(statusCode).json({ success: false, message: errorMessage });
    }
});
// --- END NEW DEDICATED ROUTE --- STOCK VALUATION SIMFIN--

// ===================================================================
// 7b. STOCK dashboard - YAHU PROXY ROUTE (WITH LOGGING) <--- MODIFIED SECTION
// ===================================================================

/**
 * @route   GET /api/stock-snapshot/:ticker
 * @desc    Proxies the Yahu RapidAPI call to get snapshot data.
 * @desc    Builds a data structure matching stock_dashboard.js expectations.
 * @access  Public (proxied)
 */
app.get('/api/stock-snapshot/:ticker', async (req, res) => {
    const { ticker } = req.params;
    console.log(`[${new Date().toISOString()}] Received request for /api/stock-snapshot/${ticker}`);

    const apiKeyToUse = YAHU_RAPIDAPI_KEY;
    if (!apiKeyToUse) {
        console.error(`[${new Date().toISOString()}] FATAL: YAHU_RAPIDAPI_KEY is missing or undefined in the environment! Check Coolify env vars.`);
        return res.status(500).json({ success: false, message: "Server configuration error: API key missing." });
    }
    console.log(`[${new Date().toISOString()}] Using Yahu API Key ending in: ...${apiKeyToUse.slice(-6)}`);

    // Request more modules to get all needed data
    const modules = 'price,summaryProfile,defaultKeyStatistics,financialData,summaryDetail'; // Added summaryDetail
    const url = `https://${YAHU_RAPIDAPI_HOST}/stock/get-fundamentals`;
    const options = {
        method: 'GET',
        url: url,
        params: { symbol: ticker, modules: modules, region: 'US', lang: 'en-US' },
        headers: {
            'x-rapidapi-key': apiKeyToUse,
            'x-rapidapi-host': YAHU_RAPIDAPI_HOST,
            'User-Agent': 'TMT-Server/1.0'
        }
    };

    try {
        console.log(`[${new Date().toISOString()}] Attempting Yahu API call for ${ticker}...`);
        const response = await axios.request(options);
        console.log(`[${new Date().toISOString()}] Yahu API call successful for ${ticker}. Status: ${response.status}`);
        const quote = response.data?.quoteSummary?.result?.[0];
        console.log(`[${new Date().toISOString()}] RAW Yahu quote data received for ${ticker}:`, JSON.stringify(quote, null, 2));

        if (!quote) {
            console.warn(`[${new Date().toISOString()}] No Yahu quoteSummary data found for ${ticker} in the response.`);
            throw new Error(`No Yahu snapshot data found for ${ticker}`);
        }

        // --- Build the FLAT data structure expected by stock_dashboard.js ---
        const data = {}; // Start with an empty object

        // From quote.price
        data.companyName = quote.price?.longName || quote.price?.shortName || "N/A";
        data.currentPrice = quote.price?.regularMarketPrice?.raw?.toFixed(2) ?? "N/A";
        data.priceChange = quote.price?.regularMarketChange?.raw?.toFixed(2) ?? "N/A";
        data.changePercent = quote.price?.regularMarketChangePercent?.raw ? `${(quote.price.regularMarketChangePercent.raw * 100).toFixed(2)}%` : "N/A";
        const rawMarketCap = quote.price?.marketCap?.raw ?? null;
        data.marketCap = rawMarketCap ? (rawMarketCap / 1e9).toFixed(2) + "B" : "N/A"; // Matches dashboard

        // Change Class/Icon
        const priceChangeValue = parseFloat(data.priceChange);
        data.changeClass = 'text-gray-400'; data.changeIcon = '▬';
        if (!isNaN(priceChangeValue)) {
            if (priceChangeValue > 0) { data.changeClass = 'text-tmt-green'; data.changeIcon = '▲'; }
            else if (priceChangeValue < 0) { data.changeClass = 'text-tmt-red'; data.changeIcon = '▼'; }
        }

        // From quote.summaryProfile
        data.summary = quote.summaryProfile?.longBusinessSummary || "No summary available."; // Matches dashboard

        // From quote.defaultKeyStatistics
        const rawShares = quote.defaultKeyStatistics?.sharesOutstanding?.raw ?? null;
        data.peRatio = quote.defaultKeyStatistics?.trailingPE?.raw?.toFixed(2) ?? "N/A"; // Use trailingPE for TTM P/E
        data.epsTTM = quote.defaultKeyStatistics?.trailingEps?.raw ? `$${quote.defaultKeyStatistics.trailingEps.raw.toFixed(2)}` : "N/A"; // Matches dashboard
        data.profitMarginTTM = quote.defaultKeyStatistics?.profitMargins?.raw ? `${(quote.defaultKeyStatistics.profitMargins.raw * 100).toFixed(2)}%` : "N/A"; // Matches dashboard
        data.enterpriseValueTraditional = quote.defaultKeyStatistics?.enterpriseValue?.raw ? (quote.defaultKeyStatistics.enterpriseValue.raw / 1e9).toFixed(2) + "B" : "N/A"; // Matches dashboard
        data.dividendsPaid = quote.defaultKeyStatistics?.lastDividendValue?.raw ? `$${quote.defaultKeyStatistics.lastDividendValue.raw.toFixed(3)}` : "N/A"; // Matches dashboard
        data.priceToSales = quote.defaultKeyStatistics?.priceToSalesTrailing12Months?.raw?.toFixed(2) ?? "N/A"; // Matches dashboard
        const rawNetIncome = quote.defaultKeyStatistics?.netIncomeToCommon?.raw ?? null;
        data.netIncomeTTM = rawNetIncome ? (rawNetIncome / 1e9).toFixed(2) + "B" : "N/A"; // Matches dashboard

        // From quote.financialData
        const rawRevenue = quote.financialData?.totalRevenue?.raw ?? null;
        data.revenueTTM = rawRevenue ? (rawRevenue / 1e9).toFixed(2) + "B" : "N/A"; // Matches dashboard
        const rawFCF = quote.financialData?.freeCashflow?.raw ?? null;
        data.freeCashFlowTTM = rawFCF ? (rawFCF / 1e9).toFixed(2) + "B" : "N/A"; // Matches dashboard
        data.revenuePerShare = quote.financialData?.revenuePerShare?.raw ? `$${quote.financialData.revenuePerShare.raw.toFixed(2)}` : "N/A"; // Matches dashboard
        // Use ROE as proxy for ROIC
        data.returnOnInvestedCapitalTTM = quote.financialData?.returnOnEquity?.raw ? `${(quote.financialData.returnOnEquity.raw * 100).toFixed(2)}%` : "N/A"; // Matches dashboard
        data.grossProfitMarginTTM = quote.financialData?.grossMargins?.raw ? `${(quote.financialData.grossMargins.raw * 100).toFixed(2)}%` : "N/A"; // Matches dashboard
        // Override profit margin if financialData has a value and key stats didn't
        if (data.profitMarginTTM === "N/A" && quote.financialData?.profitMargins?.raw) {
            data.profitMarginTTM = `${(quote.financialData.profitMargins.raw * 100).toFixed(2)}%`;
        }

        // From quote.summaryDetail (Added module)
        data.dividendYield = quote.summaryDetail?.dividendYield?.raw ? `${(quote.summaryDetail.dividendYield.raw * 100).toFixed(2)}%` : "N/A"; // Matches dashboard
        data.fiftyTwoWeekHigh = quote.summaryDetail?.fiftyTwoWeekHigh?.raw ? `$${quote.summaryDetail.fiftyTwoWeekHigh.raw.toFixed(2)}` : "N/A"; // Matches dashboard
        data.fiftyTwoWeekLow = quote.summaryDetail?.fiftyTwoWeekLow?.raw ? `$${quote.summaryDetail.fiftyTwoWeekLow.raw.toFixed(2)}` : "N/A"; // Matches dashboard
        data.ath = quote.summaryDetail?.allTimeHigh?.raw ? `$${quote.summaryDetail.allTimeHigh.raw.toFixed(2)}` : "N/A";

        // Calculated fields
        // Cash Flow Per Share
        if (rawFCF && rawShares && rawShares !== 0) {
            data.cashFlowPerShare = `$${(rawFCF / rawShares).toFixed(2)}`; // Matches dashboard
        } else {
            data.cashFlowPerShare = "N/A";
        }
        // Price to Free Cash Flow (P/FCF)
        if (rawMarketCap && rawFCF && rawFCF !== 0) {
            data.priceToFCF = (rawMarketCap / rawFCF).toFixed(2); // Matches dashboard
        } else {
            data.priceToFCF = "N/A";
        }

        console.log(`[${new Date().toISOString()}] Successfully processed Yahu data for ${ticker}. Sending FLAT response structure.`); // LOGGING UPDATED
        res.json({ success: true, data: data }); // Send the new FLAT structure

    } catch (err) {
        // ... (Keep the detailed error logging section exactly as it was) ...
        let errorMessage = `Server error fetching Yahu snapshot for ${ticker}.`;
        let statusCode = 500;
        console.error(`[${new Date().toISOString()}] ERROR during Yahu API call for ${ticker}:`, err.message);
        if (axios.isAxiosError(err)) {
            if (err.response) {
                console.error(`[${new Date().toISOString()}] RapidAPI Error Response Status: ${err.response.status}`);
                console.error(`[${new Date().toISOString()}] RapidAPI Error Response Data:`, err.response.data);
                statusCode = err.response.status;
                const errorDetail = err.response.data?.message || err.response.statusText || 'Unknown API error';
                if (statusCode === 401) errorMessage = "Invalid Yahu API Key (check server environment variables).";
                else if (statusCode === 403) errorMessage = "Forbidden - API Key might lack permissions or subscription for this endpoint.";
                else if (statusCode === 404) errorMessage = `Snapshot data not found (404) for ${ticker}.`;
                else if (statusCode === 429) errorMessage = "API Rate Limit Exceeded (Too Many Requests).";
                else errorMessage = `Error from Yahu API: ${errorDetail} (Status ${statusCode})`;
            } else if (err.request) {
                console.error(`[${new Date().toISOString()}] Yahu Snapshot Request Error (No Response): Check network or RapidAPI status.`);
                errorMessage = "No response received from Yahu API.";
                statusCode = 504; // Gateway Timeout
            } else {
                console.error(`[${new Date().toISOString()}] Axios Setup Error:`, err.message);
                errorMessage = `Error setting up request to Yahu: ${err.message}`;
            }
        } else {
            console.error(`[${new Date().toISOString()}] Non-Axios Error processing Yahu data:`, err.stack);
            errorMessage = `Internal server error processing Yahu data: ${err.message}`;
        }
        res.status(statusCode).json({ success: false, message: errorMessage });
    }
});
// --- END NEW ROUTE -- STOCK dashboard - YAHU PROXY ROUTE (WITH LOGGING) ---

//  START YAHU NEW ROUTE -- STOCK DASHBOARD SNAPSHOT --- RAW YAHU ROUTE--

/**
 * @route   GET /api/stock-yahu-snapshot/:ticker
 * @desc    Proxies the Yahu RapidAPI call to get snapshot data, including Net Assets.
 * @desc    Builds a data structure matching stock_dashboard.js expectations.
 * @access  Public (proxied)
 */
app.get('/api/stock-yahu-snapshot/:ticker', async (req, res) => {
    const { ticker } = req.params;
    console.log(`[${new Date().toISOString()}] Received request for /api/stock-yahu-snapshot/${ticker}`);

    const apiKeyToUse = YAHU_RAPIDAPI_KEY;
    if (!apiKeyToUse) {
        console.error(`[${new Date().toISOString()}] FATAL: YAHU_RAPIDAPI_KEY is missing.`);
        return res.status(500).json({ success: false, message: "Server configuration error: API key missing." });
    }
    console.log(`[${new Date().toISOString()}] Using Yahu API Key ending in: ...${apiKeyToUse.slice(-6)}`);

    // --- MODIFICATION: Added 'balanceSheetHistory' ---
    const modules = 'price,summaryProfile,defaultKeyStatistics,financialData,earnings,summaryDetail,calendarEvents,balanceSheetHistory';
    const url = `https://${YAHU_RAPIDAPI_HOST}/stock/get-fundamentals`;
    const options = {
        method: 'GET',
        url: url,
        params: { symbol: ticker, modules: modules, region: 'US', lang: 'en-US' },
        headers: { 'x-rapidapi-key': apiKeyToUse, 'x-rapidapi-host': YAHU_RAPIDAPI_HOST }
    };

    const isNumber = (val) => typeof val === 'number' && !isNaN(val); // Helper

    try {
        const response = await axios.request(options);
        const quote = response.data?.quoteSummary?.result?.[0];

        if (!quote) throw new Error(`No Yahu snapshot data found for ${ticker}`);

        // Extract RAW values for calculation in frontend/backend
        const rawMarketCap = quote.price?.marketCap?.raw ?? null;
        const rawNetIncome = quote.defaultKeyStatistics?.netIncomeToCommon?.raw ?? null;
        const rawShares = quote.defaultKeyStatistics?.sharesOutstanding?.raw ?? null;
        const rawFCF = quote.financialData?.freeCashflow?.raw ?? null;
        const rawRevenue = quote.financialData?.totalRevenue?.raw ?? null;

        // --- Build the FLAT data structure expected by stock_dashboard.js ---
        const data = {};

        // 1. RAW values passed directly (NEEDED FOR P/E TTM CALCULATION IN FRONTEND)
        data.rawMarketCap = rawMarketCap;
        data.rawNetIncome = rawNetIncome;

        // 2. Formatted Values (Matches existing stock_dashboard.js fields)
        data.companyName = quote.price?.longName || quote.price?.shortName || "N/A";
        data.summary = quote.summaryProfile?.longBusinessSummary || "No summary available.";
        data.currentPrice = quote.price?.regularMarketPrice?.raw?.toFixed(2) ?? "N/A";
        data.priceChange = quote.price?.regularMarketChange?.raw?.toFixed(2) ?? "N/A";
        data.changePercent = quote.price?.regularMarketChangePercent?.raw ? `${(quote.price.regularMarketChangePercent.raw * 100).toFixed(2)}%` : "N/A";
        data.marketCap = rawMarketCap ? (rawMarketCap / 1e9).toFixed(2) + "B" : "N/A";
        data.netIncomeTTM = rawNetIncome ? (rawNetIncome / 1e9).toFixed(2) + "B" : "N/A";
        data.revenueTTM = rawRevenue ? (rawRevenue / 1e9).toFixed(2) + "B" : "N/A";
        data.freeCashFlowTTM = rawFCF ? (rawFCF / 1e9).toFixed(2) + "B" : "N/A";
        data.peRatio = quote.defaultKeyStatistics?.trailingPE?.raw?.toFixed(2) ?? "N/A";
        data.epsTTM = quote.defaultKeyStatistics?.trailingEps?.raw ? `$${quote.defaultKeyStatistics.trailingEps.raw.toFixed(2)}` : "N/A";

        // Other Metrics
        data.profitMarginTTM = quote.defaultKeyStatistics?.profitMargins?.raw ? `${(quote.defaultKeyStatistics.profitMargins.raw * 100).toFixed(2)}%` : "N/A";
        let psRatio = quote.defaultKeyStatistics?.priceToSalesTrailing12Months?.raw;
        if (!isNumber(psRatio) && isNumber(rawMarketCap) && isNumber(rawRevenue) && rawRevenue !== 0) {
            psRatio = rawMarketCap / rawRevenue;
        }
        data.priceToSales = isNumber(psRatio) ? psRatio.toFixed(2) : "N/A";
        data.returnOnInvestedCapitalTTM = quote.financialData?.returnOnEquity?.raw ? `${(quote.financialData.returnOnEquity.raw * 100).toFixed(2)}%` : "N/A";
        data.grossProfitMarginTTM = quote.financialData?.grossMargins?.raw ? `${(quote.financialData.grossMargins.raw * 100).toFixed(2)}%` : "N/A";
        data.revenuePerShare = quote.financialData?.revenuePerShare?.raw ? `$${quote.financialData.revenuePerShare.raw.toFixed(2)}` : "N/A";
        data.dividendYield = quote.summaryDetail?.dividendYield?.raw ? `${(quote.summaryDetail.dividendYield.raw * 100).toFixed(2)}%` : "N/A";
        data.dividendsPaid = quote.defaultKeyStatistics?.lastDividendValue?.raw ? `$${quote.defaultKeyStatistics.lastDividendValue.raw.toFixed(3)}` : "N/A";
        data.enterpriseValueTraditional = quote.defaultKeyStatistics?.enterpriseValue?.raw ? (quote.defaultKeyStatistics.enterpriseValue.raw / 1e9).toFixed(2) + "B" : "N/A";
        data.fiftyTwoWeekHigh = quote.summaryDetail?.fiftyTwoWeekHigh?.raw ? `$${quote.summaryDetail.fiftyTwoWeekHigh.raw.toFixed(2)}` : "N/A";
        data.fiftyTwoWeekLow = quote.summaryDetail?.fiftyTwoWeekLow?.raw ? `$${quote.summaryDetail.fiftyTwoWeekLow.raw.toFixed(2)}` : "N/A";
        data.ath = "N/A";

        if (isNumber(rawFCF) && isNumber(rawShares) && rawShares !== 0) data.cashFlowPerShare = `$${(rawFCF / rawShares).toFixed(2)}`;
        else data.cashFlowPerShare = "N/A";
        if (isNumber(rawMarketCap) && isNumber(rawFCF) && rawFCF !== 0) data.priceToFCF = (rawMarketCap / rawFCF).toFixed(2);
        else data.priceToFCF = "N/A";

        // Change Class/Icon logic
        const priceChangeValue = parseFloat(data.priceChange);
        data.changeClass = 'text-gray-400'; data.changeIcon = '▬';
        if (!isNaN(priceChangeValue)) {
            if (priceChangeValue > 0) { data.changeClass = 'text-tmt-green'; data.changeIcon = '▲'; }
            else if (priceChangeValue < 0) { data.changeClass = 'text-tmt-red'; data.changeIcon = '▼'; }
        }

        console.log(`[${new Date().toISOString()}] Successfully processed Yahu data for ${ticker} (including Net Assets). Sending FLAT response.`);
        res.json({ success: true, data: data });

    } catch (err) {
        // ... (Keep the existing detailed error handling block) ...
        let errorMessage = `Server error fetching Yahu snapshot for ${ticker}.`;
        let statusCode = 500;
        console.error(`[${new Date().toISOString()}] ERROR during Yahu API call for ${ticker}:`, err.message);
        if (axios.isAxiosError(err)) {
            if (err.response) {
                console.error(`[${new Date().toISOString()}] RapidAPI Error Response Status: ${err.response.status}`);
                console.error(`[${new Date().toISOString()}] RapidAPI Error Response Data:`, err.response.data);
                statusCode = err.response.status;
                const errorDetail = err.response.data?.message || err.response.statusText || 'Unknown API error';
                if (statusCode === 401) errorMessage = "Invalid Yahu API Key (check server environment variables).";
                else if (statusCode === 403) errorMessage = "Forbidden - API Key might lack permissions or subscription for this endpoint.";
                else if (statusCode === 404) errorMessage = `Snapshot data not found (404) for ${ticker}.`;
                else if (statusCode === 429) errorMessage = "API Rate Limit Exceeded (Too Many Requests).";
                else errorMessage = `Error from Yahu API: ${errorDetail} (Status ${statusCode})`;
            } else if (err.request) {
                console.error(`[${new Date().toISOString()}] Yahu Snapshot Request Error (No Response): Check network or RapidAPI status.`);
                errorMessage = "No response received from Yahu API.";
                statusCode = 504; // Gateway Timeout
            } else {
                console.error(`[${new Date().toISOString()}] Axios Setup Error:`, err.message);
                errorMessage = `Error setting up request to Yahu: ${err.message}`;
            }
        } else {
            console.error(`[${new Date().toISOString()}] Non-Axios Error processing Yahu data:`, err.stack);
            errorMessage = `Internal server error processing Yahu data: ${err.message}`;
        }
        res.status(statusCode).json({ success: false, message: errorMessage });
    }
});
// --- END YAHU NEW ROUTE -- STOCK DASHBOARD SNAPSHOT --- RAW YAHU ROUTE--


// ===================================================================
// 7c. STOCK VALUATION - YAHU PROXY ROUTE (NESTED STRUCTURE) <--- NEW ROUTE
// ===================================================================

/**
 * @route   GET /api/stock-valuation-snapshot/:ticker
 * @desc    Proxies Yahu API, calculates TTM YoY Growth using SimFin data.
 * @desc    RETURNS NESTED STRUCTURE matching stock_valuation.js expectations.
 * @access  Public (proxied)
 */
app.get('/api/stock-valuation-snapshot/:ticker', async (req, res) => {
    const { ticker } = req.params;
    console.log(`[${new Date().toISOString()}] Received request for /api/stock-valuation-snapshot/${ticker}`);

    const apiKeyToUse = YAHU_RAPIDAPI_KEY;
    if (!apiKeyToUse) {
        return res.status(500).json({ success: false, message: "Server configuration error: API key missing." });
    }
    console.log(`[${new Date().toISOString()}] Using Yahu API Key ending in: ...${apiKeyToUse.slice(-6)} (Valuation Route)`);

    const isNumber = (val) => typeof val === 'number' && !isNaN(val);

    // 1. --- Define API Requests ---
    // Request modules needed for valuation page structure
    const modules = 'price,defaultKeyStatistics,financialData';
    const yahuUrl = `https://${YAHU_RAPIDAPI_HOST}/stock/get-fundamentals`;
    const simfinUrl = `${SIMFIN_BASE_URL}/statements/compact?ticker=${ticker}&statements=pl&period=fy`; // Only need PL for P&L data

    const yahuOptions = {
        method: 'GET', url: yahuUrl,
        params: { symbol: ticker, modules: modules, region: 'US', lang: 'en-US' },
        headers: { 'x-rapidapi-key': apiKeyToUse, 'x-rapidapi-host': YAHU_RAPIDAPI_HOST, 'User-Agent': 'TMT-Server/1.0' }
    };
    const simfinOptions = { 
        method: 'GET', 
        url: simfinUrl, 
        headers: { 'accept': 'application/json', 'Authorization': `api-key ${SIMFIN_API_KEY}` } 
    };

    try {
        // 2. --- Execute Concurrent API Calls ---
        const [yahuResponse, simfinResponse] = await Promise.all([
            axios.request(yahuOptions),
            axios.get(simfinUrl, simfinOptions)
        ]);

        // 3. --- Process Yahu Snapshot ---
        const quote = yahuResponse.data?.quoteSummary?.result?.[0];
        if (!quote) throw new Error(`No Yahu snapshot data found for ${ticker}`);

        // --- 4. Process SimFin P&L for YoY Growth (Revenue & Earnings) ---
        let revYoYGrowth = null;
        let earningsYoYGrowth = null; // <-- NEW VARIABLE
        const simfinData = simfinResponse.data;
        
        if (simfinData && simfinData.length > 0 && simfinData[0].statements) {
            const plDefinition = simfinData[0].statements.find(s => s.statement === 'PL');
            const revenueIndex = plDefinition?.columns?.indexOf("Revenue");
            const netIncomeIndex = plDefinition?.columns?.indexOf("Net Income"); // <-- NEW INDEX
            const plDataRows = plDefinition?.data?.filter(row => row[0] === 'FY') || [];
            
            // Get the two most recent data points for Revenue and Net Income
            if (plDefinition && revenueIndex !== -1 && netIncomeIndex !== -1 && plDataRows.length >= 2) {
                // Get the last two data points (most recent years)
                const revenueNow = parseFloat(plDataRows[plDataRows.length - 1][revenueIndex]);
                const revenuePrior = parseFloat(plDataRows[plDataRows.length - 2][revenueIndex]);
                const netIncomeNow = parseFloat(plDataRows[plDataRows.length - 1][netIncomeIndex]); // <-- NEW
                const netIncomePrior = parseFloat(plDataRows[plDataRows.length - 2][netIncomeIndex]); // <-- NEW
                
                // Calculate Revenue Growth
                if (isNumber(revenueNow) && isNumber(revenuePrior) && revenuePrior !== 0) {
                    revYoYGrowth = ((revenueNow / revenuePrior) - 1) * 100;
                }
                
                // Calculate Earning Growth
                if (isNumber(netIncomeNow) && isNumber(netIncomePrior) && netIncomePrior !== 0) {
                    earningsYoYGrowth = ((netIncomeNow / netIncomePrior) - 1) * 100;
                }
            }
        }
        
        // --- 5. Final Data Mapping (TTM & Financials) ---
        const data = {};
        data.companyName = quote.price?.longName || quote.price?.shortName || "N/A";
        data.currentPrice = quote.price?.regularMarketPrice?.raw || null;
        
        // 5a. Financials Object (Nested)
        const currentRevenueB = quote.financialData?.totalRevenue?.raw / 1e9 || null;
        const currentEarningsB = quote.defaultKeyStatistics?.netIncomeToCommon?.raw / 1e9 || null;
        const currentMarketCapB = quote.price?.marketCap?.raw / 1e9 || null;
        data.financials = { currentRevenueB, currentEarningsB, currentMarketCapB };

        // 5b. Historical_TTM Object (Nested)
        const ttmPE = (data.currentPrice && quote.defaultKeyStatistics?.trailingEps?.raw && quote.defaultKeyStatistics.trailingEps.raw !== 0)
                      ? (data.currentPrice / quote.defaultKeyStatistics.trailingEps.raw) : null;
        
        // FIX: Use SimFin YoY calculated growth if available, otherwise fallback
        data.historical_TTM = { 
            revGrowth: revYoYGrowth || quote.financialData?.revenueGrowth * 100 || null, // <-- Revenue fixed
            earningsGrowth: earningsYoYGrowth || quote.defaultKeyStatistics?.earningsQuarterlyGrowth * 100 || null, // <-- Earnings fixed
            profitMargin: quote.defaultKeyStatistics?.profitMargins?.raw * 100 || null,
            pe: ttmPE, 
            roic: quote.financialData?.returnOnEquity?.raw * 100 || null, 
            annualizedReturn: "N/A"
        };


        console.log(`[${new Date().toISOString()}] Processed Yahu data for ${ticker}. Sending NESTED response.`); 
        res.json({ success: true, data: data });

    } catch (err) {
        // ... (Keep the detailed error logging section exactly as it was) ...
        let errorMessage = `Server error fetching Yahu snapshot for ${ticker}.`;
        let statusCode = 500;
        console.error(`[${new Date().toISOString()}] ERROR during Yahu API call for ${ticker} (Valuation Route):`, err.message);
        if (axios.isAxiosError(err)) {
            if (err.response) { console.error(`[${new Date().toISOString()}] RapidAPI Error Response Status: ${err.response.status}`); console.error(`[${new Date().toISOString()}] RapidAPI Error Response Data:`, err.response.data); statusCode = err.response.status; const errorDetail = err.response.data?.message || err.response.statusText || 'Unknown API error'; if (statusCode === 401) errorMessage = "Invalid Yahu API Key (check server environment variables)."; else if (statusCode === 403) errorMessage = "Forbidden - API Key might lack permissions or subscription for this endpoint."; else if (statusCode === 404) errorMessage = `Snapshot data not found (404) for ${ticker}.`; else if (statusCode === 429) errorMessage = "API Rate Limit Exceeded (Too Many Requests)."; else errorMessage = `Error from Yahu API: ${errorDetail} (Status ${statusCode})`; } else if (err.request) { console.error(`[${new Date().toISOString()}] Yahu Snapshot Request Error (No Response): Check network or RapidAPI status.`); errorMessage = "No response received from Yahu API."; statusCode = 504; } else { console.error(`[${new Date().toISOString()}] Axios Setup Error:`, err.message); errorMessage = `Error setting up request to Yahu: ${err.message}`; }
        } else { console.error(`[${new Date().toISOString()}] Non-Axios Error processing Yahu data:`, err.stack); errorMessage = `Internal server error processing Yahu data: ${err.message}`; }
        res.status(statusCode).json({ success: false, message: errorMessage });
    }
});
// --- END NEW ROUTE -- STOCK Valuation - YAHU PROXY ROUTE  ---

// --- TMT Rating Routes (Copied from your uploaded file) ---
app.get('/api/admin/stock-ratings', authMiddleware, adminAuthMiddleware, async (req, res) => {
    try {
        const ratings = await TmtStockRating.find().sort({ ticker: 1 });
        res.json({ success: true, data: ratings });
    } catch (err) {
        console.error('Fetch TMT Ratings Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching TMT ratings list.' });
    }
});
// --- ADDED NEW TMT RANKING ----
app.post('/api/admin/stock-rating', authMiddleware, adminAuthMiddleware, async (req, res) => {
    // MODIFICATION: Destructure 'rank' and 'targetPrice'
    const { ticker, rating, rank, targetPrice } = req.body;
    
    if (!ticker || typeof rating !== 'number' || rating < 0 || rating > 5) {
        return res.status(400).json({ success: false, message: 'Valid ticker and rating (0-5) are required.' });
    }

    // Convert targetPrice to a number or null
    const price = parseFloat(targetPrice) || null;

    try {
        const updatedRating = await TmtStockRating.findOneAndUpdate(
            { ticker: ticker.toUpperCase().trim() }, // Ensure uppercase and trimmed
            { 
                ticker: ticker.toUpperCase().trim(), 
                rating: rating, 
                rank: rank || '',
                targetPrice: price // Save the price (or null if empty)
            },
            { new: true, upsert: true, runValidators: true }
        );
        res.json({ success: true, message: `TMT Rating for ${updatedRating.ticker} saved.`, data: updatedRating });
    } catch (err) {
        console.error('Save TMT Rating Error:', err.message);
        if (err.name === 'ValidationError') {
             return res.status(400).json({ success: false, message: `Validation Error: ${err.message}` });
        }
        res.status(500).json({ success: false, message: 'Server error saving TMT rating.' });
    }
});
app.get('/api/stock/tmt-rating', async (req, res) => {
    const { ticker } = req.query;
    if (!ticker) { return res.status(400).json({ success: false, message: 'Ticker query parameter is required.' }); }
    try {
        const tmtRating = await TmtStockRating.findOne({ ticker: ticker.toUpperCase().trim() }); // Ensure uppercase and trimmed
        res.json({ success: true, ticker: ticker.toUpperCase().trim(), rating: tmtRating ? tmtRating.rating : 0 }); // Return 0 if not found
    } catch (err) {
        console.error('Fetch TMT Rating Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching TMT rating.' });
    }
});

// --- User Rating Routes (Copied from your uploaded file) ---
app.post('/api/user/save-rating', authMiddleware, async (req, res) => {
    const { ticker, rating } = req.body;
    const userId = req.user.id; // Get user ID from authenticated request
    if (!ticker || typeof rating !== 'number' || rating < 0 || rating > 5) {
        return res.status(400).json({ success: false, message: 'Valid ticker and rating (0-5) are required.' });
    }
    try {
        const tickerFormatted = ticker.toUpperCase().trim();
        const updatedUserRating = await UserStockRating.findOneAndUpdate(
            { user: userId, ticker: tickerFormatted }, // Find by user ID and ticker
            { user: userId, ticker: tickerFormatted, rating: rating }, // Data to update/insert
            { new: true, upsert: true, runValidators: true } // Options
        );
        res.json({ success: true, message: 'Your rating has been saved.', data: updatedUserRating });
    } catch (err) {
        console.error('Save User Rating Error:', err.message);
        if (err.name === 'ValidationError') {
             return res.status(400).json({ success: false, message: `Validation Error: ${err.message}` });
        }
        res.status(500).json({ success: false, message: 'Server error saving your rating.' });
    }
});
app.get('/api/user/get-rating', authMiddleware, async (req, res) => {
    const { ticker } = req.query;
    const userId = req.user.id; // Get user ID from authenticated request
    if (!ticker) { return res.status(400).json({ success: false, message: 'Ticker query parameter is required.' }); }
    try {
        const tickerFormatted = ticker.toUpperCase().trim();
        const userRating = await UserStockRating.findOne({ user: userId, ticker: tickerFormatted });
        // Return the rating if found, otherwise return null for the rating value
        res.json({ success: true, ticker: tickerFormatted, rating: userRating ? userRating.rating : null });
    } catch (err) {
        console.error('Fetch User Rating Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching your rating.' });
    }
});

// --- Community Sentiment Route (Copied from your uploaded file) ---
app.get('/api/stock/community-sentiment', async (req, res) => {
    const { ticker } = req.query;
    if (!ticker) { return res.status(400).json({ success: false, message: 'Ticker query parameter is required.' }); }
    try {
        const tickerFormatted = ticker.toUpperCase().trim();
        // Find ratings > 0 for the specific ticker
        const allRatings = await UserStockRating.find({ ticker: tickerFormatted, rating: { $gt: 0 } }).select('rating'); // Only select the rating field

        let buyVotes = 0, holdVotes = 0, sellVotes = 0;
        allRatings.forEach(item => {
            if (item.rating === 4 || item.rating === 5) buyVotes++;
            else if (item.rating === 3) holdVotes++;
            else if (item.rating === 1 || item.rating === 2) sellVotes++;
        });

        const totalVotes = buyVotes + holdVotes + sellVotes;
        let sentiment = { buy: 0, hold: 0, sell: 0, total: 0 }; // Default

        if (totalVotes > 0) {
            sentiment = {
                buy: (buyVotes / totalVotes) * 100,
                hold: (holdVotes / totalVotes) * 100,
                sell: (sellVotes / totalVotes) * 100,
                total: totalVotes
            };
        }
        res.json({ success: true, sentiment: sentiment });
    } catch (err) {
        console.error('Fetch Community Sentiment Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching community sentiment.' });
    }
});
// *** START: NEW PUBLIC STOCK RANKING LIST ENDPOINT ***
/**
 * @route   GET /api/stock-ranking-list
 * @desc    Get all stocks rated 4/5 (Buy) or 5/5 (Strong Buy) and fetch their live data.
 * @access  Public
 */
app.get('/api/stock-ranking-list', async (req, res) => {
    console.log(`[${new Date().toISOString()}] Received request for /api/stock-ranking-list`);

    if (!YAHU_RAPIDAPI_KEY) {
        console.error("FATAL ERROR: YAHU_RAPIDAPI_KEY is not set.");
        return res.status(500).json({ success: false, message: "Server API key not configured." });
    }

    let stocksToFetch = [];
    try {
        // MODIFICATION: Find all stocks rated 4 OR 5
        stocksToFetch = await TmtStockRating.find({ 
            rating: { $gte: 4 } // $gte means "greater than or equal to" 4
        }).select('ticker rank rating targetPrice'); // Include rating and targetPrice
        
        if (stocksToFetch.length === 0) {
            console.log(`[${new Date().toISOString()}] No 'Buy' (4/5) or 'Strong Buy' (5/5) stocks found.`);
            return res.json({ success: true, data: [] }); // Return empty list
        }

        console.log(`[${new Date().toISOString()}] Found ${stocksToFetch.length} stocks rated 4 or 5. Fetching live data...`);
    } catch (dbErr) {
        console.error(`[${new Date().toISOString()}] DB Error fetching TMT ratings:`, dbErr.message);
        return res.status(500).json({ success: false, message: "Database error fetching stock ratings." });
    }
    
    // 2. Prepare to fetch live data for these tickers
    const tickersToScan = stocksToFetch.map(s => s.ticker);
    const isNumber = (val) => typeof val === 'number' && !isNaN(val);

    // API Rate Limit Settings
    const CHUNK_SIZE = 5; // 5 calls
    const DELAY_MS = 1000; // per 1 second

    // We need price, company name, and sector
    const url = `https://${YAHU_RAPIDAPI_HOST}/stock/get-fundamentals`;
    const optionsTemplate = {
        method: 'GET',
        url: url,
        params: { 
            symbol: '', 
            modules: 'price,summaryProfile', // Only need these modules
            region: 'US',
            lang: 'en-US'
        },
        headers: {
            'x-rapidapi-key': YAHU_RAPIDAPI_KEY,
            'x-rapidapi-host': YAHU_RAPIDAPI_HOST
        }
    };

    let allResults = [];
    let combinedStockData = [];

    try {
        // 3. Loop through tickers in chunks (respecting rate limit)
        for (let i = 0; i < tickersToScan.length; i += CHUNK_SIZE) {
            const chunk = tickersToScan.slice(i, i + CHUNK_SIZE);
            console.log(`[${new Date().toISOString()}] RANKING-LIST: Processing chunk ${Math.floor(i / CHUNK_SIZE) + 1}: ${chunk.join(',')}`);

            const chunkPromises = chunk.map(ticker => {
                const options = { ...optionsTemplate, params: { ...optionsTemplate.params, symbol: ticker } };
                return axios.request(options);
            });

            const chunkResponses = await Promise.allSettled(chunkPromises);
            allResults.push(...chunkResponses);

            if (i + CHUNK_SIZE < tickersToScan.length) {
                await new Promise(res => setTimeout(res, DELAY_MS));
            }
        }

        // 4. Process all results and combine with our DB data
        allResults.forEach((response, index) => {
            const originalStockInfo = stocksToFetch[index]; // { ticker, rank, rating, targetPrice }
            
            if (response.status === 'fulfilled' && response.value.data?.quoteSummary?.result?.[0]) {
                const quote = response.value.data.quoteSummary.result[0];
                const priceData = quote.price;
                const profileData = quote.summaryProfile;

                if (priceData) {
                    combinedStockData.push({
                        // Data from our DB
                        ticker: originalStockInfo.ticker,
                        rank: originalStockInfo.rank || 'A+', // Default to A+ if rank is empty
                        rating: originalStockInfo.rating, // Pass the 4 or 5 rating
                        tmtTarget: originalStockInfo.targetPrice, // Pass the target price
                        
                        // Live data from Yahu
                        name: priceData.longName || priceData.shortName || 'N/A',
                        sector: profileData?.sector || 'N/A',
                        currentPrice: priceData.regularMarketPrice?.raw?.toFixed(2) || 'N/A'
                    });
                }
            } else if (response.status === 'rejected') {
                console.warn(`[${new Date().toISOString()}] RANKING-LIST: Failed to fetch data for ${originalStockInfo.ticker}. Reason: ${response.reason?.message}`);
            }
        });

        // 5. Sort by rank first, then ticker
        combinedStockData.sort((a, b) => {
            if (a.rank < b.rank) return -1;
            if (a.rank > b.rank) return 1;
            if (a.ticker < b.ticker) return -1;
            return 1;
        });

        res.json({ success: true, data: combinedStockData });

    } catch (err) {
        let errorMessage = `Server error during stock ranking scan.`;
        let statusCode = 500;
        console.error(`[${new Date().toISOString()}] ERROR during RANKING-LIST processing:`, err.message);
        if (axios.isAxiosError(err) && err.response) {
            statusCode = err.response.status;
            errorMessage = err.response.data?.message || `Error from external API (${statusCode})`;
        }
        res.status(statusCode).json({ success: false, message: errorMessage });
    }
});
// *** END: NEW PUBLIC STOCK RANKING LIST ENDPOINT ***

// *** NEW: DELETE TMT STOCK RATING ***
/**
 * @route   DELETE /api/admin/stock-rating/:ticker
 * @desc    Admin deletes a TMT stock rating
 * @access  Admin/Superadmin
 */
app.delete('/api/admin/stock-rating/:ticker', authMiddleware, adminAuthMiddleware, async (req, res) => {
    const { ticker } = req.params;

    if (!ticker) {
        return res.status(400).json({ success: false, message: 'Ticker parameter is required.' });
    }

    try {
        const result = await TmtStockRating.deleteOne({ ticker: ticker.toUpperCase().trim() });

        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, message: `Rating for ${ticker} not found.` });
        }

        res.json({ success: true, message: `Rating for ${ticker} successfully deleted.` });

    } catch (err) {
        console.error('Delete TMT Rating Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error deleting TMT rating.' });
    }
});
// --- START: MODIFIED WATCHLIST ROUTE WITH CACHING ---
/**
 * @route   POST /api/stock/batch-details
 * @desc    Get quote details for multiple tickers (for watchlist)
 * @desc    Uses Caching to speed up frequent loads.
 * @access  Private
 */
app.post('/api/stock/batch-details', authMiddleware, async (req, res) => {
    const { tickers } = req.body; 
    const userId = req.user.id;
    const cacheKey = userId + '_watchlist_data';
    
    if (!Array.isArray(tickers) || tickers.length === 0) {
        return res.status(400).json({ success: false, message: 'An array of tickers is required.' });
    }

    // 1. Check Cache
    // const cachedData = watchlistCache.get(cacheKey);
    // if (cachedData && Date.now() < cachedData.expires) {
     //   console.log(`[${new Date().toISOString()}] WATCHLIST CACHE HIT for user ${userId}.`);
    //    return res.json({ success: true, data: cachedData.data });
    // }

    if (!YAHU_RAPIDAPI_KEY) {
         console.error("FATAL ERROR: YAHU_RAPIDAPI_KEY is not set.");
         return res.status(500).json({ success: false, message: "Server API key not configured." });
    }

    // API Rate Limit Settings
    const CHUNK_SIZE = 5; // 5 calls
    const DELAY_MS = 1000; // per 1 second

    // We will call /stock/get-fundamentals for each ticker
    const url = `https://${YAHU_RAPIDAPI_HOST}/stock/get-fundamentals`;
    const optionsTemplate = {
        method: 'GET',
        url: url,
        params: { 
            symbol: '', // Ticker will be added here
            modules: 'price', // We only need the 'price' module for the watchlist
            region: 'US',
            lang: 'en-US'
        },
        headers: {
            'x-rapidapi-key': YAHU_RAPIDAPI_KEY,
            'x-rapidapi-host': YAHU_RAPIDAPI_HOST
        }
    };

    let allResults = []; 

    try {
        // Loop through the tickers in chunks
        for (let i = 0; i < tickers.length; i += CHUNK_SIZE) {
            const chunk = tickers.slice(i, i + CHUNK_SIZE);
            console.log(`[${new Date().toISOString()}] Processing chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(tickers.length / CHUNK_SIZE)}: ${chunk.join(',')}`);

            const chunkPromises = chunk.map(ticker => {
                const options = { 
                    ...optionsTemplate, 
                    params: { ...optionsTemplate.params, symbol: ticker }
                };
                return axios.request(options);
            });

            const chunkResponses = await Promise.allSettled(chunkPromises);
            allResults.push(...chunkResponses); 

            if (i + CHUNK_SIZE < tickers.length) {
                console.log(`[${new Date().toISOString()}] Waiting ${DELAY_MS}ms for rate limit...`);
                await new Promise(res => setTimeout(res, DELAY_MS));
            }
        }

        // Process all results
        const formattedData = allResults.map((response, index) => {
            const ticker = tickers[index]; 
            // Check if the individual API call was successful
            if (response.status === 'fulfilled' && response.value.data?.quoteSummary?.result?.[0]) {
                const quote = response.value.data.quoteSummary.result[0].price;

                if (quote) {
                    const price = quote.regularMarketPrice?.raw;
                    const change = quote.regularMarketChange?.raw;
                    const changePct = quote.regularMarketChangePercent?.raw;
                    
                    let changeClass = 'text-gray-400';
                    if (change > 0) changeClass = 'text-tmt-green'; 
                    if (change < 0) changeClass = 'text-tmt-red'; 

                    return {
                        ticker: ticker,
                        name: quote.longName || quote.shortName || 'N/A',
                        price: price ? price.toFixed(2) : null,
                        changePercent: changePct ? (changePct * 100).toFixed(2) : null,
                        changeClass: changeClass 
                    };
                }
            }
            
            console.warn(`[${new Date().toISOString()}] Failed to fetch batch data for ticker: ${ticker}. Status: ${response.status}`);
            if(response.status === 'rejected') {
                console.error(`[${new Date().toISOString()}] REASON: ${response.reason?.message}`);
            }
            return {
                ticker: ticker,
                name: 'Error loading data',
                price: null,
                changePercent: null,
                changeClass: 'text-gray-400'
            };
        });
        
        // 2. Cache the result before returning
        // watchlistCache.set(cacheKey, {
          //   data: formattedData,
           //  expires: Date.now() + CACHE_DURATION_MS
       // });
        // console.log(`[${new Date().toISOString()}] WATCHLIST CACHE REFRESHED for user ${userId}. Expires in 2 minutes.`);


        res.json({ success: true, data: formattedData });

    } catch (err) {
        let errorMessage = `Server error during batch processing.`;
        let statusCode = 500;
        console.error(`[${new Date().toISOString()}] ERROR during Yahu BATCH processing:`, err.message);
        res.status(statusCode).json({ success: false, message: errorMessage });
    }
});
// --- END ROUTE --- WATCHLIST Batch Stock Details Route (with Caching) ---

// ===================================================================
// 8. TMT DASHBOARD API ROUTES (NEWLY ADDED)
// ===================================================================
app.use('/api/tmt', tmtDashboardRoutes);
app.use('/api/projections', budgetPlannerRoutes);
app.use('/api/currency', currencyRateRoutes);
app.use('/api/stockanalysis', stockAnalysisRoutes);
app.use('/api/fixedmetrics', fixedMetricsRoutes); // Maps /api/fixedmetrics/* to your new router
// -------------------------------------------------------------------
// 8a. OTHER EXISTING ROUTES (Copied from your uploaded file)
// -------------------------------------------------------------------
app.get('/api/user/profile', authMiddleware, async (req, res) => { try { const user = await User.findById(req.user.id).select('username email currency membership role pageAccess'); if (!user) { return res.status(404).json({ success: false, message: 'User not found.' }); } res.json({ success: true, data: user }); } catch (err) { console.error('Fetch Profile Error:', err.message); res.status(500).json({ success: false, message: 'Server error fetching profile.' }); }});
app.put('/api/user/settings', authMiddleware, async (req, res) => { const { currency } = req.body; const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'THB', 'AUD']; if (!currency || !validCurrencies.includes(currency)) { return res.status(400).json({ success: false, message: `Invalid or missing currency. Valid options: ${validCurrencies.join(', ')}` }); } try { const updatedUser = await User.findByIdAndUpdate( req.user.id, { currency: currency }, { new: true, runValidators: true } ).select('currency'); if (!updatedUser) { return res.status(404).json({ success: false, message: 'User not found.' }); } res.json({ success: true, message: 'Currency preference saved.', currency: updatedUser.currency }); } catch (err) { console.error('Update Settings Error:', err.message); res.status(500).json({ success: false, message: 'Server error saving settings.' }); }});
app.put('/api/user/change-password', authMiddleware, async (req, res) => { const { currentPassword, newPassword } = req.body; if (!currentPassword || !newPassword || newPassword.length < 8) { return res.status(400).json({ success: false, message: 'Please provide valid current and new passwords (min 8 characters).' }); } try { const user = await User.findById(req.user.id); if (!user) { return res.status(404).json({ success: false, message: 'User not found.' }); } const isMatch = await bcrypt.compare(currentPassword, user.passwordHash); if (!isMatch) { return res.status(401).json({ success: false, message: 'Current password is incorrect.' }); } const salt = await bcrypt.genSalt(10); user.passwordHash = await bcrypt.hash(newPassword, salt); await user.save(); res.json({ success: true, message: 'Password updated successfully.' }); } catch (err) { console.error('Change Password Error:', err.message); res.status(500).json({ success: false, message: 'Server error during password change.' }); }});
app.get('/api/transactions', authMiddleware, async (req, res) => { try { const transactions = await BudgetTransaction.find({ user: req.user.id }).sort({ timestamp: -1 }); res.json({ success: true, data: transactions }); } catch (err) { console.error('Fetch Transactions Error:', err.message); res.status(500).json({ success: false, message: 'Server error fetching transactions.' }); }});
app.post('/api/transactions', authMiddleware, async (req, res) => { const { description, amount, type } = req.body; const validTypes = ['income', 'expense']; if (!description || typeof amount !== 'number' || amount <= 0 || !type || !validTypes.includes(type)) { return res.status(400).json({ success: false, message: 'Please provide a valid description, positive amount, and type (income/expense).' }); } try { const newTransaction = new BudgetTransaction({ user: req.user.id, description: description.trim(), amount: amount, type }); const savedTransaction = await newTransaction.save(); res.status(201).json({ success: true, message: 'Transaction saved.', data: savedTransaction }); } catch (err) { console.error('Add Transaction Error:', err.message); if (err.name === 'ValidationError') { return res.status(400).json({ success: false, message: `Validation Error: ${err.message}` }); } res.status(500).json({ success: false, message: 'Server error saving transaction.' }); }});
app.delete('/api/transactions/:id', authMiddleware, async (req, res) => { try { const transactionId = req.params.id; let query = { _id: transactionId, user: req.user.id }; if (req.user.role === 'superadmin') { query = { _id: transactionId }; } const transaction = await BudgetTransaction.findOne(query); if (!transaction) { return res.status(404).json({ success: false, message: 'Transaction not found or you are not authorized to delete it.' }); } await BudgetTransaction.deleteOne({ _id: transactionId }); res.json({ success: true, message: 'Transaction deleted.' }); } catch (err) { console.error('Delete Transaction Error:', err.message); if (err.name === 'CastError') { return res.status(400).json({ success: false, message: 'Invalid transaction ID format.' }); } res.status(500).json({ success: false, message: 'Server error deleting transaction.' }); }});
// ===================================================================
// 8b. WATCHLIST API ROUTES
// ===================================================================
// --- START: MODIFIED WATCHLIST ROUTE WITH CACHING ---
// (No change to this route, as it only reads)
/**
 * @route   GET /api/user/watchlist
 * @desc    Get the user's watchlist (array of tickers)
 * @access  Private
 */
app.get('/api/user/watchlist', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('watchlist');
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        
        res.json({ success: true, data: user.watchlist });

    } catch (err) {
        console.error('Fetch Watchlist Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching watchlist.' });
    }
});

/**
 * @route   POST /api/user/watchlist/add
 * @desc    Add a stock ticker to the user's watchlist (MAX 20)
 * @access  Private
 */
app.post('/api/user/watchlist/add', authMiddleware, async (req, res) => {
    const { ticker } = req.body;
    const userId = req.user.id; // Get userId for cache clearing

    if (!ticker) {
        return res.status(400).json({ success: false, message: 'Ticker is required.' });
    }

    try {
        const upperTicker = ticker.toUpperCase().trim();

        const user = await User.findById(req.user.id).select('watchlist');

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        
        const cacheKey = userId + '_watchlist_data'; // Define cacheKey here

        // 2. Check if the watchlist is full
        if (user.watchlist.length >= 20) {
            // FIX: Clear cache even if full, in case the list has changed
            watchlistCache.delete(cacheKey); 
            return res.status(400).json({ 
                success: false, 
                message: 'Watchlist is full. Maximum 20 stocks allowed.' 
            });
        }

        // 3. Check if ticker already exists (what $addToSet did)
        if (user.watchlist.includes(upperTicker)) {
            // FIX: Clear cache here to force the frontend to refresh the list 
            // if it was stuck on a bad cache/loading state.
            watchlistCache.delete(cacheKey);
            return res.json({ 
                success: true, 
                message: `${upperTicker} is already in your watchlist.`, 
                data: user.watchlist 
            });
        }

        // 4. If all checks pass, add and save
        user.watchlist.push(upperTicker);
        await user.save();
        
        // FIX: Clear cache after a successful addition
        watchlistCache.delete(cacheKey);

        res.json({ success: true, message: `${upperTicker} added to watchlist.`, data: user.watchlist });

    } catch (err) {
        console.error('Add Watchlist Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error adding to watchlist.' });
    }
});

/**
 * @route   POST /api/user/watchlist/remove
 * @desc    Remove a stock ticker from the user's watchlist
 * @access  Private
 */
app.post('/api/user/watchlist/remove', authMiddleware, async (req, res) => {
    const { ticker } = req.body;
    const userId = req.user.id; // Get userId for cache clearing

    if (!ticker) {
        return res.status(400).json({ success: false, message: 'Ticker is required.' });
    }

    try {
        const upperTicker = ticker.toUpperCase().trim();
        const cacheKey = userId + '_watchlist_data'; // Define cacheKey here

        // Use $pull to remove all instances of the ticker from the array
        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            { $pull: { watchlist: upperTicker } },
            { new: true } // Return the updated user document
        ).select('watchlist');

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        
        // FIX: Clear cache after a successful removal
        watchlistCache.delete(cacheKey);

        res.json({ success: true, message: `${upperTicker} removed from watchlist.`, data: updatedUser.watchlist });

    } catch (err) {
        console.error('Remove Watchlist Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error removing from watchlist.' });
    }
});
//--- END ROUTE --- 8b. WATCHLIST API ROUTES
// --- STOCK SEARCH API (Mocked, as before) ---
app.get('/api/stock-quote/:ticker', (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    try {
        const mockData = { ticker: ticker, price: (Math.random() * 1000 + 50).toFixed(2), change: (Math.random() * 20 - 10).toFixed(2), changePercent: (Math.random() * 2 - 1).toFixed(2) + '%', marketCap: (Math.random() * 3 + 0.5).toFixed(1) + 'T' };
        res.json(mockData);
    } catch (error) {
        console.error('Mock Stock API Error:', error.message);
        res.status(500).json({ message: 'Failed to fetch mock stock data.' }); // This is the line with 500
    }
});


// -------------------------------------------------------------------
// 9. START SERVER (Copied from your uploaded file)
// -------------------------------------------------------------------

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Local access: http://localhost:${PORT}`);
});