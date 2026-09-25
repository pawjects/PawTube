/**
 * PawTube - You & Settings Page
 * Modern Profile & Library Hub powered entirely by local persistence.
 * Zero tracking, no Google/YouTube login required.
 */

import {
  getPreferences,
  savePreferences,
  resetPreferences,
  getCustomInstance,
  setCustomInstance,
  getSubscriptions,
  toggleSubscription,
  exportAllUserData,
  clearAllLocalUserData
} from '../../storage/preferences/preferencesStorage.js';
import { getHistory, clearHistory, removeFromHistory, getContinueWatching } from '../../storage/history/historyStorage.js';
import { getPlaylists } from '../../storage/playlists/playlistStorage.js';
import { getLikedVideos } from '../../storage/likes/likesStorage.js';
import { getRecentSearches, clearRecentSearches } from '../../storage/personalization/personalizationEngine.js';
import { renderCompactVideoCard, renderCompactEmptyState } from '../../components/video/compactVideoCard.js';
import { showToast } from '../../components/common/toast.js';
import { escapeHtml } from '../../utils/dom.js';

function formatTimestamp(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function sanitizeUsername(input) {
  if (!input || typeof input !== 'string') return 'Explorer';
  const cleaned = input.replace(/[<>'"&]/g, '').trim();
  if (cleaned.length === 0) return 'Explorer';
  return cleaned.slice(0, 24);
}

export function renderYouPage(container) {
  const prefs = getPreferences();
  const currentUsername = prefs.username || 'Explorer';
  const customInstance = getCustomInstance();
  const subs = getSubscriptions();
  const history = getHistory();
  const playlists = getPlaylists();
  const likedVideos = getLikedVideos();
  const recentSearches = getRecentSearches();

  let expandedCategories = new Set();
  try {
    const saved = localStorage.getItem('pawtube_expanded_settings');
    if (saved) {
      expandedCategories = new Set(JSON.parse(saved));
    } else {
      expandedCategories = new Set(['appearance']);
    }
  } catch {
    expandedCategories = new Set(['appearance']);
  }

  const watchLaterPlaylist = playlists.find((p) => p.id === 'watch-later');
  const watchLaterCount = (watchLaterPlaylist?.items || []).length;

  // Continue watching: videos actively in progress
  const continueWatching = getContinueWatching();

  const greeting = getGreeting();

  container.innerHTML = `
    <div class="you-container" style="max-width:980px;margin:0 auto;padding-bottom:100px;">
      
      <!-- ============================================== -->
      <!-- 1. PROFILE SECTION WITH EDITABLE NAME -->
      <!-- ============================================== -->
      <div class="you-profile-card" style="display:flex;flex-wrap:wrap;align-items:center;gap:20px;padding:24px;background:var(--bg-surface);border-radius:20px;border:1px solid var(--glass-border);margin-bottom:24px;box-shadow:var(--shadow-sm);">
        <!-- Avatar with Paw Icon (Neutral AMOLED Surface) -->
        <div style="width:64px;height:64px;border-radius:50%;background:var(--bg-elevated);border:1px solid var(--glass-border);display:flex;align-items:center;justify-content:center;color:var(--text-primary);box-shadow:var(--shadow-sm);flex-shrink:0;">
          <span class="material-symbols-rounded" style="font-size:32px;">pets</span>
        </div>

        <!-- Identity Details -->
        <div style="flex:1;min-width:240px;">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <h2 id="profile-greeting-heading" style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0;color:var(--text-primary);">
              Hello, <span id="display-user-name">${escapeHtml(currentUsername)}</span>
            </h2>
            <button id="edit-name-btn" type="button" aria-label="Edit display name" style="display:inline-flex;align-items:center;gap:4px;padding:5px 12px;border-radius:999px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-secondary);font-size:12px;cursor:pointer;transition:all 0.15s;">
              <span class="material-symbols-rounded" style="font-size:14px;">edit</span>
              <span>Edit name</span>
            </button>
            <span style="font-size:11.5px;color:var(--text-tertiary);font-weight:500;">
              Local Profile
            </span>
          </div>

          <!-- Inline Name Editor (Initially Hidden) -->
          <div id="name-editor-box" style="display:none;margin-top:12px;padding:12px;background:var(--bg-elevated);border-radius:12px;border:1px solid var(--glass-border);">
            <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:6px;">Local display name (max 24 characters):</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              <input 
                type="text" 
                id="name-input" 
                class="selectable-text profile-name-input" 
                maxlength="24" 
                value="${escapeHtml(currentUsername)}" 
                style="flex:1;min-width:180px;height:38px;padding:0 12px;border-radius:8px;background:var(--bg-surface);border:1px solid var(--glass-border);color:var(--text-primary);font-size:13.5px;" 
                placeholder="Enter name..."
              />
              <button id="save-name-btn" type="button" style="height:38px;padding:0 16px;border-radius:8px;background:var(--brand-blue);color:#fff;border:none;font-size:13px;font-weight:600;cursor:pointer;">
                Save
              </button>
              <button id="cancel-name-btn" type="button" style="height:38px;padding:0 12px;border-radius:8px;background:transparent;border:1px solid var(--glass-border);color:var(--text-secondary);font-size:13px;cursor:pointer;">
                Cancel
              </button>
              <button id="reset-name-btn" type="button" style="height:38px;padding:0 12px;border-radius:8px;background:transparent;border:none;color:var(--text-tertiary);font-size:12px;cursor:pointer;text-decoration:underline;">
                Reset
              </button>
            </div>
          </div>

          <p style="font-size:13px;color:var(--text-secondary);margin:5px 0 0 0;">
            Local profile &bull; Stored on this device
          </p>

          <!-- Quick Stats (Clean unboxed typography) -->
          <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12.5px;color:var(--text-secondary);margin-top:12px;">
            <span><strong>${history.length}</strong> watched</span>
            <span aria-hidden="true">&bull;</span>
            <span><strong>${likedVideos.length}</strong> liked</span>
            <span aria-hidden="true">&bull;</span>
            <span><strong>${playlists.length}</strong> playlists</span>
            <span aria-hidden="true">&bull;</span>
            <span><strong>${subs.length}</strong> following</span>
          </div>
        </div>
      </div>

      <!-- ============================================== -->
      <!-- 2. YOUR ACTIVITY -->
      <!-- ============================================== -->
      <div style="margin-bottom:24px;">
        <h3 style="font-size:18px;font-weight:700;color:var(--text-primary);margin:0 0 14px 0;display:flex;align-items:center;gap:8px;">
          <span class="material-symbols-rounded" style="color:var(--text-secondary);">motion_photos_paused</span>
          Your Activity
        </h3>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:16px;">
          <div class="you-quick-link" id="scroll-to-continue-btn" style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:var(--bg-surface);border-radius:16px;border:1px solid var(--glass-border);cursor:pointer;transition:all 0.15s;">
            <div style="width:40px;height:40px;border-radius:10px;background:var(--bg-elevated);border:1px solid var(--glass-border-light);color:var(--text-secondary);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <span class="material-symbols-rounded" style="font-size:22px;">play_circle</span>
            </div>
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--text-primary);">Continue Watching</div>
              <div style="font-size:12px;color:var(--text-secondary);">${continueWatching.length} in progress</div>
            </div>
          </div>

          <div class="you-quick-link" id="scroll-to-history-btn" style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:var(--bg-surface);border-radius:16px;border:1px solid var(--glass-border);cursor:pointer;transition:all 0.15s;">
            <div style="width:40px;height:40px;border-radius:10px;background:var(--bg-elevated);border:1px solid var(--glass-border-light);color:var(--text-secondary);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <span class="material-symbols-rounded" style="font-size:22px;">history</span>
            </div>
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--text-primary);">Watch History</div>
              <div style="font-size:12px;color:var(--text-secondary);">${history.length} watched</div>
            </div>
          </div>

          <div class="you-quick-link" onclick="window.location.hash='#/playlist?list=favorites'" style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:var(--bg-surface);border-radius:16px;border:1px solid var(--glass-border);cursor:pointer;transition:all 0.15s;">
            <div style="width:40px;height:40px;border-radius:10px;background:var(--bg-elevated);border:1px solid var(--glass-border-light);color:var(--text-secondary);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <span class="material-symbols-rounded" style="font-size:22px;">thumb_up</span>
            </div>
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--text-primary);">Liked Videos</div>
              <div style="font-size:12px;color:var(--text-secondary);">${likedVideos.length} videos</div>
            </div>
          </div>

          <div class="you-quick-link" onclick="window.location.hash='#/playlist?list=watch-later'" style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:var(--bg-surface);border-radius:16px;border:1px solid var(--glass-border);cursor:pointer;transition:all 0.15s;">
            <div style="width:40px;height:40px;border-radius:10px;background:var(--bg-elevated);border:1px solid var(--glass-border-light);color:var(--text-secondary);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <span class="material-symbols-rounded" style="font-size:22px;">bookmark</span>
            </div>
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--text-primary);">Watch Later</div>
              <div style="font-size:12px;color:var(--text-secondary);">${watchLaterCount} saved</div>
            </div>
          </div>
        </div>

        <!-- Continue Watching Shelf -->
        <div class="settings-card you-shelf-card" id="continue-watching-section" style="padding:20px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <h4 style="font-size:15.5px;font-weight:600;display:flex;align-items:center;gap:8px;margin:0;color:var(--text-primary);">
              <span class="material-symbols-rounded" style="color:var(--text-secondary);">play_circle</span>
              Continue Watching
            </h4>
            ${continueWatching.length > 0 ? `
              <span style="font-size:12px;color:var(--text-secondary);">${continueWatching.length} in progress</span>
            ` : ''}
          </div>

          ${continueWatching.length > 0 ? `
            <div class="compact-video-grid">
              ${continueWatching.slice(0, 6).map((v) => renderCompactVideoCard(v, { isContinueWatching: true })).join('')}
            </div>
          ` : `
            ${renderCompactEmptyState({
              icon: 'play_circle',
              title: 'Nothing to continue yet',
              description: 'Videos you pause or watch partially will appear here so you can pick up where you left off.'
            })}
          `}
        </div>

        <!-- Watch History Shelf -->
        <div class="settings-card you-shelf-card" id="history-section" style="padding:20px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
            <h4 style="font-size:15.5px;font-weight:600;display:flex;align-items:center;gap:8px;margin:0;color:var(--text-primary);">
              <span class="material-symbols-rounded" style="color:var(--text-secondary);">history</span>
              Watch History (${history.length})
            </h4>
            ${history.length > 0 ? `
              <button id="clear-history-btn" type="button" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-secondary);font-size:12.5px;font-weight:500;cursor:pointer;transition:all 0.15s;">
                <span class="material-symbols-rounded" style="font-size:16px;">delete</span>
                Clear History
              </button>
            ` : ''}
          </div>

          ${history.length > 0 ? `
            <div class="compact-video-grid">
              ${history.slice(0, 8).map((item) => renderCompactVideoCard(item, { isContinueWatching: false, showRemoveButton: true, showHistoryMetadata: true })).join('')}
            </div>
          ` : `
            ${renderCompactEmptyState({
              icon: 'history',
              title: 'Your watch history is empty',
              description: 'Videos you watch will be saved here so you can easily revisit them.'
            })}
          `}
        </div>
      </div>

      <!-- ============================================== -->
      <!-- 3. YOUR COLLECTIONS -->
      <!-- ============================================== -->
      <div style="margin-bottom:24px;">
        <h3 style="font-size:18px;font-weight:700;color:var(--text-primary);margin:0 0 14px 0;display:flex;align-items:center;gap:8px;">
          <span class="material-symbols-rounded" style="color:var(--text-secondary);">folder_special</span>
          Your Collections
        </h3>

        <!-- Playlists Hub Card -->
        <div class="settings-card" style="padding:20px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <h4 style="font-size:15.5px;font-weight:600;display:flex;align-items:center;gap:8px;margin:0;color:var(--text-primary);">
              <span class="material-symbols-rounded" style="color:var(--text-secondary);">playlist_play</span>
              Playlists (${playlists.length})
            </h4>
            <button onclick="window.location.hash='#/library'" type="button" style="background:none;border:none;color:var(--brand-color);font-size:13px;font-weight:600;cursor:pointer;">
              Manage in Library &rarr;
            </button>
          </div>
          <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:6px;scrollbar-width:none;">
            ${playlists.map((pl) => `
              <div class="playlist-pill-card" style="padding:10px 14px;border-radius:12px;background:var(--bg-elevated);border:1px solid var(--glass-border);min-width:140px;cursor:pointer;" onclick="window.location.hash='#/playlist?list=${encodeURIComponent(pl.id)}'">
                <div style="font-size:13.5px;font-weight:600;color:var(--text-primary);">${escapeHtml(pl.name)}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${(pl.items || []).length} videos</div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Followed Channels -->
        <div class="settings-card" style="padding:20px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <h4 style="font-size:15.5px;font-weight:600;display:flex;align-items:center;gap:8px;margin:0;color:var(--text-primary);">
              <span class="material-symbols-rounded" style="color:var(--text-secondary);">subscriptions</span>
              Followed Channels (${subs.length})
            </h4>
            ${subs.length > 0 ? `<span style="font-size:12px;color:var(--text-secondary);">Local subscriptions</span>` : ''}
          </div>

          ${subs.length > 0 ? `
            <div style="display:flex;gap:14px;overflow-x:auto;padding-bottom:8px;scrollbar-width:none;">
              ${subs.map((s) => `
                <div class="sub-creator-item" style="display:flex;flex-direction:column;align-items:center;gap:6px;width:76px;cursor:pointer;flex-shrink:0;" onclick="window.location.hash='#/channel/${encodeURIComponent(s.id)}'">
                  <div style="width:52px;height:52px;border-radius:50%;overflow:hidden;background:var(--bg-elevated);border:2px solid var(--glass-border);display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow-sm);">
                    ${s.avatar ? `<img src="${escapeHtml(s.avatar)}" alt="" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='/public/assets/pawtube_logo.png';" />` : `<span class="material-symbols-rounded" style="font-size:26px;color:var(--text-secondary);">account_circle</span>`}
                  </div>
                  <span style="font-size:11.5px;font-weight:500;color:var(--text-primary);text-align:center;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${escapeHtml(s.name)}
                  </span>
                </div>
              `).join('')}
            </div>
          ` : `
            <p style="font-size:13.5px;color:var(--text-secondary);margin:0;">No creators followed yet. Tap Follow on any video page to follow channels locally.</p>
          `}
        </div>
      </div>

      <!-- ============================================== -->
      <!-- 4. DISCOVER / RECENT SEARCHES -->
      <!-- ============================================== -->
      ${recentSearches.length > 0 ? `
        <div style="margin-bottom:28px;">
          <h3 style="font-size:18px;font-weight:700;color:var(--text-primary);margin:0 0 12px 0;display:flex;align-items:center;gap:8px;">
            <span class="material-symbols-rounded" style="color:var(--text-secondary);">travel_explore</span>
            Discover & Search History
          </h3>
          <div class="settings-card" style="padding:18px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
              <span style="font-size:13px;color:var(--text-secondary);">Tap to search again</span>
              <button id="clear-searches-btn" type="button" style="background:none;border:none;color:var(--text-tertiary);font-size:12px;cursor:pointer;padding:4px 8px;">
                Clear Searches
              </button>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              ${recentSearches.map((q) => `
                <button type="button" class="recent-search-chip" data-query="${escapeHtml(q)}" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-secondary);font-size:13px;cursor:pointer;transition:all 0.15s;">
                  <span class="material-symbols-rounded" style="font-size:15px;color:var(--text-tertiary);">search</span>
                  <span>${escapeHtml(q)}</span>
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      ` : ''}

      <!-- ============================================== -->
      <!-- 5. PREFERENCES (COLLAPSIBLE CATEGORIES) -->
      <!-- ============================================== -->
      <div style="margin-top:36px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:12px;">
        <div>
          <h2 style="font-size:20px;font-weight:700;display:flex;align-items:center;gap:8px;color:var(--text-primary);margin:0;">
            <span class="material-symbols-rounded" style="color:var(--text-secondary);">tune</span>
            Preferences
          </h2>
          <p style="font-size:13px;color:var(--text-secondary);margin:4px 0 0 0;">
            Preferences are saved locally on this device.
          </p>
        </div>
        <button id="toggle-all-settings-btn" type="button" class="settings-toggle-all-btn" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-secondary);font-size:12.5px;font-weight:500;cursor:pointer;transition:all 0.15s;">
          <span class="material-symbols-rounded" id="toggle-all-icon" style="font-size:16px;">unfold_more</span>
          <span id="toggle-all-text">Expand All</span>
        </button>
      </div>

      <div class="settings-accordion-group" id="settings-accordion-group">

        <!-- CATEGORY A: APPEARANCE -->
        <div class="settings-accordion-item ${expandedCategories.has('appearance') ? 'expanded' : ''}" data-category="appearance">
          <button type="button" class="settings-accordion-header" id="heading-appearance" aria-expanded="${expandedCategories.has('appearance') ? 'true' : 'false'}" aria-controls="collapse-appearance">
            <div class="settings-accordion-title-wrap">
              <div class="settings-accordion-icon-box appearance">
                <span class="material-symbols-rounded">palette</span>
              </div>
              <div class="settings-accordion-text">
                <div class="settings-accordion-title">Appearance</div>
                <div class="settings-accordion-summary">Theme, liquid glass & motion</div>
              </div>
            </div>
            <div class="settings-accordion-indicator">
              <span class="material-symbols-rounded chevron-icon">expand_more</span>
            </div>
          </button>
          
          <div class="settings-accordion-body" id="collapse-appearance" role="region" aria-labelledby="heading-appearance">
            <div class="settings-accordion-content">
              <div style="display:flex;flex-direction:column;gap:14px;padding-top:10px;">
                <!-- Theme -->
                <div style="display:flex;justify-content:space-between;align-items:center;min-height:44px;">
                  <div>
                    <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Theme</div>
                    <div style="font-size:12.5px;color:var(--text-secondary);">Select Dark AMOLED or Light Mode</div>
                  </div>
                  <select id="pref-theme" style="min-height:40px;padding:0 12px;border-radius:10px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-primary);font-size:13.5px;cursor:pointer;">
                    <option value="amoled" ${prefs.theme !== 'light' ? 'selected' : ''}>Dark AMOLED (Pitch Black)</option>
                    <option value="light" ${prefs.theme === 'light' ? 'selected' : ''}>Light Mode</option>
                  </select>
                </div>

                <!-- Liquid Glass -->
                <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;min-height:44px;">
                  <div>
                    <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Liquid Glass Effects</div>
                    <div style="font-size:12.5px;color:var(--text-secondary);">Backdrop blur refraction and glass borders</div>
                  </div>
                  <label class="switch-container">
                    <input type="checkbox" id="pref-liquid-glass" ${prefs.liquidGlass !== false ? 'checked' : ''} />
                    <span class="switch-slider"></span>
                  </label>
                </div>

                <!-- Reduced Motion -->
                <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;min-height:44px;">
                  <div>
                    <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Reduced Motion</div>
                    <div style="font-size:12.5px;color:var(--text-secondary);">Disable animations for improved performance and comfort</div>
                  </div>
                  <label class="switch-container">
                    <input type="checkbox" id="pref-reduced-motion" ${prefs.reducedMotion ? 'checked' : ''} />
                    <span class="switch-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- CATEGORY B: PLAYBACK -->
        <div class="settings-accordion-item ${expandedCategories.has('playback') ? 'expanded' : ''}" data-category="playback">
          <button type="button" class="settings-accordion-header" id="heading-playback" aria-expanded="${expandedCategories.has('playback') ? 'true' : 'false'}" aria-controls="collapse-playback">
            <div class="settings-accordion-title-wrap">
              <div class="settings-accordion-icon-box playback">
                <span class="material-symbols-rounded">play_circle</span>
              </div>
              <div class="settings-accordion-text">
                <div class="settings-accordion-title">Playback</div>
                <div class="settings-accordion-summary">Autoplay, resolution, captions & mini-player</div>
              </div>
            </div>
            <div class="settings-accordion-indicator">
              <span class="material-symbols-rounded chevron-icon">expand_more</span>
            </div>
          </button>
          
          <div class="settings-accordion-body" id="collapse-playback" role="region" aria-labelledby="heading-playback">
            <div class="settings-accordion-content">
              <div style="display:flex;flex-direction:column;gap:14px;padding-top:10px;">
                <!-- Autoplay -->
                <div style="display:flex;justify-content:space-between;align-items:center;min-height:44px;">
                  <div>
                    <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Autoplay</div>
                    <div style="font-size:12.5px;color:var(--text-secondary);">Automatically play the next video in sequence</div>
                  </div>
                  <label class="switch-container">
                    <input type="checkbox" id="pref-autoplay" ${prefs.autoplay ? 'checked' : ''} />
                    <span class="switch-slider"></span>
                  </label>
                </div>

                <!-- Remember Playback Position -->
                <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;min-height:44px;">
                  <div>
                    <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Remember Playback Position</div>
                    <div style="font-size:12.5px;color:var(--text-secondary);">Resume videos from where you left off</div>
                  </div>
                  <label class="switch-container">
                    <input type="checkbox" id="pref-remember-pos" ${prefs.rememberPosition ? 'checked' : ''} />
                    <span class="switch-slider"></span>
                  </label>
                </div>

                <!-- Default Quality -->
                <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;min-height:44px;">
                  <div>
                    <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Default Quality</div>
                    <div style="font-size:12.5px;color:var(--text-secondary);">Preferred stream resolution</div>
                  </div>
                  <select id="pref-quality" style="min-height:40px;padding:0 12px;border-radius:10px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-primary);font-size:13.5px;cursor:pointer;">
                    <option value="auto" ${prefs.defaultQuality === 'auto' ? 'selected' : ''}>Auto</option>
                    <option value="1080p" ${prefs.defaultQuality === '1080p' ? 'selected' : ''}>1080p HD</option>
                    <option value="720p" ${prefs.defaultQuality === '720p' ? 'selected' : ''}>720p HD</option>
                    <option value="480p" ${prefs.defaultQuality === '480p' ? 'selected' : ''}>480p SD</option>
                    <option value="360p" ${prefs.defaultQuality === '360p' ? 'selected' : ''}>360p Data Saver</option>
                  </select>
                </div>

                <!-- Captions -->
                <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;min-height:44px;">
                  <div>
                    <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Captions / Subtitles</div>
                    <div style="font-size:12.5px;color:var(--text-secondary);">Enable closed captions automatically when available</div>
                  </div>
                  <label class="switch-container">
                    <input type="checkbox" id="pref-captions" ${prefs.captions ? 'checked' : ''} />
                    <span class="switch-slider"></span>
                  </label>
                </div>

                <!-- Mini-player -->
                <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;min-height:44px;">
                  <div>
                    <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Mini-Player</div>
                    <div style="font-size:12.5px;color:var(--text-secondary);">Continue playback in floating mini window when browsing</div>
                  </div>
                  <label class="switch-container">
                    <input type="checkbox" id="pref-mini-player" ${prefs.miniPlayerEnabled !== false ? 'checked' : ''} />
                    <span class="switch-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- CATEGORY C: FEED & DISCOVERY -->
        <div class="settings-accordion-item ${expandedCategories.has('feed') ? 'expanded' : ''}" data-category="feed">
          <button type="button" class="settings-accordion-header" id="heading-feed" aria-expanded="${expandedCategories.has('feed') ? 'true' : 'false'}" aria-controls="collapse-feed">
            <div class="settings-accordion-title-wrap">
              <div class="settings-accordion-icon-box feed">
                <span class="material-symbols-rounded">dynamic_feed</span>
              </div>
              <div class="settings-accordion-text">
                <div class="settings-accordion-title">Feed & Content</div>
                <div class="settings-accordion-summary">Personalization, region & content filters</div>
              </div>
            </div>
            <div class="settings-accordion-indicator">
              <span class="material-symbols-rounded chevron-icon">expand_more</span>
            </div>
          </button>

          <div class="settings-accordion-body" id="collapse-feed" role="region" aria-labelledby="heading-feed">
            <div class="settings-accordion-content">
              <div style="display:flex;flex-direction:column;gap:14px;padding-top:10px;">
                <!-- Personalized recommendations -->
                <div style="display:flex;justify-content:space-between;align-items:center;min-height:44px;">
                  <div>
                    <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Personalized Recommendations</div>
                    <div style="font-size:12.5px;color:var(--text-secondary);">Re-rank discovery feed based on local watch history & likes</div>
                  </div>
                  <label class="switch-container">
                    <input type="checkbox" id="pref-personalization-enabled" ${prefs.personalizationEnabled !== false ? 'checked' : ''} />
                    <span class="switch-slider"></span>
                  </label>
                </div>

                <!-- Content Region -->
                <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;min-height:44px;">
                  <div>
                    <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Content Region</div>
                    <div style="font-size:12.5px;color:var(--text-secondary);">Select country used for trending feed (Default: India)</div>
                  </div>
                  <select id="pref-region" style="min-height:40px;padding:0 12px;border-radius:10px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-primary);font-size:13.5px;cursor:pointer;">
                    <option value="IN" ${prefs.region === 'IN' ? 'selected' : ''}>India (IN)</option>
                    <option value="US" ${prefs.region === 'US' ? 'selected' : ''}>United States (US)</option>
                    <option value="GB" ${prefs.region === 'GB' ? 'selected' : ''}>United Kingdom (GB)</option>
                    <option value="DE" ${prefs.region === 'DE' ? 'selected' : ''}>Germany (DE)</option>
                    <option value="JP" ${prefs.region === 'JP' ? 'selected' : ''}>Japan (JP)</option>
                    <option value="FR" ${prefs.region === 'FR' ? 'selected' : ''}>France (FR)</option>
                    <option value="CA" ${prefs.region === 'CA' ? 'selected' : ''}>Canada (CA)</option>
                  </select>
                </div>

                <!-- Fresh feed -->
                <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;min-height:44px;">
                  <div>
                    <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Fresh Feed Refreshing</div>
                    <div style="font-size:12.5px;color:var(--text-secondary);">Intelligently refresh feed on return or recent activity</div>
                  </div>
                  <label class="switch-container">
                    <input type="checkbox" id="pref-fresh-feed" ${prefs.freshFeed !== false ? 'checked' : ''} />
                    <span class="switch-slider"></span>
                  </label>
                </div>

                <!-- Hide Shorts -->
                <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;min-height:44px;">
                  <div>
                    <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Hide Shorts</div>
                    <div style="font-size:12.5px;color:var(--text-secondary);">Exclude vertical videos under 60s from all feeds</div>
                  </div>
                  <label class="switch-container">
                    <input type="checkbox" id="pref-hide-shorts" ${prefs.hideShorts ? 'checked' : ''} />
                    <span class="switch-slider"></span>
                  </label>
                </div>

                <!-- Hide live content -->
                <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;min-height:44px;">
                  <div>
                    <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Hide Live Content</div>
                    <div style="font-size:12.5px;color:var(--text-secondary);">Exclude live streams and broadcasts across the app</div>
                  </div>
                  <label class="switch-container">
                    <input type="checkbox" id="pref-hide-live" ${prefs.hideLive ? 'checked' : ''} />
                    <span class="switch-slider"></span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- CATEGORY D: PRIVACY -->
        <div class="settings-accordion-item ${expandedCategories.has('privacy') ? 'expanded' : ''}" data-category="privacy">
          <button type="button" class="settings-accordion-header" id="heading-privacy" aria-expanded="${expandedCategories.has('privacy') ? 'true' : 'false'}" aria-controls="collapse-privacy">
            <div class="settings-accordion-title-wrap">
              <div class="settings-accordion-icon-box privacy">
                <span class="material-symbols-rounded">shield</span>
              </div>
              <div class="settings-accordion-text">
                <div class="settings-accordion-title">Privacy</div>
                <div class="settings-accordion-summary">Watch history, search history & data erasure</div>
              </div>
            </div>
            <div class="settings-accordion-indicator">
              <span class="material-symbols-rounded chevron-icon">expand_more</span>
            </div>
          </button>

          <div class="settings-accordion-body" id="collapse-privacy" role="region" aria-labelledby="heading-privacy">
            <div class="settings-accordion-content">
              <div style="display:flex;flex-direction:column;gap:14px;padding-top:10px;">
                <!-- Watch history toggle -->
                <div style="display:flex;justify-content:space-between;align-items:center;min-height:44px;">
                  <div>
                    <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Watch History</div>
                    <div style="font-size:12.5px;color:var(--text-secondary);">Save watched videos locally on this device</div>
                  </div>
                  <label class="switch-container">
                    <input type="checkbox" id="pref-history-enabled" ${prefs.historyEnabled !== false ? 'checked' : ''} />
                    <span class="switch-slider"></span>
                  </label>
                </div>

                <!-- Search history toggle -->
                <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;min-height:44px;">
                  <div>
                    <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Search History</div>
                    <div style="font-size:12.5px;color:var(--text-secondary);">Remember search queries locally for quick suggestions</div>
                  </div>
                  <label class="switch-container">
                    <input type="checkbox" id="pref-search-history-enabled" ${prefs.searchHistoryEnabled !== false ? 'checked' : ''} />
                    <span class="switch-slider"></span>
                  </label>
                </div>

                <!-- Clear history button -->
                <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;min-height:44px;">
                  <div>
                    <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Clear Watch History</div>
                    <div style="font-size:12.5px;color:var(--text-secondary);">Delete all saved playback history items</div>
                  </div>
                  <button id="privacy-clear-history-btn" type="button" style="min-height:36px;padding:0 14px;border-radius:8px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:var(--brand-red);font-size:13px;font-weight:600;cursor:pointer;">
                    Clear
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- CATEGORY E: STORAGE & DATA -->
        <div class="settings-accordion-item ${expandedCategories.has('storage') ? 'expanded' : ''}" data-category="storage">
          <button type="button" class="settings-accordion-header" id="heading-storage" aria-expanded="${expandedCategories.has('storage') ? 'true' : 'false'}" aria-controls="collapse-storage">
            <div class="settings-accordion-title-wrap">
              <div class="settings-accordion-icon-box storage">
                <span class="material-symbols-rounded">database</span>
              </div>
              <div class="settings-accordion-text">
                <div class="settings-accordion-title">Storage & Data</div>
                <div class="settings-accordion-summary">Feed cache, export backup & factory reset</div>
              </div>
            </div>
            <div class="settings-accordion-indicator">
              <span class="material-symbols-rounded chevron-icon">expand_more</span>
            </div>
          </button>

          <div class="settings-accordion-body" id="collapse-storage" role="region" aria-labelledby="heading-storage">
            <div class="settings-accordion-content">
              <div style="display:flex;flex-direction:column;gap:14px;padding-top:10px;">
                <!-- Clear cached feed -->
                <div style="display:flex;justify-content:space-between;align-items:center;min-height:44px;">
                  <div>
                    <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Clear Cached Feed</div>
                    <div style="font-size:12.5px;color:var(--text-secondary);">Invalidate cached trending streams to force a clean fetch</div>
                  </div>
                  <button id="clear-feed-cache-btn" type="button" style="min-height:36px;padding:0 14px;border-radius:8px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-primary);font-size:13px;cursor:pointer;">
                    Clear Cache
                  </button>
                </div>

                <!-- Export local data -->
                <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;min-height:44px;">
                  <div>
                    <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Export Local Data</div>
                    <div style="font-size:12.5px;color:var(--text-secondary);">Download JSON backup of playlists, likes, follows & settings</div>
                  </div>
                  <button id="export-data-btn" type="button" style="min-height:36px;padding:0 14px;border-radius:8px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-primary);font-size:13px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
                    <span class="material-symbols-rounded" style="font-size:16px;color:var(--brand-blue);">file_download</span>
                    <span>Export</span>
                  </button>
                </div>

                <!-- Reset settings -->
                <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;min-height:44px;">
                  <div>
                    <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Reset Preferences</div>
                    <div style="font-size:12.5px;color:var(--text-secondary);">Restore all toggles and choices to default values</div>
                  </div>
                  <button id="reset-prefs-btn" type="button" style="min-height:36px;padding:0 14px;border-radius:8px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-primary);font-size:13px;cursor:pointer;">
                    Reset
                  </button>
                </div>

                <!-- Clear all local data -->
                <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;min-height:44px;">
                  <div>
                    <div style="font-size:14px;font-weight:500;color:var(--brand-red);">Clear All Local Data</div>
                    <div style="font-size:12.5px;color:var(--text-secondary);">Wipe all history, playlists, liked videos, and preferences</div>
                  </div>
                  <button id="wipe-data-btn" type="button" style="min-height:36px;padding:0 14px;border-radius:8px;background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:var(--brand-red);font-size:13px;font-weight:600;cursor:pointer;">
                    Wipe All
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- CATEGORY F: ABOUT & PAWJECTS -->
        <div class="settings-accordion-item ${expandedCategories.has('about') ? 'expanded' : ''}" data-category="about">
          <button type="button" class="settings-accordion-header" id="heading-about" aria-expanded="${expandedCategories.has('about') ? 'true' : 'false'}" aria-controls="collapse-about">
            <div class="settings-accordion-title-wrap">
              <div class="settings-accordion-icon-box about">
                <span class="material-symbols-rounded">pets</span>
              </div>
              <div class="settings-accordion-text">
                <div class="settings-accordion-title">About PawTube & Pawjects</div>
                <div class="settings-accordion-summary">Privacy architecture, version & ecosystem</div>
              </div>
            </div>
            <div class="settings-accordion-indicator">
              <span class="material-symbols-rounded chevron-icon">expand_more</span>
            </div>
          </button>

          <div class="settings-accordion-body" id="collapse-about" role="region" aria-labelledby="heading-about">
            <div class="settings-accordion-content">
              <div style="padding-top:10px;">
                <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
                  <div style="width:40px;height:40px;border-radius:12px;background:var(--bg-elevated);border:1px solid var(--glass-border);display:flex;align-items:center;justify-content:center;color:var(--text-primary);flex-shrink:0;">
                    <span class="material-symbols-rounded" style="font-size:24px;">pets</span>
                  </div>
                  <div>
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                      <h4 style="font-size:16px;font-weight:700;margin:0;color:var(--text-primary);">PawTube v1.2.0</h4>
                      <span style="font-size:11.5px;color:var(--text-secondary);">Pawjects ecosystem</span>
                    </div>
                    <p style="font-size:12.5px;color:var(--text-secondary);margin:2px 0 0 0;">Distraction-Free Privacy Media Hub</p>
                  </div>
                </div>

                <p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin:0 0 14px 0;">
                  PawTube is part of the <strong>Pawjects</strong> ecosystem of independent, privacy-respecting, distraction-free tools. Video playback is isolated via official YouTube No-Cookie embeds (<code style="background:rgba(255,255,255,0.08);padding:2px 5px;border-radius:4px;font-size:12px;">youtube-nocookie.com</code>) decoupled from Piped metadata extraction. Zero user accounts required, zero third-party tracking cookies, 100% private local storage.
                </p>

                <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
                  <span class="pawject-feature-tag">YouTube No-Cookie</span>
                  <span class="pawject-feature-tag">Piped API Gateway</span>
                  <span class="pawject-feature-tag">Liquid Glass AMOLED</span>
                  <span class="pawject-feature-tag">Zero Tracking</span>
                  <span class="pawject-feature-tag">Client Storage</span>
                </div>

                <div style="display:flex;flex-wrap:wrap;gap:14px;font-size:12.5px;color:var(--text-tertiary);border-top:1px solid var(--glass-border-light);padding-top:14px;align-items:center;">
                  <a href="https://pawjects.github.io" target="_blank" rel="noopener noreferrer" style="color:var(--brand-color);text-decoration:none;display:inline-flex;align-items:center;gap:5px;font-weight:500;">
                    <span class="material-symbols-rounded" style="font-size:16px;">language</span>
                    <span>pawjects.github.io</span>
                  </a>
                  <span>&bull;</span>
                  <a href="https://github.com/pawjects" target="_blank" rel="noopener noreferrer" style="color:var(--brand-color);text-decoration:none;display:inline-flex;align-items:center;gap:5px;font-weight:500;">
                    <span class="material-symbols-rounded" style="font-size:16px;">code</span>
                    <span>GitHub &bull; Pawjects</span>
                  </a>
                  <span>&bull;</span>
                  <span>MIT License &copy; 2026</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- ============================================== -->
      <!-- 6. PAWJECTS ECOSYSTEM FOOTER -->
      <!-- ============================================== -->
      <footer class="pawjects-ecosystem-footer">
        <div class="pawjects-footer-title">PawTube</div>
        <div class="pawjects-footer-sub">Part of the Pawjects ecosystem</div>
        <div class="pawjects-footer-links">
          <a href="https://pawjects.github.io" target="_blank" rel="noopener noreferrer">pawjects.github.io</a>
          <span aria-hidden="true">&bull;</span>
          <a href="https://github.com/pawjects" target="_blank" rel="noopener noreferrer">GitHub &bull; Pawjects</a>
        </div>
      </footer>

    </div>
  `;

  // ==============================================
  // EVENT BINDINGS
  // ==============================================

  // 1. Name Editing logic with strict validation & immediate UI update
  const editNameBtn = container.querySelector('#edit-name-btn');
  const nameEditorBox = container.querySelector('#name-editor-box');
  const nameInput = container.querySelector('#name-input');
  const saveNameBtn = container.querySelector('#save-name-btn');
  const cancelNameBtn = container.querySelector('#cancel-name-btn');
  const resetNameBtn = container.querySelector('#reset-name-btn');
  const displayUserName = container.querySelector('#display-user-name');
  const profileGreetingHeading = container.querySelector('#profile-greeting-heading');

  const openNameEditor = () => {
    if (nameEditorBox) {
      nameEditorBox.style.display = 'block';
      nameInput?.focus();
      nameInput?.select();
    }
  };

  const closeNameEditor = () => {
    if (nameEditorBox) {
      nameEditorBox.style.display = 'none';
      if (nameInput) nameInput.value = displayUserName?.textContent || 'Explorer';
    }
  };

  editNameBtn?.addEventListener('click', openNameEditor);
  cancelNameBtn?.addEventListener('click', closeNameEditor);

  const saveName = () => {
    const raw = nameInput?.value || '';
    const trimmed = raw.trim();
    if (!trimmed) {
      showToast('Display name cannot be empty', 'error');
      nameInput?.focus();
      return;
    }
    if (trimmed.length > 24) {
      showToast('Display name must be 24 characters or less', 'error');
      nameInput?.focus();
      return;
    }
    const clean = sanitizeUsername(trimmed);
    if (!clean) {
      showToast('Display name contains invalid characters', 'error');
      nameInput?.focus();
      return;
    }
    savePreferences({ username: clean });
    if (displayUserName) displayUserName.textContent = clean;
    if (profileGreetingHeading) {
      profileGreetingHeading.innerHTML = `Hello, <span id="display-user-name">${escapeHtml(clean)}</span>`;
    }
    if (nameEditorBox) nameEditorBox.style.display = 'none';
    showToast(`Display name updated to "${clean}"`, 'success');
  };

  saveNameBtn?.addEventListener('click', saveName);

  nameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveName();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeNameEditor();
    }
  });

  resetNameBtn?.addEventListener('click', () => {
    savePreferences({ username: 'Explorer' });
    if (nameInput) nameInput.value = 'Explorer';
    if (displayUserName) displayUserName.textContent = 'Explorer';
    if (profileGreetingHeading) {
      profileGreetingHeading.innerHTML = `Hello, <span id="display-user-name">Explorer</span>`;
    }
    if (nameEditorBox) nameEditorBox.style.display = 'none';
    showToast('Display name reset to Explorer', 'info');
  });

  // Scroll to continue watching
  container.querySelector('#scroll-to-continue-btn')?.addEventListener('click', () => {
    const el = container.querySelector('#continue-watching-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  });

  // 2. Scroll to history
  container.querySelector('#scroll-to-history-btn')?.addEventListener('click', () => {
    const el = container.querySelector('#history-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  });

  // 3. Clear History buttons
  const handleClearHistory = () => {
    if (confirm('Are you sure you want to clear your entire watch history?')) {
      clearHistory();
      showToast('Watch history cleared', 'info');
      renderYouPage(container);
    }
  };
  container.querySelector('#clear-history-btn')?.addEventListener('click', handleClearHistory);
  container.querySelector('#privacy-clear-history-btn')?.addEventListener('click', handleClearHistory);

  // 4. Remove single history item
  container.querySelectorAll('.remove-history-item-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-video-id');
      removeFromHistory(id);
      showToast('Removed from history', 'info');
      renderYouPage(container);
    });
  });

  // 5. Recent Search Chips
  container.querySelectorAll('.recent-search-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const q = chip.getAttribute('data-query');
      if (q) window.location.hash = `#/search?q=${encodeURIComponent(q)}`;
    });
  });

  // 6. Clear Searches
  container.querySelector('#clear-searches-btn')?.addEventListener('click', () => {
    clearRecentSearches();
    showToast('Recent searches cleared', 'info');
    renderYouPage(container);
  });

  // 7. Clear Feed Cache
  container.querySelector('#clear-feed-cache-btn')?.addEventListener('click', () => {
    try {
      localStorage.removeItem('pawtube_video_cache');
    } catch {}
    showToast('Feed cache cleared', 'success');
  });

  // 8. Preference Checkboxes & Selects
  const bindPref = (selector, key, isCheckbox = false) => {
    const el = container.querySelector(selector);
    if (!el) return;
    el.addEventListener('change', () => {
      const val = isCheckbox ? el.checked : el.value;
      savePreferences({ [key]: val });
      showToast('Setting updated', 'success');
    });
  };

  bindPref('#pref-theme', 'theme', false);
  bindPref('#pref-liquid-glass', 'liquidGlass', true);
  bindPref('#pref-reduced-motion', 'reducedMotion', true);
  bindPref('#pref-autoplay', 'autoplay', true);
  bindPref('#pref-remember-pos', 'rememberPosition', true);
  bindPref('#pref-quality', 'defaultQuality', false);
  bindPref('#pref-captions', 'captions', true);
  bindPref('#pref-mini-player', 'miniPlayerEnabled', true);
  bindPref('#pref-personalization-enabled', 'personalizationEnabled', true);
  bindPref('#pref-region', 'region', false);
  bindPref('#pref-fresh-feed', 'freshFeed', true);
  bindPref('#pref-hide-shorts', 'hideShorts', true);
  bindPref('#pref-hide-live', 'hideLive', true);
  bindPref('#pref-history-enabled', 'historyEnabled', true);
  bindPref('#pref-search-history-enabled', 'searchHistoryEnabled', true);

  // 9. Export Data
  container.querySelector('#export-data-btn')?.addEventListener('click', () => {
    try {
      const data = exportAllUserData();
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `pawtube-backup-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Backup file downloaded', 'success');
    } catch (err) {
      showToast('Failed to export backup', 'error');
    }
  });

  // 10. Reset Preferences
  container.querySelector('#reset-prefs-btn')?.addEventListener('click', () => {
    if (confirm('Reset all PawTube preferences to default settings?')) {
      resetPreferences();
      showToast('Preferences reset to default', 'info');
      renderYouPage(container);
    }
  });

  // 11. Clear All Data
  container.querySelector('#wipe-data-btn')?.addEventListener('click', () => {
    if (confirm('This will delete all local history, playlists, liked videos, and settings from this browser. Are you sure?')) {
      clearAllLocalUserData();
      showToast('All local data cleared', 'info');
      renderYouPage(container);
    }
  });

  // 12. Collapsible Settings Accordion Logic
  const allAccordionItems = container.querySelectorAll('.settings-accordion-item');
  const toggleAllBtn = container.querySelector('#toggle-all-settings-btn');
  const toggleAllText = container.querySelector('#toggle-all-text');
  const toggleAllIcon = container.querySelector('#toggle-all-icon');

  const updateToggleAllUI = () => {
    const total = allAccordionItems.length;
    const openCount = container.querySelectorAll('.settings-accordion-item.expanded').length;
    if (openCount >= total) {
      if (toggleAllText) toggleAllText.textContent = 'Collapse All';
      if (toggleAllIcon) toggleAllIcon.textContent = 'unfold_less';
    } else {
      if (toggleAllText) toggleAllText.textContent = 'Expand All';
      if (toggleAllIcon) toggleAllIcon.textContent = 'unfold_more';
    }
  };

  updateToggleAllUI();

  container.querySelectorAll('.settings-accordion-header').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.settings-accordion-item');
      if (!item) return;
      const cat = item.getAttribute('data-category');
      const isExpanded = item.classList.contains('expanded');

      if (isExpanded) {
        item.classList.remove('expanded');
        btn.setAttribute('aria-expanded', 'false');
        if (cat) expandedCategories.delete(cat);
      } else {
        item.classList.add('expanded');
        btn.setAttribute('aria-expanded', 'true');
        if (cat) expandedCategories.add(cat);
      }

      try {
        localStorage.setItem('pawtube_expanded_settings', JSON.stringify([...expandedCategories]));
      } catch {}

      updateToggleAllUI();
    });
  });

  toggleAllBtn?.addEventListener('click', () => {
    const total = allAccordionItems.length;
    const openCount = container.querySelectorAll('.settings-accordion-item.expanded').length;
    const shouldExpand = openCount < total;

    allAccordionItems.forEach((item) => {
      const cat = item.getAttribute('data-category');
      const header = item.querySelector('.settings-accordion-header');
      if (shouldExpand) {
        item.classList.add('expanded');
        header?.setAttribute('aria-expanded', 'true');
        if (cat) expandedCategories.add(cat);
      } else {
        item.classList.remove('expanded');
        header?.setAttribute('aria-expanded', 'false');
        if (cat) expandedCategories.delete(cat);
      }
    });

    try {
      localStorage.setItem('pawtube_expanded_settings', JSON.stringify([...expandedCategories]));
    } catch {}

    updateToggleAllUI();
  });
}

export default renderYouPage;

