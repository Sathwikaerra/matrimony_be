// routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const FCMToken = require('../models/FCMToken');
const { protect } = require('../middleware/authMiddleware');

// POST /api/notifications/save-token
router.post('/save-token', protect, async (req, res) => {
  try {
    const { token, deviceType } = req.body;
    const userId = req.user._id;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Token is required' });
    }

    // Upsert — save token for user
    await FCMToken.findOneAndUpdate(
      { userId, token },
      { userId, token, deviceType: deviceType || 'web' },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, message: 'FCM Token saved' });
  } catch (error) {
    console.error('save-token error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/notifications/remove-token
router.post('/remove-token', protect, async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user._id;
    await FCMToken.deleteOne({ userId, token });
    res.status(200).json({ success: true, message: 'Token removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

