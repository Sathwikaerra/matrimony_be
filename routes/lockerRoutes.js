// routes/lockerRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { uploadLockerDocument } = require('../config/cloudinary');
const {
    uploadDocument,
    getMyDocuments,
    getSharedWithMe,
    shareDocument,
    revokeAccess,
    getDocumentUrl,
    deleteDocument,
} = require('../controllers/lockerController');

// Guard — catches undefined imports before Express does (same pattern as connectionRoutes.js)
[uploadDocument, getMyDocuments, getSharedWithMe, shareDocument, revokeAccess, getDocumentUrl, deleteDocument]
    .forEach((fn, i) => {
        if (typeof fn !== 'function') throw new Error(`lockerController export #${i} is not a function`);
    });

// Wrap multer/Cloudinary explicitly so upload failures return clean JSON
// instead of Express's generic HTML error page (same pattern as storyRoutes.js).
const handleLockerUpload = (req, res, next) => {
    uploadLockerDocument.single('document')(req, res, (err) => {
        if (err) {
            console.error('Locker document upload error:', err.message || err);
            return res.status(400).json({
                success: false,
                message: err.message || 'File upload failed. Please check the file format and size.',
            });
        }
        next();
    });
};

// POST   /api/locker                       (upload a document into my own locker)
router.post('/', protect, handleLockerUpload, uploadDocument);

// GET    /api/locker/my                     (my own locker — everything I own)
router.get('/my', protect, getMyDocuments);

// GET    /api/locker/shared-with-me         (documents connections shared with me)
router.get('/shared-with-me', protect, getSharedWithMe);

// POST   /api/locker/:documentId/share      (owner grants an accepted connection access) — body: { userId }
router.post('/:documentId/share', protect, shareDocument);

// DELETE /api/locker/:documentId/share/:userId   (owner revokes access)
router.delete('/:documentId/share/:userId', protect, revokeAccess);

// GET    /api/locker/:documentId/url        (mint a short-lived signed view/download URL)
router.get('/:documentId/url', protect, getDocumentUrl);

// DELETE /api/locker/:documentId            (owner only)
router.delete('/:documentId', protect, deleteDocument);

module.exports = router;
