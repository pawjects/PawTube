/**
 * PawTube - Centralized API Client
 * Routes all media requests to the serverless endpoints (/api/piped/*)
 * Handles in-flight deduplication, TTL caching, abort signals, and fallbacks.
 */

import { cache } from '../cache/cache.js';
import { getCustomInstance } from '../../storage/preferences/preferencesStorage.js';

const inFlightRequests = new Map();

export function isAbortError(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  if (err.code === 20) return true; // DOMException.ABORT_ERR
  const msg = typeof err.message === 'string' ? err.message.toLowerCase() : '';
  const str = typeof err.toString === 'function' ? err.toString().toLowerCase() : '';
  return msg.includes('abort') || str.includes('abort') || msg.includes('canceled') || msg.includes('cancelled');
}

export async function fetchApi(endpoint, params = {}, options = {}) {
  const { signal = null, ttlMs = 45000, skipCache = false } = options;

  const customInstance = getCustomInstance();
  const queryObj = { ...params };
  if (customInstance) {
    queryObj.custom = customInstance;
  }

  const qs = new URLSearchParams(queryObj).toString();
  const fullUrl = qs ? `${endpoint}?${qs}` : endpoint;

  if (!skipCache) {
    const cached = cache.get(fullUrl);
    if (cached) {
      return cached;
    }
  }

  // Deduplicate concurrent identical requests
  let fetchPromise = inFlightRequests.get(fullUrl);

  if (!fetchPromise) {
    fetchPromise = (async () => {
      try {
        const headers = { Accept: 'application/json' };
        if (customInstance) {
          headers['X-Custom-Instance'] = customInstance;
        }

        const res = await fetch(fullUrl, { headers });
        if (!res.ok) {
          const errorText = await res.text();
          let parsed;
          try { parsed = JSON.parse(errorText); } catch {}
          throw new Error(parsed?.message || `HTTP ${res.status}`);
        }

        const data = await res.json();
        if (ttlMs > 0) {
          cache.set(fullUrl, data, ttlMs);
        }
        return data;
      } finally {
        inFlightRequests.delete(fullUrl);
      }
    })();

    inFlightRequests.set(fullUrl, fetchPromise);
  }

  // If no abort signal provided, return the shared promise directly
  if (!signal) {
    return fetchPromise;
  }

  // If already aborted, reject immediately without waiting
  if (signal.aborted) {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    throw err;
  }

  // Wrap with caller-specific signal listener so aborting one consumer doesn't cancel shared requests
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      reject(err);
    };

    signal.addEventListener('abort', onAbort, { once: true });

    fetchPromise.then(
      (data) => {
        signal.removeEventListener('abort', onAbort);
        resolve(data);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    );
  });
}

export default fetchApi;
