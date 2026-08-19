// models/ChatSettings.js
// Shared, per-conversation settings — currently just the wallpaper. "Shared"
// meaning: one row per pair of users, visible/editable by either side, and
// a change from one side is reflected for the other (see
// chatSettingsController.js + the wallpaperChanged socket relay). userA/userB
// are always stored with userA < userB (string comparison of the ids) so a
// given pair only ever has one row regardless of who queries first.
const mongoose = require('mongoose');

const chatSettingsSchema = new mongoose.Schema(
  {
    userA: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    userB: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Either a preset id (see VALID_WALLPAPERS in chatSettingsController.js)
    // or a full Cloudinary URL for a custom-uploaded wallpaper image.
    wallpaper: { type: String, default: 'default' },
    // Presets default low (subtle line-art pattern), but a custom photo can
    // go all the way to 1 (full opacity, no fade) — see the "Full" chip in
    // WallpaperPicker.
    wallpaperOpacity: { type: Number, default: 0.12, min: 0.03, max: 1 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

chatSettingsSchema.index({ userA: 1, userB: 1 }, { unique: true });

module.exports = mongoose.model('ChatSettings', chatSettingsSchema);
