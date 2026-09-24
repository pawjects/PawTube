const { requestPiped, sendResponse, sendError, parseQueryParams } = require('../_piped');

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
  const query = (getParam('q') || '').trim();

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
