const { requestPiped, sendResponse, sendError } = require('../_piped');

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
  const query = (url.searchParams.get('q') || '').trim();
  const customInstance = url.searchParams.get('custom') || req.headers['x-custom-instance'] || null;

  if (!query) {
    sendResponse(res, 200, { suggestions: [] });
    return;
  }

  try {
    const result = await requestPiped('/suggestions', { query }, { customInstance, ttlMs: 60000 });
    const suggestions = Array.isArray(result.data) ? result.data : [];
    sendResponse(res, 200, { suggestions, instance: result.instance });
  } catch (err) {
    console.warn('[API /piped/suggestions] Error:', err.message);
    sendResponse(res, 200, { suggestions: [] });
  }
};
