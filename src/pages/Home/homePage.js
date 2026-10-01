/**
 * PawTube - Home Page
 * Discovery feed powered by multi-signal local recommendation layer and liquid-glass presentation.
 *
 * Flow:
 * User Signals -> Interest Profile -> Candidate Videos -> Ranking / Deduplication -> Personalized Home Feed
 */

import { isAbortError } from '../../api/client/apiClient.js';
import { renderVideoCard, renderSkeletonCards, renderErrorState, renderCompactVideoCard } from '../../components/video/videoCard.js';
import { getContinueWatching } from '../../storage/history/historyStorage.js';
import { getFollowedChannels, getPreferences } from '../../storage/preferences/preferencesStorage.js';
import {
  buildInterestProfile,
  fetchPersonalizedCandidates,
  rankFeedItems,
  filterNonStandardVideos
} from '../../storage/personalization/personalizationEngine.js';
import { escapeHtml } from '../../utils/dom.js';

const CATEGORIES = ['All', 'Following', 'Music', 'Gaming', 'News', 'Tech', 'Animation', 'Podcasts'];
let activeCategory = 'All';
let homeRenderSeq = 0;
let homeAbortController = null;
let userActivityDirty = false;

// Listen to local user activity events to mark feed as needing re-ranking
if (typeof window !== 'undefined') {
  window.addEventListener('pawtube:historyChange', () => { userActivityDirty = true; });
  window.addEventListener('pawtube:likeChange', () => { userActivityDirty = true; });
  window.addEventListener('pawtube:subChange', () => { userActivityDirty = true; });
  window.addEventListener('pawtube:followChange', () => { userActivityDirty = true; });
  window.addEventListener('pawtube:searchHistoryChange', () => { userActivityDirty = true; });
  window.addEventListener('pawtube:channelVisit', () => { userActivityDirty = true; });
}

// Client-side cache to enable immediate rendering without flickering
const feedCache = new Map();
const CACHE_TTL_MS = 120000; // 2 minutes

