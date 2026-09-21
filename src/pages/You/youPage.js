/**
 * PawTube - You & Settings Page
 */

import { getPreferences, savePreferences, getCustomInstance, setCustomInstance, getSubscriptions, toggleSubscription } from '../../storage/preferences/preferencesStorage.js';
import { showToast } from '../../components/common/toast.js';
import { escapeHtml } from '../../utils/dom.js';

export function renderYouPage(container) {
  const prefs = getPreferences();
  const customInstance = getCustomInstance();
  const subs = getSubscriptions();

  container.innerHTML = `
    <div class="you-container" style="max-width:800px;margin:0 auto;padding-bottom:60px;">
      <!-- Profile / Header -->
      <div style="display:flex;align-items:center;gap:16px;padding:24px;background:var(--bg-surface);border-radius:20px;border:1px solid var(--glass-border);margin-bottom:28px;">
        <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg, var(--brand-blue) 0%, #1e5a96 100%);display:flex;align-items:center;justify-content:center;color:#fff;font-size:32px;">
          <span class="material-symbols-rounded" style="font-size:36px;">person</span>
        </div>
        <div>
          <h2 style="font-size:22px;font-weight:700;margin-bottom:4px;">You</h2>
          <p style="font-size:13.5px;color:var(--text-secondary);">PawTube User &bull; Distraction-Free &bull; AMOLED Liquid Glass</p>
        </div>
      </div>

      <!-- Subscriptions -->
      <div class="settings-card" style="padding:20px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:24px;">
        <h3 style="font-size:17px;font-weight:600;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">subscriptions</span>
          Subscriptions (${subs.length})
        </h3>
        ${subs.length > 0 ? `
          <div style="display:flex;flex-direction:column;gap:10px;">
            ${subs.map((s) => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg-elevated);border-radius:12px;">
                <div style="display:flex;align-items:center;gap:10px;cursor:pointer;" onclick="window.location.hash='#/channel?id=${encodeURIComponent(s.id)}'">
                  <div style="width:32px;height:32px;border-radius:50%;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;">
                    <span class="material-symbols-rounded" style="font-size:18px;">account_circle</span>
                  </div>
                  <span style="font-size:14px;font-weight:500;">${escapeHtml(s.name)}</span>
                </div>
                <button class="unsub-btn" data-sub-id="${escapeHtml(s.id)}" style="padding:4px 10px;border-radius:8px;background:transparent;border:1px solid var(--glass-border);color:var(--text-secondary);font-size:12px;cursor:pointer;">
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

      <!-- Feed & Playback Preferences -->
      <div class="settings-card" style="padding:20px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);margin-bottom:24px;">
        <h3 style="font-size:17px;font-weight:600;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);">tune</span>
          Preferences
        </h3>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--glass-border-light);">
          <div>
            <div style="font-size:14px;font-weight:500;">Content Region</div>
            <div style="font-size:12px;color:var(--text-secondary);">Select country for trending content</div>
          </div>
          <select id="region-select" style="padding:6px 12px;border-radius:8px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-primary);font-size:13px;">
            <option value="US" ${prefs.region === 'US' ? 'selected' : ''}>United States (US)</option>
            <option value="GB" ${prefs.region === 'GB' ? 'selected' : ''}>United Kingdom (GB)</option>
            <option value="DE" ${prefs.region === 'DE' ? 'selected' : ''}>Germany (DE)</option>
            <option value="JP" ${prefs.region === 'JP' ? 'selected' : ''}>Japan (JP)</option>
            <option value="FR" ${prefs.region === 'FR' ? 'selected' : ''}>France (FR)</option>
            <option value="CA" ${prefs.region === 'CA' ? 'selected' : ''}>Canada (CA)</option>
            <option value="IN" ${prefs.region === 'IN' ? 'selected' : ''}>India (IN)</option>
          </select>
        </div>
      </div>

      <!-- About & Architecture -->
      <div class="settings-card" style="padding:20px;background:var(--bg-surface);border-radius:18px;border:1px solid var(--glass-border);">
        <h3 style="font-size:17px;font-weight:600;margin-bottom:10px;">About PawTube</h3>
        <p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:8px;">
          PawTube is a clean, distraction-free YouTube experience. It uses direct YouTube No-Cookie playback (<code style="background:rgba(255,255,255,0.08);padding:2px 4px;border-radius:4px;">youtube-nocookie.com</code>) decoupled from Piped metadata extraction.
        </p>
        <p style="font-size:12px;color:var(--text-tertiary);">
          Vercel-Ready Architecture &bull; Single Repository &bull; Zero Tracking
        </p>
      </div>
    </div>
  `;

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
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-sub-id');
      toggleSubscription({ id });
      showToast('Unsubscribed', 'info');
      renderYouPage(container);
    });
  });
}

export default renderYouPage;
