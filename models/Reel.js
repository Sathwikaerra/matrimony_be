// models/Reel.js
// Permanent short vertical video post — separate content type from Story
// (24h/ephemeral) and from the Home feed's match-discovery cards. Visible
// platform-wide (same open-discovery visibility as the Home feed), not
// gated to accepted connections like Stories/Locker are.
const mongoose = require('mongoose');

const reelSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    videoUrl: {
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

module.exports = mongoose.model('Reel', reelSchema);
