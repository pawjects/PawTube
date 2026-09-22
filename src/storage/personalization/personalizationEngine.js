/**
 * PawTube - Client-Side Personalization Engine
 * Lightweight local preference scoring without any external server or database.
 * Pipeline: Piped India Content -> Normalize -> Local Relevance Score -> Deduplication -> Filter Recently Finished -> Render
 */

import { getHistory } from '../history/historyStorage.js';
import { getPlaylists } from '../playlists/playlistStorage.js';
import { getSubscriptions } from '../preferences/preferencesStorage.js';

const SEARCH_HISTORY_KEY = 'pawtube_recent_searches';
const MAX_SEARCHES = 15;

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'your', 'video', 'official',
  'music', 'full', 'song', 'hd', '4k', 'remastered', 'feat', 'ft', 'live', 'episode',
  'part', 'new', 'best', '2024', '2025', '2026', 'lyrics', 'audio', 'teaser', 'trailer'
]);

export function recordSearchQuery(query) {
  if (!query || typeof query !== 'string') return;
  const clean = query.trim().toLowerCase();
  if (clean.length < 2) return;

  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    let list = raw ? JSON.parse(raw) : [];
    list = [clean, ...list.filter((q) => q !== clean)].slice(0, MAX_SEARCHES);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list));
  } catch {}
}

export function getRecentSearches() {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Build lightweight local user preference weights based on:
 * - Watch history (watched channels, titles, watch duration/progress)
 * - Saved playlists
 * - Subscribed channels
 * - Recent search queries
 */
export function buildUserProfile() {
  const history = getHistory();
  const playlists = getPlaylists();
  const subs = getSubscriptions();
  const searches = getRecentSearches();

  const channelWeights = new Map();
  const keywordWeights = new Map();

  // 1. Process Channel Subscriptions / Follows (strongest positive signal)
  subs.forEach((s) => {
    const name = (s.name || '').toLowerCase().trim();
    const id = (s.id || '').toLowerCase().trim();
    if (name) channelWeights.set(name, (channelWeights.get(name) || 0) + 35);
    if (id) channelWeights.set(id, (channelWeights.get(id) || 0) + 35);
  });

  // 2. Process Saved Playlists
  playlists.forEach((pl) => {
    (pl.videos || []).forEach((v) => {
      const ch = (v.channel || v.author || '').toLowerCase().trim();
      if (ch) channelWeights.set(ch, (channelWeights.get(ch) || 0) + 8);
      extractKeywords(v.title || '').forEach((kw) => {
        keywordWeights.set(kw, (keywordWeights.get(kw) || 0) + 3);
      });
    });
  });

  // 3. Process Watch History
  history.forEach((h, idx) => {
    const recencyMultiplier = Math.max(0.3, 1 - idx * 0.03); // More recent videos have higher weight
    const ch = (h.channel || h.author || '').toLowerCase().trim();
    if (ch) {
      channelWeights.set(ch, (channelWeights.get(ch) || 0) + 6 * recencyMultiplier);
    }
    extractKeywords(h.title || '').forEach((kw) => {
      keywordWeights.set(kw, (keywordWeights.get(kw) || 0) + 2 * recencyMultiplier);
    });
  });

  // 4. Process Recent Searches
  searches.forEach((q, idx) => {
    const recencyMultiplier = Math.max(0.4, 1 - idx * 0.05);
    extractKeywords(q).forEach((kw) => {
      keywordWeights.set(kw, (keywordWeights.get(kw) || 0) + 4 * recencyMultiplier);
    });
  });

  const totalInteractions = history.length + subs.length + searches.length;
  return {
    channelWeights,
    keywordWeights,
    hasEnoughHistory: totalInteractions >= 2,
    history
  };
}

function extractKeywords(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

/**
 * Personalized Feed Ranking Pipeline:
 * Piped India content -> deduplicate -> score against local profile -> re-rank -> filter recently finished
 */
export function rankFeedItems(rawItems) {
  if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
    return [];
  }

  // 1. Deduplicate items by ID
  const seenIds = new Set();
  const deduped = [];
  for (const item of rawItems) {
    if (item && item.id && !seenIds.has(item.id)) {
      seenIds.add(item.id);
      deduped.push(item);
    }
  }

  const profile = buildUserProfile();

  // If user is fresh with no history, return clean India feed normally in original order
  if (!profile.hasEnoughHistory) {
    return deduped;
  }

  // Build recently fully watched lookup (watched > 85% in the last 3 hours)
  const recentlyCompleted = new Set();
  const now = Date.now();
  profile.history.forEach((h) => {
    if (h.id && h.watchedAt && now - h.watchedAt < 3 * 3600 * 1000) {
      if (h.watchedPercentage && h.watchedPercentage > 85) {
        recentlyCompleted.add(h.id);
      }
    }
  });

  // 2. Compute local relevance score for each item
  const scored = deduped.map((item, index) => {
    // Preserve natural trending rank as foundation so high-ranking India trends remain strong
    const baseRankScore = (deduped.length - index) * 3;
    let relevanceScore = 0;

    const ch = (item.channel || item.author || '').toLowerCase().trim();
    const chId = (item.channelId || item.authorId || (item.uploaderUrl ? item.uploaderUrl.replace(/^\/channel\//, '') : '')).toLowerCase().trim();
    if (ch && profile.channelWeights.has(ch)) {
      relevanceScore += Math.min(60, profile.channelWeights.get(ch) * 2.5);
    } else if (chId && profile.channelWeights.has(chId)) {
      relevanceScore += Math.min(60, profile.channelWeights.get(chId) * 2.5);
    }

    const keywords = extractKeywords(item.title || '');
    let matchedKwScore = 0;
    keywords.forEach((kw) => {
      if (profile.keywordWeights.has(kw)) {
        matchedKwScore += profile.keywordWeights.get(kw) * 1.5;
      }
    });
    relevanceScore += Math.min(40, matchedKwScore);

    // Minor penalty if video was already completed recently
    if (recentlyCompleted.has(item.id)) {
      relevanceScore -= 30;
    }

    const finalScore = baseRankScore + relevanceScore;
    return { item, finalScore };
  });

  // 3. Sort by finalScore descending
  scored.sort((a, b) => b.finalScore - a.finalScore);

  return scored.map((s) => s.item);
}
