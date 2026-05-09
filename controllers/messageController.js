// controllers/messageController.js
const mongoose = require('mongoose');
const Message  = require('../models/Message');
const User     = require('../models/User');

// =========================
// SEND MESSAGE
// =========================
const sendMessage = async (req, res) => {
    try {
        const { senderId, receiverId, message } = req.body;

        if (!senderId || !receiverId || !message?.trim()) {
            return res.status(400).json({
                success: false,
                message: 'senderId, receiverId and message are required',
            });
        }

        const newMessage = await Message.create({
            senderId,
            receiverId,
            message: message.trim(),
        });

        res.status(201).json({ success: true, messageData: newMessage });
    } catch (error) {
        console.error('sendMessage error:', error.message);
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

        // Mark received messages as read
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
// RECENT CHATS  ← fixed
// =========================
const getRecentChats = async (req, res) => {
    try {
        const { senderId } = req.params;

        console.log("hittttt recent")

        if (!mongoose.Types.ObjectId.isValid(senderId)) {
            return res.status(400).json({ success: false, message: 'Invalid userId' });
        }

        const userObjectId = new mongoose.Types.ObjectId(senderId);

        const recentChats = await Message.aggregate([
            // 1. Only messages that involve this user
            {
                $match: {
                    $or: [
                        { senderId:   userObjectId },
                        { receiverId: userObjectId },
                    ],
                },
            },
            // 2. Newest first before grouping
            { $sort: { createdAt: -1 } },
            // 3. One doc per conversation (keyed by the OTHER person)
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
                    isRead:      { $first: '$isRead'    },
                },
            },
            { $sort: { lastTime: -1 } },
            { $limit: 20 },
            // 4. Join user info
            {
                $lookup: {
                    from:         'users',
                    localField:   '_id',
                    foreignField: '_id',
                    as:           'userInfo',
                },
            },
            { $unwind: '$userInfo' },
            // 5. Shape output
            {
                $project: {
                    _id:         0,
                    lastMessage: 1,
                    lastTime:    1,
                    isRead:      1,
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
            users: recentChats.map((c) => c.user), // Messages.jsx uses res.data.users
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
    getMessages,
    deleteMessage,
    getRecentChats,
    getUnreadCount,
    markAsRead,
};