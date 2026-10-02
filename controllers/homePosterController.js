// controllers/homePosterController.js
//
// Admin-managed slides for the Home screen's rotating red-zone carousel —
// see models/HomePoster.js for why this is separate from Announcement.
const HomePoster = require('../models/HomePoster');

// =========================
// CREATE (admin)
// =========================
const createHomePoster = async (req, res) => {
    try {
        const { quote, order } = req.body;
        if (!quote?.trim()) {
            return res.status(400).json({ success: false, message: 'A quote is required' });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'An image is required' });
        }

        const poster = await HomePoster.create({
            imageUrl: req.file.path,
            quote: quote.trim(),
            order: order !== undefined ? Number(order) || 0 : 0,
            createdBy: req.user._id,
        });

        res.status(201).json({ success: true, poster });
    } catch (error) {
        console.error('createHomePoster error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// LIST (admin) — management view, lowest order / newest first
// =========================
const listHomePosters = async (req, res) => {
    try {
        const posters = await HomePoster.find().sort({ order: 1, createdAt: -1 });
        res.status(200).json({ success: true, posters });
    } catch (error) {
        console.error('listHomePosters error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// UPDATE (admin) — edit quote/order, toggle active; image is immutable
// once uploaded (delete + recreate to swap the photo, same as the other
// admin-managed media here)
// =========================
const updateHomePoster = async (req, res) => {
    try {
        const { id } = req.params;
        const { quote, order, active } = req.body;

        const update = {};
        if (quote !== undefined) update.quote = quote.trim();
        if (order !== undefined) update.order = Number(order) || 0;
        if (active !== undefined) update.active = !!active;

        const poster = await HomePoster.findByIdAndUpdate(id, update, { new: true });
        if (!poster) {
            return res.status(404).json({ success: false, message: 'Poster not found' });
        }
        res.status(200).json({ success: true, poster });
    } catch (error) {
        console.error('updateHomePoster error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// DELETE (admin)
// =========================
const deleteHomePoster = async (req, res) => {
    try {
        const { id } = req.params;
        const poster = await HomePoster.findByIdAndDelete(id);
        if (!poster) {
            return res.status(404).json({ success: false, message: 'Poster not found' });
        }
        res.status(200).json({ success: true, message: 'Poster deleted' });
    } catch (error) {
        console.error('deleteHomePoster error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// GET ACTIVE (any logged-in user) — for the Home carousel
// =========================
const getActiveHomePosters = async (req, res) => {
    try {
        const posters = await HomePoster.find({ active: true }).sort({ order: 1, createdAt: -1 });
        res.status(200).json({ success: true, posters });
    } catch (error) {
        console.error('getActiveHomePosters error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    createHomePoster,
    listHomePosters,
    updateHomePoster,
    deleteHomePoster,
    getActiveHomePosters,
};
