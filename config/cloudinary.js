// config/cloudinary.js
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder:         'vivaah/profiles',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 800, height: 800, crop: 'fill', quality: 'auto' }],
    },
});

const upload = multer({ storage });

// ── Chat media (photos & videos shared in messages) ────────────────────────
// Separate from the profile-photo storage above: no forced square crop,
// allows video formats, and resource_type 'auto' lets Cloudinary detect
// image vs. video instead of assuming image-only like the profile uploader.
const chatMediaStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder:          'vivaah/chat',
        resource_type:   'auto',
        // m4a/caf/3gp/aac/wav cover Expo's Audio.Recording output across
        // iOS/Android (voice notes) on top of the existing photo/video formats.
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'webm', 'm4a', 'caf', '3gp', 'aac', 'wav', 'mp3'],
    },
});

const uploadChatMedia = multer({
    storage: chatMediaStorage,
    limits: { fileSize: 25 * 1024 * 1024 }, // 25MB per file — videos are much larger than profile photos
});

// ── Story media (ephemeral 24h photo/video status) ──────────────────────────
// Same shape as chat media (no forced crop, image+video formats, auto resource
// type), just a separate folder to keep story uploads cleanly namespaced.
const storyMediaStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder:          'vivaah/stories',
        resource_type:   'auto',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'webm'],
    },
});

const uploadStoryMedia = multer({
    storage: storyMediaStorage,
    limits: { fileSize: 25 * 1024 * 1024 },
});

// ── Reels (permanent short vertical video posts) ────────────────────────────
// Unlike stories (24h TTL, see storyMediaStorage above), reels are permanent
// content — no expiresAt, no TTL index on the model. Video-only, and a
// bigger size ceiling than chat/story media since reels run longer.
const reelMediaStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder:          'vivaah/reels',
        resource_type:   'video',
        allowed_formats: ['mp4', 'mov', 'webm'],
    },
});

const uploadReelMedia = multer({
    storage: reelMediaStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB — reels run longer than a chat video clip
});

// ── Chat wallpapers (custom-uploaded, shared per conversation) ─────────────
// Image-only, no forced crop — rendered at low opacity behind the chat
// (see WallpaperBackground / setWallpaper's wallpaperOpacity).
const wallpaperStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder:          'vivaah/wallpapers',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    },
});

const uploadWallpaperImage = multer({
    storage: wallpaperStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
});

// ── Locker documents (private, permission-gated storage) ───────────────────
// Uploaded as `type: 'authenticated'` so the raw Cloudinary asset is NOT
// publicly fetchable by URL — viewing requires a signed, time-limited URL
// minted per-request after the app-level permission check (see
// lockerController.getDocumentUrl). Broader format list than the other
// uploaders since these are ID proofs / certificates, not just photos.
const lockerStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder:          'vivaah/locker',
        resource_type:   'auto',
        type:            'authenticated',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx'],
    },
});

const uploadLockerDocument = multer({
    storage: lockerStorage,
    limits: { fileSize: 25 * 1024 * 1024 },
});

// ── Announcement images (admin broadcast banners) ───────────────────────────
// Image-only, no forced crop — banners come in whatever aspect ratio the
// admin's creative was made in, same reasoning as chat/story media.
const announcementStorage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder:          'vivaah/announcements',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    },
});

const uploadAnnouncementImage = multer({
    storage: announcementStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
});

module.exports = { cloudinary, upload, uploadChatMedia, uploadStoryMedia, uploadReelMedia, uploadWallpaperImage, uploadLockerDocument, uploadAnnouncementImage };