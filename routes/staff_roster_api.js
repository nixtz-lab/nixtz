const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// --- Assume Models and Middleware are available via injection or simple global scope ---
// Since this file requires models from server.js, we assume Mongoose models are globally accessible
// or imported via a separate model file structure. For simplicity, we redefine the Mongoose model here
// for clarity, although typically you'd export models from a dedicated file (e.g., /models/Roster.js).

// NOTE: Since the User and RosterEntry schemas are defined and compiled in server.js,
// we retrieve the models here using mongoose.model().
const StaffRoster = mongoose.model('StaffRoster');

/**
 * @route   GET /api/staff/roster/:startDate
 * @desc    Fetch the staff roster for a specific week's start date
 * @access  Private (Requires authMiddleware which should be mounted before this router)
 */
router.get('/:startDate', async (req, res) => {
    try {
        // req.user.id is available because authMiddleware runs before this router
        const userId = req.user.id; 
        const startDate = new Date(req.params.startDate);
        
        if (isNaN(startDate)) {
            return res.status(400).json({ success: false, message: 'Invalid start date format.' });
        }

        const roster = await StaffRoster.find({ 
            user: userId, 
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
router.post('/', async (req, res) => {
    try {
        const { weekStartDate, rosterData } = req.body;
        const userId = req.user.id;
        
        if (!weekStartDate || !Array.isArray(rosterData)) {
            return res.status(400).json({ success: false, message: 'Invalid data format (missing weekStartDate or rosterData).' });
        }

        const startOfDay = new Date(weekStartDate);
        startOfDay.setUTCHours(0, 0, 0, 0); 
        
        // Filter out employees without a name or where they are intentionally blank
        const validRosterEntries = rosterData.filter(entry => entry.employeeName && entry.employeeName.trim());

        const operations = validRosterEntries.map(entry => ({
            updateOne: {
                filter: { 
                    user: userId, 
                    employeeId: entry.employeeId, 
                    weekStartDate: startOfDay 
                },
                update: {
                    $set: {
                        employeeName: entry.employeeName,
                        weeklySchedule: entry.weeklySchedule
                    }
                },
                upsert: true
            }
        }));

        if (operations.length === 0) {
            return res.json({ success: true, message: "No valid staff members submitted for saving." });
        }

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

module.exports = router;