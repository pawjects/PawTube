const { requestPiped, extractMediaId, sendResponse, sendError } = require('../_piped');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Custom-Instance');
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const rawId = url.searchParams.get('v') || url.searchParams.get('id') || '';
  const videoId = extractMediaId(rawId);
  const customInstance = url.searchParams.get('custom') || req.headers['x-custom-instance'] || null;

  if (!videoId) {
    sendError(res, 400, 'INVALID_VIDEO_ID', 'A valid 11-character video ID is required.');
    return;
  }

  try {
    const result = await requestPiped(`/streams/${videoId}`, {}, { customInstance, ttlMs: 60000 });
    const data = result.data || {};

    sendResponse(res, 200, {
      id: videoId,
      videoStreams: data.videoStreams || [],
      audioStreams: data.audioStreams || [],
      subtitles: data.subtitles || [],
      hlsUrl: data.hls || null,
      instance: result.instance,
      cached: result.cached
    });
  } catch (err) {
    console.error('[API /piped/streams] Error:', err.message);
    sendError(res, 502, 'UPSTREAM_ERROR', err.message);
  }
};
