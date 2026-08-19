// routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { uploadWallpaperImage } = require('../config/cloudinary');
const {
    getChatSettings,
    setWallpaper,
    uploadCustomWallpaper,
    clearChat,
    blockUser,
    unblockUser,
} = require('../controllers/chatSettingsController');

// Same "wrap multer explicitly so upload failures return clean JSON" pattern
// as messageRoutes.js/storyRoutes.js/reelRoutes.js.
const handleWallpaperUpload = (req, res, next) => {
    uploadWallpaperImage.single('image')(req, res, (err) => {
        if (err) {
            console.error('Wallpaper upload error:', err.message || err);
            return res.status(400).json({
                success: false,
                message: err.message || 'Image upload failed. Please check the file format and size.',
            });
        }
        next();
    });
};

router.get('/:otherUserId/settings', protect, getChatSettings);
router.put('/:otherUserId/wallpaper', protect, setWallpaper);
router.post('/:otherUserId/wallpaper/upload', protect, handleWallpaperUpload, uploadCustomWallpaper);
router.post('/:otherUserId/clear', protect, clearChat);
router.post('/:otherUserId/block', protect, blockUser);
router.post('/:otherUserId/unblock', protect, unblockUser);

module.exports = router;
