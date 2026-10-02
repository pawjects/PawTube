/**
 * PawTube - Playlist Page Component
 * Displays full playlist metadata, video list, and provides "Play", "Play All", "Shuffle",
 * and individual track playback synced with the global player queue.
 */

import { PipedApi } from '../../api/piped/pipedApi.js';
import { playerController } from '../../player/player.js';
import { extractPlaylistId } from '../../utils/playlistId.js';
import { escapeHtml } from '../../utils/dom.js';
import { isAbortError } from '../../api/client/apiClient.js';
import { formatDuration, cleanText } from '../../api/normalization/mediaModels.js';
import { showToast } from '../../components/common/toast.js';
import { showShareModal } from '../../components/video/shareModal.js';
import { renderErrorState } from '../../components/video/videoCard.js';

let playlistSeq = 0;
let currentPlaylistAbortController = null;
let currentPlaylistData = null;
let isLoadingMore = false;

export async function renderPlaylistPage(container, rawPlaylistId) {
  const cleanId = extractPlaylistId(rawPlaylistId);
  const currentSeq = ++playlistSeq;

  if (!cleanId) {
    container.innerHTML = `
      <div style="max-width:800px;margin:40px auto;padding:24px;text-align:center;">
        <span class="material-symbols-rounded" style="font-size:56px;color:var(--text-tertiary);margin-bottom:12px;">playlist_remove</span>
        <h2 style="font-size:20px;font-weight:600;color:var(--text-primary);margin-bottom:8px;">Invalid Playlist URL</h2>
        <p style="font-size:14px;color:var(--text-secondary);margin-bottom:20px;">Could not extract a valid playlist identifier from the URL.</p>
        <button onclick="window.location.hash='#/home'" style="padding:10px 24px;border-radius:999px;background:var(--text-primary);color:var(--bg-primary);border:none;font-weight:600;cursor:pointer;">
          Return Home
        </button>
      </div>
    `;
    return;
  }

  // Cancel any existing request
  if (currentPlaylistAbortController) {
    currentPlaylistAbortController.abort();
    currentPlaylistAbortController = null;
  }
  currentPlaylistAbortController = new AbortController();
  const signal = currentPlaylistAbortController.signal;

  // Render initial skeleton view
  container.innerHTML = `
    <div class="playlist-page-container" style="max-width:1280px;margin:0 auto;padding:16px 16px 80px;">
      <!-- Hero Skeleton -->
      <div style="display:flex;flex-wrap:wrap;gap:28px;margin-bottom:32px;align-items:flex-start;">
        <div class="skeleton-pulse" style="width:280px;aspect-ratio:16/9;border-radius:16px;background:rgba(255,255,255,0.06);flex-shrink:0;"></div>
        <div style="flex:1;min-width:260px;">
          <div class="skeleton-pulse" style="height:28px;width:70%;border-radius:6px;background:rgba(255,255,255,0.06);margin-bottom:12px;"></div>
          <div class="skeleton-pulse" style="height:16px;width:40%;border-radius:4px;background:rgba(255,255,255,0.04);margin-bottom:16px;"></div>
          <div class="skeleton-pulse" style="height:38px;width:140px;border-radius:999px;background:rgba(255,255,255,0.06);"></div>
        </div>
      </div>
      <!-- Items Skeleton -->
      <div style="display:flex;flex-direction:column;gap:12px;">
        ${Array.from({ length: 6 }).map(() => `
          <div style="display:flex;align-items:center;gap:16px;padding:10px;background:rgba(255,255,255,0.02);border-radius:12px;">
            <div class="skeleton-pulse" style="width:120px;height:68px;border-radius:8px;background:rgba(255,255,255,0.06);flex-shrink:0;"></div>
            <div style="flex:1;">
              <div class="skeleton-pulse" style="height:16px;width:80%;border-radius:4px;background:rgba(255,255,255,0.06);margin-bottom:8px;"></div>
              <div class="skeleton-pulse" style="height:12px;width:40%;border-radius:4px;background:rgba(255,255,255,0.04);"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  try {
    const playlist = await PipedApi.getPlaylist(cleanId, null, { signal });
    if (currentSeq !== playlistSeq) return;

    if (!playlist || (!playlist.name && !playlist.title) || !Array.isArray(playlist.videos)) {
      throw new Error('Playlist data could not be retrieved.');
    }

    currentPlaylistData = playlist;
    renderPlaylistView(container, cleanId);
  } catch (err) {
    if (currentSeq !== playlistSeq) return;
    if (isAbortError(err)) return;
    console.error('Playlist fetch error:', err);

    container.innerHTML = `
      <div style="max-width:800px;margin:40px auto;padding:24px;">
        ${renderErrorState(
          'Playlist Unavailable',
          err.message || 'Could not load playlist videos. It may be private, deleted, or temporarily unreachable.',
          'window.pawtubeRetryPlaylist'
        )}
      </div>
    `;
    window.pawtubeRetryPlaylist = () => renderPlaylistPage(container, cleanId);
  }
}

