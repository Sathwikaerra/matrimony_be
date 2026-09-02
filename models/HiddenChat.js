// models/HiddenChat.js
// "Delete chat" from the inbox — per-user, like ChatClear.js, but a
// different feature: this never touches the Message rows or what
// getMessages returns (see ChatClear.js/clearChat for that). It only marks
// that this conversation should drop out of *this* user's getRecentChats
// list as of `hiddenAt`. The moment either side sends a new message, that
// conversation's lastTime is newer than hiddenAt again, so
// getRecentChats's post-aggregation filter naturally lets it back in — with
// every old message still intact, since nothing here ever hid or deleted
// them from the conversation itself.
const mongoose = require('mongoose');

const hiddenChatSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    otherUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    hiddenAt: { type: Date, required: true },
  },
  { timestamps: true }
);

hiddenChatSchema.index({ user: 1, otherUser: 1 }, { unique: true });

module.exports = mongoose.model('HiddenChat', hiddenChatSchema);
