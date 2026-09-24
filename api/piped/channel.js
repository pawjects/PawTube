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
  const channelId = getParam('id', '');
  const nextpage = getParam('nextpage', '');

  if (!channelId) {
    sendError(res, 400, 'INVALID_CHANNEL_ID', 'Channel ID is required.');
    return;
  }

  try {
    let cleanId = channelId.replace(/^\/channel\//, '').trim();

    // If channelId is a handle (e.g. @mkbhd) or channel name, resolve to UC channel ID
    if (cleanId.startsWith('@') || (!cleanId.startsWith('UC') && cleanId.length < 24)) {
      try {
        // Try searching with filter=channels first
        let searchRes = await requestPiped('/search', { q: cleanId, filter: 'channels' }, { customInstance, ttlMs: 120000 });
        let items = searchRes.data?.items || [];
        let match = items.find((i) => i.type === 'channel' && i.url);
        
        // If no match found, try without filter='channels' (filter='all')
        if (!match) {
          searchRes = await requestPiped('/search', { q: cleanId, filter: 'all' }, { customInstance, ttlMs: 120000 });
          items = searchRes.data?.items || [];
          match = items.find((i) => i.type === 'channel' && i.url) ||
                  items.find((i) => i.uploaderUrl && i.uploaderUrl.startsWith('/channel/'));
        }

        if (match) {
          const resolvedUrl = match.url || match.uploaderUrl;
          if (resolvedUrl) {
            cleanId = resolvedUrl.replace(/^\/channel\//, '');
          }
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

    try {
      const result = await requestPiped(`/channel/${cleanId}`, {}, { customInstance, ttlMs: 120000 });
      const data = result.data || {};

      const relatedStreams = Array.isArray(data.relatedStreams)
        ? data.relatedStreams.map(normalizeMediaItem).filter(Boolean)
        : [];

      sendResponse(res, 200, {
        id: cleanId,
        name: data.name || channelId,
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
    } catch (channelErr) {
      // If fetching the direct channel endpoint fails, fallback to search by channel name/id
      console.warn('[API /piped/channel] Direct channel fetch failed, attempting search fallback:', channelErr.message);
      try {
        const fallbackSearch = await requestPiped('/search', { q: channelId, filter: 'all' }, { customInstance, ttlMs: 60000 });
        const items = fallbackSearch.data?.items || [];
        const channelMeta = items.find((i) => i.type === 'channel');
        const videos = items.filter((i) => i.type !== 'channel').map(normalizeMediaItem).filter(Boolean);

        if (channelMeta || videos.length > 0) {
          sendResponse(res, 200, {
            id: cleanId,
            name: channelMeta?.name || channelId,
            description: channelMeta?.description || '',
            avatar: channelMeta?.thumbnail || '',
            banner: '',
            subscribers: channelMeta?.subscribers || 0,
            verified: Boolean(channelMeta?.verified),
            videos,
            nextpage: null,
            instance: fallbackSearch.instance,
            cached: false,
            fallback: true
          });
          return;
        }
      } catch (fallbackErr) {
        console.warn('[API /piped/channel] Fallback search also failed:', fallbackErr.message);
      }

      throw channelErr;
    }
  } catch (err) {
    console.error('[API /piped/channel] Error:', err.message);
    sendError(res, 502, 'UPSTREAM_ERROR', err.message);
  }
};
