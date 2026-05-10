// services/pushService.js
const { sendPushNotification } = require('../config/firebaseAdmin');
const FCMToken = require('../models/FCMToken');

// ─── Core send ─────────────────────────────────────────────────────────────────
async function sendPushToUser(userId, payload) {
  try {
    const tokens = await FCMToken.find({ userId }).select('token');
    if (!tokens || tokens.length === 0) return; // user not subscribed

    const tokenList = tokens.map(t => t.token);
    
    await sendPushNotification(tokenList, {
      title: payload.title,
      body: payload.body,
      data: {
        type: payload.type || 'general',
        senderId: payload.senderId?.toString() || '',
        ...payload.data
      }
    });
  } catch (err) {
    console.error('Push send error:', err.message);
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

module.exports = {
  sendPushToUser,
  notifyNewMessage,
  notifyNewMatch,
  notifyProfileViewed,
  notifyInterestReceived,
};

