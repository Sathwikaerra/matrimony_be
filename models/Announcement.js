// models/Announcement.js
//
// Admin-composed broadcast content — one document covers all three delivery
// surfaces (`channels`), since the same "caption + optional image/link" is
// what's being distributed everywhere, just picked per-surface at creation
// time rather than being three separate features:
//   - alert:      fanned out once, immediately, as a Notification + live
//                 socket broadcast + push (see announcementController.js)
//   - chatBanner: shown at the top of the Messages inbox while active
//   - feedBanner: shown as a "Sponsored" card pinned in the Home feed
const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
    message: {
        type: String,
        required: true,
        trim: true,
    },
    imageUrl: String,
    // Set instead of imageUrl when the admin attaches a video — the two are
    // mutually exclusive per announcement (see createAnnouncement, which
    // picks one based on the uploaded file's mimetype). Kept as a separate
    // field rather than renaming imageUrl to a generic mediaUrl+mediaType
    // pair, so every existing `announcement.imageUrl` check across both
    // frontends keeps working unchanged for image announcements.
    videoUrl: String,
    linkUrl: String,
    channels: {
        alert: { type: Boolean, default: false },
        chatBanner: { type: Boolean, default: false },
        feedBanner: { type: Boolean, default: false },
    },
    active: {
        type: Boolean,
        default: true,
    },
    // Optional — a banner left on forever because nobody remembered to turn
    // it off is a real failure mode; null means "no expiry".
    expiresAt: {
        type: Date,
        default: null,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
}, { timestamps: true });

module.exports = mongoose.model('Announcement', announcementSchema);
