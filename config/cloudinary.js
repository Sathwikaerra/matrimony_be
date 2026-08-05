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
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'webm'],
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

module.exports = { cloudinary, upload, uploadChatMedia, uploadStoryMedia };