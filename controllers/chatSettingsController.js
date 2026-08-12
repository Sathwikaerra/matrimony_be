// controllers/chatSettingsController.js
const ChatSettings = require('../models/ChatSettings');
const ChatClear = require('../models/ChatClear');
const Block = require('../models/Block');
const SocketService = require('../services/socketService');
const { orderedPair } = require('../utils/chatPair');

// Kept in sync with WALLPAPERS in matrimony_fe/src/component/WallpaperPicker.jsx —
// rejecting anything else keeps this from becoming an arbitrary-string field.
const VALID_WALLPAPERS = ['default', 'dots', 'diagonal', 'grid', 'gold-glow', 'waves'];

// GET /api/chat/:otherUserId/settings — wallpaper + this viewer's block
// status against otherUserId, in one round trip (fetched whenever a chat
// opens).
const getChatSettings = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { otherUserId } = req.params;
        const { userA, userB } = orderedPair(userId, otherUserId);

        const [settings, blockedByMe, blockedByThem] = await Promise.all([
            ChatSettings.findOne({ userA, userB }).select('wallpaper'),
            Block.exists({ blocker: userId, blocked: otherUserId }),
            Block.exists({ blocker: otherUserId, blocked: userId }),
        ]);

        res.status(200).json({
            success: true,
            wallpaper: settings?.wallpaper || 'default',
            blockedByMe: !!blockedByMe,
            blockedByThem: !!blockedByThem,
        });
    } catch (error) {
        console.error('getChatSettings error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// PUT /api/chat/:otherUserId/wallpaper — shared: whichever side sets it,
// both see it (see the wallpaperChanged relay below).
const setWallpaper = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { otherUserId } = req.params;
        const { wallpaper } = req.body;

        if (!VALID_WALLPAPERS.includes(wallpaper)) {
            return res.status(400).json({ success: false, message: 'Invalid wallpaper' });
        }

        const { userA, userB } = orderedPair(userId, otherUserId);
        await ChatSettings.findOneAndUpdate(
            { userA, userB },
            { wallpaper, updatedBy: userId },
            { upsert: true, new: true }
        );

        SocketService.emitWallpaperChanged(otherUserId, userId, wallpaper);

        res.status(200).json({ success: true, wallpaper });
    } catch (error) {
        console.error('setWallpaper error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/chat/:otherUserId/clear — per-user only, see ChatClear.js.
const clearChat = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { otherUserId } = req.params;

        await ChatClear.findOneAndUpdate(
            { user: userId, otherUser: otherUserId },
            { clearedAt: new Date() },
            { upsert: true, new: true }
        );

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('clearChat error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/chat/:otherUserId/block
const blockUser = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { otherUserId } = req.params;

        if (userId === otherUserId) {
            return res.status(400).json({ success: false, message: 'Cannot block yourself' });
        }

        await Block.findOneAndUpdate(
            { blocker: userId, blocked: otherUserId },
            { blocker: userId, blocked: otherUserId },
            { upsert: true }
        );

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('blockUser error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/chat/:otherUserId/unblock
const unblockUser = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { otherUserId } = req.params;

        await Block.deleteOne({ blocker: userId, blocked: otherUserId });

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('unblockUser error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getChatSettings, setWallpaper, clearChat, blockUser, unblockUser, VALID_WALLPAPERS };
