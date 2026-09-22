/**
 * PawTube - Channel View Page
 * YouTube-style channel experience powered purely by Piped API with local Follow persistence.
 */

import { PipedApi } from '../../api/piped/pipedApi.js';
import { renderVideoCard, renderSkeletonCards, renderErrorState } from '../../components/video/videoCard.js';
import { isFollowed, toggleFollow } from '../../storage/preferences/preferencesStorage.js';
import { showToast } from '../../components/common/toast.js';
import { escapeHtml } from '../../utils/dom.js';
import { isAbortError } from '../../api/client/apiClient.js';

let channelSeq = 0;
let currentChannelAbortController = null;
let currentTab = 'videos'; // 'videos' | 'shorts' | 'playlists' | 'about'
let channelData = null;
let channelVideos = [];
let nextpageToken = null;
let isLoadingMore = false;

function formatSubscribers(count) {
  if (!count && count !== 0) return '';
  const num = typeof count === 'number' ? count : parseInt(count, 10);
  if (isNaN(num)) return String(count);
  if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B subscribers';
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M subscribers';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K subscribers';
  return num + ' subscribers';
}

export async function renderChannelPage(container, channelId) {
  const cleanId = (channelId || '').trim();
  if (!cleanId) {
    window.location.hash = '#/home';
    return;
  }

  // Cancel any existing request
  if (currentChannelAbortController) {
    currentChannelAbortController.abort();
    currentChannelAbortController = null;
  }
  currentChannelAbortController = new AbortController();
  const signal = currentChannelAbortController.signal;
  const currentSeq = ++channelSeq;

  // Reset state
  channelData = null;
  channelVideos = [];
  nextpageToken = null;
  currentTab = 'videos';

  // Render initial skeleton view
  container.innerHTML = `
    <div class="channel-page-container" style="max-width:1280px;margin:0 auto;padding-bottom:80px;">
      <!-- Banner Skeleton -->
      <div class="channel-banner-skeleton skeleton-pulse" style="width:100%;aspect-ratio:6/1;min-height:110px;max-height:220px;border-radius:16px;background:rgba(255,255,255,0.04);margin-bottom:20px;"></div>

      <!-- Header Skeleton -->
      <div class="channel-header-skeleton" style="display:flex;gap:20px;align-items:center;padding:0 8px 24px;">
        <div class="skeleton-pulse" style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.06);flex-shrink:0;"></div>
        <div style="flex:1;">
          <div class="skeleton-pulse" style="height:24px;width:240px;border-radius:6px;background:rgba(255,255,255,0.06);margin-bottom:10px;"></div>
          <div class="skeleton-pulse" style="height:14px;width:140px;border-radius:4px;background:rgba(255,255,255,0.04);"></div>
        </div>
      </div>

      <!-- Grid Skeleton -->
      <div class="video-grid">
        ${renderSkeletonCards(8)}
      </div>
    </div>
  `;

  try {
    const res = await PipedApi.getChannel(cleanId, null, { signal });
    if (currentSeq !== channelSeq) return;

    if (!res || (!res.name && !res.id)) {
      throw new Error('Channel details could not be retrieved from Piped.');
    }

    channelData = res;
    channelVideos = Array.isArray(res.videos) ? res.videos : [];
    nextpageToken = res.nextpage || null;

    renderChannelView(container, cleanId);
  } catch (err) {
    if (currentSeq !== channelSeq) return;
    if (isAbortError(err)) return;
    console.error('Channel fetch error:', err);
    container.innerHTML = `
      <div style="max-width:800px;margin:40px auto;padding:24px;">
        ${renderErrorState(
          'Channel Unavailable',
          err.message || 'Could not load channel streams. Please check your connection or try again.',
          'window.pawtubeRetryChannel'
        )}
      </div>
    `;
    window.pawtubeRetryChannel = () => renderChannelPage(container, cleanId);
  }
}

