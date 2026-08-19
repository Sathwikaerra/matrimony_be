// controllers/reelController.js
const Reel = require('../models/Reel');

// =========================
// CREATE REEL
// =========================
const createReel = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'A video is required' });
        }

        const reel = await Reel.create({
            userId: req.user._id,
            videoUrl: req.file.path,
            caption: req.body.caption?.trim() || undefined,
        });
        await reel.populate('userId', 'name photos city');

        res.status(201).json({ success: true, reel });
    } catch (error) {
        console.error('createReel error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// GET REELS FEED (paginated, newest first — platform-wide, same open
// visibility as the Home discovery feed, not connections-gated like Stories)
// =========================
const getReelsFeed = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 10));

        const [reels, total] = await Promise.all([
            Reel.find({})
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .populate('userId', 'name photos city')
                .populate('comments.user', 'name photos'),
            Reel.countDocuments({}),
        ]);

        const userId = req.user._id.toString();
        const shaped = reels.map((r) => ({
            _id: r._id,
            user: r.userId,
            videoUrl: r.videoUrl,
            caption: r.caption,
            createdAt: r.createdAt,
            likeCount: r.likes.length,
            likedByMe: r.likes.some((id) => id.toString() === userId),
            commentCount: r.comments.length,
            comments: r.comments,
        }));

        res.status(200).json({
            success: true,
            reels: shaped,
            currentPage: page,
            totalPages: Math.ceil(total / limit) || 1,
            hasMore: page * limit < total,
        });
    } catch (error) {
        console.error('getReelsFeed error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// LIKE / UNLIKE (toggle)
// =========================
const toggleLikeReel = async (req, res) => {
    try {
        const { reelId } = req.params;
        const userId = req.user._id;

        const reel = await Reel.findById(reelId);
        if (!reel) {
            return res.status(404).json({ success: false, message: 'Reel not found' });
        }

        const idx = reel.likes.findIndex((id) => id.toString() === userId.toString());
        let liked;
        if (idx >= 0) {
            reel.likes.splice(idx, 1);
            liked = false;
        } else {
            reel.likes.push(userId);
            liked = true;
        }
        await reel.save();

        res.status(200).json({ success: true, liked, likeCount: reel.likes.length });
    } catch (error) {
        console.error('toggleLikeReel error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// COMMENT
// =========================
const addReelComment = async (req, res) => {
    try {
        const { reelId } = req.params;
        const text = req.body.text?.trim();
        if (!text) {
            return res.status(400).json({ success: false, message: 'Comment text is required' });
        }

        const reel = await Reel.findById(reelId);
        if (!reel) {
            return res.status(404).json({ success: false, message: 'Reel not found' });
        }

        reel.comments.push({ user: req.user._id, text });
        await reel.save();
        await reel.populate('comments.user', 'name photos');

        res.status(201).json({ success: true, comments: reel.comments });
    } catch (error) {
        console.error('addReelComment error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// DELETE (owner only)
// =========================
const deleteReel = async (req, res) => {
    try {
        const { reelId } = req.params;
        const reel = await Reel.findById(reelId);
        if (!reel) {
            return res.status(404).json({ success: false, message: 'Reel not found' });
        }
        if (reel.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        await reel.deleteOne();
        res.status(200).json({ success: true, message: 'Reel deleted' });
    } catch (error) {
        console.error('deleteReel error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    createReel,
    getReelsFeed,
    toggleLikeReel,
    addReelComment,
    deleteReel,
};
