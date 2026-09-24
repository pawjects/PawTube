/**
 * PawTube - Compact Horizontal List View Component
 * Used for Continue Watching and Watch History across Home, You, and Library pages.
 * Features:
 * - 16:9 responsive thumbnail on LEFT
 * - Rich metadata, channel, and playback info on RIGHT
 * - Accurate progress tracking with PawTube accent color
 * - Remaining duration display (e.g. '08:42 remaining')
 * - Line-clamped titles (max 2 lines)
 * - Desktop hover elevation & touch-friendly hit areas
 * - Pure Liquid Glass AMOLED styling
 */

import { escapeHtml } from '../../utils/dom.js';
import { formatDuration, formatViews, formatUploadedDate } from '../../api/normalization/mediaModels.js';

/**
 * Format remaining time cleanly (e.g. '08:42 remaining', '12:34 remaining')
 */
function formatRemainingTime(seconds) {
  if (typeof seconds !== 'number' || seconds <= 0) return '';
  const dur = formatDuration(seconds);
  return `${dur} remaining`;
}

/**
 * Format relative watched time for history when upload date is unavailable
 */
function formatRelativeWatched(timestamp) {
  if (!timestamp || typeof timestamp !== 'number') return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Renders a compact horizontal list item with thumbnail on LEFT and metadata on RIGHT.
 *
 * @param {Object} v - The video/history item
 * @param {Object} [options]
 * @param {boolean} [options.isContinueWatching=false] - In-progress resume style
 * @param {boolean} [options.showProgress=true] - Render progress bar if playback progress exists
 * @param {boolean} [options.showRemainingTime] - Display 'XX:XX remaining' badge
 * @param {boolean} [options.showHistoryMetadata] - Display views/upload date
 * @param {boolean} [options.showRemoveButton=false] - Display button to remove from history
 * @param {boolean} [options.resumeOnClick] - Resume from saved timestamp
 * @returns {string} HTML markup
 */
export function renderCompactVideoCard(v, options = {}) {
  if (!v || !v.id) return '';

  const {
    isContinueWatching = false,
    showProgress = true,
    showRemainingTime = isContinueWatching,
    showHistoryMetadata = true,
    showRemoveButton = false,
    resumeOnClick = isContinueWatching
  } = options;

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

  // Duration in seconds
  const durationSeconds = (v.durationSeconds !== undefined && v.durationSeconds !== null)
    ? v.durationSeconds
    : (typeof v.duration === 'number' ? v.duration : 0);

  const durationText = v.durationFormatted || (durationSeconds > 0 ? formatDuration(durationSeconds) : '');

  // Saved progress in seconds
  const progressSeconds = typeof v.progress === 'number' ? Math.max(0, Math.floor(v.progress)) : 0;

  // Actual saved playback percentage (strictly from stored progress / duration)
  let watchedPercent = 0;
  if (typeof v.watchedPercentage === 'number' && v.watchedPercentage > 0) {
    watchedPercent = Math.min(100, Math.max(0, Math.round(v.watchedPercentage)));
  } else if (durationSeconds > 0 && progressSeconds > 0) {
    watchedPercent = Math.min(100, Math.max(0, Math.round((progressSeconds / durationSeconds) * 100)));
  }

  // Calculate remaining time for Continue Watching
  let remainingText = '';
  if (showRemainingTime && durationSeconds > 0 && progressSeconds > 0 && progressSeconds < durationSeconds) {
    const rem = Math.max(0, durationSeconds - progressSeconds);
    remainingText = formatRemainingTime(rem);
  } else if (showRemainingTime && progressSeconds > 0) {
    remainingText = `${formatDuration(progressSeconds)} watched`;
  }

  // Target video route:
  // If resumeOnClick is enabled and progress > 0, include timestamp parameter;
  // otherwise open video normally as per standard history behavior.
  const navUrl = (resumeOnClick && progressSeconds > 0)
    ? `#/watch?v=${encodeURIComponent(v.id)}&t=${progressSeconds}`
    : `#/watch?v=${encodeURIComponent(v.id)}`;

  // Construct metadata row (views and upload date)
  let metadataHtml = '';
  if (showHistoryMetadata) {
    const viewsStr = v.viewsFormatted || (v.views ? formatViews(v.views) : '');
    const dateStr = v.uploadedFormatted || (v.uploadedDate ? formatUploadedDate(v.uploadedDate) : '');

    if (viewsStr && dateStr) {
      metadataHtml = `<span>${escapeHtml(viewsStr)}</span><span class="meta-dot">&bull;</span><span>${escapeHtml(dateStr)}</span>`;
    } else if (viewsStr) {
      metadataHtml = `<span>${escapeHtml(viewsStr)}</span>`;
    } else if (dateStr) {
      metadataHtml = `<span>${escapeHtml(dateStr)}</span>`;
    } else if (v.watchedAt) {
      metadataHtml = `<span>Watched ${escapeHtml(formatRelativeWatched(v.watchedAt))}</span>`;
    }
  }

  const shouldRenderProgressBar = showProgress && watchedPercent > 0 && watchedPercent < 100;

  return `
    <div class="compact-video-card compact-list-item ${isContinueWatching ? 'is-continue-card is-continue-item' : 'is-history-card is-history-item'}"
         data-video-id="${escapeHtml(v.id)}"
         tabindex="0"
         role="button"
         aria-label="${escapeHtml(v.title || 'Video')}"
         onclick="window.location.hash='${escapeHtml(navUrl)}'"
         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.location.hash='${escapeHtml(navUrl)}';}">
      
      <!-- LEFT: Compact 16:9 Thumbnail -->
      <div class="compact-thumb-wrap compact-list-thumb">
        <img src="${escapeHtml(thumbUrl)}"
             alt="${escapeHtml(v.title || 'Thumbnail')}"
             loading="lazy"
             onerror="this.onerror=null;if('${escapeHtml(v.id)}')this.src='https://i.ytimg.com/vi/${escapeHtml(v.id)}/hqdefault.jpg';" />

        <!-- Duration Badge -->
        ${durationText ? `
          <div class="compact-duration-badge" aria-label="Duration ${escapeHtml(durationText)}">
            ${escapeHtml(durationText)}
          </div>
        ` : ''}

        <!-- Playback Progress Indicator along bottom of thumbnail -->
        ${shouldRenderProgressBar ? `
          <div class="compact-progress-track" aria-hidden="true">
            <div class="compact-progress-fill" style="width: ${watchedPercent}%;"></div>
          </div>
        ` : ''}

        <!-- Desktop Play Affordance Overlay -->
        <div class="compact-thumb-play-overlay" aria-hidden="true">
          <span class="material-symbols-rounded">play_arrow</span>
        </div>
      </div>

      <!-- RIGHT: Card Information & Metadata -->
      <div class="compact-card-info compact-list-content">
        <div class="compact-card-title-row">
          <div class="compact-card-title compact-list-title" title="${escapeHtml(v.title || 'Video')}">
            ${escapeHtml(v.title || 'Untitled Video')}
          </div>

          <!-- History Remove Button -->
          ${showRemoveButton ? `
            <button type="button"
                    class="compact-card-remove-btn remove-history-item-btn"
                    data-video-id="${escapeHtml(v.id)}"
                    title="Remove from history"
                    aria-label="Remove from history"
                    onclick="event.stopPropagation();">
              <span class="material-symbols-rounded">close</span>
            </button>
          ` : ''}
        </div>

        <div class="compact-card-channel compact-list-channel"
             title="${escapeHtml(channelName)}"
             onclick="if('${escapeHtml(channelHash)}'){event.stopPropagation();window.location.hash='${escapeHtml(channelHash)}';}">
          <span class="compact-channel-name">${escapeHtml(channelName)}</span>
          ${isVerified ? `
            <span class="material-symbols-rounded verified-badge" title="Verified Creator" aria-hidden="true">check_circle</span>
          ` : ''}
        </div>

        <!-- Views / Upload Date row -->
        ${metadataHtml ? `
          <div class="compact-card-meta compact-list-meta">
            ${metadataHtml}
          </div>
        ` : ''}

        <!-- Continue Watching: Progress bar & Remaining duration row -->
        ${isContinueWatching && (remainingText || shouldRenderProgressBar) ? `
          <div class="compact-list-progress-row">
            ${shouldRenderProgressBar ? `
              <div class="compact-inline-progress-track" title="${watchedPercent}% watched" aria-hidden="true">
                <div class="compact-inline-progress-fill" style="width: ${watchedPercent}%;"></div>
              </div>
            ` : ''}
            ${remainingText ? `
              <span class="compact-remaining-badge">
                <span class="material-symbols-rounded" aria-hidden="true">schedule</span>
                <span>${escapeHtml(remainingText)}</span>
              </span>
            ` : ''}
          </div>
        ` : ''}

        <!-- Watch History: Watched progress info if partially watched -->
        ${!isContinueWatching && shouldRenderProgressBar ? `
          <div class="compact-list-progress-row">
            <div class="compact-inline-progress-track" title="${watchedPercent}% watched" aria-hidden="true">
              <div class="compact-inline-progress-fill" style="width: ${watchedPercent}%;"></div>
            </div>
            <span class="compact-history-progress-text">${watchedPercent}% watched</span>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// Aliases for seamless integration
export const renderCompactListCard = renderCompactVideoCard;
export const renderCompactVideoListItem = renderCompactVideoCard;

/**
 * Compact, professional empty state for Continue Watching and Watch History.
 *
 * @param {Object} options
 * @param {string} options.icon - Material icon name
 * @param {string} options.title - Primary message title
 * @param {string} options.description - Supporting explanation
 * @returns {string} HTML markup
 */
export function renderCompactEmptyState({ icon = 'history', title, description }) {
  return `
    <div class="compact-empty-state" role="status">
      <div class="compact-empty-icon" aria-hidden="true">
        <span class="material-symbols-rounded">${escapeHtml(icon)}</span>
      </div>
      <div class="compact-empty-text">
        <div class="compact-empty-title">${escapeHtml(title)}</div>
        <div class="compact-empty-desc">${escapeHtml(description)}</div>
      </div>
    </div>
  `;
}
