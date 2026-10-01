/**
 * PawTube - Client-Side Personalization Engine & Recommendation Layer
 * Lightweight, privacy-first local recommendation layer without external servers or paid AI APIs.
 *
 * Architecture:
 * User Signals
 *      ↓
 * Interest Profile
 *      ↓
 * Candidate Videos
 *      ↓
 * Ranking / Deduplication
 *      ↓
 * Personalized Home Feed
 */

import { getHistory } from '../history/historyStorage.js';
import { getPlaylists } from '../playlists/playlistStorage.js';
import { getSubscriptions, getPreferences } from '../preferences/preferencesStorage.js';
import { getLikedVideos } from '../likes/likesStorage.js';
import { PipedApi } from '../../api/piped/pipedApi.js';

const SEARCH_HISTORY_KEY = 'pawtube_recent_searches';
const CHANNEL_VISITS_KEY = 'pawtube_recent_channel_visits';
const MAX_SEARCHES = 25;
const MAX_CHANNEL_VISITS = 20;

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'your', 'video', 'official',
  'music', 'full', 'song', 'hd', '4k', 'remastered', 'feat', 'ft', 'live', 'episode',
  'part', 'new', 'best', '2024', '2025', '2026', 'lyrics', 'audio', 'teaser', 'trailer',
  'hindi', 'india', 'desi', 'trending', 'today', 'latest', 'shorts', 'short', 'status',
  'video', 'videos', 'watch', 'free', 'online', 'stream', 'season', 'series', 'clip',
  'about', 'after', 'again', 'against', 'all', 'any', 'are', 'been', 'being', 'both',
  'but', 'can', 'could', 'did', 'does', 'doing', 'down', 'during', 'each', 'few', 'more',
  'most', 'other', 'some', 'such', 'than', 'too', 'very', 'what', 'when', 'where', 'which',
  'while', 'who', 'whom', 'why', 'will', 'you', 'your'
]);

// ==========================================
// 1. User Signals Capture: Search & Channel Visits
// ==========================================

export function recordSearchQuery(query) {
  if (!query || typeof query !== 'string') return;
  const prefs = getPreferences();
  if (prefs.searchHistoryEnabled === false) return;

  const clean = query.trim().toLowerCase();
  if (clean.length < 2) return;

  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    let list = raw ? JSON.parse(raw) : [];
    // Deduplicate and move to top with timestamp
    list = [
      { query: clean, timestamp: Date.now() },
      ...list.filter((item) => (typeof item === 'string' ? item : item.query) !== clean)
    ].slice(0, MAX_SEARCHES);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pawtube:searchHistoryChange', { detail: { query: clean } }));
    }
  } catch {}
}

export function getRecentSearches() {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((item) => (typeof item === 'string' ? item : item.query)).filter(Boolean);
  } catch {
    return [];
  }
}

export function clearRecentSearches() {
  try {
    localStorage.removeItem(SEARCH_HISTORY_KEY);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pawtube:searchHistoryChange', { detail: { cleared: true } }));
    }
  } catch {}
}

export function removeRecentSearch(query) {
  if (!query) return;
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const filtered = parsed.filter((item) => (typeof item === 'string' ? item : item.query) !== query);
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(filtered));
  } catch {}
}

export function recordChannelVisit(channel) {
  if (!channel || (!channel.id && !channel.channelId)) return;
  const rawId = channel.id || channel.channelId;
  const id = rawId.replace(/^\/channel\//, '').trim();
  const name = (channel.name || channel.title || channel.author || '').trim();

  try {
    const raw = localStorage.getItem(CHANNEL_VISITS_KEY);
    let list = raw ? JSON.parse(raw) : [];
    list = [
      { id, name, avatar: channel.avatar || '', visitedAt: Date.now() },
      ...list.filter((c) => c.id !== id)
    ].slice(0, MAX_CHANNEL_VISITS);
    localStorage.setItem(CHANNEL_VISITS_KEY, JSON.stringify(list));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pawtube:channelVisit', { detail: { id, name } }));
    }
  } catch {}
}

