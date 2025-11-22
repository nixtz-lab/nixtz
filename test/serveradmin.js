// server.js - Fully Functional Backend with MongoDB/Mongoose

// 1. Load environment variables from .env file
require('dotenv').config(); 

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
// Coolify provides the PORT environment variable; fall back to 3000 for local use
const PORT = process.env.PORT || 3000;

// --- CRITICAL CONFIGURATION ---
const JWT_SECRET = process.env.JWT_SECRET || 'your_default_jwt_secret_please_change_this_for_prod';
const MONGODB_URI = process.env.MONGODB_URI;
const DATABASE_NAME = 'tmt_website_db';

// Ensure the URI is present
if (!MONGODB_URI) {
    console.error("FATAL ERROR: MONGODB_URI is not defined in environment variables. Server cannot start.");
    process.exit(1);
}

// -------------------------------------------------------------------
// 2. MONGODB CONNECTION & SCHEMAS
// -------------------------------------------------------------------

mongoose.connect(MONGODB_URI, { dbName: DATABASE_NAME })
    .then(() => console.log('MongoDB Connected Successfully'))
    .catch(err => {
        console.error('MongoDB Connection Error:', err.message);
        // Important: Exit if connection fails to prevent app from running without DB
        process.exit(1); 
    });

// Define the User Schema (UPDATED: Added role, membership, and pageAccess)
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true }, // Storing the hashed password
    currency: { type: String, default: 'USD', enum: ['USD', 'EUR', 'GBP', 'JPY', 'THB', 'AUD'] }, 
    createdAt: { type: Date, default: Date.now },
    // *** NEW FIELDS FOR ADMIN/MEMBERSHIP ***
    role: { type: String, default: 'pending', enum: ['pending', 'standard', 'admin', 'superadmin'] }, 
    membership: { type: String, default: 'none', enum: ['none', 'standard', 'platinum', 'vip'] },
    pageAccess: { type: [String], default: [] } // List of page slugs the user can access
});

const User = mongoose.model('User', UserSchema);

// Define the Budget Transaction Schema (Unchanged)
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

// *** NEW SCHEMA: Membership Configuration ***
const MembershipConfigSchema = new mongoose.Schema({
    level: { type: String, required: true, unique: true, enum: ['standard', 'platinum', 'vip'] },
    pages: { type: [String], default: [] }, // Slugs of pages accessible by this level
    monthlyPrice: { type: Number, required: true }
});
const MembershipConfig = mongoose.model('MembershipConfig', MembershipConfigSchema);


// -------------------------------------------------------------------
// 3. MIDDLEWARE SETUP
// -------------------------------------------------------------------

// Allows Express to parse incoming JSON data (e.g., from frontend fetch calls)
app.use(express.json());

// Serve static files (HTML, CSS, JS, etc.) from the root directory
app.use(express.static(path.join(__dirname)));

// Middleware to check if user is authenticated and attach user ID and role
const authMiddleware = async (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.user.id).select('username role membership pageAccess');
        
        if (!user) {
             return res.status(401).json({ message: 'Invalid token: User not found.' });
        }
        
        // Attach the user object (with ID, username, role, etc.) to the request
        req.user = { id: user._id, username: user.username, role: user.role, membership: user.membership, pageAccess: user.pageAccess };
        next();
    } catch (ex) {
        res.status(401).json({ message: 'Invalid token or session expired.' });
    }
};

// Middleware to ensure user is at least a standard admin or superadmin
const adminAuthMiddleware = (req, res, next) => {
    if (req.user.role === 'admin' || req.user.role === 'superadmin') {
        next();
    } else {
        res.status(403).json({ message: 'Forbidden: Requires Admin privileges.' });
    }
};

// Middleware to ensure user is a superadmin
const superAdminAuthMiddleware = (req, res, next) => {
    if (req.user.role === 'superadmin') {
        next();
    } else {
        res.status(403).json({ message: 'Forbidden: Requires Super Admin privileges.' });
    }
};


// ===================================================================
// 4. AUTHENTICATION & ADMIN INITIALIZATION ROUTES
// ===================================================================

