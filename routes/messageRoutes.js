// routes/messageRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { uploadChatMedia } = require('../config/cloudinary');
const {
    sendMessage,
    sendMessageWithFiles,
    getMessages,
    deleteMessage,
    reactToMessage,
    getRecentChats,
    getUnreadCount,   // ← add
  markAsRead,
} = require('../controllers/messageController');

// ⚠️ IMPORTANT: specific routes MUST come before param routes
// otherwise Express matches 'recent' as :senderId

// POST   /api/messages/send
router.post('/send', protect, sendMessage);

// POST   /api/messages/send-with-files  (photo/video attachments)
// Wrap multer/Cloudinary explicitly so upload failures (bad format, over the
// size limit, Cloudinary rejecting the file, etc.) return a proper JSON error
// instead of falling through to Express's generic HTML error page.
const handleChatUpload = (req, res, next) => {
    uploadChatMedia.array('files', 5)(req, res, (err) => {
        if (err) {
            console.error('Chat media upload error:', err.message || err);
            return res.status(400).json({
                success: false,
                message: err.message || 'File upload failed. Please check the file format and size.',
            });
        }
        next();
    });
};
router.post('/send-with-files', protect, handleChatUpload, sendMessageWithFiles);

// GET    /api/messages/unread-count/:userId
router.get('/unread-count/:userId', protect, getUnreadCount);

// PATCH  /api/messages/mark-read/:senderId
router.patch('/mark-read/:senderId', protect, markAsRead);

// GET    /api/messages/recent/:senderId
router.get('/recent/:senderId', protect, getRecentChats);

// GET    /api/messages/:senderId/:receiverId
router.get('/:senderId/:receiverId', protect, getMessages);

// DELETE /api/messages/:msgId
router.delete('/:msgId', protect, deleteMessage);

// PATCH  /api/messages/:msgId/react
router.patch('/:msgId/react', protect, reactToMessage);

module.exports = router;
