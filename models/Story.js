// models/Story.js
const mongoose = require('mongoose');

const storySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    mediaUrl: {
        type: String,
        required: true,
    },
    mediaType: {
        type: String,
        enum: ['image', 'video'],
        required: true,
    },
    caption: {
        type: String,
        trim: true,
    },
    viewers: [
        {
            user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            viewedAt: { type: Date, default: Date.now },
        },
    ],
    expiresAt: {
        type: Date,
        required: true,
        default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // now + 24h
    },
    // Once a story survives 12h without being deleted, it's promoted into the
    // user's permanent highlights (see utils/storyHighlights.js) — expiresAt
    // gets cleared at that point so the TTL index stops tracking it.
    isHighlight: {
        type: Boolean,
        default: false,
    },
}, { timestamps: true });

// TTL index — MongoDB auto-purges the doc once expiresAt is in the past.
// Note: the background sweep runs roughly every 60s, not instantly, so
// getStoriesFeed still defensively filters expiresAt too (cleanup lag is
// fine for a 24h story, but the feed shouldn't show a technically-expired
// one in that window).
storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Story', storySchema);
