// routes/staff_leave_api_be.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// --- Define the LeaveHistory Schema/Model (assuming MongoDB structure) ---
// Note: You must ensure this model is defined and registered in your Mongoose setup.
const LeaveHistorySchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    employeeId: { type: String, required: true },
    employeeName: { type: String, required: true },
    leaveDate: { type: Date, required: true },
    leaveType: { type: String, enum: ['Holiday', 'Sick Leave', 'Other', 'Requested'], required: true }
});

// Assuming the model is registered globally, or defining it locally for context:
let LeaveHistory;
try {
    LeaveHistory = mongoose.model('LeaveHistory');
} catch (error) {
    LeaveHistory = mongoose.model('LeaveHistory', LeaveHistorySchema);
}
// --------------------------------------------------------------------------

/**
 * @route   POST /api/staff/leave/history
 * @desc    Log a new permanent leave record
 * @access  Private
 */
router.post('/history', async (req, res) => {
    try {
        const { employeeId, employeeName, leaveDate, leaveType } = req.body;
        const userId = req.user.id;
        
        if (!employeeId || !leaveDate || !leaveType) {
            return res.status(400).json({ success: false, message: 'Missing required leave fields.' });
        }
        
        // Convert string date to Date object and set to start of day (UTC)
        const date = new Date(leaveDate);
        date.setUTCHours(0, 0, 0, 0);

        // Check for duplicate entry on the same day for the same employee
        const existingEntry = await LeaveHistory.findOne({
            user: userId,
            employeeId: employeeId,
            leaveDate: date
        });

        if (existingEntry) {
            return res.status(200).json({ success: false, message: 'Leave already logged for this date.' });
        }
        
        const newRecord = new LeaveHistory({
            user: userId,
            employeeId,
            employeeName: employeeName || 'N/A',
            leaveDate: date,
            leaveType
        });

        await newRecord.save();

        res.status(201).json({ success: true, message: 'Leave record saved successfully.' });

    } catch (err) {
        console.error('Save Leave History Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error saving leave history.' });
    }
});


/**
 * @route   GET /api/staff/leave/report/:year
 * @desc    Fetch aggregated leave data for a specific year
 * @access  Private
 */
router.get('/report/:year', async (req, res) => {
    try {
        const userId = req.user.id; 
        const year = parseInt(req.params.year);
        
        if (isNaN(year) || year < 2000) {
            return res.status(400).json({ success: false, message: 'Invalid year format.' });
        }
        
        const startDate = new Date(Date.UTC(year, 0, 1));
        const endDate = new Date(Date.UTC(year + 1, 0, 1));

        const pipeline = [
            { $match: { 
                user: userId, 
                leaveDate: { $gte: startDate, $lt: endDate } 
            }},
            { $group: {
                _id: { employeeId: "$employeeId", employeeName: "$employeeName", leaveType: "$leaveType" },
                count: { $sum: 1 }
            }},
            { $group: {
                _id: { employeeId: "$_id.employeeId", employeeName: "$_id.employeeName" },
                types: { $push: { leaveType: "$_id.leaveType", count: "$count" } },
                totalDays: { $sum: "$count" }
            }},
            { $sort: { "_id.employeeName": 1 } }
        ];

        const results = await LeaveHistory.aggregate(pipeline);

        res.json({ success: true, data: results });

    } catch (err) {
        console.error('Fetch Leave Report Error:', err.message);
        res.status(500).json({ success: false, message: 'Server error fetching leave report.' });
    }
});


module.exports = router;