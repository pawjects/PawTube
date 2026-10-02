const { requestPiped, normalizeMediaItem, sendResponse, sendError, parseQueryParams, cleanText } = require('../_piped');

const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://invidious.no-valis.be',
  'https://invidious.drgns.space',
  'https://inv.vern.cc'
];

// In-memory cache for playlists
const playlistCache = new Map();
const PLAYLIST_CACHE_TTL = 180000; // 3 minutes

function cleanPlaylistId(input) {
  if (!input || typeof input !== 'string') return '';
  let clean = decodeURIComponent(input.trim());
  const listMatch = clean.match(/[?&]list=([^&#]+)/i);
  if (listMatch) {
    clean = listMatch[1];
  }
  clean = clean.replace(/^(?:#|\/pawtube)?\/?playlists?\//i, '');
  clean = clean.replace(/^(?:#|\/pawtube)?\/?playlist\?list=/i, '');
  if (clean.startsWith('VLPL') || clean.startsWith('VLOLAK') || clean.startsWith('VLRD')) {
    clean = clean.substring(2);
  }
  clean = clean.split(/[?#&]/)[0].trim();
  return clean;
}

function normalizeInvidiousVideo(v) {
  if (!v || !v.videoId) return null;
  const id = v.videoId;
  const rawThumb = (v.videoThumbnails && v.videoThumbnails[0] && v.videoThumbnails[0].url) ? v.videoThumbnails[0].url : '';
  const bestThumb = rawThumb.startsWith('http')
    ? rawThumb
    : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

  return normalizeMediaItem({
    id,
    title: cleanText(v.title, 'YouTube Video'),
    author: cleanText(v.author, 'YouTube Channel'),
    channel: cleanText(v.author, 'YouTube Channel'),
    authorId: v.authorId,
    uploaderUrl: v.authorUrl,
    durationSeconds: v.lengthSeconds,
    duration: v.lengthSeconds,
    thumb: bestThumb,
    thumbnail: bestThumb,
    isLive: Boolean(v.liveNow)
  });
}

async function fetchFromInvidious(cleanId, page = 1) {
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const url = `${base}/api/v1/playlists/${cleanId}${page > 1 ? `?page=${page}` : ''}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'PawTube/1.0' },
        signal: controller.signal
      });
      clearTimeout(timer);

      if (!res.ok) continue;
      const data = await res.json();
      if (!data || !data.title) continue;

      const rawVideos = Array.isArray(data.videos) ? data.videos : [];
      const videos = rawVideos.map(normalizeInvidiousVideo).filter(Boolean);

      let bestThumb = data.playlistThumbnail || '';
      if (!bestThumb && videos.length > 0 && videos[0].thumb) {
        bestThumb = videos[0].thumb;
      }
      if (!bestThumb && data.authorThumbnails && data.authorThumbnails[0]) {
        bestThumb = data.authorThumbnails[0].url;
      }

      const totalCount = typeof data.videoCount === 'number' ? data.videoCount : videos.length;
      const hasMore = rawVideos.length >= 50 && (page * 50 < totalCount);

      return {
        id: cleanId,
        name: cleanText(data.title, 'Playlist'),
        title: cleanText(data.title, 'Playlist'),
        description: cleanText(data.description, ''),
        thumbnail: bestThumb,
        bannerUrl: '',
        uploader: cleanText(data.author, 'YouTube Channel'),
        uploaderUrl: data.authorUrl || (data.authorId ? `/channel/${data.authorId}` : ''),
        uploaderAvatar: (data.authorThumbnails && data.authorThumbnails[0]?.url) || '',
        videos,
        videosCount: totalCount,
        nextpage: hasMore ? String(page + 1) : null,
        instance: base
      };
    } catch {
      // Try next invidious instance
    }
  }
  return null;
}

/**
 * Direct YouTube initial data fallback for playlists when proxies fail
 */
async function fetchFromYouTubeInitialData(cleanId) {
  try {
    const url = `https://www.youtube.com/playlist?list=${cleanId}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const html = await res.text();

    const dataMatch = html.match(/var ytInitialData\s*=\s*({.+?});<\/script>/s) || html.match(/window\["ytInitialData"\]\s*=\s*({.+?});<\/script>/s);
    if (!dataMatch) return null;

    const parsed = JSON.parse(dataMatch[1]);
    const metadata = parsed?.metadata?.playlistMetadataRenderer;
    const header = parsed?.header?.playlistHeaderRenderer;
    const title = cleanText(metadata?.title || header?.title?.runs?.[0]?.text || header?.title?.simpleText, 'Playlist');
    const uploader = cleanText(header?.ownerText?.runs?.[0]?.text, 'YouTube Channel');
    const uploaderUrl = header?.ownerText?.runs?.[0]?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || '';
    const description = cleanText(metadata?.description || header?.descriptionText?.simpleText, '');

    // Extract videos
    const tabs = parsed?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
    const contents = tabs[0]?.tabRenderer?.content?.sectionListRenderer?.contents || [];
    const itemSection = contents[0]?.itemSectionRenderer?.contents || [];
    const videoList = itemSection[0]?.playlistVideoListRenderer?.contents || [];

    const videos = [];
    const seen = new Set();
    for (const v of videoList) {
      const pvr = v.playlistVideoRenderer;
      if (!pvr || !pvr.videoId) continue;
      const vId = pvr.videoId;
      if (seen.has(vId)) continue;
      seen.add(vId);

      const vTitle = cleanText(pvr.title?.runs?.[0]?.text || pvr.title?.simpleText, 'YouTube Video');
      if (/^\[(?:deleted|private) video\]$/i.test(vTitle)) continue;

      const vAuthor = cleanText(pvr.shortBylineText?.runs?.[0]?.text, uploader);
      const vThumb = pvr.thumbnail?.thumbnails?.[pvr.thumbnail?.thumbnails?.length - 1]?.url || `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`;
      const durSec = parseInt(pvr.lengthSeconds || '0', 10) || 0;

      const item = normalizeMediaItem({
        id: vId,
        title: vTitle,
        channel: vAuthor,
        author: vAuthor,
        durationSeconds: durSec,
        thumb: vThumb
      });
      if (item) videos.push(item);
    }

    if (videos.length === 0 && !title) return null;

    let bestThumb = header?.playlistHeaderBanner?.thumbnails?.[0]?.url || (videos[0] ? videos[0].thumb : '');

    return {
      id: cleanId,
      name: title,
      title: title,
      description,
      thumbnail: bestThumb,
      bannerUrl: '',
      uploader,
      uploaderUrl,
      uploaderAvatar: '',
      videos,
      videosCount: typeof header?.numVideosText?.runs?.[0]?.text === 'string'
        ? (parseInt(header.numVideosText.runs[0].text.replace(/[^0-9]/g, ''), 10) || videos.length)
        : videos.length,
      nextpage: null,
      instance: 'youtube-web'
    };
  } catch (err) {
    console.warn('[API /piped/playlist] YouTube fallback error:', err.message);
    return null;
  }
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
  const rawId = getParam('list') || getParam('id') || '';
  const cleanId = cleanPlaylistId(rawId);
  const nextPageParam = getParam('nextpage') || getParam('page') || null;
  const pageNum = nextPageParam ? parseInt(nextPageParam, 10) || 1 : 1;

  if (!cleanId) {
    sendError(res, 400, 'INVALID_PLAYLIST_ID', 'Valid playlist ID is required.');
    return;
  }

  const cacheKey = `${cleanId}_page_${pageNum}`;
  const now = Date.now();
  if (playlistCache.has(cacheKey)) {
    const cached = playlistCache.get(cacheKey);
    if (now - cached.timestamp < PLAYLIST_CACHE_TTL) {
      sendResponse(res, 200, { ...cached.data, cached: true });
      return;
    }
    playlistCache.delete(cacheKey);
  }

  // Step 1: Try Piped instance
  try {
    const pipedResult = await requestPiped(`/playlists/${cleanId}`, {}, { customInstance, ttlMs: 120000 });
    const data = pipedResult.data || {};
    const streams = Array.isArray(data.relatedStreams)
      ? data.relatedStreams.map(normalizeMediaItem).filter(Boolean)
      : (Array.isArray(data.videos) ? data.videos.map(normalizeMediaItem).filter(Boolean) : []);

    if (streams.length > 0) {
      const responseData = {
        id: cleanId,
        name: cleanText(data.name || data.title, 'Playlist'),
        title: cleanText(data.name || data.title, 'Playlist'),
        description: cleanText(data.description, ''),
        thumbnail: data.thumbnailUrl || (streams[0] ? streams[0].thumb : ''),
        bannerUrl: data.bannerUrl || '',
        uploader: cleanText(data.uploader || data.author, 'YouTube Channel'),
        uploaderUrl: data.uploaderUrl || '',
        uploaderAvatar: data.uploaderAvatar || '',
        videos: streams,
        videosCount: typeof data.videos === 'number' ? data.videos : streams.length,
        nextpage: data.nextpage || null,
        instance: pipedResult.instance,
        cached: false
      };
      playlistCache.set(cacheKey, { data: responseData, timestamp: now });
      sendResponse(res, 200, responseData);
      return;
    }
  } catch {
    // Fall through to Invidious fallback
  }

  // Step 2: Fallback to high-availability Invidious instances
  try {
    const invidiousData = await fetchFromInvidious(cleanId, pageNum);
    if (invidiousData && invidiousData.videos.length > 0) {
      playlistCache.set(cacheKey, { data: invidiousData, timestamp: now });
      sendResponse(res, 200, { ...invidiousData, cached: false });
      return;
    }
  } catch (err) {
    console.warn('[API /piped/playlist] Invidious fallback error:', err.message);
  }

  // Step 3: Fallback to YouTube web initial data
  try {
    const ytData = await fetchFromYouTubeInitialData(cleanId);
    if (ytData && (ytData.videos.length > 0 || ytData.title)) {
      playlistCache.set(cacheKey, { data: ytData, timestamp: now });
      sendResponse(res, 200, { ...ytData, cached: false });
      return;
    }
  } catch (err) {
    console.warn('[API /piped/playlist] YouTube fallback error:', err.message);
  }

  // Step 4: Return clean 404 error if completely unavailable
  sendError(
    res,
    404,
    'PLAYLIST_NOT_FOUND',
    'Playlist could not be loaded. It may be private, deleted, or unavailable.'
  );
};
