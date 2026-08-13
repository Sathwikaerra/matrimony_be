// models/LockerDocument.js
//
// Private per-user document storage ("secret locker"). Fully private by
// default — nobody but the owner can see a document until the owner
// explicitly shares it with a specific accepted connection (see
// controllers/lockerController.js). Files live in Cloudinary under
// `type: 'authenticated'` (see config/cloudinary.js's uploadLockerDocument),
// so the stored publicId alone isn't enough to fetch the file — a signed,
// short-lived URL is minted per-request only after the permission check
// passes (lockerController.getDocumentUrl). Deliberately NOT storing a plain
// public fileUrl here — that would defeat the whole point of "secret".
const mongoose = require('mongoose');

const lockerDocumentSchema = new mongoose.Schema({
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    title: {
        type: String,
        required: true,
        trim: true,
    },
    category: {
        type: String,
        enum: ['id_proof', 'certificate', 'financial', 'medical', 'other'],
        default: 'other',
    },
    // Cloudinary identifiers needed to mint a signed URL on demand.
    publicId: {
        type: String,
        required: true,
    },
    resourceType: {
        type: String,
        enum: ['image', 'video', 'raw'],
        required: true,
    },
    format: {
        type: String,
        required: true,
    },
    originalName: String,
    fileSize: Number,
    // Per-document, owner-granted access list. A viewer must appear here
    // AND currently have an accepted Connection with the owner — either
    // condition failing revokes access (see utils/isConnected.js usage in
    // the controller). Connection breaking off doesn't require the owner to
    // remember to also revoke here — it's re-checked live on every view.
    sharedWith: [
        {
            user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            grantedAt: { type: Date, default: Date.now },
        },
    ],
}, { timestamps: true });

lockerDocumentSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model('LockerDocument', lockerDocumentSchema);
