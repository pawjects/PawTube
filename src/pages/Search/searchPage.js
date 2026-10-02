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
          <div class="channel-card" style="grid-column:1 / -1;display:flex;align-items:center;gap:16px;padding:16px;background:var(--bg-surface);border-radius:16px;border:1px solid var(--glass-border);cursor:pointer;transition:transform 0.15s, background 0.15s;" 
            onclick="window.location.hash='#/channel/${encodeURIComponent(channelId)}'">
            <img src="${escapeHtml(avatarUrl)}" alt="" style="width:64px;height:64px;border-radius:50%;object-fit:cover;background:var(--bg-elevated);border:2px solid var(--glass-border);" onerror="this.src='/public/assets/pawtube_logo.png';" />
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:6px;">
                <h3 style="font-size:16px;font-weight:600;margin:0;color:var(--text-primary);">${escapeHtml(channelName)}</h3>
                ${item.verified ? `<span class="material-symbols-rounded" style="font-size:16px;color:var(--brand-blue);" title="Verified">check_circle</span>` : ''}
              </div>
              <p style="font-size:13px;color:var(--text-secondary);margin:4px 0 0;">${escapeHtml(subText)}</p>
              ${item.description ? `<p style="font-size:12px;color:var(--text-tertiary);margin:4px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item.description)}</p>` : ''}
            </div>
            <button type="button" style="padding:8px 20px;border-radius:999px;background:var(--text-primary);color:var(--bg-primary);border:none;font-weight:600;font-size:13px;cursor:pointer;flex-shrink:0;">
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
          <div class="playlist-card" role="button" tabindex="0" aria-label="Playlist: ${escapeHtml(plTitle)}"
            style="grid-column:1 / -1;display:flex;align-items:center;gap:16px;padding:16px;background:var(--bg-surface);border-radius:16px;border:1px solid var(--glass-border);cursor:pointer;transition:transform 0.15s, background 0.15s;" 
            onclick="window.location.hash='#/playlist?list=${encodeURIComponent(plId)}'"
            onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.location.hash='#/playlist?list=${encodeURIComponent(plId)}';}">
            <div style="width:130px;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background:#000;position:relative;flex-shrink:0;box-shadow:var(--shadow-glass);">
              <img src="${escapeHtml(plThumb)}" alt="" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='/public/assets/pawtube_logo.png';" />
              <div style="position:absolute;inset:0;background:linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%);display:flex;align-items:flex-end;padding:6px 8px;">
                <div style="display:flex;align-items:center;gap:4px;color:#fff;font-size:11px;font-weight:600;">
                  <span class="material-symbols-rounded" style="font-size:16px;">playlist_play</span>
                  <span>${escapeHtml(plCount)}</span>
                </div>
              </div>
            </div>
            <div style="flex:1;min-width:0;">
              <div style="display:inline-flex;align-items:center;gap:4px;font-size:11px;text-transform:uppercase;color:var(--brand-blue);font-weight:600;margin-bottom:4px;letter-spacing:0.5px;">
                <span class="material-symbols-rounded" style="font-size:14px;">queue_music</span>
                <span>Playlist</span>
              </div>
              <h3 style="font-size:15px;font-weight:600;color:var(--text-primary);margin:0 0 4px 0;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${escapeHtml(plTitle)}
              </h3>
              <p style="font-size:13px;color:var(--text-secondary);margin:0;">
                ${escapeHtml(plChannel)} &bull; ${escapeHtml(plCount)}
              </p>
            </div>
            <button type="button" style="padding:8px 20px;border-radius:999px;background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--glass-border);font-weight:600;font-size:13px;cursor:pointer;flex-shrink:0;">
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
