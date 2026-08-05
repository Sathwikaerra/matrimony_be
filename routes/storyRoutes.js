// routes/storyRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { uploadStoryMedia } = require('../config/cloudinary');
const {
    createStory,
    getStoriesFeed,
    getHighlights,
    viewStory,
    getStoryViewers,
    deleteStory,
} = require('../controllers/storyController');

// Wrap multer/Cloudinary explicitly so upload failures return clean JSON
// instead of falling through to Express's generic HTML error page
// (same pattern as routes/messageRoutes.js's handleChatUpload).
const handleStoryUpload = (req, res, next) => {
    uploadStoryMedia.single('media')(req, res, (err) => {
        if (err) {
            console.error('Story media upload error:', err.message || err);
            return res.status(400).json({
                success: false,
                message: err.message || 'File upload failed. Please check the file format and size.',
            });
        }
        next();
    });
};

// POST   /api/stories             (create — photo/video)
router.post('/', protect, handleStoryUpload, createStory);

// GET    /api/stories/feed        (own + accepted-connections' stories, grouped by user)
router.get('/feed', protect, getStoriesFeed);

// GET    /api/stories/highlights/:userId   (permanent, 12h+ survived stories)
router.get('/highlights/:userId', protect, getHighlights);

// POST   /api/stories/:storyId/view
router.post('/:storyId/view', protect, viewStory);

// GET    /api/stories/:storyId/viewers   (owner only — who viewed, and when)
router.get('/:storyId/viewers', protect, getStoryViewers);

// DELETE /api/stories/:storyId    (owner only)
router.delete('/:storyId', protect, deleteStory);

module.exports = router;
