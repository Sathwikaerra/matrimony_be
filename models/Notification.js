// models/Notification.js
//
// Persisted feed of "someone did something towards you" events, for the
// Notifications tab. Connection requests (interest/match/decline) already
// have their own durable state machine via the Connection model's `status`
// field, so they're read directly from there and are NOT duplicated here —
// this collection only covers the event types that had no durable record
// before now: profile views, likes, comments, and new messages.
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['view', 'like', 'comment', 'message'],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
