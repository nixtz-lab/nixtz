// middleware/auth.js

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = mongoose.model('User'); // Assumes User model is registered in server.js

// --- CRITICAL CONFIGURATION ---
const JWT_SECRET = process.env.JWT_SECRET || 'your_default_jwt_secret_please_change_this_for_prod';

// --- Auth Middleware ---
const authMiddleware = async (req, res, next) => {
    // 1. Extract token safely
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        // Must return JSON for API calls
        return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    try {
        // 2. Verify token
        const decoded = jwt.verify(token, JWT_SECRET);
        
        if (!decoded.user || !decoded.user.id) {
            throw new Error('Invalid token structure');
        }
        
        // 3. Attach decoded user data to req object
        // This is a performance optimization: we trust the token for basic auth 
        // instead of fetching the whole user document from the DB on every request.
        req.user = decoded.user;
        
        next();
    } catch (ex) {
        // Centralized error handling for token issues
        let message = 'Invalid token.';
        if (ex.name === 'TokenExpiredError') {
             message = 'Token expired.';
        }
        console.error('Auth Middleware Error:', ex.message);
        res.status(401).json({ success: false, message: message });
    }
};

// --- Admin Auth Middleware ---
const adminAuthMiddleware = (req, res, next) => {
    // Check role attached to req.user from authMiddleware
    if (req.user && (req.user.role === 'admin' || req.user.role === 'superadmin')) {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Forbidden: Requires Admin privileges.' });
    }
};

// --- Super Admin Auth Middleware ---
const superAdminAuthMiddleware = (req, res, next) => {
    // Check role attached to req.user from authMiddleware
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