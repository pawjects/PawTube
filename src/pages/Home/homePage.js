/**
 * PawTube - Home Page
 * Discovery feed with local personalization ranking and clean responsive liquid-glass presentation.
 */

import { PipedApi } from '../../api/piped/pipedApi.js';
import { isAbortError } from '../../api/client/apiClient.js';
import { renderVideoCard, renderSkeletonCards, renderErrorState } from '../../components/video/videoCard.js';
import { getHistory } from '../../storage/history/historyStorage.js';
import { getFollowedChannels, getPreferences } from '../../storage/preferences/preferencesStorage.js';
import { rankFeedItems } from '../../storage/personalization/personalizationEngine.js';
import { escapeHtml } from '../../utils/dom.js';

const CATEGORIES = ['All', 'Following', 'Music', 'Gaming', 'News', 'Tech', 'Animation', 'Podcasts'];
let activeCategory = 'All';
let homeRenderSeq = 0;

// Client-side cache to enable immediate rendering without flickering
const feedCache = new Map();
const CACHE_TTL_MS = 180000; // 3 minutes

export async function renderHomePage(container, options = {}) {
  const { forceRefresh = false } = options;
  const currentSeq = ++homeRenderSeq;

  const prefs = getPreferences();
  const history = getHistory();
  const continueWatching = history.slice(0, 4);
  const followedChannels = getFollowedChannels();
  const currentRegion = (prefs.region || 'IN').toUpperCase();

  // Check cached feed for immediate zero-flicker render
  const cachedEntry = feedCache.get(activeCategory);
  const hasValidCache = cachedEntry && Array.isArray(cachedEntry.items) && cachedEntry.items.length > 0;
  const isCacheFresh = hasValidCache && Date.now() - cachedEntry.timestamp < CACHE_TTL_MS;

  let html = `
    <div class="category-bar">
      ${CATEGORIES.map((cat) => `
        <button class="category-chip ${cat === activeCategory ? 'active' : ''}" data-category="${escapeHtml(cat)}">
          ${escapeHtml(cat)}
        </button>
      `).join('')}
      <button class="category-chip refresh-chip" id="feed-refresh-btn" title="Refresh feed" style="margin-left:auto;display:flex;align-items:center;gap:4px;">
        <span class="material-symbols-rounded" style="font-size:16px;">refresh</span>
        <span>Refresh</span>
      </button>
    </div>
  `;

  if (continueWatching.length > 0 && activeCategory === 'All') {
    html += `
      <div class="section-header">
        <h2 class="section-title">
          <span class="material-symbols-rounded">history</span>
          Continue Watching
        </h2>
      </div>
      <div class="continue-watching-rail">
        ${continueWatching.map((v) => `
          <div class="continue-card" onclick="window.location.hash='#/watch?v=${encodeURIComponent(v.id)}${v.progress ? `&t=${Math.floor(v.progress)}` : ''}'">
            <div class="continue-thumb-wrap" style="position:relative;overflow:hidden;border-radius:10px;">
              <img src="${escapeHtml(v.thumb || '')}" alt="${escapeHtml(v.title)}" loading="lazy" />
              <div class="duration-badge">${escapeHtml(v.durationFormatted || (v.duration ? Math.floor(v.duration / 60) + ':' + (v.duration % 60 < 10 ? '0' : '') + (v.duration % 60) : '0:00'))}</div>
              ${(v.progress && v.watchedPercentage) ? `
                <div style="position:absolute;bottom:0;left:0;right:0;height:3.5px;background:rgba(255,255,255,0.25);">
                  <div style="height:100%;background:var(--brand-red);width:${Math.min(100, Math.max(0, v.watchedPercentage))}%;"></div>
                </div>
              ` : ''}
            </div>
            <div class="card-title" style="font-size:13.5px;margin-top:6px;">${escapeHtml(v.title)}</div>
            <div class="card-channel" style="font-size:12px;">${escapeHtml(v.channel || v.author || '')}</div>
          </div>
        `).join('')}
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
      ${hasValidCache ? rankFeedItems(filterShorts(cachedEntry.items, prefs)).map(renderVideoCard).join('') : renderSkeletonCards(8)}
    </div>
  `;

  container.innerHTML = html;

  // Bind category chips
  container.querySelectorAll('.category-chip[data-category]').forEach((chip) => {
    chip.addEventListener('click', () => {
      activeCategory = chip.getAttribute('data-category');
      renderHomePage(container);
    });
  });

  // Bind explicit refresh button
  container.querySelector('#feed-refresh-btn')?.addEventListener('click', () => {
    renderHomePage(container, { forceRefresh: true });
  });

  const grid = container.querySelector('#home-grid');
  if (!grid) return;

  // If activeCategory is 'Following' and user has no followed channels
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

  // If cache is fresh and forceRefresh was not requested, we're done
  if (isCacheFresh && !forceRefresh) {
    return;
  }

  // Fetch fresh content asynchronously
  try {
    let result;
    if (activeCategory === 'All') {
      result = await PipedApi.getTrending(currentRegion);
    } else if (activeCategory === 'Following') {
      const responses = await Promise.allSettled(
        followedChannels.slice(0, 6).map((f) => PipedApi.getChannel(f.id))
      );
      const combined = [];
      responses.forEach((res) => {
        if (res.status === 'fulfilled' && res.value?.items) {
          combined.push(...res.value.items.filter((i) => i.type !== 'channel'));
        }
      });
      result = { items: combined };
    } else {
      result = await PipedApi.search(activeCategory, 'all');
    }

    if (currentSeq !== homeRenderSeq) return;

    let items = result?.items || [];
    
    // Save to local feed cache if items were returned
    if (items.length > 0) {
      feedCache.set(activeCategory, {
        items,
        timestamp: Date.now()
      });
    }

    // Apply filters and personalization
    const filteredItems = filterShorts(items, prefs);
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
    if (currentSeq !== homeRenderSeq || isAbortError(err)) return;
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('abort') || msg.includes('signal') || msg.includes('cancel')) return;

    console.warn('Home feed fetch error:', err?.message || err);
    if (currentSeq === homeRenderSeq && grid) {
      if (hasValidCache) {
        // Fall back to stale cache if network failed
        grid.innerHTML = rankFeedItems(filterShorts(cachedEntry.items, prefs)).map(renderVideoCard).join('');
      } else {
        grid.innerHTML = renderErrorState('Unable to load feed', 'Could not reach Piped instances. Tap retry to reconnect.', 'window.pawtubeRetryHomeFeed');
        window.pawtubeRetryHomeFeed = () => renderHomePage(container, { forceRefresh: true });
      }
    }
  }
}

function filterShorts(items, prefs) {
  if (!Array.isArray(items)) return [];
  if (!prefs.hideShorts) return items;
  return items.filter((item) => !item.isShort && !(item.duration && item.duration <= 60 && item.duration > 0));
}

export default renderHomePage;
