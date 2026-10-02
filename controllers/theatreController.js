// controllers/theatreController.js
// Theatre: a connected user uploads one photo/video, the other streams it
// (HLS adaptive for video) while play/pause/seek are synced over the socket.
// The upload is temporary — destroyTheatreMedia() removes it when the session ends.
const { cloudinary } = require('../config/cloudinary');

const hlsUrlFor = (publicId) =>
    cloudinary.url(publicId, {
        resource_type: 'video',
        streaming_profile: 'auto',
        format: 'm3u8',
        secure: true,
    });

// POST /api/theatre/upload  (multipart field: "media")
const uploadMedia = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No media file provided' });
        }
        const publicId = req.file.filename;
        const isVideo = req.file.mimetype?.startsWith('video/') || req.file.path?.includes('/video/upload/');
        const media = {
            url: req.file.path,
            publicId,
            type: isVideo ? 'video' : 'image',
            hlsUrl: null,
        };
        if (isVideo) {
            media.hlsUrl = hlsUrlFor(publicId);
            // Pre-generate the adaptive renditions in the background so the
            // viewer's first request isn't the one that triggers transcoding.
            cloudinary.uploader
                .explicit(publicId, {
                    resource_type: 'video',
                    type: 'upload',
                    eager: [{ streaming_profile: 'auto', format: 'm3u8' }],
                    eager_async: true,
                })
                .catch((err) => console.log('❌ theatre eager HLS error:', err.message));
        }
        return res.status(201).json({ success: true, media });
    } catch (err) {
        console.log('❌ theatre upload error:', err.message);
        return res.status(500).json({ success: false, message: 'Could not upload media' });
    }
};

// Best-effort cleanup — never throws; called from the socket layer.
const destroyTheatreMedia = async (media) => {
    if (!media?.publicId || !String(media.publicId).startsWith('vivaah/theatre/')) return;
    try {
        await cloudinary.uploader.destroy(media.publicId, {
            resource_type: media.type === 'video' ? 'video' : 'image',
            invalidate: true,
        });
    } catch (err) {
        console.log('❌ theatre media cleanup error:', err.message);
    }
};

module.exports = { uploadMedia, destroyTheatreMedia };