// --- REGISTRATION ROUTE (Sets role to 'pending') ---
app.post('/api/auth/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password || password.length < 8) {
        return res.status(400).json({ success: false, message: 'Please provide valid username, email, and a password of at least 8 characters.' });
    }

    try {
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ success: false, message: 'This email is already registered.' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        user = new User({
            username,
            email,
            passwordHash,
            role: 'pending', // New users are pending approval
        });
        await user.save();

        res.status(201).json({ success: true, message: 'Account created successfully! Awaiting admin approval.' });

    } catch (err) {
        console.error('Registration Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
});


// --- LOGIN ROUTE (Checks for superadmin initialization) ---
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Please fill in both email and password.' });
    }

    try {
        let user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid credentials.' });
        }
        
        // >>> TEMPORARY FIX: COMMENT OUT THIS BLOCK FOR THE FIRST LOGIN TO PROMOTE SUPERADMIN <<<
        /*
        if (user.role === 'pending') {
            return res.status(403).json({ success: false, message: 'Your account is pending admin approval.' });
        }
        */

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Invalid credentials.' });
        }
        
        // --- SUPER ADMIN INITIALIZATION LOGIC ---
        const superAdminExists = await User.exists({ role: 'superadmin' });
        if (!superAdminExists && user.role !== 'superadmin') {
            user.role = 'superadmin';
            user.membership = 'vip'; // Superadmin gets VIP access
            await user.save();
            console.log(`User ${user.username} promoted to SUPERADMIN.`);
        }
        // ----------------------------------------

        const payload = {
            user: {
                id: user.id, 
                username: user.username,
                role: user.role, // Include role in token payload
                membership: user.membership, // Include membership
                pageAccess: user.pageAccess // Include page access
            }
        };

        jwt.sign(
            payload,
            JWT_SECRET,
            { expiresIn: '5d' },
            (err, token) => {
                if (err) throw err;
                res.json({ 
                    success: true, 
                    message: 'Login successful!', 
                    token, 
                    username: user.username,
                    currency: user.currency,
                    role: user.role, // NEW
                    membership: user.membership, // NEW
                    pageAccess: user.pageAccess // NEW
                });
            }
        );

    } catch (err) {
        console.error('Login Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error during login.' });
    }
});


// ===================================================================
// 5. ADMIN PANEL API ROUTES (Requires authMiddleware + adminAuthMiddleware)
// ===================================================================

// @route   GET /api/admin/users/pending
// @desc    Get all users pending approval
// @access  Admin/Superadmin
app.get('/api/admin/users/pending', authMiddleware, adminAuthMiddleware, async (req, res) => {
    try {
        const pendingUsers = await User.find({ role: 'pending' }).select('username email createdAt');
        res.json({ success: true, data: pendingUsers });
    } catch (err) {
        console.error('Fetch Pending Users Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching pending users.' });
    }
});

// @route   PUT /api/admin/users/:id/approve
// @desc    Approve a pending user (sets role to 'standard', membership to 'none')
// @access  Admin/Superadmin
app.put('/api/admin/users/:id/approve', authMiddleware, adminAuthMiddleware, async (req, res) => {
    try {
        const userId = req.params.id;
        const user = await User.findByIdAndUpdate(
            userId, 
            { role: 'standard', membership: 'none' }, 
            { new: true }
        ).select('username role membership');
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        res.json({ success: true, message: `${user.username} approved as Standard User.`, data: user });
    } catch (err) {
        console.error('Approve User Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error approving user.' });
    }
});

// @route   GET /api/admin/users
// @desc    Get all non-pending, non-admin users
// @access  Admin/Superadmin
app.get('/api/admin/users', authMiddleware, adminAuthMiddleware, async (req, res) => {
    try {
        const users = await User.find({ role: { $in: ['standard', 'admin', 'superadmin'] } }).select('username email membership role pageAccess');
        res.json({ success: true, data: users });
    } catch (err) {
        console.error('Fetch All Users Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching users.' });
    }
});


