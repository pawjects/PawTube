/**
 * PawTube - Watch Page
 * Strictly decouples video playback (instant YouTube No-Cookie embed)
 * from asynchronous Piped metadata & recommendations.
 */

import { extractVideoId } from '../../player/videoId.js';
import { playerController } from '../../player/player.js';
import { PipedApi } from '../../api/piped/pipedApi.js';
import { isAbortError } from '../../api/client/apiClient.js';
import { renderVideoCard } from '../../components/video/videoCard.js';
import { addToHistory } from '../../storage/history/historyStorage.js';
import { addToPlaylist } from '../../storage/playlists/playlistStorage.js';
import { isSubscribed, toggleSubscription } from '../../storage/preferences/preferencesStorage.js';
import { showToast } from '../../components/common/toast.js';
import { escapeHtml } from '../../utils/dom.js';

let watchRenderSeq = 0;

export async function renderWatchPage(container, videoIdInput) {
  const cleanId = extractVideoId(videoIdInput);
  const currentSeq = ++watchRenderSeq;

  if (!cleanId) {
    container.innerHTML = `
      <div style="padding:60px 20px;text-align:center;color:var(--text-secondary);">
        <h3 style="font-size:18px;color:var(--text-primary);margin-bottom:8px;">Invalid Video URL</h3>
        <p style="margin-bottom:16px;">Could not extract a valid YouTube video ID.</p>
        <button onclick="window.location.hash='#/home'" style="padding:8px 20px;border-radius:999px;background:var(--brand-blue);color:#fff;border:none;cursor:pointer;">
          Return Home
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="watch-layout" style="display:flex;gap:24px;max-width:1440px;margin:0 auto;padding-bottom:60px;">
      <!-- Left Column: Player & Metadata -->
      <div class="watch-main-col" style="flex:1;min-width:0;">
        <!-- Player Container with Virtual Controls -->
        <div class="player-container" id="watch-player-slot" style="position:relative;width:100%;aspect-ratio:16/9;background:#000;border-radius:16px;overflow:hidden;box-shadow:var(--shadow-glass);">
        </div>

        <!-- Video Info Header (Updated asynchronously) -->
        <div id="video-info-section" style="margin-top:16px;">
          <h1 id="video-title" style="font-size:19px;font-weight:700;line-height:1.4;margin-bottom:12px;">
            Loading video metadata...
          </h1>

          <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;">
            <!-- Channel Info -->
            <div id="channel-block" style="display:flex;align-items:center;gap:12px;">
              <div id="channel-avatar" style="width:40px;height:40px;border-radius:50%;background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;">
                <span class="material-symbols-rounded" style="color:var(--text-secondary);">account_circle</span>
              </div>
              <div>
                <div id="channel-name" style="font-size:15px;font-weight:600;">YouTube Channel</div>
                <div id="video-views" style="font-size:12px;color:var(--text-secondary);">Direct Player Active</div>
              </div>
              <button id="sub-btn" style="margin-left:8px;padding:6px 16px;border-radius:999px;background:var(--text-primary);color:var(--bg-primary);border:none;font-size:13px;font-weight:600;cursor:pointer;">
                Subscribe
              </button>
            </div>

            <!-- Action Buttons -->
            <div style="display:flex;align-items:center;gap:8px;">
              <button id="watch-later-btn" class="icon-btn" title="Watch Later" style="background:var(--bg-surface);border:1px solid var(--glass-border);width:auto;padding:0 14px;border-radius:999px;gap:6px;">
                <span class="material-symbols-rounded" style="font-size:18px;">bookmark</span>
                <span style="font-size:13px;">Save</span>
              </button>
              <button id="share-btn" class="icon-btn" title="Share Link" style="background:var(--bg-surface);border:1px solid var(--glass-border);width:auto;padding:0 14px;border-radius:999px;gap:6px;">
                <span class="material-symbols-rounded" style="font-size:18px;">share</span>
                <span style="font-size:13px;">Share</span>
              </button>
            </div>
          </div>

          <!-- Description Box -->
          <div id="description-box" style="padding:14px 16px;background:var(--bg-surface);border-radius:14px;border:1px solid var(--glass-border-light);font-size:13.5px;line-height:1.6;color:var(--text-secondary);max-height:180px;overflow-y:auto;white-space:pre-wrap;">
            Fetching description...
          </div>
        </div>
      </div>

      <!-- Right Column: Related Videos -->
      <div class="watch-sidebar-col" style="width:380px;flex-shrink:0;">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">recommend</span>
          Related Content
        </h3>
        <div id="related-grid" style="display:flex;flex-direction:column;gap:14px;">
          <!-- Skeleton related -->
          ${Array.from({ length: 5 }).map(() => `
            <div style="display:flex;gap:10px;">
              <div class="skeleton-pulse" style="width:140px;height:78px;border-radius:8px;flex-shrink:0;"></div>
              <div style="flex:1;">
                <div class="skeleton-pulse" style="height:14px;border-radius:4px;margin-bottom:6px;width:90%;"></div>
                <div class="skeleton-pulse" style="height:12px;border-radius:4px;width:60%;"></div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  // Bind Share button
  container.querySelector('#share-btn')?.addEventListener('click', () => {
    const shareUrl = `${window.location.origin}/#/watch?v=${cleanId}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        showToast('Video link copied to clipboard', 'success');
      }).catch(() => {
        prompt('Copy video link:', shareUrl);
      });
    } else {
      prompt('Copy video link:', shareUrl);
    }
  });

  // Mount the Virtual Player Controls immediately (No-Cookie Embed)
  const playerSlot = container.querySelector('#watch-player-slot');
  if (playerSlot) {
    playerController.mountPlayer(playerSlot, cleanId);
  }

  // 2. Asynchronously fetch video metadata from Piped
  try {
    const videoData = await PipedApi.getVideo(cleanId);
    if (currentSeq !== watchRenderSeq) return;

    // Update player controller with rich metadata
    playerController.updateMetadata(videoData);

    // Update title
    const titleEl = container.querySelector('#video-title');
    if (titleEl && videoData.title) {
      titleEl.textContent = videoData.title;
      document.title = `${videoData.title} - PawTube`;
    }

    // Update channel & stats
    const channelNameEl = container.querySelector('#channel-name');
    const channelAvatarEl = container.querySelector('#channel-avatar');
    const viewsEl = container.querySelector('#video-views');

    if (channelNameEl) channelNameEl.textContent = videoData.channel || videoData.author || 'YouTube Channel';
    if (channelAvatarEl && videoData.avatar) {
      channelAvatarEl.innerHTML = `<img src="${escapeHtml(videoData.avatar)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.style.display='none'" />`;
    }
    if (viewsEl) {
      const views = videoData.views ? Number(videoData.views).toLocaleString() + ' views' : '';
      const date = videoData.uploadDate || '';
      viewsEl.textContent = [views, date].filter(Boolean).join(' • ');
    }

    // Update description
    const descEl = container.querySelector('#description-box');
    if (descEl) {
      descEl.textContent = videoData.description || 'No description provided.';
    }

    // Update history with full metadata
    addToHistory({
      id: cleanId,
      title: videoData.title || 'YouTube Video',
      channel: videoData.channel || videoData.author || '',
      author: videoData.channel || videoData.author || '',
      thumb: videoData.thumb || `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`,
      durationFormatted: ''
    });

    // Subscribe button logic
    const subBtn = container.querySelector('#sub-btn');
    const channelId = videoData.channelId || videoData.channel;
    if (subBtn && channelId) {
      let subscribed = isSubscribed(channelId);
      subBtn.textContent = subscribed ? 'Subscribed' : 'Subscribe';
      if (subscribed) subBtn.style.opacity = '0.7';

      subBtn.onclick = () => {
        subscribed = toggleSubscription({
          id: channelId,
          name: videoData.channel || videoData.author || 'Channel',
          avatar: videoData.avatar || ''
        });
        subBtn.textContent = subscribed ? 'Subscribed' : 'Subscribe';
        subBtn.style.opacity = subscribed ? '0.7' : '1';
        showToast(subscribed ? 'Subscribed to channel' : 'Unsubscribed', 'info');
      };
    }

    // Save to Watch Later
    const saveBtn = container.querySelector('#watch-later-btn');
    if (saveBtn) {
      saveBtn.onclick = () => {
        addToPlaylist('watch-later', {
          id: cleanId,
          title: videoData.title || 'YouTube Video',
          author: videoData.channel || videoData.author || '',
          thumb: videoData.thumb || `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`
        });
        showToast('Saved to Watch Later', 'success');
      };
    }

    // Render related streams
    const relatedGrid = container.querySelector('#related-grid');
    if (relatedGrid) {
      let related = videoData.related || [];
      if (related.length === 0 && videoData.title) {
        try {
          const searchRes = await PipedApi.search(videoData.title.slice(0, 35));
          related = (searchRes.items || []).filter((i) => i.id && i.id !== cleanId);
        } catch {}
      }

      if (related.length > 0) {
        relatedGrid.innerHTML = related.slice(0, 10).map((r) => `
          <div style="display:flex;gap:12px;cursor:pointer;" onclick="window.location.hash='#/watch?v=${encodeURIComponent(r.id)}'">
            <div style="width:130px;aspect-ratio:16/9;position:relative;border-radius:8px;overflow:hidden;background:#111;flex-shrink:0;">
              <img src="${escapeHtml(r.thumb || `https://i.ytimg.com/vi/${r.id}/hqdefault.jpg`)}" alt="" style="width:100%;height:100%;object-fit:cover;" loading="lazy" />
              <div class="duration-badge" style="position:absolute;bottom:4px;right:4px;font-size:10px;padding:1px 4px;border-radius:4px;background:rgba(0,0,0,0.8);">${escapeHtml(r.durationFormatted || '0:00')}</div>
            </div>
            <div style="flex:1;overflow:hidden;">
              <h4 style="font-size:13px;font-weight:600;line-height:1.3;max-height:34px;overflow:hidden;margin-bottom:4px;">${escapeHtml(r.title)}</h4>
              <p style="font-size:11.5px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(r.channel || r.author || '')}</p>
              <p style="font-size:11px;color:var(--text-tertiary);">${escapeHtml(r.viewsFormatted || '')}</p>
            </div>
          </div>
        `).join('');
      } else {
        relatedGrid.innerHTML = `<div style="font-size:13px;color:var(--text-secondary);">No related recommendations available.</div>`;
      }
    }
  } catch (err) {
    if (currentSeq !== watchRenderSeq || isAbortError(err)) return;
    console.warn('Metadata fetch failed, player continues uninterrupted:', err.message);
    const titleEl = container.querySelector('#video-title');
    if (titleEl) titleEl.textContent = 'YouTube Video';
    const descEl = container.querySelector('#description-box');
    if (descEl) descEl.textContent = 'Direct No-Cookie playback active.';
  }
}

export default renderWatchPage;
