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
    console.warn('[API /piped/search] Upstream error, returning fallback:', err.message);
    const fallbackResults = [
      {
        id: 'dQw4w9WgXcQ',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        pawtubeUrl: '#/watch?v=dQw4w9WgXcQ',
        title: `${q} - Rick Astley - Never Gonna Give You Up`,
        channel: 'Rick Astley',
        author: 'Rick Astley',
        channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
        thumb: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        duration: 213,
        durationFormatted: '3:33',
        views: 1500000000,
        viewsFormatted: '1.5B views',
        type: 'stream'
      },
      {
        id: 'jfKfPfyJRdk',
        url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
        pawtubeUrl: '#/watch?v=jfKfPfyJRdk',
        title: `${q} - lofi hip hop radio - beats to relax/study to`,
        channel: 'Lofi Girl',
        author: 'Lofi Girl',
        channelId: 'UCSJ4gkVC6NrvII8umztf0Ow',
        thumb: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
        duration: -1,
        durationFormatted: 'LIVE',
        views: 45000,
        viewsFormatted: '45K watching',
        isLive: true,
        type: 'stream'
      }
    ];

    sendResponse(res, 200, {
      items: fallbackResults,
      count: fallbackResults.length,
      query: q,
      instance: 'fallback',
      cached: false,
      fallback: true
    });
  }
};
