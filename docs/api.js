// PawTube Unified API Client
window.PawTubeAPI = {
  formatDuration(seconds) {
    if (seconds < 0) return 'LIVE';
    if (!seconds) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  },
  formatViews(views) {
    if (!views) return '0 views';
    if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M views';
    if (views >= 1000) return (views / 1000).toFixed(1) + 'K views';
    return views.toLocaleString() + ' views';
  },
  normalizePipedVideo(v) {
    if (!v) return null;
    const id = v.url ? v.url.replace('/watch?v=', '') : (v.videoId || null);
    if (!id) return null;
    return {
      id: id,
      title: v.title,
      channel: v.uploaderName,
      channelId: v.uploaderUrl ? v.uploaderUrl.replace('/channel/', '') : '',
      viewsFormatted: window.PawTubeAPI.formatViews(v.views),
      publishedText: v.uploadedDate || '',
      duration: v.duration || 0,
      durationFormatted: window.PawTubeAPI.formatDuration(v.duration),
      thumb: v.thumbnail || '',
      isShort: (v.duration || 0) > 0 && (v.duration || 0) <= 75
    };
  },
  async fetchApi(endpoint, options = {}) {
    const { signal } = options;
    try {
      let baseUrl = 'https://pipedapi.kavin.rocks';
      let customInstance = localStorage.getItem('custom_piped_instance');
      if (customInstance) {
         if (customInstance.startsWith('"') && customInstance.endsWith('"')) {
            try { customInstance = JSON.parse(customInstance); } catch(e){}
         }
         if (customInstance && typeof customInstance === 'string' && customInstance.trim().length > 0) {
            baseUrl = customInstance.trim();
         }
      }
      
      const url = `${baseUrl}${endpoint}`;
      const res = await fetch(url, { signal });
      if (!res.ok) {
        throw new Error(`Failed to load data (HTTP ${res.status})`);
      }
      return await res.json();
    } catch (err) {
      console.error(`PawTubeAPI Error (${endpoint}):`, err);
      throw err;
    }
  },
  async getTrending(options = {}) {
    let url = `/trending?region=US`;
    const res = await this.fetchApi(url, options);
    const items = Array.isArray(res) ? res : (res.items || []);
    return items.map(v => this.normalizePipedVideo(v)).filter(Boolean);
  },
  async getCategoryFeed(category, options = {}) {
    if (!category || category === 'All' || category === 'Trending') {
      return this.getTrending(options);
    }
    const trendingTypes = ['Music', 'Gaming', 'Movies', 'News'];
    if (trendingTypes.includes(category)) {
      return this.getTrending({ ...options, type: category });
    }
    const queryMap = {
      'Tech': 'tech reviews gadgets modern software',
      'Education': 'science documentary coding history explained',
    };
    const q = queryMap[category] || `${category} popular trending`;
    return this.search(q, options);
  },
  async getShorts(options = {}) {
    const page = options.page || 1;
    const queries = ['#shorts', '#tiktok', 'youtube shorts funny'];
    const selectedQuery = queries[(page - 1) % queries.length];
    try {
      const items = await this.search(selectedQuery, { ...options, page });
      const shorts = items.filter(v => v.duration <= 75 || /#shorts/i.test(v.title));
      if (shorts.length > 0) return shorts;
      return items.slice(0, 10);
    } catch (err) {
      const items = await this.getTrending(options);
      return items.filter(v => v.duration <= 90).slice(0, 10);
    }
  },
  async search(query, options = {}) {
    const res = await this.fetchApi(`/search?q=${encodeURIComponent(query)}&filter=all`, options);
    const items = Array.isArray(res) ? res : (res.items || []);
    return items.map(v => this.normalizePipedVideo(v)).filter(Boolean);
  },
  async getSearchSuggestions(query) {
    const res = await this.fetchApi(`/opensearch/suggestions?query=${encodeURIComponent(query)}`);
    return res[1] || [];
  },
  async getVideoInfo(id, options = {}) {
    const data = await this.fetchApi(`/streams/${encodeURIComponent(id)}`, options);
    const formats = (data.videoStreams || []).concat(data.audioStreams || []);
    const video = {
        id: id,
        title: data.title,
        description: data.description,
        channel: data.uploader,
        channelId: data.uploaderUrl ? data.uploaderUrl.replace('/channel/', '') : '',
        viewsFormatted: this.formatViews(data.views),
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
        related: (data.relatedStreams || []).map(v => this.normalizePipedVideo(v)).filter(Boolean)
    };
    return { video, instance: 'piped' };
  },
  async getComments(id, options = {}) {
    const data = await this.fetchApi(`/comments/${encodeURIComponent(id)}`, options);
    const comments = (data.comments || []).map(c => ({
      author: c.author,
      contentHtml: c.commentText,
      publishedText: c.commentedTime,
      likeCount: c.likeCount,
      authorThumbnails: [{url: c.thumbnail}]
    }));
    return { comments };
  },
  async getChannel(id, options = {}) {
    const data = await this.fetchApi(`/channel/${encodeURIComponent(id)}`, options);
    return {
        id,
        name: data.name,
        avatar: data.avatarUrl,
        subCount: data.subscriberCount,
        description: data.description
    };
  },
  async getChannelVideos(id, options = {}) {
    const data = await this.fetchApi(`/channel/${encodeURIComponent(id)}`, options);
    const items = (data.relatedStreams || []).map(v => this.normalizePipedVideo(v)).filter(Boolean);
    return items;
  },
  async getInstances(options = {}) {
    return []; 
  },
  async getPlaylist(id, options = {}) {
    const data = await this.fetchApi(`/playlists/${encodeURIComponent(id)}`, options);
    return {
       title: data.name, 
       channel: data.uploader, 
       videoCount: data.videos,
       videos: (data.relatedStreams || []).map(v => this.normalizePipedVideo(v)).filter(Boolean)
    };
  }
  }
};