function renderChannelView(container, channelId) {
  if (!channelData) return;

  const followed = isFollowed(channelData.id || channelId);
  const formattedSubs = formatSubscribers(channelData.subscribers);
  const pawtubeChannelUrl = `${window.location.origin}/#/channel/${encodeURIComponent(channelData.id || channelId)}`;
  const youtubeUrl = `https://www.youtube.com/channel/${encodeURIComponent(channelData.id || channelId)}`;

  // Filter content based on current tab
  const regularVideos = channelVideos.filter((v) => !v.isShort && (v.duration === undefined || v.duration > 60));
  const shortsVideos = channelVideos.filter((v) => v.isShort || (v.duration && v.duration <= 60 && v.duration > 0));
  
  // Decide which items to display
  let displayedItems = channelVideos;
  if (currentTab === 'videos') {
    displayedItems = regularVideos.length > 0 ? regularVideos : channelVideos;
  } else if (currentTab === 'shorts') {
    displayedItems = shortsVideos;
  }

  container.innerHTML = `
    <div class="channel-page-container" style="max-width:1280px;margin:0 auto;padding-bottom:80px;">
      <!-- Channel Banner -->
      ${channelData.banner ? `
        <div class="channel-banner" style="width:100%;aspect-ratio:6/1;min-height:110px;max-height:220px;border-radius:16px;overflow:hidden;background:#111;margin-bottom:20px;position:relative;">
          <img src="${escapeHtml(channelData.banner)}" alt="" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.style.display='none';" />
          <div style="position:absolute;inset:0;background:linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%);"></div>
        </div>
      ` : `
        <div class="channel-banner-fallback" style="width:100%;height:90px;border-radius:16px;background:linear-gradient(135deg, rgba(59,130,246,0.12) 0%, rgba(139,92,246,0.08) 100%);border:1px solid var(--glass-border-light);margin-bottom:20px;"></div>
      `}

      <!-- Channel Profile Header -->
      <div class="channel-header-box" style="display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start;padding:0 8px 24px;border-bottom:1px solid var(--glass-border);">
        <!-- Avatar -->
        <div class="channel-avatar-wrapper" style="position:relative;">
          <img src="${escapeHtml(channelData.avatar || '')}" alt="${escapeHtml(channelData.name)}" 
            style="width:84px;height:84px;border-radius:50%;object-fit:cover;background:var(--bg-elevated);border:2px solid var(--glass-border);box-shadow:var(--shadow-md);" 
            onerror="this.src='/public/assets/pawtube_logo.png';" />
        </div>

        <!-- Details -->
        <div class="channel-meta" style="flex:1;min-width:240px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
            <h1 style="font-size:24px;font-weight:700;letter-spacing:-0.02em;color:var(--text-primary);margin:0;">
              ${escapeHtml(channelData.name)}
            </h1>
            ${channelData.verified ? `
              <span class="material-symbols-rounded" style="font-size:18px;color:var(--brand-blue);vertical-align:middle;" title="Verified Channel">check_circle</span>
            ` : ''}
          </div>

          <div style="display:flex;align-items:center;gap:8px;font-size:13.5px;color:var(--text-secondary);margin-bottom:10px;flex-wrap:wrap;">
            ${formattedSubs ? `<span>${escapeHtml(formattedSubs)}</span><span>&bull;</span>` : ''}
            <span>${channelVideos.length}+ videos</span>
          </div>

          ${channelData.description ? `
            <div class="channel-description-clamp" id="channel-desc" style="font-size:13.5px;color:var(--text-secondary);line-height:1.5;max-width:800px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;cursor:pointer;" title="Click to expand description">
              ${escapeHtml(channelData.description)}
            </div>
            <button type="button" id="channel-desc-toggle" style="background:none;border:none;color:var(--brand-blue);font-size:12.5px;font-weight:600;padding:2px 0 8px;cursor:pointer;">
              More info
            </button>
          ` : ''}

          <!-- Action Buttons -->
          <div class="channel-action-row" style="display:flex;align-items:center;gap:10px;margin-top:8px;flex-wrap:wrap;">
            <!-- Follow Button -->
            <button type="button" id="channel-follow-btn" class="channel-follow-pill ${followed ? 'following' : ''}" 
              style="display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 18px;border-radius:999px;font-size:13.5px;font-weight:600;cursor:pointer;transition:all 0.2s cubic-bezier(0.2,0.8,0.2,1);border:1px solid ${followed ? 'var(--glass-border)' : 'transparent'};background:${followed ? 'var(--bg-elevated)' : 'var(--text-primary)'};color:${followed ? 'var(--text-primary)' : 'var(--bg-primary)'};">
              <span class="material-symbols-rounded" style="font-size:18px;">${followed ? 'check' : 'notifications_none'}</span>
              <span id="channel-follow-label">${followed ? 'Following' : 'Follow'}</span>
            </button>

            <!-- Share Button -->
            <button type="button" id="channel-share-btn" class="icon-pill" 
              style="display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 14px;border-radius:999px;background:var(--bg-surface);border:1px solid var(--glass-border);color:var(--text-primary);font-size:13px;font-weight:500;cursor:pointer;" title="Share Channel">
              <span class="material-symbols-rounded" style="font-size:18px;">share</span>
              <span>Share</span>
            </button>

            <!-- Open on YouTube -->
            <a href="${escapeHtml(youtubeUrl)}" target="_blank" rel="noopener noreferrer" class="icon-pill"
              style="display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 14px;border-radius:999px;background:var(--bg-surface);border:1px solid var(--glass-border);color:var(--text-secondary);font-size:13px;font-weight:500;text-decoration:none;" title="Open channel on YouTube">
              <span class="material-symbols-rounded" style="font-size:18px;">open_in_new</span>
              <span>YouTube</span>
            </a>
          </div>
        </div>
      </div>

      <!-- Channel Tabs Navigation Bar -->
      <div class="channel-tabs-bar" style="display:flex;align-items:center;gap:12px;padding:16px 8px 12px;border-bottom:1px solid var(--glass-border-light);margin-bottom:24px;overflow-x:auto;">
        <button type="button" class="channel-tab-btn ${currentTab === 'videos' ? 'active' : ''}" data-tab="videos" style="background:none;border:none;padding:8px 16px;border-radius:999px;font-size:14px;font-weight:${currentTab === 'videos' ? '600' : '500'};color:${currentTab === 'videos' ? 'var(--text-primary)' : 'var(--text-secondary)'};background:${currentTab === 'videos' ? 'var(--bg-elevated)' : 'transparent'};border:1px solid ${currentTab === 'videos' ? 'var(--glass-border)' : 'transparent'};cursor:pointer;white-space:nowrap;">
          Videos (${regularVideos.length})
        </button>

        ${shortsVideos.length > 0 ? `
          <button type="button" class="channel-tab-btn ${currentTab === 'shorts' ? 'active' : ''}" data-tab="shorts" style="background:none;border:none;padding:8px 16px;border-radius:999px;font-size:14px;font-weight:${currentTab === 'shorts' ? '600' : '500'};color:${currentTab === 'shorts' ? 'var(--text-primary)' : 'var(--text-secondary)'};background:${currentTab === 'shorts' ? 'var(--bg-elevated)' : 'transparent'};border:1px solid ${currentTab === 'shorts' ? 'var(--glass-border)' : 'transparent'};cursor:pointer;white-space:nowrap;">
            Shorts (${shortsVideos.length})
          </button>
        ` : ''}

        <button type="button" class="channel-tab-btn ${currentTab === 'about' ? 'active' : ''}" data-tab="about" style="background:none;border:none;padding:8px 16px;border-radius:999px;font-size:14px;font-weight:${currentTab === 'about' ? '600' : '500'};color:${currentTab === 'about' ? 'var(--text-primary)' : 'var(--text-secondary)'};background:${currentTab === 'about' ? 'var(--bg-elevated)' : 'transparent'};border:1px solid ${currentTab === 'about' ? 'var(--glass-border)' : 'transparent'};cursor:pointer;white-space:nowrap;">
          About
        </button>
      </div>

      <!-- Tab Content Area -->
      <div id="channel-tab-content">
        ${currentTab === 'about' ? renderAboutTab(channelData, pawtubeChannelUrl, youtubeUrl) : `
          <div class="video-grid" id="channel-videos-grid">
            ${displayedItems.map(renderVideoCard).join('')}
          </div>

          ${displayedItems.length === 0 ? `
            <div style="padding:60px 20px;text-align:center;color:var(--text-secondary);">
              <span class="material-symbols-rounded" style="font-size:48px;color:var(--text-tertiary);margin-bottom:12px;">video_library</span>
              <h3 style="font-size:17px;font-weight:600;color:var(--text-primary);margin-bottom:6px;">No videos found</h3>
              <p>This channel has not posted content under this section yet.</p>
            </div>
          ` : ''}

          <!-- Pagination / Load More -->
          ${nextpageToken ? `
            <div style="text-align:center;margin-top:36px;" id="channel-load-more-box">
              <button type="button" id="channel-load-more-btn" style="padding:10px 28px;border-radius:999px;background:var(--bg-surface);border:1px solid var(--glass-border);color:var(--text-primary);font-size:14px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;box-shadow:var(--shadow-sm);transition:all 0.2s;">
                <span>Load More Videos</span>
                <span class="material-symbols-rounded" style="font-size:18px;">expand_more</span>
              </button>
            </div>
          ` : ''}
        `}
      </div>
    </div>
  `;

  // Bind Description Toggle
  const descEl = container.querySelector('#channel-desc');
  const toggleBtn = container.querySelector('#channel-desc-toggle');
  if (descEl && toggleBtn) {
    let expanded = false;
    const toggle = () => {
      expanded = !expanded;
      if (expanded) {
        descEl.style.display = 'block';
        descEl.style.webkitLineClamp = 'unset';
        toggleBtn.textContent = 'Show less';
      } else {
        descEl.style.display = '-webkit-box';
        descEl.style.webkitLineClamp = '2';
        toggleBtn.textContent = 'More info';
      }
    };
    descEl.addEventListener('click', toggle);
    toggleBtn.addEventListener('click', toggle);
  }

  // Bind Follow Button
  const followBtn = container.querySelector('#channel-follow-btn');
  if (followBtn) {
    followBtn.addEventListener('click', () => {
      const nowFollowed = toggleFollow({
        id: channelData.id || channelId,
        name: channelData.name,
        avatar: channelData.avatar,
        verified: channelData.verified,
        subscribers: channelData.subscribers
      });

      if (nowFollowed) {
        followBtn.classList.add('following');
        followBtn.style.background = 'var(--bg-elevated)';
        followBtn.style.color = 'var(--text-primary)';
        followBtn.style.borderColor = 'var(--glass-border)';
        followBtn.innerHTML = `
          <span class="material-symbols-rounded" style="font-size:18px;">check</span>
          <span id="channel-follow-label">Following</span>
        `;
        showToast(`Following ${channelData.name}`, 'success');
      } else {
        followBtn.classList.remove('following');
        followBtn.style.background = 'var(--text-primary)';
        followBtn.style.color = 'var(--bg-primary)';
        followBtn.style.borderColor = 'transparent';
        followBtn.innerHTML = `
          <span class="material-symbols-rounded" style="font-size:18px;">notifications_none</span>
          <span id="channel-follow-label">Follow</span>
        `;
        showToast(`Unfollowed ${channelData.name}`, 'info');
      }
    });
  }

  // Bind Share Button
  const shareBtn = container.querySelector('#channel-share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      openChannelShareModal(channelData, pawtubeChannelUrl, youtubeUrl);
    });
  }

  // Bind Tab Buttons
  container.querySelectorAll('.channel-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      if (tab && tab !== currentTab) {
        currentTab = tab;
        renderChannelView(container, channelId);
      }
    });
  });

  // Bind Load More Button
  const loadMoreBtn = container.querySelector('#channel-load-more-btn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', async () => {
      if (isLoadingMore || !nextpageToken) return;
      isLoadingMore = true;
      loadMoreBtn.disabled = true;
      loadMoreBtn.innerHTML = `
        <span class="material-symbols-rounded spinner-icon" style="font-size:18px;animation:spin 1s linear infinite;">progress_activity</span>
        <span>Loading...</span>
      `;

      try {
        const nextRes = await PipedApi.getChannel(channelData.id || channelId, nextpageToken);
        const newVideos = Array.isArray(nextRes.videos) ? nextRes.videos : [];
        nextpageToken = nextRes.nextpage || null;

        if (newVideos.length > 0) {
          channelVideos = [...channelVideos, ...newVideos];
          const grid = container.querySelector('#channel-videos-grid');
          if (grid) {
            const fragment = document.createRange().createContextualFragment(
              newVideos.map(renderVideoCard).join('')
            );
            grid.appendChild(fragment);
          }
        }

        const box = container.querySelector('#channel-load-more-box');
        if (!nextpageToken && box) {
          box.innerHTML = `<p style="font-size:13px;color:var(--text-tertiary);padding:12px 0;">All videos loaded</p>`;
        } else {
          loadMoreBtn.disabled = false;
          loadMoreBtn.innerHTML = `
            <span>Load More Videos</span>
            <span class="material-symbols-rounded" style="font-size:18px;">expand_more</span>
          `;
        }
      } catch (loadErr) {
        console.error('Load more failed:', loadErr);
        showToast('Failed to load more videos', 'error');
        loadMoreBtn.disabled = false;
        loadMoreBtn.innerHTML = `
          <span>Retry Loading Videos</span>
          <span class="material-symbols-rounded" style="font-size:18px;">refresh</span>
        `;
      } finally {
        isLoadingMore = false;
      }
    });
  }
}

