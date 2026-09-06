// models/ChatStreak.js
// One row per conversation pair (ordered via utils/chatPair.orderedPair,
// same convention as ChatSettings) — tracks the "both people messaged
// today" daily streak and a running total message count, so milestones
// (services/chatStreakService.js) don't need an expensive count query on
// every send.
//
// Dates are plain "YYYY-MM-DD" strings (UTC calendar day), not Date
// objects — a streak only ever needs same-day/consecutive-day equality
// checks, and a string avoids timezone-normalization bugs that comparing
// Date objects across a day boundary tends to invite.
const mongoose = require('mongoose');

const chatStreakSchema = new mongoose.Schema(
  {
    userA: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userB: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    streak: { type: Number, default: 0 },
    lastDateA: { type: String, default: null },
    lastDateB: { type: String, default: null },
    // Last date the streak counter itself was incremented — guards
    // against bumping it twice if both people happen to message again
    // later the same day.
    streakUpdatedDate: { type: String, default: null },
    totalMessages: { type: Number, default: 0 },
  },
  { timestamps: true }
);

chatStreakSchema.index({ userA: 1, userB: 1 }, { unique: true });

module.exports = mongoose.model('ChatStreak', chatStreakSchema);
