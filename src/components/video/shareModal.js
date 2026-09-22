/**
 * PawTube - Share Video Modal
 * Supports native Web Share API where available,
 * with direct Copy YouTube URL, Copy PawTube URL, and Open on YouTube actions.
 * Strictly avoids exposing internal Piped URLs.
 */

import { showToast } from '../common/toast.js';
import { escapeHtml } from '../../utils/dom.js';

export function copyToClipboard(text, successMessage = 'Link copied to clipboard') {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMessage, 'success');
    }).catch(() => {
      fallbackCopy(text, successMessage);
    });
  } else {
    fallbackCopy(text, successMessage);
  }
}

function fallbackCopy(text, successMessage) {
  try {
    const input = document.createElement('input');
    input.value = text;
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showToast(successMessage, 'success');
  } catch {
    prompt('Copy link:', text);
  }
}

export async function shareYouTubeUrl(videoId, title = 'Watch on YouTube') {
  const youtubeUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  if (navigator.share) {
    try {
      await navigator.share({
        title,
        url: youtubeUrl
      });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  copyToClipboard(youtubeUrl, 'YouTube link copied');
}

export async function sharePawTubeUrl(videoId, title = 'Watch on PawTube') {
  const pawtubeUrl = `${window.location.origin}/#/watch?v=${encodeURIComponent(videoId)}`;
  if (navigator.share) {
    try {
      await navigator.share({
        title,
        url: pawtubeUrl
      });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  copyToClipboard(pawtubeUrl, 'PawTube link copied');
}

export function openOnYouTube(videoId) {
  const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function showShareModal(video) {
  if (!video || !video.id) return;

  const existing = document.getElementById('pawtube-share-modal');
  if (existing) existing.remove();

  const videoId = video.id;
  const title = video.title || 'YouTube Video';
  const youtubeUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const pawtubeUrl = `${window.location.origin}/#/watch?v=${encodeURIComponent(videoId)}`;
  const hasWebShare = typeof navigator !== 'undefined' && !!navigator.share;

  const modalEl = document.createElement('div');
  modalEl.id = 'pawtube-share-modal';
  modalEl.className = 'modal-overlay';
  modalEl.setAttribute('role', 'dialog');
  modalEl.setAttribute('aria-modal', 'true');
  modalEl.setAttribute('aria-label', 'Share video');

  modalEl.innerHTML = `
    <div class="modal-card" style="max-width:460px;width:100%;padding:22px;background:var(--glass-surface);backdrop-filter:var(--blur-lg);border:1px solid var(--glass-border);border-radius:18px;box-shadow:var(--shadow-float);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span class="material-symbols-rounded" style="color:var(--brand-blue);font-size:24px;">share</span>
          <h3 style="font-size:18px;font-weight:700;margin:0;">Share Video</h3>
        </div>
        <button id="close-share-modal-btn" class="icon-btn" aria-label="Close" style="width:36px;height:36px;background:transparent;border:none;color:var(--text-secondary);cursor:pointer;border-radius:50%;">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>

      <div style="font-size:13.5px;font-weight:600;color:var(--text-primary);margin-bottom:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        ${escapeHtml(title)}
      </div>

      <!-- Quick Action Cards -->
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:18px;">
        ${hasWebShare ? `
          <button id="share-native-btn" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-radius:12px;background:var(--bg-elevated);border:1px solid var(--glass-border);color:var(--text-primary);cursor:pointer;font-size:14px;font-weight:600;text-align:left;transition:background 0.2s;">
            <div style="display:flex;align-items:center;gap:12px;">
              <span class="material-symbols-rounded" style="color:var(--brand-blue);">send_to_mobile</span>
              <span>Share via device options...</span>
            </div>
            <span class="material-symbols-rounded" style="color:var(--text-secondary);font-size:18px;">chevron_right</span>
          </button>
        ` : ''}

        <!-- PawTube Link Option -->
        <div style="padding:12px 14px;border-radius:12px;background:var(--bg-elevated);border:1px solid var(--glass-border);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-size:12.5px;font-weight:600;color:var(--brand-blue);display:flex;align-items:center;gap:6px;">
              <span class="material-symbols-rounded" style="font-size:16px;">link</span>
              PawTube Link
            </span>
            <button id="copy-pawtube-btn" style="padding:4px 10px;border-radius:6px;background:var(--brand-blue);color:#fff;border:none;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;">
              <span class="material-symbols-rounded" style="font-size:14px;">content_copy</span>
              Copy
            </button>
          </div>
          <div style="font-size:12px;color:var(--text-secondary);word-break:break-all;font-family:monospace;background:rgba(0,0,0,0.25);padding:6px 8px;border-radius:6px;">
            ${escapeHtml(pawtubeUrl)}
          </div>
        </div>

        <!-- YouTube Link Option -->
        <div style="padding:12px 14px;border-radius:12px;background:var(--bg-elevated);border:1px solid var(--glass-border);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-size:12.5px;font-weight:600;color:var(--brand-red);display:flex;align-items:center;gap:6px;">
              <span class="material-symbols-rounded" style="font-size:16px;">smart_display</span>
              Direct YouTube Link
            </span>
            <div style="display:flex;gap:6px;">
              <button id="open-youtube-btn" title="Open in new tab" style="padding:4px 8px;border-radius:6px;background:transparent;border:1px solid var(--glass-border);color:var(--text-secondary);font-size:12px;cursor:pointer;display:flex;align-items:center;gap:4px;">
                <span class="material-symbols-rounded" style="font-size:14px;">open_in_new</span>
                Open
              </button>
              <button id="copy-youtube-btn" style="padding:4px 10px;border-radius:6px;background:var(--bg-surface);border:1px solid var(--glass-border);color:var(--text-primary);font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;">
                <span class="material-symbols-rounded" style="font-size:14px;">content_copy</span>
                Copy
              </button>
            </div>
          </div>
          <div style="font-size:12px;color:var(--text-secondary);word-break:break-all;font-family:monospace;background:rgba(0,0,0,0.25);padding:6px 8px;border-radius:6px;">
            ${escapeHtml(youtubeUrl)}
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modalEl);

  // Bind Events
  modalEl.querySelector('#close-share-modal-btn')?.addEventListener('click', () => modalEl.remove());
  modalEl.addEventListener('click', (e) => {
    if (e.target === modalEl) modalEl.remove();
  });

  modalEl.querySelector('#share-native-btn')?.addEventListener('click', async () => {
    modalEl.remove();
    await sharePawTubeUrl(videoId, title);
  });

  modalEl.querySelector('#copy-pawtube-btn')?.addEventListener('click', () => {
    copyToClipboard(pawtubeUrl, 'PawTube link copied');
    modalEl.remove();
  });

  modalEl.querySelector('#copy-youtube-btn')?.addEventListener('click', () => {
    copyToClipboard(youtubeUrl, 'YouTube link copied');
    modalEl.remove();
  });

  modalEl.querySelector('#open-youtube-btn')?.addEventListener('click', () => {
    openOnYouTube(videoId);
    modalEl.remove();
  });

  const handleKeydown = (e) => {
    if (e.key === 'Escape') {
      modalEl.remove();
      window.removeEventListener('keydown', handleKeydown);
    }
  };
  window.addEventListener('keydown', handleKeydown);
}
