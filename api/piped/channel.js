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
  const channelId = url.searchParams.get('id') || '';
  const nextpage = url.searchParams.get('nextpage') || '';
  const customInstance = url.searchParams.get('custom') || req.headers['x-custom-instance'] || null;

  if (!channelId) {
    sendError(res, 400, 'INVALID_CHANNEL_ID', 'Channel ID is required.');
    return;
  }

  try {
    let cleanId = channelId.replace(/^\/channel\//, '').trim();

    // If channelId is a handle (e.g. @mkbhd) or username, resolve to UC channel ID
    if (cleanId.startsWith('@') || (!cleanId.startsWith('UC') && cleanId.length < 24)) {
      try {
        const searchRes = await requestPiped('/search', { q: cleanId, filter: 'channels' }, { customInstance, ttlMs: 120000 });
        const items = searchRes.data?.items || [];
        const match = items.find((i) => i.type === 'channel' && i.url);
        if (match && match.url) {
          cleanId = match.url.replace(/^\/channel\//, '');
        }
      } catch (searchErr) {
        console.warn('[API /piped/channel] Handle resolution search failed:', searchErr.message);
      }
    }

    if (nextpage) {
      const result = await requestPiped(`/nextpage/channel/${cleanId}`, { nextpage }, { customInstance, ttlMs: 60000 });
      const data = result.data || {};
      const relatedStreams = Array.isArray(data.relatedStreams)
        ? data.relatedStreams.map(normalizeMediaItem).filter(Boolean)
        : [];
      sendResponse(res, 200, {
        id: cleanId,
        videos: relatedStreams,
        nextpage: data.nextpage || null,
        instance: result.instance,
        cached: result.cached
      });
      return;
    }

    const result = await requestPiped(`/channel/${cleanId}`, {}, { customInstance, ttlMs: 120000 });
    const data = result.data || {};

    const relatedStreams = Array.isArray(data.relatedStreams)
      ? data.relatedStreams.map(normalizeMediaItem).filter(Boolean)
      : [];

    sendResponse(res, 200, {
      id: cleanId,
      name: data.name || 'Channel',
      description: data.description || '',
      avatar: data.avatarUrl || '',
      banner: data.bannerUrl || '',
      subscribers: data.subscriberCount || 0,
      verified: Boolean(data.verified),
      videos: relatedStreams,
      nextpage: data.nextpage || null,
      instance: result.instance,
      cached: result.cached
    });
  } catch (err) {
    console.error('[API /piped/channel] Error:', err.message);
    sendError(res, 502, 'UPSTREAM_ERROR', err.message);
  }
};
