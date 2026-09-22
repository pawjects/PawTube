/**
 * PawTube - Serverless Piped Engine & Instance Manager
 * Shared helper for Vercel Serverless Functions (/api/piped/*)
 */

const DEFAULT_INSTANCES = [
  'https://pipedapi.ducks.party',
  'https://api.piped.private.coffee',
  'https://api.piped.privacydev.net',
  'https://piped-api.lunar.icu'
];

// In-memory cache for serverless execution reuse
const memoryCache = new Map();
const instanceStats = new Map();

// Initialize stats
DEFAULT_INSTANCES.forEach((url) => {
  instanceStats.set(url, {
    url,
    consecutiveFailures: 0,
    cooldownUntil: 0,
    latency: 0,
    lastSuccess: 0
  });
});

/**
 * SSRF & URL Host Validation
 * Prevents arbitrary proxying or internal network scanning.
 */
function isValidPipedHost(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return false;
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    // Block private/local IP ranges and metadata servers
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('172.16.') ||
      host.startsWith('172.17.') ||
      host.startsWith('172.18.') ||
      host.startsWith('172.19.') ||
      host.startsWith('172.20.') ||
      host.startsWith('172.21.') ||
      host.startsWith('172.22.') ||
      host.startsWith('172.23.') ||
      host.startsWith('172.24.') ||
      host.startsWith('172.25.') ||
      host.startsWith('172.26.') ||
      host.startsWith('172.27.') ||
      host.startsWith('172.28.') ||
      host.startsWith('172.29.') ||
      host.startsWith('172.30.') ||
      host.startsWith('172.31.') ||
      host.endsWith('.internal') ||
      host.endsWith('.local') ||
      host.includes('169.254.')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Get ordered candidate instances
 */
function getCandidateInstances(customInstance = null) {
  const now = Date.now();
  const candidates = [];

  if (customInstance && isValidPipedHost(customInstance)) {
    candidates.push(customInstance.replace(/\/+$/, ''));
  }

  const pool = [...DEFAULT_INSTANCES];
  const healthy = pool.filter((u) => {
    if (u === customInstance) return false;
    const s = instanceStats.get(u);
    return s && now > (s.cooldownUntil || 0);
  }).sort((a, b) => {
    const sa = instanceStats.get(a)?.latency || 9999;
    const sb = instanceStats.get(b)?.latency || 9999;
    return sa - sb;
  });

  candidates.push(...healthy);
  return candidates.length > 0 ? candidates : DEFAULT_INSTANCES;
}

/**
 * Fetch with strict timeout using AbortController
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * Centralized Piped Request Engine
 */
async function requestPiped(endpoint, params = {}, options = {}) {
  const { customInstance = null, timeoutMs = 2800, ttlMs = 45000, skipCache = false } = options;

  const queryString = new URLSearchParams(params).toString();
  const cacheKey = `${endpoint}?${queryString}&custom=${customInstance || ''}`;
  const now = Date.now();

  if (!skipCache && memoryCache.has(cacheKey)) {
    const cached = memoryCache.get(cacheKey);
    if (now - cached.timestamp < ttlMs) {
      return { data: cached.data, cached: true, instance: cached.instance };
    }
    memoryCache.delete(cacheKey);
  }

  const candidates = getCandidateInstances(customInstance).slice(0, 4);
  let lastError = null;

  for (const base of candidates) {
    const cleanBase = base.replace(/\/+$/, '');
    const targetUrl = queryString ? `${cleanBase}${endpoint}?${queryString}` : `${cleanBase}${endpoint}`;
    const startTime = Date.now();

    try {
      const res = await fetchWithTimeout(targetUrl, {
        headers: { Accept: 'application/json', 'User-Agent': 'PawTube/1.0' }
      }, timeoutMs);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await res.text();
        if (text.startsWith('<')) throw new Error('Returned HTML rather than JSON');
        const parsed = JSON.parse(text);
        const latency = Date.now() - startTime;
        markSuccess(cleanBase, latency);
        memoryCache.set(cacheKey, { data: parsed, timestamp: now, instance: cleanBase });
        return { data: parsed, cached: false, instance: cleanBase };
      }

      const data = await res.json();
      if (data && data.error) {
        throw new Error(data.error);
      }

      const latency = Date.now() - startTime;
      markSuccess(cleanBase, latency);
      memoryCache.set(cacheKey, { data, timestamp: now, instance: cleanBase });
      return { data, cached: false, instance: cleanBase };
    } catch (err) {
      // Only penalize instance health for server/network/html errors, not 4xx client errors
      const isClientError = err.message && /^HTTP 4\d\d$/.test(err.message);
      if (!isClientError) {
        markFailure(cleanBase);
      }
      lastError = err;
    }
  }

  throw new Error(`All Piped instances failed. Last error: ${lastError ? lastError.message : 'Unknown'}`);
}

