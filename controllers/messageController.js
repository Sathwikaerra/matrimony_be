// controllers/messageController.js  (UPDATED — push notifications added)
const mongoose = require('mongoose');
const Message  = require('../models/Message');
const User     = require('../models/User');
const { notifyNewMessage } = require('../services/pushService'); // ← ADD THIS
const SocketService = require('../services/socketService');
const { isConnected } = require('../utils/isConnected');
const Block = require('../models/Block');
const ChatClear = require('../models/ChatClear');
const { recordMessage } = require('../services/chatStreakService');

// Messaging is gated to accepted connections, same rule as calling
// (socket/socket.js's callUser) — either side being an admin bypasses it,
// same reasoning as there: admin accounts don't go through the normal
// interest/accept matchmaking flow with every user they may need to reach.
// Blocking sits on top of that and is checked first — a block always wins
// even between two connected/admin users, and the reason code lets the
// frontend show the right one of "you blocked them" vs "they blocked you"
// vs "not connected" instead of one generic error.
async function getMessagingRestriction(senderId, receiverId) {
    const [blockedByMe, blockedByThem] = await Promise.all([
        Block.exists({ blocker: senderId, blocked: receiverId }),
        Block.exists({ blocker: receiverId, blocked: senderId }),
    ]);
    if (blockedByMe) return { allowed: false, reason: 'blocked_by_me' };
    if (blockedByThem) return { allowed: false, reason: 'blocked_by_them' };

    const [sender, receiver] = await Promise.all([
        User.findById(senderId).select('role'),
        User.findById(receiverId).select('role'),
    ]);
    if (sender?.role === 'admin' || receiver?.role === 'admin') return { allowed: true };

    const connected = await isConnected(senderId, receiverId);
    return connected ? { allowed: true } : { allowed: false, reason: 'not_connected' };
}

const RESTRICTION_MESSAGES = {
    blocked_by_me: 'You have blocked this user',
    blocked_by_them: 'You are blocked by this user',
    not_connected: 'You can only message users you are connected with',
};

// Bumps the pair's streak/message-count (services/chatStreakService.js) and
// broadcasts a celebratory event if a milestone was just crossed. Awaited
// (unlike the push notification below) because the response carries the
// fresh streak value back to the sender's own chat header immediately,
// without a second round trip.
async function bumpStreak(senderId, receiverId) {
    try {
        const result = await recordMessage(senderId, receiverId);
        for (const milestone of result.milestones) {
            SocketService.emitChatMilestone(senderId, receiverId, milestone);
        }
        return { streak: result.streak, totalMessages: result.totalMessages };
    } catch (error) {
        console.error('bumpStreak error:', error.message);
        return null;
    }
}

// Selected fields when a message quotes another one (swipe-to-reply) — just
// enough for the quoted preview: text/media to show, and senderId so the
// frontend can label it "You" vs the other person's name without a second
// nested populate.
const REPLY_PREVIEW_FIELDS = 'message images videos audios senderId isDeleted';

// A reply target must actually exist and belong to the same conversation
// as the two people sending/receiving this new message — otherwise anyone
// could quote an arbitrary message from an unrelated conversation they're
// not even part of.
async function resolveReplyTo(replyTo, senderId, receiverId) {
    if (!replyTo) return undefined;
    if (!mongoose.Types.ObjectId.isValid(replyTo)) return undefined;
    const original = await Message.findOne({
        _id: replyTo,
        $or: [
            { senderId, receiverId },
            { senderId: receiverId, receiverId: senderId },
        ],
    }).select('_id');
    return original ? original._id : undefined;
}

