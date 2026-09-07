// controllers/postController.js
const mongoose = require('mongoose');
const Post = require('../models/Post');

// =========================
// CREATE POST
// =========================
const createPost = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'A photo or video is required' });
        }

        const isVideo = req.file.mimetype.startsWith('video/');

        const post = await Post.create({
            userId: req.user._id,
            imageUrl: isVideo ? undefined : req.file.path,
            videoUrl: isVideo ? req.file.path : undefined,
            caption: req.body.caption?.trim() || undefined,
        });
        await post.populate('userId', 'name photos city');

        res.status(201).json({ success: true, post });
    } catch (error) {
        console.error('createPost error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// GET POSTS FEED (cursor-paginated, newest first — platform-wide)
// =========================
// Query params:
//   limit  — page size, defaults to 10
//   before — a post _id; when present, returns the `limit` posts
//            immediately older than that post instead of the newest page.
//
// Was skip/limit (numeric offset) before — that broke as soon as a new post
// landed anywhere platform-wide between two page fetches: every post's
// offset shifts by however many new posts appeared, so the next "page"
// re-includes whatever had just shifted into that offset window, showing
// the same post twice. Same cursor-based fix already used for
// messageController.getMessages, for the identical underlying reason.
const getPostsFeed = async (req, res) => {
    try {
        const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 10));
        const { before } = req.query;

        const query = {};
        if (before) {
            if (!mongoose.Types.ObjectId.isValid(before)) {
                return res.status(400).json({ success: false, message: 'Invalid before cursor' });
            }
            const cursorPost = await Post.findById(before).select('createdAt');
            if (cursorPost) {
                query.createdAt = { $lt: cursorPost.createdAt };
            }
        }

        // Fetch one extra to detect hasMore without a separate count query.
        const page = await Post.find(query)
            .sort({ createdAt: -1 })
            .limit(limit + 1)
            .populate('userId', 'name photos city')
            .populate('comments.user', 'name photos');

        const hasMore = page.length > limit;
        const posts = page.slice(0, limit);

        const userId = req.user._id.toString();
        const shaped = posts.map((p) => ({
            _id: p._id,
            user: p.userId,
            imageUrl: p.imageUrl,
            videoUrl: p.videoUrl,
            caption: p.caption,
            createdAt: p.createdAt,
            likeCount: p.likes.length,
            likedByMe: p.likes.some((id) => id.toString() === userId),
            commentCount: p.comments.length,
            comments: p.comments,
        }));

        res.status(200).json({ success: true, posts: shaped, hasMore });
    } catch (error) {
        console.error('getPostsFeed error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// LIKE / UNLIKE (toggle)
// =========================
const toggleLikePost = async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.user._id;

        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }

        const idx = post.likes.findIndex((id) => id.toString() === userId.toString());
        let liked;
        if (idx >= 0) {
            post.likes.splice(idx, 1);
            liked = false;
        } else {
            post.likes.push(userId);
            liked = true;
        }
        await post.save();

        res.status(200).json({ success: true, liked, likeCount: post.likes.length });
    } catch (error) {
        console.error('toggleLikePost error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// COMMENT
// =========================
const addPostComment = async (req, res) => {
    try {
        const { postId } = req.params;
        const text = req.body.text?.trim();
        if (!text) {
            return res.status(400).json({ success: false, message: 'Comment text is required' });
        }

        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }

        post.comments.push({ user: req.user._id, text });
        await post.save();
        await post.populate('comments.user', 'name photos');

        res.status(201).json({ success: true, comments: post.comments });
    } catch (error) {
        console.error('addPostComment error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// DELETE (owner only)
// =========================
const deletePost = async (req, res) => {
    try {
        const { postId } = req.params;
        const post = await Post.findById(postId);
        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }
        if (post.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }
        await post.deleteOne();
        res.status(200).json({ success: true, message: 'Post deleted' });
    } catch (error) {
        console.error('deletePost error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    createPost,
    getPostsFeed,
    toggleLikePost,
    addPostComment,
    deletePost,
};
