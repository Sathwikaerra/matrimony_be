// models/PushSubscription.js
const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    subscription: {
      endpoint: { type: String, required: true },
      keys: {
        p256dh: { type: String, required: true },
        auth:   { type: String, required: true },
      },
    },
  },
  { timestamps: true }
);

// One subscription per user (upsert-friendly)
pushSubscriptionSchema.index({ userId: 1 }, { unique: true });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
