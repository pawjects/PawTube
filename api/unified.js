const fetch = global.fetch;

const PIPED_INSTANCES = [
  'https://api.piped.private.coffee',
  'https://pipedapi.kavin.rocks',
  'https://pipedapi-libre.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://pipedapi.nosebs.ru',
  'https://piped-api.privacy.com.de',
  'https://pipedapi.adminforge.de',
  'https://api.piped.yt',
  'https://pipedapi.drgns.space',
  'https://pipedapi.owo.si'
];

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

class PipedInstanceManager {
  constructor(instances) {
    this.instances = instances.map(url => ({
      url,
      healthy: true,
      consecutiveFailures: 0,
      lastChecked: 0,
      cooldownUntil: 0,
      latency: 0
    }));
  }

  async getBestInstance() {
    const now = Date.now();
    // Reset cooldowns
    this.instances.forEach(inst => {
      if (inst.cooldownUntil && now > inst.cooldownUntil) {
        inst.cooldownUntil = 0;
        inst.consecutiveFailures = 0;
        inst.healthy = true;
      }
    });

    // Sort by healthy, then latency
    const available = this.instances
      .filter(i => i.healthy && now > i.cooldownUntil)
      .sort((a, b) => {
         // heavily penalize instances with recent failures
         const aScore = a.latency + (a.consecutiveFailures * 10000);
         const bScore = b.latency + (b.consecutiveFailures * 10000);
         return aScore - bScore;
      });

    if (available.length > 0) return available[0];
    
    // If all failed, pick the one with lowest failures to retry
    return this.instances.sort((a, b) => a.consecutiveFailures - b.consecutiveFailures)[0];
  }

  markSuccess(url, latency) {
    const inst = this.instances.find(i => i.url === url);
    if (inst) {
      inst.healthy = true;
      inst.consecutiveFailures = 0;
      inst.cooldownUntil = 0;
      inst.lastChecked = Date.now();
      // Moving average latency
      inst.latency = inst.latency === 0 ? latency : (inst.latency * 0.7) + (latency * 0.3);
    }
  }

  markFailure(url) {
    const inst = this.instances.find(i => i.url === url);
    if (inst) {
      inst.consecutiveFailures += 1;
      inst.lastChecked = Date.now();
      if (inst.consecutiveFailures >= 2) {
        inst.healthy = false;
        // Exponential backoff: 30s, 60s, 120s... max 5 mins
        const backoff = Math.min(30000 * Math.pow(2, inst.consecutiveFailures - 2), 300000);
        inst.cooldownUntil = Date.now() + backoff;
      }
    }
  }
}

const instanceManager = new PipedInstanceManager(PIPED_INSTANCES);

