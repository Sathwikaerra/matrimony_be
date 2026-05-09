const express = require('express');
const protect = require('../middleware/authMiddleware');
            const User = require('../models/User');



const router = express.Router();

const {
    registerUser,
    loginUser,
    getAllUsers,
    searchUsers,
    
getProfile,
    updateProfile,uploadPhoto, deletePhoto, reorderPhotos,
      likeUser,
  addComment,
  deleteComment,
  getUserComments,
} = require('../controllers/authController');

// routes/authRoutes.js
const { upload } = require('../config/cloudinary');

router.post  ('/photos',         protect, upload.single('photo'), uploadPhoto);
router.delete('/photos',         protect, deletePhoto);
router.put   ('/photos/reorder', protect, reorderPhotos);

router.post('/signup', registerUser);
router.post('/login', loginUser);
router.get('/users',protect, getAllUsers);
router.get('/search', protect, searchUsers);
router.put('/me',      protect, updateProfile);
router.get('/user/:id', protect, getProfile);

// routes/authRoutes.js
router.get('/me', protect, async (req, res) => {
    try {
        console.log("me hittttt",req.user._id)
        const user = await User.findById(req.user._id).select('-password');
        if(!user)
        {
            console.log("hhhhhhhhhh")
            return

        }
         return res.status(200).json({ user });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});


// Like / Unlike
router.put('/like/:userId', protect, likeUser);

// Add Comment
router.post('/comment/:userId', protect, addComment);

// Delete Comment
router.delete(
  '/comment/:userId/:commentId',
  protect,
  deleteComment
);

// Get Comments
router.get('/comment/:userId', protect, getUserComments);


module.exports = router;
