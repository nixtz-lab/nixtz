// server.js - Nixtz Business Operations Platform Backend
require('dotenv').config();

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const crypto = require('crypto');
const nodemailer = require('nodemailer'); // Keep nodemailer for password reset

const app = express();
const PORT = process.env.PORT || 3000;

// --- CRITICAL CONFIGURATION ---
const JWT_SECRET = process.env.JWT_SECRET || 'your_default_nixtz_secret_please_change_this_for_prod';
const MONGODB_URI = process.env.MONGODB_URI;
// MODIFIED: Use a dedicated database name for the Nixtz platform
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

// --- CORE SCHEMAS KEPT FOR AUTH ---
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    // MODIFIED: Changed currency to location/store
    location: { type: String, default: 'HQ' }, 
    createdAt: { type: Date, default: Date.now },
    role: { type: String, default: 'pending', enum: ['pending', 'standard', 'admin', 'superadmin'] },
    membership: { type: String, default: 'none', enum: ['none', 'standard', 'platinum', 'vip'] },
    pageAccess: { type: [String], default: [] },
    // Removed finance fields (watchlist, resetPasswordToken/Expires) to keep the schema clean for Nixtz
});
const User = mongoose.model('User', UserSchema);

const MembershipConfigSchema = new mongoose.Schema({
    level: { type: String, required: true, unique: true, enum: ['standard', 'platinum', 'vip'] },
    pages: { type: [String], default: [] },
    monthlyPrice: { type: Number, required: true }
});
const MembershipConfig = mongoose.model('MembershipConfig', MembershipConfigSchema);

// --- NEW SCHEMA: STAFF ROSTER ---
const RosterEntrySchema = new mongoose.Schema({
    // Store the planning date range (e.g., the Monday start date of the week)
    weekStartDate: { type: Date, required: true }, 
    employeeName: { type: String, required: true, trim: true },
    employeeId: { type: String, trim: true }, // Optional employee ID/number
    // Array of 7 days, each containing an array of shifts
    weeklySchedule: [{
        dayOfWeek: { type: String, enum: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], required: true },
        shifts: [{ // Array to hold multiple shifts/jobs for the day
            shiftId: { type: Number, enum: [1, 2, 3] }, // 1:Morning, 2:Afternoon, 3:Night
            jobRole: { type: String, enum: ['C1', 'C2', 'C3', 'C4', 'C5', 'Leave'] }, // Job role or Leave
            timeRange: { type: String, default: '' } // e.g., "07:00-16:00"
        }],
    }],
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
});
// Compound index to ensure a unique weekly roster entry per employee
RosterEntrySchema.index({ user: 1, employeeId: 1, weekStartDate: 1 }, { unique: true });
const StaffRoster = mongoose.model('StaffRoster', RosterEntrySchema);

// --- TMT SCHEMAS DELETED:
// BudgetTransaction, TmtStockRating, UserStockRating, PortfolioHolding, BudgetProjection, RetirementProfile, FinancialAsset, PropertyAsset, BusinessAsset, NetWorthSnapshot, TickerScan (All removed)

// -------------------------------------------------------------------
// 2. MIDDLEWARE SETUP
// -------------------------------------------------------------------

// Import the shared auth middleware from the original TMT setup
const { authMiddleware, adminAuthMiddleware, superAdminAuthMiddleware } = require('./middleware/auth'); 

app.use(cors()); 
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// --- API KEYS ---
// REMOVED ALL EXTERNAL API KEYS (YAHU, SIMFIN) AS THEY ARE NO LONGER NEEDED

// -------------------------------------------------------------------
// 3. AUTHENTICATION & ADMIN INITIALIZATION ROUTES (Keep TMT login logic)
// -------------------------------------------------------------------

// Keep /api/auth/register, /api/auth/login, /api/auth/forgot-password, /api/auth/reset-password
// (Assuming these are kept but shortened here for brevity, see original for full code)
// ... [Authentication Routes kept as per TMT server.js] ...

// MODIFIED: Minimal auth and admin routes are kept here, but all finance routes are deleted.
// The user will need to copy the full auth/admin routes from their original server.js.

// -------------------------------------------------------------------
// 4. NIXTZ STAFF ROSTER API ROUTES (NEW)
// -------------------------------------------------------------------

/**
 * @route   GET /api/staff/roster/:startDate
 * @desc    Fetch the staff roster for a specific week's start date
 * @access  Private
 */
app.get('/api/staff/roster/:startDate', authMiddleware, async (req, res) => {
    try {
        const startDate = new Date(req.params.startDate);
        // Ensure date is valid
        if (isNaN(startDate)) {
            return res.status(400).json({ success: false, message: 'Invalid start date format.' });
        }

        const roster = await StaffRoster.find({ 
            user: req.user.id, 
            weekStartDate: startDate 
        }).sort({ employeeName: 1 });

        res.json({ success: true, data: roster });
    } catch (err) {
        console.error('Fetch Roster Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching roster.' });
    }
});

/**
 * @route   POST /api/staff/roster
 * @desc    Save/update the complete staff roster for a week
 * @access  Private
 */
app.post('/api/staff/roster', authMiddleware, async (req, res) => {
    try {
        const { weekStartDate, rosterData } = req.body;
        const userId = req.user.id;
        
        if (!weekStartDate || !Array.isArray(rosterData)) {
            return res.status(400).json({ success: false, message: 'Invalid data format (missing weekStartDate or rosterData).' });
        }

        const startOfDay = new Date(weekStartDate);
        // Set time to midnight UTC for clean indexing (important for timezone neutrality)
        startOfDay.setUTCHours(0, 0, 0, 0); 
        
        const operations = rosterData.map(entry => ({
            // Use updateOne with upsert to insert or update the roster entry
            updateOne: {
                filter: { 
                    user: userId, 
                    employeeId: entry.employeeId, 
                    weekStartDate: startOfDay 
                },
                update: {
                    $set: {
                        employeeName: entry.employeeName,
                        weeklySchedule: entry.weeklySchedule // This is the core schedule data
                    }
                },
                upsert: true
            }
        }));

        // Execute bulk write operation (efficiently updates/inserts all employees)
        const result = await StaffRoster.bulkWrite(operations);

        res.json({ 
            success: true, 
            message: `Roster for week ${weekStartDate} saved successfully.`,
            modifiedCount: result.modifiedCount,
            upsertedCount: result.upsertedCount
        });

    } catch (err) {
        console.error('Save Roster Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error saving roster.' });
    }
});

// -------------------------------------------------------------------
// 5. REMOVED/MOCKED OTHER TMT ROUTES
// -------------------------------------------------------------------
// Removed all TMT routes (stock analysis, transactions, portfolio, etc.)
// Leaving /api/user/profile, /api/user/settings, /api/user/change-password, /api/admin/*
// The original TMT server.js contains the full auth and admin routes which the user should port over.

// -------------------------------------------------------------------
// 6. START SERVER
// -------------------------------------------------------------------

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Local access: http://localhost:${PORT}`);
});

// --- Configure Email Transport (TITAN/HOSTINGER/GODADDY SMTP) ---
// NOTE: This setup relies on the user providing SMTP_USER/PASSWORD environment variables.
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
// Expose the User model for use in auth routes (if copied over)
module.exports = { app, User };