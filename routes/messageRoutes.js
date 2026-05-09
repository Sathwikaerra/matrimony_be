// routes/messageRoutes.js
const express = require('express');
const router = express.Router();
const {
    sendMessage,
    getMessages,
    deleteMessage,
    getRecentChats,
    getUnreadCount,   // ← add
  markAsRead,   
} = require('../controllers/messageController');

// ⚠️ IMPORTANT: specific routes MUST come before param routes
// otherwise Express matches 'recent' as :senderId

// POST   /api/messages/send
router.post('/send', sendMessage);

// GET    /api/messages/unread-count/:userId
router.get('/unread-count/:userId', getUnreadCount);

// PATCH  /api/messages/mark-read/:senderId
router.patch('/mark-read/:senderId', markAsRead);

// GET    /api/messages/recent/:senderId
router.get('/recent/:senderId', getRecentChats);

// GET    /api/messages/:senderId/:receiverId
router.get('/:senderId/:receiverId', getMessages);

// DELETE /api/messages/:msgId
router.delete('/:msgId', deleteMessage);
module.exports = router;    