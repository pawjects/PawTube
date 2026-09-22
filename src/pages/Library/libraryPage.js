/**
 * PawTube - Library (History & Playlists) Page
 */

import { getHistory, clearHistory, removeFromHistory } from '../../storage/history/historyStorage.js';
import { getPlaylists, createPlaylist, deletePlaylist } from '../../storage/playlists/playlistStorage.js';
import { getFollowedChannels } from '../../storage/preferences/preferencesStorage.js';
import { renderVideoCard } from '../../components/video/videoCard.js';
import { showToast } from '../../components/common/toast.js';
import { escapeHtml } from '../../utils/dom.js';

export function renderLibraryPage(container) {
  const history = getHistory();
  const playlists = getPlaylists();
  const followed = getFollowedChannels();

  container.innerHTML = `
    <div class="library-container" style="max-width:1200px;margin:0 auto;padding-bottom:60px;">
      <!-- Followed Channels Section -->
      <div class="section-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h2 class="section-title" style="display:flex;align-items:center;gap:8px;font-size:20px;font-weight:700;">
          <span class="material-symbols-rounded">subscriptions</span>
          Followed Channels (${followed.length})
        </h2>
      </div>

      ${followed.length > 0 ? `
        <div class="followed-rail" style="display:flex;gap:14px;overflow-x:auto;padding-bottom:12px;margin-bottom:36px;scrollbar-width:none;">
          ${followed.map((f) => `
            <div class="followed-card" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px;min-width:96px;max-width:110px;background:var(--bg-surface);border-radius:14px;border:1px solid var(--glass-border);cursor:pointer;text-align:center;transition:transform 0.15s;" 
              onclick="window.location.hash='#/channel/${encodeURIComponent(f.id)}'">
              <div style="width:52px;height:52px;border-radius:50%;overflow:hidden;background:var(--bg-elevated);border:2px solid var(--glass-border);display:flex;align-items:center;justify-content:center;">
                ${f.avatar ? `<img src="${escapeHtml(f.avatar)}" alt="" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='/public/assets/pawtube_logo.png';" />` : `<span class="material-symbols-rounded" style="color:var(--text-secondary);">person</span>`}
              </div>
              <span style="font-size:12px;font-weight:500;color:var(--text-primary);width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(f.name)}">
                ${escapeHtml(f.name)}
              </span>
            </div>
          `).join('')}
        </div>
      ` : `
        <div style="padding:20px;text-align:center;color:var(--text-secondary);background:var(--bg-surface);border-radius:14px;border:1px solid var(--glass-border-light);margin-bottom:36px;">
          <p style="font-size:13px;margin:0;">No followed channels yet. Follow creators you like to quickly access them here.</p>
        </div>
      `}

      <!-- History Section -->
      <div class="section-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h2 class="section-title" style="display:flex;align-items:center;gap:8px;font-size:20px;font-weight:700;">
          <span class="material-symbols-rounded">history</span>
          Watch History (${history.length})
        </h2>
        ${history.length > 0 ? `
          <button id="clear-history-btn" style="padding:6px 14px;border-radius:999px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-secondary);font-size:13px;cursor:pointer;">
            Clear History
          </button>
        ` : ''}
      </div>

      ${history.length > 0 ? `
        <div class="video-grid" style="margin-bottom:40px;">
          ${history.slice(0, 12).map(renderVideoCard).join('')}
        </div>
      ` : `
        <div style="padding:32px;text-align:center;color:var(--text-secondary);background:var(--bg-surface);border-radius:16px;border:1px solid var(--glass-border-light);margin-bottom:40px;">
          <p>No watch history yet. Videos you watch will appear here.</p>
        </div>
      `}

      <!-- Playlists Section -->
      <div class="section-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h2 class="section-title" style="display:flex;align-items:center;gap:8px;font-size:20px;font-weight:700;">
          <span class="material-symbols-rounded">playlist_play</span>
          Playlists
        </h2>
        <button id="new-playlist-btn" style="display:flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:var(--brand-blue);color:#fff;border:none;font-size:13px;font-weight:600;cursor:pointer;">
          <span class="material-symbols-rounded" style="font-size:18px;">add</span>
          New Playlist
        </button>
      </div>

      <div class="playlists-grid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(260px, 1fr));gap:16px;">
        ${playlists.map((pl) => `
          <div class="playlist-card" style="padding:16px;background:var(--bg-surface);border-radius:16px;border:1px solid var(--glass-border);position:relative;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
              <div style="width:44px;height:44px;border-radius:10px;background:rgba(62,166,255,0.1);display:flex;align-items:center;justify-content:center;color:var(--brand-blue);">
                <span class="material-symbols-rounded">video_library</span>
              </div>
              <div style="flex:1;overflow:hidden;">
                <h4 style="font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(pl.name)}</h4>
                <p style="font-size:12px;color:var(--text-secondary);">${pl.items?.length || 0} videos</p>
              </div>
            </div>
            ${pl.items && pl.items.length > 0 ? `
              <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                Latest: ${escapeHtml(pl.items[0].title)}
              </div>
            ` : `
              <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:12px;">Empty playlist</div>
            `}
            <div style="display:flex;gap:8px;">
              ${pl.items && pl.items.length > 0 ? `
                <button onclick="window.location.hash='#/watch?v=${encodeURIComponent(pl.items[0].id)}'" style="flex:1;padding:6px 12px;border-radius:8px;background:var(--bg-elevated);border:1px solid var(--glass-border);font-size:13px;cursor:pointer;">
                  Play
                </button>
              ` : ''}
              ${pl.id !== 'watch-later' && pl.id !== 'favorites' ? `
                <button class="delete-pl-btn" data-pl-id="${escapeHtml(pl.id)}" style="padding:6px 10px;border-radius:8px;background:transparent;border:1px solid var(--glass-border);color:var(--brand-red);font-size:13px;cursor:pointer;">
                  Delete
                </button>
              ` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Bind clear history
  container.querySelector('#clear-history-btn')?.addEventListener('click', () => {
    if (confirm('Clear all watch history?')) {
      clearHistory();
      showToast('History cleared', 'info');
      renderLibraryPage(container);
    }
  });

  // Bind new playlist
  container.querySelector('#new-playlist-btn')?.addEventListener('click', () => {
    const name = prompt('Enter playlist name:');
    if (name && name.trim()) {
      createPlaylist(name.trim());
      showToast('Playlist created', 'success');
      renderLibraryPage(container);
    }
  });

  // Bind delete playlist
  container.querySelectorAll('.delete-pl-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-pl-id');
      if (confirm('Delete this playlist?')) {
        deletePlaylist(id);
        showToast('Playlist deleted', 'info');
        renderLibraryPage(container);
      }
    });
  });
}

export default renderLibraryPage;
