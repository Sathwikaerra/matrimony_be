const mongoose = require('mongoose');

// Short-lived, pre-account OTP records for phone verification during
// signup. There's no User document yet at this point — that's the whole
// reason this isn't just resetPasswordOtp on User (see authController.js)
// — so it's its own collection keyed by phoneNumber.
//
// `expiresAt` does double duty: it's when the OTP code itself stops being
// guessable (10 minutes from send, see authController's OTP_TTL_MS), and
// it's also the MongoDB TTL index field, so expired records are cleaned up
// automatically with no cron job. On successful verification the
// controller pushes `expiresAt` further out (OTP_VERIFIED_WINDOW_MS) so the
// now-verified record survives long enough for registerUser to still see
// it while the signup form's remaining steps are filled in.
const phoneOtpSchema = new mongoose.Schema(
  {
    phoneNumber: { type: String, required: true, unique: true },
    otp: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    // Resend-cooldown guard — see authController.sendSignupOtp.
    lastSentAt: { type: Date, required: true },
  },
  { timestamps: true },
);

phoneOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('PhoneOtp', phoneOtpSchema);
