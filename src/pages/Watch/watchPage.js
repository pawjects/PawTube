/**
 * PawTube - Watch Page
 * Strictly decouples video playback (instant YouTube No-Cookie embed)
 * from asynchronous Piped metadata & recommendations.
 * Features Advanced Video Actions, Local Likes, Theatre Mode, and Share modals.
 */

import { extractVideoId } from '../../player/videoId.js';
import { playerController } from '../../player/player.js';
import { PipedApi } from '../../api/piped/pipedApi.js';
import { isAbortError } from '../../api/client/apiClient.js';
import { addToHistory } from '../../storage/history/historyStorage.js';
import { getPlaylists, addToPlaylist, removeFromPlaylist } from '../../storage/playlists/playlistStorage.js';
import { isLiked, toggleLike } from '../../storage/likes/likesStorage.js';
import { isSubscribed, toggleSubscription } from '../../storage/preferences/preferencesStorage.js';
import { showToast } from '../../components/common/toast.js';
import { escapeHtml } from '../../utils/dom.js';
import { showPlaylistModal } from '../../components/video/playlistModal.js';
import { showShareModal, shareYouTubeUrl, sharePawTubeUrl, openOnYouTube, copyToClipboard } from '../../components/video/shareModal.js';

let watchRenderSeq = 0;

function formatDescription(rawText) {
  if (!rawText) return 'No description provided.';
  const escaped = escapeHtml(rawText);
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  return escaped.replace(urlRegex, (url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:var(--brand-blue);text-decoration:underline;word-break:break-all;">${url}</a>`;
  });
}

