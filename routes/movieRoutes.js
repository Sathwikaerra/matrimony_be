// routes/movieRoutes.js
const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const { uploadMovieFiles } = require('../config/cloudinary');
const {
    createMovie,
    getMyMovies,
    listMovies,
    updateMovie,
    deleteMovie,
} = require('../controllers/movieController');

const handleMovieUpload = (req, res, next) => {
    uploadMovieFiles.fields([
        { name: 'poster', maxCount: 1 },
        { name: 'video', maxCount: 1 },
    ])(req, res, (err) => {
        if (err) {
            console.error('Movie upload error:', err.message || err);
            return res.status(400).json({
                success: false,
                message: err.message || 'Upload failed. Check the file formats and sizes.',
            });
        }
        next();
    });
};

router.get('/mine', protect, getMyMovies);
router.post('/', protect, handleMovieUpload, createMovie);
router.get('/', protect, admin, listMovies);
router.patch('/:id', protect, updateMovie);
router.delete('/:id', protect, deleteMovie);

module.exports = router;
