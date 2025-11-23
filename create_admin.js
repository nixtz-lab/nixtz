require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// --- CONFIGURATION ---
const ADMIN_EMAIL = 'admin@nixtz.com';      // <--- CHANGE THIS
const ADMIN_PASSWORD = 'AdminSecret123!';   // <--- CHANGE THIS
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error("❌ Error: MONGODB_URI is missing in .env file.");
    process.exit(1);
}

// --- USER SCHEMA (Must match your server.js) ---
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

// --- MAIN SCRIPT ---
async function createSuperAdmin() {
    try {
        await mongoose.connect(MONGODB_URI, { dbName: 'nixtz_operations_db' });
        console.log('✅ Connected to MongoDB');

        // 1. Check if user exists
        const existingUser = await User.findOne({ email: ADMIN_EMAIL });
        if (existingUser) {
            console.log(`⚠️  User ${ADMIN_EMAIL} already exists. Skipping creation.`);
            process.exit(0);
        }

        // 2. Hash Password
        console.log('🔐 Hashing password...');
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, salt);

        // 3. Create User
        const newAdmin = new User({
            username: 'SuperAdmin',
            email: ADMIN_EMAIL,
            passwordHash: passwordHash,
            role: 'superadmin',       // <--- Critical: Sets the Super Admin role
            membership: 'vip',        // <--- Critical: Sets highest membership
            pageAccess: ['all']       // <--- Critical: Grants access to all pages
        });

        await newAdmin.save();
        console.log('\n************************************************');
        console.log('🚀 SUPER ADMIN CREATED SUCCESSFULLY');
        console.log(`👤 Email: ${ADMIN_EMAIL}`);
        console.log(`🔑 Password: ${ADMIN_PASSWORD}`);
        console.log('************************************************\n');

    } catch (error) {
        console.error('❌ Failed to create admin:', error);
    } finally {
        mongoose.disconnect();
        console.log('👋 Disconnected from DB');
    }
}

createSuperAdmin();