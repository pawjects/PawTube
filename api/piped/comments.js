const { requestPiped, extractMediaId, sendResponse, sendError, parseQueryParams } = require('../_piped');

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
  const rawId = getParam('v') || getParam('id') || '';
  const videoId = extractMediaId(rawId);
  const nextpage = getParam('nextpage');

  if (!videoId) {
    sendError(res, 400, 'INVALID_VIDEO_ID', 'A valid 11-character YouTube video ID is required.');
    return;
  }

  try {
    const endpoint = nextpage 
      ? `/nextpage/comments/${videoId}?nextpage=${encodeURIComponent(nextpage)}` 
      : `/comments/${videoId}`;

    const result = await requestPiped(endpoint, {}, { customInstance, ttlMs: 120000 });
    const data = result.data || {};

    const rawComments = Array.isArray(data.comments) ? data.comments : [];
    const comments = rawComments.map((c) => ({
      id: c.commentId || Math.random().toString(36).slice(2),
      author: c.author || 'Anonymous',
      authorId: c.authorId || '',
      avatar: c.thumbnail || '',
      text: c.commentText || '',
      time: c.commentedTime || '',
      likes: typeof c.likeCount === 'number' ? c.likeCount : null,
      replyCount: typeof c.replyCount === 'number' ? c.replyCount : 0,
      repliesPage: c.repliesPage || null,
      verified: Boolean(c.verified),
      hearted: Boolean(c.hearted)
    }));

    sendResponse(res, 200, {
      comments,
      disabled: Boolean(data.disabled),
      nextpage: data.nextpage || null,
      instance: result.instance,
      cached: result.cached
    });
  } catch (err) {
    // If comments fail or are disabled, return clean disabled/empty state instead of failing watch page
    sendResponse(res, 200, {
      comments: [],
      disabled: false,
      nextpage: null,
      error: 'Comments currently unavailable from upstream instance.'
    });
  }
};
