// models/Message.js  — add isRead field


const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  senderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message:    { type: String, required: false, default: '' }, // optional — media-only messages carry no text
  images:     [{ type: String }], // Cloudinary URLs
  videos:     [{ type: String }], // Cloudinary URLs
  isRead:     { type: Boolean, default: false },   // ← add this
}, { timestamps: true });


module.exports = mongoose.model('Message', messageSchema);
