// routes/staff_leave_api_be.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// --- Schema Definition ---
const LeaveHistorySchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    employeeId: { type: String, required: true },
    employeeName: { type: String, required: true },
    leaveDate: { type: Date, required: true },
    leaveType: { 
        type: String, 
        enum: ['Holiday', 'Sick Leave', 'Personal Leave', 'Other', 'Requested'], 
        required: true 
    }
});

let LeaveHistory;
try { LeaveHistory = mongoose.model('LeaveHistory'); } 
catch (error) { LeaveHistory = mongoose.model('LeaveHistory', LeaveHistorySchema); }

// 1. SAVE/LOG LEAVE (POST)
router.post('/history', async (req, res) => {
    try {
        const { employeeId, employeeName, leaveDate, leaveType } = req.body;
        const userId = req.user.id;
        const date = new Date(leaveDate);
        date.setUTCHours(0, 0, 0, 0);

        // Check for duplicates
        const existingEntry = await LeaveHistory.findOne({
            user: userId,
            employeeId: employeeId,
            leaveDate: date
        });

        if (existingEntry) {
            existingEntry.leaveType = leaveType;
            await existingEntry.save();
            return res.status(200).json({ success: true, message: 'Leave updated.' });
        }
        
        const newRecord = new LeaveHistory({
            user: userId,
            employeeId,
            employeeName: employeeName || 'N/A',
            leaveDate: date,
            leaveType
        });
        await newRecord.save();
        res.status(201).json({ success: true, message: 'Leave record saved.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
});

// 2. FETCH REPORT TOTALS (GET)
router.get('/report/:year', async (req, res) => {
    try {
        const userId = req.user.id; 
        const year = parseInt(req.params.year);
        const startDate = new Date(Date.UTC(year, 0, 1));
        const endDate = new Date(Date.UTC(year + 1, 0, 1));

        const pipeline = [
            { $match: { user: new mongoose.Types.ObjectId(userId), leaveDate: { $gte: startDate, $lt: endDate } }},
            { $group: {
                _id: { employeeId: "$employeeId", employeeName: "$employeeName", type: "$leaveType" },
                count: { $sum: 1 }
            }},
            { $group: {
                _id: { employeeId: "$_id.employeeId", employeeName: "$_id.employeeName" },
                breakdown: { $push: { type: "$_id.type", count: "$count" } },
                total: { $sum: "$count" }
            }},
            { $sort: { "_id.employeeName": 1 } }
        ];

        const results = await LeaveHistory.aggregate(pipeline);
        res.json({ success: true, data: results });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error fetching report.' });
    }
});

// 3. GET DETAILS (For Modal)
router.get('/details', async (req, res) => {
    try {
        const { employeeId, year } = req.query;
        const userId = req.user.id;
        const startDate = new Date(Date.UTC(year, 0, 1));
        const endDate = new Date(Date.UTC(parseInt(year) + 1, 0, 1));

        const leaves = await LeaveHistory.find({
            user: userId,
            employeeId: employeeId,
            leaveDate: { $gte: startDate, $lt: endDate }
        }).sort({ leaveDate: -1 });

        res.json({ success: true, data: leaves });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error fetching details.' });
    }
});

// 4. UPDATE RECORD (PUT) - UPDATED TO SUPPORT DATE CHANGE
router.put('/:id', async (req, res) => {
    try {
        const { leaveType, leaveDate } = req.body;
        
        const record = await LeaveHistory.findOne({ _id: req.params.id, user: req.user.id });
        if (!record) return res.status(404).json({ success: false, message: 'Record not found.' });

        if (leaveType) record.leaveType = leaveType;
        
        // Update Date if provided
        if (leaveDate) {
            const newDate = new Date(leaveDate);
            newDate.setUTCHours(0,0,0,0);
            record.leaveDate = newDate;
        }

        await record.save();
        res.json({ success: true, message: 'Record updated.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error updating record.' });
    }
});

// 5. DELETE RECORD (DELETE) - "Cancel Leave"
router.delete('/:id', async (req, res) => {
    try {
        const result = await LeaveHistory.findOneAndDelete({ _id: req.params.id, user: req.user.id });
        if (!result) return res.status(404).json({ success: false, message: 'Record not found.' });
        
        res.json({ success: true, message: 'Leave cancelled (deleted).' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error deleting record.' });
    }
});

module.exports = router;