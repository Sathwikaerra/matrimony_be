// controllers/callController.js
const CallLog = require('../models/CallLog');

// GET /api/calls/history — every call this user placed or received, most
// recent first. `direction` is computed relative to the requesting user so
// the frontend doesn't have to compare ids itself.
const getCallHistory = async (req, res) => {
    try {
        const userId = req.user._id;
        const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);

        const logs = await CallLog.find({
            $or: [{ caller: userId }, { callee: userId }],
        })
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate('caller', 'name photos')
            .populate('callee', 'name photos');

        const calls = logs.map((log) => {
            const isOutgoing = log.caller._id.toString() === userId.toString();
            const peer = isOutgoing ? log.callee : log.caller;
            return {
                _id: log._id,
                direction: isOutgoing ? 'outgoing' : 'incoming',
                status: log.status,
                peer: { _id: peer._id, name: peer.name, photos: peer.photos },
                startedAt: log.startedAt,
                connectedAt: log.connectedAt,
                endedAt: log.endedAt,
                durationSeconds: log.durationSeconds,
            };
        });

        res.status(200).json({ success: true, calls });
    } catch (error) {
        console.error('getCallHistory error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getCallHistory };
