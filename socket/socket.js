// socket/socket.js

const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { isConnected } = require("../utils/isConnected");
const User = require("../models/User");
const CallLog = require("../models/CallLog");
const Block = require("../models/Block");

let io;

// userId -> socketId
const userSocketMap = {};

// userId -> receiverId (the user whose chat screen they currently have open)
const userActiveChatMap = {};

// callee's userId -> { from, startedAt, connectedAt } — one entry per
// currently-ringing-or-active call, keyed by the callee since only one call
// can be ringing/active for a given user at a time (CallContext's own
// busy-check on the frontend, backed by the auto-reject-if-busy path
// below). Finalized into a CallLog row (and removed from here) by whichever
// of rejectCall/endCall concludes it — see finalizeCallLog().
const pendingCallLogs = {};

// Writes the CallLog row for whichever pending call `uid` (either party)
// belongs to, then clears it from pendingCallLogs. Safe to call from either
// side and safe to call more than once (a second call is just a no-op).
function finalizeCallLog(uid, { forcedStatus } = {}) {
  if (!uid) return;
  let calleeKey = uid;
  let entry = pendingCallLogs[calleeKey];
  if (!entry) {
    calleeKey = Object.keys(pendingCallLogs).find((k) => pendingCallLogs[k].from === uid);
    entry = calleeKey ? pendingCallLogs[calleeKey] : null;
  }
  if (!entry) return;
  delete pendingCallLogs[calleeKey];

  const endedAt = new Date();
  const status = forcedStatus || (entry.connectedAt ? "completed" : "missed");
  const durationSeconds = entry.connectedAt ? Math.max(0, Math.round((endedAt - entry.connectedAt) / 1000)) : 0;

  CallLog.create({
    caller: entry.from,
    callee: calleeKey,
    status,
    startedAt: entry.startedAt,
    connectedAt: entry.connectedAt,
    endedAt,
    durationSeconds,
  }).catch((err) => console.log("❌ CallLog write error:", err.message));
}

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

  // Authenticate the connection itself with the same JWT already used for
  // HTTP requests, instead of trusting whatever userId a client-side
  // "registerUser" event claims. That client-trust model was the actual
  // cause of the intermittent "Not registered as caller" failures: a
  // reconnect (this sandbox saw real websocket-upgrade failures — the
  // transport falls back and reconnects) gets a brand-new socket.id, and
  // there's a window before the client's next "registerUser" round-trip
  // lands where userSocketMap[userId] still points at the dead socket —
  // any callUser attempt in that window failed the identity check even
  // though it was a perfectly legitimate call. Verifying the JWT at the
  // handshake and deriving identity from socket.userId removes that race
  // entirely: identity is established the instant the connection completes,
  // not on a separate later event.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.id;
      }
    } catch (err) {
      // Invalid/expired token — let the connection through anyway (matches
      // the previous behavior of not gatekeeping the socket transport
      // itself), it just won't have a verified identity. Anything that
      // needs one (callUser) checks socket.userId explicitly.
    }
    next();
  });

  io.on("connection", (socket) => {
    console.log("🔌 Socket connected:", socket.id);

    const registerSocketIdentity = (uidStr) => {
      userSocketMap[uidStr] = socket.id;
      socket.join(uidStr);
      io.emit("onlineUsers", getOnlineUsers());
    };

    // Authenticated at the handshake — register immediately, no need to
    // wait for the client's own registerUser round-trip.
    if (socket.userId) {
      registerSocketIdentity(socket.userId.toString());
      console.log(`✅ User ${socket.userId} authenticated on connect (socket ${socket.id})`);
    }

    // ─────────────────────────────────────────────
    // Register User — kept for backward compatibility (older cached
    // clients, or a connection that came in without a token). When the
    // handshake was already authenticated, this is a no-op re-confirmation;
    // it never overrides a verified identity with a client-claimed one.
    // ─────────────────────────────────────────────
    socket.on("registerUser", (claimedUserId) => {
      try {
        const uidStr = (socket.userId || claimedUserId)?.toString();
        if (!uidStr) {
          console.log("⚠️ registerUser called without userId");
          return;
        }

        registerSocketIdentity(uidStr);

        console.log(
          `✅ User ${uidStr} registered with socket ${socket.id}`
        );

        console.log("🟢 Online users:", getOnlineUsers());
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
    // Enter Chat (user opens a chat room)
    // ─────────────────────────────────────────────
    socket.on("enterChat", ({ senderId, receiverId }) => {
      try {
        if (!senderId || !receiverId) return;
        const uidStr = senderId.toString();
        const ridStr = receiverId.toString();

        // Check if they were already in another chat, and notify the old partner they left
        const oldReceiverId = userActiveChatMap[uidStr];
        if (oldReceiverId && oldReceiverId !== ridStr) {
          io.to(oldReceiverId).emit("partnerLeftChat", { userId: uidStr });
        }

        userActiveChatMap[uidStr] = ridStr;
        console.log(`🧸 User ${uidStr} entered chat with ${ridStr}`);

        // Notify the new partner that this user has entered their chat
        io.to(ridStr).emit("partnerEnteredChat", { userId: uidStr });

        // If the new partner is already in this user's chat, notify this user back
        if (userActiveChatMap[ridStr] === uidStr) {
          socket.emit("partnerEnteredChat", { userId: ridStr });
        }
      } catch (err) {
        console.log("❌ enterChat error:", err.message);
      }
    });

    // ─────────────────────────────────────────────
    // Leave Chat (user closes or switches chat room)
    // ─────────────────────────────────────────────
    socket.on("leaveChat", ({ senderId, receiverId }) => {
      try {
        if (!senderId) return;
        const uidStr = senderId.toString();
        const oldReceiverId = userActiveChatMap[uidStr];
        if (oldReceiverId) {
          io.to(oldReceiverId).emit("partnerLeftChat", { userId: uidStr });
          delete userActiveChatMap[uidStr];
          console.log(`🧸 User ${uidStr} left chat with ${oldReceiverId}`);
        }
      } catch (err) {
        console.log("❌ leaveChat error:", err.message);
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
    socket.on("callUser", async ({ to, signal, callerName }) => {
      try {
        // `from` is the verified identity of this connection (see the JWT
        // handshake auth above) — never the client-supplied field. That's
        // what makes this check actually meaningful instead of a racy
        // "does this in-memory map still agree with itself" comparison.
        const from = socket.userId;
        if (!from) {
          socket.emit("callUnauthorized", { reason: "Not authenticated — try reloading the app" });
          return;
        }
        if (!to || !signal) return;

        // Blocking wins over everything else — checked before the admin
        // bypass too, same priority order as messaging
        // (messageController.js's getMessagingRestriction).
        const [blockedByMe, blockedByThem] = await Promise.all([
          Block.exists({ blocker: from, blocked: to }),
          Block.exists({ blocker: to, blocked: from }),
        ]);
        if (blockedByMe || blockedByThem) {
          socket.emit("callUnauthorized", {
            reason: blockedByMe ? "You have blocked this user" : "You are blocked by this user",
          });
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

        // Start of a call-history entry — finalized by rejectCall/endCall
        // (or overwritten harmlessly if this same callee somehow gets a
        // second ring before the first resolves; the busy-check below and
        // on the frontend normally prevent that).
        pendingCallLogs[to.toString()] = { from, startedAt: new Date(), connectedAt: null };

        io.to(to.toString()).emit("incomingCall", { from, signal, callerName, callerPhoto });
        console.log(`📞 Call from ${from} to ${to}`);
      } catch (err) {
        console.log("❌ callUser error:", err.message);
      }
    });

    // Sent by either side once the call is actually connected (real media
    // flowing, not just ringing) — see CallContext.jsx's connected-status
    // effect. Marks the pending call-history entry so endCall can tell a
    // completed call apart from a missed one and compute a real duration.
    socket.on("callConnected", () => {
      try {
        const uid = socket.userId;
        if (!uid) return;
        let calleeKey = uid;
        let entry = pendingCallLogs[calleeKey];
        if (!entry) {
          calleeKey = Object.keys(pendingCallLogs).find((k) => pendingCallLogs[k].from === uid);
          entry = calleeKey ? pendingCallLogs[calleeKey] : null;
        }
        if (entry && !entry.connectedAt) entry.connectedAt = new Date();
      } catch (err) {
        console.log("❌ callConnected error:", err.message);
      }
    });

    socket.on("webrtcSignal", ({ to, signal }) => {
      try {
        if (!to || !signal) return;
        // Same as callUser — `from` is this connection's verified identity,
        // not a client-supplied field.
        io.to(to.toString()).emit("webrtcSignal", { from: socket.userId, signal });
      } catch (err) {
        console.log("❌ webrtcSignal error:", err.message);
      }
    });

    socket.on("rejectCall", ({ to }) => {
      try {
        if (!to) return;
        io.to(to.toString()).emit("callRejected");
        // The rejecter is always the callee here — both a deliberate
        // decline and the auto-reject-if-busy path in CallContext.jsx emit
        // this from the callee's own socket.
        finalizeCallLog(socket.userId, { forcedStatus: "declined" });
      } catch (err) {
        console.log("❌ rejectCall error:", err.message);
      }
    });

    socket.on("endCall", ({ to }) => {
      try {
        if (!to) return;
        io.to(to.toString()).emit("callEnded");
        // Whichever side hangs up — finalizeCallLog finds the entry
        // regardless of whether socket.userId was the caller or callee,
        // and derives completed-vs-missed from whether it ever connected.
        finalizeCallLog(socket.userId);
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

        // Clean up active chat presence on disconnect
        const oldReceiverId = userActiveChatMap[userId];
        if (oldReceiverId) {
          io.to(oldReceiverId).emit("partnerLeftChat", { userId });
          delete userActiveChatMap[userId];
          console.log(`🧸 User ${userId} active chat cleaned up on disconnect`);
        }

        // A network drop mid-call never fires an explicit endCall — without
        // this, that call's CallLog row would just never get written, and
        // the other party's UI would sit there indefinitely thinking the
        // call is still live. Find + close out whichever pending call (as
        // caller or callee) this user was in, and let the other side know.
        let pendingCalleeKey = userId in pendingCallLogs ? userId : null;
        if (!pendingCalleeKey) {
          pendingCalleeKey = Object.keys(pendingCallLogs).find((k) => pendingCallLogs[k].from === userId);
        }
        if (pendingCalleeKey) {
          const otherParty = pendingCalleeKey === userId ? pendingCallLogs[pendingCalleeKey].from : pendingCalleeKey;
          io.to(otherParty.toString()).emit("callEnded");
          finalizeCallLog(userId);
        }

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
