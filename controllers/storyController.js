// controllers/storyController.js
const Story = require('../models/Story');
const Connection = require('../models/Connection');

// =========================
// CREATE STORY
// =========================
const createStory = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'A photo or video is required' });
        }

        const mediaType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';

        const story = await Story.create({
            userId: req.user._id,
            mediaUrl: req.file.path,
            mediaType,
            caption: req.body.caption?.trim() || undefined,
        });

        res.status(201).json({ success: true, story });
    } catch (error) {
        console.error('createStory error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// GET STORIES FEED
// =========================
// Visible to: the requester's own stories + stories from accepted connections only.
const getStoriesFeed = async (req, res) => {
    try {
        const userId = req.user._id;

        // Same both-directions pattern used in connectionController.getMyConnections
        const connections = await Connection.find({
            $or: [{ sender: userId }, { receiver: userId }],
            status: 'accepted',
        });

        const connectedUserIds = connections.map((conn) =>
            (conn.sender.toString() === userId.toString() ? conn.receiver : conn.sender)
        );

        const visibleUserIds = [userId, ...connectedUserIds];

        const stories = await Story.find({
            userId: { $in: visibleUserIds },
            expiresAt: { $gt: new Date() }, // defensive filter — TTL cleanup isn't instant
        })
            .sort({ createdAt: 1 })
            .populate('userId', 'name photos city');

        // Group by user so the frontend can render one ring per user
        const grouped = {};
        stories.forEach((story) => {
            const uid = story.userId._id.toString();
            if (!grouped[uid]) {
                grouped[uid] = { user: story.userId, stories: [] };
            }
            grouped[uid].stories.push({
                _id: story._id,
                mediaUrl: story.mediaUrl,
                mediaType: story.mediaType,
                caption: story.caption,
                createdAt: story.createdAt,
                expiresAt: story.expiresAt,
                viewedByMe: story.viewers.some((v) => v.user.toString() === userId.toString()),
                // Excludes the owner's own view (self-views aren't recorded going
                // forward, but this also guards against any legacy records). Note
                // story.userId is populated above, so compare against its ._id.
                viewCount: story.viewers.filter((v) => v.user.toString() !== story.userId._id.toString()).length,
            });
        });

        // Own stories first, then connections, most-recently-posted-by first
        const feed = Object.values(grouped).sort((a, b) => {
            if (a.user._id.toString() === userId.toString()) return -1;
            if (b.user._id.toString() === userId.toString()) return 1;
            return new Date(b.stories[b.stories.length - 1].createdAt) - new Date(a.stories[a.stories.length - 1].createdAt);
        });

        res.status(200).json({ success: true, feed });
    } catch (error) {
        console.error('getStoriesFeed error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// GET HIGHLIGHTS (permanent — stories that survived 12h without deletion)
// =========================
// Same connections-only privacy rule as the regular feed: you can see your
// own highlights, or a connection's.
const getHighlights = async (req, res) => {
    try {
        const requesterId = req.user._id;
        const { userId } = req.params;

        if (userId !== requesterId.toString()) {
            const connection = await Connection.findOne({
                $or: [
                    { sender: requesterId, receiver: userId },
                    { sender: userId, receiver: requesterId },
                ],
                status: 'accepted',
            });
            if (!connection) {
                return res.status(403).json({ success: false, message: 'Not authorized to view these highlights' });
            }
        }

        const highlights = await Story.find({ userId, isHighlight: true })
            .sort({ createdAt: 1 });

        res.status(200).json({ success: true, highlights });
    } catch (error) {
        console.error('getHighlights error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// VIEW STORY (mark as viewed, idempotent)
// =========================
const viewStory = async (req, res) => {
    try {
        const userId = req.user._id;
        const { storyId } = req.params;

        const story = await Story.findById(storyId);
        if (!story) {
            return res.status(404).json({ success: false, message: 'Story not found' });
        }

        // Owners don't count as a "viewer" of their own story
        const isOwner = story.userId.toString() === userId.toString();
        const alreadyViewed = story.viewers.some((v) => v.user.toString() === userId.toString());
        if (!isOwner && !alreadyViewed) {
            story.viewers.push({ user: userId, viewedAt: new Date() });
            await story.save();
        }

        res.status(200).json({ success: true });
    } catch (error) {
        console.error('viewStory error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// GET STORY VIEWERS (owner only — who viewed, and when)
// =========================
const getStoryViewers = async (req, res) => {
    try {
        const { storyId } = req.params;

        const story = await Story.findById(storyId)
            .populate('viewers.user', 'name photos city');

        if (!story) {
            return res.status(404).json({ success: false, message: 'Story not found' });
        }
        if (story.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        // Most recent view first — also strips any owner self-view records
        // left over from before viewStory started excluding the owner.
        const viewers = [...story.viewers]
            .filter((v) => v.user && v.user._id.toString() !== story.userId.toString())
            .sort((a, b) => new Date(b.viewedAt) - new Date(a.viewedAt));

        res.status(200).json({ success: true, count: viewers.length, viewers });
    } catch (error) {
        console.error('getStoryViewers error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// DELETE STORY (owner only)
// =========================
const deleteStory = async (req, res) => {
    try {
        const { storyId } = req.params;
        const story = await Story.findById(storyId);

        if (!story) {
            return res.status(404).json({ success: false, message: 'Story not found' });
        }
        if (story.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        await story.deleteOne();
        res.status(200).json({ success: true, message: 'Story deleted' });
    } catch (error) {
        console.error('deleteStory error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    createStory,
    getStoriesFeed,
    getHighlights,
    viewStory,
    getStoryViewers,
    deleteStory,
};
