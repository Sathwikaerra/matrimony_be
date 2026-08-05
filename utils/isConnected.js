// utils/isConnected.js
// Shared "are these two users an accepted connection" check — same
// both-directions $or pattern already used in connectionController.js
// (getMyConnections) and storyController.js (getStoriesFeed/getHighlights).
// Socket handlers can't use Express's `protect` middleware, so this is the
// authorization gate for anything socket-driven that needs it (video calls).
const Connection = require('../models/Connection');

const isConnected = async (userIdA, userIdB) => {
  if (!userIdA || !userIdB) return false;
  const connection = await Connection.findOne({
    $or: [
      { sender: userIdA, receiver: userIdB },
      { sender: userIdB, receiver: userIdA },
    ],
    status: 'accepted',
  });
  return !!connection;
};

module.exports = { isConnected };
