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
        <!-- Avatar with Paw Icon -->
        <div style="position:relative;width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg, var(--brand-blue) 0%, #2563eb 100%);display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 6px 18px rgba(59,130,246,0.3);flex-shrink:0;">
          <span class="material-symbols-rounded" style="font-size:38px;">pets</span>
          <div style="position:absolute;bottom:0;right:0;width:20px;height:20px;border-radius:50%;background:var(--brand-green, #10b981);border:2px solid var(--bg-surface);" title="Local Profile Active"></div>
        </div>

        <!-- Identity & Greeting Details -->
        <div style="flex:1;min-width:240px;">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <h2 id="profile-greeting-heading" style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0;color:var(--text-primary);">
              ${greeting}, <span id="display-user-name">${escapeHtml(currentUsername)}</span>
            </h2>
            <button id="edit-name-btn" type="button" aria-label="Edit display name" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-secondary);font-size:12px;cursor:pointer;transition:background 0.15s;">
              <span class="material-symbols-rounded" style="font-size:14px;">edit</span>
              <span>Edit name</span>
            </button>
            <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:rgba(59,130,246,0.15);color:var(--brand-blue);border:1px solid rgba(59,130,246,0.25);">
              Local Profile
            </span>
          </div>

          <!-- Inline Name Editor (Initially Hidden) -->
          <div id="name-editor-box" style="display:none;margin-top:12px;padding:12px;background:var(--bg-elevated);border-radius:12px;border:1px solid var(--glass-border);">
            <div style="font-size:12.5px;color:var(--text-secondary);margin-bottom:6px;">Choose a local display name (max 24 characters):</div>
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

          <p style="font-size:13px;color:var(--text-secondary);margin:6px 0 0 0;">
            PawTube local profile &bull; 100% Private Client Storage
          </p>

          <!-- Quick Stats Pills -->
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">
            <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;background:var(--bg-elevated);border:1px solid var(--glass-border-light);font-size:12.5px;color:var(--text-secondary);">
              <span class="material-symbols-rounded" style="font-size:15px;color:var(--brand-blue);">history</span>
              <span><strong>${history.length}</strong> watched</span>
            </div>
            <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;background:var(--bg-elevated);border:1px solid var(--glass-border-light);font-size:12.5px;color:var(--text-secondary);">
              <span class="material-symbols-rounded" style="font-size:15px;color:var(--brand-red);">favorite</span>
              <span><strong>${likedVideos.length}</strong> liked</span>
            </div>
            <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;background:var(--bg-elevated);border:1px solid var(--glass-border-light);font-size:12.5px;color:var(--text-secondary);">
              <span class="material-symbols-rounded" style="font-size:15px;color:#a855f7;">playlist_play</span>
              <span><strong>${playlists.length}</strong> playlists</span>
            </div>
            <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;background:var(--bg-elevated);border:1px solid var(--glass-border-light);font-size:12.5px;color:var(--text-secondary);">
              <span class="material-symbols-rounded" style="font-size:15px;color:#eab308;">subscriptions</span>
              <span><strong>${subs.length}</strong> following</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ============================================== -->
      <!-- 2. YOUR ACTIVITY -->
      <!-- ============================================== -->
      <div style="margin-bottom:24px;">
        <h3 style="font-size:18px;font-weight:700;color:var(--text-primary);margin:0 0 14px 0;display:flex;align-items:center;gap:8px;">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">motion_photos_paused</span>
          Your Activity
        </h3>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:16px;">
          <div class="you-quick-link" onclick="window.location.hash='#/playlist?list=favorites'" style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:var(--bg-surface);border-radius:16px;border:1px solid var(--glass-border);cursor:pointer;transition:transform 0.15s, background 0.15s;">
            <div style="width:42px;height:42px;border-radius:12px;background:rgba(239,68,68,0.12);color:var(--brand-red);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <span class="material-symbols-rounded" style="font-size:22px;">thumb_up</span>
            </div>
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--text-primary);">Liked Videos</div>
              <div style="font-size:12px;color:var(--text-secondary);">${likedVideos.length} videos</div>
            </div>
          </div>

          <div class="you-quick-link" onclick="window.location.hash='#/playlist?list=watch-later'" style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:var(--bg-surface);border-radius:16px;border:1px solid var(--glass-border);cursor:pointer;transition:transform 0.15s, background 0.15s;">
            <div style="width:42px;height:42px;border-radius:12px;background:rgba(168,85,247,0.12);color:#a855f7;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <span class="material-symbols-rounded" style="font-size:22px;">bookmark</span>
            </div>
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--text-primary);">Watch Later</div>
              <div style="font-size:12px;color:var(--text-secondary);">${watchLaterCount} saved</div>
            </div>
          </div>

          <div class="you-quick-link" id="scroll-to-history-btn" style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:var(--bg-surface);border-radius:16px;border:1px solid var(--glass-border);cursor:pointer;transition:transform 0.15s, background 0.15s;">
            <div style="width:42px;height:42px;border-radius:12px;background:rgba(234,179,8,0.12);color:#eab308;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <span class="material-symbols-rounded" style="font-size:22px;">history</span>
            </div>
            <div>
              <div style="font-size:14px;font-weight:600;color:var(--text-primary);">Watch History</div>
              <div style="font-size:12px;color:var(--text-secondary);">${history.length} watched</div>
            </div>
          </div>
        </div>

        <!-- Continue Watching Shelf -->
        <div class="settings-card you-shelf-card" style="padding:20px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <h4 style="font-size:15.5px;font-weight:600;display:flex;align-items:center;gap:8px;margin:0;color:var(--text-primary);">
              <span class="material-symbols-rounded" style="color:var(--brand-red);">play_circle</span>
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
              <span class="material-symbols-rounded" style="color:var(--brand-blue);">history</span>
              Watch History (${history.length})
            </h4>
            ${history.length > 0 ? `
              <button id="clear-history-btn" type="button" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:var(--brand-red);font-size:12.5px;font-weight:600;cursor:pointer;">
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
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">folder_special</span>
          Your Collections
        </h3>

        <!-- Playlists Hub Card -->
        <div class="settings-card" style="padding:20px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <h4 style="font-size:15.5px;font-weight:600;display:flex;align-items:center;gap:8px;margin:0;color:var(--text-primary);">
              <span class="material-symbols-rounded" style="color:#a855f7;">playlist_play</span>
              Playlists (${playlists.length})
            </h4>
            <button onclick="window.location.hash='#/library'" type="button" style="background:none;border:none;color:var(--brand-blue);font-size:13px;font-weight:600;cursor:pointer;">
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
              <span class="material-symbols-rounded" style="color:var(--brand-blue);">subscriptions</span>
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
            <span class="material-symbols-rounded" style="color:var(--brand-blue);">travel_explore</span>
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
      <!-- 5. CATEGORIZED SETTINGS SYSTEM -->
      <!-- ============================================== -->
      <div style="margin-top:36px;margin-bottom:16px;">
        <h2 style="font-size:20px;font-weight:700;display:flex;align-items:center;gap:8px;color:var(--text-primary);margin:0;">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">tune</span>
          Settings
        </h2>
        <p style="font-size:13px;color:var(--text-secondary);margin:4px 0 0 0;">
          Every preference is saved locally on this device. Real settings that modify real application behavior.
        </p>
      </div>

      <!-- CATEGORY A: APPEARANCE -->
      <div class="settings-card" style="padding:22px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:18px;">
        <h3 style="font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px;margin:0 0 16px 0;color:var(--text-primary);">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">palette</span>
          Appearance
        </h3>
        
        <div style="display:flex;flex-direction:column;gap:14px;">
          <!-- Theme -->
          <div style="display:flex;justify-content:space-between;align-items:center;min-height:44px;">
            <div>
              <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Theme</div>
              <div style="font-size:12.5px;color:var(--text-secondary);">Select AMOLED black or Midnight slate</div>
            </div>
            <select id="pref-theme" style="min-height:40px;padding:0 12px;border-radius:10px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-primary);font-size:13.5px;cursor:pointer;">
              <option value="amoled" ${prefs.theme === 'amoled' ? 'selected' : ''}>AMOLED Deep Black</option>
              <option value="midnight" ${prefs.theme === 'midnight' ? 'selected' : ''}>Midnight Slate</option>
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

      <!-- CATEGORY B: PLAYBACK -->
      <div class="settings-card" style="padding:22px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:18px;">
        <h3 style="font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px;margin:0 0 16px 0;color:var(--text-primary);">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">play_circle</span>
          Playback
        </h3>
        
        <div style="display:flex;flex-direction:column;gap:14px;">
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

      <!-- CATEGORY C: FEED & DISCOVERY -->
      <div class="settings-card" style="padding:22px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:18px;">
        <h3 style="font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px;margin:0 0 16px 0;color:var(--text-primary);">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">dynamic_feed</span>
          Feed & Content
        </h3>

        <div style="display:flex;flex-direction:column;gap:14px;">
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

      <!-- CATEGORY D: PRIVACY -->
      <div class="settings-card" style="padding:22px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:18px;">
        <h3 style="font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px;margin:0 0 16px 0;color:var(--text-primary);">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">shield</span>
          Privacy
        </h3>

        <div style="display:flex;flex-direction:column;gap:14px;">
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

      <!-- CATEGORY E: STORAGE & DATA -->
      <div class="settings-card" style="padding:22px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:18px;">
        <h3 style="font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px;margin:0 0 16px 0;color:var(--text-primary);">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">database</span>
          Storage & Data
        </h3>

        <div style="display:flex;flex-direction:column;gap:14px;">
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

      <!-- CATEGORY F: ABOUT -->
      <div class="settings-card" style="padding:22px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <img src="/public/assets/pawtube_logo.png" alt="PawTube" style="width:36px;height:36px;border-radius:8px;" onerror="this.style.display='none';" />
          <div>
            <h3 style="font-size:16px;font-weight:700;margin:0;color:var(--text-primary);">PawTube v1.2.0</h3>
            <p style="font-size:12px;color:var(--text-secondary);margin:0;">Distraction-Free Privacy Media Hub</p>
          </div>
        </div>
        <p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin:0 0 14px 0;">
          PawTube isolates video playback through official YouTube No-Cookie embeds (<code style="background:rgba(255,255,255,0.08);padding:2px 4px;border-radius:4px;">youtube-nocookie.com</code>) decoupled from Piped metadata extraction. Zero user accounts required, zero third-party tracking cookies, 100% private local storage.
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:14px;font-size:12.5px;color:var(--text-tertiary);border-top:1px solid var(--glass-border-light);padding-top:12px;">
          <a href="https://github.com/biswanathdas8307/PawTube" target="_blank" rel="noopener noreferrer" style="color:var(--brand-blue);text-decoration:none;display:inline-flex;align-items:center;gap:4px;">
            <span class="material-symbols-rounded" style="font-size:16px;">code</span>
            GitHub Repository
          </a>
          <span>&bull;</span>
          <span>Piped API Gateway</span>
          <span>&bull;</span>
          <span>YouTube No-Cookie Player</span>
          <span>&bull;</span>
          <span>Local Device Storage</span>
        </div>
      </div>

    </div>
  `;

  // ==============================================
  // EVENT BINDINGS
  // ==============================================

  // 1. Name Editing logic
  const editNameBtn = container.querySelector('#edit-name-btn');
  const nameEditorBox = container.querySelector('#name-editor-box');
  const nameInput = container.querySelector('#name-input');
  const saveNameBtn = container.querySelector('#save-name-btn');
  const cancelNameBtn = container.querySelector('#cancel-name-btn');
  const resetNameBtn = container.querySelector('#reset-name-btn');
  const displayUserName = container.querySelector('#display-user-name');

  editNameBtn?.addEventListener('click', () => {
    if (nameEditorBox) {
      nameEditorBox.style.display = 'block';
      nameInput?.focus();
      nameInput?.select();
    }
  });

  cancelNameBtn?.addEventListener('click', () => {
    if (nameEditorBox) nameEditorBox.style.display = 'none';
  });

  saveNameBtn?.addEventListener('click', () => {
    const raw = nameInput?.value || '';
    const clean = sanitizeUsername(raw);
    savePreferences({ username: clean });
    if (displayUserName) displayUserName.textContent = clean;
    if (nameEditorBox) nameEditorBox.style.display = 'none';
    showToast(`Display name updated to "${clean}"`, 'success');
  });

  resetNameBtn?.addEventListener('click', () => {
    savePreferences({ username: 'Explorer' });
    if (nameInput) nameInput.value = 'Explorer';
    if (displayUserName) displayUserName.textContent = 'Explorer';
    if (nameEditorBox) nameEditorBox.style.display = 'none';
    showToast('Display name reset to Explorer', 'info');
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
}

export default renderYouPage;