// @route   PUT /api/admin/users/:id/update-membership
// @desc    Update user membership and page access
// @access  Admin/Superadmin
app.put('/api/admin/users/:id/update-membership', authMiddleware, adminAuthMiddleware, async (req, res) => {
    const { membership } = req.body;
    
    if (!['none', 'standard', 'platinum', 'vip'].includes(membership)) {
        return res.status(400).json({ success: false, message: 'Invalid membership level.' });
    }
    
    try {
        const userId = req.params.id;
        let pageAccess = [];

        if (membership !== 'none') {
            const config = await MembershipConfig.findOne({ level: membership });
            if (config) {
                pageAccess = config.pages;
            }
        }
        
        const updatedUser = await User.findByIdAndUpdate(
            userId, 
            { membership, pageAccess }, 
            { new: true, runValidators: true } 
        ).select('username membership pageAccess');

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        res.json({ success: true, message: `${updatedUser.username} updated to ${membership} membership.`, data: updatedUser });

    } catch (err) {
        console.error('Update Membership Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error updating membership.' });
    }
});

// @route   POST /api/admin/admins/create
// @desc    Super Admin creates a new standard admin user (needs email/username/password)
// @access  Superadmin Only
app.post('/api/admin/admins/create', authMiddleware, superAdminAuthMiddleware, async (req, res) => {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password || password.length < 8) {
        return res.status(400).json({ success: false, message: 'Provide valid admin credentials (min 8 characters).' });
    }

    try {
        if (await User.exists({ email })) {
            return res.status(400).json({ success: false, message: 'Email already exists.' });
        }
        
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        
        const newAdmin = new User({
            username,
            email,
            passwordHash,
            role: 'admin', // Explicitly set role
            membership: 'standard' // Admins get standard membership by default
        });
        await newAdmin.save();

        res.status(201).json({ success: true, message: `Admin user ${username} created successfully.` });

    } catch (err) {
        console.error('Create Admin Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error creating admin user.' });
    }
});

// ===================================================================
// 6. MEMBERSHIP CONFIGURATION ROUTES (Requires adminAuthMiddleware)
// ===================================================================

// @route   GET /api/admin/membership-config
// @desc    Get all membership configurations (Standard, Platinum, VIP)
// @access  Admin/Superadmin
app.get('/api/admin/membership-config', authMiddleware, adminAuthMiddleware, async (req, res) => {
    try {
        // Ensure all three levels exist, creating defaults if necessary
        const levels = ['standard', 'platinum', 'vip'];
        const configs = await Promise.all(levels.map(async level => {
            let config = await MembershipConfig.findOne({ level });
            if (!config) {
                // Create default config
                config = new MembershipConfig({ 
                    level, 
                    pages: level === 'standard' ? ['dashboard'] : ['dashboard', 'premium-tools'],
                    monthlyPrice: level === 'standard' ? 10 : (level === 'platinum' ? 30 : 50)
                });
                await config.save();
            }
            return config;
        }));
        res.json({ success: true, data: configs });
    } catch (err) {
        console.error('Fetch Config Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching config.' });
    }
});

// @route   PUT /api/admin/membership-config/:level
// @desc    Update configuration for a specific membership level
// @access  Admin/Superadmin
app.put('/api/admin/membership-config/:level', authMiddleware, adminAuthMiddleware, async (req, res) => {
    const { pages, monthlyPrice } = req.body;
    const level = req.params.level;

    if (!['standard', 'platinum', 'vip'].includes(level)) {
        return res.status(400).json({ success: false, message: 'Invalid membership level provided.' });
    }
    
    // Simple validation
    if (!Array.isArray(pages) || typeof monthlyPrice !== 'number' || monthlyPrice < 0) {
        return res.status(400).json({ success: false, message: 'Invalid data provided for pages or price.' });
    }

    try {
        const updatedConfig = await MembershipConfig.findOneAndUpdate(
            { level },
            { pages, monthlyPrice },
            { new: true, upsert: true }
        );
        
        // IMPORTANT: Re-apply new access list to all users of this level
        await User.updateMany(
            { membership: level }, 
            { pageAccess: pages }
        );

        res.json({ success: true, message: `Membership config for ${level} updated.`, data: updatedConfig });
    } catch (err) {
        console.error('Update Config Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error updating configuration.' });
    }
});


// -------------------------------------------------------------------
// 7. OTHER EXISTING ROUTES (Auth, Budget, Stock) - Remained mostly the same
// -------------------------------------------------------------------

// All other existing Budget and Stock routes remain as they were, simply using the new authMiddleware.
// The existing User Profile and Settings routes are still valid.
// Omitted for brevity, but they are implicitly included here and should be in the final runnable file.