function renderAboutTab(channel, pawtubeUrl, ytUrl) {
  return `
    <div class="channel-about-card" style="max-width:800px;padding:24px;background:var(--bg-surface);border-radius:16px;border:1px solid var(--glass-border);line-height:1.6;">
      <h3 style="font-size:18px;font-weight:700;margin-bottom:12px;color:var(--text-primary);">Description</h3>
      <p style="font-size:14px;color:var(--text-secondary);white-space:pre-wrap;margin-bottom:24px;">
        ${escapeHtml(channel.description || 'No description provided for this channel.')}
      </p>

      <div style="border-top:1px solid var(--glass-border-light);padding-top:16px;">
        <h4 style="font-size:15px;font-weight:600;margin-bottom:12px;color:var(--text-primary);">Channel Details</h4>
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;font-size:13.5px;color:var(--text-secondary);">
          <div>
            <div style="color:var(--text-tertiary);font-size:12px;">Subscribers</div>
            <div style="font-weight:600;color:var(--text-primary);margin-top:2px;">${formatSubscribers(channel.subscribers) || 'Hidden'}</div>
          </div>
          <div>
            <div style="color:var(--text-tertiary);font-size:12px;">Status</div>
            <div style="font-weight:600;color:var(--text-primary);margin-top:2px;">${channel.verified ? 'Verified Creator' : 'Creator'}</div>
          </div>
          <div>
            <div style="color:var(--text-tertiary);font-size:12px;">Channel ID</div>
            <div style="font-family:monospace;font-size:12px;color:var(--text-primary);margin-top:2px;word-break:break-all;">${escapeHtml(channel.id)}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function openChannelShareModal(channel, pawtubeUrl, ytUrl) {
  const existing = document.getElementById('channel-share-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'channel-share-modal';
  modal.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
    z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;animation:fadeIn 0.2s ease-out;
  `;

  modal.innerHTML = `
    <div style="background:var(--bg-elevated);border:1px solid var(--glass-border);border-radius:20px;width:100%;max-width:440px;padding:24px;box-shadow:var(--shadow-float);position:relative;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3 style="font-size:18px;font-weight:700;display:flex;align-items:center;gap:8px;">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">share</span>
          Share Channel
        </h3>
        <button type="button" id="share-modal-close" class="icon-btn" aria-label="Close" style="width:32px;height:32px;">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>

      <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg-surface);border-radius:12px;border:1px solid var(--glass-border-light);margin-bottom:20px;">
        <img src="${escapeHtml(channel.avatar || '')}" alt="" style="width:44px;height:44px;border-radius:50%;object-fit:cover;" onerror="this.src='/public/assets/pawtube_logo.png';" />
        <div style="flex:1;overflow:hidden;">
          <div style="font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(channel.name)}</div>
          <div style="font-size:12px;color:var(--text-secondary);">${formatSubscribers(channel.subscribers)}</div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px;">
        <!-- Native Share if available -->
        ${navigator.share ? `
          <button type="button" id="share-native-btn" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;background:var(--brand-blue);color:#fff;border:none;font-size:14px;font-weight:600;cursor:pointer;">
            <span class="material-symbols-rounded">ios_share</span>
            <span>Share via...</span>
          </button>
        ` : ''}

        <!-- Copy PawTube Link -->
        <button type="button" id="share-copy-pawtube" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;background:var(--bg-surface);border:1px solid var(--glass-border);color:var(--text-primary);font-size:14px;font-weight:500;cursor:pointer;">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">link</span>
          <span>Copy PawTube Channel URL</span>
        </button>

        <!-- Copy YouTube Link -->
        <button type="button" id="share-copy-youtube" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;background:var(--bg-surface);border:1px solid var(--glass-border);color:var(--text-primary);font-size:14px;font-weight:500;cursor:pointer;">
          <span class="material-symbols-rounded" style="color:var(--brand-red);">smart_display</span>
          <span>Copy YouTube Channel URL</span>
        </button>

        <!-- Open on YouTube -->
        <a href="${escapeHtml(ytUrl)}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;background:var(--bg-surface);border:1px solid var(--glass-border);color:var(--text-primary);font-size:14px;font-weight:500;text-decoration:none;">
          <span class="material-symbols-rounded">open_in_new</span>
          <span>Open on YouTube</span>
        </a>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  modal.querySelector('#share-modal-close')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  modal.querySelector('#share-native-btn')?.addEventListener('click', async () => {
    try {
      await navigator.share({
        title: `${channel.name} on PawTube`,
        url: pawtubeUrl
      });
      closeModal();
    } catch {}
  });

  modal.querySelector('#share-copy-pawtube')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pawtubeUrl);
      showToast('PawTube link copied to clipboard', 'success');
      closeModal();
    } catch {
      showToast('Failed to copy link', 'error');
    }
  });

  modal.querySelector('#share-copy-youtube')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(ytUrl);
      showToast('YouTube link copied to clipboard', 'success');
      closeModal();
    } catch {
      showToast('Failed to copy link', 'error');
    }
  });
}

export default renderChannelPage;
