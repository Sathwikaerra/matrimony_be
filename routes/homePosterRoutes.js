// routes/homePosterRoutes.js
const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const { uploadHomePosterImage } = require('../config/cloudinary');
const {
    createHomePoster,
    listHomePosters,
    updateHomePoster,
    deleteHomePoster,
    getActiveHomePosters,
} = require('../controllers/homePosterController');

// Guard — catches undefined imports before Express does (same pattern as
// announcementRoutes.js / lockerRoutes.js).
[createHomePoster, listHomePosters, updateHomePoster, deleteHomePoster, getActiveHomePosters]
    .forEach((fn, i) => {
        if (typeof fn !== 'function') throw new Error(`homePosterController export #${i} is not a function`);
    });

// Wrap multer/Cloudinary explicitly so upload failures return clean JSON
// instead of Express's generic HTML error page (same pattern as
// announcementRoutes.js / storyRoutes.js).
const handlePosterImageUpload = (req, res, next) => {
    uploadHomePosterImage.single('image')(req, res, (err) => {
        if (err) {
            console.error('Home poster image upload error:', err.message || err);
            return res.status(400).json({
                success: false,
                message: err.message || 'Upload failed. Please check the file format and size.',
            });
        }
        next();
    });
};

// ── Any logged-in user — read-only ──────────────────────────────────────────
router.get('/active', protect, getActiveHomePosters);

// ── Admin only — management ─────────────────────────────────────────────────
router.post('/', protect, admin, handlePosterImageUpload, createHomePoster);
router.get('/', protect, admin, listHomePosters);
router.patch('/:id', protect, admin, updateHomePoster);
router.delete('/:id', protect, admin, deleteHomePoster);

module.exports = router;
