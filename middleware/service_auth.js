/**
 * middleware/service_auth.js
 * Dedicated Authentication Middleware for Service/Laundry Pages
 */
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Use the same secret as your .env file
const JWT_SECRET = process.env.JWT_SECRET || 'your_default_jwt_secret_please_change_this_for_prod';

// Helper to safely get the ServiceUser model
// This ensures we look in the Service DB, not the Core DB
const getServiceUserModel = () => mongoose.model('ServiceUser');

const serviceAuthMiddleware = async (req, res, next) => {
    // 1. Get Token from Header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ success: false, message: 'No token, authorization denied.' });
    }

    try {
        // 2. Verify Token
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // 3. STRICT SEPARATION CHECK
        // We attempt to find this user in the 'ServiceUser' collection.
        // If they are a Core User (Manager/HR), they won't exist here, so access is blocked.
        const ServiceUser = getServiceUserModel();
        const user = await ServiceUser.findById(decoded.user.id).select('-spasswordHash');

        if (!user) {
            return res.status(403).json({ success: false, message: 'Access Denied: Not a registered Service Staff account.' });
        }

        // 4. Attach user to request
        req.user = user;
        next();

    } catch (err) {
        console.error('Service Auth Middleware Error:', err.message);
        res.status(401).json({ success: false, message: 'Token is not valid or session expired.' });
    }
};

module.exports = { serviceAuthMiddleware };