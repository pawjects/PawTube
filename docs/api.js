/**
 * PawTube - Central Piped API Engine & Data Normalizer
 * Provides resilient multi-instance failover, request deduplication,
 * in-memory caching, strict URL validation, and graceful normalization.
 */

(function () {
  'use strict';

  // Verified default healthy Piped instances pool
  const DEFAULT_INSTANCES = [
    'https://api.piped.private.coffee',
    'https://pipedapi.ducks.party',
    'https://pipedapi.drgns.space',
    'https://pipedapi.kavin.rocks'
  ];

  // In-flight request deduplication map
  const inFlightRequests = new Map();

  // Short-term in-memory cache map { key: { data, timestamp } }
  const apiCache = new Map();
  const CACHE_TTL_MS = 30000; // 30 seconds

  // Instance health tracker { url: { consecutiveFailures, cooldownUntil } }
  const instanceHealth = new Map();

  function getInstanceHealth(url) {
    if (!instanceHealth.has(url)) {
      instanceHealth.set(url, { consecutiveFailures: 0, cooldownUntil: 0 });
    }
    return instanceHealth.get(url);
  }

  function markInstanceSuccess(url) {
    const health = getInstanceHealth(url);
    health.consecutiveFailures = 0;
    health.cooldownUntil = 0;
  }

  function markInstanceFailure(url) {
    const health = getInstanceHealth(url);
    health.consecutiveFailures += 1;
    // Cooldown duration grows with consecutive failures (30s, 60s, max 120s)
    const cooldownMs = Math.min(120000, 30000 * health.consecutiveFailures);
    health.cooldownUntil = Date.now() + cooldownMs;
    console.warn(`[PawTube API] Instance ${url} marked as failing (${health.consecutiveFailures} errors). Cooldown for ${cooldownMs / 1000}s.`);
  }

  /**
   * Normalizes a Piped API base URL:
   * - Trims whitespace
   * - Strips trailing slashes
   * - Ensures http/https protocol
   * - Prevents accidental path/query/hash contamination
   */
  function normalizeBaseUrl(raw) {
    if (!raw || typeof raw !== 'string') return '';
    let clean = raw.trim();
    if (!clean) return '';

    // Strip trailing slashes
    clean = clean.replace(/\/+$/, '');

    // Ensure valid protocol
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }

    try {
      const u = new URL(clean);
      return `${u.protocol}//${u.host}`;
    } catch (e) {
      return clean;
    }
  }

  /**
   * Central URL Builder
   * Safely constructs a clean URL without duplicated paths or bad query string encoding.
   */
  function buildPipedUrl(baseUrl, endpoint, params = {}) {
    const normalizedBase = normalizeBaseUrl(baseUrl);
    let cleanEndpoint = (endpoint || '').trim();
    if (!cleanEndpoint.startsWith('/')) {
      cleanEndpoint = '/' + cleanEndpoint;
    }

    const [pathOnly, existingQuery] = cleanEndpoint.split('?');
    const searchParams = new URLSearchParams(existingQuery || '');

    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.set(key, String(value));
      }
    }

    const qs = searchParams.toString();
    return `${normalizedBase}${pathOnly}${qs ? '?' + qs : ''}`;
  }

  /**
   * Central Formatting Helpers
   */
  function formatDuration(seconds) {
    if (seconds === undefined || seconds === null) return '0:00';
    if (seconds < 0) return 'LIVE';
    const num = Math.floor(Number(seconds)) || 0;
    if (num <= 0) return '0:00';
    const h = Math.floor(num / 3600);
    const m = Math.floor((num % 3600) / 60);
    const s = num % 60;
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function formatViews(views) {
    if (views === undefined || views === null) return '0 views';
    let num = typeof views === 'number' ? views : parseInt(String(views).replace(/[^0-9]/g, ''), 10);
    if (!num || isNaN(num)) return '0 views';
    if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B views';
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M views';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K views';
    return num.toLocaleString() + ' views';
  }

  function formatSubscriberCount(count) {
    if (!count) return '';
    let num = typeof count === 'number' ? count : parseInt(String(count).replace(/[^0-9]/g, ''), 10);
    if (!num || isNaN(num)) return '';
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M subscribers';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K subscribers';
    return num.toLocaleString() + ' subscribers';
  }

  /**
   * Central Response Normalizers
   * Never throw on missing or unexpected fields.
   */
  function normalizeVideo(v) {
    if (!v || typeof v !== 'object') return null;

    // Use canonical extractVideoId
    const extractor = window.extractVideoId || ((s) => {
      if (!s) return null;
      const m = String(s).match(/[?&]v=([a-zA-Z0-9_-]{11})/) || String(s).match(/([a-zA-Z0-9_-]{11})/);
      return m ? m[1] : null;
    });

    const rawId = v.id || v.videoId || v.url;
    const id = extractor(rawId);
    if (!id) return null;

    const title = (v.title || 'Untitled Video').trim();
    const channel = (v.uploaderName || v.uploader || v.channel || 'Unknown Channel').trim();

    let channelId = '';
    if (v.uploaderUrl) {
      channelId = v.uploaderUrl.replace(/^\/channel\//, '');
    } else if (v.channelId || v.uploaderId) {
      channelId = v.channelId || v.uploaderId;
    }

    const avatar = v.uploaderAvatar || v.avatar || '';
    const thumb = v.thumbnail || v.thumbnailUrl || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

    let views = v.views;
    if (typeof views === 'string') {
      views = parseInt(views.replace(/[^0-9]/g, ''), 10) || 0;
    } else if (typeof views !== 'number') {
      views = 0;
    }

    const duration = typeof v.duration === 'number' ? v.duration : (parseInt(v.duration, 10) || 0);
    const durationFormatted = v.durationFormatted || formatDuration(duration);
    const viewsFormatted = v.viewsFormatted || formatViews(views);
    const uploadedDate = v.uploadedDate || v.uploadDate || v.uploaded || '';

    const isShort = duration > 0 && duration <= 75;
    const isLive = Boolean(v.isLive || v.live || duration < 0);
    const verified = Boolean(v.uploaderVerified || v.verified);

    return {
      id,
      title,
      channel,
      channelId,
      avatar,
      thumb,
      views,
      viewsFormatted,
      duration,
      durationFormatted,
      uploadedDate,
      uploadedFormatted: uploadedDate,
      isShort,
      isLive,
      verified
    };
  }

  function normalizeFeed(items) {
    if (!Array.isArray(items)) return [];
    return items.map(normalizeVideo).filter(Boolean);
  }

  function normalizeSearchItem(item) {
    if (!item || typeof item !== 'object') return null;
    // Piped search returns items with type = 'stream', 'channel', 'playlist'
    if (item.type === 'channel') {
      return {
        type: 'channel',
        id: item.url ? item.url.replace(/^\/channel\//, '') : (item.id || ''),
        title: item.name || item.title || 'Unknown Channel',
        avatar: item.thumbnail || '',
        subCount: formatSubscriberCount(item.subscribers),
        verified: Boolean(item.verified)
      };
    }
    if (item.type === 'playlist') {
      return {
        type: 'playlist',
        id: item.url ? item.url.replace(/^\/playlist\?list=/, '') : (item.id || ''),
        title: item.name || item.title || 'Playlist',
        thumb: item.thumbnail || '',
        videoCount: item.videos || 0,
        channel: item.uploaderName || ''
      };
    }
    // Default to video stream item
    const norm = normalizeVideo(item);
    if (norm) {
      norm.type = 'video';
    }
    return norm;
  }

  function normalizeComments(data) {
    if (!data || typeof data !== 'object') return { comments: [] };
    const rawList = Array.isArray(data.comments) ? data.comments : (Array.isArray(data) ? data : []);
    const comments = rawList.map((c) => {
      if (!c) return null;
      return {
        author: c.author || 'Anonymous',
        contentHtml: c.commentText || c.content || '',
        publishedText: c.commentedTime || c.time || '',
        likeCount: c.likeCount || 0,
        avatar: c.thumbnail || ''
      };
    }).filter(Boolean);
    return { comments };
  }

  /**
   * Central API Request Engine
   * Executes requests with intelligent failover, timeout protection,
   * JSON response validation, and request deduplication.
   */
  async function requestPiped(endpoint, options = {}) {
    const { params = {}, signal, noCache = false, timeoutMs = 7000 } = options;

    // Build candidate instances list
    const candidateInstances = [];

    // 1. User's custom instance (if set in localStorage)
    let customInstance = null;
    try {
      const stored = localStorage.getItem('custom_piped_instance');
      if (stored) {
        let parsed = stored;
        if (parsed.startsWith('"') && parsed.endsWith('"')) {
          parsed = JSON.parse(parsed);
        }
        if (typeof parsed === 'string' && parsed.trim().length > 0) {
          customInstance = normalizeBaseUrl(parsed);
        }
      }
    } catch (e) {}

    const now = Date.now();

    if (customInstance) {
      const h = getInstanceHealth(customInstance);
      if (now >= h.cooldownUntil) {
        candidateInstances.push(customInstance);
      }
    }

    // 2. Default healthy instance pool
    DEFAULT_INSTANCES.forEach((inst) => {
      const h = getInstanceHealth(inst);
      if (now >= h.cooldownUntil && !candidateInstances.includes(inst)) {
        candidateInstances.push(inst);
      }
    });

    // 3. Fallback to all default instances if all are in cooldown
    if (candidateInstances.length === 0) {
      DEFAULT_INSTANCES.forEach((inst) => candidateInstances.push(inst));
    }

    // 4. Also append local unified backend proxy as final resilient fallback
    candidateInstances.push('__LOCAL_PROXY__');

    // Create unique cache key
    const cacheKey = `${endpoint}::${JSON.stringify(params)}`;

    if (!noCache && apiCache.has(cacheKey)) {
      const entry = apiCache.get(cacheKey);
      if (now - entry.timestamp < CACHE_TTL_MS) {
        return entry.data;
      }
      apiCache.delete(cacheKey);
    }

    // Request deduplication
    if (inFlightRequests.has(cacheKey)) {
      return inFlightRequests.get(cacheKey);
    }

    const requestPromise = (async () => {
      let lastError = null;

      for (const instance of candidateInstances) {
        // If caller's signal already aborted, terminate early
        if (signal && signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        let targetUrl;
        if (instance === '__LOCAL_PROXY__') {
          // Route through local server-side unified proxy
          let localEndpoint = endpoint;
          if (endpoint.startsWith('/trending')) localEndpoint = '/trending';
          else if (endpoint.startsWith('/search')) localEndpoint = '/search';
          else if (endpoint.startsWith('/streams/')) {
            const id = endpoint.replace('/streams/', '');
            localEndpoint = `/video?id=${encodeURIComponent(id)}`;
          } else if (endpoint.startsWith('/comments/')) {
            const id = endpoint.replace('/comments/', '');
            localEndpoint = `/comments?id=${encodeURIComponent(id)}`;
          } else if (endpoint.startsWith('/channel/')) {
            const id = endpoint.replace('/channel/', '');
            localEndpoint = `/channel?id=${encodeURIComponent(id)}`;
          } else if (endpoint.startsWith('/playlists/')) {
            const id = endpoint.replace('/playlists/', '');
            localEndpoint = `/playlist?id=${encodeURIComponent(id)}`;
          }
          targetUrl = `/api/unified${localEndpoint}`;
        } else {
          targetUrl = buildPipedUrl(instance, endpoint, params);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        // Chain with user-provided signal if present
        let combinedSignal = controller.signal;
        if (signal) {
          signal.addEventListener('abort', () => controller.abort(), { once: true });
        }

        const startTime = Date.now();
        try {
          const res = await fetch(targetUrl, {
            signal: combinedSignal,
            headers: {
              Accept: 'application/json'
            }
          });
          clearTimeout(timeoutId);

          if (!res.ok) {
            throw new Error(`HTTP ${res.status} ${res.statusText}`);
          }

          const text = await res.text();
          let json;
          try {
            json = JSON.parse(text);
          } catch (jsonErr) {
            throw new Error('Malformed JSON received from instance');
          }

          const took = Date.now() - startTime;
          console.debug(`[PawTube API] Success: ${instance}${endpoint} (${took}ms)`);

          if (instance !== '__LOCAL_PROXY__') {
            markInstanceSuccess(instance);
          }

          // Cache valid response
          apiCache.set(cacheKey, { data: json, timestamp: Date.now() });
          return json;
        } catch (err) {
          clearTimeout(timeoutId);
          const took = Date.now() - startTime;
          console.warn(`[PawTube API] Failed on ${instance} (${took}ms):`, err.message);

          if (instance !== '__LOCAL_PROXY__') {
            markInstanceFailure(instance);
          }
          lastError = err;

          // If caller aborted explicitly, do not continue failover
          if (signal && signal.aborted) {
            throw err;
          }
        }
      }

      throw lastError || new Error('All Piped API instances failed');
    })();

    inFlightRequests.set(cacheKey, requestPromise);
    try {
      return await requestPromise;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  }

  /**
   * Main PawTube API Client Object
   */
  const PawTubeAPI = {
    // Utilities
    formatDuration,
    formatViews,
    formatSubscriberCount,
    normalizeVideo,
    normalizePipedVideo: normalizeVideo, // backward-compatibility alias
    normalizeFeed,
    normalizeSearchItem,
    normalizeComments,
    buildPipedUrl,
    requestPiped,

    /**
     * Home Trending Feed
     */
    async getTrending(options = {}) {
      const region = options.region || 'US';
      const raw = await requestPiped('/trending', {
        ...options,
        params: { region }
      });
      const items = Array.isArray(raw) ? raw : (raw.items || []);
      return normalizeFeed(items);
    },

    /**
     * Category Feed
     */
    async getCategoryFeed(category, options = {}) {
      if (!category || category === 'All' || category === 'Trending') {
        return this.getTrending(options);
      }
      const trendingCategories = ['Music', 'Gaming', 'News', 'Movies'];
      if (trendingCategories.includes(category)) {
        try {
          const raw = await requestPiped('/trending', {
            ...options,
            params: { region: 'US', type: category }
          });
          const items = Array.isArray(raw) ? raw : (raw.items || []);
          const normalized = normalizeFeed(items);
          if (normalized.length > 0) return normalized;
        } catch (e) {
          // Fall through to category search
        }
      }

      const queryMap = {
        Tech: 'technology reviews gadgets coding software',
        Education: 'educational science history documentary explained',
        Music: 'official music video trending songs',
        Gaming: 'gameplay walkthrough gaming moments'
      };
      const q = queryMap[category] || `${category} popular`;
      return this.search(q, options);
    },

    /**
     * Shorts Feed
     */
    async getShorts(options = {}) {
      const queries = ['#shorts funny', '#shorts trending', '#shorts viral'];
      const page = options.page || 1;
      const selectedQuery = queries[(page - 1) % queries.length];

      try {
        const items = await this.search(selectedQuery, { ...options, page });
        const shorts = items.filter((v) => v.isShort || /#shorts/i.test(v.title));
        if (shorts.length > 0) return shorts;
        return items.slice(0, 10);
      } catch (err) {
        const items = await this.getTrending(options);
        return items.filter((v) => v.duration <= 90).slice(0, 10);
      }
    },

    /**
     * Search Videos, Channels, Playlists
     */
    async search(query, options = {}) {
      if (!query || !query.trim()) return [];
      const filter = options.filter || 'all';
      const raw = await requestPiped('/search', {
        ...options,
        params: { q: query.trim(), filter }
      });
      const items = Array.isArray(raw) ? raw : (raw.items || []);
      return items.map(normalizeSearchItem).filter(Boolean);
    },

    /**
     * Search Suggestions
     */
    async getSearchSuggestions(query) {
      if (!query || !query.trim()) return [];
      try {
        const raw = await requestPiped('/opensearch/suggestions', {
          params: { query: query.trim() },
          timeoutMs: 3000
        });
        if (Array.isArray(raw) && Array.isArray(raw[1])) {
          return raw[1];
        }
        return [];
      } catch (err) {
        return [];
      }
    },

    /**
     * Video Metadata (Title, Channel, Description, Related)
     * Completely decoupled from player playback.
     */
    async getVideoMetadata(videoId, options = {}) {
      const extractor = window.extractVideoId || ((s) => s);
      const cleanId = extractor(videoId);
      if (!cleanId) {
        throw new Error('Invalid video ID for metadata fetch');
      }

      try {
        const raw = await requestPiped(`/streams/${encodeURIComponent(cleanId)}`, options);
        const data = raw.video ? raw.video : raw;

        return {
          id: cleanId,
          title: (data.title || 'YouTube Video').trim(),
          description: data.description || '',
          channel: data.uploader || data.channel || 'Unknown Channel',
          channelId: data.uploaderUrl ? data.uploaderUrl.replace(/^\/channel\//, '') : (data.channelId || ''),
          avatar: data.uploaderAvatar || data.avatar || '',
          subCount: formatSubscriberCount(data.uploaderSubscriberCount || data.subscriberCount),
          views: data.views || 0,
          viewsFormatted: formatViews(data.views),
          likes: data.likes || 0,
          dislikes: data.dislikes || 0,
          uploadedDate: data.uploadDate || data.uploadedDate || '',
          thumb: data.thumbnailUrl || `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`,
          related: Array.isArray(data.relatedStreams) ? normalizeFeed(data.relatedStreams) : (Array.isArray(data.related) ? data.related : [])
        };
      } catch (pipedErr) {
        try {
          const oeRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${cleanId}&format=json`, {
            signal: options.signal
          });
          if (oeRes.ok) {
            const oe = await oeRes.json();
            return {
              id: cleanId,
              title: (oe.title || 'YouTube Video').trim(),
              description: `Uploaded by ${oe.author_name || 'YouTube Creator'}`,
              channel: oe.author_name || 'YouTube Creator',
              channelId: '',
              avatar: '',
              subCount: '',
              views: 0,
              viewsFormatted: '',
              likes: 0,
              dislikes: 0,
              uploadedDate: '',
              thumb: oe.thumbnail_url || `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`,
              related: []
            };
          }
        } catch (_) {}

        throw pipedErr;
      }
    },

    // Backward-compatibility alias
    async getVideoInfo(id, options = {}) {
      const meta = await this.getVideoMetadata(id, options);
      return { video: meta, instance: 'piped' };
    },

    /**
     * Comments for Video
     */
    async getComments(videoId, options = {}) {
      const extractor = window.extractVideoId || ((s) => s);
      const cleanId = extractor(videoId);
      if (!cleanId) return { comments: [] };

      const raw = await requestPiped(`/comments/${encodeURIComponent(cleanId)}`, options);
      return normalizeComments(raw);
    },

    /**
     * Channel Details
     */
    async getChannel(channelId, options = {}) {
      const cleanId = (channelId || '').replace(/^\/channel\//, '');
      const data = await requestPiped(`/channel/${encodeURIComponent(cleanId)}`, options);
      return {
        id: cleanId,
        name: data.name || 'Channel',
        avatar: data.avatarUrl || '',
        bannerUrl: data.bannerUrl || '',
        subCount: formatSubscriberCount(data.subscriberCount),
        description: data.description || ''
      };
    },

    /**
     * Channel Videos
     */
    async getChannelVideos(channelId, options = {}) {
      const cleanId = (channelId || '').replace(/^\/channel\//, '');
      const data = await requestPiped(`/channel/${encodeURIComponent(cleanId)}`, options);
      const items = Array.isArray(data.relatedStreams) ? data.relatedStreams : [];
      return normalizeFeed(items);
    },

    /**
     * Playlist Details & Items
     */
    async getPlaylist(playlistId, options = {}) {
      const cleanId = (playlistId || '').replace(/^\/playlist\?list=/, '');
      const data = await requestPiped(`/playlists/${encodeURIComponent(cleanId)}`, options);
      return {
        id: cleanId,
        title: data.name || 'Playlist',
        channel: data.uploader || '',
        videoCount: data.videos || 0,
        videos: Array.isArray(data.relatedStreams) ? normalizeFeed(data.relatedStreams) : []
      };
    },

    /**
     * Instances Status List
     */
    async getInstances() {
      return DEFAULT_INSTANCES.map((url) => {
        const h = getInstanceHealth(url);
        return {
          url,
          healthy: Date.now() >= h.cooldownUntil,
          failures: h.consecutiveFailures
        };
      });
    }
  };

  // Export globally
  window.PawTubeAPI = PawTubeAPI;
})();
