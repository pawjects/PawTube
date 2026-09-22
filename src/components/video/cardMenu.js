/**
 * PawTube - Video Card Context/Overflow Action Menu
 */

import { addToPlaylist, removeFromPlaylist, isVideoInPlaylist } from '../../storage/playlists/playlistStorage.js';
import { showToast } from '../common/toast.js';
import { escapeHtml } from '../../utils/dom.js';

let activeMenu = null;

function closeActiveMenu() {
  if (activeMenu) {
    activeMenu.remove();
    activeMenu = null;
  }
}

document.addEventListener('click', (e) => {
  if (activeMenu && !activeMenu.contains(e.target)) {
    closeActiveMenu();
  }
});

window.addEventListener('resize', closeActiveMenu, { passive: true });
window.addEventListener('scroll', closeActiveMenu, { passive: true });

export function openCardMenu(buttonEl, event, videoId, videoTitle, channelId, channelName) {
  if (!videoId) return;
  closeActiveMenu();

  const isSavedWatchLater = isVideoInPlaylist('watch-later', videoId);
  const pawtubeUrl = `${window.location.origin}/#/watch?v=${encodeURIComponent(videoId)}`;
  const youtubeUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const channelUrl = channelId ? `#/channel/${encodeURIComponent(channelId)}` : '';

  const menu = document.createElement('div');
  menu.className = 'card-overflow-dropdown';
  menu.style.cssText = `
    position: fixed;
    z-index: 9999;
    min-width: 200px;
    background: var(--bg-elevated);
    border: 1px solid var(--glass-border);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-radius: 14px;
    box-shadow: var(--shadow-float);
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    animation: fadeIn 0.15s ease-out;
  `;

  menu.innerHTML = `
    <button type="button" class="card-menu-item" id="cmenu-play" style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;border:none;background:transparent;color:var(--text-primary);font-size:13px;cursor:pointer;width:100%;text-align:left;">
      <span class="material-symbols-rounded" style="font-size:18px;color:var(--brand-blue);">play_circle</span>
      <span>Play video</span>
    </button>

    <button type="button" class="card-menu-item" id="cmenu-watchlater" style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;border:none;background:transparent;color:var(--text-primary);font-size:13px;cursor:pointer;width:100%;text-align:left;">
      <span class="material-symbols-rounded" style="font-size:18px;color:${isSavedWatchLater ? 'var(--brand-blue)' : 'var(--text-secondary)'};">
        ${isSavedWatchLater ? 'bookmark_added' : 'bookmark_add'}
      </span>
      <span>${isSavedWatchLater ? 'Remove from Watch Later' : 'Save to Watch Later'}</span>
    </button>

    ${channelUrl ? `
      <button type="button" class="card-menu-item" id="cmenu-channel" style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;border:none;background:transparent;color:var(--text-primary);font-size:13px;cursor:pointer;width:100%;text-align:left;">
        <span class="material-symbols-rounded" style="font-size:18px;color:var(--text-secondary);">account_circle</span>
        <span>Go to channel</span>
      </button>
    ` : ''}

    <div style="height:1px;background:var(--glass-border-light);margin:4px 0;"></div>

    <button type="button" class="card-menu-item" id="cmenu-copy-pawtube" style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;border:none;background:transparent;color:var(--text-primary);font-size:13px;cursor:pointer;width:100%;text-align:left;">
      <span class="material-symbols-rounded" style="font-size:18px;color:var(--text-secondary);">link</span>
      <span>Copy PawTube URL</span>
    </button>

    <button type="button" class="card-menu-item" id="cmenu-copy-youtube" style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;border:none;background:transparent;color:var(--text-primary);font-size:13px;cursor:pointer;width:100%;text-align:left;">
      <span class="material-symbols-rounded" style="font-size:18px;color:var(--brand-red);">smart_display</span>
      <span>Copy YouTube URL</span>
    </button>

    <a href="${escapeHtml(youtubeUrl)}" target="_blank" rel="noopener noreferrer" class="card-menu-item" id="cmenu-open-youtube" style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;border:none;background:transparent;color:var(--text-primary);font-size:13px;text-decoration:none;width:100%;box-sizing:border-box;">
      <span class="material-symbols-rounded" style="font-size:18px;color:var(--text-secondary);">open_in_new</span>
      <span>Open on YouTube</span>
    </a>
  `;

  document.body.appendChild(menu);
  activeMenu = menu;

  // Position calculation
  const rect = buttonEl.getBoundingClientRect();
  const menuWidth = 210;
  const menuHeight = 220;

  let left = rect.right - menuWidth;
  if (left < 10) left = 10;
  if (left + menuWidth > window.innerWidth - 10) {
    left = window.innerWidth - menuWidth - 10;
  }

  let top = rect.bottom + 6;
  if (top + menuHeight > window.innerHeight - 10) {
    top = rect.top - menuHeight - 6;
  }
  if (top < 10) top = 10;

  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  // Item hover effect
  menu.querySelectorAll('.card-menu-item').forEach((item) => {
    item.addEventListener('mouseenter', () => {
      item.style.background = 'var(--bg-hover)';
    });
    item.addEventListener('mouseleave', () => {
      item.style.background = 'transparent';
    });
  });

  // Action listeners
  menu.querySelector('#cmenu-play')?.addEventListener('click', () => {
    closeActiveMenu();
    window.location.hash = `#/watch?v=${encodeURIComponent(videoId)}`;
  });

  menu.querySelector('#cmenu-watchlater')?.addEventListener('click', () => {
    closeActiveMenu();
    if (isSavedWatchLater) {
      removeFromPlaylist('watch-later', videoId);
      showToast('Removed from Watch Later', 'info');
    } else {
      addToPlaylist('watch-later', {
        id: videoId,
        title: videoTitle || 'Untitled Video',
        channel: channelName || '',
        channelId: channelId || '',
        savedAt: Date.now()
      });
      showToast('Saved to Watch Later', 'success');
    }
  });

  menu.querySelector('#cmenu-channel')?.addEventListener('click', () => {
    closeActiveMenu();
    if (channelUrl) {
      window.location.hash = channelUrl;
    }
  });

  menu.querySelector('#cmenu-copy-pawtube')?.addEventListener('click', async () => {
    closeActiveMenu();
    try {
      await navigator.clipboard.writeText(pawtubeUrl);
      showToast('PawTube link copied', 'success');
    } catch {
      showToast('Could not copy link', 'error');
    }
  });

  menu.querySelector('#cmenu-copy-youtube')?.addEventListener('click', async () => {
    closeActiveMenu();
    try {
      await navigator.clipboard.writeText(youtubeUrl);
      showToast('YouTube link copied', 'success');
    } catch {
      showToast('Could not copy link', 'error');
    }
  });
}

// Attach to window so onclick handlers in video cards find it
window.pawtubeOpenCardMenu = openCardMenu;

export default openCardMenu;
