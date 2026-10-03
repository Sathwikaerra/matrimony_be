// controllers/theatreController.js
// Theatre: a connected user uploads one photo/video, the other streams it
// (HLS adaptive for video) while play/pause/seek are synced over the socket.
// The upload is temporary — destroyTheatreMedia() removes it when the session ends.
const { cloudinary } = require('../config/cloudinary');
const theatreLive = require('../services/theatreLive');

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
    // A live (phone-to-phone) session has nothing on Cloudinary — just drop
    // the relay registration.
    if (media?.live) {
        theatreLive.remove(media.sessionId);
        return;
    }
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

// GET /api/theatre/stream/:hostId — range-capable stream of the host's local
// movie, relayed chunk by chunk from the host's phone (see services/theatreLive).
// Only the accepted viewer of that host's session may read it.
const CHUNK = 256 * 1024;

const streamLive = async (req, res) => {
    const hostId = req.params.hostId;
    const src = theatreLive.get(hostId);
    // The viewer's player can fire this request a beat before the server has
    // processed their `theatreAccepted` socket message (separate connection) —
    // give that a moment to land instead of failing the first request.
    for (let i = 0; src && !src.viewerId && i < 30; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!src || !src.viewerId || src.viewerId !== req.user._id.toString()) {
        return res.status(404).json({ success: false, message: 'Stream not available' });
    }
    const size = src.size;

    let start = 0;
    let end = size - 1;
    const range = req.headers.range;
    if (range) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!m || (m[1] === '' && m[2] === '')) {
            res.set('Content-Range', `bytes */${size}`);
            return res.status(416).end();
        }
        if (m[1] === '') {
            start = Math.max(0, size - parseInt(m[2], 10));
        } else {
            start = parseInt(m[1], 10);
            if (m[2] !== '') end = Math.min(parseInt(m[2], 10), size - 1);
        }
        if (start >= size || start > end) {
            res.set('Content-Range', `bytes */${size}`);
            return res.status(416).end();
        }
    }

    res.status(range ? 206 : 200);
    res.set({
        'Accept-Ranges': 'bytes',
        'Content-Type': src.mime,
        'Content-Length': String(end - start + 1),
        'Cache-Control': 'no-store',
    });
    if (range) res.set('Content-Range', `bytes ${start}-${end}/${size}`);
    if (req.method === 'HEAD') return res.end();

    let closed = false;
    const closedPromise = new Promise((resolve) => {
        res.once('close', () => { closed = true; resolve(); });
    });

    // One chunk is always being fetched ahead of the one being written, so the
    // phone round-trip overlaps with sending to the viewer.
    const fetchAhead = (pos) => {
        if (pos > end || closed) return null;
        const p = theatreLive.fetchChunk(hostId, pos, Math.min(CHUNK, end - pos + 1));
        p.catch(() => {});
        return p;
    };

    try {
        let pos = start;
        let pending = fetchAhead(pos);
        while (pos <= end && !closed) {
            const wanted = Math.min(CHUNK, end - pos + 1);
            const buf = await pending;
            if (closed) break;
            if (!buf.length) throw new Error('Empty chunk from host');
            // A short read from the phone invalidates the prefetched next chunk.
            pending = buf.length === wanted ? fetchAhead(pos + wanted) : null;
            pos += buf.length;
            if (!res.write(buf)) {
                await Promise.race([
                    new Promise((resolve) => res.once('drain', resolve)),
                    closedPromise,
                ]);
            }
            if (!pending && pos <= end) pending = fetchAhead(pos);
        }
        if (!closed) res.end();
    } catch (err) {
        console.log('❌ theatre stream error:', err.message);
        res.destroy();
    }
};

module.exports = { uploadMedia, destroyTheatreMedia, streamLive };
