const { requestPiped, normalizeMediaItem, sendResponse, sendError, parseQueryParams } = require('../_piped');

/**
 * Validate and filter candidate items strictly for Home / Trending feed
 */
function validateFeedItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  const valid = [];
  const seenIds = new Set();

  for (const raw of rawItems) {
    const item = normalizeMediaItem(raw);
    if (!item) continue;
    // 1. Must have valid 11-character video ID
    if (!item.id || item.id.length !== 11 || seenIds.has(item.id)) continue;
    // 2. Must have valid title
    if (!item.title || item.title.trim().length === 0) continue;
    // 3. Must have valid thumbnail
    if (!item.thumb || !item.thumb.startsWith('http')) continue;
    // 4. Must NOT be a live stream or broadcast
    if (item.isLive === true) continue;
    // 5. Must NOT be a Short
    if (item.isShort === true) continue;
    // 6. Must have valid standard duration
    if (item.durationSeconds === null || item.durationSeconds <= 0) continue;

    seenIds.add(item.id);
    valid.push(item);
  }

  return valid;
}

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
  const region = getParam('region', 'US');

  try {
    // 1. Attempt standard /trending endpoint from healthy Piped instance
    let standardTrendingItems = [];
    let instanceUsed = null;
    let wasCached = false;

    try {
      const result = await requestPiped('/trending', { region }, { customInstance, ttlMs: 60000 });
      instanceUsed = result.instance;
      wasCached = result.cached;
      const raw = Array.isArray(result.data)
        ? result.data
        : (result.data && Array.isArray(result.data.items) ? result.data.items : []);
      standardTrendingItems = validateFeedItems(raw);
    } catch (trendingErr) {
      console.warn('[API /piped/trending] Direct /trending failed or timed out:', trendingErr.message);
    }

    // 2. Response validation: If /trending returned an abnormal live-heavy response (< 8 standard videos),
    // query trending standard videos across diverse categories (General, Music, Gaming, Tech, Entertainment)
    if (standardTrendingItems.length < 8) {
      const categoryQueries = [
        `trending ${region}`,
        'trending music',
        'trending gaming',
        'trending technology',
        'trending entertainment'
      ];

      const searchPromises = categoryQueries.map((q) =>
        requestPiped('/search', { q, filter: 'videos', region }, { customInstance, ttlMs: 120000 })
          .then((res) => {
            if (!instanceUsed) instanceUsed = res.instance;
            return res.data?.items || [];
          })
          .catch(() => [])
      );

      const searchResults = await Promise.allSettled(searchPromises);
      const combined = [...standardTrendingItems];

      // Interleave results across categories to preserve content diversity
      const categoryArrays = searchResults.map((r) =>
        r.status === 'fulfilled' ? validateFeedItems(r.value) : []
      );

      const maxLen = Math.max(0, ...categoryArrays.map((arr) => arr.length));
      const seenIds = new Set(combined.map((i) => i.id));

      for (let i = 0; i < maxLen; i++) {
        for (const catArr of categoryArrays) {
          if (catArr[i] && !seenIds.has(catArr[i].id)) {
            seenIds.add(catArr[i].id);
            combined.push(catArr[i]);
          }
        }
      }

      standardTrendingItems = combined;
    }

    sendResponse(res, 200, {
      items: standardTrendingItems,
      count: standardTrendingItems.length,
      region,
      instance: instanceUsed || 'piped',
      cached: wasCached
    });
  } catch (err) {
    console.error('[API /piped/trending] Error:', err.message);
    sendError(res, 502, 'TRENDING_FETCH_FAILED', err.message);
  }
};
