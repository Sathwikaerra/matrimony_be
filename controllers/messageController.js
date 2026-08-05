// controllers/messageController.js  (UPDATED — push notifications added)
const mongoose = require('mongoose');
const Message  = require('../models/Message');
const User     = require('../models/User');
const { notifyNewMessage } = require('../services/pushService'); // ← ADD THIS

// =========================
// SEND MESSAGE
// =========================
const sendMessage = async (req, res) => {
    try {
        const senderId = req.user._id.toString(); // from JWT, not client body
        const { receiverId, message } = req.body;

        if (!receiverId || !message?.trim()) {
            return res.status(400).json({
                success: false,
                message: 'receiverId and message are required',
            });
        }

        const newMessage = await Message.create({
            senderId,
            receiverId,
            message: message.trim(),
        });

        // ── Push notification ─────────────────────────────────────────────
        // Fire-and-forget (don't await — don't block the response)
        User.findById(senderId).then((sender) => {
            if (sender) {
                notifyNewMessage(receiverId, sender.name, senderId, message.trim());
            }
        });
        // ──────────────────────────────────────────────────────────────────

        res.status(201).json({ success: true, messageData: newMessage });
    } catch (error) {
        console.error('sendMessage error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// SEND MESSAGE WITH FILES (photos/videos)
// =========================
const sendMessageWithFiles = async (req, res) => {
    try {
        const senderId = req.user._id.toString(); // from JWT, not client body
        const { receiverId, message } = req.body;

        if (!receiverId) {
            return res.status(400).json({ success: false, message: 'receiverId is required' });
        }

        const files = req.files || [];
        if (files.length === 0 && !message?.trim()) {
            return res.status(400).json({
                success: false,
                message: 'At least one file or a message is required',
            });
        }

        const images = files.filter(f => f.mimetype.startsWith('image/')).map(f => f.path);
        const videos = files.filter(f => f.mimetype.startsWith('video/')).map(f => f.path);

        const newMessage = await Message.create({
            senderId,
            receiverId,
            message: message?.trim() || '',
            images,
            videos,
        });

        // ── Push notification ─────────────────────────────────────────────
        User.findById(senderId).then((sender) => {
            if (!sender) return;
            let preview = message?.trim();
            if (!preview) {
                if (videos.length) preview = '📹 Sent a video';
                else if (images.length) preview = '📷 Sent a photo';
                else preview = 'Sent an attachment';
            }
            notifyNewMessage(receiverId, sender.name, senderId, preview);
        });
        // ──────────────────────────────────────────────────────────────────

        res.status(201).json({ success: true, messageData: newMessage });
    } catch (error) {
        console.error('sendMessageWithFiles error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// GET MESSAGES
// =========================
const getMessages = async (req, res) => {
    try {
        const { senderId, receiverId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(senderId) || !mongoose.Types.ObjectId.isValid(receiverId)) {
            return res.status(400).json({ success: false, message: 'Invalid user ID' });
        }

        const sId = new mongoose.Types.ObjectId(senderId);
        const rId = new mongoose.Types.ObjectId(receiverId);

        const messages = await Message.find({
            $or: [
                { senderId: sId, receiverId: rId },
                { senderId: rId, receiverId: sId },
            ],
        }).sort({ createdAt: 1 });

        await Message.updateMany(
            { senderId: rId, receiverId: sId, isRead: { $ne: true } },
            { isRead: true }
        );

        res.status(200).json({ success: true, messages });
    } catch (error) {
        console.error('getMessages error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// DELETE MESSAGE
// =========================
const deleteMessage = async (req, res) => {
    try {
        const { msgId } = req.params;
        const msg = await Message.findByIdAndDelete(msgId);

        if (!msg) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }

        res.status(200).json({ success: true, message: 'Message deleted' });
    } catch (error) {
        console.error('deleteMessage error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// RECENT CHATS
// =========================
const getRecentChats = async (req, res) => {
    try {
        const { senderId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(senderId)) {
            return res.status(400).json({ success: false, message: 'Invalid userId' });
        }

        const userObjectId = new mongoose.Types.ObjectId(senderId);

        const recentChats = await Message.aggregate([
            {
                $match: {
                    $or: [
                        { senderId:   userObjectId },
                        { receiverId: userObjectId },
                    ],
                },
            },
            { $sort: { createdAt: -1 } },
            {
                $group: {
                    _id: {
                        $cond: [
                            { $eq: ['$senderId', userObjectId] },
                            '$receiverId',
                            '$senderId',
                        ],
                    },
                    lastMessage: { $first: '$message'   },
                    lastTime:    { $first: '$createdAt' },
                    unreadCount: {
                        $sum: {
                            $cond: [
                                { 
                                    $and: [
                                        { $eq: ['$receiverId', userObjectId] },
                                        { $ne: ['$isRead', true] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    }
                },
            },
            { $sort: { lastTime: -1 } },
            { $limit: 20 },
            {
                $lookup: {
                    from:         'users',
                    localField:   '_id',
                    foreignField: '_id',
                    as:           'userInfo',
                },
            },
            { $unwind: '$userInfo' },
            {
                $project: {
                    _id:         0,
                    lastMessage: 1,
                    lastTime:    1,
                    unreadCount: 1,
                    user: {
                        _id:        '$userInfo._id',
                        name:       '$userInfo.name',
                        photos:     '$userInfo.photos',
                        city:       '$userInfo.city',
                        occupation: '$userInfo.occupation',
                    },
                },
            },
        ]);

        res.status(200).json({
            success: true,
            chats: recentChats,
            users: recentChats.map((c) => c.user),
        });

    } catch (error) {
        console.error('getRecentChats error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// UNREAD COUNT
// =========================
const getUnreadCount = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ success: false, message: 'Invalid userId' });
        }

        const count = await Message.countDocuments({
            receiverId: new mongoose.Types.ObjectId(userId),
            isRead: { $ne: true },
        });

        res.status(200).json({ success: true, count });
    } catch (error) {
        console.error('getUnreadCount error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// MARK AS READ
// =========================
const markAsRead = async (req, res) => {
    try {
        const { senderId }   = req.params;
        const { receiverId } = req.body;

        if (!mongoose.Types.ObjectId.isValid(senderId) || !mongoose.Types.ObjectId.isValid(receiverId)) {
            return res.status(400).json({ success: false, message: 'Invalid IDs' });
        }

        await Message.updateMany(
            {
                senderId:   new mongoose.Types.ObjectId(senderId),
                receiverId: new mongoose.Types.ObjectId(receiverId),
                isRead:     { $ne: true },
            },
            { isRead: true }
        );

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('markAsRead error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    sendMessage,
    sendMessageWithFiles,
    getMessages,
    deleteMessage,
    getRecentChats,
    getUnreadCount,
    markAsRead,
};
