// utils/network.js
function getNetworkHint(req) {
  const ua = req.headers['user-agent'] || '';
  // Very light heuristic; can be expanded to IP/carrier DB
  const isAndroid = /Android/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome/i.test(ua);
  return { isAndroid, isSafari };
}

// Dummy compressor hook (placeholder for ffmpeg or bitrate tuning)
async function compressIfNeeded(buffer) {
  // In production, reduce bitrate for slow clients.
  return buffer;
}

module.exports = { getNetworkHint, compressIfNeeded };
