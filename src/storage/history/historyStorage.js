/**
 * PawTube - History Storage Manager
 * Stores recently watched media items locally with deduplication.
 */

const HISTORY_KEY = 'pawtube_history';
const MAX_HISTORY = 100;

let lastProgressSaveTime = 0;
let pendingProgressTimer = null;

import { getPreferences } from '../preferences/preferencesStorage.js';

export function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read history from localStorage:', err);
    return [];
  }
}

export function addToHistory(item) {
  if (!item || !item.id) return;
  const prefs = getPreferences();
  if (prefs.historyEnabled === false) return;

  try {
    const list = getHistory();
    const existing = list.find((i) => i.id === item.id);
    const filtered = list.filter((i) => i.id !== item.id);
    
    filtered.unshift({
      ...existing,
      ...item,
      watchedAt: Date.now(),
      progress: item.progress !== undefined ? item.progress : (existing?.progress || 0),
      duration: item.duration !== undefined ? item.duration : (existing?.duration || 0),
      watchedPercentage: item.watchedPercentage !== undefined ? item.watchedPercentage : (existing?.watchedPercentage || 0)
    });

    if (filtered.length > MAX_HISTORY) {
      filtered.length = MAX_HISTORY;
    }
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to save item to history:', err);
  }
}

export function updateHistoryProgress(videoId, progressSeconds, durationSeconds) {
  if (!videoId || typeof progressSeconds !== 'number') return;
  const prefs = getPreferences();
  if (prefs.historyEnabled === false) return;
  
  const now = Date.now();
  const doSave = () => {
    lastProgressSaveTime = Date.now();
    try {
      const list = getHistory();
      const item = list.find((i) => i.id === videoId);
      if (item) {
        item.progress = Math.floor(progressSeconds);
        if (durationSeconds && durationSeconds > 0) {
          item.duration = Math.floor(durationSeconds);
          item.watchedPercentage = Math.min(100, Math.round((progressSeconds / durationSeconds) * 100));
        }
        item.watchedAt = Date.now();
        localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
      }
    } catch {}
  };

  // Throttle updates: save immediately if > 4s since last save, otherwise schedule
  if (now - lastProgressSaveTime > 4000) {
    clearTimeout(pendingProgressTimer);
    doSave();
  } else {
    clearTimeout(pendingProgressTimer);
    pendingProgressTimer = setTimeout(doSave, 3000);
  }
}

export function removeFromHistory(videoId) {
  if (!videoId) return;
  try {
    const list = getHistory().filter((i) => i.id !== videoId);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch (err) {
    console.error('Failed to remove item from history:', err);
  }
}

export function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch (err) {
    console.error('Failed to clear history:', err);
  }
}
