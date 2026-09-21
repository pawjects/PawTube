/**
 * PawTube - Media API Adapter & Normalizer
 * 
 * Bridges the frontend UI directly to the unified PawTube Provider Architecture
 * powered by NewPipeExtractor.
 * 
 * Exposes window.PawTubeAPI for backwards-compatibility and convenience,
 * routing all requests through window.pawtubeMediaService.
 */

(function () {
  'use strict';

  // Retrieve central service from provider layer
  function getService() {
    return window.pawtubeMediaService;
  }

  // Format utilities
  const formatDuration = (sec) => window.PawTubeUtils ? window.PawTubeUtils.formatDuration(sec) : String(sec);
  const formatViews = (v) => window.PawTubeUtils ? window.PawTubeUtils.formatViews(v) : String(v);
  const formatSubscriberCount = (c) => window.PawTubeUtils ? window.PawTubeUtils.formatSubscriberCount(c) : String(c);
  const extractVideoId = (u) => window.PawTubeUtils ? window.PawTubeUtils.extractMediaId(u) : (window.extractVideoId ? window.extractVideoId(u) : u);

  // Normalization utilities
  function normalizeVideo(v) {
    if (!v) return null;
    if (v instanceof (window.MediaItem || Object)) return v;
    return new (window.MediaItem || Object)(v);
  }

  function normalizeFeed(items) {
    if (!Array.isArray(items)) return [];
    return items.map(normalizeVideo).filter(Boolean);
  }

  function normalizeSearchItem(item) {
    if (!item) return null;
    if (item.type === 'channel' || item.type === 'playlist') return item;
    return normalizeVideo(item);
  }

  function normalizeComments(data) {
    if (!data) return { comments: [] };
    if (Array.isArray(data.comments)) return data;
    if (Array.isArray(data)) return { comments: data };
    return { comments: [] };
  }

  const PawTubeAPI = {
    // Central Piped request engine
    requestPiped: (endpoint, options) => window.requestPiped ? window.requestPiped(endpoint, options) : (getService()?.provider?.request ? getService().provider.request(endpoint, options) : Promise.reject(new Error('No provider available'))),
    buildPipedUrl: (baseUrl, endpoint, params) => window.buildPipedUrl ? window.buildPipedUrl(baseUrl, endpoint, params) : '',

    // Utility helpers
    formatDuration,
    formatViews,
    formatSubscriberCount,
    extractVideoId,
    normalizeVideo,
    normalizePipedVideo: normalizeVideo,
    normalizeFeed,
    normalizeSearchItem,
    normalizeComments,

    // Core Provider Media Methods (routed through PawTubeMediaService)
    async getTrending(options = {}) {
      return getService().getTrending(options);
    },

    async getCategoryFeed(category, options = {}) {
      return getService().getCategoryFeed(category, options);
    },

    async getShorts(options = {}) {
      return getService().getShorts(options);
    },

    async search(query, options = {}) {
      return getService().search(query, options);
    },

    async getSearchSuggestions(query) {
      return getService().getSearchSuggestions(query);
    },

    async getVideo(videoId, options = {}) {
      return getService().getVideoMetadata(videoId, options);
    },

    async getVideoMetadata(videoId, options = {}) {
      return getService().getVideoMetadata(videoId, options);
    },

    async getVideoInfo(videoId, options = {}) {
      const meta = await getService().getVideoMetadata(videoId, options);
      return { video: meta, instance: 'newpipe' };
    },

    async getStreamInfo(videoId, options = {}) {
      return getService().getStreamInfo(videoId, options);
    },

    async getComments(videoId, options = {}) {
      return getService().getComments(videoId, options);
    },

    async getChannel(channelId, options = {}) {
      return getService().getChannel(channelId, options);
    },

    async getChannelVideos(channelId, options = {}) {
      return getService().getChannelVideos(channelId, options);
    },

    async getPlaylist(playlistId, options = {}) {
      return getService().getPlaylist(playlistId, options);
    },

    async getInstances() {
      return getService().getInstances();
    },

    getCustomInstance() {
      return getService().getCustomInstance();
    },

    setCustomInstance(url) {
      return getService().setCustomInstance(url);
    },

    resetCustomInstance() {
      return getService().resetCustomInstance();
    }
  };

  window.PawTubeAPI = PawTubeAPI;
})();
