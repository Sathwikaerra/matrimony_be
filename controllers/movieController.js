// controllers/movieController.js
// Per-user movie library for the Theatre screen (admin can see/manage all) (see models/Movie.js).
const Movie = require('../models/Movie');
const { cloudinary } = require('../config/cloudinary');

const hlsUrlFor = (publicId) =>
    cloudinary.url(publicId, {
        resource_type: 'video',
        streaming_profile: 'auto',
        format: 'm3u8',
        secure: true,
    });

// POST /api/movies (any logged-in user — goes into their own library) — multipart: title, description?, poster (image), video
const createMovie = async (req, res) => {
    try {
        const { title, description } = req.body;
        const poster = req.files?.poster?.[0];
        const video = req.files?.video?.[0];
        if (!title?.trim()) {
            return res.status(400).json({ success: false, message: 'A title is required' });
        }
        if (!poster || !video) {
            return res.status(400).json({ success: false, message: 'Both a poster image and a video are required' });
        }

        const hlsUrl = hlsUrlFor(video.filename);
        // Pre-generate adaptive renditions in the background.
        cloudinary.uploader
            .explicit(video.filename, {
                resource_type: 'video',
                type: 'upload',
                eager: [{ streaming_profile: 'auto', format: 'm3u8' }],
                eager_async: true,
            })
            .catch((err) => console.log('❌ movie eager HLS error:', err.message));

        const movie = await Movie.create({
            title: title.trim(),
            description: description?.trim() || '',
            posterUrl: poster.path,
            posterPublicId: poster.filename,
            videoUrl: video.path,
            videoPublicId: video.filename,
            hlsUrl,
            createdBy: req.user._id,
        });
        res.status(201).json({ success: true, movie });
    } catch (error) {
        console.error('createMovie error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// GET /api/movies/mine — the logged-in user's own movie library
const getMyMovies = async (req, res) => {
    try {
        const movies = await Movie.find({ createdBy: req.user._id }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, movies });
    } catch (error) {
        console.error('getMyMovies error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Owner or admin only.
const canManage = (req, movie) =>
    movie.createdBy.toString() === req.user._id.toString() || req.user.role === 'admin';

// GET /api/movies (admin)
const listMovies = async (req, res) => {
    try {
        const movies = await Movie.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, movies });
    } catch (error) {
        console.error('listMovies error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// PATCH /api/movies/:id (owner or admin) — edit title/description, toggle active
const updateMovie = async (req, res) => {
    try {
        const { title, description, active } = req.body;
        const update = {};
        if (title !== undefined) update.title = title.trim();
        if (description !== undefined) update.description = description.trim();
        if (active !== undefined) update.active = !!active;
        const existing = await Movie.findById(req.params.id);
        if (!existing) return res.status(404).json({ success: false, message: 'Movie not found' });
        if (!canManage(req, existing)) return res.status(403).json({ success: false, message: 'Not allowed' });
        const movie = await Movie.findByIdAndUpdate(req.params.id, update, { new: true });
        res.status(200).json({ success: true, movie });
    } catch (error) {
        console.error('updateMovie error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE /api/movies/:id (owner or admin) — also removes both Cloudinary assets
const deleteMovie = async (req, res) => {
    try {
        const movie = await Movie.findById(req.params.id);
        if (!movie) return res.status(404).json({ success: false, message: 'Movie not found' });
        if (!canManage(req, movie)) return res.status(403).json({ success: false, message: 'Not allowed' });
        await Movie.findByIdAndDelete(req.params.id);
        await Promise.allSettled([
            cloudinary.uploader.destroy(movie.videoPublicId, { resource_type: 'video', invalidate: true }),
            cloudinary.uploader.destroy(movie.posterPublicId, { resource_type: 'image', invalidate: true }),
        ]);
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('deleteMovie error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { createMovie, getMyMovies, listMovies, updateMovie, deleteMovie };
