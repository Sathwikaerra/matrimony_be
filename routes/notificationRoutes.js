// routes/notificationRoutes.js
const express = require('express');
const router = express.Router();
const FCMToken = require('../models/FCMToken');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/authMiddleware');

// GET /api/notifications — the feed itself (view/like/comment/message events;
// connection requests/matches/declines are read separately from
// /api/connections/* since Connection already carries that state).
router.get('/', protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate('sender', 'name photos');

    res.status(200).json({ success: true, notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', protect, async (req, res) => {
  try {
    await Notification.updateOne(
      { _id: req.params.id, recipient: req.user._id },
      { isRead: true }
    );
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true }
    );
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE /api/notifications/:id — swipe-to-delete on the Notifications feed.
// Scoped to { _id, recipient: req.user._id } in one shot rather than a
// separate find-then-check — deleteOne on a filter that doesn't match (wrong
// owner, or already gone) just reports deletedCount: 0, no info leaked about
// whether the id exists at all.
router.delete('/:id', protect, async (req, res) => {
  try {
    const result = await Notification.deleteOne({ _id: req.params.id, recipient: req.user._id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/notifications/save-token
router.post('/save-token', protect, async (req, res) => {
  try {
    const { token, deviceType } = req.body;
    const userId = req.user._id;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Token is required' });
    }

    // Upsert keyed by token alone — a token is device-scoped, not user-scoped,
    // so re-keying on token lets a fresh login on a shared/reused browser
    // reclaim the row instead of stacking a second owner on top of it.
    await FCMToken.findOneAndUpdate(
      { token },
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
    // Delete by token alone — token is globally unique now, and scoping the
    // delete to req.user's id as well would silently no-op (leaving the
    // stale row behind) if the row had already been reassigned to someone
    // else on this same device since this tab loaded.
    await FCMToken.deleteOne({ token });
    res.status(200).json({ success: true, message: 'Token removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

