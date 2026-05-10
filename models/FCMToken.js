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

// Allow multiple devices per user, but unique token
fcmTokenSchema.index({ userId: 1, token: 1 }, { unique: true });

module.exports = mongoose.model('FCMToken', fcmTokenSchema);
