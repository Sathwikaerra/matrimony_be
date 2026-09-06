// socket/socket.js

const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const { isConnected } = require("../utils/isConnected");
const User = require("../models/User");
const CallLog = require("../models/CallLog");
const Block = require("../models/Block");
const { notifyIncomingCall, notifyMissedCall } = require("../services/pushService");

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

// True if userA and userB are the two participants of some currently
// ringing-or-active call (in either direction — either could be the
// caller). Used to gate webrtcSignal/rejectCall/endCall so those can only
// affect a call the sender is actually part of — without this, any
// authenticated socket could emit e.g. endCall/rejectCall with an
// arbitrary `to` and silently kill or inject signaling into a call between
// two totally unrelated users, since those handlers otherwise just trust
// whatever `to` the client sends.
function isActiveCallPair(userA, userB) {
  const a = userA?.toString();
  const b = userB?.toString();
  if (!a || !b) return false;
  return pendingCallLogs[a]?.from === b || pendingCallLogs[b]?.from === a;
}

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

  // The call never connected — replace whatever "incoming call" push
  // notifyIncomingCall sent with a "missed call" one instead of leaving it
  // sitting in the tray looking like it's still ringing. See
  // notifyMissedCall's own comment for how the replacement works.
  if (!entry.connectedAt) {
    notifyMissedCall(calleeKey, entry.callerName, entry.from);
  }
}

// ─────────────────────────────────────────────
// Gaming Zone — generic 2-player game relay. The server never runs any
// game logic itself (no board state, no win-checking) — it's purely a
// signaling relay between two matched players, the same architecture as
// webrtcSignal for calls. Each client keeps its own authoritative copy of
// the board and mirrors the other player's moves as they arrive; this is
// fine for a friendly game between two already-connected users, the same
// trust level messaging/calling between them already assumes.
//
// userId -> { opponent, gameType } — set on BOTH players once an invite is
// accepted (symmetric, unlike pendingCallLogs' caller/callee asymmetry,
// since a game has no "caller" role), cleared when either side ends the
// game or disconnects.
const activeGames = {};
// invitee's userId -> { from, gameType } — one not-yet-accepted/declined
// invite per invitee, same one-at-a-time reasoning as pendingCallLogs.
const pendingGameInvites = {};

// True if userA and userB are the two players of some currently active
// (already-accepted) game. Gates gameMove/gameEnded the same way
// isActiveCallPair gates webrtcSignal/endCall — without this, any
// authenticated socket could inject fabricated moves into a game between
// two unrelated users just by guessing their ids.
function isActiveGamePair(userA, userB) {
  const a = userA?.toString();
  const b = userB?.toString();
  if (!a || !b) return false;
  return activeGames[a]?.opponent === b && activeGames[b]?.opponent === a;
}

