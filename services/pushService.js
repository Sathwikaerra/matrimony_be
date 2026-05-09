// services/pushService.js
const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL || 'admin@matrimonyapp.com'}`,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ─── Core send ─────────────────────────────────────────────────────────────────
async function sendPushToUser(userId, payload) {
  try {
    const doc = await PushSubscription.findOne({ userId });
    if (!doc) return; // user not subscribed

    await webpush.sendNotification(
      doc.subscription,
      JSON.stringify(payload)
    );
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Subscription expired — clean up
      await PushSubscription.deleteOne({ userId });
      console.log(`🗑️  Removed stale subscription for user ${userId}`);
    } else {
      console.error('Push send error:', err.message);
    }
  }
}

// ─── Notification helpers ───────────────────────────────────────────────────────

/**
 * Notify receiver of a new chat message
 * @param {string} receiverId
 * @param {string} senderName
 * @param {string} senderId
 * @param {string} messagePreview
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
 * @param {string} senderId   — person who sent the original request
 * @param {string} acceptorName
 * @param {string} acceptorId
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
 * @param {string} profileOwnerId
 * @param {string} viewerName
 * @param {string} viewerId
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
 * @param {string} receiverId
 * @param {string} senderName
 * @param {string} senderId
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
