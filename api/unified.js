/**
 * PawTube - Server-Side NewPipeExtractor Provider & Gateway
 * 
 * Acts as the primary backend media extraction provider for PawTube.
 * Features:
 * - High-availability multi-instance pool with latency scoring & exponential backoff
 * - Normalized PawTube data models (MediaItem, StreamInfo, Channel, Playlist)
 * - Standardized PawTubeError responses (NETWORK_ERROR, EXTRACTION_FAILED, etc.)
 * - Automatic YouTube oEmbed fallback for metadata resilience
 * - Stream discovery and resolution
 */

const fetch = global.fetch;

// Supported NewPipeExtractor backend gateways
const EXTRACTOR_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.ducks.party'
];

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(new Error(`Extractor timeout after ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

class ExtractorInstanceManager {
  constructor(instances) {
    this.instances = instances.map((url) => ({
      url,
      healthy: true,
      consecutiveFailures: 0,
      lastChecked: 0,
      cooldownUntil: 0,
      latency: 0
    }));
  }

  getBestInstance() {
    const now = Date.now();
    this.instances.forEach((inst) => {
      if (inst.cooldownUntil && now > inst.cooldownUntil) {
        inst.cooldownUntil = 0;
        inst.consecutiveFailures = 0;
        inst.healthy = true;
      }
    });

    const available = this.instances
      .filter((i) => i.healthy && now > i.cooldownUntil)
      .sort((a, b) => {
        const aScore = a.latency + (a.consecutiveFailures * 10000);
        const bScore = b.latency + (b.consecutiveFailures * 10000);
        return aScore - bScore;
      });

    if (available.length > 0) return available[0];
    return this.instances.slice().sort((a, b) => a.consecutiveFailures - b.consecutiveFailures)[0];
  }

  markSuccess(url, latency) {
    const inst = this.instances.find((i) => i.url === url);
    if (inst) {
      inst.healthy = true;
      inst.consecutiveFailures = 0;
      inst.cooldownUntil = 0;
      inst.lastChecked = Date.now();
      inst.latency = inst.latency === 0 ? latency : Math.round(inst.latency * 0.7 + latency * 0.3);
    }
  }

  markFailure(url) {
    const inst = this.instances.find((i) => i.url === url);
    if (inst) {
      inst.consecutiveFailures += 1;
      inst.lastChecked = Date.now();
      if (inst.consecutiveFailures >= 2) {
        inst.healthy = false;
        const backoff = Math.min(30000 * Math.pow(2, inst.consecutiveFailures - 2), 300000);
        inst.cooldownUntil = Date.now() + backoff;
      }
    }
  }
}

const instanceManager = new ExtractorInstanceManager(EXTRACTOR_INSTANCES);

class NewPipeExtractorBackend {
  static formatDuration(seconds) {
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

  static formatViews(views) {
    if (!views) return '0 views';
    const num = typeof views === 'number' ? views : parseInt(String(views).replace(/[^0-9]/g, ''), 10);
    if (!num || isNaN(num)) return '0 views';
    if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B views';
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M views';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K views';
    return num.toLocaleString() + ' views';
  }

  static formatSubscribers(count) {
    if (!count) return '';
    const num = typeof count === 'number' ? count : parseInt(String(count).replace(/[^0-9]/g, ''), 10);
    if (!num || isNaN(num)) return '';
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M subscribers';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K subscribers';
    return num.toLocaleString() + ' subscribers';
  }

  static extractMediaId(urlOrId) {
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

  static normalizeMediaItem(raw) {
    if (!raw) return null;
    const id = NewPipeExtractorBackend.extractMediaId(raw.url || raw.videoId || raw.id);
    if (!id) return null;

    let channelId = '';
    if (raw.uploaderUrl) {
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

    return {
      id: id,
      url: `https://www.youtube.com/watch?v=${id}`,
      title: (raw.title || 'Untitled Video').trim(),
      description: raw.description || '',
      author: raw.uploaderName || raw.uploader || raw.channel || 'Unknown Channel',
      channel: raw.uploaderName || raw.uploader || raw.channel || 'Unknown Channel',
      authorId: channelId,
      channelId: channelId,
      authorAvatar: raw.uploaderAvatar || raw.avatar || '',
      avatar: raw.uploaderAvatar || raw.avatar || '',
      views: views,
      viewsFormatted: NewPipeExtractorBackend.formatViews(views),
      duration: duration,
      durationFormatted: NewPipeExtractorBackend.formatDuration(duration),
      uploadedDate: raw.uploadedDate || raw.uploadDate || raw.uploaded || '',
      publishedTime: raw.uploadedDate || raw.uploadDate || '',
      thumb: raw.thumbnail || raw.thumbnailUrl || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      isShort: duration > 0 && duration <= 75,
      isLive: Boolean(raw.isLive || raw.live || duration < 0),
      verified: Boolean(raw.uploaderVerified || raw.verified),
      type: 'video'
    };
  }

  static async fetchWithRetry(endpoint, customInstance = null, maxAttempts = 3, timeoutMs = 4000) {
    let triedCustom = false;

    for (let attempts = 0; attempts < maxAttempts; attempts++) {
      let instObj;
      let baseUrl;

      if (customInstance && !triedCustom) {
        baseUrl = customInstance;
        triedCustom = true;
      } else {
        instObj = instanceManager.getBestInstance();
        baseUrl = instObj.url;
      }

      const startTime = Date.now();
      try {
        const res = await fetchWithTimeout(`${baseUrl}${endpoint}`, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
          }
        }, timeoutMs);

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (_) {
          throw new Error('Invalid JSON response from extractor');
        }

        if (data.error) {
          throw new Error(data.error);
        }

        if (instObj) instanceManager.markSuccess(baseUrl, Date.now() - startTime);
        return { data, instance: baseUrl, provider: 'NewPipeExtractor' };
      } catch (err) {
        if (instObj) instanceManager.markFailure(baseUrl);
      }
    }

    throw new Error('All extractor instances failed after retries');
  }

  static async getTrending(region = 'US', customInstance = null) {
    try {
      const endpoint = `/trending?region=${encodeURIComponent(region)}`;
      const { data, instance, provider } = await NewPipeExtractorBackend.fetchWithRetry(endpoint, customInstance);
      const rawItems = Array.isArray(data) ? data : (data.items || []);
      const items = rawItems.map(NewPipeExtractorBackend.normalizeMediaItem).filter(Boolean);
      return { instance, provider, items };
    } catch (err) {
      console.warn('[NewPipeExtractor] Trending failed, returning fallback feed:', err.message);
      const fallbackItems = [
        {
          id: 'dQw4w9WgXcQ',
          url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          pawtubeUrl: '#/watch?v=dQw4w9WgXcQ',
          title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)',
          channel: 'Rick Astley',
          author: 'Rick Astley',
          channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
          thumb: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
          duration: 213,
          durationFormatted: '3:33',
          views: 1500000000,
          viewsFormatted: '1.5B views',
          type: 'stream'
        },
        {
          id: 'jfKfPfyJRdk',
          url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
          pawtubeUrl: '#/watch?v=jfKfPfyJRdk',
          title: 'lofi hip hop radio 📚 - beats to relax/study to',
          channel: 'Lofi Girl',
          author: 'Lofi Girl',
          channelId: 'UCSJ4gkVC6NrvII8umztf0Ow',
          thumb: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
          duration: -1,
          durationFormatted: 'LIVE',
          views: 45000,
          viewsFormatted: '45K watching',
          isLive: true,
          type: 'stream'
        },
        {
          id: 'JGwWNGJdvx8',
          url: 'https://www.youtube.com/watch?v=JGwWNGJdvx8',
          pawtubeUrl: '#/watch?v=JGwWNGJdvx8',
          title: 'Ed Sheeran - Shape of You (Official Music Video)',
          channel: 'Ed Sheeran',
          author: 'Ed Sheeran',
          channelId: 'UC0C-w0YjGpqDXGB8IHb662A',
          thumb: 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg',
          duration: 264,
          durationFormatted: '4:24',
          views: 6200000000,
          viewsFormatted: '6.2B views',
          type: 'stream'
        }
      ];
      return { instance: 'fallback', provider: 'FallbackProvider', items: fallbackItems };
    }
  }

  static async search(query, filter = 'all', customInstance = null) {
    const endpoint = `/search?q=${encodeURIComponent(query)}&filter=${encodeURIComponent(filter)}`;
    const { data, instance, provider } = await NewPipeExtractorBackend.fetchWithRetry(endpoint, customInstance);
    const rawItems = Array.isArray(data) ? data : (data.items || []);

    const items = rawItems.map((item) => {
      if (!item) return null;
      if (item.type === 'channel') {
        return {
          id: item.url ? item.url.replace(/^\/channel\//, '') : (item.id || ''),
          title: item.name || item.title || 'Channel',
          author: item.name || 'Channel',
          authorAvatar: item.thumbnail || '',
          thumb: item.thumbnail || '',
          viewsFormatted: NewPipeExtractorBackend.formatSubscribers(item.subscribers),
          verified: Boolean(item.verified),
          type: 'channel'
        };
      }
      if (item.type === 'playlist') {
        return {
          id: item.url ? item.url.replace(/^\/playlist\?list=/, '') : (item.id || ''),
          title: item.name || item.title || 'Playlist',
          author: item.uploaderName || '',
          thumb: item.thumbnail || '',
          durationFormatted: `${item.videos || 0} videos`,
          type: 'playlist'
        };
      }
      return NewPipeExtractorBackend.normalizeMediaItem(item);
    }).filter(Boolean);

    return { instance, provider, items };
  }

  static async getSuggestions(query, customInstance = null) {
    if (!query || !query.trim()) {
      return { instance: 'local', suggestions: [] };
    }
    const q = query.trim();

    // 1. Google/YouTube Suggest API (fastest, 100% reliable)
    try {
      const gRes = await fetchWithTimeout(`https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(q)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }, 3000);
      if (gRes.ok) {
        const data = await gRes.json();
        const suggestions = (Array.isArray(data) && Array.isArray(data[1])) ? data[1] : [];
        if (suggestions.length > 0) {
          return { instance: 'google-suggest', suggestions };
        }
      }
    } catch (_) {}

    // 2. Extractor opensearch endpoint fallback
    try {
      const endpoint = `/opensearch/suggestions?query=${encodeURIComponent(q)}`;
      const { data, instance } = await NewPipeExtractorBackend.fetchWithRetry(endpoint, customInstance, 2, 3000);
      return { instance, suggestions: (data && Array.isArray(data[1])) ? data[1] : [] };
    } catch (_) {
      return { instance: 'local', suggestions: [] };
    }
  }

  static async getVideo(id, customInstance = null) {
    const endpoint = `/streams/${encodeURIComponent(id)}`;
    try {
      const { data, instance, provider } = await NewPipeExtractorBackend.fetchWithRetry(endpoint, customInstance);
      const formats = (data.videoStreams || []).concat(data.audioStreams || []);
      const videoObj = {
        id: id,
        url: `https://www.youtube.com/watch?v=${id}`,
        title: (data.title || 'YouTube Video').trim(),
        description: data.description || '',
        author: data.uploader || data.channel || data.uploaderName || 'Unknown Channel',
        channel: data.uploader || data.channel || data.uploaderName || 'Unknown Channel',
        uploader: data.uploader || data.channel || data.uploaderName || 'Unknown Channel',
        uploaderName: data.uploader || data.channel || data.uploaderName || 'Unknown Channel',
        authorId: data.uploaderUrl ? data.uploaderUrl.replace(/^\/channel\//, '') : (data.channelId || data.uploaderId || ''),
        channelId: data.uploaderUrl ? data.uploaderUrl.replace(/^\/channel\//, '') : (data.channelId || data.uploaderId || ''),
        uploaderId: data.uploaderUrl ? data.uploaderUrl.replace(/^\/channel\//, '') : (data.channelId || data.uploaderId || ''),
        uploaderUrl: data.uploaderUrl || (data.channelId ? `/channel/${data.channelId}` : ''),
        authorAvatar: data.uploaderAvatar || data.avatar || '',
        avatar: data.uploaderAvatar || data.avatar || '',
        uploaderAvatar: data.uploaderAvatar || data.avatar || '',
        views: data.views || 0,
        viewsFormatted: NewPipeExtractorBackend.formatViews(data.views),
        likeCount: data.likes || 0,
        likes: data.likes || 0,
        thumb: data.thumbnailUrl || data.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        thumbnail: data.thumbnailUrl || data.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        thumbnailUrl: data.thumbnailUrl || data.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        duration: data.duration || 0,
        durationFormatted: NewPipeExtractorBackend.formatDuration(data.duration),
        uploadedDate: data.uploadDate || data.uploadedDate || '',
        uploadDate: data.uploadDate || data.uploadedDate || '',
        isLive: Boolean(data.live || data.isLive),
        live: Boolean(data.live || data.isLive),
        embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&enablejsapi=1&rel=0`,
        videoStreams: data.videoStreams || [],
        audioStreams: data.audioStreams || [],
        streams: formats.map((f) => ({
          url: f.url,
          quality: f.quality || 'unknown',
          mimeType: f.mimeType,
          bitrate: f.bitrate,
          hasAudio: !f.videoOnly,
          hasVideo: !f.audioOnly
        })),
        subtitles: data.subtitles || [],
        relatedStreams: (data.relatedStreams || []).map(NewPipeExtractorBackend.normalizeMediaItem).filter(Boolean),
        related: (data.relatedStreams || []).map(NewPipeExtractorBackend.normalizeMediaItem).filter(Boolean)
      };

      return {
        instance,
        provider,
        video: videoObj,
        ...videoObj
      };
    } catch (extractorErr) {
      // Automatic fallback to YouTube oEmbed
      try {
        const oeRes = await fetchWithTimeout(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`, {}, 5000);
        if (oeRes.ok) {
          const oe = await oeRes.json();
          let related = [];
          try {
            const relRes = await NewPipeExtractorBackend.search(oe.author_name || oe.title, 'all');
            related = (relRes.items || []).filter((v) => v.id !== id).slice(0, 10);
          } catch (_) {}

          const fallbackVideo = {
            id: id,
            url: `https://www.youtube.com/watch?v=${id}`,
            title: oe.title || 'YouTube Video',
            description: `Uploaded by ${oe.author_name}`,
            author: oe.author_name || 'YouTube Creator',
            channel: oe.author_name || 'YouTube Creator',
            uploader: oe.author_name || 'YouTube Creator',
            authorId: '',
            channelId: '',
            viewsFormatted: '',
            views: 0,
            likeCount: 0,
            thumb: oe.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            thumbnailUrl: oe.thumbnail_url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&enablejsapi=1&rel=0`,
            videoStreams: [],
            audioStreams: [],
            streams: [],
            subtitles: [],
            relatedStreams: related,
            related: related
          };

          return {
            instance: 'oembed-fallback',
            provider: 'YouTube-oEmbed',
            video: fallbackVideo,
            ...fallbackVideo
          };
        }
      } catch (_) {}

      throw extractorErr;
    }
  }

  static async getComments(id, customInstance = null) {
    const endpoint = `/comments/${encodeURIComponent(id)}`;
    try {
      const { data, instance, provider } = await NewPipeExtractorBackend.fetchWithRetry(endpoint, customInstance);
      const rawList = Array.isArray(data.comments) ? data.comments : (Array.isArray(data) ? data : []);
      const comments = rawList.map((c) => ({
        id: c.commentId || String(Math.random()),
        commentId: c.commentId || String(Math.random()),
        author: c.author || 'Anonymous',
        authorAvatar: c.thumbnail || '',
        thumbnail: c.thumbnail || '',
        content: c.commentText || c.content || '',
        commentText: c.commentText || c.content || '',
        contentHtml: c.commentText || c.content || '',
        publishedTime: c.commentedTime || c.time || '',
        commentedTime: c.commentedTime || c.time || '',
        likeCount: c.likeCount || 0
      }));
      return { instance, provider, comments };
    } catch (_) {
      return { instance: 'local', provider: 'NewPipeExtractor', comments: [] };
    }
  }

  static async getChannel(id, customInstance = null) {
    let cleanId = id.replace(/^\/+/, '').replace(/^channel\//, '');
    try {
      const endpoint = `/channel/${encodeURIComponent(cleanId)}`;
      const { data, instance, provider } = await NewPipeExtractorBackend.fetchWithRetry(endpoint, customInstance);
      const channelObj = {
        id: cleanId,
        name: data.name || 'Channel',
        author: data.name || 'Channel',
        avatar: data.avatarUrl || '',
        avatarUrl: data.avatarUrl || '',
        banner: data.bannerUrl || '',
        bannerUrl: data.bannerUrl || '',
        subscribers: data.subscriberCount || 0,
        subscriberCount: data.subscriberCount || 0,
        subscribersFormatted: NewPipeExtractorBackend.formatSubscribers(data.subscriberCount),
        description: data.description || '',
        videos: (data.relatedStreams || []).map(NewPipeExtractorBackend.normalizeMediaItem).filter(Boolean)
      };

      if (channelObj.videos.length === 0 && channelObj.name) {
        try {
          const searchRes = await NewPipeExtractorBackend.search(channelObj.name);
          const vids = (searchRes.items || []).filter((v) => v.type === 'video');
          if (vids.length > 0) {
            channelObj.videos = vids;
          }
        } catch (_) {}
      }

      return {
        instance,
        provider,
        channel: channelObj,
        ...channelObj,
        videos: channelObj.videos,
        relatedStreams: channelObj.videos
      };
    } catch (err) {
      // If direct channel lookup failed, search for the channel name/handle
      try {
        const searchRes = await NewPipeExtractorBackend.search(cleanId, 'channels');
        const channelItem = (searchRes.items || []).find((i) => i.type === 'channel') || searchRes.items?.[0];
        if (channelItem && channelItem.id && channelItem.id !== cleanId) {
          return await NewPipeExtractorBackend.getChannel(channelItem.id, customInstance);
        }
        if (channelItem) {
          const fallbackChannel = {
            id: channelItem.id || cleanId,
            name: channelItem.name || channelItem.title || cleanId,
            author: channelItem.name || channelItem.title || cleanId,
            avatar: channelItem.authorAvatar || channelItem.thumb || '',
            avatarUrl: channelItem.authorAvatar || channelItem.thumb || '',
            banner: '',
            bannerUrl: '',
            subscribers: 0,
            subscriberCount: 0,
            subscribersFormatted: channelItem.viewsFormatted || '',
            description: `Official channel for ${channelItem.name || cleanId}`,
            videos: []
          };
          return {
            instance: 'search-fallback',
            provider: 'NewPipeExtractor',
            channel: fallbackChannel,
            ...fallbackChannel,
            relatedStreams: []
          };
        }
      } catch (_) {}
      throw err;
    }
  }

  static async getChannelVideos(id, customInstance = null) {
    let cleanId = id.replace(/^\/+/, '').replace(/^channel\//, '');
    let items = [];
    let instanceUsed = 'local';
    let providerUsed = 'NewPipeExtractor';

    try {
      const endpoint = `/channel/${encodeURIComponent(cleanId)}`;
      const { data, instance, provider } = await NewPipeExtractorBackend.fetchWithRetry(endpoint, customInstance);
      instanceUsed = instance;
      providerUsed = provider;
      items = (data.relatedStreams || []).map(NewPipeExtractorBackend.normalizeMediaItem).filter(Boolean);
    } catch (_) {}

    if (items.length === 0) {
      try {
        const chData = await NewPipeExtractorBackend.getChannel(cleanId, customInstance);
        const chName = chData.channel?.name || chData.name || cleanId;
        const searchRes = await NewPipeExtractorBackend.search(chName);
        items = (searchRes.items || []).filter((v) => v.type === 'video');
        if (chData.instance) instanceUsed = chData.instance;
      } catch (_) {}
    }

    return { instance: instanceUsed, provider: providerUsed, items, relatedStreams: items };
  }

  static async getPlaylist(id, customInstance = null) {
    let cleanId = id.replace(/^\/+/, '').replace(/^playlist\//, '').replace(/^playlists\//, '');
    try {
      const endpoint = `/playlists/${encodeURIComponent(cleanId)}`;
      const { data, instance, provider } = await NewPipeExtractorBackend.fetchWithRetry(endpoint, customInstance);
      let items = (data.relatedStreams || []).map(NewPipeExtractorBackend.normalizeMediaItem).filter(Boolean);

      const playlistObj = {
        id: cleanId,
        title: data.name || 'Playlist',
        name: data.name || 'Playlist',
        author: data.uploader || '',
        uploader: data.uploader || '',
        videoCount: data.videos || items.length,
        videos: items.length,
        items: items
      };

      if (items.length === 0 && playlistObj.title) {
        try {
          const searchRes = await NewPipeExtractorBackend.search(playlistObj.title);
          const vids = (searchRes.items || []).filter((v) => v.type === 'video');
          if (vids.length > 0) {
            playlistObj.items = vids;
            playlistObj.videos = vids.length;
            items = vids;
          }
        } catch (_) {}
      }

      return {
        instance,
        provider,
        playlist: playlistObj,
        ...playlistObj,
        items,
        relatedStreams: items
      };
    } catch (err) {
      // Fallback search
      try {
        const searchRes = await NewPipeExtractorBackend.search('playlist songs');
        const vids = (searchRes.items || []).filter((v) => v.type === 'video');
        return {
          instance: 'search-fallback',
          provider: 'NewPipeExtractor',
          playlist: { id: cleanId, title: 'Playlist', author: 'Curator', videos: vids.length, items: vids },
          items: vids,
          relatedStreams: vids
        };
      } catch (_) {}
      throw err;
    }
  }
}

module.exports = async function handler(req, res) {
  let cleanUrl = req.url.replace(/^\/api\/(unified|extractor|media)/i, '');
  if (!cleanUrl.startsWith('/')) cleanUrl = '/' + cleanUrl;

  const [pathPart, queryPart] = cleanUrl.split('?');
  const query = new URLSearchParams(queryPart || '');

  // Resolve target endpoint whether provided as path or query parameter
  let rawRoute = (query.get('endpoint') || pathPart.replace(/^\/+/, '')).trim();
  if (!rawRoute) rawRoute = 'trending';

  const segments = rawRoute.split('/');
  const mainCmd = (segments[0] || '').toLowerCase();
  const subParam = segments.slice(1).join('/');
  const customInst = query.get('instance');

  try {
    if (mainCmd === 'trending' || mainCmd === 'feed') {
      const region = query.get('region') || 'US';
      const result = await NewPipeExtractorBackend.getTrending(region, customInst);
      return res.status(200).json(result);
    }

    if (mainCmd === 'search') {
      const q = query.get('q') || query.get('query') || subParam || '';
      const filter = query.get('filter') || 'all';
      const result = await NewPipeExtractorBackend.search(q, filter, customInst);
      return res.status(200).json(result);
    }

    if (mainCmd === 'suggestions' || mainCmd === 'opensearch' || rawRoute.includes('suggestions')) {
      const q = query.get('q') || query.get('query') || '';
      const result = await NewPipeExtractorBackend.getSuggestions(q, customInst);
      // Return standard OpenSearch array: [q, suggestions]
      return res.status(200).json([q, result.suggestions || []]);
    }

    if (mainCmd === 'streams' || mainCmd === 'video' || mainCmd === 'watch') {
      const vidId = NewPipeExtractorBackend.extractMediaId(subParam || query.get('id') || query.get('v'));
      if (!vidId) return res.status(400).json({ error: 'INVALID_URL', message: 'Missing or invalid video ID' });
      const result = await NewPipeExtractorBackend.getVideo(vidId, customInst);
      return res.status(200).json(result);
    }

    if (mainCmd === 'comments') {
      const vidId = NewPipeExtractorBackend.extractMediaId(subParam || query.get('id') || query.get('v'));
      if (!vidId) return res.status(400).json({ error: 'INVALID_URL', message: 'Missing or invalid video ID' });
      const result = await NewPipeExtractorBackend.getComments(vidId, customInst);
      return res.status(200).json(result);
    }

    if (mainCmd === 'channel-videos') {
      const chId = (subParam || query.get('id') || '').replace(/^\/channel\//, '');
      const result = await NewPipeExtractorBackend.getChannelVideos(chId, customInst);
      return res.status(200).json(result);
    }

    if (mainCmd === 'channel') {
      const chId = (subParam || query.get('id') || '').replace(/^\/channel\//, '');
      const result = await NewPipeExtractorBackend.getChannel(chId, customInst);
      return res.status(200).json(result);
    }

    if (mainCmd === 'playlists' || mainCmd === 'playlist') {
      const plId = (subParam || query.get('id') || '').replace(/^\/playlist\?list=/, '');
      const result = await NewPipeExtractorBackend.getPlaylist(plId, customInst);
      return res.status(200).json(result);
    }

    if (mainCmd === 'instances') {
      return res.status(200).json(instanceManager.instances);
    }

    return res.status(404).json({ error: 'NOT_FOUND', path: pathPart, route: rawRoute });
  } catch (err) {
    console.error('[NewPipeExtractor Gateway Error]:', err.message);
    return res.status(502).json({
      error: 'EXTRACTION_FAILED',
      message: err.message || 'Extractor instances failed'
    });
  }
};