export function getRecentChannelVisits() {
  try {
    const raw = localStorage.getItem(CHANNEL_VISITS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
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
 * Deterministic hash-based tie-breaker so the feed doesn't randomly jump
 * or completely scramble upon refresh, while still feeling lively.
 */
export function getDeterministicJitter(id) {
  if (!id) return 0;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  // Range: -1.75 to +1.75 points
  return ((Math.abs(hash) % 100) / 100) * 3.5 - 1.75;
}

// ==========================================
// 2. Interest Profile Builder
// ==========================================

export function buildInterestProfile() {
  const history = getHistory();
  const playlists = getPlaylists();
  const subs = getSubscriptions();
  const rawSearches = getRecentSearches();
  const channelVisits = getRecentChannelVisits();
  const likes = getLikedVideos();
  const now = Date.now();

  const channels = {};
  const topics = {};
  const categories = {};
  const completedVideoIds = new Set();
  const inProgressVideoIds = new Set();
  const skippedVideoIds = new Set();
  const watchedVideoIds = new Set();

  let totalWatchSeconds = 0;
  let completionCount = 0;

  // 1. Channel Subscriptions / Follows (Strong explicit loyalty signal)
  subs.forEach((s) => {
    const chName = (s.name || '').toLowerCase().trim();
    const chId = (s.id || '').toLowerCase().trim();
    if (chName) {
      channels[chName] = {
        weight: (channels[chName]?.weight || 0) + 45,
        isFollowed: true,
        count: (channels[chName]?.count || 0) + 1,
        id: chId
      };
    }
    if (chId && chId !== chName) {
      channels[chId] = {
        weight: (channels[chId]?.weight || 0) + 45,
        isFollowed: true,
        count: (channels[chId]?.count || 0) + 1,
        id: chId
      };
    }
  });

  // 2. Liked Videos (Explicit positive evaluation)
  likes.forEach((v) => {
    if (!v || !v.id) return;
    watchedVideoIds.add(v.id);
    const ch = (v.channel || v.author || '').toLowerCase().trim();
    if (ch) {
      channels[ch] = {
        weight: (channels[ch]?.weight || 0) + 22,
        isFollowed: channels[ch]?.isFollowed || false,
        count: (channels[ch]?.count || 0) + 1,
        lastLiked: v.likedAt || now
      };
    }
    extractKeywords(v.title || '').forEach((kw) => {
      topics[kw] = (topics[kw] || 0) + 7;
    });
    if (v.category) {
      const cat = String(v.category).toLowerCase().trim();
      categories[cat] = (categories[cat] || 0) + 8;
    }
  });

  // 3. Channel Visits (Opened channel pages)
  channelVisits.forEach((cv, idx) => {
    const chName = (cv.name || '').toLowerCase().trim();
    const chId = (cv.id || '').toLowerCase().trim();
    const recencyMult = Math.max(0.4, 1 - idx * 0.05);
    if (chName) {
      channels[chName] = {
        weight: (channels[chName]?.weight || 0) + 14 * recencyMult,
        isFollowed: channels[chName]?.isFollowed || false,
        count: (channels[chName]?.count || 0) + 1,
        id: chId
      };
    }
    if (chId && chId !== chName) {
      channels[chId] = {
        weight: (channels[chId]?.weight || 0) + 14 * recencyMult,
        isFollowed: channels[chId]?.isFollowed || false,
        count: (channels[chId]?.count || 0) + 1,
        id: chId
      };
    }
  });

  // 4. Playlists / Watch Later (Curated intent)
  playlists.forEach((pl) => {
    (pl.videos || pl.items || []).forEach((v) => {
      if (!v) return;
      const ch = (v.channel || v.author || '').toLowerCase().trim();
      if (ch) {
        channels[ch] = {
          weight: (channels[ch]?.weight || 0) + 12,
          isFollowed: channels[ch]?.isFollowed || false,
          count: (channels[ch]?.count || 0) + 1
        };
      }
      extractKeywords(v.title || '').forEach((kw) => {
        topics[kw] = (topics[kw] || 0) + 4;
      });
    });
  });

  // 5. Watch History with Time-Decayed Recency & Completion vs. Skipped Analysis
  history.forEach((h, idx) => {
    if (!h || !h.id) return;
    watchedVideoIds.add(h.id);

    // Exponential recency decay (7-day half-life based on real timestamp)
    const watchedTimestamp = h.watchedAt || (now - idx * 3600000 * 4);
    const ageHours = Math.max(0, (now - watchedTimestamp) / (1000 * 60 * 60));
    const recencyMultiplier = Math.max(0.25, Math.exp(-ageHours / (24 * 7)));

    const watchedPct = h.watchedPercentage !== undefined ? h.watchedPercentage : 0;
    const isCompleted = Boolean(h.completed || watchedPct >= 75);
    const isSkipped = !isCompleted && watchedPct < 15 && (h.progress || 0) < 25;

    let engagementFactor = 1.0;
    if (isCompleted) {
      completedVideoIds.add(h.id);
      completionCount++;
      engagementFactor = 1.6; // High satisfaction signal
    } else if (isSkipped) {
      skippedVideoIds.add(h.id);
      engagementFactor = 0.2; // Quick skip / low interest
    } else {
      inProgressVideoIds.add(h.id);
      engagementFactor = 0.9 + (watchedPct / 100) * 0.4;
    }

    if (h.progress) {
      totalWatchSeconds += h.progress;
    }

    // Watch frequency boost if watched multiple times
    const frequencyBoost = 1 + Math.min(1.5, ((h.watchCount || 1) - 1) * 0.35);

    const ch = (h.channel || h.author || '').toLowerCase().trim();
    if (ch) {
      channels[ch] = {
        weight: (channels[ch]?.weight || 0) + 10 * recencyMultiplier * engagementFactor * frequencyBoost,
        isFollowed: channels[ch]?.isFollowed || false,
        count: (channels[ch]?.count || 0) + 1,
        lastWatched: watchedTimestamp
      };
    }

    const keywords = extractKeywords(h.title || '');
    keywords.forEach((kw) => {
      const delta = (isSkipped ? -1.2 : 4.5) * recencyMultiplier * engagementFactor;
      topics[kw] = (topics[kw] || 0) + delta;
    });

    if (h.category) {
      const cat = String(h.category).toLowerCase().trim();
      categories[cat] = (categories[cat] || 0) + 5 * recencyMultiplier * engagementFactor;
    }
  });

  // 6. Recent Searches (Direct active intent)
  rawSearches.forEach((q, idx) => {
    const recencyMultiplier = Math.max(0.4, 1 - idx * 0.05);
    extractKeywords(q).forEach((kw) => {
      topics[kw] = (topics[kw] || 0) + 9 * recencyMultiplier;
    });
  });

  // Extract Top Ranked Interest Topics (clean strings with score > 4)
  const topTopics = Object.entries(topics)
    .filter(([_, score]) => score > 4)
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic)
    .slice(0, 6);

  // Extract Top Favorite Channels
  const topChannels = Object.entries(channels)
    .sort((a, b) => (b[1].weight || 0) - (a[1].weight || 0))
    .slice(0, 5)
    .map(([name, data]) => ({ name, id: data.id, weight: data.weight }));

  // Top candidate query phrases for candidate retrieval
  const topQueries = [];
  if (rawSearches.length > 0) {
    topQueries.push(rawSearches[0]);
  }
  if (topTopics.length > 0) {
    topQueries.push(topTopics[0]);
  }
  if (rawSearches.length > 1 && !topQueries.includes(rawSearches[1])) {
    topQueries.push(rawSearches[1]);
  } else if (topTopics.length > 1 && !topQueries.includes(topTopics[1])) {
    topQueries.push(topTopics[1]);
  }

  const totalInteractions = history.length + subs.length + rawSearches.length + likes.length + channelVisits.length;

  return {
    channels,
    topics,
    categories,
    topTopics,
    topChannels,
    topQueries: Array.from(new Set(topQueries)).slice(0, 3),
    recentSearches: rawSearches,
    watchPatterns: {
      totalWatchedVideos: history.length,
      completedVideos: completedVideoIds,
      inProgressVideos: inProgressVideoIds,
      skippedVideos: skippedVideoIds,
      allWatchedVideoIds: watchedVideoIds,
      totalWatchedSeconds: totalWatchSeconds,
      completionRate: history.length > 0 ? completionCount / history.length : 0
    },
    hasEnoughSignals: totalInteractions >= 2,
    lastUpdated: now
  };
}

// Alias for backwards compatibility
export const buildUserProfile = buildInterestProfile;

// ==========================================
// 3. Candidate Videos Layer
// ==========================================

/**
 * Retrieves candidate videos from both general/trending streams
 * and targeted user interest streams using real Piped endpoints.
 */
export async function fetchPersonalizedCandidates({ activeCategory = 'All', region = 'IN', signal = null } = {}) {
  const prefs = getPreferences();
  const profile = buildInterestProfile();

  // If category is Following
  if (activeCategory === 'Following') {
    const followedChannels = getSubscriptions();
    if (followedChannels.length === 0) {
      return { items: [], profile };
    }
    const responses = await Promise.allSettled(
      followedChannels.slice(0, 6).map((f) => PipedApi.getChannel(f.id, null, { signal }))
    );
    const combined = [];
    responses.forEach((res) => {
      if (res.status === 'fulfilled') {
        const list = res.value?.videos || res.value?.items || [];
        combined.push(...list.filter((i) => i.type !== 'channel'));
      }
    });
    return { items: combined, profile };
  }

  // If category is a specific genre (Music, Gaming, Tech, etc.)
  if (activeCategory !== 'All') {
    const result = await PipedApi.search(activeCategory, 'all', { signal });
    return { items: result?.items || [], profile };
  }

  // Category is 'All': Assemble Candidate Pool (Trending Discovery + User Interests)
  const candidateTasks = [
    // Candidate Source 1: General / Trending discovery feed (always present)
    PipedApi.getTrending(region, { signal }).catch(() => ({ items: [] }))
  ];

  // Candidate Source 2: Targeted Interest Queries (if user has enough signals)
  if (prefs.personalizationEnabled !== false && profile.hasEnoughSignals && profile.topQueries.length > 0) {
    const primaryQuery = profile.topQueries[0];
    if (primaryQuery && primaryQuery.length >= 2) {
      candidateTasks.push(
        PipedApi.search(primaryQuery, 'all', { signal }).catch(() => ({ items: [] }))
      );
    }

    // Optional Candidate Source 3: Secondary interest query or top channel
    if (profile.topQueries.length > 1) {
      const secondaryQuery = profile.topQueries[1];
      candidateTasks.push(
        PipedApi.search(secondaryQuery, 'all', { signal }).catch(() => ({ items: [] }))
      );
    } else if (profile.topChannels.length > 0 && profile.topChannels[0].id) {
      candidateTasks.push(
        PipedApi.getChannel(profile.topChannels[0].id, null, { signal }).then((res) => ({
          items: (res.videos || res.items || []).filter((v) => v.type !== 'channel')
        })).catch(() => ({ items: [] }))
      );
    }
  }

  const results = await Promise.allSettled(candidateTasks);
  const candidatePool = [];

  results.forEach((res) => {
    if (res.status === 'fulfilled' && res.value && Array.isArray(res.value.items)) {
      candidatePool.push(...res.value.items);
    }
  });

  return { items: candidatePool, profile };
}

// ==========================================
// 4. Ranking & Deduplication Layer
// ==========================================

/**
 * Filter out all Shorts and Live content strictly at data processing layer
 */
export function filterNonStandardVideos(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => {
    if (!item || !item.id) return false;

    // 1. Filter out YouTube Shorts using authoritative metadata signals
    if (item.isShort === true) return false;
    if (item.type === 'short' || item.type === 'shorts') return false;
    if (item.url && item.url.includes('/shorts/')) return false;
    if (item.pawtubeUrl && item.pawtubeUrl.includes('/shorts/')) return false;
    const titleLower = (item.title || '').toLowerCase();
    if (titleLower.includes('#shorts') || titleLower.includes('#short')) {
      return false;
    }

    // 2. Filter out Live streams / broadcasts / premieres using metadata
    if (item.isLive === true) return false;
    if (item.liveNow === true) return false;
    if (item.type === 'live' || item.type === 'livestream' || item.type === 'live_stream') return false;
    const durSec = item.durationSeconds !== undefined ? item.durationSeconds : item.duration;
    if (typeof durSec === 'number' && durSec < 0) return false;
    const durStr = String(item.durationFormatted || '').toUpperCase();
    if (durStr === 'LIVE' || durStr.includes('LIVE')) return false;
    if (item.badges && Array.isArray(item.badges) && item.badges.some((b) => /LIVE|PREMIERE/i.test(String(b)))) {
      return false;
    }

    return true;
  });
}

/**
 * Multi-Signal Ranking & Deduplication:
 * - Strict deduplication by video ID
 * - Channel affinity weighting (followed, watched frequency)
 * - Topic / keyword affinity scoring (recency decayed)
 * - Search query alignment
 * - Repetition penalty (avoid spammed/completed videos)
 * - Unseen & Fresh discovery boost
 * - Deterministic pseudo-random jitter (stable across refreshes)
 * - Channel diversity guard (max 2 videos per creator in top results)
 */
export function rankFeedItems(rawItems, customProfile = null) {
  if (!rawItems || !Array.isArray(rawItems) || rawItems.length === 0) {
    return [];
  }

  // 1. Strictly filter Shorts/Live and deduplicate by video ID
  const filtered = filterNonStandardVideos(rawItems);
  const seenIds = new Set();
  const deduped = [];
  for (const item of filtered) {
    if (!item || !item.id || seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    deduped.push(item);
  }

  const prefs = getPreferences();
  if (prefs.personalizationEnabled === false || prefs.useWatchHistoryForRecommendations === false) {
    return deduped;
  }

  const profile = customProfile || buildInterestProfile();

  // If user has insufficient interactions, return the original fresh provider order
  if (!profile.hasEnoughSignals) {
    return deduped;
  }

  const { channels, topics, categories, watchPatterns, recentSearches } = profile;
  const recentSearchesSet = new Set(recentSearches.map((s) => s.toLowerCase()));

  // Score candidate items
  const scored = deduped.map((item, index) => {
    // Preserve natural discovery rank as solid base so trending content blends in
    const baseRankScore = (deduped.length - index) * 1.5;
    let score = baseRankScore;

    const chName = (item.channel || item.author || '').toLowerCase().trim();
    const chId = (item.channelId || item.authorId || '').toLowerCase().trim();

    // 1. Channel signal: Subscribed / Frequently watched
    const channelProfile = channels[chName] || channels[chId];
    if (channelProfile) {
      if (channelProfile.isFollowed) {
        score += 42; // Followed channel strong boost
      }
      // Frequently watched weight
      score += Math.min(34, (channelProfile.weight || 0) * 1.25);
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
        matchedKwScore += topics[kw] * 1.4;
      }
    });
    score += Math.min(28, matchedKwScore);

    // 4. Category match
    if (item.category) {
      const cat = String(item.category).toLowerCase().trim();
      if (categories[cat]) {
        score += Math.min(16, categories[cat] * 1.2);
      }
    }

    // 5. Fresh upload boost (within 48 hours)
    const uploadedLower = (item.uploadedFormatted || item.uploadedDate || '').toLowerCase();
    if (
      uploadedLower.includes('hour') ||
      uploadedLower.includes('minute') ||
      uploadedLower.includes('just now') ||
      uploadedLower.includes('1 day ago') ||
      uploadedLower.includes('yesterday')
    ) {
      score += 8;
    }

    // 6. Unseen content boost
    if (!watchPatterns.allWatchedVideoIds.has(item.id)) {
      score += 14;
    }

    // NEGATIVE SIGNALS / REPETITION PENALTY:
    // Avoid repeatedly showing already completed videos in home feed
    if (watchPatterns.completedVideos.has(item.id)) {
      score -= 38;
    }

    // Demote in-progress videos slightly so Continue Watching shelf handles them
    if (watchPatterns.inProgressVideos.has(item.id)) {
      score -= 14;
    }

    // Demote skipped videos
    if (watchPatterns.skippedVideos && watchPatterns.skippedVideos.has(item.id)) {
      score -= 22;
    }

    // Add stable deterministic jitter (based on video ID hash) to prevent feed jumping on refresh
    score += getDeterministicJitter(item.id);

    return {
      item,
      finalScore: score,
      channelKey: chName || chId || 'unknown'
    };
  });

  // Sort descending by score
  scored.sort((a, b) => b.finalScore - a.finalScore);

  // Apply Channel Diversity Guard:
  // Prevent any single creator from overwhelming the top 14 recommendations
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

export default {
  recordSearchQuery,
  getRecentSearches,
  clearRecentSearches,
  removeRecentSearch,
  recordChannelVisit,
  getRecentChannelVisits,
  extractKeywords,
  buildInterestProfile,
  buildUserProfile,
  fetchPersonalizedCandidates,
  filterNonStandardVideos,
  rankFeedItems
};
