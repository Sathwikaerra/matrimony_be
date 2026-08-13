// routes/announcementRoutes.js
const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const { uploadAnnouncementImage } = require('../config/cloudinary');
const {
    createAnnouncement,
    listAnnouncements,
    updateAnnouncement,
    deleteAnnouncement,
    getActiveAnnouncements,
} = require('../controllers/announcementController');

// Guard — catches undefined imports before Express does (same pattern as lockerRoutes.js)
[createAnnouncement, listAnnouncements, updateAnnouncement, deleteAnnouncement, getActiveAnnouncements]
    .forEach((fn, i) => {
        if (typeof fn !== 'function') throw new Error(`announcementController export #${i} is not a function`);
    });

// Wrap multer/Cloudinary explicitly so upload failures return clean JSON
// instead of Express's generic HTML error page (same pattern as storyRoutes.js).
const handleAnnouncementImageUpload = (req, res, next) => {
    uploadAnnouncementImage.single('image')(req, res, (err) => {
        if (err) {
            console.error('Announcement image upload error:', err.message || err);
            return res.status(400).json({
                success: false,
                message: err.message || 'Image upload failed. Please check the file format and size.',
            });
        }
        next();
    });
};

// ── Any logged-in user — read-only ──────────────────────────────────────────
// GET /api/announcements/active?channel=chatBanner|feedBanner
router.get('/active', protect, getActiveAnnouncements);

// ── Admin only — management ─────────────────────────────────────────────────
router.post('/', protect, admin, handleAnnouncementImageUpload, createAnnouncement);
router.get('/', protect, admin, listAnnouncements);
router.patch('/:id', protect, admin, updateAnnouncement);
router.delete('/:id', protect, admin, deleteAnnouncement);

module.exports = router;
