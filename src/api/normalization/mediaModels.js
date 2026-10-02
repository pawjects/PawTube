/**
 * PawTube - Media Normalization & Validation Models
 * Centralized normalizer guaranteeing clean, consistent metadata presentation
 * across Home, Search, Playlist, Watch, and Mini-Player.
 */

import { extractVideoId } from '../../player/videoId.js';
import { extractPlaylistId } from '../../utils/playlistId.js';

/**
 * Decodes HTML entities and fixes broken Unicode sequences.
 * Runs iteratively to handle double-encoded entities (e.g. &amp;#39; -> &#39; -> ').
 */
export function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return '';
  let prev = '';
  let curr = str;
  let iterations = 0;

  // Common entity map for named entities
  const NAMED_ENTITIES = {
    '&quot;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&#039;': "'",
    '&rsquo;': "'",
    '&lsquo;': "'",
    '&rdquo;': '"',
    '&ldquo;': '"',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&nbsp;': ' ',
    '&ndash;': '–',
    '&mdash;': '—',
    '&bull;': '•',
    '&hellip;': '…',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™'
  };

  while (curr !== prev && iterations < 3) {
    prev = curr;
    iterations++;

    // Replace named entities
    curr = curr.replace(/&(?:quot|apos|#39|#039|rsquo|lsquo|rdquo|ldquo|amp|lt|gt|nbsp|ndash|mdash|bull|hellip|copy|reg|trade);/gi, (match) => {
      const lower = match.toLowerCase();
      return NAMED_ENTITIES[lower] || match;
    });

    // Replace decimal numeric entities: &#123;
    curr = curr.replace(/&#(\d+);/g, (_, code) => {
      const num = parseInt(code, 10);
      return !isNaN(num) && num > 0 && num < 65536 ? String.fromCharCode(num) : '';
    });

    // Replace hexadecimal numeric entities: &#x1f600;
    curr = curr.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
      const num = parseInt(code, 16);
      return !isNaN(num) && num > 0 && num < 65536 ? String.fromCharCode(num) : '';
    });
  }

  return curr;
}

/**
 * Sanitizes and cleans user-facing text:
 * - Decodes pre-escaped HTML entities
 * - Strips literal 'undefined', 'null', '[object Object]', 'NaN', 'unknown'
 * - Cleans zero-width characters and control chars
 * - Collapses repeated whitespace
 */
