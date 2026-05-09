// controllers/connectionController.js  (UPDATED — push notifications added)
const Connection = require('../models/Connection');
const User = require('../models/User');
const SocketService = require('../services/socketService');
const {
    notifyInterestReceived,
    notifyNewMatch,
} = require('../services/pushService'); // ← ADD THIS


const getDeclinedRequests = async (req, res) => {
    try {
        const userId = req.user._id;
        const requests = await Connection.find({
            receiver: userId,
            status: 'rejected'
        }).populate('sender', 'name email photos city occupation');

        res.status(200).json({ success: true, count: requests.length, requests });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// SEND CONNECTION REQUEST
// =========================
const sendRequest = async (req, res) => {
    try {
        const senderId = req.user._id;
        const { receiverId } = req.params;

        if (senderId.toString() === receiverId) {
            return res.status(400).json({
                success: false,
                message: "You cannot send a request to yourself"
            });
        }

        const receiver = await User.findById(receiverId);
        if (!receiver) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        const existing = await Connection.findOne({
            $or: [
                { sender: senderId, receiver: receiverId },
                { sender: receiverId, receiver: senderId }
            ],
            status: { $in: ['pending', 'accepted'] }
        });

        if (existing) {
            return res.status(400).json({
                success: false,
                message: `A connection already exists with status: ${existing.status}`
            });
        }

        const stale = await Connection.findOneAndUpdate(
            {
                $or: [
                    { sender: senderId, receiver: receiverId },
                    { sender: receiverId, receiver: senderId }
                ],
                status: { $in: ['rejected', 'withdrawn'] }
            },
            { sender: senderId, receiver: receiverId, status: 'pending' },
            { new: true }
        );

        const connection = stale || await Connection.create({
            sender: senderId,
            receiver: receiverId
        });

        SocketService.emitConnectionRequest(connection);

        // ── Push notification ─────────────────────────────────────────────
        const sender = await User.findById(senderId).select('name');
        if (sender) {
            notifyInterestReceived(receiverId, sender.name, senderId.toString());
        }
        // ──────────────────────────────────────────────────────────────────

        res.status(201).json({
            success: true,
            message: "Connection request sent",
            connection
        });

    } catch (error) {
        console.error('sendRequest error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// ACCEPT REQUEST
// =========================
const acceptRequest = async (req, res) => {
    try {
        const userId = req.user._id;
        const { connectionId } = req.params;

        const connection = await Connection.findById(connectionId);

        if (!connection) {
            return res.status(404).json({ success: false, message: "Request not found" });
        }

        if (connection.receiver.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: "Not authorized" });
        }

        if (connection.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `Request is already ${connection.status}`
            });
        }

        connection.status = 'accepted';
        await connection.save();

        SocketService.emitConnectionAccepted(connection);

        // ── Push notification ─────────────────────────────────────────────
        // Notify the original sender that their request was accepted (= new match)
        const acceptor = await User.findById(userId).select('name');
        if (acceptor) {
            notifyNewMatch(
                connection.sender.toString(),
                acceptor.name,
                userId.toString()
            );
        }
        // ──────────────────────────────────────────────────────────────────

        res.status(200).json({ success: true, message: "Connection accepted", connection });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// REJECT REQUEST
// =========================
const rejectRequest = async (req, res) => {
    try {
        const userId = req.user._id;
        const { connectionId } = req.params;

        const connection = await Connection.findById(connectionId);
        if (!connection) return res.status(404).json({ success: false, message: "Request not found" });
        if (connection.receiver.toString() !== userId.toString()) return res.status(403).json({ success: false, message: "Not authorized" });
        if (connection.status !== 'pending') return res.status(400).json({ success: false, message: `Request is already ${connection.status}` });

        connection.status = 'rejected';
        await connection.save();

        res.status(200).json({ success: true, message: "Connection rejected", connection });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// WITHDRAW / CANCEL REQUEST
// =========================
const withdrawRequest = async (req, res) => {
    try {
        const userId = req.user._id;
        const { connectionId } = req.params;

        const connection = await Connection.findById(connectionId);
        if (!connection) return res.status(404).json({ success: false, message: "Request not found" });
        if (connection.sender.toString() !== userId.toString()) return res.status(403).json({ success: false, message: "Not authorized" });
        if (connection.status !== 'pending') return res.status(400).json({ success: false, message: "Only pending requests can be withdrawn" });

        connection.status = 'withdrawn';
        await connection.save();

        res.status(200).json({ success: true, message: "Request withdrawn", connection });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// GET PENDING REQUESTS (received)
// =========================
const getPendingRequests = async (req, res) => {
    try {
        const userId = req.user._id;
        const requests = await Connection.find({ receiver: userId, status: 'pending' })
            .populate('sender', 'name email photos city occupation');
        res.status(200).json({ success: true, count: requests.length, requests });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// GET SENT REQUESTS
// =========================
const getSentRequests = async (req, res) => {
    try {
        const userId = req.user._id;
        const requests = await Connection.find({
            sender: userId,
            status: { $in: ['pending', 'accepted', 'rejected'] }
        }).populate('receiver', 'name email photos city occupation');
        res.status(200).json({ success: true, count: requests.length, requests });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// =========================
// GET ALL MY CONNECTIONS (accepted)
// =========================
const getMyConnections = async (req, res) => {
    try {
        const userId = req.user._id;
        const connections = await Connection.find({
            $or: [{ sender: userId }, { receiver: userId }],
            status: 'accepted'
        })
        .populate('sender', 'name email photos city occupation')
        .populate('receiver', 'name email photos city occupation');

        const contacts = connections.map(conn => {
            const isSender = conn.sender._id.toString() === userId.toString();
            return {
                connectionId: conn._id,
                connectedAt: conn.updatedAt,
                user: isSender ? conn.receiver : conn.sender
            };
        });

        res.status(200).json({ success: true, count: contacts.length, connections: contacts });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    sendRequest,
    acceptRequest,
    rejectRequest,
    withdrawRequest,
    getPendingRequests,
    getSentRequests,
    getMyConnections,
    getDeclinedRequests
};
