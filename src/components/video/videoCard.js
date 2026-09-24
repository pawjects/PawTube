/**
 * PawTube - Video Card Component
 */

import { escapeHtml } from '../../utils/dom.js';
import { getHistory } from '../../storage/history/historyStorage.js';
import { formatDuration } from '../../api/normalization/mediaModels.js';
export { renderCompactVideoCard, renderCompactEmptyState } from './compactVideoCard.js';

export function renderVideoCard(v) {
  if (!v || !v.id) return '';
  const thumbUrl = v.thumb || v.thumbnail || (v.id ? `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg` : '');
  const channelName = v.channel || v.author || v.uploaderName || 'Unknown Channel';
  
  let cleanChannelId = (v.channelId || v.authorId || '').replace(/^\/channel\//, '');
  if (!cleanChannelId && v.uploaderUrl) {
    cleanChannelId = v.uploaderUrl.replace(/^\/channel\//, '');
  }
  if (!cleanChannelId && channelName && channelName !== 'Unknown Channel') {
    cleanChannelId = channelName;
  }
  const channelHash = cleanChannelId ? `#/channel/${encodeURIComponent(cleanChannelId)}` : '';
  const isVerified = Boolean(v.uploaderVerified || v.verified);
  const avatarUrl = v.avatar || v.uploaderAvatar || '';

  // Check watch progress in history
  let watchedPercent = v.watchedPercentage || 0;
  if (!watchedPercent) {
    try {
      const hist = getHistory();
      const match = hist.find((h) => h.id === v.id);
      if (match && match.watchedPercentage) {
        watchedPercent = match.watchedPercentage;
      }
    } catch {}
  }

  const durationText = v.durationFormatted || formatDuration(v.durationSeconds !== undefined ? v.durationSeconds : v.duration);

  return `
    <div class="video-card" data-video-id="${escapeHtml(v.id)}" onclick="window.location.hash='#/watch?v=${encodeURIComponent(v.id)}'">
      <div class="thumbnail-wrap" style="position:relative;overflow:hidden;border-radius:12px;">
        <img src="${escapeHtml(thumbUrl)}" alt="${escapeHtml(v.title)}" loading="lazy" onerror="this.onerror=null;if('${escapeHtml(v.id)}')this.src='https://i.ytimg.com/vi/${escapeHtml(v.id)}/hqdefault.jpg';" />
        <div class="duration-badge">${escapeHtml(durationText)}</div>
        ${watchedPercent > 0 ? `
          <div class="video-card-progress" style="position:absolute;bottom:0;left:0;right:0;height:3.5px;background:rgba(255,255,255,0.25);z-index:2;">
            <div style="height:100%;background:var(--brand-red);width:${Math.min(100, Math.max(0, watchedPercent))}%;"></div>
          </div>
        ` : ''}
      </div>
      <div class="card-info">
        ${avatarUrl ? `
          <img class="card-avatar" src="${escapeHtml(avatarUrl)}" alt="" loading="lazy" 
            onclick="event.stopPropagation(); if ('${escapeHtml(channelHash)}') window.location.hash='${escapeHtml(channelHash)}';" onerror="this.style.display='none';" />
        ` : (cleanChannelId ? `
          <div class="card-avatar-placeholder" onclick="event.stopPropagation(); window.location.hash='${escapeHtml(channelHash)}';" title="${escapeHtml(channelName)}">
            <span class="material-symbols-rounded">person</span>
          </div>
        ` : '')}
        <div class="card-meta">
          <div class="card-title-row">
            <div class="card-title" title="${escapeHtml(v.title)}">${escapeHtml(v.title)}</div>
            <button type="button" class="card-overflow-btn" aria-label="Video options" style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;margin:-6px -8px 0 0;"
              onclick="event.stopPropagation(); if (window.pawtubeOpenCardMenu) window.pawtubeOpenCardMenu(this, event, '${escapeHtml(v.id)}', '${escapeHtml(v.title.replace(/'/g, "\\'"))}', '${escapeHtml(cleanChannelId)}', '${escapeHtml(channelName.replace(/'/g, "\\'"))}');">
              <span class="material-symbols-rounded">more_vert</span>
            </button>
          </div>
          <div class="card-channel" onclick="event.stopPropagation(); if ('${escapeHtml(channelHash)}') window.location.hash='${escapeHtml(channelHash)}';">
            <span>${escapeHtml(channelName)}</span>
            ${isVerified ? `
              <span class="material-symbols-rounded verified-badge" title="Verified Creator">check_circle</span>
            ` : ''}
          </div>
          <div class="card-stats">
            <span>${escapeHtml(v.viewsFormatted || '')}</span>
            ${v.uploadedFormatted ? `<span>&bull;</span><span>${escapeHtml(v.uploadedFormatted)}</span>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderSkeletonCards(count = 8) {
  return Array.from({ length: count }).map(() => `
    <div class="video-card skeleton-card">
      <div class="skel-thumb skeleton-pulse" style="aspect-ratio:16/9;border-radius:12px;background:rgba(255,255,255,0.06);"></div>
      <div class="card-info" style="margin-top:10px;display:flex;gap:12px;">
        <div class="skel-avatar skeleton-pulse" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.06);flex-shrink:0;"></div>
        <div style="flex:1;">
          <div class="skel-title skeleton-pulse" style="height:16px;border-radius:4px;background:rgba(255,255,255,0.06);margin-bottom:8px;width:90%;"></div>
          <div class="skel-text skeleton-pulse" style="height:12px;border-radius:4px;background:rgba(255,255,255,0.04);margin-bottom:6px;width:60%;"></div>
        </div>
      </div>
    </div>
  `).join('');
}

export function renderEmptyState(title, subtitle) {
  return `
    <div style="grid-column: 1 / -1; padding: 60px 20px; text-align: center; color: var(--text-secondary);">
      <span class="material-symbols-rounded" style="font-size: 48px; color: var(--text-tertiary); margin-bottom: 12px;">search_off</span>
      <h3 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">${escapeHtml(title)}</h3>
      <p style="font-size: 13.5px; max-width: 400px; margin: 0 auto;">${escapeHtml(subtitle)}</p>
    </div>
  `;
}

export function renderErrorState(title, message, retryCallbackName) {
  return `
    <div style="grid-column: 1 / -1; padding: 60px 20px; text-align: center; color: var(--text-secondary);">
      <span class="material-symbols-rounded" style="font-size: 48px; color: var(--brand-red); margin-bottom: 12px;">error_outline</span>
      <h3 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">${escapeHtml(title)}</h3>
      <p style="font-size: 13.5px; max-width: 440px; margin: 0 auto 16px;">${escapeHtml(message)}</p>
      ${retryCallbackName ? `
        <button class="liquid-btn" onclick="${escapeHtml(retryCallbackName)}()" style="padding:8px 20px;border-radius:999px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-primary);font-size:14px;cursor:pointer;">
          Retry
        </button>
      ` : ''}
    </div>
  `;
}
