/**
 * PawTube - Client-Side Personalization Engine
 * Lightweight local preference scoring without any external server or telemetry.
 * Non-AI heuristic ranking using locally stored user signals:
 * - Watch history & completion rates
 * - Subscribed/followed channels
 * - Liked videos & playlists
 * - Recent search queries & topics
 */

import { getHistory } from '../history/historyStorage.js';
import { getPlaylists } from '../playlists/playlistStorage.js';
import { getSubscriptions, getPreferences } from '../preferences/preferencesStorage.js';
import { getLikedVideos } from '../likes/likesStorage.js';

const SEARCH_HISTORY_KEY = 'pawtube_recent_searches';
const MAX_SEARCHES = 20;

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'your', 'video', 'official',
  'music', 'full', 'song', 'hd', '4k', 'remastered', 'feat', 'ft', 'live', 'episode',
  'part', 'new', 'best', '2024', '2025', '2026', 'lyrics', 'audio', 'teaser', 'trailer',
  'hindi', 'india', 'desi', 'trending', 'today', 'latest', 'shorts', 'short', 'status'
]);

export function recordSearchQuery(query) {
  if (!query || typeof query !== 'string') return;
  const prefs = getPreferences();
  if (prefs.searchHistoryEnabled === false) return;

  const clean = query.trim().toLowerCase();
  if (clean.length < 2) return;

  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    let list = raw ? JSON.parse(raw) : [];
    // Deduplicate and move to top
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

export function clearRecentSearches() {
  try {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
  } catch {}
}

export function removeRecentSearch(query) {
  if (!query) return;
  try {
    const list = getRecentSearches().filter((q) => q !== query);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list));
  } catch {}
}

