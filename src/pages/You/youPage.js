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
import { getHistory, clearHistory, removeFromHistory } from '../../storage/history/historyStorage.js';
import { getPlaylists } from '../../storage/playlists/playlistStorage.js';
import { getLikedVideos } from '../../storage/likes/likesStorage.js';
import { getRecentSearches, clearRecentSearches } from '../../storage/personalization/personalizationEngine.js';
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

export function renderYouPage(container) {
  const prefs = getPreferences();
  const customInstance = getCustomInstance();
  const subs = getSubscriptions();
  const history = getHistory();
  const playlists = getPlaylists();
  const likedVideos = getLikedVideos();
  const recentSearches = getRecentSearches();

  const watchLaterPlaylist = playlists.find((p) => p.id === 'watch-later');
  const watchLaterCount = (watchLaterPlaylist?.items || []).length;

  // Continue watching: videos with progress >= 5s and not practically finished
  const continueWatching = history.filter((v) => {
    const prog = v.progress || 0;
    const dur = v.duration || 0;
    return prog >= 5 && (dur === 0 || prog < dur - 10);
  });

  const greeting = getGreeting();

  container.innerHTML = `
    <div class="you-container" style="max-width:980px;margin:0 auto;padding-bottom:100px;">
      <!-- Profile / Header Banner -->
      <div class="you-profile-card" style="display:flex;flex-wrap:wrap;align-items:center;gap:20px;padding:24px;background:var(--bg-surface);border-radius:20px;border:1px solid var(--glass-border);margin-bottom:24px;box-shadow:var(--shadow-sm);">
        <!-- Avatar with Dynamic Badge -->
        <div style="position:relative;width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg, var(--brand-blue) 0%, #2563eb 100%);display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 6px 18px rgba(59,130,246,0.3);flex-shrink:0;">
          <span class="material-symbols-rounded" style="font-size:38px;">person</span>
          <div style="position:absolute;bottom:0;right:0;width:20px;height:20px;border-radius:50%;background:var(--brand-green, #10b981);border:2px solid var(--bg-surface);" title="Local Profile Active"></div>
        </div>

        <!-- Identity & Greeting Details -->
        <div style="flex:1;min-width:240px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <h2 style="font-size:22px;font-weight:700;letter-spacing:-0.02em;margin:0;color:var(--text-primary);">
              ${greeting}, Explorer
            </h2>
            <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:rgba(59,130,246,0.15);color:var(--brand-blue);border:1px solid rgba(59,130,246,0.25);">
              Local Profile
            </span>
          </div>
          <p style="font-size:13px;color:var(--text-secondary);margin:4px 0 0 0;">
            @pawtube_explorer &bull; 100% Private Client Storage
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

      <!-- Quick Access Library Rows -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:24px;">
        <div class="you-quick-link" onclick="window.location.hash='#/library'" style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:var(--bg-surface);border-radius:16px;border:1px solid var(--glass-border);cursor:pointer;transition:transform 0.15s, background 0.15s;">
          <div style="width:42px;height:42px;border-radius:12px;background:rgba(59,130,246,0.12);color:var(--brand-blue);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <span class="material-symbols-rounded" style="font-size:22px;">video_library</span>
          </div>
          <div>
            <div style="font-size:14px;font-weight:600;color:var(--text-primary);">Library</div>
            <div style="font-size:12px;color:var(--text-secondary);">${playlists.length} playlists</div>
          </div>
        </div>

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
            <div style="font-size:14px;font-weight:600;color:var(--text-primary);">History</div>
            <div style="font-size:12px;color:var(--text-secondary);">${history.length} watched</div>
          </div>
        </div>
      </div>

      <!-- Continue Watching Shelf -->
      ${continueWatching.length > 0 ? `
        <div class="settings-card" style="padding:22px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:24px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <h3 style="font-size:17px;font-weight:600;display:flex;align-items:center;gap:8px;margin:0;color:var(--text-primary);">
              <span class="material-symbols-rounded" style="color:var(--brand-red);">play_circle</span>
              Continue Watching
            </h3>
            <span style="font-size:12.5px;color:var(--text-secondary);">${continueWatching.length} in progress</span>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(210px, 1fr));gap:14px;">
            ${continueWatching.slice(0, 6).map((v) => {
              const resumeTime = Math.floor(v.progress || 0);
              const pct = v.watchedPercentage || (v.duration ? Math.min(100, Math.round((resumeTime / v.duration) * 100)) : 0);
              return `
                <div class="continue-you-card" style="cursor:pointer;background:var(--bg-elevated);border-radius:12px;overflow:hidden;border:1px solid var(--glass-border-light);transition:transform 0.15s;" onclick="window.location.hash='#/watch?v=${encodeURIComponent(v.id)}&t=${resumeTime}'">
                  <div style="position:relative;width:100%;aspect-ratio:16/9;background:#000;">
                    <img src="${escapeHtml(v.thumb || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`)}" alt="" style="width:100%;height:100%;object-fit:cover;" loading="lazy" />
                    <div style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.85);color:#fff;font-size:11px;padding:2px 6px;border-radius:4px;font-weight:600;display:flex;align-items:center;gap:4px;">
                      <span class="material-symbols-rounded" style="font-size:13px;color:var(--brand-red);">play_arrow</span>
                      Resume ${formatTimestamp(resumeTime)}
                    </div>
                    <div style="position:absolute;bottom:0;left:0;right:0;height:3.5px;background:rgba(255,255,255,0.25);">
                      <div style="height:100%;background:var(--brand-red);width:${pct}%;"></div>
                    </div>
                  </div>
                  <div style="padding:10px 12px;">
                    <h4 style="font-size:13.5px;font-weight:600;line-height:1.3;max-height:36px;overflow:hidden;margin:0 0 4px 0;color:var(--text-primary);">${escapeHtml(v.title || 'Video')}</h4>
                    <p style="font-size:12px;color:var(--text-secondary);margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(v.channel || v.author || '')}</p>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Followed Creators / Subscriptions Rail -->
      <div class="settings-card" style="padding:22px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <h3 style="font-size:17px;font-weight:600;display:flex;align-items:center;gap:8px;margin:0;color:var(--text-primary);">
            <span class="material-symbols-rounded" style="color:var(--brand-blue);">subscriptions</span>
            Followed Creators (${subs.length})
          </h3>
          ${subs.length > 0 ? `<span style="font-size:12px;color:var(--text-secondary);">Local subscriptions</span>` : ''}
        </div>

        ${subs.length > 0 ? `
          <div style="display:flex;gap:14px;overflow-x:auto;padding-bottom:10px;scrollbar-width:none;">
            ${subs.map((s) => `
              <div class="sub-creator-item" style="display:flex;flex-direction:column;align-items:center;gap:6px;width:80px;cursor:pointer;flex-shrink:0;" onclick="window.location.hash='#/channel/${encodeURIComponent(s.id)}'">
                <div style="width:56px;height:56px;border-radius:50%;overflow:hidden;background:var(--bg-elevated);border:2px solid var(--glass-border);display:flex;align-items:center;justify-content:center;box-shadow:var(--shadow-sm);">
                  ${s.avatar ? `<img src="${escapeHtml(s.avatar)}" alt="" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='/public/assets/pawtube_logo.png';" />` : `<span class="material-symbols-rounded" style="font-size:28px;color:var(--text-secondary);">account_circle</span>`}
                </div>
                <span style="font-size:12px;font-weight:500;color:var(--text-primary);text-align:center;width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                  ${escapeHtml(s.name)}
                </span>
              </div>
            `).join('')}
          </div>
        ` : `
          <p style="font-size:13.5px;color:var(--text-secondary);margin:0;">No creators followed yet. Follow channels directly from video pages to see their latest uploads.</p>
        `}
      </div>

      <!-- Recent Search Queries -->
      ${recentSearches.length > 0 ? `
        <div class="settings-card" style="padding:22px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:24px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <h3 style="font-size:17px;font-weight:600;display:flex;align-items:center;gap:8px;margin:0;color:var(--text-primary);">
              <span class="material-symbols-rounded" style="color:var(--text-secondary);">manage_search</span>
              Recent Searches
            </h3>
            <button id="clear-searches-btn" type="button" style="background:none;border:none;color:var(--text-tertiary);font-size:12px;cursor:pointer;padding:4px 8px;">
              Clear All
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
      ` : ''}

      <!-- Watch History Shelf & Controls -->
      <div class="settings-card" id="history-section" style="padding:22px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
          <h3 style="font-size:17px;font-weight:600;display:flex;align-items:center;gap:8px;margin:0;color:var(--text-primary);">
            <span class="material-symbols-rounded" style="color:var(--brand-blue);">history</span>
            Watch History (${history.length})
          </h3>
          ${history.length > 0 ? `
            <button id="clear-history-btn" type="button" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:var(--brand-red);font-size:12.5px;font-weight:600;cursor:pointer;">
              <span class="material-symbols-rounded" style="font-size:16px;">delete</span>
              Clear History
            </button>
          ` : ''}
        </div>

        ${history.length > 0 ? `
          <div style="display:flex;flex-direction:column;gap:10px;max-height:360px;overflow-y:auto;padding-right:4px;">
            ${history.slice(0, 15).map((item) => `
              <div style="display:flex;align-items:center;gap:12px;padding:8px;border-radius:10px;background:var(--bg-elevated);border:1px solid var(--glass-border-light);">
                <div style="width:104px;aspect-ratio:16/9;border-radius:8px;overflow:hidden;background:#000;flex-shrink:0;cursor:pointer;position:relative;" onclick="window.location.hash='#/watch?v=${encodeURIComponent(item.id)}${item.progress ? `&t=${Math.floor(item.progress)}` : ''}'">
                  <img src="${escapeHtml(item.thumb || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`)}" alt="" style="width:100%;height:100%;object-fit:cover;" loading="lazy" />
                  ${item.watchedPercentage ? `
                    <div style="position:absolute;bottom:0;left:0;right:0;height:3px;background:rgba(255,255,255,0.3);">
                      <div style="height:100%;background:var(--brand-red);width:${item.watchedPercentage}%;"></div>
                    </div>
                  ` : ''}
                </div>
                <div style="flex:1;min-width:0;cursor:pointer;" onclick="window.location.hash='#/watch?v=${encodeURIComponent(item.id)}${item.progress ? `&t=${Math.floor(item.progress)}` : ''}'">
                  <h4 style="font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:0 0 2px 0;color:var(--text-primary);">${escapeHtml(item.title || 'Video')}</h4>
                  <p style="font-size:12px;color:var(--text-secondary);margin:0;">${escapeHtml(item.channel || item.author || '')}</p>
                  ${item.progress ? `<p style="font-size:11.5px;color:var(--brand-blue);margin:3px 0 0 0;">Watched to ${formatTimestamp(item.progress)}</p>` : ''}
                </div>
                <button class="remove-history-item-btn" type="button" data-video-id="${escapeHtml(item.id)}" title="Remove item" style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;color:var(--text-tertiary);cursor:pointer;border-radius:50%;">
                  <span class="material-symbols-rounded" style="font-size:18px;">close</span>
                </button>
              </div>
            `).join('')}
          </div>
        ` : `
          <p style="font-size:13.5px;color:var(--text-secondary);margin:0;">No videos in watch history yet.</p>
        `}
      </div>

      <!-- ============================================== -->
      <!-- COMPREHENSIVE PRODUCTION-GRADE SETTINGS SYSTEM -->
      <!-- ============================================== -->
      <div style="margin-top:36px;margin-bottom:16px;">
        <h2 style="font-size:20px;font-weight:700;display:flex;align-items:center;gap:8px;color:var(--text-primary);margin:0;">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">settings</span>
          Preferences & Controls
        </h2>
        <p style="font-size:13px;color:var(--text-secondary);margin:4px 0 0 0;">
          All configuration is stored locally inside your browser. No remote analytics or trackers.
        </p>
      </div>

      <!-- 1. PLAYBACK SETTINGS -->
      <div class="settings-card" style="padding:22px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:20px;">
        <h3 style="font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px;margin:0 0 16px 0;color:var(--text-primary);">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">play_circle</span>
          Playback
        </h3>
        
        <div style="display:flex;flex-direction:column;gap:16px;">
          <!-- Autoplay -->
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Autoplay Next Video</div>
              <div style="font-size:12.5px;color:var(--text-secondary);">Automatically play the next related recommendation</div>
            </div>
            <label class="switch-container">
              <input type="checkbox" id="pref-autoplay" ${prefs.autoplay ? 'checked' : ''} />
              <span class="switch-slider"></span>
            </label>
          </div>

          <!-- Quality Selector -->
          <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;">
            <div>
              <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Preferred Quality</div>
              <div style="font-size:12.5px;color:var(--text-secondary);">Default video resolution preference</div>
            </div>
            <select id="pref-quality" style="padding:8px 12px;border-radius:10px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-primary);font-size:13.5px;cursor:pointer;">
              <option value="auto" ${prefs.defaultQuality === 'auto' ? 'selected' : ''}>Auto</option>
              <option value="1080p" ${prefs.defaultQuality === '1080p' ? 'selected' : ''}>1080p HD</option>
              <option value="720p" ${prefs.defaultQuality === '720p' ? 'selected' : ''}>720p HD</option>
              <option value="480p" ${prefs.defaultQuality === '480p' ? 'selected' : ''}>480p SD</option>
              <option value="360p" ${prefs.defaultQuality === '360p' ? 'selected' : ''}>360p Data Saver</option>
            </select>
          </div>

          <!-- Remember Playback Position -->
          <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;">
            <div>
              <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Remember Playback Position</div>
              <div style="font-size:12.5px;color:var(--text-secondary);">Resume where you left off across sessions</div>
            </div>
            <label class="switch-container">
              <input type="checkbox" id="pref-remember-pos" ${prefs.rememberPosition ? 'checked' : ''} />
              <span class="switch-slider"></span>
            </label>
          </div>
        </div>
      </div>

      <!-- 2. APPEARANCE SETTINGS -->
      <div class="settings-card" style="padding:22px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:20px;">
        <h3 style="font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px;margin:0 0 16px 0;color:var(--text-primary);">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">palette</span>
          Appearance
        </h3>

        <div style="display:flex;flex-direction:column;gap:16px;">
          <!-- Theme -->
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Interface Theme</div>
              <div style="font-size:12.5px;color:var(--text-secondary);">Select dark palette styling</div>
            </div>
            <select id="pref-theme" style="padding:8px 12px;border-radius:10px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-primary);font-size:13.5px;cursor:pointer;">
              <option value="amoled" ${prefs.theme === 'amoled' ? 'selected' : ''}>AMOLED Deep Black</option>
              <option value="midnight" ${prefs.theme === 'midnight' ? 'selected' : ''}>Midnight Slate Dark</option>
            </select>
          </div>

          <!-- Liquid Glass Backdrop -->
          <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;">
            <div>
              <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Liquid Glass Effects</div>
              <div style="font-size:12.5px;color:var(--text-secondary);">Translucent blur materials and refraction</div>
            </div>
            <label class="switch-container">
              <input type="checkbox" id="pref-liquid-glass" ${prefs.liquidGlass !== false ? 'checked' : ''} />
              <span class="switch-slider"></span>
            </label>
          </div>

          <!-- Reduced Motion -->
          <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;">
            <div>
              <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Reduced Motion</div>
              <div style="font-size:12.5px;color:var(--text-secondary);">Disable non-essential animations and transitions</div>
            </div>
            <label class="switch-container">
              <input type="checkbox" id="pref-reduced-motion" ${prefs.reducedMotion ? 'checked' : ''} />
              <span class="switch-slider"></span>
            </label>
          </div>
        </div>
      </div>

      <!-- 3. PRIVACY & DATA COLLECTION -->
      <div class="settings-card" style="padding:22px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:20px;">
        <h3 style="font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px;margin:0 0 16px 0;color:var(--text-primary);">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">shield</span>
          Privacy & Local History
        </h3>

        <div style="display:flex;flex-direction:column;gap:16px;">
          <!-- History Recording -->
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Save Watch History</div>
              <div style="font-size:12.5px;color:var(--text-secondary);">Record watched streams locally to remember progress</div>
            </div>
            <label class="switch-container">
              <input type="checkbox" id="pref-history-enabled" ${prefs.historyEnabled !== false ? 'checked' : ''} />
              <span class="switch-slider"></span>
            </label>
          </div>

          <!-- Search History Recording -->
          <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;">
            <div>
              <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Save Search History</div>
              <div style="font-size:12.5px;color:var(--text-secondary);">Record query strings locally for quick autocomplete</div>
            </div>
            <label class="switch-container">
              <input type="checkbox" id="pref-search-history-enabled" ${prefs.searchHistoryEnabled !== false ? 'checked' : ''} />
              <span class="switch-slider"></span>
            </label>
          </div>

          <!-- Personalization Ranking -->
          <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;">
            <div>
              <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Local Personalization Ranking</div>
              <div style="font-size:12.5px;color:var(--text-secondary);">Sort feed recommendations using local watch profile weights</div>
            </div>
            <label class="switch-container">
              <input type="checkbox" id="pref-personalization-enabled" ${prefs.personalizationEnabled !== false ? 'checked' : ''} />
              <span class="switch-slider"></span>
            </label>
          </div>
        </div>
      </div>

      <!-- 4. FEED & REGION PREFERENCES -->
      <div class="settings-card" style="padding:22px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:20px;">
        <h3 style="font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px;margin:0 0 16px 0;color:var(--text-primary);">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">public</span>
          Feed & Discovery
        </h3>

        <div style="display:flex;flex-direction:column;gap:16px;">
          <!-- Region -->
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Content Region</div>
              <div style="font-size:12.5px;color:var(--text-secondary);">Country used for trending discovery streams</div>
            </div>
            <select id="pref-region" style="padding:8px 12px;border-radius:10px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-primary);font-size:13.5px;cursor:pointer;">
              <option value="IN" ${prefs.region === 'IN' ? 'selected' : ''}>India (IN)</option>
              <option value="US" ${prefs.region === 'US' ? 'selected' : ''}>United States (US)</option>
              <option value="GB" ${prefs.region === 'GB' ? 'selected' : ''}>United Kingdom (GB)</option>
              <option value="DE" ${prefs.region === 'DE' ? 'selected' : ''}>Germany (DE)</option>
              <option value="JP" ${prefs.region === 'JP' ? 'selected' : ''}>Japan (JP)</option>
              <option value="FR" ${prefs.region === 'FR' ? 'selected' : ''}>France (FR)</option>
              <option value="CA" ${prefs.region === 'CA' ? 'selected' : ''}>Canada (CA)</option>
            </select>
          </div>

          <!-- Hide Shorts -->
          <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;">
            <div>
              <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Hide Shorts From Feed</div>
              <div style="font-size:12.5px;color:var(--text-secondary);">Filter out vertical short videos under 60 seconds</div>
            </div>
            <label class="switch-container">
              <input type="checkbox" id="pref-hide-shorts" ${prefs.hideShorts ? 'checked' : ''} />
              <span class="switch-slider"></span>
            </label>
          </div>
        </div>
      </div>

      <!-- 5. PLAYER SETTINGS -->
      <div class="settings-card" style="padding:22px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:20px;">
        <h3 style="font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px;margin:0 0 16px 0;color:var(--text-primary);">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">aspect_ratio</span>
          Player & Window
        </h3>

        <div style="display:flex;flex-direction:column;gap:16px;">
          <!-- Mini Player -->
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Mini-Player</div>
              <div style="font-size:12.5px;color:var(--text-secondary);">Keep video playing in floating corner when navigating</div>
            </div>
            <label class="switch-container">
              <input type="checkbox" id="pref-mini-player" ${prefs.miniPlayerEnabled !== false ? 'checked' : ''} />
              <span class="switch-slider"></span>
            </label>
          </div>

          <!-- Theatre Mode Default -->
          <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--glass-border-light);padding-top:14px;">
            <div>
              <div style="font-size:14px;font-weight:500;color:var(--text-primary);">Default Theatre Mode</div>
              <div style="font-size:12.5px;color:var(--text-secondary);">Expand player to wide cinematic stage on watch page</div>
            </div>
            <label class="switch-container">
              <input type="checkbox" id="pref-theatre-default" ${prefs.theatreModeDefault ? 'checked' : ''} />
              <span class="switch-slider"></span>
            </label>
          </div>
        </div>
      </div>

      <!-- 6. PIPED NETWORK & INSTANCE CONFIG -->
      <div class="settings-card" style="padding:22px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:20px;">
        <h3 style="font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px;margin:0 0 10px 0;color:var(--text-primary);">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">dns</span>
          Piped Instance Gateway
        </h3>
        <p style="font-size:13px;color:var(--text-secondary);margin:0 0 14px 0;line-height:1.5;">
          PawTube routes metadata through a pooled cluster of public Piped instances with automatic latency failover. You can optionally pin a custom instance URL.
        </p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <input 
            type="url" 
            id="custom-instance-input" 
            placeholder="https://api.piped.private.coffee" 
            value="${escapeHtml(customInstance)}"
            style="flex:1;min-width:200px;padding:10px 14px;border-radius:10px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-primary);font-size:13.5px;"
          />
          <button id="save-instance-btn" type="button" style="padding:10px 20px;border-radius:10px;background:var(--brand-blue);color:#fff;border:none;font-size:13.5px;font-weight:600;cursor:pointer;">
            Save
          </button>
          ${customInstance ? `
            <button id="reset-instance-btn" type="button" style="padding:10px 16px;border-radius:10px;background:transparent;border:1px solid var(--glass-border);color:var(--brand-red);font-size:13.5px;cursor:pointer;">
              Reset
            </button>
          ` : ''}
        </div>
      </div>

      <!-- 7. BACKUP, EXPORT & RESET -->
      <div class="settings-card" style="padding:22px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:20px;">
        <h3 style="font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px;margin:0 0 14px 0;color:var(--text-primary);">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">download_for_offline</span>
          Storage & Backup
        </h3>
        <p style="font-size:13px;color:var(--text-secondary);margin:0 0 16px 0;line-height:1.5;">
          Your subscriptions, history, likes, and playlists live in this device's storage. You can export a JSON backup at any time.
        </p>

        <div style="display:flex;flex-wrap:wrap;gap:10px;">
          <!-- Export Data Button -->
          <button id="export-data-btn" type="button" style="display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:10px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-primary);font-size:13.5px;font-weight:600;cursor:pointer;">
            <span class="material-symbols-rounded" style="font-size:18px;color:var(--brand-blue);">file_download</span>
            Export Data Backup
          </button>

          <!-- Reset Settings Button -->
          <button id="reset-prefs-btn" type="button" style="display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:10px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-primary);font-size:13.5px;font-weight:600;cursor:pointer;">
            <span class="material-symbols-rounded" style="font-size:18px;">restart_alt</span>
            Reset Preferences
          </button>

          <!-- Clear All Data Button -->
          <button id="wipe-data-btn" type="button" style="display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:10px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:var(--brand-red);font-size:13.5px;font-weight:600;cursor:pointer;">
            <span class="material-symbols-rounded" style="font-size:18px;">delete_forever</span>
            Clear All Data
          </button>
        </div>
      </div>

      <!-- 8. ABOUT PAWTUBE -->
      <div class="settings-card" style="padding:22px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <img src="/public/assets/pawtube_logo.png" alt="PawTube" style="width:36px;height:36px;border-radius:8px;" onerror="this.style.display='none';" />
          <div>
            <h3 style="font-size:16px;font-weight:700;margin:0;color:var(--text-primary);">PawTube v1.2.0</h3>
            <p style="font-size:12px;color:var(--text-secondary);margin:0;">Distraction-Free Video Experience</p>
          </div>
        </div>
        <p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin:0 0 12px 0;">
          PawTube plays video streams through isolated YouTube No-Cookie embeds (<code style="background:rgba(255,255,255,0.08);padding:2px 4px;border-radius:4px;">youtube-nocookie.com</code>) decoupled from Piped metadata extraction. Zero tracking cookies, zero user accounts, zero remote surveillance.
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:12px;font-size:12px;color:var(--text-tertiary);">
          <span>Vercel-Ready Architecture</span>
          <span>&bull;</span>
          <span>Piped Extractor API</span>
          <span>&bull;</span>
          <span>AMOLED Liquid Glass UI</span>
        </div>
      </div>
    </div>
  `;

  // Bind Scroll to History Button
  container.querySelector('#scroll-to-history-btn')?.addEventListener('click', () => {
    const el = container.querySelector('#history-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  });

  // Bind Recent Search Chips
  container.querySelectorAll('.recent-search-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const q = chip.getAttribute('data-query');
      if (q) window.location.hash = `#/search?q=${encodeURIComponent(q)}`;
    });
  });

  // Bind Clear Searches
  container.querySelector('#clear-searches-btn')?.addEventListener('click', () => {
    clearRecentSearches();
    showToast('Recent searches cleared', 'info');
    renderYouPage(container);
  });

  // Bind Clear History
  container.querySelector('#clear-history-btn')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear your entire watch history?')) {
      clearHistory();
      showToast('Watch history cleared', 'info');
      renderYouPage(container);
    }
  });

  // Bind Remove Single History Item
  container.querySelectorAll('.remove-history-item-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-video-id');
      removeFromHistory(id);
      showToast('Removed from history', 'info');
      renderYouPage(container);
    });
  });

  // Bind Preference Checkboxes & Selects
  const bindPref = (selector, key, isCheckbox = false) => {
    const el = container.querySelector(selector);
    if (!el) return;
    el.addEventListener('change', () => {
      const val = isCheckbox ? el.checked : el.value;
      savePreferences({ [key]: val });
      showToast('Setting updated', 'success');
    });
  };

  bindPref('#pref-autoplay', 'autoplay', true);
  bindPref('#pref-quality', 'defaultQuality', false);
  bindPref('#pref-remember-pos', 'rememberPosition', true);
  bindPref('#pref-theme', 'theme', false);
  bindPref('#pref-liquid-glass', 'liquidGlass', true);
  bindPref('#pref-reduced-motion', 'reducedMotion', true);
  bindPref('#pref-history-enabled', 'historyEnabled', true);
  bindPref('#pref-search-history-enabled', 'searchHistoryEnabled', true);
  bindPref('#pref-personalization-enabled', 'personalizationEnabled', true);
  bindPref('#pref-region', 'region', false);
  bindPref('#pref-hide-shorts', 'hideShorts', true);
  bindPref('#pref-mini-player', 'miniPlayerEnabled', true);
  bindPref('#pref-theatre-default', 'theatreModeDefault', true);

  // Bind Custom Instance Save & Reset
  container.querySelector('#save-instance-btn')?.addEventListener('click', () => {
    const input = container.querySelector('#custom-instance-input');
    const val = (input?.value || '').trim();
    if (val && !val.startsWith('http')) {
      showToast('URL must start with https://', 'error');
      return;
    }
    setCustomInstance(val);
    showToast('Custom instance saved', 'success');
    renderYouPage(container);
  });

  container.querySelector('#reset-instance-btn')?.addEventListener('click', () => {
    setCustomInstance('');
    showToast('Reset to default instance pool', 'info');
    renderYouPage(container);
  });

  // Bind Export Data
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

  // Bind Reset Preferences
  container.querySelector('#reset-prefs-btn')?.addEventListener('click', () => {
    if (confirm('Reset all PawTube preferences to default settings?')) {
      resetPreferences();
      showToast('Preferences reset to default', 'info');
      renderYouPage(container);
    }
  });

  // Bind Clear All Data
  container.querySelector('#wipe-data-btn')?.addEventListener('click', () => {
    if (confirm('This will delete all local history, playlists, liked videos, and settings from this browser. Are you sure?')) {
      clearAllLocalUserData();
      showToast('All local data cleared', 'info');
      renderYouPage(container);
    }
  });
}

export default renderYouPage;
