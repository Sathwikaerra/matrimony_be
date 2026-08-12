// models/CallLog.js
// One row per call attempt, written once the call concludes (declined,
// missed/cancelled, or actually completed) — see socket/socket.js's
// pendingCallLogs bookkeeping for how the lifecycle across callUser →
// callConnected → rejectCall/endCall gets collapsed into this single write.
const mongoose = require('mongoose');

const callLogSchema = new mongoose.Schema(
  {
    caller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    callee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // completed — actually connected, then either side hung up
    // declined  — callee explicitly rejected (or was busy on another call)
    // missed    — never connected; caller gave up / cancelled before answer
    status: { type: String, enum: ['completed', 'declined', 'missed'], required: true },
    startedAt: { type: Date, required: true },
    connectedAt: { type: Date, default: null },
    endedAt: { type: Date, required: true },
    durationSeconds: { type: Number, default: 0 },
  },
  { timestamps: true }
);

callLogSchema.index({ caller: 1, createdAt: -1 });
callLogSchema.index({ callee: 1, createdAt: -1 });

module.exports = mongoose.model('CallLog', callLogSchema);
