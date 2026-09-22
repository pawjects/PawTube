const { requestPiped, normalizeMediaItem, sendResponse, sendError } = require('../_piped');

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
  const q = (url.searchParams.get('q') || '').trim();
  const filter = url.searchParams.get('filter') || 'all';
  const customInstance = url.searchParams.get('custom') || req.headers['x-custom-instance'] || null;

  if (!q) {
    sendError(res, 400, 'INVALID_QUERY', 'Search query "q" parameter is required.');
    return;
  }

  try {
    const result = await requestPiped('/search', { q, filter }, { customInstance, ttlMs: 30000 });
    const rawItems = Array.isArray(result.data)
      ? result.data
      : (result.data && Array.isArray(result.data.items) ? result.data.items : []);

    const items = rawItems.map((item) => {
      if (!item) return null;
      if (item.type === 'channel') {
        return {
          id: item.url ? item.url.replace(/^\/channel\//, '') : (item.id || ''),
          title: item.name || item.title || 'Channel',
          author: item.name || 'Channel',
          channel: item.name || 'Channel',
          channelId: item.url ? item.url.replace(/^\/channel\//, '') : (item.id || ''),
          avatar: item.thumbnail || '',
          thumb: item.thumbnail || '',
          subscribers: item.subscribers || 0,
          viewsFormatted: `${item.subscribers || 0} subscribers`,
          verified: Boolean(item.verified),
          type: 'channel'
        };
      }
      if (item.type === 'playlist') {
        return {
          id: item.url ? item.url.replace(/^\/playlist\?list=/, '') : (item.id || ''),
          title: item.name || item.title || 'Playlist',
          author: item.uploaderName || '',
          channel: item.uploaderName || '',
          thumb: item.thumbnail || '',
          durationFormatted: `${item.videos || 0} videos`,
          type: 'playlist'
        };
      }
      return normalizeMediaItem(item);
    }).filter(Boolean);

    sendResponse(res, 200, {
      items,
      count: items.length,
      query: q,
      instance: result.instance,
      cached: result.cached
    });
  } catch (err) {
    console.warn('[API /piped/search] Upstream error:', err.message);
    sendError(res, 502, 'SEARCH_FETCH_FAILED', err.message);
  }
};
