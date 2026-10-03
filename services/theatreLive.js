// services/theatreLive.js
// "Live" Theatre sources: the host's movie never gets uploaded anywhere. The
// viewer's player requests byte ranges from GET /api/theatre/stream/:hostId
// (see theatreController.streamLive), and each range is fetched on demand from
// the host's phone over the socket (the host answers `theatreChunk` with a
// base64 slice of the local file). The server only relays bytes — nothing is
// stored, so there is no size limit and no upload wait.

// hostId -> { size, mime, viewerId } — viewerId is set once the invite is accepted.
const liveSources = {};

const CHUNK_TIMEOUT_MS = 20000;

function register(hostId, { size, mime }) {
  liveSources[hostId.toString()] = { size, mime, viewerId: null };
}

function setViewer(hostId, viewerId) {
  const src = liveSources[hostId?.toString()];
  if (src) src.viewerId = viewerId.toString();
}

function remove(hostId) {
  delete liveSources[hostId?.toString()];
}

function get(hostId) {
  return liveSources[hostId?.toString()] || null;
}

// Asks the host's phone for `length` bytes starting at `start`. Resolves with a
// Buffer (possibly shorter than `length` if the phone returned a short read).
async function fetchChunk(hostId, start, length) {
  // Lazy require: socket.js requires theatreController, which requires this file.
  const { getIO } = require('../socket/socket');
  const io = getIO();
  const responses = await io
    .to(hostId.toString())
    .timeout(CHUNK_TIMEOUT_MS)
    .emitWithAck('theatreChunk', { start, length });
  const res = Array.isArray(responses) ? responses[0] : responses;
  if (!res || res.error || typeof res.data !== 'string') {
    throw new Error(res?.error || 'Host did not return data');
  }
  return Buffer.from(res.data, 'base64');
}

module.exports = { register, setViewer, remove, get, fetchChunk };
