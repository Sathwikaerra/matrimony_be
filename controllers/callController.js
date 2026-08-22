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
            deletedBy: { $ne: userId },
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

// DELETE /api/calls/:id — soft-delete call log for the requesting user
const deleteCallLog = async (req, res) => {
    try {
        const userId = req.user._id;
        const { id } = req.params;

        const log = await CallLog.findById(id);
        if (!log) {
            return res.status(404).json({ success: false, message: 'Call log not found' });
        }

        if (log.caller.toString() !== userId.toString() && log.callee.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: 'Not authorized to delete this call log' });
        }

        if (!log.deletedBy.includes(userId)) {
            log.deletedBy.push(userId);
            await log.save();
        }

        res.status(200).json({ success: true, message: 'Call log deleted' });
    } catch (error) {
        console.error('deleteCallLog error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/calls/bulk-delete — soft-delete multiple call logs for the requesting user
const bulkDeleteCallLogs = async (req, res) => {
    try {
        const userId = req.user._id;
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'No call log IDs provided' });
        }

        await CallLog.updateMany(
            {
                _id: { $in: ids },
                $or: [{ caller: userId }, { callee: userId }],
            },
            { $addToSet: { deletedBy: userId } }
        );

        res.status(200).json({ success: true, message: 'Selected call logs deleted' });
    } catch (error) {
        console.error('bulkDeleteCallLogs error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = { getCallHistory, deleteCallLog, bulkDeleteCallLogs };
