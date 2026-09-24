const { requestPiped, extractMediaId, normalizeMediaItem, normalizeDurationSeconds, formatDuration, sendResponse, sendError, parseQueryParams } = require('../_piped');

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

    const durationSeconds = normalizeDurationSeconds(data.duration);
    const likes = (typeof data.likes === 'number' && data.likes >= 0) ? data.likes : null;
    const views = (typeof data.views === 'number' && data.views >= 0) ? data.views : null;

    sendResponse(res, 200, {
      id: videoId,
      title: data.title || 'YouTube Video',
      description: data.description || '',
      channel: data.uploader || 'Unknown Channel',
      author: data.uploader || 'Unknown Channel',
      channelId: data.uploaderUrl ? data.uploaderUrl.replace(/^\/channel\//, '') : '',
      avatar: data.uploaderAvatar || '',
      thumb: data.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      durationSeconds,
      duration: durationSeconds !== null ? durationSeconds : 0,
      durationFormatted: formatDuration(durationSeconds),
      views,
      likes,
      dislikes: typeof data.dislikes === 'number' ? data.dislikes : null,
      uploadDate: data.uploadDate || '',
      videoStreams: data.videoStreams || [],
      audioStreams: data.audioStreams || [],
      subtitles: data.subtitles || [],
      related,
      instance: result.instance,
      cached: result.cached
    });
  } catch (err) {
    // Fallback 1: Query Piped Search which often has complete metadata even when /streams fails
    try {
      const searchRes = await requestPiped('/search', { q: videoId, filter: 'videos' }, { customInstance, ttlMs: 60000 });
      const items = (searchRes.data?.items || []).map(normalizeMediaItem).filter(Boolean);
      const match = items.find((i) => i.id === videoId);

      if (match) {
        sendResponse(res, 200, {
          id: videoId,
          title: match.title || 'YouTube Video',
          description: '',
          channel: match.channel || 'YouTube Channel',
          author: match.author || 'YouTube Channel',
          channelId: match.channelId || '',
          avatar: match.avatar || '',
          thumb: match.thumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          durationSeconds: match.durationSeconds,
          duration: match.duration,
          durationFormatted: match.durationFormatted,
          views: match.views,
          likes: null,
          dislikes: null,
          uploadDate: match.uploadedDate || '',
          videoStreams: [],
          audioStreams: [],
          subtitles: [],
          related: items.filter((i) => i.id !== videoId),
          fallback: true,
          instance: searchRes.instance
        });
        return;
      }
    } catch {
      // Continue to oEmbed fallback
    }

    // Fallback 2: oEmbed for basic title and channel
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
          durationSeconds: null,
          duration: 0,
          durationFormatted: '00:00',
          views: null,
          likes: null,
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

    // Fallback 3: Default basic video metadata
    sendResponse(res, 200, {
      id: videoId,
      title: 'YouTube Video',
      description: '',
      channel: 'YouTube Channel',
      author: 'YouTube Channel',
      channelId: '',
      avatar: '',
      thumb: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      durationSeconds: null,
      duration: 0,
      durationFormatted: '00:00',
      views: null,
      likes: null,
      uploadDate: '',
      videoStreams: [],
      audioStreams: [],
      subtitles: [],
      related: [],
      fallback: true
    });
  }
};
