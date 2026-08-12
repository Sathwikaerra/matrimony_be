// models/ChatClear.js
// "Clear chat" is per-user, not shared — same as WhatsApp: clearing your
// side of a conversation doesn't touch what the other person sees. Rather
// than deleting/hiding the actual Message rows (which the other person
// still needs), this just records a cutoff timestamp; getMessages filters
// out anything at or before it for that specific viewer.
const mongoose = require('mongoose');

const chatClearSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    otherUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    clearedAt: { type: Date, required: true },
  },
  { timestamps: true }
);

chatClearSchema.index({ user: 1, otherUser: 1 }, { unique: true });

module.exports = mongoose.model('ChatClear', chatClearSchema);
