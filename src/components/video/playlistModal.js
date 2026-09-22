/**
 * PawTube - Add to Playlist Modal
 * Allows saving a video to existing playlists, creating new playlists,
 * or removing from playlists locally without requiring server/database.
 */

import { getPlaylists, addToPlaylist, removeFromPlaylist, createPlaylist } from '../../storage/playlists/playlistStorage.js';
import { showToast } from '../common/toast.js';
import { escapeHtml } from '../../utils/dom.js';

export function showPlaylistModal(video) {
  if (!video || !video.id) return;

  // Remove any existing modal
  const existing = document.getElementById('pawtube-playlist-modal');
  if (existing) existing.remove();

  const modalEl = document.createElement('div');
  modalEl.id = 'pawtube-playlist-modal';
  modalEl.className = 'modal-overlay';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.setAttribute('aria-label', 'Save video to playlist');

  const renderContent = () => {
    const playlists = getPlaylists();
    const playlistItemsHtml = playlists.map((pl) => {
      const isIncluded = (pl.items || []).some((item) => item.id === video.id);
      return `
        <label class="playlist-modal-row" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-radius:10px;background:var(--bg-elevated);cursor:pointer;transition:background 0.2s;user-select:none;">
          <div style="display:flex;align-items:center;gap:12px;">
            <span class="material-symbols-rounded" style="color:${isIncluded ? 'var(--brand-blue)' : 'var(--text-secondary)'};font-size:22px;">
              ${isIncluded ? 'check_box' : 'check_box_outline_blank'}
            </span>
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--text-primary);">${escapeHtml(pl.name)}</div>
              <div style="font-size:12px;color:var(--text-secondary);">${(pl.items || []).length} videos</div>
            </div>
          </div>
          <input type="checkbox" data-playlist-id="${escapeHtml(pl.id)}" ${isIncluded ? 'checked' : ''} style="display:none;" />
        </label>
      `;
    }).join('');

    return `
      <div class="modal-card" style="max-width:440px;width:100%;padding:22px;background:var(--glass-surface);backdrop-filter:var(--blur-lg);border:1px solid var(--glass-border);border-radius:18px;box-shadow:var(--shadow-float);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:10px;">
            <span class="material-symbols-rounded" style="color:var(--brand-blue);font-size:24px;">playlist_add</span>
            <h3 style="font-size:18px;font-weight:700;margin:0;">Save to Playlist</h3>
          </div>
          <button id="close-playlist-modal-btn" class="icon-btn" aria-label="Close" style="width:36px;height:36px;background:transparent;border:none;color:var(--text-secondary);cursor:pointer;border-radius:50%;">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>

        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${escapeHtml(video.title || 'Selected Video')}
        </div>

        <!-- Playlist Checklist -->
        <div id="playlist-checkbox-list" style="display:flex;flex-direction:column;gap:8px;max-height:240px;overflow-y:auto;margin-bottom:18px;padding-right:4px;">
          ${playlistItemsHtml}
        </div>

        <!-- Create New Playlist Accordion / Form -->
        <div style="border-top:1px solid var(--glass-border-light);padding-top:14px;">
          <div id="create-playlist-trigger" style="display:flex;align-items:center;gap:8px;color:var(--brand-blue);font-size:14px;font-weight:600;cursor:pointer;padding:6px 0;">
            <span class="material-symbols-rounded" style="font-size:20px;">add</span>
            <span>Create new playlist</span>
          </div>
          <div id="create-playlist-form" style="display:none;margin-top:10px;gap:8px;flex-direction:column;">
            <input 
              type="text" 
              id="new-playlist-name-input" 
              placeholder="Enter playlist title..." 
              maxlength="60"
              style="width:100%;padding:10px 14px;border-radius:10px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-primary);font-size:14px;outline:none;" 
            />
            <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:4px;">
              <button id="cancel-create-playlist-btn" style="padding:8px 14px;border-radius:8px;background:transparent;border:1px solid var(--glass-border);color:var(--text-secondary);font-size:13px;cursor:pointer;">
                Cancel
              </button>
              <button id="submit-create-playlist-btn" style="padding:8px 18px;border-radius:8px;background:var(--brand-blue);color:#fff;border:none;font-size:13px;font-weight:600;cursor:pointer;">
                Create & Save
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  };

  modalEl.innerHTML = renderContent();
  document.body.appendChild(modalEl);

  const bindEvents = () => {
    // Close button
    modalEl.querySelector('#close-playlist-modal-btn')?.addEventListener('click', () => {
      modalEl.remove();
    });

    // Backdrop click
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) {
        modalEl.remove();
      }
    });

    // Checkbox toggles
    const list = modalEl.querySelector('#playlist-checkbox-list');
    list?.querySelectorAll('.playlist-modal-row').forEach((row) => {
      row.addEventListener('click', (e) => {
        const checkbox = row.querySelector('input[type="checkbox"]');
        if (!checkbox) return;
        const plId = checkbox.getAttribute('data-playlist-id');
        const willBeChecked = !checkbox.checked;
        checkbox.checked = willBeChecked;

        if (willBeChecked) {
          addToPlaylist(plId, {
            id: video.id,
            title: video.title || 'YouTube Video',
            channel: video.channel || video.author || '',
            author: video.author || video.channel || '',
            thumb: video.thumb || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
            durationFormatted: video.durationFormatted || ''
          });
          showToast('Added to playlist', 'success');
        } else {
          removeFromPlaylist(plId, video.id);
          showToast('Removed from playlist', 'info');
        }

        // Re-render modal to refresh counts and icon states
        modalEl.innerHTML = renderContent();
        bindEvents();
      });
    });

    // Create playlist accordion
    const trigger = modalEl.querySelector('#create-playlist-trigger');
    const form = modalEl.querySelector('#create-playlist-form');
    const input = modalEl.querySelector('#new-playlist-name-input');
    const cancelBtn = modalEl.querySelector('#cancel-create-playlist-btn');
    const submitBtn = modalEl.querySelector('#submit-create-playlist-btn');

    trigger?.addEventListener('click', () => {
      trigger.style.display = 'none';
      form.style.display = 'flex';
      input?.focus();
    });

    cancelBtn?.addEventListener('click', () => {
      form.style.display = 'none';
      trigger.style.display = 'flex';
      if (input) input.value = '';
    });

    const handleCreate = () => {
      const name = input?.value?.trim();
      if (!name) {
        showToast('Please enter a playlist name', 'warning');
        return;
      }
      const newPl = createPlaylist(name);
      if (newPl) {
        addToPlaylist(newPl.id, {
          id: video.id,
          title: video.title || 'YouTube Video',
          channel: video.channel || video.author || '',
          author: video.author || video.channel || '',
          thumb: video.thumb || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
          durationFormatted: video.durationFormatted || ''
        });
        showToast(`Created "${name}" & saved video`, 'success');
        modalEl.innerHTML = renderContent();
        bindEvents();
      }
    };

    submitBtn?.addEventListener('click', handleCreate);
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleCreate();
      if (e.key === 'Escape') modalEl.remove();
    });
  };

  bindEvents();

  // Escape key closes modal
  const handleKeydown = (e) => {
    if (e.key === 'Escape') {
      modalEl.remove();
      window.removeEventListener('keydown', handleKeydown);
    }
  };
  window.addEventListener('keydown', handleKeydown);
}
