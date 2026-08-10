// services/notificationStore.js
// Persists an entry to the Notifications feed. This runs *alongside* the
// existing socket/push calls at each call site (pushService.js / SocketService)
// — those stay for realtime delivery, this is what makes the event show up
// later in the Notifications tab / after a refresh / on another device.
const Notification = require('../models/Notification');

async function createNotification({ recipient, sender, type, message, data = {} }) {
  try {
    if (!recipient || !sender || recipient.toString() === sender.toString()) return;
    await Notification.create({ recipient, sender, type, message, data });
  } catch (err) {
    console.error('createNotification error:', err.message);
  }
}

module.exports = { createNotification };