function renderPlaylistView(container, cleanId) {
  const pl = currentPlaylistData;
  if (!pl) return;

  const title = cleanText(pl.title || pl.name, 'Playlist');
  const uploader = cleanText(pl.uploader || pl.author || pl.channel, 'YouTube Channel');
  const thumbUrl = pl.thumbnail || pl.thumb || (pl.videos[0] ? pl.videos[0].thumb : '');
  const countText = pl.formattedVideoCount || `${pl.videos.length} videos`;
  const channelUrl = pl.uploaderUrl ? `#/channel/${encodeURIComponent(pl.uploaderUrl.replace(/^\/channel\//, ''))}` : '';
  const currentVideoId = playerController.state.currentVideoId;

  container.innerHTML = `
    <div class="playlist-page-container" style="max-width:1280px;margin:0 auto;padding:16px 16px 80px;">
      <!-- Hero Playlist Header Box -->
      <div class="playlist-hero-card" style="display:flex;flex-wrap:wrap;gap:28px;padding:24px;background:var(--bg-surface);border-radius:20px;border:1px solid var(--glass-border);margin-bottom:28px;backdrop-filter:var(--blur-md);position:relative;overflow:hidden;">
        <!-- Left Thumbnail Box -->
        <div class="playlist-cover-wrapper" style="width:260px;aspect-ratio:16/9;border-radius:14px;overflow:hidden;position:relative;background:#000;flex-shrink:0;box-shadow:var(--shadow-glass);">
          <img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(title)}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='/public/assets/pawtube_logo.png';" />
          <div style="position:absolute;inset:0;background:linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%);display:flex;align-items:flex-end;padding:10px 12px;">
            <div style="display:flex;align-items:center;gap:6px;color:#fff;font-size:12px;font-weight:600;">
              <span class="material-symbols-rounded" style="font-size:18px;">playlist_play</span>
              <span>${escapeHtml(countText)}</span>
            </div>
          </div>
        </div>

        <!-- Right Info Box -->
        <div class="playlist-info-col" style="flex:1;min-width:280px;display:flex;flex-direction:column;justify-content:center;">
          <div style="display:inline-flex;align-items:center;gap:6px;font-size:12px;text-transform:uppercase;letter-spacing:0.8px;color:var(--brand-blue);font-weight:600;margin-bottom:6px;">
            <span class="material-symbols-rounded" style="font-size:16px;">queue_music</span>
            <span>Playlist</span>
          </div>

          <h1 style="font-size:24px;font-weight:700;color:var(--text-primary);margin:0 0 10px 0;line-height:1.3;">
            ${escapeHtml(title)}
          </h1>

          <!-- Uploader / Stats Row -->
          <div style="display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px;font-size:13px;color:var(--text-secondary);">
            ${pl.uploaderAvatar ? `
              <img src="${escapeHtml(pl.uploaderAvatar)}" alt="" style="width:26px;height:26px;border-radius:50%;object-fit:cover;background:var(--bg-elevated);" onerror="this.style.display='none';" />
            ` : ''}
            <span style="font-weight:600;color:var(--text-primary);${channelUrl ? 'cursor:pointer;' : ''}" ${channelUrl ? `onclick="window.location.hash='${channelUrl}'"` : ''}>
              ${escapeHtml(uploader)}
            </span>
            <span>&bull;</span>
            <span>${escapeHtml(countText)}</span>
          </div>

          <!-- Description if available -->
          ${pl.description ? `
            <div class="playlist-description" style="font-size:13px;line-height:1.5;color:var(--text-secondary);max-height:80px;overflow-y:auto;margin-bottom:18px;">
              ${escapeHtml(pl.description)}
            </div>
          ` : ''}

          <!-- Action Buttons Bar: Play, Play All, Shuffle, Share -->
          <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:auto;">
            <button id="playlist-play-btn" type="button" style="display:flex;align-items:center;gap:8px;padding:10px 22px;border-radius:999px;background:var(--text-primary);color:var(--bg-primary);border:none;font-weight:600;font-size:14px;cursor:pointer;transition:transform 0.15s, opacity 0.15s;" title="Play First Video">
              <span class="material-symbols-rounded" style="font-size:20px;">play_arrow</span>
              <span>Play</span>
            </button>

            <button id="playlist-play-all-btn" type="button" style="display:flex;align-items:center;gap:8px;padding:10px 22px;border-radius:999px;background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--glass-border);font-weight:600;font-size:14px;cursor:pointer;transition:transform 0.15s, background 0.15s;" title="Populate Queue and Play All">
              <span class="material-symbols-rounded" style="font-size:20px;">playlist_play</span>
              <span>Play All</span>
            </button>

            <button id="playlist-shuffle-btn" type="button" style="display:flex;align-items:center;gap:8px;padding:10px 18px;border-radius:999px;background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--glass-border);font-weight:600;font-size:14px;cursor:pointer;transition:transform 0.15s, background 0.15s;" title="Shuffle Playlist">
              <span class="material-symbols-rounded" style="font-size:18px;">shuffle</span>
              <span>Shuffle</span>
            </button>

            <button id="playlist-share-btn" type="button" class="icon-btn" style="width:40px;height:40px;border-radius:50%;background:var(--bg-elevated);color:var(--text-primary);border:1px solid var(--glass-border);display:flex;align-items:center;justify-content:center;cursor:pointer;" title="Share Playlist">
              <span class="material-symbols-rounded" style="font-size:19px;">share</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Video Items Section -->
      <div class="playlist-videos-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding:0 4px;">
          <h2 style="font-size:18px;font-weight:600;color:var(--text-primary);margin:0;display:flex;align-items:center;gap:8px;">
            <span class="material-symbols-rounded" style="color:var(--brand-blue);font-size:20px;">video_library</span>
            <span>Videos in Playlist</span>
          </h2>
          <span style="font-size:13px;color:var(--text-secondary);">${escapeHtml(countText)}</span>
        </div>

        <div class="playlist-items-table" id="playlist-items-table" style="display:flex;flex-direction:column;gap:8px;">
          ${renderPlaylistItemsHtml(pl.videos, currentVideoId)}
        </div>

        <!-- Load More continuation button if more pages exist -->
        ${pl.nextpage ? `
          <div id="playlist-load-more-wrapper" style="text-align:center;margin-top:24px;">
            <button id="playlist-load-more-btn" type="button" style="padding:10px 28px;border-radius:999px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-primary);font-size:14px;font-weight:600;cursor:pointer;transition:background 0.15s;">
              Load More Videos
            </button>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  // Bind Play (starts first video and opens player)
  container.querySelector('#playlist-play-btn')?.addEventListener('click', () => {
    if (pl.videos.length > 0) {
      playerController.setQueue(pl.videos, 0, pl.id, title);
      const firstVideo = pl.videos[0];
      window.location.hash = `#/watch?v=${encodeURIComponent(firstVideo.id)}&list=${encodeURIComponent(pl.id)}`;
    } else {
      showToast('No playable videos in this playlist', 'info');
    }
  });

  // Bind Play All (populates queue and starts playback, keeping user on page with mini-player or current view)
  container.querySelector('#playlist-play-all-btn')?.addEventListener('click', () => {
    if (pl.videos.length > 0) {
      playerController.setQueue(pl.videos, 0, pl.id, title);
      showToast(`Playing playlist (${pl.videos.length} videos)`, 'success');
    } else {
      showToast('No playable videos in this playlist', 'info');
    }
  });

  // Bind Shuffle
  container.querySelector('#playlist-shuffle-btn')?.addEventListener('click', () => {
    if (pl.videos.length > 0) {
      const shuffled = [...pl.videos].sort(() => Math.random() - 0.5);
      playerController.setQueue(shuffled, 0, pl.id, title);
      showToast('Playing shuffled playlist', 'success');
    } else {
      showToast('No playable videos in this playlist', 'info');
    }
  });

  // Bind Share
  container.querySelector('#playlist-share-btn')?.addEventListener('click', () => {
    const pawtubeUrl = `${window.location.origin}/#/playlist?list=${encodeURIComponent(cleanId)}`;
    const ytUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(cleanId)}`;
    showShareModal({
      title,
      url: pawtubeUrl,
      youtubeUrl: ytUrl
    });
  });

  // Bind Individual Track Click
  bindPlaylistRowEvents(container, pl, title);

  // Bind dynamic track highlight on queue change
  const handleActiveTrackChange = () => {
    const activeId = playerController.state.currentVideoId;
    container.querySelectorAll('.playlist-row-item').forEach((row) => {
      const rowId = row.getAttribute('data-video-id');
      const isPlaying = activeId && rowId === activeId;
      row.classList.toggle('playing', isPlaying);
      row.style.background = isPlaying ? 'var(--bg-active)' : 'var(--bg-surface)';
      row.style.borderColor = isPlaying ? 'var(--brand-blue)' : 'var(--glass-border)';

      const numEl = row.querySelector('.playlist-row-num');
      if (numEl) {
        const idx = parseInt(row.getAttribute('data-index'), 10) || 0;
        numEl.innerHTML = isPlaying ? `<span class="material-symbols-rounded" style="font-size:18px;">graphic_eq</span>` : String(idx + 1);
        numEl.style.color = isPlaying ? 'var(--brand-blue)' : 'var(--text-tertiary)';
      }

      const badge = row.querySelector('.row-play-badge');
      if (badge) {
        badge.innerHTML = `<span class="material-symbols-rounded" style="font-size:22px;">${isPlaying ? 'pause_circle' : 'play_circle'}</span>`;
        badge.style.color = isPlaying ? 'var(--brand-blue)' : 'var(--text-secondary)';
      }
    });
  };

  window.addEventListener('pawtube:videoChange', handleActiveTrackChange);
  window.addEventListener('pawtube:queueChange', handleActiveTrackChange);

  // Bind Load More if continuation token exists
  const loadMoreBtn = container.querySelector('#playlist-load-more-btn');
  if (loadMoreBtn && pl.nextpage) {
    loadMoreBtn.addEventListener('click', async () => {
      if (isLoadingMore) return;
      isLoadingMore = true;
      loadMoreBtn.textContent = 'Loading more videos...';
      try {
        const moreRes = await PipedApi.getPlaylist(cleanId, pl.nextpage);
        const newVideos = moreRes.videos || [];
        const existingIds = new Set(pl.videos.map((v) => v.id));
        const filteredNew = newVideos.filter((v) => !existingIds.has(v.id));

        pl.videos.push(...filteredNew);
        pl.nextpage = moreRes.nextpage || null;

        const table = container.querySelector('#playlist-items-table');
        if (table) {
          table.innerHTML = renderPlaylistItemsHtml(pl.videos, playerController.state.currentVideoId);
          bindPlaylistRowEvents(container, pl, title);
        }

        const wrapper = container.querySelector('#playlist-load-more-wrapper');
        if (!pl.nextpage && wrapper) {
          wrapper.style.display = 'none';
        }
      } catch (err) {
        showToast('Could not load additional videos', 'error');
      } finally {
        isLoadingMore = false;
        if (loadMoreBtn) loadMoreBtn.textContent = 'Load More Videos';
      }
    });
  }
}

function renderPlaylistItemsHtml(videos, currentVideoId) {
  if (!Array.isArray(videos) || videos.length === 0) {
    return `
      <div style="padding:40px 20px;text-align:center;color:var(--text-secondary);background:var(--bg-surface);border-radius:14px;border:1px solid var(--glass-border);">
        <span class="material-symbols-rounded" style="font-size:40px;color:var(--text-tertiary);margin-bottom:8px;">playlist_remove</span>
        <p style="font-size:14px;margin:0;">No playable videos available in this playlist.</p>
      </div>
    `;
  }

  return videos.map((v, index) => {
    const isPlaying = currentVideoId && currentVideoId === v.id;
    const duration = v.durationFormatted || formatDuration(v.durationSeconds || v.duration);
    const channelName = cleanText(v.channel || v.author, 'YouTube Channel');
    const titleText = cleanText(v.title, 'YouTube Video');

    return `
      <div class="playlist-row-item ${isPlaying ? 'playing' : ''}" data-video-id="${escapeHtml(v.id)}" data-index="${index}"
        style="display:flex;align-items:center;gap:14px;padding:8px 12px;background:${isPlaying ? 'var(--bg-active)' : 'var(--bg-surface)'};border-radius:12px;border:1px solid ${isPlaying ? 'var(--brand-blue)' : 'var(--glass-border)'};cursor:pointer;transition:transform 0.15s, background 0.15s;"
        title="Play: ${escapeHtml(titleText)}">
        <!-- Index Number / Playing Indicator -->
        <div class="playlist-row-num" style="width:28px;text-align:center;font-size:13px;font-weight:600;color:${isPlaying ? 'var(--brand-blue)' : 'var(--text-tertiary)'};flex-shrink:0;">
          ${isPlaying ? `<span class="material-symbols-rounded" style="font-size:18px;">graphic_eq</span>` : index + 1}
        </div>

        <!-- Video Thumbnail Preview -->
        <div style="width:116px;height:65px;border-radius:8px;overflow:hidden;position:relative;background:#000;flex-shrink:0;">
          <img src="${escapeHtml(v.thumb || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`)}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='/public/assets/pawtube_logo.png';" />
          ${duration ? `
            <div style="position:absolute;bottom:4px;right:4px;padding:1px 5px;background:rgba(0,0,0,0.8);border-radius:4px;font-size:11px;font-weight:600;color:#fff;">
              ${escapeHtml(duration)}
            </div>
          ` : ''}
        </div>

        <!-- Video Info -->
        <div style="flex:1;min-width:0;">
          <h3 style="font-size:14px;font-weight:600;color:${isPlaying ? 'var(--brand-blue)' : 'var(--text-primary)'};margin:0 0 4px 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.35;">
            ${escapeHtml(titleText)}
          </h3>
          <div style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-secondary);">
            <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">${escapeHtml(channelName)}</span>
            ${v.viewsFormatted ? `<span>&bull;</span><span>${escapeHtml(v.viewsFormatted)}</span>` : ''}
          </div>
        </div>

        <!-- Play action icon -->
        <div class="row-play-badge" style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;color:${isPlaying ? 'var(--brand-blue)' : 'var(--text-secondary)'};flex-shrink:0;">
          <span class="material-symbols-rounded" style="font-size:22px;">${isPlaying ? 'pause_circle' : 'play_circle'}</span>
        </div>
      </div>
    `;
  }).join('');
}

function bindPlaylistRowEvents(container, pl, title) {
  container.querySelectorAll('.playlist-row-item[data-video-id]').forEach((row) => {
    row.addEventListener('click', () => {
      const idx = parseInt(row.getAttribute('data-index'), 10) || 0;
      const vid = row.getAttribute('data-video-id');
      playerController.setQueue(pl.videos, idx, pl.id, title);
      window.location.hash = `#/watch?v=${encodeURIComponent(vid)}&list=${encodeURIComponent(pl.id)}`;
    });
  });
}

export default renderPlaylistPage;
