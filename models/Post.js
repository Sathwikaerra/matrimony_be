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
    imageUrl: {
        type: String,
        required: true,
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
