// socket/socket.js

const { Server } = require("socket.io");

let io;

// userId -> socketId
const userSocketMap = {};

const getOnlineUsers = () => Object.keys(userSocketMap);

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "*",
      methods: ["GET", "POST"],
      credentials: true,
    },

    // ✅ Important for Android/mobile browsers
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket) => {
    console.log("🔌 Socket connected:", socket.id);

    // ─────────────────────────────────────────────
    // Register User
    // ─────────────────────────────────────────────
    socket.on("registerUser", (userId) => {
      try {
        if (!userId) {
          console.log("⚠️ registerUser called without userId");
          return;
        }

        const uidStr = userId.toString();

        // Save latest socket id
        userSocketMap[uidStr] = socket.id;

        // Join room using userId
        socket.join(uidStr);

        console.log(
          `✅ User ${uidStr} registered with socket ${socket.id}`
        );

        console.log("🟢 Online users:", getOnlineUsers());

        // Send online users to everyone
        io.emit("onlineUsers", getOnlineUsers());

      } catch (err) {
        console.log("❌ registerUser error:", err.message);
      }
    });

    // ─────────────────────────────────────────────
    // Get Online Users
    // ─────────────────────────────────────────────
    socket.on("getOnlineUsers", () => {
      socket.emit("onlineUsers", getOnlineUsers());
    });

    // ─────────────────────────────────────────────
    // Send Message
    // ─────────────────────────────────────────────
    socket.on("sendMessage", (data) => {
      try {
        const receiverId = data?.receiverId?.toString();

        if (!receiverId) return;

        io.to(receiverId).emit("receiveMessage", data);

        console.log(`📨 Message sent to room: ${receiverId}`);

      } catch (err) {
        console.log("❌ sendMessage error:", err.message);
      }
    });

    // ─────────────────────────────────────────────
    // Refresh Unread Count
    // ─────────────────────────────────────────────
    socket.on("refreshUnreadCount", ({ userId }) => {
      try {
        if (!userId) return;

        io.to(userId.toString()).emit("refreshUnreadCount");

        console.log(`🔄 Refresh unread count for ${userId}`);

      } catch (err) {
        console.log("❌ refreshUnreadCount error:", err.message);
      }
    });

    // ─────────────────────────────────────────────
    // Delete Message
    // ─────────────────────────────────────────────
    socket.on("deleteMessage", ({ msgId, receiverId }) => {
      try {
        if (!receiverId) return;

        io.to(receiverId.toString()).emit("messageDeleted", {
          msgId,
        });

      } catch (err) {
        console.log("❌ deleteMessage error:", err.message);
      }
    });

    // ─────────────────────────────────────────────
    // Typing Start
    // ─────────────────────────────────────────────
    socket.on("typing", ({ senderId, receiverId }) => {
      try {
        if (!receiverId) return;

        io.to(receiverId.toString()).emit("partnerTyping", {
          senderId,
        });

      } catch (err) {
        console.log("❌ typing error:", err.message);
      }
    });

    // ─────────────────────────────────────────────
    // Typing Stop
    // ─────────────────────────────────────────────
    socket.on("stopTyping", ({ senderId, receiverId }) => {
      try {
        if (!receiverId) return;

        io.to(receiverId.toString()).emit("partnerStopTyping", {
          senderId,
        });

      } catch (err) {
        console.log("❌ stopTyping error:", err.message);
      }
    });

    // ─────────────────────────────────────────────
    // Disconnect
    // ─────────────────────────────────────────────
    socket.on("disconnect", (reason) => {
      console.log("❌ Socket disconnected:", socket.id);
      console.log("Reason:", reason);

      // Find user of this socket
      const userId = Object.keys(userSocketMap).find(
        (key) => userSocketMap[key] === socket.id
      );

      // ✅ Prevent removing newer socket connection
      if (userId && userSocketMap[userId] === socket.id) {
        delete userSocketMap[userId];

        console.log(`🔴 User ${userId} disconnected`);

        io.emit("onlineUsers", getOnlineUsers());

        console.log("🟢 Online users:", getOnlineUsers());
      }
    });

    // ─────────────────────────────────────────────
    // Socket Error
    // ─────────────────────────────────────────────
    socket.on("error", (err) => {
      console.log("❌ Socket error:", err);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }

  return io;
};

module.exports = {
  initSocket,
  getIO,
  getOnlineUsers,
};
