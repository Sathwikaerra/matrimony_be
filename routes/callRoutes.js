// routes/callRoutes.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getCallHistory } = require('../controllers/callController');

router.get('/history', protect, getCallHistory);

module.exports = router;
