/**
 * PawTube - Search Results Page
 */

import { PipedApi } from '../../api/piped/pipedApi.js';
import { renderVideoCard, renderSkeletonCards, renderErrorState } from '../../components/video/videoCard.js';
import { escapeHtml } from '../../utils/dom.js';

export async function renderSearchPage(container, query) {
  if (!query || !query.trim()) {
    window.location.hash = '#/home';
    return;
  }

  container.innerHTML = `
    <div style="max-width:1200px;margin:0 auto;padding-bottom:60px;">
      <div class="section-header" style="margin-bottom:20px;">
        <h2 class="section-title" style="display:flex;align-items:center;gap:8px;font-size:20px;">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">search</span>
          Results for "${escapeHtml(query)}"
        </h2>
      </div>
      <div class="video-grid" id="search-grid">
        ${renderSkeletonCards(8)}
      </div>
    </div>
  `;

  const grid = container.querySelector('#search-grid');
  if (!grid) return;

  try {
    const res = await PipedApi.search(query.trim());
    const items = res?.items || [];

    if (items.length === 0) {
      grid.innerHTML = `
        <div style="grid-column:1 / -1;padding:60px 20px;text-align:center;color:var(--text-secondary);">
          <span class="material-symbols-rounded" style="font-size:48px;color:var(--text-tertiary);margin-bottom:12px;">search_off</span>
          <h3 style="font-size:18px;color:var(--text-primary);margin-bottom:6px;">No results found</h3>
          <p>Try searching for different keywords.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = items.map((item) => {
      if (item.type === 'channel') {
        return `
          <div class="channel-card" style="grid-column:1 / -1;display:flex;align-items:center;gap:16px;padding:16px;background:var(--bg-surface);border-radius:16px;border:1px solid var(--glass-border);cursor:pointer;" onclick="window.location.hash='#/channel?id=${encodeURIComponent(item.id)}'">
            <img src="${escapeHtml(item.avatar || '')}" alt="" style="width:56px;height:56px;border-radius:50%;object-fit:cover;background:var(--bg-elevated);" onerror="this.style.display='none'" />
            <div style="flex:1;">
              <h3 style="font-size:16px;font-weight:600;">${escapeHtml(item.title)}</h3>
              <p style="font-size:13px;color:var(--text-secondary);">${escapeHtml(item.viewsFormatted || 'Channel')}</p>
            </div>
            <button style="padding:6px 16px;border-radius:999px;background:var(--text-primary);color:var(--bg-primary);border:none;font-weight:600;font-size:13px;">View</button>
          </div>
        `;
      }
      return renderVideoCard(item);
    }).join('');
  } catch (err) {
    console.error('Search error:', err);
    grid.innerHTML = renderErrorState('Search failed', err.message, 'window.pawtubeRetrySearch');
    window.pawtubeRetrySearch = () => renderSearchPage(container, query);
  }
}

export default renderSearchPage;
