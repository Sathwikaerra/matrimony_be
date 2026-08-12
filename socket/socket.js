// socket/socket.js

const { Server } = require("socket.io");
const { isConnected } = require("../utils/isConnected");
const User = require("../models/User");

let io;

// userId -> socketId
const userSocketMap = {};

const getOnlineUsers = () => Object.keys(userSocketMap);

// Deployed frontend URL(s) come from CLIENT_URL (comma-separated if there's
// more than one, e.g. "https://matrimonye.netlify.app,https://staging.example.com").
// Local dev origins are always allowed too, so you don't have to flip
// CLIENT_URL back and forth between local and deployed testing.
const DEV_ORIGINS = ["http://localhost:5173", "http://localhost:3000"];
const configuredOrigins = (process.env.CLIENT_URL || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([...configuredOrigins, ...DEV_ORIGINS])];

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: allowedOrigins,
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
    // Messages Read — lets the read ticks on the sender's screen flip to
    // blue live, instead of only updating after their next refetch. Pure
    // relay: the reader tells us who they just caught up on, we tell that
    // person's room "readerId has read what you sent them".
    // ─────────────────────────────────────────────
    socket.on("messagesRead", ({ readerId, otherUserId }) => {
      try {
        if (!readerId || !otherUserId) return;

        io.to(otherUserId.toString()).emit("messagesRead", { readerId });

      } catch (err) {
        console.log("❌ messagesRead error:", err.message);
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
    // Video Call — Signaling only, media never touches the server.
    // Calls are gated to accepted connections, same as everywhere else.
    //
    // simple-peer (frontend) bundles the offer/answer/ICE-candidates all
    // through its own generic 'signal' event, so instead of forcing those
    // into separately-typed socket events (fragile — would mean sniffing
    // payload shape to route it), `callUser` carries just the *first*
    // signal (the offer, to ring the callee), and `webrtcSignal` is a
    // generic bidirectional relay for everything after that — the answer,
    // and every ICE candidate in both directions. Each side just forwards
    // whatever simple-peer hands it, verbatim.
    // ─────────────────────────────────────────────
    socket.on("callUser", async ({ from, to, signal, callerName }) => {
      try {
        if (!from || !to || !signal) return;

        // The caller must actually be the socket claiming to be them
        if (userSocketMap[from.toString()] !== socket.id) {
          socket.emit("callUnauthorized", { reason: "Not registered as caller" });
          return;
        }

        // Admin accounts don't go through the normal interest/accept
        // matchmaking flow with every user, so most admin↔user pairs have no
        // accepted Connection row — that was silently blocking admin-
        // initiated calls even though messaging (no such gate) worked fine.
        // Either side being an admin bypasses the connection requirement.
        const [fromUser, toUser] = await Promise.all([
          User.findById(from).select("role photos"),
          User.findById(to).select("role"),
        ]);
        const eitherIsAdmin = fromUser?.role === "admin" || toUser?.role === "admin";

        const allowed = eitherIsAdmin || (await isConnected(from, to));
        if (!allowed) {
          socket.emit("callUnauthorized", { reason: "Not connected with this user" });
          return;
        }

        // Looked up server-side (not trusted from the client) so it can't be
        // spoofed — used by the full-screen incoming-call UI.
        const callerPhoto = fromUser?.photos?.[0] || null;

        io.to(to.toString()).emit("incomingCall", { from, signal, callerName, callerPhoto });
        console.log(`📞 Call from ${from} to ${to}`);
      } catch (err) {
        console.log("❌ callUser error:", err.message);
      }
    });

    socket.on("webrtcSignal", ({ to, from, signal }) => {
      try {
        if (!to || !signal) return;
        io.to(to.toString()).emit("webrtcSignal", { from, signal });
      } catch (err) {
        console.log("❌ webrtcSignal error:", err.message);
      }
    });

    socket.on("rejectCall", ({ to }) => {
      try {
        if (!to) return;
        io.to(to.toString()).emit("callRejected");
      } catch (err) {
        console.log("❌ rejectCall error:", err.message);
      }
    });

    socket.on("endCall", ({ to }) => {
      try {
        if (!to) return;
        io.to(to.toString()).emit("callEnded");
      } catch (err) {
        console.log("❌ endCall error:", err.message);
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

        // Record when they were last online, for the chat header's
        // "Last seen …" line. Fire-and-forget — nothing downstream needs to
        // block on this.
        User.findByIdAndUpdate(userId, { lastSeen: new Date() }).catch((err) =>
          console.log("❌ lastSeen update error:", err.message)
        );
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
