/**
 * PawTube - Piped API Service
 * Interacts with the backend serverless endpoints with consistent normalization.
 */

import { fetchApi } from '../client/apiClient.js';
import { normalizeMediaItem, normalizePlaylist, normalizePlaylistItem, cleanText } from '../normalization/mediaModels.js';

export const PipedApi = {
  async getTrending(region = 'IN', options = {}) {
    const res = await fetchApi('/api/piped/trending', { region }, { ...options, ttlMs: 60000 });
    const items = (res.items || []).map(normalizeMediaItem).filter(Boolean);
    return { ...res, items };
  },

  async search(q, filter = 'all', options = {}) {
    const res = await fetchApi('/api/piped/search', { q, filter, region: 'IN' }, { ...options, ttlMs: 30000 });
    const items = (res.items || []).map((i) => {
      if (!i) return null;
      if (i.type === 'playlist') {
        return normalizePlaylistItem(i);
      }
      if (i.type === 'channel') {
        return {
          ...i,
          title: cleanText(i.title || i.name, 'Channel'),
          name: cleanText(i.title || i.name, 'Channel'),
          channel: cleanText(i.title || i.name, 'Channel'),
          description: cleanText(i.description, '')
        };
      }
      return normalizeMediaItem(i);
    }).filter(Boolean);
    return { ...res, items };
  },

  async getVideo(id, options = {}) {
    return fetchApi('/api/piped/video', { v: id }, { ...options, ttlMs: 120000 });
  },

  async getChannel(id, nextpage = null, options = {}) {
    const params = { id };
    if (nextpage) params.nextpage = nextpage;
    return fetchApi('/api/piped/channel', params, { ...options, ttlMs: nextpage ? 60000 : 120000 });
  },

  async getPlaylist(listId, nextpage = null, options = {}) {
    const params = { list: listId };
    if (nextpage) params.nextpage = nextpage;
    const res = await fetchApi('/api/piped/playlist', params, { ...options, ttlMs: 120000 });
    return normalizePlaylist(res) || res;
  },

  async getStreams(id, options = {}) {
    return fetchApi('/api/piped/streams', { v: id }, { ...options, ttlMs: 60000 });
  },

  async getComments(id, nextpage = null, options = {}) {
    const params = { v: id };
    if (nextpage) params.nextpage = nextpage;
    return fetchApi('/api/piped/comments', params, { ...options, ttlMs: 60000 });
  },

  async getSuggestions(q, options = {}) {
    return fetchApi('/api/piped/suggestions', { q }, { ...options, ttlMs: 60000 });
  },

  async getInstances(options = {}) {
    return fetchApi('/api/piped/instances', {}, { ...options, ttlMs: 30000 });
  }
};

export default PipedApi;
