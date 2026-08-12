// models/Block.js
// Directional — A blocking B doesn't imply B has blocked A. Messaging (and
// calling) checks both directions and reports which one applies, so the
// frontend can show the right message ("You have blocked this user" vs
// "You are blocked by this user").
const mongoose = require('mongoose');

const blockSchema = new mongoose.Schema(
  {
    blocker: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    blocked: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });

module.exports = mongoose.model('Block', blockSchema);
