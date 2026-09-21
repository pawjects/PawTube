/**
 * PawTube - Provider Architecture & Media Service Layer
 * 
 * Implements a clean, decoupled architecture:
 * PawTube UI -> PawTube Media Service -> Provider Interface -> NewPipeExtractor Provider -> Supported Media Services
 * 
 * Features:
 * - Normalized PawTube native models (MediaItem, Channel, Playlist, StreamInfo, Comment, etc.)
 * - Standardized PawTubeError with categorized error codes
 * - Resilient NewPipeExtractor provider with multi-instance failover and oEmbed fallback
 * - Ephemeral caching, request deduplication, and active query abort control
 * - PlayerAdapter for clean playback abstraction
 */

(function () {
  'use strict';

  // =========================================================================
  // 1. ERROR CLASSIFICATION & CODES
  // =========================================================================

  const ErrorCodes = {
    NETWORK_ERROR: 'NETWORK_ERROR',
    EXTRACTION_FAILED: 'EXTRACTION_FAILED',
    VIDEO_UNAVAILABLE: 'VIDEO_UNAVAILABLE',
    REGION_RESTRICTED: 'REGION_RESTRICTED',
    LOGIN_REQUIRED: 'LOGIN_REQUIRED',
    RATE_LIMITED: 'RATE_LIMITED',
    INVALID_URL: 'INVALID_URL',
    NO_STREAM_AVAILABLE: 'NO_STREAM_AVAILABLE',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR'
  };

  class PawTubeError extends Error {
    constructor(code, message, originalError = null, retryable = true) {
      super(message);
      this.name = 'PawTubeError';
      this.code = code || ErrorCodes.UNKNOWN_ERROR;
      this.originalError = originalError;
      this.retryable = retryable;
      this.userMessage = PawTubeError.getUserFriendlyMessage(this.code, message);
    }

    static getUserFriendlyMessage(code, fallbackMessage) {
      switch (code) {
        case ErrorCodes.NETWORK_ERROR:
          return 'Unable to connect to the media network. Please check your internet connection and try again.';
        case ErrorCodes.EXTRACTION_FAILED:
          return 'Failed to extract media information from provider. Try again in a moment.';
        case ErrorCodes.VIDEO_UNAVAILABLE:
          return 'This video is unavailable or has been removed.';
        case ErrorCodes.REGION_RESTRICTED:
          return 'This video is restricted in your region by the content owner.';
        case ErrorCodes.LOGIN_REQUIRED:
          return 'This video requires an account or age confirmation and cannot be extracted.';
        case ErrorCodes.RATE_LIMITED:
          return 'Provider is temporarily rate-limited. Retrying with alternative instance...';
        case ErrorCodes.INVALID_URL:
          return 'Invalid YouTube or video URL. Please check the link and try again.';
        case ErrorCodes.NO_STREAM_AVAILABLE:
          return 'No compatible playback streams could be found for this video.';
        default:
          return fallbackMessage || 'An unexpected error occurred while loading content.';
      }
    }

    static fromError(err) {
      if (err instanceof PawTubeError) return err;
      const msg = (err && err.message) ? err.message : String(err || '');
      
      if (/abort/i.test(msg)) {
        return new PawTubeError(ErrorCodes.NETWORK_ERROR, 'Request cancelled', err, false);
      }
      if (/network|offline|failed to fetch|load failed|econnrefused/i.test(msg)) {
        return new PawTubeError(ErrorCodes.NETWORK_ERROR, msg, err, true);
      }
      if (/rate|429|too many/i.test(msg)) {
        return new PawTubeError(ErrorCodes.RATE_LIMITED, msg, err, true);
      }
      if (/unavailable|deleted|private|not found|404/i.test(msg)) {
        return new PawTubeError(ErrorCodes.VIDEO_UNAVAILABLE, msg, err, false);
      }
      if (/region|country|geo/i.test(msg)) {
        return new PawTubeError(ErrorCodes.REGION_RESTRICTED, msg, err, false);
      }
      if (/login|sign in|age|confirm/i.test(msg)) {
        return new PawTubeError(ErrorCodes.LOGIN_REQUIRED, msg, err, false);
      }
      if (/invalid.*id|invalid.*url/i.test(msg)) {
        return new PawTubeError(ErrorCodes.INVALID_URL, msg, err, false);
      }
      if (/stream/i.test(msg)) {
        return new PawTubeError(ErrorCodes.NO_STREAM_AVAILABLE, msg, err, true);
      }
      return new PawTubeError(ErrorCodes.EXTRACTION_FAILED, msg, err, true);
    }
  }

  // =========================================================================
  // 2. NORMALIZED PAWTUBE NATIVE MEDIA MODELS
  // =========================================================================

  class MediaThumbnail {
    constructor(url, width = 0, height = 0) {
      this.url = url || '';
      this.width = width;
      this.height = height;
    }
  }

  class MediaAuthor {
    constructor(id = '', name = '', avatar = '', subscribers = 0, verified = false) {
      this.id = id;
      this.name = name || 'Unknown Channel';
      this.avatar = avatar || '';
      this.subscribers = subscribers;
      this.verified = Boolean(verified);
    }
  }

  class StreamInfo {
    constructor({
      id = '',
      title = '',
      embedUrl = '',
      videoStreams = [],
      audioStreams = [],
      subtitles = [],
      isLive = false,
      hlsUrl = '',
      dashUrl = ''
    } = {}) {
      this.id = id;
      this.title = title;
      this.embedUrl = embedUrl || `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&enablejsapi=1&rel=0`;
      this.videoStreams = videoStreams;
      this.audioStreams = audioStreams;
      this.subtitles = subtitles;
      this.isLive = isLive;
      this.hlsUrl = hlsUrl;
      this.dashUrl = dashUrl;
    }

    getBestVideoStream() {
      if (!this.videoStreams || this.videoStreams.length === 0) return null;
      return this.videoStreams[0];
    }

    getBestAudioStream() {
      if (!this.audioStreams || this.audioStreams.length === 0) return null;
      return this.audioStreams[0];
    }
  }

  class MediaItem {
    constructor({
      id = '',
      title = 'Untitled Video',
      description = '',
      author = 'Unknown Channel',
      authorId = '',
      authorAvatar = '',
      thumb = '',
      duration = 0,
      durationFormatted = '',
      views = 0,
      viewsFormatted = '',
      uploadedDate = '',
      publishedTime = '',
      isShort = false,
      isLive = false,
      verified = false,
      type = 'video',
      streamInfo = null,
      related = [],
      uploadedFormatted = ''
    } = {}) {
      this.id = id;
      this.url = `https://www.youtube.com/watch?v=${id}`;
      this.pawtubeUrl = `#/watch?v=${id}`;
      this.title = title.trim();
      this.description = description;
      this.channel = author; // alias for backwards compatibility
      this.author = author;
      this.channelId = authorId;
      this.authorId = authorId;
      this.avatar = authorAvatar;
      this.authorAvatar = authorAvatar;
      this.thumb = thumb || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '');
      this.duration = duration;
      this.durationFormatted = durationFormatted || PawTubeUtils.formatDuration(duration);
      this.views = views;
      this.viewsFormatted = viewsFormatted || PawTubeUtils.formatViews(views);
      this.uploadedDate = uploadedDate || publishedTime;
      this.publishedTime = publishedTime || uploadedDate;
      this.uploadedFormatted = uploadedFormatted || PawTubeUtils.formatUploadedDate(this.uploadedDate);
      this.isShort = isShort || (duration > 0 && duration <= 75);
      this.isLive = Boolean(isLive || duration < 0);
      this.verified = Boolean(verified);
      this.type = type;
      this.streamInfo = streamInfo;
      this.related = related;
    }
  }

  class Channel {
    constructor({
      id = '',
      name = 'Channel',
      avatar = '',
      banner = '',
      subscribers = 0,
      subscribersFormatted = '',
      description = '',
      videos = []
    } = {}) {
      this.id = id;
      this.name = name;
      this.avatar = avatar;
      this.banner = banner;
      this.subscribers = subscribers;
      this.subscribersFormatted = subscribersFormatted || PawTubeUtils.formatSubscriberCount(subscribers);
      this.description = description;
      this.videos = videos;
    }
  }

  class Playlist {
    constructor({
      id = '',
      title = 'Playlist',
      author = '',
      authorId = '',
      thumb = '',
      videoCount = 0,
      videos = []
    } = {}) {
      this.id = id;
      this.title = title;
      this.author = author;
      this.authorId = authorId;
      this.thumb = thumb;
      this.videoCount = videoCount || videos.length;
      this.videos = videos;
    }
  }

  class Comment {
    constructor({
      id = '',
      author = 'Anonymous',
      authorAvatar = '',
      content = '',
      publishedTime = '',
      likeCount = 0
    } = {}) {
      this.id = id;
      this.author = author;
      this.authorAvatar = authorAvatar;
      this.contentHtml = content; // legacy compatibility
      this.content = content;
      this.publishedText = publishedTime; // legacy compatibility
      this.publishedTime = publishedTime;
      this.likeCount = likeCount;
    }
  }

  // =========================================================================
  // 3. UTILITIES & URL PARSER
  // =========================================================================

  const PawTubeUtils = {
    formatDuration(seconds) {
      if (seconds === undefined || seconds === null) return '0:00';
      if (seconds < 0) return 'LIVE';
      const total = Math.floor(Number(seconds)) || 0;
      if (total <= 0) return '0:00';
      const h = Math.floor(total / 3600);
      const m = Math.floor((total % 3600) / 60);
      const s = total % 60;
      if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      }
      return `${m}:${s.toString().padStart(2, '0')}`;
    },

    formatViews(views) {
      if (!views) return '0 views';
      const num = typeof views === 'number' ? views : parseInt(String(views).replace(/[^0-9]/g, ''), 10);
      if (!num || isNaN(num)) return '0 views';
      if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B views';
      if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M views';
      if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K views';
      return num.toLocaleString() + ' views';
    },

    formatSubscriberCount(count) {
      if (!count) return '';
      const num = typeof count === 'number' ? count : parseInt(String(count).replace(/[^0-9]/g, ''), 10);
      if (!num || isNaN(num)) return '';
      if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M subscribers';
      if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K subscribers';
      return num.toLocaleString() + ' subscribers';
    },

    formatUploadedDate(dateVal) {
      if (!dateVal || dateVal === -1) return '';
      if (typeof dateVal === 'string') {
        const trimmed = dateVal.trim();
        if (trimmed.toLowerCase().includes('ago') || trimmed.toLowerCase() === 'live') {
          return trimmed;
        }
      }
      const num = typeof dateVal === 'number' ? dateVal : parseInt(String(dateVal), 10);
      if (num && !isNaN(num) && num > 0) {
        const ms = num < 10000000000 ? num * 1000 : num;
        const diffSec = Math.floor((Date.now() - ms) / 1000);
        if (diffSec < 60) return 'Just now';
        if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
        if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
        if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)}d ago`;
        if (diffSec < 31536000) return `${Math.floor(diffSec / 2592000)}mo ago`;
        return `${Math.floor(diffSec / 31536000)}y ago`;
      }
      return '';
    },

    /**
     * Resolves all standard YouTube URL formats, shorts, and raw IDs:
     * - https://www.youtube.com/watch?v=ID
     * - https://youtu.be/ID
     * - https://www.youtube.com/shorts/ID
     * - https://www.youtube.com/embed/ID
     * - #/watch?v=ID
     * - raw 11-char ID
     */
    extractMediaId(urlOrId) {
      if (!urlOrId || typeof urlOrId !== 'string') return null;
      const clean = urlOrId.trim();

      // 1. Raw 11-character YouTube video ID
      if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) {
        return clean;
      }

      // 2. Query param ?v=ID or &v=ID
      const vMatch = clean.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      if (vMatch) return vMatch[1];

      // 3. youtu.be/ID
      const youtuMatch = clean.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
      if (youtuMatch) return youtuMatch[1];

      // 4. /shorts/ID
      const shortsMatch = clean.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (shortsMatch) return shortsMatch[1];

      // 5. /embed/ID
      const embedMatch = clean.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      if (embedMatch) return embedMatch[1];

      // 6. Generic watch/v/ path
      const pathMatch = clean.match(/(?:watch\/|v\/)([a-zA-Z0-9_-]{11})/);
      if (pathMatch) return pathMatch[1];

      return null;
    }
  };

  // =========================================================================
  // 4. MEDIA PROVIDER INTERFACE
  // =========================================================================

  class MediaProvider {
    constructor(name) {
      this.name = name || 'BaseMediaProvider';
    }

    async getTrending(options) { throw new Error('Not implemented'); }
    async getCategoryFeed(category, options) { throw new Error('Not implemented'); }
    async getShorts(options) { throw new Error('Not implemented'); }
    async search(query, options) { throw new Error('Not implemented'); }
    async getSearchSuggestions(query, options) { throw new Error('Not implemented'); }
    async getVideoMetadata(videoId, options) { throw new Error('Not implemented'); }
    async getStreamInfo(videoId, options) { throw new Error('Not implemented'); }
    async getComments(videoId, options) { throw new Error('Not implemented'); }
    async getChannel(channelId, options) { throw new Error('Not implemented'); }
    async getChannelVideos(channelId, options) { throw new Error('Not implemented'); }
    async getPlaylist(playlistId, options) { throw new Error('Not implemented'); }
    async getInstances() { throw new Error('Not implemented'); }
  }

  // =========================================================================
  // 5. CENTRAL PIPED REQUEST ENGINE & INSTANCE MANAGEMENT
  // =========================================================================

  /**
   * Canonical Centralized Piped URL Builder
   * Strictly avoids /api/v1, double slashes, or trailing slashes.
   * Direct base URL + clean endpoint + query string.
   */
  function buildPipedUrl(baseUrl, endpoint, params = {}) {
    if (!baseUrl || typeof baseUrl !== 'string') {
      throw new Error('Base URL is required for Piped URL building');
    }
    let cleanBase = baseUrl.trim().replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(cleanBase)) {
      cleanBase = 'https://' + cleanBase;
    }
    cleanBase = cleanBase.replace(/\/api\/v1\/?$/i, '');

    let cleanEp = (endpoint || '').trim();
    if (!cleanEp.startsWith('/')) {
      cleanEp = '/' + cleanEp;
    }
    cleanEp = cleanEp.replace(/\/{2,}/g, '/');

    const [pathOnly, existingQuery] = cleanEp.split('?');
    const searchParams = new URLSearchParams(existingQuery || '');

    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null && v !== '') {
        searchParams.set(k === 'query' ? 'q' : k, String(v));
      }
    }

    const qs = searchParams.toString();
    return `${cleanBase}${pathOnly}${qs ? '?' + qs : ''}`;
  }

  // Built-in candidate Piped API instances pool (Prioritizes proven healthy instances)
  const DEFAULT_PIPED_INSTANCES = [
    'https://api.piped.private.coffee',
    'https://pipedapi.ducks.party',
    'https://pipedapi.adminforge.de',
    'https://pipedapi.nosebs.ru',
    'https://api.piped.yt',
    'https://pipedapi.drgns.space',
    'https://pipedapi.owo.si',
    'https://piped-api.codespace.cz',
    'https://pipedapi.reallyaweso.me',
    'https://pipedapi.darkness.services',
    'https://pipedapi.smnz.de'
  ];

  class PipedInstanceManager {
    constructor() {
      this.instances = [...DEFAULT_PIPED_INSTANCES];
      this.healthMap = new Map();
      this.discoveredInstances = [];
      this.isDiscovering = false;
      this.isValidating = false;

      this.instances.forEach((url) => {
        this.healthMap.set(url, {
          status: 'unknown', // 'healthy', 'degraded', 'unhealthy', 'checking', 'unknown'
          consecutiveFailures: 0,
          cooldownUntil: 0,
          latency: 0,
          lastSuccess: 0,
          lastCheck: 0
        });
      });

      // 1. Load previously discovered instances
      this.loadCachedDiscovery();
      // 2. Load recently validated health state from localStorage
      this.loadPersistedHealth();
      // 3. Proactively validate top instances in the background
      setTimeout(() => this.validateCandidates(), 100);
      // 4. Kick off background dynamic discovery check (non-blocking)
      setTimeout(() => this.discoverInstances(), 2500);
    }

    getCustomInstance() {
      try {
        const stored = localStorage.getItem('custom_piped_instance');
        if (stored) {
          let parsed = stored.trim().replace(/^"|"$/g, '');
          if (parsed.length > 0) {
            if (!/^https?:\/\//i.test(parsed)) parsed = 'https://' + parsed;
            parsed = parsed.replace(/\/+$/, '').replace(/\/api\/v1\/?$/i, '');
            return parsed;
          }
        }
      } catch (e) {}
      return null;
    }

    setCustomInstance(url) {
      if (!url || !url.trim()) {
        localStorage.removeItem('custom_piped_instance');
        return;
      }
      let clean = url.trim();
      if (!/^https?:\/\//i.test(clean)) clean = 'https://' + clean;
      clean = clean.replace(/\/+$/, '').replace(/\/api\/v1\/?$/i, '');
      localStorage.setItem('custom_piped_instance', clean);
      this.healthMap.set(clean, {
        status: 'healthy',
        consecutiveFailures: 0,
        cooldownUntil: 0,
        latency: 0,
        lastSuccess: Date.now(),
        lastCheck: Date.now()
      });
      this.persistHealthMap();
      // Validate custom instance immediately
      this.validateInstance(clean, 3500);
    }

    resetCustomInstance() {
      localStorage.removeItem('custom_piped_instance');
    }

    loadPersistedHealth() {
      try {
        const raw = localStorage.getItem('pawtube_piped_instances_health');
        if (raw) {
          const parsed = JSON.parse(raw);
          const now = Date.now();
          if (parsed && typeof parsed === 'object') {
            for (const [url, data] of Object.entries(parsed)) {
              // Retain health status verified within the last 20 minutes
              if (data && now - (data.lastCheck || 0) < 1200000) {
                this.healthMap.set(url, {
                  status: data.status || 'unknown',
                  consecutiveFailures: data.consecutiveFailures || 0,
                  cooldownUntil: data.cooldownUntil || 0,
                  latency: data.latency || 0,
                  lastSuccess: data.lastSuccess || 0,
                  lastCheck: data.lastCheck || 0
                });
              }
            }
          }
        }
      } catch (e) {}
    }

    persistHealthMap() {
      try {
        const obj = {};
        for (const [url, h] of this.healthMap.entries()) {
          if (h.status === 'healthy' || h.consecutiveFailures > 0) {
            obj[url] = {
              status: h.status,
              consecutiveFailures: h.consecutiveFailures,
              cooldownUntil: h.cooldownUntil,
              latency: h.latency,
              lastSuccess: h.lastSuccess,
              lastCheck: h.lastCheck
            };
          }
        }
        localStorage.setItem('pawtube_piped_instances_health', JSON.stringify(obj));
      } catch (e) {}
    }

    loadCachedDiscovery() {
      try {
        const raw = localStorage.getItem('pawtube_discovered_piped_instances');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.instances)) {
            parsed.instances.forEach((url) => {
              if (url && typeof url === 'string' && url.startsWith('https://') && !this.instances.includes(url)) {
                this.instances.push(url);
                if (!this.healthMap.has(url)) {
                  this.healthMap.set(url, {
                    status: 'unknown',
                    consecutiveFailures: 0,
                    cooldownUntil: 0,
                    latency: 0,
                    lastSuccess: 0,
                    lastCheck: 0
                  });
                }
              }
            });
          }
        }
      } catch (e) {}
    }

    async discoverInstances() {
      if (this.isDiscovering) return;
      this.isDiscovering = true;
      try {
        const discoveryEndpoints = [
          'https://piped-instances.kavin.rocks'
        ];

        for (const endpoint of discoveryEndpoints) {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 3500);
            const res = await fetch(endpoint, {
              signal: controller.signal,
              headers: { Accept: 'application/json' }
            });
            clearTimeout(timer);
            if (res.ok) {
              const list = await res.json();
              if (Array.isArray(list)) {
                const newAdditions = [];
                list.forEach((item) => {
                  const rawUrl = item.api_url || item.apiUrl || (typeof item === 'string' ? item : null);
                  if (rawUrl && typeof rawUrl === 'string' && rawUrl.startsWith('https://')) {
                    const clean = rawUrl.replace(/\/+$/, '').replace(/\/api\/v1\/?$/i, '');
                    if (!this.instances.includes(clean)) {
                      this.instances.push(clean);
                      newAdditions.push(clean);
                      if (!this.healthMap.has(clean)) {
                        this.healthMap.set(clean, {
                          status: 'unknown',
                          consecutiveFailures: 0,
                          cooldownUntil: 0,
                          latency: 0,
                          lastSuccess: 0,
                          lastCheck: 0
                        });
                      }
                    }
                  }
                });

                if (newAdditions.length > 0) {
                  localStorage.setItem('pawtube_discovered_piped_instances', JSON.stringify({
                    timestamp: Date.now(),
                    instances: this.instances
                  }));
                  // Validate newly discovered instances in background
                  this.validateCandidates(newAdditions.slice(0, 4));
                }
                break; // First successful discovery source is sufficient
              }
            }
          } catch (e) {}
        }
      } catch (err) {
        // Discovery failure is non-blocking; retain built-in candidate pool
      } finally {
        this.isDiscovering = false;
      }
    }

    /**
     * Active validation of a single Piped instance using /trending endpoint
     */
    async validateInstance(url, timeoutMs = 3500) {
      if (!url || !url.startsWith('https://')) return false;
      const h = this.healthMap.get(url) || {
        status: 'checking',
        consecutiveFailures: 0,
        cooldownUntil: 0,
        latency: 0,
        lastSuccess: 0,
        lastCheck: Date.now()
      };
      h.status = 'checking';
      h.lastCheck = Date.now();

      const startTime = Date.now();
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const targetUrl = buildPipedUrl(url, '/trending', { region: 'US' });
        const res = await fetch(targetUrl, {
          signal: controller.signal,
          headers: { Accept: 'application/json' }
        });
        clearTimeout(timer);
        const latency = Date.now() - startTime;

        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = await res.json();
          const items = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : null);
          if (items && items.length > 0) {
            h.status = 'healthy';
            h.consecutiveFailures = 0;
            h.cooldownUntil = 0;
            h.latency = latency;
            h.lastSuccess = Date.now();
            this.healthMap.set(url, h);
            this.persistHealthMap();

            // Populate trending cache directly from successful health check probe
            const trendingKey = `/trending_{"region":"US"}`;
            if (!pipedCache.has(trendingKey)) {
              pipedCache.set(trendingKey, { data, timestamp: Date.now() });
            }
            return true;
          }
        }
        throw new Error(`Instance response status ${res.status} or invalid payload`);
      } catch (err) {
        h.consecutiveFailures += 1;
        h.status = h.consecutiveFailures >= 2 ? 'unhealthy' : 'degraded';
        h.cooldownUntil = Date.now() + Math.min(180000, 30000 * h.consecutiveFailures);
        this.healthMap.set(url, h);
        this.persistHealthMap();
        return false;
      }
    }

    /**
     * Validates candidate instances in parallel
     */
    async validateCandidates(candidatesToProbe = null) {
      if (this.isValidating) return;
      this.isValidating = true;
      try {
        const targets = candidatesToProbe || this.instances.slice(0, 5);
        await Promise.allSettled(targets.map((u) => this.validateInstance(u, 3500)));
      } finally {
        this.isValidating = false;
      }
    }

    markSuccess(url, latencyMs) {
      const h = this.healthMap.get(url) || {
        status: 'healthy',
        consecutiveFailures: 0,
        cooldownUntil: 0,
        latency: 0,
        lastSuccess: 0,
        lastCheck: 0
      };
      h.status = 'healthy';
      h.consecutiveFailures = 0;
      h.cooldownUntil = 0;
      h.lastSuccess = Date.now();
      h.latency = h.latency === 0 ? latencyMs : Math.round(h.latency * 0.7 + latencyMs * 0.3);
      this.healthMap.set(url, h);
      this.persistHealthMap();
    }

    markFailure(url) {
      const h = this.healthMap.get(url) || {
        status: 'unknown',
        consecutiveFailures: 0,
        cooldownUntil: 0,
        latency: 0,
        lastSuccess: 0,
        lastCheck: 0
      };
      h.consecutiveFailures += 1;
      h.status = h.consecutiveFailures >= 2 ? 'unhealthy' : 'degraded';
      const cooldown = Math.min(180000, 30000 * h.consecutiveFailures);
      h.cooldownUntil = Date.now() + cooldown;
      this.healthMap.set(url, h);
      this.persistHealthMap();
    }

    getCandidateInstances() {
      const now = Date.now();
      const custom = this.getCustomInstance();
      const candidates = [];

      // Priority 1: User custom instance
      if (custom) {
        candidates.push(custom);
      }

      // Priority 2: Healthy instances sorted by latency (fastest first)
      const pool = [...this.instances];
      const healthy = pool.filter((u) => {
        if (u === custom) return false;
        const h = this.healthMap.get(u);
        return h && h.status === 'healthy' && now > (h.cooldownUntil || 0);
      }).sort((a, b) => {
        const ha = this.healthMap.get(a)?.latency || 9999;
        const hb = this.healthMap.get(b)?.latency || 9999;
        return ha - hb;
      });
      candidates.push(...healthy);

      // Priority 3: First 2 unknown candidate instances for rapid exploration
      const unknown = pool.filter((u) => {
        if (u === custom || candidates.includes(u)) return false;
        const h = this.healthMap.get(u);
        return (!h || h.status === 'unknown') && now > (h?.cooldownUntil || 0);
      });
      candidates.push(...unknown.slice(0, 2));

      // Priority 4: High-reliability local server proxy (Cloud Run backend with multi-instance retry & fallback)
      candidates.push('__LOCAL_PROXY__');

      // Priority 5: Remaining unknown instances
      candidates.push(...unknown.slice(2));

      // Priority 6: Degraded instances whose cooldown expired
      const degraded = pool.filter((u) => {
        if (u === custom || candidates.includes(u)) return false;
        const h = this.healthMap.get(u);
        return h && (h.status === 'degraded' || h.status === 'unhealthy') && now > (h.cooldownUntil || 0);
      });
      candidates.push(...degraded);

      return candidates;
    }

    getInstances() {
      const now = Date.now();
      return this.instances.map((url) => {
        const h = this.healthMap.get(url) || { status: 'unknown', consecutiveFailures: 0, cooldownUntil: 0, latency: 0, lastCheck: 0 };
        return {
          url,
          status: h.status,
          healthy: h.status === 'healthy' && now > (h.cooldownUntil || 0),
          failures: h.consecutiveFailures,
          latency: h.latency,
          lastCheck: h.lastCheck
        };
      });
    }
  }

  const pipedInstanceManager = new PipedInstanceManager();

  // Central Request Engine Caches & In-Flight Tracker
  const pipedCache = new Map();
  const pipedInFlight = new Map();

  /**
   * Central Piped Request Engine
   * Requirement 8: Create ONE central function requestPiped(endpoint, options).
   * Every Piped request must pass through it.
   */
  async function requestPiped(endpoint, options = {}) {
    const { params = {}, signal, timeoutMs = 3800, skipCache = false, ttlMs = 45000 } = options;

    if (signal && signal.aborted) {
      throw new PawTubeError(ErrorCodes.NETWORK_ERROR, 'Request was aborted', null, false);
    }

    // 1. In-memory Short-Lived Caching
    const cacheKey = `${endpoint}_${JSON.stringify(params)}`;
    const now = Date.now();
    if (!skipCache && pipedCache.has(cacheKey)) {
      const entry = pipedCache.get(cacheKey);
      if (now - entry.timestamp < ttlMs) {
        return entry.data;
      }
      pipedCache.delete(cacheKey);
    }

    // 2. In-Flight Request Deduplication
    if (pipedInFlight.has(cacheKey)) {
      return pipedInFlight.get(cacheKey);
    }

    const executeRequest = async () => {
      const candidates = pipedInstanceManager.getCandidateInstances();
      let lastError = null;

      for (const instance of candidates) {
        if (signal && signal.aborted) {
          throw new PawTubeError(ErrorCodes.NETWORK_ERROR, 'Request aborted', null, false);
        }

        let targetUrl;
        if (instance === '__LOCAL_PROXY__') {
          const qs = new URLSearchParams();
          const cleanEp = endpoint.replace(/^\//, '');
          const [pathPart, queryPart] = cleanEp.split('?');
          qs.set('endpoint', pathPart);
          if (queryPart) {
            const extra = new URLSearchParams(queryPart);
            for (const [k, v] of extra.entries()) qs.set(k, v);
          }
          for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null && v !== '') {
              qs.set(k === 'query' ? 'q' : k, String(v));
            }
          }
          const custom = pipedInstanceManager.getCustomInstance();
          if (custom) qs.set('instance', custom);
          targetUrl = `/api/unified?${qs.toString()}`;
        } else {
          try {
            targetUrl = buildPipedUrl(instance, endpoint, params);
          } catch (e) {
            continue;
          }
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        if (signal) {
          signal.addEventListener('abort', () => controller.abort(), { once: true });
        }

        const startTime = Date.now();
        try {
          const res = await fetch(targetUrl, {
            signal: controller.signal,
            headers: { Accept: 'application/json' }
          });
          clearTimeout(timer);

          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }

          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            // Some proxies or captive portals return HTML on errors
            const text = await res.text();
            if (text.startsWith('<')) {
              throw new Error('Received HTML response instead of JSON');
            }
            try {
              const parsed = JSON.parse(text);
              if (parsed.error) throw new Error(parsed.error);
              if (instance !== '__LOCAL_PROXY__') {
                pipedInstanceManager.markSuccess(instance, Date.now() - startTime);
              }
              pipedCache.set(cacheKey, { data: parsed, timestamp: Date.now() });
              return parsed;
            } catch (e) {
              throw new Error('Malformed JSON response');
            }
          }

          const data = await res.json();
          if (data && data.error) {
            throw new Error(data.error);
          }

          // Authoritative Success: Real API request succeeded!
          if (instance !== '__LOCAL_PROXY__') {
            pipedInstanceManager.markSuccess(instance, Date.now() - startTime);
          }

          pipedCache.set(cacheKey, { data, timestamp: Date.now() });
          return data;
        } catch (err) {
          clearTimeout(timer);
          if (instance !== '__LOCAL_PROXY__') {
            pipedInstanceManager.markFailure(instance);
          }
          lastError = err;
          if (signal && signal.aborted) {
            throw PawTubeError.fromError(err);
          }
          // Continue to next candidate immediately without waiting
        }
      }

      throw PawTubeError.fromError(lastError || new Error('All Piped instances failed to respond'));
    };

    const promise = executeRequest().finally(() => {
      pipedInFlight.delete(cacheKey);
    });

    pipedInFlight.set(cacheKey, promise);
    return promise;
  }

  // =========================================================================
  // 5B. NEWPIPEEXTRACTOR PROVIDER IMPLEMENTATION
  // =========================================================================

  class NewPipeExtractorProvider extends MediaProvider {
    constructor() {
      super('NewPipeExtractor');
      this.instanceManager = pipedInstanceManager;
    }

    getCustomInstance() {
      return this.instanceManager.getCustomInstance();
    }

    setCustomInstance(url) {
      return this.instanceManager.setCustomInstance(url);
    }

    resetCustomInstance() {
      return this.instanceManager.resetCustomInstance();
    }

    getCandidateInstances() {
      return this.instanceManager.getCandidateInstances();
    }

    async request(endpoint, options = {}) {
      return requestPiped(endpoint, options);
    }

    normalizeItem(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const cleanId = PawTubeUtils.extractMediaId(raw.id || raw.videoId || raw.url);
      if (!cleanId) return null;

      let channelId = '';
      if (raw.authorId) {
        channelId = raw.authorId;
      } else if (raw.uploaderUrl) {
        channelId = raw.uploaderUrl.replace(/^\/channel\//, '');
      } else if (raw.channelId || raw.uploaderId) {
        channelId = raw.channelId || raw.uploaderId;
      }

      const duration = typeof raw.duration === 'number' ? raw.duration : (parseInt(raw.duration, 10) || 0);
      let views = raw.views;
      if (typeof views === 'string') {
        views = parseInt(views.replace(/[^0-9]/g, ''), 10) || 0;
      } else if (typeof views !== 'number') {
        views = 0;
      }

      return new MediaItem({
        id: cleanId,
        title: raw.title || 'Untitled Video',
        description: raw.description || '',
        author: raw.author || raw.uploaderName || raw.uploader || raw.channel || 'Unknown Channel',
        authorId: channelId,
        authorAvatar: raw.authorAvatar || raw.uploaderAvatar || raw.avatar || '',
        thumb: raw.thumb || raw.thumbnail || raw.thumbnailUrl || `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`,
        duration: duration,
        durationFormatted: raw.durationFormatted || PawTubeUtils.formatDuration(duration),
        views: views,
        viewsFormatted: raw.viewsFormatted || PawTubeUtils.formatViews(views),
        uploadedDate: raw.uploadedDate || raw.uploadDate || raw.uploaded || '',
        publishedTime: raw.publishedTime || raw.uploadedDate || raw.uploadDate || '',
        uploadedFormatted: raw.uploadedFormatted || PawTubeUtils.formatUploadedDate(raw.uploadedDate || raw.uploadDate || raw.uploaded || raw.publishedTime),
        isShort: duration > 0 && duration <= 75,
        isLive: Boolean(raw.isLive || raw.live || duration < 0),
        verified: Boolean(raw.uploaderVerified || raw.verified),
        type: raw.type || 'video'
      });
    }

    async getTrending(options = {}) {
      const region = options.region || 'US';
      const raw = await this.request('/trending', { ...options, params: { region } });
      const items = Array.isArray(raw) ? raw : (raw.items || []);
      return items.map(this.normalizeItem.bind(this)).filter(Boolean);
    }

    async getCategoryFeed(category, options = {}) {
      if (!category || category === 'All' || category === 'Trending') {
        return this.getTrending(options);
      }
      const supported = ['Music', 'Gaming', 'News', 'Movies'];
      if (supported.includes(category)) {
        try {
          const raw = await this.request('/trending', { ...options, params: { region: 'US', type: category } });
          const items = (Array.isArray(raw) ? raw : (raw.items || [])).map(this.normalizeItem.bind(this)).filter(Boolean);
          if (items.length > 0) return items;
        } catch (e) {}
      }

      const queryMap = {
        Tech: 'technology reviews gadgets software',
        Education: 'educational science documentary history',
        Music: 'official music video trending songs',
        Gaming: 'gameplay walkthrough gaming'
      };
      const q = queryMap[category] || `${category} popular`;
      return this.search(q, options);
    }

    async getShorts(options = {}) {
      const queries = ['#shorts', 'shorts viral', 'funny shorts', 'youtube shorts'];
      const page = options.page || 1;
      const q = queries[(page - 1) % queries.length];
      try {
        const results = await this.search(q, { ...options, page });
        const shorts = results.filter((v) => v.isShort || /#shorts/i.test(v.title) || (v.duration > 0 && v.duration <= 90));
        if (shorts.length > 0) return shorts;
        if (results.length > 0) return results.slice(0, 10);
      } catch (err) {}

      try {
        const fallback = await this.getTrending(options);
        const shortTrend = fallback.filter((v) => v.duration > 0 && v.duration <= 90);
        if (shortTrend.length > 0) return shortTrend;
        return fallback.slice(0, 8);
      } catch (e) {
        return [];
      }
    }

    async search(query, options = {}) {
      if (!query || !query.trim()) return [];
      const filter = options.filter || 'all';
      const raw = await this.request('/search', { ...options, params: { q: query.trim(), filter } });
      const list = Array.isArray(raw) ? raw : (raw.items || []);

      return list.map((item) => {
        if (!item) return null;
        if (item.type === 'channel') {
          return new MediaItem({
            id: item.url ? item.url.replace(/^\/channel\//, '') : (item.id || ''),
            title: item.name || item.title || 'Channel',
            author: item.name || 'Channel',
            authorAvatar: item.thumbnail || '',
            thumb: item.thumbnail || '',
            viewsFormatted: PawTubeUtils.formatSubscriberCount(item.subscribers),
            verified: Boolean(item.verified),
            type: 'channel'
          });
        }
        if (item.type === 'playlist') {
          return new MediaItem({
            id: item.url ? item.url.replace(/^\/playlist\?list=/, '') : (item.id || ''),
            title: item.name || item.title || 'Playlist',
            author: item.uploaderName || '',
            thumb: item.thumbnail || '',
            durationFormatted: `${item.videos || 0} videos`,
            type: 'playlist'
          });
        }
        return this.normalizeItem(item);
      }).filter(Boolean);
    }

    async getSearchSuggestions(query, options = {}) {
      if (!query || !query.trim()) return [];
      try {
        const raw = await this.request('/opensearch/suggestions', {
          ...options,
          params: { query: query.trim() },
          timeoutMs: 3000
        });
        if (Array.isArray(raw) && Array.isArray(raw[1])) {
          return raw[1];
        }
        return [];
      } catch (e) {
        return [];
      }
    }

    async getVideoMetadata(videoId, options = {}) {
      const cleanId = PawTubeUtils.extractMediaId(videoId);
      if (!cleanId) {
        throw new PawTubeError(ErrorCodes.INVALID_URL, `Invalid video ID: ${videoId}`);
      }

      try {
        const raw = await this.request(`/streams/${encodeURIComponent(cleanId)}`, options);
        const data = raw.video ? raw.video : raw;

        const formats = (data.videoStreams || []).concat(data.audioStreams || []);
        const streamInfo = new StreamInfo({
          id: cleanId,
          title: data.title,
          embedUrl: `https://www.youtube-nocookie.com/embed/${cleanId}?autoplay=1&enablejsapi=1&rel=0`,
          videoStreams: (data.videoStreams || []).map((s) => ({
            url: s.url,
            quality: s.quality || 'unknown',
            mimeType: s.mimeType,
            bitrate: s.bitrate,
            width: s.width,
            height: s.height
          })),
          audioStreams: (data.audioStreams || []).map((s) => ({
            url: s.url,
            quality: s.quality || 'unknown',
            mimeType: s.mimeType,
            bitrate: s.bitrate,
            format: s.format
          })),
          subtitles: data.subtitles || [],
          isLive: Boolean(data.live || data.isLive)
        });

        const related = (data.relatedStreams || data.related || []).map(this.normalizeItem.bind(this)).filter(Boolean);

        return new MediaItem({
          id: cleanId,
          title: data.title || 'YouTube Video',
          description: data.description || '',
          author: data.author || data.uploader || data.channel || data.uploaderName || 'Unknown Channel',
          authorId: data.authorId || (data.uploaderUrl ? data.uploaderUrl.replace(/^\/channel\//, '') : (data.channelId || data.uploaderId || '')),
          authorAvatar: data.authorAvatar || data.uploaderAvatar || data.avatar || '',
          thumb: data.thumb || data.thumbnailUrl || data.thumbnail || `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`,
          duration: data.duration || 0,
          views: data.views || 0,
          viewsFormatted: data.viewsFormatted || PawTubeUtils.formatViews(data.views),
          uploadedDate: data.uploadDate || data.uploadedDate || '',
          publishedTime: data.uploadDate || data.uploadedDate || '',
          isLive: streamInfo.isLive,
          streamInfo: streamInfo,
          related: related
        });
      } catch (err) {
        // Fallback to YouTube oEmbed
        try {
          const oeRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${cleanId}&format=json`, {
            signal: options.signal
          });
          if (oeRes.ok) {
            const oe = await oeRes.json();
            const streamInfo = new StreamInfo({
              id: cleanId,
              title: oe.title,
              embedUrl: `https://www.youtube-nocookie.com/embed/${cleanId}?autoplay=1&enablejsapi=1&rel=0`
            });

            return new MediaItem({
              id: cleanId,
              title: oe.title || 'YouTube Video',
              description: `Uploaded by ${oe.author_name || 'YouTube Creator'}`,
              author: oe.author_name || 'YouTube Creator',
              thumb: oe.thumbnail_url || `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`,
              streamInfo: streamInfo,
              related: []
            });
          }
        } catch (_) {}

        throw PawTubeError.fromError(err);
      }
    }

    async getStreamInfo(videoId, options = {}) {
      const meta = await this.getVideoMetadata(videoId, options);
      return meta.streamInfo || new StreamInfo({ id: meta.id, title: meta.title });
    }

    async getComments(videoId, options = {}) {
      const cleanId = PawTubeUtils.extractMediaId(videoId);
      if (!cleanId) return { comments: [] };

      try {
        const raw = await this.request(`/comments/${encodeURIComponent(cleanId)}`, options);
        const list = Array.isArray(raw.comments) ? raw.comments : (Array.isArray(raw) ? raw : []);
        const comments = list.map((c) => {
          if (!c) return null;
          return new Comment({
            id: c.commentId || String(Math.random()),
            author: c.author || 'Anonymous',
            authorAvatar: c.thumbnail || '',
            content: c.commentText || c.content || '',
            publishedTime: c.commentedTime || c.time || '',
            likeCount: c.likeCount || 0
          });
        }).filter(Boolean);
        return { comments };
      } catch (e) {
        return { comments: [] };
      }
    }

    async getChannel(channelId, options = {}) {
      const cleanId = (channelId || '').replace(/^\/channel\//, '');
      const data = await this.request(`/channel/${encodeURIComponent(cleanId)}`, options);
      const rawVideos = Array.isArray(data.relatedStreams) ? data.relatedStreams : (Array.isArray(data.videos) ? data.videos : (data.channel?.videos || []));
      const videos = rawVideos.map(this.normalizeItem.bind(this)).filter(Boolean);

      return new Channel({
        id: cleanId,
        name: data.name || (data.channel && data.channel.name) || 'Channel',
        avatar: data.avatarUrl || data.avatar || (data.channel && data.channel.avatar) || '',
        banner: data.bannerUrl || data.banner || (data.channel && data.channel.banner) || '',
        subscribers: data.subscriberCount || data.subscribers || (data.channel && data.channel.subscribers) || 0,
        subscribersFormatted: PawTubeUtils.formatSubscriberCount(data.subscriberCount || data.subscribers || (data.channel && data.channel.subscribers) || 0),
        description: data.description || (data.channel && data.channel.description) || '',
        videos: videos
      });
    }

    async getChannelVideos(channelId, options = {}) {
      const channel = await this.getChannel(channelId, options);
      return channel.videos || [];
    }

    async getPlaylist(playlistId, options = {}) {
      const cleanId = (playlistId || '').replace(/^\/playlist\?list=/, '');
      const data = await this.request(`/playlists/${encodeURIComponent(cleanId)}`, options);
      const rawVideos = Array.isArray(data.relatedStreams) ? data.relatedStreams : (Array.isArray(data.items) ? data.items : []);
      const videos = rawVideos.map(this.normalizeItem.bind(this)).filter(Boolean);

      return new Playlist({
        id: cleanId,
        title: data.name || 'Playlist',
        author: data.uploader || '',
        videoCount: data.videos || videos.length,
        videos: videos
      });
    }

    async getInstances() {
      return this.instanceManager.getInstances();
    }
  }

  // =========================================================================
  // 6. CENTRAL PAWTUBE MEDIA SERVICE
  // =========================================================================

  class PawTubeMediaService {
    constructor(provider = null) {
      this.provider = provider || new NewPipeExtractorProvider();
      this.cache = new Map();
      this.inFlight = new Map();
      this.activeSearchAbort = null;

      // Centralized playback & media state
      this.currentMedia = null;
      this.currentStream = null;
      this.playbackState = 'idle'; // 'idle', 'loading', 'playing', 'paused', 'error'
      this.playbackPosition = 0;
      this.duration = 0;
      this.queue = [];
      this.queueIndex = -1;
    }

    setProvider(provider) {
      if (provider instanceof MediaProvider) {
        this.provider = provider;
        this.cache.clear();
      }
    }

    async cachedRequest(key, fetcher, ttlMs = 45000) {
      const now = Date.now();
      if (this.cache.has(key)) {
        const entry = this.cache.get(key);
        if (now - entry.timestamp < ttlMs) {
          return entry.data;
        }
        this.cache.delete(key);
      }

      if (this.inFlight.has(key)) {
        return this.inFlight.get(key);
      }

      const p = (async () => {
        try {
          const data = await fetcher();
          this.cache.set(key, { data, timestamp: Date.now() });
          return data;
        } finally {
          this.inFlight.delete(key);
        }
      })();

      this.inFlight.set(key, p);
      return p;
    }

    async getTrending(options = {}) {
      const key = `trending_${options.region || 'US'}`;
      return this.cachedRequest(key, () => this.provider.getTrending(options), 60000);
    }

    async getCategoryFeed(category, options = {}) {
      const key = `cat_${category}_${options.region || 'US'}`;
      return this.cachedRequest(key, () => this.provider.getCategoryFeed(category, options), 60000);
    }

    async getShorts(options = {}) {
      const key = `shorts_p${options.page || 1}`;
      return this.cachedRequest(key, () => this.provider.getShorts(options), 45000);
    }

    async search(query, options = {}) {
      const clean = (query || '').trim();
      if (!clean) return [];
      const key = `search_${clean.toLowerCase()}_${options.filter || 'all'}`;
      return this.cachedRequest(key, () => this.provider.search(clean, options), 60000);
    }

    async getSearchSuggestions(query) {
      const clean = (query || '').trim();
      if (!clean) return [];
      const key = `sug_${clean.toLowerCase()}`;
      return this.cachedRequest(key, () => this.provider.getSearchSuggestions(clean), 120000);
    }

    cancelSearch() {
      if (this.activeSearchAbort) {
        this.activeSearchAbort.abort();
        this.activeSearchAbort = null;
      }
    }

    getSearchAbortSignal() {
      this.cancelSearch();
      this.activeSearchAbort = new AbortController();
      return this.activeSearchAbort.signal;
    }

    async getVideoMetadata(videoId, options = {}) {
      const cleanId = PawTubeUtils.extractMediaId(videoId);
      if (!cleanId) throw new PawTubeError(ErrorCodes.INVALID_URL, `Invalid video identifier: ${videoId}`);
      const key = `video_${cleanId}`;
      return this.cachedRequest(key, () => this.provider.getVideoMetadata(cleanId, options), 300000);
    }

    async getStreamInfo(videoId, options = {}) {
      const cleanId = PawTubeUtils.extractMediaId(videoId);
      if (!cleanId) throw new PawTubeError(ErrorCodes.INVALID_URL, `Invalid video identifier: ${videoId}`);
      return this.provider.getStreamInfo(cleanId, options);
    }

    async getComments(videoId, options = {}) {
      const cleanId = PawTubeUtils.extractMediaId(videoId);
      if (!cleanId) return { comments: [] };
      const key = `comments_${cleanId}`;
      return this.cachedRequest(key, () => this.provider.getComments(cleanId, options), 120000);
    }

    async getChannel(channelId, options = {}) {
      const cleanId = (channelId || '').replace(/^\/channel\//, '');
      const key = `channel_${cleanId}`;
      return this.cachedRequest(key, () => this.provider.getChannel(cleanId, options), 300000);
    }

    async getChannelVideos(channelId, options = {}) {
      const cleanId = (channelId || '').replace(/^\/channel\//, '');
      const key = `channel_v_${cleanId}`;
      return this.cachedRequest(key, () => this.provider.getChannelVideos(cleanId, options), 180000);
    }

    async getPlaylist(playlistId, options = {}) {
      const cleanId = (playlistId || '').replace(/^\/playlist\?list=/, '');
      const key = `playlist_${cleanId}`;
      return this.cachedRequest(key, () => this.provider.getPlaylist(cleanId, options), 300000);
    }

    async getInstances() {
      return this.provider.getInstances();
    }

    getCustomInstance() {
      return this.provider.getCustomInstance ? this.provider.getCustomInstance() : null;
    }

    setCustomInstance(url) {
      if (this.provider.setCustomInstance) {
        this.provider.setCustomInstance(url);
        this.cache.clear();
      }
    }

    resetCustomInstance() {
      if (this.provider.resetCustomInstance) {
        this.provider.resetCustomInstance();
        this.cache.clear();
      }
    }

    // Queue management
    setQueue(items, startIndex = 0) {
      this.queue = Array.isArray(items) ? [...items] : [];
      this.queueIndex = Math.max(-1, Math.min(this.queue.length - 1, startIndex));
    }

    getNextInQueue() {
      if (this.queue.length === 0 || this.queueIndex >= this.queue.length - 1) return null;
      this.queueIndex += 1;
      return this.queue[this.queueIndex];
    }

    getPreviousInQueue() {
      if (this.queue.length === 0 || this.queueIndex <= 0) return null;
      this.queueIndex -= 1;
      return this.queue[this.queueIndex];
    }
  }

  // =========================================================================
  // 7. PLAYER ADAPTER
  // =========================================================================

  class PlayerAdapter {
    constructor(mediaService, playerInstance) {
      this.mediaService = mediaService;
      this.player = playerInstance;
    }

    setPlayer(playerInstance) {
      this.player = playerInstance;
    }

    /**
     * Adapts normalized MediaItem and StreamInfo to the active player.
     */
    async playMedia(mediaItem, streamInfo = null, options = {}) {
      if (!this.player) {
        console.warn('[PlayerAdapter] Player instance not registered');
        return false;
      }

      const item = mediaItem instanceof MediaItem ? mediaItem : new MediaItem(mediaItem);
      this.mediaService.currentMedia = item;
      this.mediaService.playbackState = 'loading';

      let stream = streamInfo;
      if (!stream && item.id) {
        try {
          stream = await this.mediaService.getStreamInfo(item.id);
        } catch (e) {
          stream = new StreamInfo({ id: item.id, title: item.title });
        }
      }
      this.mediaService.currentStream = stream;

      const loaded = this.player.loadVideo(item.id, {
        ...options,
        title: item.title,
        author: item.author,
        thumb: item.thumb
      });

      if (loaded) {
        this.mediaService.playbackState = 'playing';
      } else {
        this.mediaService.playbackState = 'error';
      }

      return loaded;
    }
  }

  // =========================================================================
  // 8. GLOBAL EXPORTS
  // =========================================================================

  const mediaService = new PawTubeMediaService();
  const playerAdapter = new PlayerAdapter(mediaService, null);

  window.PawTubeError = PawTubeError;
  window.PawTubeErrorCodes = ErrorCodes;
  window.PawTubeUtils = PawTubeUtils;
  window.buildPipedUrl = buildPipedUrl;
  window.requestPiped = requestPiped;
  window.pipedInstanceManager = pipedInstanceManager;
  window.MediaItem = MediaItem;
  window.Channel = Channel;
  window.Playlist = Playlist;
  window.StreamInfo = StreamInfo;
  window.Comment = Comment;
  window.MediaThumbnail = MediaThumbnail;
  window.MediaAuthor = MediaAuthor;
  window.MediaProvider = MediaProvider;
  window.NewPipeExtractorProvider = NewPipeExtractorProvider;
  window.PawTubeMediaService = PawTubeMediaService;
  window.PlayerAdapter = PlayerAdapter;
  window.pawtubeMediaService = mediaService;
  window.pawtubePlayerAdapter = playerAdapter;

  // Backward compatibility alias for any existing code
  window.PawTubeAPI = {
    buildPipedUrl: buildPipedUrl,
    requestPiped: requestPiped,
    formatDuration: PawTubeUtils.formatDuration,
    formatViews: PawTubeUtils.formatViews,
    formatSubscriberCount: PawTubeUtils.formatSubscriberCount,
    extractVideoId: PawTubeUtils.extractMediaId,
    getTrending: (opt) => mediaService.getTrending(opt),
    getCategoryFeed: (cat, opt) => mediaService.getCategoryFeed(cat, opt),
    getShorts: (opt) => mediaService.getShorts(opt),
    search: (q, opt) => mediaService.search(q, opt),
    getSearchSuggestions: (q) => mediaService.getSearchSuggestions(q),
    getVideoMetadata: (id, opt) => mediaService.getVideoMetadata(id, opt),
    getVideoInfo: async (id, opt) => ({ video: await mediaService.getVideoMetadata(id, opt), instance: 'newpipe' }),
    getComments: (id, opt) => mediaService.getComments(id, opt),
    getChannel: (id, opt) => mediaService.getChannel(id, opt),
    getChannelVideos: (id, opt) => mediaService.getChannelVideos(id, opt),
    getPlaylist: (id, opt) => mediaService.getPlaylist(id, opt),
    getInstances: () => mediaService.getInstances(),
    getCustomInstance: () => mediaService.getCustomInstance(),
    setCustomInstance: (url) => mediaService.setCustomInstance(url),
    resetCustomInstance: () => mediaService.resetCustomInstance()
  };
})();
