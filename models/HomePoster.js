// models/HomePoster.js
//
// Admin-composed "poster" slides for the Home screen's rotating red-zone
// carousel — a photo with a short quote/caption overlaid on it. Separate
// from Announcement (which covers alert/chatBanner/feedBanner) since these
// are a different surface with different fields (no message-only slides,
// no link/video, just image + quote) and a different display order concept.
const mongoose = require('mongoose');

const homePosterSchema = new mongoose.Schema({
    imageUrl: {
        type: String,
        required: true,
    },
    quote: {
        type: String,
        required: true,
        trim: true,
    },
    active: {
        type: Boolean,
        default: true,
    },
    // Lower sorts first. Not unique/sequential-enforced — ties just fall
    // back to createdAt, same as a plain "pin to top" knob rather than a
    // strict ordering the admin has to keep renumbered.
    order: {
        type: Number,
        default: 0,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
}, { timestamps: true });

module.exports = mongoose.model('HomePoster', homePosterSchema);
