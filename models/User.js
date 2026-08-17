const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');


const commentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    text: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    phoneNumber: String,
    password: {
        type: String,
        select: false
    },
      photos: [
        {
            type: String
        }
    ],
    gender: String,
    dateOfBirth: Date,
    religion: String,
    motherTongue: String,
    maritalStatus: String,
    education: String,
    occupation: String,
    city: String,
    state: String,
    // Who the account is actually for — matrimony profiles are very often
    // created by a family member on someone else's behalf, not the user
    // themselves.
    accountFor: {
      type: String,
      enum: ['self', 'son', 'daughter', 'sister', 'brother', 'other'],
      default: 'self',
    },
    marriageInfo: {
      type: String,
      enum: ['first_marriage', 'second_marriage', 'other'],
    },
    // Set true once the phone number has been verified via Firebase Phone
    // Auth OTP (see authController.verifyPhone) — phoneNumber itself is
    // collected at signup either way; this just tracks whether it's trusted.
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    // Set on socket disconnect — "last seen" for the chat header when the
    // user isn't currently online. Left unset until their first disconnect.
    lastSeen: { type: Date },
    // ───────── Forgot password ─────────
    // Set by authController.forgotPassword, checked + cleared by
    // resetPassword. select:false to match the `password` field's privacy
    // convention — these shouldn't leak into /auth/me or profile responses.
    resetPasswordOtp: {
      type: String,
      select: false,
    },
    resetPasswordExpires: {
      type: Date,
      select: false,
    },
    // ───────── Likes ─────────

    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],

    // ───────── Comments ─────────

    comments: [commentSchema],

    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  }, {
    timestamps: true
});



module.exports = mongoose.model('User', userSchema);
