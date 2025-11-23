// server.js - NIXTZ BUSINESS OPERATIONS PLATFORM BACKEND
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
    .then(() => {
        console.log('MongoDB Connected Successfully to NIXTZ DB');
        
        // --- TEMP: RUN ADMIN CREATION ON CONNECT ---
        createTempSuperAdmin(); 
    })
    .catch(err => {
        console.error('MongoDB Connection Error:', err.message);
        process.exit(1);
    });

// --- CORE SCHEMAS ---
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

// --- STAFF PROFILE SCHEMA ---
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

// --- STAFF ROSTER SCHEMA ---
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


// --- TEMPORARY FUNCTION: CREATE SUPER ADMIN ---
// !!! REMOVE OR COMMENT OUT THIS FUNCTION AFTER USE !!!
async function createTempSuperAdmin() {
    try {
        const email = 'admin@nixtz.com'; // <--- CHANGE THIS EMAIL IF YOU WANT
        const password = 'AdminSecret123!'; // <--- CHANGE THIS PASSWORD IF YOU WANT
        
        const existingUser = await User.findOne({ email: email });
        if (existingUser) {
            console.log('>>> ADMIN CHECK: User already exists. Skipping creation.');
            return;
        }

        console.log('>>> Creating Super Admin User...');
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const newAdmin = new User({
            username: 'SuperAdmin',
            email: email,
            passwordHash: passwordHash,
            role: 'superadmin',
            membership: 'vip',
            pageAccess: ['all'] // Special flag for full access
        });

        await newAdmin.save();
        console.log('***********************************************');
        console.log('*** SUPER ADMIN ACCOUNT CREATED SUCCESSFULLY ***');
        console.log(`*** Email: ${email} `);
        console.log(`*** Password: ${password} `);
        console.log('***********************************************');

    } catch (error) {
        console.error('>>> FAILED to create Super Admin:', error.message);
    }
}


// --- Configure Email Transport ---
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtpout.secureserver.net', 
    port: process.env.SMTP_PORT || 465,
    secure: true, 
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD 
    },
    tls: { rejectUnauthorized: false }
});

// -------------------------------------------------------------------
// 2. MIDDLEWARE SETUP
// -------------------------------------------------------------------
const { authMiddleware } = require('./middleware/auth'); 

app.use(cors()); 
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// -------------------------------------------------------------------
// 3. ROUTE IMPORTS 
// -------------------------------------------------------------------
const staffRosterRoutes = require('./routes/staff_roster_api.js'); 
const staffProfileRoutes = require('./routes/staff_profile_api_be.js'); 

// -------------------------------------------------------------------
// 4. ROUTE DEFINITIONS & MOUNTING
// -------------------------------------------------------------------

// --- AUTH ROUTES (Direct implementation for Login/Register needed for this to work) ---
// You mentioned you would copy these, but for the Admin login to work, 
// make sure your /api/auth/login route checks bcrypt password correctly!

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

        const token = jwt.sign(
            { id: user._id, role: user.role },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                membership: user.membership,
                pageAccess: user.pageAccess
            }
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// --- NIXTZ OPERATIONAL ROUTES ---
app.use('/api/staff/profile', authMiddleware, staffProfileRoutes); 
app.use('/api/staff/roster', authMiddleware, staffRosterRoutes); 

// -------------------------------------------------------------------
// 5. START SERVER
// -------------------------------------------------------------------

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = { app, User, StaffRoster, StaffProfile };