export function extractKeywords(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

/**
 * Builds the structured local interest profile:
 * {
 *   channels: {},
 *   topics: {},
 *   categories: {},
 *   recentSearches: [],
 *   watchPatterns: {},
 *   lastUpdated: ...
 * }
 */
export function buildUserProfile() {
  const history = getHistory();
  const playlists = getPlaylists();
  const subs = getSubscriptions();
  const searches = getRecentSearches();
  const likes = getLikedVideos();
  const now = Date.now();

  const channels = {};
  const topics = {};
  const categories = {};
  const completedIds = new Set();
  const inProgressIds = new Set();
  const watchedVideoIds = new Set();

  let totalWatchSeconds = 0;
  let completionCount = 0;

  // 1. Process Channel Subscriptions / Follows (strongest positive signal)
  subs.forEach((s) => {
    const chName = (s.name || '').toLowerCase().trim();
    const chId = (s.id || '').toLowerCase().trim();
    if (chName) {
      channels[chName] = { weight: (channels[chName]?.weight || 0) + 40, isFollowed: true, count: (channels[chName]?.count || 0) + 1 };
    }
    if (chId && chId !== chName) {
      channels[chId] = { weight: (channels[chId]?.weight || 0) + 40, isFollowed: true, count: (channels[chId]?.count || 0) + 1 };
    }
  });

  // 2. Process Liked Videos
  likes.forEach((v) => {
    if (!v) return;
    watchedVideoIds.add(v.id);
    const ch = (v.channel || v.author || '').toLowerCase().trim();
    if (ch) {
      channels[ch] = {
        weight: (channels[ch]?.weight || 0) + 18,
        isFollowed: channels[ch]?.isFollowed || false,
        count: (channels[ch]?.count || 0) + 1
      };
    }
    extractKeywords(v.title || '').forEach((kw) => {
      topics[kw] = (topics[kw] || 0) + 5;
    });
    if (v.category) {
      const cat = String(v.category).toLowerCase().trim();
      categories[cat] = (categories[cat] || 0) + 6;
    }
  });

  // 3. Process Playlists / Watch Later
  playlists.forEach((pl) => {
    (pl.videos || pl.items || []).forEach((v) => {
      if (!v) return;
      const ch = (v.channel || v.author || '').toLowerCase().trim();
      if (ch) {
        channels[ch] = {
          weight: (channels[ch]?.weight || 0) + 10,
          isFollowed: channels[ch]?.isFollowed || false,
          count: (channels[ch]?.count || 0) + 1
        };
      }
      extractKeywords(v.title || '').forEach((kw) => {
        topics[kw] = (topics[kw] || 0) + 3;
      });
    });
  });

  // 4. Process Watch History with completion rate awareness & recency
  history.forEach((h, idx) => {
    if (!h || !h.id) return;
    watchedVideoIds.add(h.id);

    const recencyMultiplier = Math.max(0.3, 1 - idx * 0.025);
    const watchedPct = h.watchedPercentage || 0;
    const isCompleted = Boolean(h.completed || watchedPct >= 90);

    if (isCompleted) {
      completedIds.add(h.id);
      completionCount++;
    } else if (watchedPct >= 10 && watchedPct < 90) {
      inProgressIds.add(h.id);
    }

    if (h.progress) {
      totalWatchSeconds += h.progress;
    }

    const engagementBoost = isCompleted ? 1.4 : (watchedPct >= 40 ? 1.2 : (watchedPct < 10 ? 0.4 : 0.9));
    const ch = (h.channel || h.author || '').toLowerCase().trim();
    if (ch) {
      channels[ch] = {
        weight: (channels[ch]?.weight || 0) + 8 * recencyMultiplier * engagementBoost,
        isFollowed: channels[ch]?.isFollowed || false,
        count: (channels[ch]?.count || 0) + 1,
        lastWatched: h.watchedAt || now
      };
    }

    extractKeywords(h.title || '').forEach((kw) => {
      topics[kw] = (topics[kw] || 0) + 3 * recencyMultiplier * engagementBoost;
    });

    if (h.category) {
      const cat = String(h.category).toLowerCase().trim();
      categories[cat] = (categories[cat] || 0) + 4 * recencyMultiplier;
    }
  });

  // 5. Process Recent Searches
  searches.forEach((q, idx) => {
    const recencyMultiplier = Math.max(0.4, 1 - idx * 0.04);
    extractKeywords(q).forEach((kw) => {
      topics[kw] = (topics[kw] || 0) + 5 * recencyMultiplier;
    });
  });

  const totalInteractions = history.length + subs.length + searches.length + likes.length;

  return {
    channels,
    topics,
    categories,
    recentSearches: searches,
    watchPatterns: {
      totalWatchedVideos: history.length,
      completedVideos: completedIds,
      inProgressVideos: inProgressIds,
      allWatchedVideoIds: watchedVideoIds,
      totalWatchedSeconds: totalWatchSeconds,
      completionRate: history.length > 0 ? completionCount / history.length : 0,
      lastWatchedTimestamp: history[0]?.watchedAt || 0
    },
    hasEnoughHistory: totalInteractions >= 2,
    lastUpdated: now
  };
}

/**
 * Multi-Signal Feed Ranking:
 * 1. Filter out live streams & shorts strictly
 * 2. Deduplicate by video ID
 * 3. Score candidates with positive and negative signals
 * 4. Introduce non-deterministic diversity jitter
 * 5. Apply channel diversity guard
 */
export function rankFeedItems(rawItems) {
  if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
    return [];
  }

  // Deduplicate items by ID
  const seenIds = new Set();
  const deduped = [];
  for (const item of rawItems) {
    if (!item || !item.id || seenIds.has(item.id)) continue;
    // Skip Shorts or Live
    if (item.isShort === true || item.isLive === true) continue;
    seenIds.add(item.id);
    deduped.push(item);
  }

  const prefs = getPreferences();
  if (prefs.personalizationEnabled === false || prefs.useWatchHistoryForRecommendations === false) {
    return deduped;
  }

  const profile = buildUserProfile();

  // If user has insufficient interactions, return the original fresh provider order
  if (!profile.hasEnoughHistory) {
    return deduped;
  }

  const { channels, topics, categories, watchPatterns, recentSearches } = profile;
  const recentSearchesSet = new Set(recentSearches.map((s) => s.toLowerCase()));

  // Score candidate items
  const scored = deduped.map((item, index) => {
    // Preserve natural discovery rank as solid base
    const baseRankScore = (deduped.length - index) * 2.5;
    let score = baseRankScore;

    const chName = (item.channel || item.author || '').toLowerCase().trim();
    const chId = (item.channelId || item.authorId || '').toLowerCase().trim();

    // 1. Channel signal: Subscribed / Frequently watched
    const channelProfile = channels[chName] || channels[chId];
    if (channelProfile) {
      if (channelProfile.isFollowed) {
        score += 42; // Followed channel boost
      }
      // Frequently watched weight
      score += Math.min(32, (channelProfile.weight || 0) * 1.2);
    }

    // 2. Matching recent search query
    const titleLower = (item.title || '').toLowerCase();
    for (const sq of recentSearchesSet) {
      if (sq.length >= 3 && titleLower.includes(sq)) {
        score += 24;
        break;
      }
    }

    // 3. Matching recently watched topics/keywords
    const keywords = extractKeywords(item.title || '');
    let matchedKwScore = 0;
    keywords.forEach((kw) => {
      if (topics[kw]) {
        matchedKwScore += topics[kw] * 1.5;
      }
    });
    score += Math.min(28, matchedKwScore);

    // 4. Category match
    if (item.category) {
      const cat = String(item.category).toLowerCase().trim();
      if (categories[cat]) {
        score += Math.min(15, categories[cat] * 1.2);
      }
    }

    // 5. Fresh upload boost (within 48 hours)
    const uploadedLower = (item.uploadedFormatted || item.uploadedDate || '').toLowerCase();
    if (uploadedLower.includes('hour') || uploadedLower.includes('minute') || uploadedLower.includes('just now') || uploadedLower.includes('1 day ago')) {
      score += 10;
    }

    // 6. Unseen content boost
    if (!watchPatterns.allWatchedVideoIds.has(item.id)) {
      score += 12;
    }

    // NEGATIVE SIGNALS:
    // Penalty if already completed repeatedly/recently to prevent repetition
    if (watchPatterns.completedVideos.has(item.id)) {
      score -= 38;
    }

    // Demote in-progress videos slightly so Continue Watching shelf handles them and Home feed stays fresh
    if (watchPatterns.inProgressVideos.has(item.id)) {
      score -= 14;
    }

    // Add mild diversity jitter (+- 3.5 points) so the feed doesn't feel robotic or frozen
    const jitter = (Math.random() - 0.5) * 7.0;
    score += jitter;

    return {
      item,
      finalScore: score,
      channelKey: chName || chId || 'unknown'
    };
  });

  // Sort descending by score
  scored.sort((a, b) => b.finalScore - a.finalScore);

  // Apply Channel Diversity Guard:
  // Prevent any single creator from overwhelming the top 15 recommendations
  const ranked = [];
  const deferred = [];
  const channelCount = new Map();

  for (const s of scored) {
    const count = channelCount.get(s.channelKey) || 0;
    if (count >= 2 && ranked.length < 14) {
      deferred.push(s.item);
    } else {
      channelCount.set(s.channelKey, count + 1);
      ranked.push(s.item);
    }
  }

  return [...ranked, ...deferred];
}
