// models/Movie.js
//
// A movie in a user's personal Theatre library (createdBy = owner) — the owner
// can watch it alone or invite an online connection to it. Lives permanently on
// Cloudinary (folder vivaah/movies), unlike per-session Theatre uploads which
// are deleted when the session ends.
const mongoose = require('mongoose');

const movieSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    posterUrl: { type: String, required: true },
    posterPublicId: { type: String, required: true },
    videoUrl: { type: String, required: true },
    videoPublicId: { type: String, required: true },
    hlsUrl: { type: String, default: null },
    active: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('Movie', movieSchema);
