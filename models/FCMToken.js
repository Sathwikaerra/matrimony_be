// models/FCMToken.js
const mongoose = require('mongoose');

const fcmTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
    },
    deviceType: {
      type: String,
      enum: ['web', 'android', 'ios'],
      default: 'web'
    }
  },
  { timestamps: true }
);

// A given FCM token belongs to exactly one user at a time. Tokens are scoped
// to the browser/device (Firebase caches them per service-worker registration,
// not per app-session), so if this were unique on {userId, token} instead, the
// same physical token would accumulate under every account that ever logged
// into that browser — and pushes meant for one user would land on whoever's
// account currently owns that stale row. Uniqueness on `token` alone means a
// re-login upsert (see notificationRoutes.js) reassigns the row to the new
// owner instead of creating an extra one.
fcmTokenSchema.index({ token: 1 }, { unique: true });

module.exports = mongoose.model('FCMToken', fcmTokenSchema);
