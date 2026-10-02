// routes/theatreRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { uploadTheatreMedia } = require('../config/cloudinary');
const { uploadMedia } = require('../controllers/theatreController');

const handleUpload = (req, res, next) => {
    uploadTheatreMedia.single('media')(req, res, (err) => {
        if (err) {
            console.error('Theatre upload error:', err.message || err);
            return res.status(400).json({
                success: false,
                message: err.message || 'Upload failed. Check the file format and size.',
            });
        }
        next();
    });
};

router.post('/upload', protect, handleUpload, uploadMedia);

module.exports = router;
