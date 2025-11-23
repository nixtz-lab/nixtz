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

// --- NIXTZ SCHEMA: STAFF PROFILE (NEW) ---
const StaffProfileSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    employeeId: { type: String, unique: true, required: true, trim: true },
    position: { type: String, required: true, enum: ['Manager', 'Supervisor', 'Delivery', 'Normal Staff'] },
    shiftPreference: { type: String, default: 'Morning' }, 
    fixedDayOff: { type: String, enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'None'], default: 'None' },
    isNightRotator: { type: Boolean, default: false },
    currentRotationDay: { type: Number, default: 0 }, 
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
});
StaffProfileSchema.index({ user: 1, employeeId: 1 }, { unique: true });
const StaffProfile = mongoose.model('StaffProfile', StaffProfileSchema); 


// --- NIXTZ SCHEMA: STAFF ROSTER (Existing) ---
const RosterEntrySchema = new mongoose.Schema({
    weekStartDate: { type: Date, required: true }, 
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
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
const { authMiddleware, adminAuthMiddleware, superAdminAuthMiddleware } = require('./middleware/auth'); 

app.use(cors()); 
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// -------------------------------------------------------------------
// 3. ROUTE IMPORTS 
// -------------------------------------------------------------------
// FIX: Corrected import to assume files are in a 'routes' folder and use the correct names
const staffRosterRoutes = require('./routes/staff_roster_api.js'); 
const staffProfileRoutes = require('./routes/staff_profile_api_be.js'); 


// -------------------------------------------------------------------
// 4. ROUTE DEFINITIONS & MOUNTING
// -------------------------------------------------------------------

// --- AUTHENTICATION ROUTES (PLACEHOLDERS) ---
app.post('/api/auth/register', (req, res) => res.status(501).json({ success: false, message: 'Auth routes need to be copied from TMT server.js' }));
app.post('/api/auth/login', (req, res) => res.status(501).json({ success: false, message: 'Auth routes need to be copied from TMT server.js' }));
app.get('/api/user/profile', authMiddleware, (req, res) => res.status(501).json({ success: false, message: 'Profile route not implemented yet.' }));

// --- NIXTZ OPERATIONAL ROUTES ---
// Mount the Staff Profile routes (New)
app.use('/api/staff/profile', authMiddleware, staffProfileRoutes); 

// Mount the Staff Roster routes (Existing)
app.use('/api/staff/roster', authMiddleware, staffRosterRoutes); 

// -------------------------------------------------------------------
// 5. START SERVER
// -------------------------------------------------------------------

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Local access: http://localhost:${PORT}`);
});

module.exports = { app, User, StaffRoster, StaffProfile };