class PawTubeBackend {
  static formatDuration(seconds) {
    if (seconds < 0) return 'LIVE';
    if (!seconds) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  static formatViews(views) {
    if (!views) return '0 views';
    if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M views';
    if (views >= 1000) return (views / 1000).toFixed(1) + 'K views';
    return views.toLocaleString() + ' views';
  }

  static normalizePipedVideo(v) {
    if (!v) return null;
    const id = v.url ? v.url.replace('/watch?v=', '') : null;
    if (!id) return null;
    return {
      id: id,
      title: v.title,
      channel: v.uploaderName,
      channelId: v.uploaderUrl ? v.uploaderUrl.replace('/channel/', '') : '',
      viewsFormatted: PawTubeBackend.formatViews(v.views),
      publishedText: v.uploadedDate || '',
      duration: v.duration || 0,
      durationFormatted: PawTubeBackend.formatDuration(v.duration),
      thumb: v.thumbnail || '',
      isShort: (v.duration || 0) > 0 && (v.duration || 0) <= 75
    };
  }

  static async fetchWithRetry(endpointPiped, customInstance = null) {
    // If a custom instance is provided, we just try it directly. If it fails, we fall back to manager.
    let triedCustom = false;
    
    for (let attempts = 0; attempts < 12; attempts++) {
      let instObj;
      let baseUrl;

      if (customInstance && !triedCustom) {
        baseUrl = customInstance;
        triedCustom = true;
      } else {
        instObj = await instanceManager.getBestInstance();
        baseUrl = instObj.url;
      }

      const startTime = Date.now();
      try {
        const res = await fetchWithTimeout(`${baseUrl}${endpointPiped}`, { headers: { 'Accept': 'application/json' } }, 10000);
        
        if (!res.ok) {
          if (res.status === 429 || res.status >= 500) {
            throw new Error(`HTTP ${res.status}`); // Retryable
          }
          if (res.status === 400 || res.status === 404) {
             const data = JSON.parse(await res.text());
             if (data.error) throw new Error(data.error); // Do not retry 400/404, just throw
          }
          throw new Error(`HTTP ${res.status}`);
        }
        
        const data = JSON.parse(await res.text());
        if (data.error) {
           throw new Error(data.error);
        }

        if (instObj) instanceManager.markSuccess(baseUrl, Date.now() - startTime);
        
        return { data, instance: baseUrl, provider: 'piped' };

      } catch (e) {
        // console.error(`${baseUrl} failed: ${e.message}`);
        if (instObj) instanceManager.markFailure(baseUrl);
        // if custom instance failed, next loop iteration will use manager
      }
    }
    throw new Error("All piped instances failed after retries.");
  }

  static async getTrending(region = "US", customInstance = null) {
    const endpointPiped = `/trending?region=${encodeURIComponent(region)}`;
    const { data, instance, provider } = await PawTubeBackend.fetchWithRetry(endpointPiped, customInstance);
    const items = (Array.isArray(data) ? data : (data.items || [])).map(PawTubeBackend.normalizePipedVideo).filter(Boolean);
    return { instance, provider, items };
  }
  
  static async search(query, filter = "all", customInstance = null) {
    const endpointPiped = `/search?q=${encodeURIComponent(query)}&filter=${encodeURIComponent(filter)}`;
    const { data, instance, provider } = await PawTubeBackend.fetchWithRetry(endpointPiped, customInstance);
    const items = (Array.isArray(data) ? data : (data.items || []))
        .filter(i => i.type === 'stream')
        .map(PawTubeBackend.normalizePipedVideo)
        .filter(Boolean);
    return { instance, provider, items };
  }

  static async getSuggestions(query, customInstance = null) {
    const { data, instance } = await PawTubeBackend.fetchWithRetry(`/opensearch/suggestions?query=${encodeURIComponent(query)}`, customInstance);
    return { instance, suggestions: (data[1] || []) };
  }

  static async getVideo(id, customInstance = null) {
    const endpointPiped = `/streams/${id}`;
    const { data, instance, provider } = await PawTubeBackend.fetchWithRetry(endpointPiped, customInstance);
    
    const formats = (data.videoStreams || []).concat(data.audioStreams || []);
    return {
      instance,
      provider,
      video: {
        id: id,
        title: data.title,
        description: data.description,
        channel: data.uploader,
        channelId: data.uploaderUrl ? data.uploaderUrl.replace('/channel/', '') : '',
        viewsFormatted: PawTubeBackend.formatViews(data.views),
        likeCount: data.likes,
        thumb: data.thumbnailUrl || '',
        streams: formats.map(f => ({
          url: f.url,
          quality: f.quality || 'unknown',
          mimeType: f.mimeType,
          bitrate: f.bitrate,
          hasAudio: !f.videoOnly,
          hasVideo: !f.audioOnly
        })),
        related: (data.relatedStreams || []).map(PawTubeBackend.normalizePipedVideo).filter(Boolean)
      }
    };
  }

  static async getComments(id, customInstance = null) {
    const { data, instance, provider } = await PawTubeBackend.fetchWithRetry(`/comments/${id}`, customInstance);
    const comments = (data.comments || []).map(c => ({
      author: c.author,
      contentHtml: c.commentText,
      publishedText: c.commentedTime,
      likeCount: c.likeCount,
      authorThumbnails: [{url: c.thumbnail}]
    }));
    return { instance, provider, comments };
  }
  
  static async getChannel(id, customInstance = null) {
    const { data, instance } = await PawTubeBackend.fetchWithRetry(`/channel/${id}`, customInstance);
    return { 
      instance, 
      channel: {
        id,
        name: data.name,
        avatar: data.avatarUrl,
        subCount: data.subscriberCount,
        description: data.description
      } 
    };
  }

  static async getChannelVideos(id, customInstance = null) {
    const { data, instance } = await PawTubeBackend.fetchWithRetry(`/channel/${id}`, customInstance);
    const items = (data.relatedStreams || []).map(PawTubeBackend.normalizePipedVideo).filter(Boolean);
    return { instance, items };
  }

  static async getPlaylist(id, customInstance = null) {
    const { data, instance, provider } = await PawTubeBackend.fetchWithRetry(`/playlists/${id}`, customInstance);
    return { 
      instance, 
      playlist: { title: data.name, author: data.uploader, videoCount: data.videos }, 
      items: (data.relatedStreams || []).map(PawTubeBackend.normalizePipedVideo).filter(Boolean) 
    };
  }
}

module.exports = async function handler(req, res) {
  let endpoint = req.url.replace('/api/unified', '');
  if (!endpoint.startsWith('/')) endpoint = '/' + endpoint;
  
  const [pathPart, queryPart] = endpoint.split('?');
  const query = new URLSearchParams(queryPart || "");
  const ci = query.get("instance");

  try {
    if (pathPart === '/trending') {
      return res.status(200).json(await PawTubeBackend.getTrending(query.get("region") || "US", ci));
    } 
    else if (pathPart === '/search') {
      return res.status(200).json(await PawTubeBackend.search(query.get("q"), "all", ci));
    }
    else if (pathPart === '/suggestions') {
      return res.status(200).json(await PawTubeBackend.getSuggestions(query.get("q"), ci));
    }
    else if (pathPart === '/video') {
      return res.status(200).json(await PawTubeBackend.getVideo(query.get("id"), ci));
    }
    else if (pathPart === '/comments') {
      return res.status(200).json(await PawTubeBackend.getComments(query.get("id"), ci));
    }
    else if (pathPart === '/channel') {
      return res.status(200).json(await PawTubeBackend.getChannel(query.get("id"), ci));
    }
    else if (pathPart === '/channel-videos') {
      return res.status(200).json(await PawTubeBackend.getChannelVideos(query.get("id"), ci));
    }
    else if (pathPart === '/playlist') {
      return res.status(200).json(await PawTubeBackend.getPlaylist(query.get("id"), ci));
    }
    else if (pathPart === '/instances') {
      return res.status(200).json(instanceManager.instances);
    }
    else {
      return res.status(404).json({ error: "Not found" });
    }
  } catch (err) {
    console.error("API Error:", err.message);
    return res.status(502).json({ error: "Upstream API failed", details: err.message || "All instances failed" });
  }
};
