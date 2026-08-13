// controllers/lockerController.js
//
// "Secret locker" — private per-user document storage. Nothing is visible
// to anyone but the owner until the owner explicitly grants a specific
// accepted connection access to a specific document (shareDocument).
// Access can be revoked any time, and is also implicitly revoked the
// moment the underlying Connection stops being 'accepted' — every read
// path below re-checks isConnected() live rather than trusting sharedWith
// alone, same pattern as storyController.getHighlights.
const cloudinary = require('cloudinary').v2;
const LockerDocument = require('../models/LockerDocument');
const { isConnected } = require('../utils/isConnected');
const { createNotification } = require('../services/notificationStore');
const { notifyLockerShared } = require('../services/pushService');

// How long a minted view/download URL stays valid for. Short-lived on
// purpose — the URL itself grants access to whoever holds it for this
// window, so it's re-derived fresh on every "view" click rather than
// cached or stored anywhere.
const SIGNED_URL_TTL_SECONDS = 5 * 60;

// The installed multer-storage-cloudinary version only forwards
// {path, size, filename} onto req.file — it drops Cloudinary's own
// format/resource_type from the upload response — so both are derived here
// from the extension instead. Matches how `resource_type: 'auto'` actually
// classifies these formats on Cloudinary's side: PDFs upload as 'image'
// (page-based transforms), Office docs as 'raw'.
const RAW_EXTENSIONS = new Set(['doc', 'docx', 'xls', 'xlsx']);
function classifyUpload(originalName) {
    const format = (originalName.split('.').pop() || '').toLowerCase();
    const resourceType = RAW_EXTENSIONS.has(format) ? 'raw' : 'image';
    return { format, resourceType };
}

