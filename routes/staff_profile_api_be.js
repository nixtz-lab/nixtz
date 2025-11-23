// routes/staff_profile_api_be.js
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
        // NOTE: nextWeekHolidayRequest added here
        const { name, position, shiftPreference, fixedDayOff, isNightRotator, currentRotationDay, employeeId, nextWeekHolidayRequest } = req.body;
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
            nextWeekHolidayRequest: nextWeekHolidayRequest || 'None', // NEW FIELD SAVED
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
        // Fetches all fields, including the new one
        const profiles = await StaffProfile.find({ user: userId }).sort({ name: 1 }).lean();
        res.json({ success: true, data: profiles });
    } catch (err) {
        console.error('Fetch Staff Profiles Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching profiles.' });
    }
});


/**
 * @route   PUT /api/staff/profile/:id
 * @desc    Update an existing staff member's profile details
 * @access  Private
 */
router.put('/:id', async (req, res) => {
    try {
        // NOTE: nextWeekHolidayRequest added here
        const { name, position, shiftPreference, fixedDayOff, isNightRotator, currentRotationDay, employeeId, nextWeekHolidayRequest } = req.body;
        const userId = req.user.id;
        const profileId = req.params.id;

        const updateData = {
            name,
            position,
            shiftPreference,
            fixedDayOff,
            nextWeekHolidayRequest, // NEW FIELD UPDATED
            isNightRotator,
            currentRotationDay,
            employeeId 
        };

        const updatedProfile = await StaffProfile.findOneAndUpdate(
            { _id: profileId, user: userId },
            { $set: updateData },
            { new: true, runValidators: true }
        );

        if (!updatedProfile) {
            return res.status(404).json({ success: false, message: 'Staff profile not found or unauthorized.' });
        }

        res.json({ success: true, message: `${updatedProfile.name}'s profile updated successfully.`, data: updatedProfile });

    } catch (err) {
        if (err.code === 11000) { 
            return res.status(409).json({ success: false, message: 'Employee ID or Name conflict.' });
        }
        console.error('Update Staff Profile Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error updating staff profile.' });
    }
});

module.exports = router;