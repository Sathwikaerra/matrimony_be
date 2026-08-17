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
    data: { url: `/messages/${senderId}` },
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
};

