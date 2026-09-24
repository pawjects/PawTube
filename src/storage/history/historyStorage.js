/**
 * PawTube - History Storage Manager
 * Stores recently watched media items locally with deduplication.
 */

const HISTORY_KEY = 'pawtube_history';
const MAX_HISTORY = 100;

let lastProgressSaveTime = 0;
let pendingProgressTimer = null;
let pendingSavePayload = null;

import { getPreferences } from '../preferences/preferencesStorage.js';
import { normalizeDurationSeconds } from '../../api/normalization/mediaModels.js';

export function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read history from localStorage:', err);
    return [];
  }
}

export function flushPendingHistoryProgress() {
  if (!pendingSavePayload) return;
  const { videoId, progressSeconds, durationSeconds } = pendingSavePayload;
  pendingSavePayload = null;
  if (pendingProgressTimer) {
    clearTimeout(pendingProgressTimer);
    pendingProgressTimer = null;
  }
  executeProgressSave(videoId, progressSeconds, durationSeconds);
}

function executeProgressSave(videoId, progressSeconds, durationSeconds) {
  if (!videoId) return;
  lastProgressSaveTime = Date.now();
  try {
    const list = getHistory();
    const item = list.find((i) => i.id === videoId);
    if (item) {
      const prog = Math.max(0, Math.floor(progressSeconds));
      item.progress = prog;
      if (durationSeconds && durationSeconds > 0) {
        const dur = Math.floor(durationSeconds);
        item.duration = dur;
        item.durationSeconds = dur;
        const pct = Math.min(100, Math.round((prog / dur) * 100));
        item.watchedPercentage = pct;
        if (pct >= 92 || prog >= dur - 15) {
          item.completed = true;
        }
      }
      item.watchedAt = Date.now();
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pawtube:historyChange', { detail: { videoId, progress: item.progress } }));
      }
    }
  } catch (err) {
    console.error('Failed to persist progress:', err);
  }
}

// Hook page hide and unload to immediately persist any unsaved playback progress
if (typeof window !== 'undefined') {
  const flushHandler = () => flushPendingHistoryProgress();
  window.addEventListener('visibilitychange', () => {
    if (document.hidden) flushPendingHistoryProgress();
  });
  window.addEventListener('pagehide', flushHandler);
  window.addEventListener('beforeunload', flushHandler);
}

export function addToHistory(item) {
  if (!item || !item.id) return;
  const prefs = getPreferences();
  if (prefs.historyEnabled === false) return;

  try {
    const list = getHistory();
    const existing = list.find((i) => i.id === item.id);
    const filtered = list.filter((i) => i.id !== item.id);

    const durSec = normalizeDurationSeconds(
      item.durationSeconds !== undefined ? item.durationSeconds : (item.duration !== undefined ? item.duration : existing?.duration)
    );
    const prog = typeof item.progress === 'number' ? item.progress : (existing?.progress || 0);
    const watchCount = (existing?.watchCount || 0) + 1;
    
    filtered.unshift({
      ...existing,
      ...item,
      watchedAt: Date.now(),
      progress: prog,
      duration: durSec || existing?.duration || 0,
      durationSeconds: durSec || existing?.durationSeconds || 0,
      watchedPercentage: item.watchedPercentage !== undefined ? item.watchedPercentage : (existing?.watchedPercentage || 0),
      completed: item.completed !== undefined ? item.completed : Boolean(existing?.completed),
      watchCount
    });

    if (filtered.length > MAX_HISTORY) {
      filtered.length = MAX_HISTORY;
    }
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pawtube:historyChange', { detail: { videoId: item.id } }));
    }
  } catch (err) {
    console.error('Failed to save item to history:', err);
  }
}

export function updateHistoryProgress(videoId, progressSeconds, durationSeconds, options = {}) {
  if (!videoId || typeof progressSeconds !== 'number') return;
  const prefs = getPreferences();
  if (prefs.historyEnabled === false) return;

  const { immediate = false } = options;
  pendingSavePayload = { videoId, progressSeconds, durationSeconds };

  if (immediate) {
    flushPendingHistoryProgress();
    return;
  }

  const now = Date.now();
  // Throttle updates: save immediately if > 3s since last save, otherwise debounce
  if (now - lastProgressSaveTime > 3500) {
    flushPendingHistoryProgress();
  } else if (!pendingProgressTimer) {
    pendingProgressTimer = setTimeout(() => {
      pendingProgressTimer = null;
      flushPendingHistoryProgress();
    }, 2500);
  }
}

export function markVideoCompleted(videoId) {
  if (!videoId) return;
  try {
    const list = getHistory();
    const item = list.find((i) => i.id === videoId);
    if (item) {
      item.completed = true;
      item.watchedPercentage = 100;
      if (item.duration) item.progress = item.duration;
      item.watchedAt = Date.now();
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pawtube:historyChange', { detail: { videoId, completed: true } }));
      }
    }
  } catch {}
}

export function removeFromHistory(videoId) {
  if (!videoId) return;
  try {
    const list = getHistory().filter((i) => i.id !== videoId);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pawtube:historyChange', { detail: { videoId, removed: true } }));
    }
  } catch (err) {
    console.error('Failed to remove item from history:', err);
  }
}

export function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pawtube:historyChange', { detail: { cleared: true } }));
    }
  } catch (err) {
    console.error('Failed to clear history:', err);
  }
}

/**
 * Returns videos that are actively in progress (watched >= 5s, but not completed).
 * Keeps original most recently watched -> oldest sort order.
 */
export function getContinueWatching() {
  const history = getHistory();
  return history.filter((v) => {
    if (!v || !v.id) return false;
    if (v.completed === true) return false;

    const prog = typeof v.progress === 'number' ? v.progress : 0;
    const dur = (v.durationSeconds !== undefined && v.durationSeconds !== null)
      ? v.durationSeconds
      : (typeof v.duration === 'number' ? v.duration : 0);

    // Filter out items that were barely watched (less than 5s)
    if (prog < 5) return false;

    // Filter out items that are finished (within 15s of duration or >= 92%)
    if (dur > 0) {
      if (prog >= dur - 15) return false;
      if (typeof v.watchedPercentage === 'number' && v.watchedPercentage >= 92) return false;
    }

    return true;
  });
}