// =========================
// UPLOAD DOCUMENT
// =========================
const uploadDocument = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'A file is required' });
        }
        const { title, category } = req.body;
        if (!title?.trim()) {
            return res.status(400).json({ success: false, message: 'A title is required' });
        }

        const { format, resourceType } = classifyUpload(req.file.originalname);

        const doc = await LockerDocument.create({
            owner: req.user._id,
            title: title.trim(),
            category: category || 'other',
            publicId: req.file.filename,          // multer-storage-cloudinary sets this to the Cloudinary public_id
            resourceType,
            format,
            originalName: req.file.originalname,
            fileSize: req.file.size,
        });

        res.status(201).json({ success: true, document: sanitize(doc, req.user._id) });
    } catch (error) {
        console.error('uploadDocument error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// GET MY DOCUMENTS (owner's own locker)
// =========================
const getMyDocuments = async (req, res) => {
    try {
        const documents = await LockerDocument.find({ owner: req.user._id })
            .sort({ createdAt: -1 })
            .populate('sharedWith.user', 'name photos city');

        res.status(200).json({ success: true, documents: documents.map((d) => sanitize(d, req.user._id)) });
    } catch (error) {
        console.error('getMyDocuments error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// GET DOCUMENTS SHARED WITH ME
// =========================
const getSharedWithMe = async (req, res) => {
    try {
        const userId = req.user._id;
        const documents = await LockerDocument.find({ 'sharedWith.user': userId })
            .sort({ createdAt: -1 })
            .populate('owner', 'name photos city');

        // Defensive filter — only surface docs from owners still connected
        // to the requester (sharedWith isn't cleaned up when a connection
        // breaks; that's checked live here and again in getDocumentUrl).
        const stillConnected = await Promise.all(
            documents.map((d) => isConnected(userId, d.owner._id))
        );
        const visible = documents.filter((_, i) => stillConnected[i]);

        res.status(200).json({
            success: true,
            documents: visible.map((d) => ({
                _id: d._id,
                title: d.title,
                category: d.category,
                originalName: d.originalName,
                fileSize: d.fileSize,
                format: d.format,
                owner: d.owner,
                sharedAt: d.sharedWith.find((s) => s.user.toString() === userId.toString())?.grantedAt,
                createdAt: d.createdAt,
            })),
        });
    } catch (error) {
        console.error('getSharedWithMe error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// SHARE DOCUMENT (owner grants an accepted connection access)
// =========================
const shareDocument = async (req, res) => {
    try {
        const { documentId } = req.params;
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ success: false, message: 'userId is required' });
        }

        const doc = await LockerDocument.findById(documentId);
        if (!doc) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        if (doc.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        const connected = await isConnected(req.user._id, userId);
        if (!connected) {
            return res.status(400).json({ success: false, message: 'You can only share with an accepted connection' });
        }

        const alreadyShared = doc.sharedWith.some((s) => s.user.toString() === userId);
        if (!alreadyShared) {
            doc.sharedWith.push({ user: userId, grantedAt: new Date() });
            await doc.save();

            await createNotification({
                recipient: userId,
                sender: req.user._id,
                type: 'locker_share',
                message: `${req.user.name || 'Someone'} shared a document with you: "${doc.title}"`,
                data: { documentId: doc._id.toString() },
            });
            await notifyLockerShared(userId, req.user.name || 'Someone', req.user._id, doc.title);
        }

        const populated = await doc.populate('sharedWith.user', 'name photos city');
        res.status(200).json({ success: true, document: sanitize(populated, req.user._id) });
    } catch (error) {
        console.error('shareDocument error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// REVOKE ACCESS (owner only)
// =========================
const revokeAccess = async (req, res) => {
    try {
        const { documentId, userId } = req.params;

        const doc = await LockerDocument.findById(documentId);
        if (!doc) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        if (doc.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        doc.sharedWith = doc.sharedWith.filter((s) => s.user.toString() !== userId);
        await doc.save();

        res.status(200).json({ success: true, message: 'Access revoked' });
    } catch (error) {
        console.error('revokeAccess error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// GET A SIGNED, SHORT-LIVED VIEW/DOWNLOAD URL
// =========================
// The permission check that actually matters — everything above is just
// bookkeeping. Nothing before this point ever hands out a fetchable URL.
const getDocumentUrl = async (req, res) => {
    try {
        const { documentId } = req.params;
        const requesterId = req.user._id;

        const doc = await LockerDocument.findById(documentId);
        if (!doc) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }

        const isOwner = doc.owner.toString() === requesterId.toString();
        if (!isOwner) {
            const isShared = doc.sharedWith.some((s) => s.user.toString() === requesterId.toString());
            const connected = isShared && await isConnected(requesterId, doc.owner);
            if (!connected) {
                return res.status(403).json({ success: false, message: 'Not authorized to view this document' });
            }
        }

        const expiresAt = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS;
        const url = cloudinary.utils.private_download_url(doc.publicId, doc.format, {
            resource_type: doc.resourceType,
            type: 'authenticated',
            expires_at: expiresAt,
        });

        res.status(200).json({ success: true, url, expiresAt });
    } catch (error) {
        console.error('getDocumentUrl error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// DELETE DOCUMENT (owner only)
// =========================
const deleteDocument = async (req, res) => {
    try {
        const { documentId } = req.params;
        const doc = await LockerDocument.findById(documentId);

        if (!doc) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        if (doc.owner.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        await cloudinary.uploader.destroy(doc.publicId, {
            resource_type: doc.resourceType,
            type: 'authenticated',
        }).catch((err) => console.error('Cloudinary destroy error:', err.message)); // don't block the DB delete on a Cloudinary hiccup

        await doc.deleteOne();
        res.status(200).json({ success: true, message: 'Document deleted' });
    } catch (error) {
        console.error('deleteDocument error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Strips internal Cloudinary identifiers (publicId) from the owner-facing
// response — the frontend never needs it directly, it always goes through
// getDocumentUrl to get a signed link.
function sanitize(doc, viewerId) {
    return {
        _id: doc._id,
        title: doc.title,
        category: doc.category,
        originalName: doc.originalName,
        fileSize: doc.fileSize,
        format: doc.format,
        createdAt: doc.createdAt,
        isOwner: doc.owner.toString() === viewerId.toString(),
        sharedWith: doc.sharedWith.map((s) => ({
            user: s.user,
            grantedAt: s.grantedAt,
        })),
    };
}

module.exports = {
    uploadDocument,
    getMyDocuments,
    getSharedWithMe,
    shareDocument,
    revokeAccess,
    getDocumentUrl,
    deleteDocument,
};
