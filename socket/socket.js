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
            
            // Map userId to this socket
            socket.userId = userId; 
            userSocketMap[userId] = socket.id; // Still keep for simple lookup if needed
            
            socket.join(userId.toString()); // ✅ Join a room named after userId
            
            io.emit('onlineUsers', getOnlineUsers());
            console.log(`✅ User ${userId} registered (socket ${socket.id}) and joined room`);
        });

        // ── Send message ───────────────────────────────────────────────────
        socket.on('sendMessage', (data) => {
            const receiverId = data.receiverId?.toString();
            console.log(`📨 sendMessage → receiverId: ${receiverId}`);
            
            if (receiverId) {
                // Emit to ALL sockets of the receiver using their room
                io.to(receiverId).emit('receiveMessage', data);
                console.log('✅ Message delivered to room', receiverId);
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
            const userId = socket.userId;
            if (userId) {
                // Check if this user has any other sockets still connected to their room
                const remainingSockets = io.sockets.adapter.rooms.get(userId.toString());
                
                if (!remainingSockets || remainingSockets.size === 0) {
                    // No more active sessions for this user
                    delete userSocketMap[userId];
                    io.emit('onlineUsers', getOnlineUsers());
                    console.log(`🔴 User ${userId} is now offline`);
                } else {
                    console.log(`ℹ️  User ${userId} disconnected one tab, but remains online`);
                }
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