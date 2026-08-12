// routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
    getChatSettings,
    setWallpaper,
    clearChat,
    blockUser,
    unblockUser,
} = require('../controllers/chatSettingsController');

router.get('/:otherUserId/settings', protect, getChatSettings);
router.put('/:otherUserId/wallpaper', protect, setWallpaper);
router.post('/:otherUserId/clear', protect, clearChat);
router.post('/:otherUserId/block', protect, blockUser);
router.post('/:otherUserId/unblock', protect, unblockUser);

module.exports = router;