export async function renderWatchPage(container, videoIdInput, startTime = 0) {
  const cleanId = extractVideoId(videoIdInput);
  const currentSeq = ++watchRenderSeq;

  if (!cleanId) {
    container.innerHTML = `
      <div style="padding:60px 20px;text-align:center;color:var(--text-secondary);">
        <h3 style="font-size:18px;color:var(--text-primary);margin-bottom:8px;">Invalid Video URL</h3>
        <p style="margin-bottom:16px;">Could not extract a valid YouTube video ID.</p>
        <button onclick="window.location.hash='#/home'" style="padding:10px 24px;border-radius:999px;background:var(--brand-blue);color:#fff;border:none;cursor:pointer;font-weight:600;">
          Return Home
        </button>
      </div>
    `;
    return;
  }

  // Initial video data reference
  let currentVideoData = {
    id: cleanId,
    title: 'YouTube Video',
    channel: 'YouTube Channel',
    author: 'YouTube Channel',
    thumb: `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`,
    durationFormatted: ''
  };

  // Check initial local states
  let currentlyLiked = isLiked(cleanId);
  const watchLaterPlaylist = getPlaylists().find((p) => p.id === 'watch-later');
  let isSavedWatchLater = !!watchLaterPlaylist?.items?.some((item) => item.id === cleanId);

  container.innerHTML = `
    <div class="watch-layout" id="watch-layout">
      <!-- Theatre Stage Container (Full-width backdrop for theatre mode) -->
      <div class="theatre-stage-wrapper" id="theatre-stage-wrapper"></div>

      <!-- Main 2-column Responsive Container -->
      <div class="watch-columns-container" id="watch-columns-container">
        <!-- Left Column: Player & Video Info -->
        <div class="watch-main-col" id="watch-main-col">
          <!-- Normal Player Slot Parent -->
          <div class="watch-player-wrapper" id="normal-player-slot-parent">
            <div class="player-container" id="watch-player-slot"></div>
          </div>

          <!-- Video Info Section -->
          <div class="watch-info-section" id="video-info-section">
            <h1 class="watch-title" id="video-title">
              Loading video metadata...
            </h1>

            <div class="watch-channel-actions-row">
              <!-- Channel Info -->
              <div class="watch-channel-block" id="channel-block">
                <div class="watch-channel-avatar" id="channel-avatar" title="View Channel">
                  <span class="material-symbols-rounded" style="color:var(--text-secondary);font-size:26px;">account_circle</span>
                </div>
                <div class="watch-channel-info-text" id="channel-info-text" title="View Channel">
                  <div class="watch-channel-name" id="channel-name">
                    <span>YouTube Channel</span>
                  </div>
                  <div class="watch-video-views" id="video-views">Direct Player Active</div>
                </div>
                <button class="watch-sub-btn" id="sub-btn">
                  Follow
                </button>
              </div>

              <!-- Complete Responsive Video Action Row -->
              <div class="video-actions-scroll-wrapper" id="video-actions-row">
                <!-- Like / Favorite Button -->
                <button id="action-like-btn" class="video-action-pill ${currentlyLiked ? 'active' : ''}" title="Like this video">
                  <span class="material-symbols-rounded" id="action-like-icon" style="font-size:19px;">thumb_up</span>
                  <span id="action-like-text">${currentlyLiked ? 'Liked' : 'Like'}</span>
                </button>

                <!-- Save / Watch Later Button -->
                <button id="action-save-btn" class="video-action-pill ${isSavedWatchLater ? 'active' : ''}" title="Save to Watch Later">
                  <span class="material-symbols-rounded" id="action-save-icon" style="font-size:19px;">bookmark</span>
                  <span id="action-save-text">${isSavedWatchLater ? 'Saved' : 'Save'}</span>
                </button>

                <!-- Add to Playlist Button -->
                <button id="action-playlist-btn" class="video-action-pill" title="Save to playlist">
                  <span class="material-symbols-rounded" style="font-size:19px;">playlist_add</span>
                  <span>Playlist</span>
                </button>

                <!-- Share Button -->
                <button id="action-share-btn" class="video-action-pill" title="Share video link">
                  <span class="material-symbols-rounded" style="font-size:19px;">share</span>
                  <span>Share</span>
                </button>

                <!-- Open on YouTube Button -->
                <button id="action-youtube-btn" class="video-action-pill" title="Open on YouTube">
                  <span class="material-symbols-rounded" style="font-size:19px;">open_in_new</span>
                  <span>YouTube</span>
                </button>

                <!-- More Actions Menu Trigger -->
                <div class="video-more-menu-container">
                  <button id="action-more-btn" class="video-action-pill" title="More options" aria-label="More actions" style="padding:0 12px;">
                    <span class="material-symbols-rounded" style="font-size:20px;">more_horiz</span>
                  </button>
                  <div id="video-more-dropdown" class="video-more-menu-dropdown" role="menu">
                    <button class="video-more-menu-item" id="more-copy-yt" role="menuitem">
                      <span class="material-symbols-rounded">smart_display</span>
                      <span>Copy YouTube URL</span>
                    </button>
                    <button class="video-more-menu-item" id="more-copy-pawtube" role="menuitem">
                      <span class="material-symbols-rounded">link</span>
                      <span>Copy PawTube URL</span>
                    </button>
                    <button class="video-more-menu-item" id="more-add-playlist" role="menuitem">
                      <span class="material-symbols-rounded">playlist_add</span>
                      <span>Add to Playlist...</span>
                    </button>
                    <button class="video-more-menu-item" id="more-theatre-toggle" role="menuitem">
                      <span class="material-symbols-rounded">aspect_ratio</span>
                      <span>Toggle Theatre Mode</span>
                    </button>
                    <button class="video-more-menu-item" id="more-copy-id" role="menuitem">
                      <span class="material-symbols-rounded">tag</span>
                      <span>Copy Video ID</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Expandable Description Box -->
            <div class="watch-description-container" id="description-container">
              <div class="watch-description-content" id="description-box">Fetching description...</div>
              <button class="watch-description-toggle" id="description-toggle" style="display:none;">
                <span id="description-toggle-text">Show more</span>
                <span class="material-symbols-rounded" id="description-toggle-icon" style="font-size:18px;">expand_more</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Right Column: Related Videos -->
        <div class="watch-sidebar-col" id="watch-sidebar-col">
          <h3 style="font-size:16px;font-weight:600;margin:0 0 14px 0;display:flex;align-items:center;gap:8px;color:var(--text-primary);">
            <span class="material-symbols-rounded" style="color:var(--brand-blue);font-size:20px;">recommend</span>
            Related Content
          </h3>
          <div id="related-grid" style="display:flex;flex-direction:column;gap:12px;">
            <!-- Skeleton related -->
            ${Array.from({ length: 5 }).map(() => `
              <div style="display:flex;gap:12px;padding:8px;border-radius:12px;background:var(--bg-surface);">
                <div class="skeleton-pulse" style="width:130px;aspect-ratio:16/9;border-radius:8px;flex-shrink:0;"></div>
                <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;">
                  <div class="skeleton-pulse" style="height:14px;border-radius:4px;margin-bottom:6px;width:90%;"></div>
                  <div class="skeleton-pulse" style="height:12px;border-radius:4px;width:60%;"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  // Mount the Virtual Player Controls immediately (No-Cookie Embed)
  const playerSlot = container.querySelector('#watch-player-slot');
  if (playerSlot) {
    if (playerController.state.isTheatre) {
      const theatreWrapper = container.querySelector('#theatre-stage-wrapper');
      if (theatreWrapper) {
        theatreWrapper.appendChild(playerSlot);
        document.body.classList.add('theatre-mode-active');
      }
    }
    playerController.attachToWatch(playerSlot, cleanId, null, startTime);
  }

  // ==========================================
  // Bind Video Action Row Events
  // ==========================================

  // 1. Like Button
  const likeBtn = container.querySelector('#action-like-btn');
  const likeText = container.querySelector('#action-like-text');
  likeBtn?.addEventListener('click', () => {
    currentlyLiked = toggleLike(currentVideoData);
    likeBtn.classList.toggle('active', currentlyLiked);
    if (likeText) {
      likeText.textContent = currentlyLiked ? 'Liked' : 'Like';
    }
    showToast(currentlyLiked ? 'Added to Liked Videos' : 'Removed from Liked Videos', 'success');
  });

  // 2. Save / Watch Later Button
  const saveBtn = container.querySelector('#action-save-btn');
  const saveText = container.querySelector('#action-save-text');
  saveBtn?.addEventListener('click', () => {
    isSavedWatchLater = !isSavedWatchLater;
    if (isSavedWatchLater) {
      addToPlaylist('watch-later', {
        id: cleanId,
        title: currentVideoData.title,
        author: currentVideoData.author || currentVideoData.channel || '',
        channel: currentVideoData.channel || currentVideoData.author || '',
        thumb: currentVideoData.thumb || `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`
      });
      showToast('Saved to Watch Later', 'success');
    } else {
      removeFromPlaylist('watch-later', cleanId);
      showToast('Removed from Watch Later', 'info');
    }
    saveBtn.classList.toggle('active', isSavedWatchLater);
    if (saveText) {
      saveText.textContent = isSavedWatchLater ? 'Saved' : 'Save';
    }
  });

  // 3. Add to Playlist Button
  const playlistBtn = container.querySelector('#action-playlist-btn');
  playlistBtn?.addEventListener('click', () => {
    showPlaylistModal(currentVideoData);
  });

  // 4. Share Button
  const shareBtn = container.querySelector('#action-share-btn');
  shareBtn?.addEventListener('click', () => {
    showShareModal(currentVideoData);
  });

  // 5. Open on YouTube Button
  const youtubeBtn = container.querySelector('#action-youtube-btn');
  youtubeBtn?.addEventListener('click', () => {
    openOnYouTube(cleanId);
  });

  // 6. More Actions Menu Dropdown (Fixed Viewport Floating Placement)
  const moreBtn = container.querySelector('#action-more-btn');
  const moreDropdown = container.querySelector('#video-more-dropdown');

  if (moreBtn && moreDropdown) {
    const positionDropdown = () => {
      const rect = moreBtn.getBoundingClientRect();
      const dropdownWidth = 220;
      const dropdownHeight = 220;

      // Vertical placement
      if (rect.bottom + dropdownHeight > window.innerHeight && rect.top > dropdownHeight) {
        moreDropdown.style.top = `${rect.top - dropdownHeight - 6}px`;
      } else {
        moreDropdown.style.top = `${rect.bottom + 6}px`;
      }

      // Horizontal placement
      const rightSpace = window.innerWidth - rect.right;
      if (rightSpace < 16) {
        moreDropdown.style.right = '16px';
        moreDropdown.style.left = 'auto';
      } else if (rect.left + dropdownWidth > window.innerWidth) {
        moreDropdown.style.right = '16px';
        moreDropdown.style.left = 'auto';
      } else {
        moreDropdown.style.right = `${Math.max(12, rightSpace)}px`;
        moreDropdown.style.left = 'auto';
      }
    };

    const closeMore = () => {
      moreDropdown.classList.remove('open');
    };

    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = moreDropdown.classList.contains('open');
      if (!isOpen) {
        positionDropdown();
        moreDropdown.classList.add('open');
      } else {
        closeMore();
      }
    });

    const handleOutsideClick = (e) => {
      if (!moreBtn.contains(e.target) && !moreDropdown.contains(e.target)) {
        closeMore();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeMore();
    };

    document.addEventListener('click', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', closeMore);
    window.addEventListener('scroll', closeMore, { passive: true });

    // Menu Actions
    container.querySelector('#more-copy-yt')?.addEventListener('click', () => {
      closeMore();
      shareYouTubeUrl(cleanId, currentVideoData.title);
    });

    container.querySelector('#more-copy-pawtube')?.addEventListener('click', () => {
      closeMore();
      sharePawTubeUrl(cleanId, currentVideoData.title);
    });

    container.querySelector('#more-add-playlist')?.addEventListener('click', () => {
      closeMore();
      showPlaylistModal(currentVideoData);
    });

    container.querySelector('#more-theatre-toggle')?.addEventListener('click', () => {
      closeMore();
      playerController.toggleTheatreMode();
    });

    container.querySelector('#more-copy-id')?.addEventListener('click', () => {
      closeMore();
      copyToClipboard(cleanId, 'Video ID copied to clipboard');
    });
  }

  // ==========================================
  // Description Expand/Collapse Toggle Logic
  // ==========================================
  const descBox = container.querySelector('#description-box');
  const descToggle = container.querySelector('#description-toggle');
  const descToggleText = container.querySelector('#description-toggle-text');
  const descToggleIcon = container.querySelector('#description-toggle-icon');

  if (descToggle && descBox) {
    descToggle.addEventListener('click', () => {
      const isExpanded = descBox.classList.toggle('expanded');
      if (descToggleText) descToggleText.textContent = isExpanded ? 'Show less' : 'Show more';
      if (descToggleIcon) descToggleIcon.textContent = isExpanded ? 'expand_less' : 'expand_more';
    });
  }

  // ==========================================
  // Asynchronously fetch video metadata from Piped
  // ==========================================
  try {
    const videoData = await PipedApi.getVideo(cleanId);
    if (currentSeq !== watchRenderSeq) return;

    // Cache metadata into videoData object
    currentVideoData = {
      id: cleanId,
      title: videoData.title || 'YouTube Video',
      channel: videoData.channel || videoData.author || 'YouTube Channel',
      author: videoData.channel || videoData.author || 'YouTube Channel',
      thumb: videoData.thumb || `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`,
      durationFormatted: ''
    };

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

    // Update description with linkification and expand toggle
    if (descBox) {
      const rawDesc = videoData.description || 'No description provided.';
      descBox.innerHTML = formatDescription(rawDesc);

      // Check if text is long enough to show toggle
      if (rawDesc.length > 160 || rawDesc.split('\n').length > 3) {
        if (descToggle) descToggle.style.display = 'inline-flex';
      } else {
        if (descToggle) descToggle.style.display = 'none';
        descBox.classList.add('expanded');
      }
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

    // Channel navigation hookup
    const rawChannelId = videoData.channelId || videoData.uploaderUrl || videoData.channel || videoData.author;
    const cleanChannelId = rawChannelId ? String(rawChannelId).replace(/^\/channel\//, '') : '';
    const channelTarget = cleanChannelId ? `#/channel/${encodeURIComponent(cleanChannelId)}` : '';

    if (channelTarget) {
      if (channelAvatarEl) {
        channelAvatarEl.onclick = () => { window.location.hash = channelTarget; };
      }
      if (channelNameEl) {
        channelNameEl.onclick = () => { window.location.hash = channelTarget; };
      }
      const infoText = container.querySelector('#channel-info-text');
      if (infoText) {
        infoText.onclick = () => { window.location.hash = channelTarget; };
      }
    }

    // Follow button logic
    const subBtn = container.querySelector('#sub-btn');
    if (subBtn && cleanChannelId) {
      let followed = isSubscribed(cleanChannelId);
      const updateFollowBtnUI = (isNowFollowed) => {
        subBtn.textContent = isNowFollowed ? 'Following' : 'Follow';
        if (isNowFollowed) {
          subBtn.style.background = 'var(--bg-elevated)';
          subBtn.style.color = 'var(--text-primary)';
          subBtn.style.borderColor = 'var(--glass-border)';
        } else {
          subBtn.style.background = 'var(--text-primary)';
          subBtn.style.color = 'var(--bg-primary)';
          subBtn.style.borderColor = 'transparent';
        }
      };

      updateFollowBtnUI(followed);

      subBtn.onclick = () => {
        followed = toggleSubscription({
          id: cleanChannelId,
          name: videoData.channel || videoData.author || 'Channel',
          avatar: videoData.avatar || ''
        });
        updateFollowBtnUI(followed);
        showToast(followed ? `Following ${videoData.channel || 'channel'}` : `Unfollowed ${videoData.channel || 'channel'}`, 'info');
      };
    }

    // Render related recommendations
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
        relatedGrid.innerHTML = related.slice(0, 15).map((r) => {
          const rChannelId = (r.channelId || r.authorId || r.uploaderUrl || r.channel || r.author || '').replace(/^\/channel\//, '');
          const rChannelHash = rChannelId ? `#/channel/${encodeURIComponent(rChannelId)}` : '';
          return `
            <div class="watch-related-item" onclick="window.location.hash='#/watch?v=${encodeURIComponent(r.id)}'">
              <div class="watch-related-thumb">
                <img src="${escapeHtml(r.thumb || `https://i.ytimg.com/vi/${r.id}/hqdefault.jpg`)}" alt="" loading="lazy" />
                <div class="duration-badge" style="position:absolute;bottom:4px;right:4px;font-size:10px;padding:1px 4px;border-radius:4px;background:rgba(0,0,0,0.8);">${escapeHtml(r.durationFormatted || '0:00')}</div>
              </div>
              <div class="watch-related-info">
                <h4 class="watch-related-title">${escapeHtml(r.title)}</h4>
                <p class="watch-related-channel" onclick="event.stopPropagation(); if ('${escapeHtml(rChannelHash)}') window.location.hash='${escapeHtml(rChannelHash)}';">
                  ${escapeHtml(r.channel || r.author || '')}
                </p>
                <p class="watch-related-views">${escapeHtml(r.viewsFormatted || '')}</p>
              </div>
            </div>
          `;
        }).join('');
      } else {
        relatedGrid.innerHTML = `<div style="font-size:13px;color:var(--text-secondary);padding:16px 0;">No related recommendations available.</div>`;
      }
    }
  } catch (err) {
    if (currentSeq !== watchRenderSeq || isAbortError(err)) return;
    console.warn('Metadata fetch failed, player continues uninterrupted:', err.message);
    const titleEl = container.querySelector('#video-title');
    if (titleEl) titleEl.textContent = 'YouTube Video';
    if (descBox) descBox.textContent = 'Direct No-Cookie playback active.';
  }
}

export default renderWatchPage;
