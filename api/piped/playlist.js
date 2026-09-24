const { requestPiped, normalizeMediaItem, sendResponse, sendError, parseQueryParams } = require('../_piped');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Custom-Instance');
    res.statusCode = 204;
    res.end();
    return;
  }

  const { getParam, customInstance } = parseQueryParams(req);
  const listId = getParam('list') || getParam('id') || '';

  if (!listId) {
    sendError(res, 400, 'INVALID_PLAYLIST_ID', 'Playlist list ID is required.');
    return;
  }

  try {
    const cleanId = listId.replace(/^\/playlist\?list=/, '');
    const result = await requestPiped(`/playlists/${cleanId}`, {}, { customInstance, ttlMs: 120000 });
    const data = result.data || {};

    const items = Array.isArray(data.relatedStreams)
      ? data.relatedStreams.map(normalizeMediaItem).filter(Boolean)
      : [];

    sendResponse(res, 200, {
      id: cleanId,
      name: data.name || 'Playlist',
      thumbnail: data.thumbnailUrl || '',
      bannerUrl: data.bannerUrl || '',
      uploader: data.uploader || '',
      uploaderAvatar: data.uploaderAvatar || '',
      videos: items,
      videosCount: items.length,
      instance: result.instance,
      cached: result.cached
    });
  } catch (err) {
    console.error('[API /piped/playlist] Error:', err.message);
    sendError(res, 502, 'UPSTREAM_ERROR', err.message);
  }
};