export function cleanText(str, fallback = '') {
  if (str === null || str === undefined) return fallback;
  let text = String(str).trim();

  // Check for literal bad representations
  if (
    text === 'undefined' ||
    text === 'null' ||
    text === '[object Object]' ||
    text === 'NaN' ||
    text.toLowerCase() === 'none'
  ) {
    return fallback;
  }

  text = decodeHtmlEntities(text);

  // Remove zero-width spaces, replacement characters, and control characters
  text = text.replace(/[\u200B-\u200D\uFEFF\uFFFD\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  // Collapse multiple whitespaces/tabs into single space
  text = text.replace(/\s+/g, ' ').trim();

  if (!text || text === 'undefined' || text === 'null') {
    return fallback;
  }

  return text;
}

/**
 * Normalizes duration to an integer number of seconds.
 * Supports:
 * - integer / float seconds
 * - seconds string e.g. "245"
 * - formatted time string e.g. "3:45", "01:23:45"
 * - ISO 8601 string e.g. "PT1H2M3S", "PT4M20S"
 */
export function normalizeDurationSeconds(raw) {
  if (raw === null || raw === undefined || raw === '') return null;

  if (typeof raw === 'number') {
    if (isNaN(raw) || !isFinite(raw) || raw < 0) return null;
    return Math.floor(raw);
  }

  const str = String(raw).trim();
  if (!str) return null;

  // 1. Check ISO 8601 format: PT#H#M#S
  if (/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.test(str)) {
    const match = str.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
    if (match) {
      const hours = parseInt(match[1] || '0', 10);
      const mins = parseInt(match[2] || '0', 10);
      const secs = parseInt(match[3] || '0', 10);
      return hours * 3600 + mins * 60 + secs;
    }
  }

  // 2. Check HH:MM:SS or MM:SS format
  if (/^\d+(?::\d+)+$/.test(str)) {
    const parts = str.split(':').map((p) => parseInt(p, 10));
    if (parts.some(isNaN)) return null;
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
  }

  // 3. Simple numeric string
  const num = parseFloat(str);
  if (isNaN(num) || !isFinite(num) || num < 0) return null;
  return Math.floor(num);
}

/**
 * Formats seconds into clean YouTube-style standard:
 * - "M:SS" (e.g. "3:45", "0:05", "0:00")
 * - "H:MM:SS" (e.g. "1:05:32")
 */
export function formatDuration(seconds) {
  const sec = normalizeDurationSeconds(seconds);
  if (sec === null || sec < 0) return '0:00';

  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const padS = String(s).padStart(2, '0');

  if (h > 0) {
    const padM = String(m).padStart(2, '0');
    return `${h}:${padM}:${padS}`;
  }
  return `${m}:${padS}`;
}

/**
 * Formats view counts consistently across the app.
 * Output: "0 views", "1 view", "12K views", "1.5M views", "2.1B views".
 */
export function formatViews(views) {
  if (views === null || views === undefined || views === '') return '';

  if (typeof views === 'string') {
    const trimmed = cleanText(views);
    // If it's already cleanly formatted like "1.2M views" or "10K views"
    if (/^\d[\d,.]*\s*(?:K|M|B)?\s*views?$/i.test(trimmed)) {
      return trimmed.replace(/\s+/g, ' ');
    }
  }

  const num = typeof views === 'number'
    ? views
    : parseInt(String(views).replace(/[^0-9]/g, ''), 10);

  if (isNaN(num) || num < 0) return '';
  if (num === 0) return '0 views';
  if (num === 1) return '1 view';
  if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B views';
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M views';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K views';
  return `${num.toLocaleString()} views`;
}

/**
 * Formats playlist item counts cleanly.
 */
export function formatVideoCount(count) {
  if (count === null || count === undefined || count === '') return 'Playlist';
  const num = typeof count === 'number'
    ? count
    : parseInt(String(count).replace(/[^0-9]/g, ''), 10);

  if (isNaN(num) || num < 0) return 'Playlist';
  if (num === 0) return '0 videos';
  if (num === 1) return '1 video';
  return `${num.toLocaleString()} videos`;
}

/**
 * Formats upload dates into human-readable relative string.
 */
export function formatUploadedDate(dateVal) {
  if (!dateVal || dateVal === -1) return '';

  if (typeof dateVal === 'string') {
    const trimmed = cleanText(dateVal);
    if (!trimmed) return '';
    if (trimmed.toLowerCase().includes('ago') || trimmed.toLowerCase() === 'live') {
      return trimmed;
    }
    const parsed = Date.parse(trimmed);
    if (!isNaN(parsed) && parsed > 0) {
      dateVal = parsed;
    }
  }

  const num = typeof dateVal === 'number' ? dateVal : parseInt(String(dateVal), 10);
  if (num && !isNaN(num) && num > 0) {
    const ms = num < 10000000000 ? num * 1000 : num;
    const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (diffSec < 60) return 'Just now';
    const minutes = Math.floor(diffSec / 60);
    if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return days === 1 ? '1 day ago' : `${days} days ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
    const months = Math.floor(days / 30.4375);
    if (months < 12) return months <= 1 ? '1 month ago' : `${months} months ago`;
    const years = Math.floor(days / 365.25);
    return years <= 1 ? '1 year ago' : `${years} years ago`;
  }
  return '';
}

/**
 * Normalizes a video/stream item from any provider into the unified PawTube model.
 */
export function normalizeMediaItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = extractVideoId(raw.id || raw.videoId || raw.url);
  if (!id || id.length !== 11) return null;

  const rawTitle = raw.title || raw.name || '';
  const title = cleanText(rawTitle, 'YouTube Video');

  // Filter out explicit deleted or unavailable placeholders from creators
  if (/^\[(?:deleted|private) video\]$/i.test(title)) {
    return null;
  }

  const durationSeconds = normalizeDurationSeconds(
    raw.durationSeconds !== undefined ? raw.durationSeconds : raw.duration
  );
  const rawDuration = typeof raw.duration === 'number' ? raw.duration : (parseInt(raw.duration, 10) || 0);
  const views = typeof raw.views === 'number' ? raw.views : (parseInt(String(raw.views || '').replace(/[^0-9]/g, ''), 10) || 0);

  // Authoritative live stream detection using metadata signals
  const isLive = Boolean(
    raw.isLive === true ||
    raw.liveNow === true ||
    raw.live === true ||
    raw.type === 'live' ||
    raw.type === 'livestream' ||
    raw.type === 'live_stream' ||
    raw.streamType === 'live' ||
    raw.videoType === 'live' ||
    rawDuration < 0 ||
    (raw.uploadedDate === null && raw.uploaded === -1) ||
    (raw.badges && Array.isArray(raw.badges) && raw.badges.some((b) => /LIVE|PREMIERE/i.test(String(b))))
  );

  // Authoritative short detection using multiple metadata signals
  const isShort = Boolean(
    raw.isShort === true ||
    raw.type === 'short' ||
    raw.type === 'shorts' ||
    (raw.url && raw.url.includes('/shorts/')) ||
    (raw.badges && Array.isArray(raw.badges) && raw.badges.some((b) => /SHORTS?/i.test(String(b)))) ||
    (durationSeconds !== null && durationSeconds > 0 && durationSeconds <= 60 && /#shorts?\b/i.test(title))
  );

  const rawChannel = raw.channel || raw.author || raw.uploaderName || raw.uploader || 'YouTube Channel';
  const channel = cleanText(rawChannel, 'YouTube Channel');
  const channelId = cleanText(raw.channelId || raw.authorId || (raw.uploaderUrl ? raw.uploaderUrl.replace(/^\/channel\//, '') : ''), '');

  const rawThumb = raw.thumb || raw.thumbnail || raw.thumbnailUrl || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '');
  const thumb = rawThumb && rawThumb.startsWith('http') ? rawThumb : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  const avatar = raw.avatar || raw.authorAvatar || raw.uploaderAvatar || '';

  return {
    id,
    url: `https://www.youtube.com/watch?v=${id}`,
    pawtubeUrl: `#/watch?v=${id}`,
    title,
    channel,
    author: channel,
    channelId,
    uploaderUrl: raw.uploaderUrl || (channelId ? `/channel/${channelId}` : ''),
    thumb,
    thumbnail: thumb,
    avatar,
    durationSeconds,
    duration: durationSeconds !== null ? durationSeconds : 0,
    durationFormatted: raw.durationFormatted || formatDuration(durationSeconds),
    views,
    viewsFormatted: raw.viewsFormatted || formatViews(views),
    uploadedDate: raw.uploadedDate || raw.uploadDate || raw.uploaded || '',
    publishedTime: raw.publishedTime || raw.uploadedDate || '',
    uploadedFormatted: raw.uploadedFormatted || formatUploadedDate(raw.uploadedDate || raw.uploadDate || raw.uploaded || raw.publishedTime),
    isShort,
    isLive,
    type: isLive ? 'live' : (isShort ? 'short' : (raw.type || 'video'))
  };
}

/**
 * Normalizes a playlist item (e.g. from search results) into unified PawTube model.
 */
export function normalizePlaylistItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = extractPlaylistId(raw.id || raw.url || raw.playlistId || '');
  if (!id) return null;

  const title = cleanText(raw.title || raw.name, 'Playlist');
  const channel = cleanText(raw.channel || raw.author || raw.uploader || raw.uploaderName, 'YouTube Channel');
  const thumb = (raw.thumb || raw.thumbnail || raw.thumbnailUrl || '').trim();

  // Handle video count safely
  const rawCount = raw.videos !== undefined ? raw.videos : (raw.videoCount !== undefined ? raw.videoCount : raw.videosCount);
  const countText = formatVideoCount(rawCount);

  return {
    id,
    type: 'playlist',
    title,
    name: title,
    channel,
    author: channel,
    uploader: channel,
    uploaderUrl: raw.uploaderUrl || (raw.authorId ? `/channel/${raw.authorId}` : ''),
    thumb,
    thumbnail: thumb,
    durationFormatted: countText,
    videosCount: typeof rawCount === 'number' && rawCount >= 0 ? rawCount : null,
    pawtubeUrl: `#/playlist?list=${encodeURIComponent(id)}`
  };
}

/**
 * Normalizes full playlist response with child videos.
 */
export function normalizePlaylist(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = extractPlaylistId(raw.id || raw.playlistId || raw.url || '');
  if (!id) return null;

  const title = cleanText(raw.title || raw.name, 'Playlist');
  const uploader = cleanText(raw.uploader || raw.author || raw.channel || 'YouTube Channel');
  const uploaderAvatar = raw.uploaderAvatar || raw.avatar || '';
  const uploaderUrl = raw.uploaderUrl || '';
  const description = cleanText(raw.description, '');

  const rawVideos = Array.isArray(raw.videos) ? raw.videos : (Array.isArray(raw.relatedStreams) ? raw.relatedStreams : []);
  const seenIds = new Set();
  const videos = [];

  for (const v of rawVideos) {
    const item = normalizeMediaItem(v);
    if (item && item.id && !seenIds.has(item.id)) {
      seenIds.add(item.id);
      videos.push(item);
    }
  }

  let thumbnail = raw.thumbnail || raw.thumb || raw.thumbnailUrl || '';
  if (!thumbnail && videos.length > 0 && videos[0].thumb) {
    thumbnail = videos[0].thumb;
  }

  const totalCount = typeof raw.videosCount === 'number' && raw.videosCount >= 0
    ? raw.videosCount
    : (typeof raw.videos === 'number' && raw.videos >= 0 ? raw.videos : videos.length);

  return {
    id,
    title,
    name: title,
    uploader,
    author: uploader,
    channel: uploader,
    uploaderAvatar,
    uploaderUrl,
    description,
    thumbnail,
    thumb: thumbnail,
    bannerUrl: raw.bannerUrl || '',
    videos,
    videosCount: totalCount,
    formattedVideoCount: formatVideoCount(totalCount),
    nextpage: raw.nextpage || null
  };
}

export default {
  decodeHtmlEntities,
  cleanText,
  normalizeDurationSeconds,
  formatDuration,
  formatViews,
  formatVideoCount,
  formatUploadedDate,
  normalizeMediaItem,
  normalizePlaylistItem,
  normalizePlaylist
};
