// routes/connectionRoutes.js

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');

const {
    sendRequest,
    acceptRequest,
    rejectRequest,
    withdrawRequest,
    getPendingRequests,
    getSentRequests,
    getMyConnections,
    getDeclinedRequests
} = require('../controllers/connectionController');

// Guard — catches undefined imports before Express does
[sendRequest, acceptRequest, rejectRequest, withdrawRequest, getPendingRequests, getSentRequests, getMyConnections]
    .forEach((fn, i) => {
        if (typeof fn !== 'function') throw new Error(`connectionController export #${i} is not a function`);
    });

router.post('/send/:receiverId',         protect, sendRequest);
router.patch('/accept/:connectionId',    protect, acceptRequest);
router.patch('/reject/:connectionId',    protect, rejectRequest);
router.patch('/withdraw/:connectionId',  protect, withdrawRequest);
router.get('/pending',                   protect, getPendingRequests);
router.get('/sent',                      protect, getSentRequests);
router.get('/my',                        protect, getMyConnections);
// routes/connectionRoutes.js — add this line
router.get('/declined', protect, getDeclinedRequests);

module.exports = router;