export async function renderHomePage(container, options = {}) {
  const { forceRefresh = false } = options;
  const currentSeq = ++homeRenderSeq;

  // Cancel any in-flight home requests
  if (homeAbortController) {
    homeAbortController.abort();
  }
  homeAbortController = new AbortController();
  const signal = homeAbortController.signal;

  const prefs = getPreferences();
  const continueWatching = getContinueWatching().slice(0, 4);
  const followedChannels = getFollowedChannels();
  const currentRegion = (prefs.region || 'IN').toUpperCase();
  const profile = buildInterestProfile();

  // Check cached feed
  const cachedEntry = feedCache.get(activeCategory);
  const hasValidCache = cachedEntry && Array.isArray(cachedEntry.items) && cachedEntry.items.length > 0;
  const isCacheFresh = hasValidCache && !forceRefresh && (Date.now() - cachedEntry.timestamp < CACHE_TTL_MS);

  let initialRenderItems = [];
  if (hasValidCache) {
    const filteredCached = filterNonStandardVideos(cachedEntry.items);
    initialRenderItems = rankFeedItems(filteredCached, profile);
  }

  let html = `
    <div class="category-bar">
      ${CATEGORIES.map((cat) => `
        <button class="category-chip ${cat === activeCategory ? 'active' : ''}" data-category="${escapeHtml(cat)}">
          ${escapeHtml(cat)}
        </button>
      `).join('')}
      <button class="category-chip refresh-chip" id="feed-refresh-btn" title="Refresh feed" aria-label="Refresh feed" style="margin-left:auto;display:flex;align-items:center;gap:4px;">
        <span class="material-symbols-rounded" style="font-size:16px;">refresh</span>
        <span>Refresh</span>
      </button>
    </div>
  `;

  // Continue Watching Shelf
  if (continueWatching.length > 0 && activeCategory === 'All') {
    html += `
      <div class="section-header" style="margin-bottom:12px;">
        <h2 class="section-title">
          <span class="material-symbols-rounded" style="color:var(--brand-red);">play_circle</span>
          Continue Watching
        </h2>
      </div>
      <div class="compact-video-grid" style="margin-bottom:28px;">
        ${continueWatching.map((v) => renderCompactVideoCard(v, { isContinueWatching: true })).join('')}
      </div>
    `;
  }

  // From Your Subscriptions / Followed Channels Rail
  if (followedChannels.length > 0 && activeCategory === 'All') {
    html += `
      <div class="section-header" style="margin-top:14px;">
        <h2 class="section-title">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">subscriptions</span>
          From Your Subscriptions
        </h2>
      </div>
      <div class="followed-home-rail" style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;margin-bottom:18px;scrollbar-width:none;">
        ${followedChannels.map((f) => `
          <div class="followed-pill-item" style="display:flex;align-items:center;gap:8px;padding:6px 14px 6px 6px;border-radius:999px;background:var(--bg-surface);border:1px solid var(--glass-border);cursor:pointer;flex-shrink:0;transition:transform 0.15s, background 0.15s;"
            onclick="window.location.hash='#/channel/${encodeURIComponent(f.id)}'">
            <div style="width:28px;height:28px;border-radius:50%;overflow:hidden;background:var(--bg-elevated);flex-shrink:0;display:flex;align-items:center;justify-content:center;">
              ${f.avatar ? `<img src="${escapeHtml(f.avatar)}" alt="" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='/public/assets/pawtube_logo.png';" />` : `<span class="material-symbols-rounded" style="font-size:16px;">person</span>`}
            </div>
            <span style="font-size:13px;font-weight:500;color:var(--text-primary);max-width:130px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(f.name)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Section title based on personalization state
  let sectionTitle;
  let sectionIcon;
  if (activeCategory === 'All') {
    if (profile.hasEnoughSignals && prefs.personalizationEnabled !== false) {
      sectionTitle = `Recommended for You`;
      sectionIcon = 'auto_awesome';
    } else {
      sectionTitle = `Trending (${currentRegion})`;
      sectionIcon = 'local_fire_department';
    }
  } else if (activeCategory === 'Following') {
    sectionTitle = 'Latest from Followed Channels';
    sectionIcon = 'subscriptions';
  } else {
    sectionTitle = escapeHtml(activeCategory);
    sectionIcon = 'local_fire_department';
  }

  html += `
    <div class="section-header" style="display:flex;align-items:center;justify-content:space-between;">
      <h2 class="section-title">
        <span class="material-symbols-rounded" style="${sectionIcon === 'auto_awesome' ? 'color:var(--brand-blue);' : ''}">${sectionIcon}</span>
        ${sectionTitle}
      </h2>
    </div>
    <div class="video-grid" id="home-grid">
      ${hasValidCache && !forceRefresh ? initialRenderItems.map(renderVideoCard).join('') : renderSkeletonCards(8)}
    </div>
  `;

  container.innerHTML = html;

  // Bind category chips
  container.querySelectorAll('.category-chip[data-category]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const nextCategory = chip.getAttribute('data-category');
      if (nextCategory === activeCategory) return;
      activeCategory = nextCategory;
      renderHomePage(container);
    });
  });

  // Bind explicit refresh button
  container.querySelector('#feed-refresh-btn')?.addEventListener('click', () => {
    const refreshBtn = container.querySelector('#feed-refresh-btn');
    if (refreshBtn) {
      refreshBtn.classList.add('loading');
    }
    renderHomePage(container, { forceRefresh: true });
  });

  const grid = container.querySelector('#home-grid');
  if (!grid) return;

  // If Following tab with no followed channels
  if (activeCategory === 'Following' && followedChannels.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 60px 20px; text-align: center; color: var(--text-secondary); background: var(--bg-surface); border-radius: 18px; border: 1px solid var(--glass-border); margin: 20px 0;">
        <span class="material-symbols-rounded" style="font-size: 52px; color: var(--text-tertiary); margin-bottom: 12px; display: inline-block;">subscriptions</span>
        <h3 style="font-size: 19px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">No Followed Channels Yet</h3>
        <p style="font-size: 14px; max-width: 440px; margin: 0 auto 20px; line-height: 1.5;">Follow channels and creators to see their latest uploads aggregated here without requiring a YouTube or Google account.</p>
        <button id="explore-trending-btn" style="padding: 10px 24px; border-radius: 999px; background: var(--text-primary); color: var(--bg-primary); border: none; font-size: 14px; font-weight: 600; cursor: pointer;">Explore Trending</button>
      </div>
    `;
    container.querySelector('#explore-trending-btn')?.addEventListener('click', () => {
      activeCategory = 'All';
      renderHomePage(container);
    });
    return;
  }

  // If cache is fresh and no activity change occurred and not forced, we are done
  if (isCacheFresh && !userActivityDirty && !forceRefresh) {
    return;
  }

  // If cache exists but user had recent activity, re-rank immediately
  if (hasValidCache && userActivityDirty && !forceRefresh) {
    userActivityDirty = false;
    const reFiltered = filterNonStandardVideos(cachedEntry.items);
    const reRanked = rankFeedItems(reFiltered, profile);
    if (grid && currentSeq === homeRenderSeq) {
      grid.innerHTML = reRanked.map(renderVideoCard).join('');
    }
    // Perform background refresh if near stale
    if (Date.now() - cachedEntry.timestamp < CACHE_TTL_MS * 0.7) {
      return;
    }
  }

  // Fetch Candidate Videos Layer asynchronously (Real Piped candidates)
  try {
    const { items: rawCandidates, profile: freshProfile } = await fetchPersonalizedCandidates({
      activeCategory,
      region: currentRegion,
      signal
    });

    if (currentSeq !== homeRenderSeq || signal.aborted) return;

    // Filter out all Shorts and live broadcasts strictly at data processing layer
    const filteredCandidates = filterNonStandardVideos(rawCandidates);

    // Save to local feed cache if items were returned
    if (filteredCandidates.length > 0) {
      feedCache.set(activeCategory, {
        items: filteredCandidates,
        timestamp: Date.now()
      });
      userActivityDirty = false;
    }

    // Ranking / Deduplication Layer:
    // Multi-signal scoring with topic/channel affinity, recency decay, completion boost, repetition penalty
    const personalizedItems = rankFeedItems(filteredCandidates, freshProfile);

    if (grid && currentSeq === homeRenderSeq) {
      if (personalizedItems.length === 0) {
        grid.innerHTML = `
          <div style="grid-column: 1 / -1; padding: 60px 20px; text-align: center; color: var(--text-secondary);">
            <span class="material-symbols-rounded" style="font-size: 48px; color: var(--text-tertiary); margin-bottom: 12px;">video_library</span>
            <h3 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">No Videos Available</h3>
            <p style="font-size: 14px;">Could not find streams for this section. Please try again.</p>
          </div>
        `;
      } else {
        grid.innerHTML = personalizedItems.map(renderVideoCard).join('');
      }
    }
  } catch (err) {
    if (currentSeq !== homeRenderSeq || isAbortError(err) || signal.aborted) return;
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('abort') || msg.includes('signal') || msg.includes('cancel')) return;

    console.warn('Home feed fetch error:', err?.message || err);
    if (currentSeq === homeRenderSeq && grid) {
      if (hasValidCache) {
        // Fall back to stale cache if network failed
        const fallbackItems = rankFeedItems(filterNonStandardVideos(cachedEntry.items), profile);
        grid.innerHTML = fallbackItems.map(renderVideoCard).join('');
      } else {
        grid.innerHTML = renderErrorState('Unable to load feed', 'Could not reach Piped instances. Tap retry to reconnect.', 'window.pawtubeRetryHomeFeed');
        window.pawtubeRetryHomeFeed = () => renderHomePage(container, { forceRefresh: true });
      }
    }
  }
}

export default renderHomePage;
