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
            userSocketMap[userId] = socket.id;
            socket.join(userId.toString()); // ✅ Join a room named after userId
            io.emit('onlineUsers', getOnlineUsers());
            console.log(`✅ User ${userId} registered (socket ${socket.id}) and joined room`);
            console.log('🟢 Online users now:', getOnlineUsers());
        });

        // ── Send message ───────────────────────────────────────────────────
        socket.on('sendMessage', (data) => {
            const receiverSocketId = userSocketMap[data.receiverId?.toString()];
            console.log(`📨 sendMessage → receiverId: ${data.receiverId} | socketId: ${receiverSocketId || 'NOT FOUND'}`);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('receiveMessage', data);
                console.log('✅ Message delivered to', data.receiverId);
            } else {
                console.log('❌ Receiver not online — message not delivered in real-time');
            }
        });

        // ── Delete message ─────────────────────────────────────────────────
        socket.on('deleteMessage', ({ msgId, receiverId }) => {
            const receiverSocketId = userSocketMap[receiverId?.toString()];
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('messageDeleted', { msgId });
            }
        });

        // ── Typing indicators ──────────────────────────────────────────────
        socket.on('typing', ({ senderId, receiverId }) => {
            const receiverSocketId = userSocketMap[receiverId?.toString()];
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('partnerTyping', { senderId });
            }
        });

        socket.on('stopTyping', ({ senderId, receiverId }) => {
            const receiverSocketId = userSocketMap[receiverId?.toString()];
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('partnerStopTyping', { senderId });
            }
        });

        // ── Disconnect ─────────────────────────────────────────────────────
        socket.on('disconnect', () => {
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