// =========================
// SEND MESSAGE
// =========================
const sendMessage = async (req, res) => {
    try {
        const senderId = req.user._id.toString(); // from JWT, not client body
        const { receiverId, message, replyTo } = req.body;

        if (!receiverId || !message?.trim()) {
            return res.status(400).json({
                success: false,
                message: 'receiverId and message are required',
            });
        }

        const restriction = await getMessagingRestriction(senderId, receiverId);
        if (!restriction.allowed) {
            return res.status(403).json({
                success: false,
                reason: restriction.reason,
                message: RESTRICTION_MESSAGES[restriction.reason],
            });
        }

        const newMessage = await Message.create({
            senderId,
            receiverId,
            message: message.trim(),
            replyTo: await resolveReplyTo(replyTo, senderId, receiverId),
        });
        if (newMessage.replyTo) await newMessage.populate('replyTo', REPLY_PREVIEW_FIELDS);

        const streakInfo = await bumpStreak(senderId, receiverId);

        // ── Push notification ─────────────────────────────────────────────
        // Fire-and-forget (don't await — don't block the response). Only the
        // FCM push (for background/closed-tab delivery) — new messages are
        // deliberately NOT written to the in-app Notifications feed
        // (services/notificationStore.js): they already have their own
        // real-time badge on the Messages nav icon, so a duplicate row in
        // Notifications was just noise (and per-request, that feed should
        // only ever show follow/profile-view activity).
        User.findById(senderId).then((sender) => {
            if (sender) {
                notifyNewMessage(receiverId, sender.name, senderId, message.trim());
            }
        });
        // ──────────────────────────────────────────────────────────────────

        res.status(201).json({ success: true, messageData: newMessage, streakInfo });
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
        const { receiverId, message, replyTo } = req.body;

        if (!receiverId) {
            return res.status(400).json({ success: false, message: 'receiverId is required' });
        }

        // Same rule as sendMessage — checked here rather than as upload
        // middleware for simplicity; the minor cost is that a blocked
        // attempt's files still made it to Cloudinary before this runs
        // (multer/uploadChatMedia already ran), which only matters for the
        // rare rejected case.
        const restriction = await getMessagingRestriction(senderId, receiverId);
        if (!restriction.allowed) {
            return res.status(403).json({
                success: false,
                reason: restriction.reason,
                message: RESTRICTION_MESSAGES[restriction.reason],
            });
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
        const audios = files.filter(f => f.mimetype.startsWith('audio/')).map(f => f.path);

        const newMessage = await Message.create({
            senderId,
            receiverId,
            message: message?.trim() || '',
            images,
            videos,
            audios,
            replyTo: await resolveReplyTo(replyTo, senderId, receiverId),
        });
        if (newMessage.replyTo) await newMessage.populate('replyTo', REPLY_PREVIEW_FIELDS);

        const streakInfo = await bumpStreak(senderId, receiverId);

        // ── Push notification ─────────────────────────────────────────────
        // Same as sendMessage above — FCM push only, no Notifications-feed row.
        User.findById(senderId).then((sender) => {
            if (!sender) return;
            let preview = message?.trim();
            if (!preview) {
                if (audios.length) preview = '🎤 Sent a voice message';
                else if (videos.length) preview = '📹 Sent a video';
                else if (images.length) preview = '📷 Sent a photo';
                else preview = 'Sent an attachment';
            }
            notifyNewMessage(receiverId, sender.name, senderId, preview);
        });
        // ──────────────────────────────────────────────────────────────────

        res.status(201).json({ success: true, messageData: newMessage, streakInfo });
    } catch (error) {
        console.error('sendMessageWithFiles error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// GET MESSAGES  (cursor-paginated — newest page first)
// =========================
// Query params:
//   limit  — page size, defaults to 10 (chat opens showing only the latest 10)
//   before — a message _id; when present, returns the `limit` messages
//            immediately older than that message instead of the latest page.
// Always responds with messages sorted oldest→newest (ready to render
// top-to-bottom), plus `hasMore` so the frontend knows whether "load older"
// should keep offering more.
const getMessages = async (req, res) => {
    try {
        const { senderId, receiverId } = req.params;
        const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
        const { before } = req.query;

        if (!mongoose.Types.ObjectId.isValid(senderId) || !mongoose.Types.ObjectId.isValid(receiverId)) {
            return res.status(400).json({ success: false, message: 'Invalid user ID' });
        }

        const sId = new mongoose.Types.ObjectId(senderId);
        const rId = new mongoose.Types.ObjectId(receiverId);

        const query = {
            $or: [
                { senderId: sId, receiverId: rId },
                { senderId: rId, receiverId: sId },
            ],
            isDeleted: { $ne: true },
        };

        // senderId here is the *viewer* (the route is /:senderId/:receiverId,
        // always called with the requester's own id first) — "Clear chat" is
        // per-user, so only their own cutoff ever applies, never the other
        // side's.
        const clear = await ChatClear.findOne({ user: sId, otherUser: rId }).select('clearedAt');
        if (clear) {
            query.createdAt = { $gt: clear.clearedAt };
        }

        if (before) {
            if (!mongoose.Types.ObjectId.isValid(before)) {
                return res.status(400).json({ success: false, message: 'Invalid before cursor' });
            }
            const cursorMsg = await Message.findById(before).select('createdAt');
            if (cursorMsg) {
                query.createdAt = { ...query.createdAt, $lt: cursorMsg.createdAt };
            }
        }

        // Fetch newest-first so `limit` always gives the page closest to the
        // cursor (or closest to "now" on the first page), then reverse to
        // ascending for rendering.
        const page = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(limit + 1) // one extra, just to detect hasMore
            .populate('replyTo', REPLY_PREVIEW_FIELDS);

        const hasMore = page.length > limit;
        const messages = page.slice(0, limit).reverse();

        // Mark-as-read stays scoped to the whole conversation, not just this
        // page — opening the chat should clear unread state regardless of
        // which page happens to be visible first.
        await Message.updateMany(
            { senderId: rId, receiverId: sId, isRead: { $ne: true } },
            { isRead: true }
        );

        res.status(200).json({ success: true, messages, hasMore });
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
        const msg = await Message.findById(msgId);

        if (!msg || msg.isDeleted) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }

        // Ownership check — previously missing entirely, so any logged-in
        // user could delete any message in the DB just by knowing its id.
        // Either side of the conversation may delete it; nobody else can.
        const userId = req.user._id.toString();
        if (msg.senderId.toString() !== userId && msg.receiverId.toString() !== userId) {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this message' });
        }

        // Soft delete — flag + keep the row instead of removing it, so the
        // record survives for future reference/audit. It disappears from
        // both sides' chat view immediately, same as before.
        msg.isDeleted = true;
        msg.deletedBy = req.user._id;
        msg.deletedAt = new Date();
        await msg.save();

        res.status(200).json({ success: true, message: 'Message deleted' });
    } catch (error) {
        console.error('deleteMessage error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// REACT TO MESSAGE (toggle)
// =========================
const reactToMessage = async (req, res) => {
    try {
        const { msgId } = req.params;
        const { emoji } = req.body;

        if (!emoji) {
            return res.status(400).json({ success: false, message: 'emoji is required' });
        }

        const msg = await Message.findById(msgId);
        if (!msg || msg.isDeleted) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }

        // Same ownership rule as delete — only the two people in this
        // conversation can react to a message in it.
        const userId = req.user._id.toString();
        if (msg.senderId.toString() !== userId && msg.receiverId.toString() !== userId) {
            return res.status(403).json({ success: false, message: 'Not authorized to react to this message' });
        }

        const existing = msg.reactions.find((r) => r.user.toString() === userId);
        if (existing && existing.emoji === emoji) {
            // Same emoji again — toggle off.
            msg.reactions = msg.reactions.filter((r) => r.user.toString() !== userId);
        } else if (existing) {
            existing.emoji = emoji; // swap to the new one
        } else {
            msg.reactions.push({ user: req.user._id, emoji });
        }

        await msg.save();

        // Let the other person in this chat see the reaction live.
        const otherUserId = msg.senderId.toString() === userId ? msg.receiverId : msg.senderId;
        SocketService.emitMessageReaction(msg._id, msg.reactions, otherUserId);

        res.status(200).json({ success: true, reactions: msg.reactions });
    } catch (error) {
        console.error('reactToMessage error:', error.message);
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
                    isDeleted: { $ne: true },
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
                    lastMessage:   { $first: '$message'   },
                    // A media-only message (photo/video/voice note) has an
                    // empty `message` string — without these, the inbox
                    // preview for that conversation went blank, which the
                    // frontend then masked by falling back to showing the
                    // *other person's city/occupation* instead (see
                    // messages.jsx's `item.lastMessage || item.city ||
                    // item.occupation`), which read as a totally wrong
                    // "last message". Synthesized into a real preview below.
                    lastImages:    { $first: '$images'    },
                    lastVideos:    { $first: '$videos'    },
                    lastAudios:    { $first: '$audios'    },
                    lastTime:      { $first: '$createdAt' },
                    // Who sent the most recent message, and whether *they've*
                    // read it yet — lets the inbox list show read-receipt
                    // ticks (only meaningful when it was me who sent it)
                    // without a second round-trip per conversation.
                    lastSenderId:  { $first: '$senderId'  },
                    lastMessageIsRead: { $first: '$isRead' },
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
            // "Delete chat" (see HiddenChat.js / chatSettingsController.js's
            // deleteChat) hides a conversation from this list — but only
            // until it has new activity again. Filtering here (before the
            // $sort/$limit below) rather than after the query resolves keeps
            // the 20-conversation page actually full of visible
            // conversations instead of a filtered-down remainder.
            {
                $lookup: {
                    from: 'hiddenchats',
                    let: { otherUserId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$user', userObjectId] },
                                        { $eq: ['$otherUser', '$$otherUserId'] },
                                    ],
                                },
                            },
                        },
                        { $project: { hiddenAt: 1 } },
                    ],
                    as: 'hiddenInfo',
                },
            },
            {
                $match: {
                    $expr: {
                        $or: [
                            { $eq: [{ $size: '$hiddenInfo' }, 0] },
                            { $gt: ['$lastTime', { $arrayElemAt: ['$hiddenInfo.hiddenAt', 0] }] },
                        ],
                    },
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
                    lastMessage: {
                        $switch: {
                            branches: [
                                {
                                    case: { $and: [{ $ne: ['$lastMessage', null] }, { $ne: ['$lastMessage', ''] }] },
                                    then: '$lastMessage',
                                },
                                { case: { $gt: [{ $size: { $ifNull: ['$lastAudios', []] } }, 0] }, then: '🎤 Voice message' },
                                { case: { $gt: [{ $size: { $ifNull: ['$lastVideos', []] } }, 0] }, then: '📹 Video' },
                                { case: { $gt: [{ $size: { $ifNull: ['$lastImages', []] } }, 0] }, then: '📷 Photo' },
                            ],
                            default: '',
                        },
                    },
                    lastTime:    1,
                    lastSenderId: 1,
                    lastMessageIsRead: 1,
                    unreadCount: 1,
                    user: {
                        _id:        '$userInfo._id',
                        name:       '$userInfo.name',
                        photos:     '$userInfo.photos',
                        city:       '$userInfo.city',
                        occupation: '$userInfo.occupation',
                        lastSeen:   '$userInfo.lastSeen',
                        // Needed so the frontend can bypass the accepted-connection
                        // gate on the call button for admin accounts — see
                        // isConnectedTo() in Messages.jsx.
                        role:       '$userInfo.role',
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
            isDeleted: { $ne: true },
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
    reactToMessage,
    getRecentChats,
    getUnreadCount,
    markAsRead,
};