function markSuccess(url, latency) {
  const s = instanceStats.get(url) || { url };
  s.consecutiveFailures = 0;
  s.cooldownUntil = 0;
  s.lastSuccess = Date.now();
  s.latency = s.latency === 0 ? latency : Math.round(s.latency * 0.6 + latency * 0.4);
  instanceStats.set(url, s);
}

function markFailure(url) {
  const s = instanceStats.get(url) || { url, consecutiveFailures: 0 };
  s.consecutiveFailures = (s.consecutiveFailures || 0) + 1;
  if (s.consecutiveFailures >= 2) {
    const backoff = Math.min(180000, 30000 * s.consecutiveFailures);
    s.cooldownUntil = Date.now() + backoff;
  }
  instanceStats.set(url, s);
}

// Media normalization utilities
function formatDuration(seconds) {
  if (seconds === undefined || seconds === null) return '0:00';
  if (seconds < 0) return 'LIVE';
  const num = Math.floor(Number(seconds)) || 0;
  if (num <= 0) return '0:00';
  const h = Math.floor(num / 3600);
  const m = Math.floor((num % 3600) / 60);
  const s = num % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatViews(views) {
  if (views === null || views === undefined) return '';
  const num = typeof views === 'number' ? views : parseInt(String(views).replace(/[^0-9]/g, ''), 10);
  if (isNaN(num)) return '';
  if (num === 0) return '0 views';
  if (num === 1) return '1 view';
  if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B views';
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M views';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K views';
  return `${num.toLocaleString()} views`;
}

function formatUploadedDate(dateVal) {
  if (!dateVal || dateVal === -1) return '';
  if (typeof dateVal === 'string') {
    const trimmed = dateVal.trim();
    if (trimmed.toLowerCase().includes('ago') || trimmed.toLowerCase() === 'live') return trimmed;
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

function extractMediaId(urlOrId) {
  if (!urlOrId || typeof urlOrId !== 'string') return null;
  const clean = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;
  const vMatch = clean.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (vMatch) return vMatch[1];
  const youtuMatch = clean.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (youtuMatch) return youtuMatch[1];
  const shortsMatch = clean.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1];
  const embedMatch = clean.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];
  const pathMatch = clean.match(/(?:watch\/|v\/)([a-zA-Z0-9_-]{11})/);
  if (pathMatch) return pathMatch[1];
  return null;
}

function normalizeMediaItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = extractMediaId(raw.id || raw.videoId || raw.url);
  if (!id || id.length !== 11 || !raw.title) return null;

  const duration = typeof raw.duration === 'number' ? raw.duration : (parseInt(raw.duration, 10) || 0);
  const views = typeof raw.views === 'number' ? raw.views : (parseInt(String(raw.views || '').replace(/[^0-9]/g, ''), 10) || 0);

  return {
    id,
    url: `https://www.youtube.com/watch?v=${id}`,
    pawtubeUrl: `#/watch?v=${id}`,
    title: (raw.title || '').trim(),
    channel: raw.channel || raw.author || raw.uploaderName || raw.uploader || 'Unknown Channel',
    author: raw.channel || raw.author || raw.uploaderName || raw.uploader || 'Unknown Channel',
    channelId: raw.channelId || raw.authorId || (raw.uploaderUrl ? raw.uploaderUrl.replace(/^\/channel\//, '') : ''),
    thumb: raw.thumb || raw.thumbnail || raw.thumbnailUrl || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    avatar: raw.avatar || raw.authorAvatar || raw.uploaderAvatar || '',
    duration,
    durationFormatted: raw.durationFormatted || formatDuration(duration),
    views,
    viewsFormatted: raw.viewsFormatted || formatViews(views),
    uploadedDate: raw.uploadedDate || raw.uploadDate || raw.uploaded || '',
    publishedTime: raw.publishedTime || raw.uploadedDate || '',
    uploadedFormatted: raw.uploadedFormatted || formatUploadedDate(raw.uploadedDate || raw.uploadDate || raw.uploaded || raw.publishedTime),
    isShort: Boolean(raw.isShort || (duration > 0 && duration <= 75)),
    isLive: Boolean(raw.isLive || duration < 0),
    type: raw.type || 'video'
  };
}

function sendResponse(res, statusCode, data) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Custom-Instance');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = statusCode;
  res.end(JSON.stringify(data));
}

function sendError(res, statusCode, error, message) {
  sendResponse(res, statusCode, {
    error: error || 'SERVER_ERROR',
    message: message || 'An unexpected error occurred.',
    timestamp: Date.now()
  });
}

module.exports = {
  DEFAULT_INSTANCES,
  requestPiped,
  instanceStats,
  isValidPipedHost,
  extractMediaId,
  normalizeMediaItem,
  formatDuration,
  formatViews,
  formatUploadedDate,
  sendResponse,
  sendError
};
