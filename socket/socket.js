// socket/socket.js
const { Server } = require('socket.io');

let io;

// Map: userId → socket.id
const userSocketMap = {};

const getOnlineUsers = () => Object.keys(userSocketMap);

const initSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.CLIENT_URL || '*',
            methods: ['GET', 'POST'],
        },
    });

    io.on('connection', (socket) => {
        console.log('🔌 Socket connected:', socket.id);

        // ── Register user ──────────────────────────────────────────────────
        socket.on('registerUser', (userId) => {
            if (!userId) {
                console.log('⚠️  registerUser called with empty userId');
                return;
            }
            
            const uidStr = userId.toString();
            userSocketMap[uidStr] = socket.id; // Map userId to this specific socket
            socket.join(uidStr); // ✅ Join a room named after userId
            
            // 1. Send current online list to the user who just registered
            socket.emit('onlineUsers', getOnlineUsers());
            
            // 2. Notify everyone else
            io.emit('onlineUsers', getOnlineUsers());
            
            console.log(`✅ User ${uidStr} registered (socket ${socket.id}) and joined room`);
            console.log('🟢 Online users now:', getOnlineUsers());
        });

        socket.on('getOnlineUsers', () => {
            socket.emit('onlineUsers', getOnlineUsers());
        });

        // ── Send message ───────────────────────────────────────────────────
        socket.on('sendMessage', (data) => {
            const receiverId = data.receiverId?.toString();
            if (receiverId) {
                io.to(receiverId).emit('receiveMessage', data);
                console.log(`📨 Message sent to room: ${receiverId}`);
            }
        });

        // ── Delete message ─────────────────────────────────────────────────
        socket.on('deleteMessage', ({ msgId, receiverId }) => {
            if (receiverId) {
                io.to(receiverId.toString()).emit('messageDeleted', { msgId });
            }
        });

        // ── Typing indicators ──────────────────────────────────────────────
        socket.on('typing', ({ senderId, receiverId }) => {
            if (receiverId) {
                io.to(receiverId.toString()).emit('partnerTyping', { senderId });
            }
        });

        socket.on('stopTyping', ({ senderId, receiverId }) => {
            if (receiverId) {
                io.to(receiverId.toString()).emit('partnerStopTyping', { senderId });
            }
        });

        // ── Disconnect ─────────────────────────────────────────────────────
        socket.on('disconnect', () => {
            // Find which user this socket belonged to
            const userId = Object.keys(userSocketMap).find(
                (key) => userSocketMap[key] === socket.id
            );
            
            if (userId) {
                delete userSocketMap[userId];
                io.emit('onlineUsers', getOnlineUsers());
                console.log(`🔴 User ${userId} disconnected`);
                console.log('🟢 Online users now:', getOnlineUsers());
            }
        });
    });

    return io;
};

const getIO = () => {
    if (!io) throw new Error('Socket.io not initialized');
    return io;
};

module.exports = { initSocket, getIO, getOnlineUsers };