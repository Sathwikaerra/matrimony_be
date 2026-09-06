// controllers/announcementController.js
//
// Admin broadcast content — one Announcement doc covers all three delivery
// surfaces via `channels` (see models/Announcement.js for why). Creating one
// with `channels.alert` set fans it out immediately and once; chatBanner/
// feedBanner are just "show this while active", read on demand by
// getActiveAnnouncements — no fan-out needed for those.
const Announcement = require('../models/Announcement');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { getIO } = require('../socket/socket');
const { sendPushToAllExcept } = require('../services/pushService');

// =========================
// CREATE (admin)
// =========================
const createAnnouncement = async (req, res) => {
    try {
        const { message, linkUrl, channels } = req.body;
        if (!message?.trim()) {
            return res.status(400).json({ success: false, message: 'A message is required' });
        }

        // Sent as JSON string fields alongside a multipart file upload — same
        // pattern multer/form-data forces on every other field here.
        let parsedChannels = {};
        try {
            parsedChannels = typeof channels === 'string' ? JSON.parse(channels) : (channels || {});
        } catch {
            /* malformed — falls back to all-false below, harmless */
        }

        const isVideo = !!req.file?.mimetype?.startsWith('video/');

        const announcement = await Announcement.create({
            message: message.trim(),
            imageUrl: req.file && !isVideo ? req.file.path : undefined,
            videoUrl: req.file && isVideo ? req.file.path : undefined,
            linkUrl: linkUrl?.trim() || undefined,
            channels: {
                alert: !!parsedChannels.alert,
                chatBanner: !!parsedChannels.chatBanner,
                feedBanner: !!parsedChannels.feedBanner,
            },
            createdBy: req.user._id,
        });

        // ── Alert fan-out — once, at creation, not on every later edit ──────
        if (announcement.channels.alert) {
            const recipients = await User.find({ _id: { $ne: req.user._id } }).select('_id');

            if (recipients.length) {
                await Notification.insertMany(
                    recipients.map((u) => ({
                        recipient: u._id,
                        sender: req.user._id,
                        type: 'announcement',
                        message: announcement.message,
                        data: { announcementId: announcement._id.toString(), linkUrl: announcement.linkUrl },
                    })),
                    { ordered: false } // one bad row shouldn't block the rest of a broadcast this size
                );
            }

            // Same broadcast-to-everyone mechanism already used for
            // 'onlineUsers' in socket/socket.js — io.emit with no `.to(room)`
            // reaches every currently-connected socket at once.
            getIO().emit('notificationReceived', {
                type: 'announcement',
                message: announcement.message,
                senderId: req.user._id,
                timestamp: new Date(),
            });

            // Fire-and-forget — a slow push provider shouldn't hold up the
            // admin's "announcement created" response.
            sendPushToAllExcept(req.user._id, {
                title: '📢 Announcement',
                body: announcement.message,
                type: 'announcement',
                data: { url: '/connections' },
            }).catch((err) => console.error('Announcement push fan-out error:', err.message));
        }

        res.status(201).json({ success: true, announcement });
    } catch (error) {
        console.error('createAnnouncement error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// LIST (admin) — management view, newest first
// =========================
const listAnnouncements = async (req, res) => {
    try {
        const announcements = await Announcement.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, announcements });
    } catch (error) {
        console.error('listAnnouncements error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// UPDATE (admin) — toggle active / edit fields, no re-fan-out
// =========================
const updateAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;
        const { message, linkUrl, active } = req.body;

        const update = {};
        if (message !== undefined) update.message = message.trim();
        if (linkUrl !== undefined) update.linkUrl = linkUrl.trim() || undefined;
        if (active !== undefined) update.active = !!active;

        const announcement = await Announcement.findByIdAndUpdate(id, update, { new: true });
        if (!announcement) {
            return res.status(404).json({ success: false, message: 'Announcement not found' });
        }
        res.status(200).json({ success: true, announcement });
    } catch (error) {
        console.error('updateAnnouncement error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// DELETE (admin)
// =========================
const deleteAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;
        const announcement = await Announcement.findByIdAndDelete(id);
        if (!announcement) {
            return res.status(404).json({ success: false, message: 'Announcement not found' });
        }
        res.status(200).json({ success: true, message: 'Announcement deleted' });
    } catch (error) {
        console.error('deleteAnnouncement error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// GET ACTIVE (any logged-in user) — for the chat/feed banner surfaces
// =========================
const getActiveAnnouncements = async (req, res) => {
    try {
        const { channel } = req.query; // 'chatBanner' | 'feedBanner'
        if (!['chatBanner', 'feedBanner'].includes(channel)) {
            return res.status(400).json({ success: false, message: 'Invalid or missing channel' });
        }

        const announcements = await Announcement.find({
            active: true,
            [`channels.${channel}`]: true,
            $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
        }).sort({ createdAt: -1 });

        res.status(200).json({ success: true, announcements });
    } catch (error) {
        console.error('getActiveAnnouncements error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    createAnnouncement,
    listAnnouncements,
    updateAnnouncement,
    deleteAnnouncement,
    getActiveAnnouncements,
};
