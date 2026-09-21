const { requestPiped, extractMediaId, normalizeMediaItem, sendResponse, sendError } = require('../_piped');

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
  const rawId = url.searchParams.get('v') || url.searchParams.get('id') || '';
  const videoId = extractMediaId(rawId);
  const customInstance = url.searchParams.get('custom') || req.headers['x-custom-instance'] || null;

  if (!videoId) {
    sendError(res, 400, 'INVALID_VIDEO_ID', 'A valid 11-character YouTube video ID is required.');
    return;
  }

  try {
    const result = await requestPiped(`/streams/${videoId}`, {}, { customInstance, ttlMs: 120000 });
    const data = result.data || {};

    const related = Array.isArray(data.relatedStreams)
      ? data.relatedStreams.map(normalizeMediaItem).filter(Boolean)
      : [];

    sendResponse(res, 200, {
      id: videoId,
      title: data.title || 'YouTube Video',
      description: data.description || '',
      channel: data.uploader || 'Unknown Channel',
      author: data.uploader || 'Unknown Channel',
      channelId: data.uploaderUrl ? data.uploaderUrl.replace(/^\/channel\//, '') : '',
      avatar: data.uploaderAvatar || '',
      thumb: data.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: data.duration || 0,
      views: data.views || 0,
      likes: data.likes || 0,
      dislikes: data.dislikes || 0,
      uploadDate: data.uploadDate || '',
      videoStreams: data.videoStreams || [],
      audioStreams: data.audioStreams || [],
      subtitles: data.subtitles || [],
      related,
      instance: result.instance,
      cached: result.cached
    });
  } catch (err) {
    // oEmbed fallback for metadata
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, {
        signal: AbortSignal.timeout(3000)
      });
      if (oembedRes.ok) {
        const meta = await oembedRes.json();
        sendResponse(res, 200, {
          id: videoId,
          title: meta.title || 'YouTube Video',
          description: '',
          channel: meta.author_name || 'YouTube Channel',
          author: meta.author_name || 'YouTube Channel',
          channelId: meta.author_url ? meta.author_url.split('/').pop() : '',
          avatar: '',
          thumb: meta.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: 0,
          views: 0,
          uploadDate: '',
          videoStreams: [],
          audioStreams: [],
          subtitles: [],
          related: [],
          fallback: true
        });
        return;
      }
    } catch {
      // Fallback below
    }

    // Default basic video metadata fallback
    sendResponse(res, 200, {
      id: videoId,
      title: 'YouTube Video',
      description: '',
      channel: 'YouTube Channel',
      author: 'YouTube Channel',
      channelId: '',
      avatar: '',
      thumb: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: 0,
      views: 0,
      uploadDate: '',
      videoStreams: [],
      audioStreams: [],
      subtitles: [],
      related: [],
      fallback: true
    });
  }
};
