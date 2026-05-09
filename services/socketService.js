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
            io.to(connection.receiver.toString()).emit('connection-request-received', {
                connectionId: connection._id,
                senderId: connection.sender,
                status: connection.status,
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
            io.to(connection.sender.toString()).emit('connection-request-accepted', {
                connectionId: connection._id,
                receiverId: connection.receiver,
                status: connection.status,
                timestamp: new Date()
            });
        } catch (error) {
            console.error('Socket emission error:', error.message);
        }
    }

}

module.exports = SocketService;