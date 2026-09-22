/**
 * PawTube - Shorts Page
 */

import { PipedApi } from '../../api/piped/pipedApi.js';
import { buildNoCookieEmbedUrl } from '../../player/embed.js';
import { renderErrorState } from '../../components/video/videoCard.js';
import { escapeHtml } from '../../utils/dom.js';

let currentShorts = [];
let currentShortIndex = 0;

export async function renderShortsPage(container) {
  container.innerHTML = `
    <div style="display:flex;justify-content:center;align-items:center;min-height:70vh;">
      <div class="skeleton-pulse" style="width:360px;height:640px;border-radius:18px;background:rgba(255,255,255,0.05);"></div>
    </div>
  `;

  try {
    const res = await PipedApi.search('shorts', 'all');
    currentShorts = (res.items || []).filter((i) => i.id);

    if (currentShorts.length === 0) {
      const trendRes = await PipedApi.getTrending('IN');
      currentShorts = (trendRes.items || []).filter((i) => i.id);
    }

    if (currentShorts.length === 0) {
      container.innerHTML = `<div style="padding:40px;text-align:center;color:var(--text-secondary);">No shorts available.</div>`;
      return;
    }

    renderCurrentShort(container);
  } catch (err) {
    console.error('Shorts error:', err);
    container.innerHTML = renderErrorState('Failed to load Shorts', err.message, 'window.pawtubeRetryShorts');
    window.pawtubeRetryShorts = () => renderShortsPage(container);
  }
}

function renderCurrentShort(container) {
  const short = currentShorts[currentShortIndex];
  if (!short) return;

  const embedUrl = buildNoCookieEmbedUrl(short.id, { autoplay: 1, playsinline: 1 });

  container.innerHTML = `
    <div class="shorts-container" style="max-width:440px;margin:0 auto;position:relative;display:flex;flex-direction:column;align-items:center;padding-bottom:80px;">
      <div style="width:100%;aspect-ratio:9/16;max-height:calc(100vh - 140px);background:#000;border-radius:18px;overflow:hidden;box-shadow:var(--shadow-glass);position:relative;">
        <iframe 
          src="${embedUrl}" 
          title="${escapeHtml(short.title)}" 
          style="width:100%;height:100%;border:none;"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen>
        </iframe>
      </div>

      <div style="width:100%;margin-top:12px;padding:0 8px;display:flex;justify-content:space-between;align-items:center;">
        <div style="flex:1;overflow:hidden;">
          <h3 style="font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(short.title)}</h3>
          <p style="font-size:13px;color:var(--text-secondary);">${escapeHtml(short.channel || short.author || '')}</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="short-prev-btn" class="icon-btn" title="Previous Short" style="background:var(--bg-elevated);border:1px solid var(--glass-border);" ${currentShortIndex === 0 ? 'disabled style="opacity:0.4;"' : ''}>
            <span class="material-symbols-rounded">arrow_upward</span>
          </button>
          <button id="short-next-btn" class="icon-btn" title="Next Short" style="background:var(--bg-elevated);border:1px solid var(--glass-border);">
            <span class="material-symbols-rounded">arrow_downward</span>
          </button>
        </div>
      </div>
    </div>
  `;

  container.querySelector('#short-prev-btn')?.addEventListener('click', () => {
    if (currentShortIndex > 0) {
      currentShortIndex--;
      renderCurrentShort(container);
    }
  });

  container.querySelector('#short-next-btn')?.addEventListener('click', () => {
    if (currentShortIndex < currentShorts.length - 1) {
      currentShortIndex++;
      renderCurrentShort(container);
    }
  });
}

export default renderShortsPage;
