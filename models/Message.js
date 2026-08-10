// models/Message.js  — add isRead field


const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message:    { type: String, required: false, default: '' }, // optional — media-only messages carry no text
  images:     [{ type: String }], // Cloudinary URLs
  videos:     [{ type: String }], // Cloudinary URLs
  isRead:     { type: Boolean, default: false },   // ← add this
  // Soft delete — either party can delete a message, but the row is kept
  // (flagged, not removed) for records. Hidden from both sides' chat view
  // once deleted, same as before, just no longer destroying the data.
  isDeleted:  { type: Boolean, default: false },
  deletedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deletedAt:  { type: Date },
  // Instagram-DM-style quick reactions — one emoji per user per message.
  // Re-reacting with the same emoji clears it; a different emoji replaces it.
  reactions: [
    {
      user:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      emoji: { type: String, required: true },
    },
  ],
}, { timestamps: true });


module.exports = mongoose.model('Message', messageSchema);
