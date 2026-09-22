/**
 * PawTube - Piped API Service
 * Interacts with the backend serverless endpoints.
 */

import { fetchApi } from '../client/apiClient.js';
import { normalizeMediaItem } from '../normalization/mediaModels.js';

export const PipedApi = {
  async getTrending(region = 'IN', options = {}) {
    const res = await fetchApi('/api/piped/trending', { region }, { ...options, ttlMs: 60000 });
    const items = (res.items || []).map(normalizeMediaItem).filter(Boolean);
    return { ...res, items };
  },

  async search(q, filter = 'all', options = {}) {
    const res = await fetchApi('/api/piped/search', { q, filter, region: 'IN' }, { ...options, ttlMs: 30000 });
    const items = (res.items || []).map((i) => (i.type === 'video' ? normalizeMediaItem(i) : i)).filter(Boolean);
    return { ...res, items };
  },

  async getVideo(id, options = {}) {
    return fetchApi('/api/piped/video', { v: id }, { ...options, ttlMs: 120000 });
  },

  async getChannel(id, options = {}) {
    return fetchApi('/api/piped/channel', { id }, { ...options, ttlMs: 120000 });
  },

  async getPlaylist(listId, options = {}) {
    return fetchApi('/api/piped/playlist', { list: listId }, { ...options, ttlMs: 120000 });
  },

  async getStreams(id, options = {}) {
    return fetchApi('/api/piped/streams', { v: id }, { ...options, ttlMs: 60000 });
  },

  async getSuggestions(q, options = {}) {
    return fetchApi('/api/piped/suggestions', { q }, { ...options, ttlMs: 60000 });
  },

  async getInstances(options = {}) {
    return fetchApi('/api/piped/instances', {}, { ...options, ttlMs: 30000 });
  }
};

export default PipedApi;