function clearGameFor(userId) {
  const uid = userId?.toString();
  if (!uid) return null;
  const entry = activeGames[uid];
  if (!entry) return null;
  delete activeGames[uid];
  delete activeGames[entry.opponent];
  return entry.opponent;
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
    // Special Chat — live shared drawing canvas. Pure relay of ephemeral
    // stroke points, same trust level as typing/stopTyping above (no
    // per-event DB check — the REST send-message flow that persists the
    // finished doodle as a real message already enforces the actual
    // connection/block gate; this is just a live "is someone drawing right
    // now" signal between two people already inside an open chat with each
    // other, not a resource calls/games need protecting).
    // ─────────────────────────────────────────────
    socket.on("drawStroke", ({ to, point }) => {
      try {
        if (!to || !point) return;
        io.to(to.toString()).emit("drawStroke", { from: socket.userId, point });
      } catch (err) {
        console.log("❌ drawStroke error:", err.message);
      }
    });

    socket.on("drawClear", ({ to }) => {
      try {
        if (!to) return;
        io.to(to.toString()).emit("drawClear", { from: socket.userId });
      } catch (err) {
        console.log("❌ drawClear error:", err.message);
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
    socket.on("callUser", async ({ to, signal, callerName, callType }) => {
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

        // Busy check — the callee already has a ringing-or-active call
        // (with this caller or anyone else). Without this, a second
        // callUser to the same callee silently overwrote the first one's
        // pendingCallLogs entry below, so the first call's CallLog row
        // never got written at all (finalizeCallLog would only ever find
        // the second entry) — it just vanished from history, not even as
        // "missed". This also means a third party calling someone already
        // mid-call gets an immediate busy signal instead of ringing into
        // the void for the full 45s client-side timeout.
        if (pendingCallLogs[to.toString()]) {
          socket.emit("callUnauthorized", { reason: "This user is on another call" });
          return;
        }

        // Looked up server-side (not trusted from the client) so it can't be
        // spoofed — used by the full-screen incoming-call UI.
        const callerPhoto = fromUser?.photos?.[0] || null;

        // Start of a call-history entry — finalized by rejectCall/endCall.
        pendingCallLogs[to.toString()] = { from, startedAt: new Date(), connectedAt: null, callerName };

        io.to(to.toString()).emit("incomingCall", { from, signal, callerName, callerPhoto, callType });
        console.log(`📞 Call from ${from} to ${to}`);

        // Backstop for when the callee's app isn't running to receive the
        // socket event above at all (backgrounded past what the OS keeps
        // alive, or — on Android — sometimes fully killed): fire an urgent
        // push too. Deliberately fire-and-forget (not awaited) — a slow or
        // failed push must never delay the actual ring signal above, and
        // notifyIncomingCall already swallows its own errors (see
        // pushService.js's sendPushToUser try/catch).
        notifyIncomingCall(to, callerName, from, callType);
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

    // The same account logged in on more than one device: incomingCall goes
    // to every device's socket (they all join the same userId room — see
    // registerSocketIdentity), so all of them ring. Without this, answering
    // on one device left every other device still ringing until its own
    // 45s client-side timeout, which then auto-declined — wrongly marking
    // an in-progress/completed call "declined" and deleting its
    // pendingCallLogs entry out from under the device actually on the call
    // (see finalizeCallLog). socket.to (not io.to) excludes the answering
    // socket itself — only the *other* devices need telling.
    socket.on("callAccepted", () => {
      try {
        const uid = socket.userId;
        if (!uid) return;
        socket.to(uid.toString()).emit("callAnsweredElsewhere");
      } catch (err) {
        console.log("❌ callAccepted error:", err.message);
      }
    });

    socket.on("webrtcSignal", ({ to, signal }) => {
      try {
        if (!to || !signal) return;
        // Only relay between the two actual participants of a real,
        // currently-tracked call — otherwise any authenticated socket could
        // send fabricated SDP/ICE payloads into a stranger's call just by
        // guessing/knowing their userId, since the client side trusts
        // whatever webrtcSignal hands it (see CallContext.jsx's
        // onWebrtcSignal) without re-checking who it came from.
        if (!isActiveCallPair(socket.userId, to)) return;
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
        // Without this, anyone could emit rejectCall with an arbitrary `to`
        // and silently kill a call they have nothing to do with — the
        // client's onCallRejected handler cleans up unconditionally on
        // whatever "callRejected" it receives.
        if (!isActiveCallPair(socket.userId, to)) return;
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
        // Same reasoning as rejectCall above — endCall must only affect a
        // call socket.userId is actually part of.
        if (!isActiveCallPair(socket.userId, to)) return;
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
    // Gaming Zone — invite / accept / decline / move / end. Pure relay, no
    // server-side game logic — see the activeGames/pendingGameInvites
    // comment above for why.
    // ─────────────────────────────────────────────
    socket.on("gameInvite", async ({ to, gameType }) => {
      try {
        const from = socket.userId;
        if (!from) {
          socket.emit("gameUnauthorized", { reason: "Not authenticated — try reloading the app" });
          return;
        }
        if (!to || !gameType) return;

        // Same priority order as calls/messaging: blocking wins over
        // everything, checked before the admin bypass too.
        const [blockedByMe, blockedByThem] = await Promise.all([
          Block.exists({ blocker: from, blocked: to }),
          Block.exists({ blocker: to, blocked: from }),
        ]);
        if (blockedByMe || blockedByThem) {
          socket.emit("gameUnauthorized", {
            reason: blockedByMe ? "You have blocked this user" : "You are blocked by this user",
          });
          return;
        }

        const [fromUser, toUser] = await Promise.all([
          User.findById(from).select("role name photos"),
          User.findById(to).select("role"),
        ]);
        const eitherIsAdmin = fromUser?.role === "admin" || toUser?.role === "admin";
        const allowed = eitherIsAdmin || (await isConnected(from, to));
        if (!allowed) {
          socket.emit("gameUnauthorized", { reason: "Not connected with this user" });
          return;
        }

        // Busy check — either side already mid-game, or the invitee
        // already has a different invite sitting unanswered.
        if (activeGames[from] || activeGames[to] || pendingGameInvites[to]) {
          socket.emit("gameUnauthorized", { reason: "That player is busy with another game" });
          return;
        }

        pendingGameInvites[to] = { from, gameType };
        io.to(to.toString()).emit("gameInvite", {
          from,
          gameType,
          fromName: fromUser?.name || "Someone",
          fromPhoto: fromUser?.photos?.[0] || null,
        });
      } catch (err) {
        console.log("❌ gameInvite error:", err.message);
      }
    });

    socket.on("gameInviteAccepted", ({ to }) => {
      try {
        const from = socket.userId;
        if (!from || !to) return;
        // Must be accepting the exact invite this server actually sent to
        // this user — not just any arbitrary `to` the client claims.
        const invite = pendingGameInvites[from];
        if (!invite || invite.from !== to.toString()) return;
        delete pendingGameInvites[from];

        activeGames[from] = { opponent: to.toString(), gameType: invite.gameType };
        activeGames[to.toString()] = { opponent: from, gameType: invite.gameType };

        io.to(to.toString()).emit("gameInviteAccepted", { from, gameType: invite.gameType });
      } catch (err) {
        console.log("❌ gameInviteAccepted error:", err.message);
      }
    });

    socket.on("gameInviteDeclined", ({ to }) => {
      try {
        const from = socket.userId;
        if (!from || !to) return;
        if (pendingGameInvites[from]?.from === to.toString()) {
          delete pendingGameInvites[from];
        }
        io.to(to.toString()).emit("gameInviteDeclined", { from });
      } catch (err) {
        console.log("❌ gameInviteDeclined error:", err.message);
      }
    });

    socket.on("gameMove", ({ to, move }) => {
      try {
        if (!to || move === undefined) return;
        // Only relay between the two actual players of a real, currently-
        // active game — same reasoning as isActiveCallPair for
        // webrtcSignal: otherwise any authenticated socket could inject
        // fabricated moves into a game between two unrelated users.
        if (!isActiveGamePair(socket.userId, to)) return;
        io.to(to.toString()).emit("gameMove", { from: socket.userId, move });
      } catch (err) {
        console.log("❌ gameMove error:", err.message);
      }
    });

    socket.on("gameEnded", ({ to }) => {
      try {
        if (!to) return;
        if (!isActiveGamePair(socket.userId, to)) return;
        clearGameFor(socket.userId);
        io.to(to.toString()).emit("gameEnded", { from: socket.userId });
      } catch (err) {
        console.log("❌ gameEnded error:", err.message);
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

        // Same idea for a dropped connection mid-game — clear the session
        // on both sides and tell the opponent, rather than leaving them
        // sitting in a game against someone who's actually gone.
        const gameOpponent = clearGameFor(userId);
        if (gameOpponent) {
          io.to(gameOpponent).emit("gameEnded", { from: userId });
        }
        // A pending invite this user sent, never answered, dies with the
        // socket too — otherwise the invitee's client would still be
        // holding an invite from someone no longer even connected.
        Object.keys(pendingGameInvites).forEach((invitee) => {
          if (pendingGameInvites[invitee].from === userId) {
            delete pendingGameInvites[invitee];
            io.to(invitee).emit("gameInviteDeclined", { from: userId });
          }
        });
        delete pendingGameInvites[userId];

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
