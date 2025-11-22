const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Retrieve model 
const StaffProfile = mongoose.model('StaffProfile');

/**
 * @route   POST /api/staff/profile/add
 * @desc    Add a new staff member profile
 * @access  Private
 */
router.post('/add', async (req, res) => {
    try {
        const { name, position, shiftPreference, fixedDayOff, isNightRotator, currentRotationDay, employeeId } = req.body;
        const userId = req.user.id;
        
        if (!name || !position || !employeeId) {
            return res.status(400).json({ success: false, message: 'Missing required fields: Name, Position, or Employee ID.' });
        }
        
        const newStaff = new StaffProfile({
            name,
            employeeId,
            position,
            shiftPreference: shiftPreference || 'Morning',
            fixedDayOff: fixedDayOff || 'None',
            isNightRotator: isNightRotator || false,
            currentRotationDay: currentRotationDay || 0,
            user: userId
        });

        await newStaff.save();

        res.status(201).json({ success: true, message: `New staff member '${name}' added successfully.`, data: newStaff });

    } catch (err) {
        if (err.code === 11000) { 
            return res.status(409).json({ success: false, message: 'Staff name or Employee ID already exists.' });
        }
        console.error('Add Staff Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error adding staff.' });
    }
});

/**
 * @route   GET /api/staff/profile
 * @desc    Fetch all staff profiles (Used by the generator)
 * @access  Private
 */
router.get('/', async (req, res) => {
    try {
        const userId = req.user.id;
        const profiles = await StaffProfile.find({ user: userId }).sort({ name: 1 }).lean();
        res.json({ success: true, data: profiles });
    } catch (err) {
        console.error('Fetch Staff Profiles Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching profiles.' });
    }
});

module.exports = router;