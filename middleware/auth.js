// middleware/auth.js (FINAL FIX)

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// --- CRITICAL CONFIGURATION ---
const JWT_SECRET = process.env.JWT_SECRET || 'your_default_jwt_secret_please_change_this_for_prod';

// --- Auth Middleware ---
const authMiddleware = async (req, res, next) => {
    // 🚨 FIX: Model access moved here to prevent server crash on module load
    const User = mongoose.model('User'); 
    
    // 1. Extract token safely
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    try {
        // 2. Verify token
        const decoded = jwt.verify(token, JWT_SECRET);
        
        if (!decoded.user || !decoded.user.id) {
            throw new Error('Invalid token structure');
        }
        
        // 3. Look up user in the database (TMT logic)
        const user = await User.findById(decoded.user.id).select('username role membership pageAccess');

        if (!user) {
             return res.status(401).json({ success: false, message: 'Invalid token: User not found.' });
        }

        // 4. Attach verified user data to req object
        req.user = {
            id: user._id,
            username: user.username,
            role: user.role,
            membership: user.membership,
            pageAccess: user.pageAccess
        };
        next();
    } catch (ex) {
        // Centralized error handling for token issues
        if (ex.name === 'TokenExpiredError') {
             return res.status(401).json({ success: false, message: 'Token expired.' });
        }
        console.error('Auth Middleware Error:', ex.message);
        res.status(401).json({ success: false, message: 'Invalid token.' });
    }
};

// --- Admin Auth Middleware ---
const adminAuthMiddleware = (req, res, next) => {
    // Checks role attached to req.user from authMiddleware
    if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Forbidden: Requires Admin privileges.' });
    }
};

// --- Super Admin Auth Middleware ---
const superAdminAuthMiddleware = (req, res, next) => {
    // Checks role attached to req.user from authMiddleware
    if (req.user && req.user.role === 'superadmin') {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Forbidden: Requires Super Admin privileges.' });
    }
};

// Export all middleware functions
module.exports = {
    authMiddleware,
    adminAuthMiddleware,
    superAdminAuthMiddleware
};