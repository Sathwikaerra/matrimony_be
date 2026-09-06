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
// The field is still named 'image' for both request payload and multer here
// (see config/cloudinary.js) even though uploadAnnouncementImage now accepts
// video files too — createAnnouncement sorts the result into imageUrl or
// videoUrl based on the actual mimetype.
const handleAnnouncementMediaUpload = (req, res, next) => {
    uploadAnnouncementImage.single('image')(req, res, (err) => {
        if (err) {
            console.error('Announcement media upload error:', err.message || err);
            return res.status(400).json({
                success: false,
                message: err.message || 'Upload failed. Please check the file format and size.',
            });
        }
        next();
    });
};

// ── Any logged-in user — read-only ──────────────────────────────────────────
// GET /api/announcements/active?channel=chatBanner|feedBanner
router.get('/active', protect, getActiveAnnouncements);

// ── Admin only — management ─────────────────────────────────────────────────
router.post('/', protect, admin, handleAnnouncementMediaUpload, createAnnouncement);
router.get('/', protect, admin, listAnnouncements);
router.patch('/:id', protect, admin, updateAnnouncement);
router.delete('/:id', protect, admin, deleteAnnouncement);

module.exports = router;
