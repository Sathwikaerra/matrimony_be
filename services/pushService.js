// services/pushService.js
const { sendPushNotification } = require('../config/firebaseAdmin');
const FCMToken = require('../models/FCMToken');

// ─── Core send ─────────────────────────────────────────────────────────────────
async function sendPushToUser(userId, payload) {
  try {
    const tokens = await FCMToken.find({ userId }).select('token');
    if (!tokens || tokens.length === 0) return; // user not subscribed

    const tokenList = tokens.map(t => t.token);

    const senderId = payload.senderId?.toString() || '';
    const type = payload.type || 'general';

    await sendPushNotification(tokenList, {
      title: payload.title,
      body: payload.body,
      data: {
        type,
        senderId,
        ...payload.data
      },
      // Group repeats from the same sender+type (e.g. five chat messages in
      // a row) into one notification that updates in place, instead of
      // stacking a separate banner per push — see firebaseAdmin.js.
      tag: senderId ? `${type}-${senderId}` : undefined,
    });
  } catch (err) {
    console.error('Push send error:', err.message);
  }
}

// ─── Broadcast (admin announcements) ────────────────────────────────────────────
// Same underlying sendPushNotification as sendPushToUser, but fanned out to
// every subscribed device instead of one user's — paged in chunks of 500
// since that's FCM's own hard limit per sendEachForMulticast call, not an
// arbitrary choice here.
const FCM_BATCH_SIZE = 500;

async function sendPushToAllExcept(excludeUserId, payload) {
  try {
    const tokens = await FCMToken.find(
      excludeUserId ? { userId: { $ne: excludeUserId } } : {}
    ).select('token');
    if (!tokens.length) return;

    const tokenList = tokens.map((t) => t.token);
    for (let i = 0; i < tokenList.length; i += FCM_BATCH_SIZE) {
      const batch = tokenList.slice(i, i + FCM_BATCH_SIZE);
      await sendPushNotification(batch, {
        title: payload.title,
        body: payload.body,
        data: {
          type: payload.type || 'announcement',
          ...payload.data,
        },
      });
    }
  } catch (err) {
    console.error('Broadcast push send error:', err.message);
  }
}

// ─── Notification helpers ───────────────────────────────────────────────────────

/**
 * Notify receiver of a new chat message
 */
async function notifyNewMessage(receiverId, senderName, senderId, messagePreview) {
  await sendPushToUser(receiverId, {
    title: `💬 New message from ${senderName}`,
    body: messagePreview.length > 60 ? messagePreview.slice(0, 60) + '…' : messagePreview,
    type: 'message',
    senderId,
    // senderName lets the client show the real name in the chat header the
    // instant it opens from this notification, instead of a "Chat"
    // placeholder while it re-fetches something already known here.
    data: { url: `/messages/${senderId}`, senderName },
  });
}

/**
 * Notify sender when their connection request is accepted (new match)
 */
async function notifyNewMatch(senderId, acceptorName, acceptorId) {
  await sendPushToUser(senderId, {
    title: `💞 It's a Match!`,
    body: `${acceptorName} accepted your connection request`,
    type: 'match',
    senderId: acceptorId,
    data: { url: `/profile/${acceptorId}` },
  });
}

/**
 * Notify user when someone views their profile
 */
async function notifyProfileViewed(profileOwnerId, viewerName, viewerId) {
  await sendPushToUser(profileOwnerId, {
    title: `👁️ Someone viewed your profile`,
    body: `${viewerName} looked at your profile`,
    type: 'view',
    senderId: viewerId,
    data: { url: `/profile/views` },
  });
}

/**
 * Notify user when they receive a connection interest/request
 */
async function notifyInterestReceived(receiverId, senderName, senderId) {
  await sendPushToUser(receiverId, {
    title: `❤️ New Interest!`,
    body: `${senderName} sent you a connection request`,
    type: 'interest',
    senderId,
    data: { url: `/connections/pending` },
  });
}

/**
 * Notify the callee of an incoming audio/video call — fired alongside (not
 * instead of) socket.js's "incomingCall" emit. The socket event is what
 * drives the live full-screen ringing UI (CallContext.jsx) and only reaches
 * a process that's already running; this push is the backstop for when it
 * isn't — a backgrounded (or, on Android, sometimes even killed) app that
 * the OS would otherwise never wake for a plain socket event. `urgent: true`
 * asks FCM/APNs to treat this as high-priority so it isn't delayed behind
 * normal push throttling (see firebaseAdmin.js).
 *
 * This is *not* full CallKit/PushKit-style ringing — see
 * CALLKIT_BACKGROUND_CALLS_PLAN.md in the mobile repo for what that
 * actually requires (native modules, a dev-account VoIP cert, etc). This is
 * the achievable-today piece: whatever's already killed/backgrounded still
 * gets a loud, high-priority notification instead of nothing at all.
 */
async function notifyIncomingCall(calleeId, callerName, callerId, callType = 'video') {
  await sendPushToUser(calleeId, {
    title: `📞 Incoming ${callType === 'audio' ? 'voice' : 'video'} call`,
    body: `${callerName || 'Someone'} is calling…`,
    type: 'call',
    senderId: callerId,
    urgent: true,
    data: { url: `/chat/${callerId}`, callerName: callerName || 'Someone', callType },
  });
}

/**
 * Replaces the notifyIncomingCall banner above with a "missed call" one once
 * a call ends without ever connecting (declined, timed out, or the caller
 * hung up before pickup) — socket.js's finalizeCallLog is what knows that.
 * Relies on sendPushToUser's automatic `${type}-${senderId}` tag: since this
 * uses the same type ('call') and the same senderId (the caller) as the
 * original ring, Android replaces that banner in place instead of leaving it
 * sitting there claiming a call that's already over (and iOS's apns-collapse-id
 * does the same). Without this, a killed-app callee's only signal is a
 * notification that looks like it's still ringing indefinitely.
 */
async function notifyMissedCall(calleeId, callerName, callerId) {
  await sendPushToUser(calleeId, {
    title: `📞 Missed call`,
    body: `${callerName || 'Someone'} tried to call you`,
    type: 'call',
    senderId: callerId,
    data: { url: `/chat/${callerId}`, callerName: callerName || 'Someone', missed: true },
  });
}

/**
 * Notify a connection when the locker owner shares a document with them
 */
async function notifyLockerShared(recipientId, ownerName, ownerId, documentTitle) {
  await sendPushToUser(recipientId, {
    title: `🔒 Document shared with you`,
    body: `${ownerName} gave you access to "${documentTitle}"`,
    type: 'locker_share',
    senderId: ownerId,
    data: { url: `/locker/shared` },
  });
}

module.exports = {
  sendPushToUser,
  sendPushToAllExcept,
  notifyNewMessage,
  notifyNewMatch,
  notifyProfileViewed,
  notifyInterestReceived,
  notifyLockerShared,
  notifyIncomingCall,
  notifyMissedCall,
};

