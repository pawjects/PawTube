/**
 * PawTube - History Storage Manager
 * Stores recently watched media items locally with deduplication.
 */

const HISTORY_KEY = 'pawtube_history';
const MAX_HISTORY = 100;

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
  try {
    const list = getHistory();
    const filtered = list.filter((i) => i.id !== item.id);
    filtered.unshift({
      ...item,
      watchedAt: Date.now()
    });
    if (filtered.length > MAX_HISTORY) {
      filtered.length = MAX_HISTORY;
    }
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to save item to history:', err);
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
