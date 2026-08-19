// routes/reelRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { uploadReelMedia } = require('../config/cloudinary');
const {
    createReel,
    getReelsFeed,
    toggleLikeReel,
    addReelComment,
    deleteReel,
} = require('../controllers/reelController');

// Wrap multer/Cloudinary explicitly so upload failures return clean JSON
// instead of Express's generic HTML error page — same pattern as
// routes/messageRoutes.js's handleChatUpload / storyRoutes.js's handleStoryUpload.
const handleReelUpload = (req, res, next) => {
    uploadReelMedia.single('video')(req, res, (err) => {
        if (err) {
            console.error('Reel upload error:', err.message || err);
            return res.status(400).json({
                success: false,
                message: err.message || 'Video upload failed. Please check the file format and size.',
            });
        }
        next();
    });
};

// POST   /api/reels                 (create — video + caption)
router.post('/', protect, handleReelUpload, createReel);

// GET    /api/reels                 (paginated feed, newest first)
router.get('/', protect, getReelsFeed);

// PUT    /api/reels/:reelId/like    (toggle)
router.put('/:reelId/like', protect, toggleLikeReel);

// POST   /api/reels/:reelId/comment
router.post('/:reelId/comment', protect, addReelComment);

// DELETE /api/reels/:reelId         (owner only)
router.delete('/:reelId', protect, deleteReel);

module.exports = router;
