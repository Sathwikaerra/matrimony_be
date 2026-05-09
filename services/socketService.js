// services/socketService.js
const { getIO } = require('../socket/socket');

class SocketService {

    static emitNewUserRegistration(user) {
        try {
            const io = getIO();
            io.emit('new-user-registered', {
                userId: user._id,
                name: user.name,
                email: user.email,
                gender: user.gender,
                timestamp: new Date()
            });
        } catch (error) {
            console.error('Socket emission error:', error.message);
        }
    }

    static emitUserLogin(user) {
        try {
            const io = getIO();
            io.emit('user-logged-in', {
                userId: user._id,
                name: user.name,
                email: user.email,
                timestamp: new Date()
            });
        } catch (error) {
            console.error('Socket emission error:', error.message);
        }
    }

    // =========================
    // CONNECTION REQUEST SENT
    // Notifies the receiver in real-time
    // =========================
    static emitConnectionRequest(connection) {
        try {
            const io = getIO();
            // Emit only to the receiver's room
            // Emit specific event for data sync
            io.to(connection.receiver.toString()).emit('connection-request-received', {
                connectionId: connection._id,
                senderId: connection.sender,
                status: connection.status,
                timestamp: new Date()
            });
            // Emit generic notification for toast
            io.to(connection.receiver.toString()).emit('notificationReceived', {
                type: 'interest',
                message: `You received a new connection request`,
                senderId: connection.sender,
                timestamp: new Date()
            });
        } catch (error) {
            console.error('Socket emission error:', error.message);
        }
    }

    // =========================
    // CONNECTION REQUEST ACCEPTED
    // Notifies the original sender in real-time
    // =========================
    static emitConnectionAccepted(connection) {
        try {
            const io = getIO();
            // Emit only to the sender's room
            // Emit specific event for data sync
            io.to(connection.sender.toString()).emit('connection-request-accepted', {
                connectionId: connection._id,
                receiverId: connection.receiver,
                status: connection.status,
                timestamp: new Date()
            });
            // Emit generic notification for toast
            io.to(connection.sender.toString()).emit('notificationReceived', {
                type: 'match',
                message: `Your connection request was accepted!`,
                senderId: connection.receiver,
                timestamp: new Date()
            });
        } catch (error) {
            console.error('Socket emission error:', error.message);
        }
    }

    // =========================
    // LIKE NOTIFICATION
    // =========================
    static emitLikeNotification(sender, receiverId) {
        try {
            const io = getIO();
            io.to(receiverId.toString()).emit('notificationReceived', {
                type: 'like',
                message: `${sender.name} liked your profile`,
                senderId: sender._id,
                timestamp: new Date()
            });
        } catch (error) {
            console.error('Socket emission error (like):', error.message);
        }
    }

    // =========================
    // COMMENT NOTIFICATION
    // =========================
    static emitCommentNotification(sender, receiverId, commentText) {
        try {
            const io = getIO();
            io.to(receiverId.toString()).emit('notificationReceived', {
                type: 'comment',
                message: `${sender.name} commented: "${commentText.length > 30 ? commentText.slice(0, 30) + '...' : commentText}"`,
                senderId: sender._id,
                timestamp: new Date()
            });
        } catch (error) {
            console.error('Socket emission error (comment):', error.message);
        }
    }

}

module.exports = SocketService;