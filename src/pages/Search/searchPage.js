/**
 * PawTube - Search Results Page with Filters, AbortController & Responsive Layout
 */

import { PipedApi } from '../../api/piped/pipedApi.js';
import { renderVideoCard, renderSkeletonCards, renderErrorState } from '../../components/video/videoCard.js';
import { recordSearchQuery } from '../../storage/personalization/personalizationEngine.js';
import { escapeHtml } from '../../utils/dom.js';
import { isAbortError } from '../../api/client/apiClient.js';
import { cleanText, normalizePlaylistItem } from '../../api/normalization/mediaModels.js';

let searchSeq = 0;
let currentSearchAbortController = null;
let currentFilter = 'all';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'videos', label: 'Videos' },
  { id: 'channels', label: 'Channels' },
  { id: 'playlists', label: 'Playlists' }
];

export async function renderSearchPage(container, query) {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) {
    window.location.hash = '#/home';
    return;
  }

  // Cancel any in-flight search request so previous results never overwrite newer ones
  if (currentSearchAbortController) {
    currentSearchAbortController.abort();
    currentSearchAbortController = null;
  }
  currentSearchAbortController = new AbortController();
  const signal = currentSearchAbortController.signal;
  const currentSeq = ++searchSeq;

  // Record for local search history
  recordSearchQuery(cleanQuery);

  // Sync header search input value and clear button
  const headerSearchInput = document.getElementById('header-search');
  if (headerSearchInput && headerSearchInput.value !== cleanQuery) {
    headerSearchInput.value = cleanQuery;
  }
  const clearBtn = document.getElementById('search-clear-btn');
  if (clearBtn) {
    clearBtn.style.display = cleanQuery ? 'flex' : 'none';
  }

  container.innerHTML = `
    <div style="max-width:1200px;margin:0 auto;padding-bottom:60px;">
      <!-- Search Header & Title -->
      <div class="section-header" style="margin-bottom:16px;">
        <h2 class="section-title" style="display:flex;align-items:center;gap:8px;font-size:20px;">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">search</span>
          Results for "${escapeHtml(cleanQuery)}"
        </h2>
      </div>

      <!-- Search Filter Chips -->
      <div class="category-bar" style="margin-bottom:20px;">
        ${FILTERS.map((f) => `
          <button type="button" class="category-chip ${f.id === currentFilter ? 'active' : ''}" data-filter="${f.id}" aria-label="Filter by ${escapeHtml(f.label)}">
            ${escapeHtml(f.label)}
          </button>
        `).join('')}
      </div>

      <!-- Results Grid -->
      <div class="video-grid" id="search-grid">
        ${renderSkeletonCards(8)}
      </div>
    </div>
  `;

  // Bind filter chips
  container.querySelectorAll('.category-chip[data-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      currentFilter = chip.getAttribute('data-filter') || 'all';
      renderSearchPage(container, cleanQuery);
    });
  });

  const grid = container.querySelector('#search-grid');
  if (!grid) return;

  try {
    const res = await PipedApi.search(cleanQuery, currentFilter, { signal });
    if (currentSeq !== searchSeq) return;

    const items = res?.items || [];

    if (items.length === 0) {
      grid.innerHTML = `
        <div style="grid-column:1 / -1;padding:60px 20px;text-align:center;color:var(--text-secondary);">
          <span class="material-symbols-rounded" style="font-size:48px;color:var(--text-tertiary);margin-bottom:12px;">search_off</span>
          <h3 style="font-size:18px;color:var(--text-primary);margin-bottom:6px;">No results found</h3>
          <p>Try searching for different keywords or changing your filter.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = items.map((item) => {
      if (item.type === 'channel') {
        const rawId = item.id || item.channelId || (item.url ? item.url.replace(/^\/channel\//, '') : '') || item.name || '';
        const channelId = String(rawId).replace(/^\/channel\//, '').trim();
        const channelName = item.title || item.name || item.channel || 'Channel';
        const avatarUrl = item.avatar || item.thumb || item.thumbnail || '';
        let subText = 'Channel';
        if (item.subscribers) {
          const s = item.subscribers;
          subText = s >= 1000000 ? `${(s/1000000).toFixed(1)}M subscribers` : s >= 1000 ? `${(s/1000).toFixed(1)}K subscribers` : `${s} subscribers`;
        } else if (item.viewsFormatted) {
          subText = item.viewsFormatted;
        }

        return `
          <div class="search-channel-card channel-card" role="button" tabindex="0" aria-label="Channel: ${escapeHtml(channelName)}"
            onclick="window.location.hash='#/channel/${encodeURIComponent(channelId)}'"
            onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.location.hash='#/channel/${encodeURIComponent(channelId)}';}">
            <img class="search-channel-avatar" src="${escapeHtml(avatarUrl)}" alt="" onerror="this.src='/public/assets/pawtube_logo.png';" />
            <div class="search-channel-info">
              <div class="search-channel-title-row">
                <h3 class="search-channel-title">${escapeHtml(channelName)}</h3>
                ${item.verified ? `<span class="material-symbols-rounded search-verified-badge" title="Verified">check_circle</span>` : ''}
              </div>
              <p class="search-channel-sub">${escapeHtml(subText)}</p>
              ${item.description ? `<p class="search-channel-desc">${escapeHtml(item.description)}</p>` : ''}
            </div>
            <button type="button" class="search-channel-btn" aria-label="View Channel">
              View Channel
            </button>
          </div>
        `;
      }
      if (item.type === 'playlist') {
        const pl = normalizePlaylistItem(item) || item;
        const plId = pl.id;
        const plTitle = cleanText(pl.title || pl.name, 'Playlist');
        const plChannel = cleanText(pl.channel || pl.author, 'YouTube Channel');
        const plCount = pl.durationFormatted || 'Playlist';
        const plThumb = pl.thumb || pl.thumbnail || '';

        return `
          <div class="search-playlist-card playlist-card" role="button" tabindex="0" aria-label="Playlist: ${escapeHtml(plTitle)}"
            onclick="window.location.hash='#/playlist?list=${encodeURIComponent(plId)}'"
            onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.location.hash='#/playlist?list=${encodeURIComponent(plId)}';}">
            <div class="search-playlist-thumb-wrap">
              <img src="${escapeHtml(plThumb)}" alt="" onerror="this.src='/public/assets/pawtube_logo.png';" />
              <div class="search-playlist-overlay">
                <div class="search-playlist-badge">
                  <span class="material-symbols-rounded">playlist_play</span>
                  <span>${escapeHtml(plCount)}</span>
                </div>
              </div>
            </div>
            <div class="search-playlist-info">
              <div class="search-playlist-tag">
                <span class="material-symbols-rounded">queue_music</span>
                <span>Playlist</span>
              </div>
              <h3 class="search-playlist-title">${escapeHtml(plTitle)}</h3>
              <p class="search-playlist-meta">
                <span class="search-playlist-channel">${escapeHtml(plChannel)}</span>
                <span class="meta-dot">&bull;</span>
                <span class="search-playlist-count">${escapeHtml(plCount)}</span>
              </p>
            </div>
            <button type="button" class="search-playlist-btn" aria-label="View Playlist">
              View Playlist
            </button>
          </div>
        `;
      }
      return renderVideoCard(item);
    }).join('');
  } catch (err) {
    if (currentSeq !== searchSeq) return;
    if (isAbortError(err)) return; // Silently ignore aborted requests
    console.error('Search error:', err);
    grid.innerHTML = renderErrorState('Search failed', err.message || 'Unable to retrieve search results.', 'window.pawtubeRetrySearch');
    window.pawtubeRetrySearch = () => renderSearchPage(container, cleanQuery);
  }
}

export default renderSearchPage;
