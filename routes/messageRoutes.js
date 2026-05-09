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

// GET    /api/messages/recent/:senderId  ← must be BEFORE /:senderId/:receiverId
router.get('/recent/:senderId', getRecentChats);

// GET    /api/messages/:senderId/:receiverId
router.get('/:senderId/:receiverId', getMessages);

// DELETE /api/messages/:msgId
router.delete('/:msgId', deleteMessage);


router.get('/unread-count/:userId',      getUnreadCount);      // ← add (before param routes)
router.patch('/mark-read/:senderId',     markAsRead); 

module.exports = router;    