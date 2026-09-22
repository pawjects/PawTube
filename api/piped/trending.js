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
  const region = url.searchParams.get('region') || 'IN';
  const customInstance = url.searchParams.get('custom') || req.headers['x-custom-instance'] || null;

  try {
    const result = await requestPiped('/trending', { region }, { customInstance, ttlMs: 60000 });
    const rawItems = Array.isArray(result.data)
      ? result.data
      : (result.data && Array.isArray(result.data.items) ? result.data.items : []);

    const items = rawItems.map(normalizeMediaItem).filter(Boolean);

    sendResponse(res, 200, {
      items,
      count: items.length,
      region,
      instance: result.instance,
      cached: result.cached
    });
  } catch (err) {
    console.error('[API /piped/trending] Error:', err.message);
    sendError(res, 502, 'TRENDING_FETCH_FAILED', err.message);
  }
};
