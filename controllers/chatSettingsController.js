// controllers/chatSettingsController.js
const ChatSettings = require('../models/ChatSettings');
const ChatClear = require('../models/ChatClear');
const HiddenChat = require('../models/HiddenChat');
const Block = require('../models/Block');
const SocketService = require('../services/socketService');
const { orderedPair } = require('../utils/chatPair');
const { getStreakInfo } = require('../services/chatStreakService');

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

        const [settings, blockedByMe, blockedByThem, streakInfo] = await Promise.all([
            ChatSettings.findOne({ userA, userB }).select('wallpaper wallpaperOpacity'),
            Block.exists({ blocker: userId, blocked: otherUserId }),
            Block.exists({ blocker: otherUserId, blocked: userId }),
            getStreakInfo(userId, otherUserId),
        ]);

        res.status(200).json({
            success: true,
            wallpaper: settings?.wallpaper || 'default',
            wallpaperOpacity: settings?.wallpaperOpacity ?? 0.12,
            blockedByMe: !!blockedByMe,
            blockedByThem: !!blockedByThem,
            streak: streakInfo.streak,
            totalMessages: streakInfo.totalMessages,
        });
    } catch (error) {
        console.error('getChatSettings error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Shared clamp — mirrors the schema's min/max so a bad value gets corrected
// instead of failing the whole request outright (opacity is a nice-to-have,
// not worth a hard error over).
function clampOpacity(value, fallback) {
    const n = Number(value);
    if (Number.isNaN(n)) return fallback;
    return Math.min(1, Math.max(0.03, n));
}

// PUT /api/chat/:otherUserId/wallpaper — shared: whichever side sets it,
// both see it (see the wallpaperChanged relay below). Picks one of the
// built-in presets; `opacity` is optional and applies regardless of
// whether the wallpaper itself changed (lets you just re-tune opacity on
// the current wallpaper without re-picking it).
const setWallpaper = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { otherUserId } = req.params;
        const { wallpaper, opacity } = req.body;

        if (wallpaper && !VALID_WALLPAPERS.includes(wallpaper)) {
            return res.status(400).json({ success: false, message: 'Invalid wallpaper' });
        }

        const { userA, userB } = orderedPair(userId, otherUserId);
        const update = { updatedBy: userId };
        if (wallpaper) update.wallpaper = wallpaper;
        if (opacity !== undefined) update.wallpaperOpacity = clampOpacity(opacity, 0.12);

        const settings = await ChatSettings.findOneAndUpdate(
            { userA, userB },
            update,
            { upsert: true, new: true }
        );

        SocketService.emitWallpaperChanged(otherUserId, userId, settings.wallpaper, settings.wallpaperOpacity);

        res.status(200).json({ success: true, wallpaper: settings.wallpaper, wallpaperOpacity: settings.wallpaperOpacity });
    } catch (error) {
        console.error('setWallpaper error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/chat/:otherUserId/wallpaper/upload — a custom photo instead of
// one of the built-in presets. The Cloudinary URL itself becomes the
// `wallpaper` value (bypasses VALID_WALLPAPERS — it's derived from the
// upload, never arbitrary user-supplied text, so the preset whitelist
// doesn't apply here). Still shared the same way presets are.
const uploadCustomWallpaper = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'An image is required' });
        }
        const userId = req.user._id.toString();
        const { otherUserId } = req.params;
        const { opacity } = req.body;

        const { userA, userB } = orderedPair(userId, otherUserId);
        const settings = await ChatSettings.findOneAndUpdate(
            { userA, userB },
            {
                wallpaper: req.file.path,
                // Full opacity by default — matches the client. Only used
                // as a fallback since the client always sends its own value.
                wallpaperOpacity: clampOpacity(opacity, 1),
                updatedBy: userId,
            },
            { upsert: true, new: true }
        );

        SocketService.emitWallpaperChanged(otherUserId, userId, settings.wallpaper, settings.wallpaperOpacity);

        res.status(200).json({ success: true, wallpaper: settings.wallpaper, wallpaperOpacity: settings.wallpaperOpacity });
    } catch (error) {
        console.error('uploadCustomWallpaper error:', error.message);
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

// POST /api/chat/:otherUserId/delete — "Delete chat" from the inbox list.
// Per-user, and — unlike clearChat above — doesn't touch message history at
// all: it only hides this conversation from getRecentChats (see
// HiddenChat.js) until a new message makes it newer than `hiddenAt` again,
// at which point it reappears with everything still there.
const deleteChat = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const { otherUserId } = req.params;

        await HiddenChat.findOneAndUpdate(
            { user: userId, otherUser: otherUserId },
            { hiddenAt: new Date() },
            { upsert: true, new: true }
        );

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('deleteChat error:', error.message);
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

module.exports = { getChatSettings, setWallpaper, uploadCustomWallpaper, clearChat, deleteChat, blockUser, unblockUser, VALID_WALLPAPERS };
