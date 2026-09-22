/**
 * PawTube - You & Settings Page
 * Integrates local watch history, Continue Watching shelf with exact resume timestamps,
 * clear history controls, saved playlists, subscriptions, and custom Piped instance configuration.
 */

import { getPreferences, savePreferences, getCustomInstance, setCustomInstance, getSubscriptions, toggleSubscription } from '../../storage/preferences/preferencesStorage.js';
import { getHistory, clearHistory, removeFromHistory } from '../../storage/history/historyStorage.js';
import { getPlaylists } from '../../storage/playlists/playlistStorage.js';
import { showToast } from '../../components/common/toast.js';
import { escapeHtml } from '../../utils/dom.js';

function formatTimestamp(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function renderYouPage(container) {
  const prefs = getPreferences();
  const customInstance = getCustomInstance();
  const subs = getSubscriptions();
  const history = getHistory();
  const playlists = getPlaylists();

  // Continue watching: videos with progress >= 5s and not practically finished
  const continueWatching = history.filter((v) => {
    const prog = v.progress || 0;
    const dur = v.duration || 0;
    return prog >= 5 && (dur === 0 || prog < dur - 10);
  });

  container.innerHTML = `
    <div class="you-container" style="max-width:960px;margin:0 auto;padding-bottom:80px;">
      <!-- Profile / Header Banner -->
      <div style="display:flex;align-items:center;gap:18px;padding:24px;background:var(--bg-surface);border-radius:20px;border:1px solid var(--glass-border);margin-bottom:28px;">
        <div style="width:68px;height:68px;border-radius:50%;background:linear-gradient(135deg, var(--brand-blue) 0%, #1e5a96 100%);display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 4px 14px rgba(59,130,246,0.35);">
          <span class="material-symbols-rounded" style="font-size:38px;">person</span>
        </div>
        <div style="flex:1;">
          <h2 style="font-size:22px;font-weight:700;margin-bottom:4px;">You</h2>
          <p style="font-size:13px;color:var(--text-secondary);display:flex;flex-wrap:wrap;gap:12px;margin-top:4px;">
            <span><strong>${history.length}</strong> watched</span>
            <span>&bull;</span>
            <span><strong>${playlists.length}</strong> playlists</span>
            <span>&bull;</span>
            <span><strong>${subs.length}</strong> subscriptions</span>
          </p>
        </div>
      </div>

      <!-- Continue Watching Shelf -->
      ${continueWatching.length > 0 ? `
        <div class="settings-card" style="padding:20px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:24px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <h3 style="font-size:17px;font-weight:600;display:flex;align-items:center;gap:8px;">
              <span class="material-symbols-rounded" style="color:var(--brand-red);">play_circle</span>
              Continue Watching
            </h3>
            <span style="font-size:12px;color:var(--text-secondary);">${continueWatching.length} in progress</span>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:14px;">
            ${continueWatching.slice(0, 6).map((v) => {
              const resumeTime = Math.floor(v.progress || 0);
              const pct = v.watchedPercentage || (v.duration ? Math.min(100, Math.round((resumeTime / v.duration) * 100)) : 0);
              return `
                <div class="continue-you-card" style="cursor:pointer;background:var(--bg-elevated);border-radius:12px;overflow:hidden;border:1px solid var(--glass-border-light);transition:transform 0.2s;" onclick="window.location.hash='#/watch?v=${encodeURIComponent(v.id)}&t=${resumeTime}'">
                  <div style="position:relative;width:100%;aspect-ratio:16/9;background:#000;">
                    <img src="${escapeHtml(v.thumb || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`)}" alt="" style="width:100%;height:100%;object-fit:cover;" loading="lazy" />
                    <div style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.85);color:#fff;font-size:11px;padding:2px 6px;border-radius:4px;font-weight:600;">
                      Resume ${formatTimestamp(resumeTime)}
                    </div>
                    <!-- Progress bar -->
                    <div style="position:absolute;bottom:0;left:0;right:0;height:4px;background:rgba(255,255,255,0.3);">
                      <div style="height:100%;background:var(--brand-red);width:${pct}%;"></div>
                    </div>
                  </div>
                  <div style="padding:10px 12px;">
                    <h4 style="font-size:13.5px;font-weight:600;line-height:1.3;max-height:36px;overflow:hidden;margin-bottom:4px;">${escapeHtml(v.title || 'Video')}</h4>
                    <p style="font-size:12px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(v.channel || v.author || '')}</p>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      ` : ''}

      <!-- History Section -->
      <div class="settings-card" style="padding:20px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
          <h3 style="font-size:17px;font-weight:600;display:flex;align-items:center;gap:8px;">
            <span class="material-symbols-rounded" style="color:var(--brand-blue);">history</span>
            Watch History (${history.length})
          </h3>
          ${history.length > 0 ? `
            <button id="clear-history-btn" style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;background:transparent;border:1px solid var(--glass-border);color:var(--brand-red);font-size:12.5px;cursor:pointer;">
              <span class="material-symbols-rounded" style="font-size:16px;">delete</span>
              Clear History
            </button>
          ` : ''}
        </div>

        ${history.length > 0 ? `
          <div style="display:flex;flex-direction:column;gap:10px;max-height:380px;overflow-y:auto;padding-right:4px;">
            ${history.slice(0, 20).map((item) => `
              <div style="display:flex;align-items:center;gap:12px;padding:8px;border-radius:10px;background:var(--bg-elevated);border:1px solid var(--glass-border-light);">
                <div style="width:100px;aspect-ratio:16/9;border-radius:6px;overflow:hidden;background:#000;flex-shrink:0;cursor:pointer;" onclick="window.location.hash='#/watch?v=${encodeURIComponent(item.id)}${item.progress ? `&t=${Math.floor(item.progress)}` : ''}'">
                  <img src="${escapeHtml(item.thumb || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`)}" alt="" style="width:100%;height:100%;object-fit:cover;" loading="lazy" />
                </div>
                <div style="flex:1;min-width:0;cursor:pointer;" onclick="window.location.hash='#/watch?v=${encodeURIComponent(item.id)}${item.progress ? `&t=${Math.floor(item.progress)}` : ''}'">
                  <h4 style="font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(item.title || 'Video')}</h4>
                  <p style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${escapeHtml(item.channel || item.author || '')}</p>
                  ${item.progress ? `<p style="font-size:11px;color:var(--brand-blue);margin-top:2px;">Watched to ${formatTimestamp(item.progress)}</p>` : ''}
                </div>
                <button class="remove-history-item-btn" data-video-id="${escapeHtml(item.id)}" title="Remove from history" style="padding:6px;background:transparent;border:none;color:var(--text-tertiary);cursor:pointer;border-radius:50%;">
                  <span class="material-symbols-rounded" style="font-size:18px;">close</span>
                </button>
              </div>
            `).join('')}
          </div>
        ` : `
          <p style="font-size:13.5px;color:var(--text-secondary);">No watch history yet. Videos you watch will appear here.</p>
        `}
      </div>

      <!-- Playlists Section -->
      <div class="settings-card" style="padding:20px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:24px;">
        <h3 style="font-size:17px;font-weight:600;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">playlist_play</span>
          Playlists & Saved
        </h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(240px, 1fr));gap:12px;">
          ${playlists.map((pl) => `
            <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--bg-elevated);border-radius:12px;border:1px solid var(--glass-border);cursor:pointer;" onclick="window.location.hash='#/library'">
              <div style="width:44px;height:44px;border-radius:8px;background:rgba(59,130,246,0.15);display:flex;align-items:center;justify-content:center;color:var(--brand-blue);flex-shrink:0;">
                <span class="material-symbols-rounded">${pl.id === 'watch-later' ? 'bookmark' : 'playlist_play'}</span>
              </div>
              <div style="overflow:hidden;">
                <div style="font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(pl.name)}</div>
                <div style="font-size:12px;color:var(--text-secondary);">${(pl.items || []).length} videos</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Subscriptions Section -->
      <div class="settings-card" style="padding:20px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:24px;">
        <h3 style="font-size:17px;font-weight:600;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">subscriptions</span>
          Subscriptions (${subs.length})
        </h3>
        ${subs.length > 0 ? `
          <div style="display:flex;flex-direction:column;gap:10px;max-height:300px;overflow-y:auto;">
            ${subs.map((s) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg-elevated);border-radius:12px;">
                <div style="display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="window.location.hash='#/channel?id=${encodeURIComponent(s.id)}'">
                  <div style="width:34px;height:34px;border-radius:50%;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;overflow:hidden;">
                    ${s.avatar ? `<img src="${escapeHtml(s.avatar)}" alt="" style="width:100%;height:100%;object-fit:cover;" />` : '<span class="material-symbols-rounded" style="font-size:20px;">account_circle</span>'}
                  </div>
                  <span style="font-size:14px;font-weight:500;">${escapeHtml(s.name)}</span>
                </div>
                <button class="unsub-btn" data-sub-id="${escapeHtml(s.id)}" style="padding:5px 12px;border-radius:8px;background:transparent;border:1px solid var(--glass-border);color:var(--text-secondary);font-size:12px;cursor:pointer;">
                  Unsubscribe
                </button>
              </div>
            `).join('')}
          </div>
        ` : `
          <p style="font-size:13.5px;color:var(--text-secondary);">No subscriptions yet. Subscribe to channels from video watch pages.</p>
        `}
      </div>

      <!-- Instance Settings -->
      <div class="settings-card" style="padding:20px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:24px;">
        <h3 style="font-size:17px;font-weight:600;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">dns</span>
          Piped API Instance
        </h3>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">
          PawTube uses a high-availability pool of public Piped instances with automatic health validation. You can optionally specify your own custom Piped instance URL.
        </p>
        <div style="display:flex;gap:8px;margin-bottom:12px;">
          <input 
            type="url" 
            id="custom-instance-input" 
            placeholder="https://api.piped.private.coffee" 
            value="${escapeHtml(customInstance)}"
            style="flex:1;padding:10px 14px;border-radius:10px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-primary);font-size:14px;"
          />
          <button id="save-instance-btn" style="padding:10px 18px;border-radius:10px;background:var(--brand-blue);color:#fff;border:none;font-size:14px;font-weight:600;cursor:pointer;">
            Save
          </button>
          ${customInstance ? `
            <button id="reset-instance-btn" style="padding:10px 14px;border-radius:10px;background:transparent;border:1px solid var(--glass-border);color:var(--brand-red);font-size:14px;cursor:pointer;">
              Reset
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Content Region -->
      <div class="settings-card" style="padding:20px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:24px;">
        <h3 style="font-size:17px;font-weight:600;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">tune</span>
          Content Preferences
        </h3>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;">
          <div>
            <div style="font-size:14px;font-weight:500;">Content Region</div>
            <div style="font-size:12px;color:var(--text-secondary);">Select country for trending content</div>
          </div>
          <select id="region-select" style="padding:8px 14px;border-radius:8px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-primary);font-size:13.5px;">
            <option value="IN" ${prefs.region === 'IN' ? 'selected' : ''}>India (IN)</option>
            <option value="US" ${prefs.region === 'US' ? 'selected' : ''}>United States (US)</option>
            <option value="GB" ${prefs.region === 'GB' ? 'selected' : ''}>United Kingdom (GB)</option>
            <option value="DE" ${prefs.region === 'DE' ? 'selected' : ''}>Germany (DE)</option>
            <option value="JP" ${prefs.region === 'JP' ? 'selected' : ''}>Japan (JP)</option>
            <option value="FR" ${prefs.region === 'FR' ? 'selected' : ''}>France (FR)</option>
            <option value="CA" ${prefs.region === 'CA' ? 'selected' : ''}>Canada (CA)</option>
          </select>
        </div>
      </div>

      <!-- About PawTube -->
      <div class="settings-card" style="padding:20px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);">
        <h3 style="font-size:17px;font-weight:600;margin-bottom:10px;">About PawTube</h3>
        <p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:8px;">
          PawTube is a clean, distraction-free YouTube experience. It uses direct YouTube No-Cookie playback (<code style="background:rgba(255,255,255,0.08);padding:2px 4px;border-radius:4px;">youtube-nocookie.com</code>) decoupled from Piped metadata extraction.
        </p>
        <p style="font-size:12px;color:var(--text-tertiary);">
          Vercel-Ready Architecture &bull; Single Repository &bull; Client-Side Storage Only
        </p>
      </div>
    </div>
  `;

  // Bind clear history
  container.querySelector('#clear-history-btn')?.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear your entire watch history?')) {
      clearHistory();
      showToast('Watch history cleared', 'info');
      renderYouPage(container);
    }
  });

  // Bind remove individual history item
  container.querySelectorAll('.remove-history-item-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-video-id');
      removeFromHistory(id);
      showToast('Removed from history', 'info');
      renderYouPage(container);
    });
  });

  // Bind save instance
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

  // Bind reset instance
  container.querySelector('#reset-instance-btn')?.addEventListener('click', () => {
    setCustomInstance('');
    showToast('Reset to default instance pool', 'info');
    renderYouPage(container);
  });

  // Bind region select
  container.querySelector('#region-select')?.addEventListener('change', (e) => {
    savePreferences({ region: e.target.value });
    showToast('Content region updated', 'success');
  });

  // Bind unsubscribe
  container.querySelectorAll('.unsub-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-sub-id');
      toggleSubscription({ id });
      showToast('Unsubscribed', 'info');
      renderYouPage(container);
    });
  });
}

export default renderYouPage;
