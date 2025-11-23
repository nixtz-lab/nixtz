// middleware/auth.js
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = mongoose.model('User'); // Assumes User model is registered in server.js

// --- CRITICAL CONFIGURATION ---
const JWT_SECRET = process.env.JWT_SECRET || 'your_default_jwt_secret_please_change_this_for_prod';

// --- Auth Middleware ---
const authMiddleware = async (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded.user || !decoded.user.id) {
            throw new Error('Invalid token structure');
        }
        const user = await User.findById(decoded.user.id).select('username role membership pageAccess');

        if (!user) {
             return res.status(401).json({ success: false, message: 'Invalid token: User not found.' });
        }

        req.user = {
            id: user._id,
            username: user.username,
            role: user.role,
            membership: user.membership,
            pageAccess: user.pageAccess
        };
        next();
    } catch (ex) {
        if (ex.name === 'TokenExpiredError') {
             return res.status(401).json({ success: false, message: 'Token expired.' });
        }
        console.error('Auth Middleware Error:', ex.message);
        res.status(401).json({ success: false, message: 'Invalid token.' });
    }
};

// --- Admin Auth Middleware ---
const adminAuthMiddleware = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Forbidden: Requires Admin privileges.' });
    }
};

// --- Super Admin Auth Middleware ---
const superAdminAuthMiddleware = (req, res, next) => {
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