// @route   GET /api/user/profile
// @desc    Get authenticated user's profile details
// @access  Private (Requires JWT)
app.get('/api/user/profile', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('username email currency membership role');
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        res.json({ success: true, data: user });
    } catch (err) {
        console.error('Fetch Profile Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching profile.' });
    }
});

// @route   PUT /api/user/settings
// @desc    Update user-specific settings (like currency)
// @access  Private (Requires JWT)
app.put('/api/user/settings', authMiddleware, async (req, res) => {
    const { currency } = req.body;
    
    if (!currency) {
        return res.status(400).json({ success: false, message: 'Currency field is required.' });
    }

    try {
        const updatedUser = await User.findByIdAndUpdate(
            req.user.id, 
            { currency: currency }, 
            { new: true, runValidators: true } 
        ).select('currency'); // Only return updated field
        
        if (!updatedUser) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        res.json({ success: true, message: 'Currency preference saved.', currency: updatedUser.currency });

    } catch (err) {
        console.error('Update Settings Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error saving settings.' });
    }
});

// @route   PUT /api/user/change-password
// @desc    Change authenticated user's password
// @access  Private (Requires JWT)
app.put('/api/user/change-password', authMiddleware, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 8) {
        return res.status(400).json({ success: false, message: 'Please provide valid current and new passwords (min 8 characters).' });
    }

    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
        }

        const salt = await bcrypt.genSalt(10);
        user.passwordHash = await bcrypt.hash(newPassword, salt);
        
        await user.save();

        res.json({ success: true, message: 'Password updated successfully.' });

    } catch (err) {
        console.error('Change Password Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error during password change.' });
    }
});

// @route   GET /api/transactions
// @desc    Get all transactions for the authenticated user
// @access  Private (Requires JWT)
app.get('/api/transactions', authMiddleware, async (req, res) => {
    try {
        const transactions = await BudgetTransaction.find({ user: req.user.id }).sort({ timestamp: -1 });
        res.json({ success: true, data: transactions });
    } catch (err) {
        console.error('Fetch Transactions Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching transactions.' });
    }
});


// @route   POST /api/transactions
// @desc    Add a new transaction
// @access  Private (Requires JWT)
app.post('/api/transactions', authMiddleware, async (req, res) => {
    const { description, amount, type } = req.body;

    if (!description || !amount || !type) {
        return res.status(400).json({ success: false, message: 'Please include description, amount, and type.' });
    }
    
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Amount must be a positive number.' });
    }
    
    try {
        const newTransaction = new BudgetTransaction({
            user: req.user.id, 
            description,
            amount: parsedAmount,
            type,
        });

        const savedTransaction = await newTransaction.save();
        res.status(201).json({ success: true, message: 'Transaction saved.', data: savedTransaction });

    } catch (err) {
        console.error('Add Transaction Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error saving transaction.' });
    }
});


// @route   DELETE /api/transactions/:id
// @desc    Delete a transaction by ID
// @access  Private (Requires JWT and ownership)
app.delete('/api/transactions/:id', authMiddleware, async (req, res) => {
    try {
        const transactionId = req.params.id;
        
        // Ensure the transaction belongs to the authenticated user OR user is admin
        const transaction = await BudgetTransaction.findOne({ _id: transactionId, user: req.user.id });

        if (!transaction && req.user.role !== 'superadmin') {
            return res.status(404).json({ success: false, message: 'Transaction not found or unauthorized.' });
        }

        await BudgetTransaction.deleteOne({ _id: transactionId });

        res.json({ success: true, message: 'Transaction deleted.' });

    } catch (err) {
        console.error('Delete Transaction Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error deleting transaction.' });
    }
});


// --- STOCK SEARCH API (Mocked, as before) ---
app.get('/api/stock-quote/:ticker', (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    
    try {
        const mockData = {
            ticker: ticker,
            price: (Math.random() * 1000).toFixed(2),
            change: (Math.random() * 10 - 5).toFixed(2),
            marketCap: '2.5T'
        };

        res.json(mockData); 

    } catch (error) {
        console.error('Stock API Error:', error.message);
        res.status(500).json({ message: 'Failed to fetch stock data.' });
    }
});


// -------------------------------------------------------------------
// 7. START SERVER
// -------------------------------------------------------------------

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Local access: http://localhost:${PORT}`);
});
