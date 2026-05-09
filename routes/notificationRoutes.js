// routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const PushSubscription = require('../models/PushSubscription');
const authMiddleware = require('../middleware/authMiddleware'); // corrected filename

// POST /api/notifications/subscribe
router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const { subscription } = req.body;
    const userId = req.user._id;

    if (!subscription?.endpoint || !subscription?.keys) {
      return res.status(400).json({ success: false, message: 'Invalid subscription object' });
    }

    // Upsert — one subscription per user
    await PushSubscription.findOneAndUpdate(
      { userId },
      { userId, subscription },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, message: 'Subscribed to push notifications' });
  } catch (error) {
    console.error('subscribe error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/notifications/unsubscribe
router.post('/unsubscribe', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    await PushSubscription.deleteOne({ userId });
    res.status(200).json({ success: true, message: 'Unsubscribed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/notifications/status  (optional — check if user is subscribed)
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const sub = await PushSubscription.findOne({ userId: req.user._id });
    res.status(200).json({ success: true, subscribed: !!sub });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
