// routes/postRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { uploadPostImage } = require('../config/cloudinary');
const {
    createPost,
    getPostsFeed,
    toggleLikePost,
    addPostComment,
    deletePost,
} = require('../controllers/postController');

// Same "wrap multer explicitly so upload failures return clean JSON" pattern
// used across the other upload routes in this app.
const handlePostUpload = (req, res, next) => {
    uploadPostImage.single('image')(req, res, (err) => {
        if (err) {
            console.error('Post upload error:', err.message || err);
            return res.status(400).json({
                success: false,
                message: err.message || 'Image upload failed. Please check the file format and size.',
            });
        }
        next();
    });
};

// POST   /api/posts                 (create — photo + caption)
router.post('/', protect, handlePostUpload, createPost);

// GET    /api/posts                 (paginated feed, newest first)
router.get('/', protect, getPostsFeed);

// PUT    /api/posts/:postId/like    (toggle)
router.put('/:postId/like', protect, toggleLikePost);

// POST   /api/posts/:postId/comment
router.post('/:postId/comment', protect, addPostComment);

// DELETE /api/posts/:postId         (owner only)
router.delete('/:postId', protect, deletePost);

module.exports = router;
