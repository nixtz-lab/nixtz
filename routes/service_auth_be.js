// routes/service_auth_be.js - Dedicated Router for Service Staff Authentication

// ... existing imports ...

// Safely access the core User model
const getUserModel = () => mongoose.model('User');
// ... other functions ...

// --- NEW FUNCTION: Hardcoded Service Admin Creation ---
const createInitialServiceAdmin = async () => {
    const User = getUserModel();
    const adminUsername = 'service_root';
    const adminEmail = 'service_root@nixtz.com'; // Use a dedicated service email

    try {
        let existingUser = await User.findOne({ username: adminUsername });
        
        if (existingUser) {
            console.log(`[SERVICE SETUP] Service Admin (${adminUsername}) already exists.`);
            return;
        }

        // HASH for the temporary password: "ServicePass123"
        const passwordHash = '$2a$10$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'; // REPLACE with a real bcrypt hash!
        
        const newAdmin = new User({
            username: adminUsername,
            email: adminEmail,
            passwordHash: passwordHash,
            role: 'admin', // Critical role for permissions
            membership: 'vip',
            pageAccess: ['laundry_request', 'laundry_staff', 'service_admin']
        });

        await newAdmin.save();
        console.log(`[SERVICE SETUP SUCCESS] Initial Service Admin created: ${adminUsername}. Password: ServicePass123`);

    } catch (error) {
        console.error('[SERVICE SETUP ERROR] Failed to create initial Service Admin:', error.message);
    }
};

// ... other router.post/get handlers ...

// Export the setup function so server.js can call it on startup
module.exports = {
    router,
    createInitialServiceAdmin
};