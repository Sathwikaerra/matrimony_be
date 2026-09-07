// models/Post.js
// Permanent photo + caption feed post — its own content type, separate from
// the Home feed's match-discovery cards and from Story (24h/ephemeral,
// connections-gated). Visible platform-wide, same open-discovery visibility
// as the Home feed.
const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    // Exactly one of imageUrl/videoUrl is set per post (see
    // postController.js's createPost, which picks based on the uploaded
    // file's mimetype) — neither is schema-`required` alone since either
    // one on its own is a valid post; createPost itself rejects a request
    // with no file at all.
    imageUrl: {
        type: String,
    },
    videoUrl: {
        type: String,
    },
    caption: {
        type: String,
        trim: true,
    },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [
        {
            user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            text: { type: String, required: true, trim: true },
            createdAt: { type: Date, default: Date.now },
        },
    ],
}, { timestamps: true });

module.exports = mongoose.model('Post', postSchema);
