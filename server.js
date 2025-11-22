// server.js - NIXTZ BUSINESS OPERATIONS PLATFORM BACKEND (Cleaned of Finance/Stock Logic)
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

// --- CRITICAL CONFIGURATION ---
const JWT_SECRET = process.env.JWT_SECRET || 'your_default_nixtz_secret_please_change_this_for_prod';
const MONGODB_URI = process.env.MONGODB_URI;
const DATABASE_NAME = 'nixtz_operations_db';

if (!MONGODB_URI) {
    console.error("FATAL ERROR: MONGODB_URI is not defined in environment variables. Server cannot start.");
    process.exit(1);
}

// -------------------------------------------------------------------
// 1. MONGODB CONNECTION & SCHEMAS
// -------------------------------------------------------------------

mongoose.connect(MONGODB_URI, { dbName: DATABASE_NAME })
    .then(() => console.log('MongoDB Connected Successfully to NIXTZ DB'))
    .catch(err => {
        console.error('MongoDB Connection Error:', err.message);
        process.exit(1);
    });

// --- CORE SCHEMAS KEPT FOR AUTH & CONFIG ---
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    location: { type: String, default: 'HQ' }, 
    createdAt: { type: Date, default: Date.now },
    role: { type: String, default: 'pending', enum: ['pending', 'standard', 'admin', 'superadmin'] },
    membership: { type: String, default: 'none', enum: ['none', 'standard', 'platinum', 'vip'] },
    pageAccess: { type: [String], default: [] },
});
const User = mongoose.model('User', UserSchema);

const MembershipConfigSchema = new mongoose.Schema({
    level: { type: String, required: true, unique: true, enum: ['standard', 'platinum', 'vip'] },
    pages: { type: [String], default: [] },
    monthlyPrice: { type: Number, required: true }
});
const MembershipConfig = mongoose.model('MembershipConfig', MembershipConfigSchema);

// --- NIXTZ SCHEMA: STAFF ROSTER (New Operational Schema) ---
const RosterEntrySchema = new mongoose.Schema({
    weekStartDate: { type: Date, required: true }, 
    employeeName: { type: String, required: true, trim: true },
    employeeId: { type: String, trim: true },
    weeklySchedule: [{
        dayOfWeek: { type: String, enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], required: true },
        shifts: [{ 
            shiftId: { type: Number, enum: [1, 2, 3] },
            jobRole: { type: String, enum: ['C1', 'C2', 'C3', 'C4', 'C5', 'Leave'] },
            timeRange: { type: String, default: '' }
        }],
    }],
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
});
RosterEntrySchema.index({ user: 1, employeeId: 1, weekStartDate: 1 }, { unique: true });
const StaffRoster = mongoose.model('StaffRoster', RosterEntrySchema);

// --- Configure Email Transport (Kept for password reset functionality) ---
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtpout.secureserver.net', 
    port: process.env.SMTP_PORT || 465,
    secure: true, 
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD 
    },
    tls: {
        rejectUnauthorized: false
    }
});

// -------------------------------------------------------------------
// 2. MIDDLEWARE SETUP
// -------------------------------------------------------------------
// Assuming auth middleware file exists and exports these:
const { authMiddleware, adminAuthMiddleware, superAdminAuthMiddleware } = require('./middleware/auth'); 

app.use(cors()); 
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// -------------------------------------------------------------------
// 3. ROUTE IMPORTS
// -------------------------------------------------------------------
// NEW: Import the dedicated Staff Roster API router
const staffRosterRoutes = require('./routes/staff_roster_api.js');


// -------------------------------------------------------------------
// 4. ROUTE DEFINITIONS & MOUNTING
// -------------------------------------------------------------------

// --- AUTHENTICATION ROUTES (PLACEHOLDERS - MUST BE REPLACED) ---
// IMPORTANT: You MUST copy the full implementation of these functions 
// (register, login, etc.) from your original TMT server.js file into 
// this new server.js file to make authentication work.
app.post('/api/auth/register', (req, res) => res.status(501).json({ success: false, message: 'Auth routes need to be copied from TMT server.js' }));
app.post('/api/auth/login', (req, res) => res.status(501).json({ success: false, message: 'Auth routes need to be copied from TMT server.js' }));
app.get('/api/user/profile', authMiddleware, (req, res) => res.status(501).json({ success: false, message: 'Profile route not implemented yet.' }));

// --- NIXTZ OPERATIONAL ROUTES ---
// Mount the Staff Roster routes, protected by authentication
app.use('/api/staff/roster', authMiddleware, staffRosterRoutes); 

// -------------------------------------------------------------------
// 5. START SERVER
// -------------------------------------------------------------------

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Local access: http://localhost:${PORT}`);
});

module.exports = { app, User };