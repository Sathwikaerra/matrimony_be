// utils/chatPair.js
// ChatSettings (the shared wallpaper) is keyed by an order-independent pair
// of user ids — this is the one place that ordering rule lives, so every
// caller (get/set wallpaper, and the socket relay) agrees on the same row
// regardless of which of the two users is "userA" in their own request.
function orderedPair(idA, idB) {
  const a = idA.toString();
  const b = idB.toString();
  return a < b ? { userA: a, userB: b } : { userA: b, userB: a };
}

module.exports = { orderedPair };
