const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const { generateWeeklyRoster } = require('./staff_roster_generator_be'); 
const StaffRoster = mongoose.model('StaffRoster');
const StaffProfile = mongoose.model('StaffProfile'); 

/**
 * @route   GET /api/staff/roster/:startDate
 * @desc    Fetch the staff roster for a specific week's start date
 * @access  Private 
 */
router.get('/:startDate', async (req, res) => {
    try {
        const userId = req.user.id; 
        const startDate = new Date(req.params.startDate);
        
        if (isNaN(startDate)) {
            return res.status(400).json({ success: false, message: 'Invalid start date format.' });
        }
        
        const roster = await StaffRoster.findOne({ 
            user: userId, 
            weekStartDate: startDate 
        }).lean();

        res.json({ success: true, data: roster ? roster.rosterData : [] });

    } catch (err) {
        console.error('Fetch Roster Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching roster.' });
    }
});


/**
 * @route   GET /api/staff/roster/generate/:startDate
 * @desc    Generate and optionally save a NEW roster for a week
 * @access  Private 
 */
router.get('/generate/:startDate', async (req, res) => {
    try {
        const userId = req.user.id; 
        const startOfWeek = new Date(req.params.startDate);

        if (isNaN(startOfWeek.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid start date format.' });
        }
        
        // 1. Fetch current staff profiles dynamically
        let staffProfiles = await StaffProfile.find({ user: userId }).sort({ name: 1 }).lean();
        
        if (staffProfiles.length === 0) {
            return res.status(404).json({ success: false, message: 'No staff profiles found to generate a roster.' });
        }
        
        // --- CRITICAL DATA SANITIZATION FIX (To bypass corrupt FDO fields) ---
        staffProfiles = staffProfiles.map(profile => {
            if (profile.employeeId === '0001') { // Pae (Manager) -> Fixed Day Off: Sunday
                profile.fixedDayOff = 'Sun'; 
            } else if (profile.employeeId === '0003') { // AM (Supervisor) -> Fixed Day Off: None
                profile.fixedDayOff = 'None';
            }
            // Ensure FDO is always a string ('None' or 'Mon'...'Sun')
            profile.fixedDayOff = profile.fixedDayOff || 'None';
            return profile;
        });
        // --- END CRITICAL FIX ---


        // 2. Generate the roster data array using the dynamic profiles
        const generatedRosterData = generateWeeklyRoster(staffProfiles, startOfWeek);
        
        // 3. Save the generated roster to the database
        const updateResult = await StaffRoster.findOneAndUpdate(
            { user: userId, weekStartDate: startOfWeek },
            { $set: { rosterData: generatedRosterData } },
            { upsert: true, new: true }
        ).lean();

        res.json({ 
            success: true, 
            data: generatedRosterData,
            message: 'Roster successfully generated and saved.' 
        });

    } catch (err) {
        console.error('Generate Roster Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error generating roster.' });
    }
});


/**
 * @route   POST /api/staff/roster
 * @desc    Save/update the complete staff roster for a week
 * @access  Private
 */
router.post('/', async (req, res) => {
    try {
        const { weekStartDate, rosterData } = req.body;
        const userId = req.user.id;
        
        if (!weekStartDate || !Array.isArray(rosterData)) {
            return res.status(400).json({ success: false, message: 'Invalid data format (missing weekStartDate or rosterData).' });
        }

        const startOfDay = new Date(weekStartDate);
        startOfDay.setUTCHours(0, 0, 0, 0); 
        
        const validRosterEntries = rosterData.filter(entry => entry.employeeName && entry.employeeName.trim());

        const result = await StaffRoster.findOneAndUpdate(
            { user: userId, weekStartDate: startOfDay },
            { $set: { rosterData: validRosterEntries } },
            { upsert: true, new: true }
        );

        res.json({ 
            success: true, 
            message: `Roster for week ${weekStartDate} saved successfully. Total entries: ${validRosterEntries.length}.`,
            totalEntries: validRosterEntries.length
        });

    } catch (err) {
        console.error('Save Roster Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error saving roster.' });
    }
});

module.exports = router;