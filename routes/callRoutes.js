// routes/callRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getCallHistory, deleteCallLog, bulkDeleteCallLogs } = require('../controllers/callController');

router.get('/history', protect, getCallHistory);
router.post('/bulk-delete', protect, bulkDeleteCallLogs);
router.delete('/:id', protect, deleteCallLog);

module.exports = router;
