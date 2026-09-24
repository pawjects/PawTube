/**
 * PawTube - Home Page
 * Discovery feed with local personalization ranking and clean responsive liquid-glass presentation.
 */

import { PipedApi } from '../../api/piped/pipedApi.js';
import { isAbortError } from '../../api/client/apiClient.js';
import { renderVideoCard, renderSkeletonCards, renderErrorState, renderCompactVideoCard } from '../../components/video/videoCard.js';
import { getHistory, getContinueWatching } from '../../storage/history/historyStorage.js';
import { getFollowedChannels, getPreferences } from '../../storage/preferences/preferencesStorage.js';
import { rankFeedItems } from '../../storage/personalization/personalizationEngine.js';
import { formatDuration } from '../../api/normalization/mediaModels.js';
import { escapeHtml } from '../../utils/dom.js';

const CATEGORIES = ['All', 'Following', 'Music', 'Gaming', 'News', 'Tech', 'Animation', 'Podcasts'];
let activeCategory = 'All';
let homeRenderSeq = 0;
let homeAbortController = null;
let userActivityDirty = false;

// Listen to local user activity to mark feed as needing re-ranking
if (typeof window !== 'undefined') {
  window.addEventListener('pawtube:historyChange', () => { userActivityDirty = true; });
  window.addEventListener('pawtube:likeChange', () => { userActivityDirty = true; });
  window.addEventListener('pawtube:subChange', () => { userActivityDirty = true; });
}

// Client-side cache to enable immediate rendering without flickering
const feedCache = new Map();
const CACHE_TTL_MS = 120000; // 2 minutes

/**
 * Filter out all Shorts and Live content strictly at data processing layer
 */
export function filterHomeFeedItems(items) {
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
  const history = getHistory();
  const continueWatching = getContinueWatching().slice(0, 4);
  const followedChannels = getFollowedChannels();
  const currentRegion = (prefs.region || 'IN').toUpperCase();

  // Check cached feed
  const cachedEntry = feedCache.get(activeCategory);
  const hasValidCache = cachedEntry && Array.isArray(cachedEntry.items) && cachedEntry.items.length > 0;
  const isCacheFresh = hasValidCache && !forceRefresh && (Date.now() - cachedEntry.timestamp < CACHE_TTL_MS);

  let initialRenderItems = [];
  if (hasValidCache) {
    const filteredCached = filterHomeFeedItems(cachedEntry.items);
    initialRenderItems = rankFeedItems(filteredCached);
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

  const categoryTitle = activeCategory === 'All' 
    ? `Trending (${currentRegion})` 
    : (activeCategory === 'Following' ? 'Latest from Followed Channels' : escapeHtml(activeCategory));

  html += `
    <div class="section-header" style="display:flex;align-items:center;justify-content:space-between;">
      <h2 class="section-title">
        <span class="material-symbols-rounded">${activeCategory === 'All' ? 'auto_awesome' : (activeCategory === 'Following' ? 'subscriptions' : 'local_fire_department')}</span>
        ${categoryTitle}
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
    const reFiltered = filterHomeFeedItems(cachedEntry.items);
    const reRanked = rankFeedItems(reFiltered);
    if (grid && currentSeq === homeRenderSeq) {
      grid.innerHTML = reRanked.map(renderVideoCard).join('');
    }
    // Still perform background refresh if near stale
    if (Date.now() - cachedEntry.timestamp < CACHE_TTL_MS * 0.7) {
      return;
    }
  }

  // Fetch fresh content asynchronously
  try {
    let result;
    if (activeCategory === 'All') {
      result = await PipedApi.getTrending(currentRegion, { signal });
    } else if (activeCategory === 'Following') {
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
      result = { items: combined };
    } else {
      result = await PipedApi.search(activeCategory, 'all', { signal });
    }

    if (currentSeq !== homeRenderSeq || signal.aborted) return;

    let items = result?.items || [];
    
    // 1. Filter out all Shorts and live broadcasts strictly at data processing layer
    const filteredItems = filterHomeFeedItems(items);

    // Save to local feed cache if items were returned
    if (filteredItems.length > 0) {
      feedCache.set(activeCategory, {
        items: filteredItems,
        timestamp: Date.now()
      });
      userActivityDirty = false;
    }

    // 2. Personalize and re-rank with local signals
    const personalizedItems = rankFeedItems(filteredItems);

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
        const fallbackItems = rankFeedItems(filterHomeFeedItems(cachedEntry.items));
        grid.innerHTML = fallbackItems.map(renderVideoCard).join('');
      } else {
        grid.innerHTML = renderErrorState('Unable to load feed', 'Could not reach Piped instances. Tap retry to reconnect.', 'window.pawtubeRetryHomeFeed');
        window.pawtubeRetryHomeFeed = () => renderHomePage(container, { forceRefresh: true });
      }
    }
  }
}

export default renderHomePage;
