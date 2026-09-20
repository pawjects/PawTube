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
      related = []
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
  // 5. NEWPIPEEXTRACTOR PROVIDER IMPLEMENTATION
  // =========================================================================

  class NewPipeExtractorProvider extends MediaProvider {
    constructor() {
      super('NewPipeExtractor');

      // Verified instances running NewPipeExtractor-compatible backend gateways
      this.instances = [
        'https://api.piped.private.coffee',
        'https://pipedapi.ducks.party',
        'https://pipedapi.drgns.space',
        'https://pipedapi.kavin.rocks'
      ];

      this.instanceHealth = new Map();
      this.instances.forEach((url) => {
        this.instanceHealth.set(url, { failures: 0, cooldownUntil: 0, latency: 0 });
      });
    }

    getCustomInstance() {
      try {
        const stored = localStorage.getItem('custom_piped_instance');
        if (stored) {
          let parsed = stored.trim().replace(/^"|"$/g, '');
          if (parsed.length > 0) {
            if (!parsed.startsWith('http')) parsed = 'https://' + parsed;
            return parsed.replace(/\/+$/, '');
          }
        }
      } catch (e) {}
      return null;
    }

    setCustomInstance(url) {
      if (!url) {
        localStorage.removeItem('custom_piped_instance');
        return;
      }
      let clean = url.trim();
      if (!clean.startsWith('http')) clean = 'https://' + clean;
      clean = clean.replace(/\/+$/, '');
      localStorage.setItem('custom_piped_instance', clean);
    }

    resetCustomInstance() {
      localStorage.removeItem('custom_piped_instance');
    }

    getCandidateInstances() {
      const candidates = ['__LOCAL_PROXY__'];
      const custom = this.getCustomInstance();
      if (custom && !candidates.includes(custom)) {
        candidates.push(custom);
      }

      this.instances.forEach((url) => {
        if (!candidates.includes(url)) {
          candidates.push(url);
        }
      });

      return candidates;
    }

    markSuccess(url, latencyMs) {
      const h = this.instanceHealth.get(url);
      if (h) {
        h.failures = 0;
        h.cooldownUntil = 0;
        h.latency = h.latency === 0 ? latencyMs : Math.round(h.latency * 0.7 + latencyMs * 0.3);
      }
    }

    markFailure(url) {
      const h = this.instanceHealth.get(url);
      if (h) {
        h.failures += 1;
        const cooldown = Math.min(120000, 30000 * h.failures);
        h.cooldownUntil = Date.now() + cooldown;
      }
    }

    async request(endpoint, options = {}) {
      const { params = {}, signal, timeoutMs = 6000 } = options;
      const candidates = this.getCandidateInstances();
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
          const custom = this.getCustomInstance();
          if (custom) qs.set('instance', custom);
          targetUrl = `/api/unified?${qs.toString()}`;
        } else {
          let cleanEp = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
          const [pathOnly, existingQuery] = cleanEp.split('?');
          const qs = new URLSearchParams(existingQuery || '');
          for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
          }
          const qsStr = qs.toString();
          targetUrl = `${instance}${pathOnly}${qsStr ? '?' + qsStr : ''}`;
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

          const data = await res.json();
          if (data && data.error) {
            throw new Error(data.error);
          }

          if (instance !== '__LOCAL_PROXY__') {
            this.markSuccess(instance, Date.now() - startTime);
          }
          return data;
        } catch (err) {
          clearTimeout(timer);
          if (instance !== '__LOCAL_PROXY__') {
            this.markFailure(instance);
          }
          lastError = err;
          if (signal && signal.aborted) {
            throw PawTubeError.fromError(err);
          }
        }
      }

      throw PawTubeError.fromError(lastError || new Error('All extractor instances failed'));
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
      return this.instances.map((url) => {
        const h = this.instanceHealth.get(url) || { failures: 0, cooldownUntil: 0, latency: 0 };
        return {
          url,
          healthy: Date.now() >= h.cooldownUntil,
          failures: h.failures,
          latency: h.latency
        };
      });
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
    getInstances: () => mediaService.getInstances()
  };
})();
