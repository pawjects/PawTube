/**
 * PawTube - Home Page
 */

import { PipedApi } from '../../api/piped/pipedApi.js';
import { isAbortError } from '../../api/client/apiClient.js';
import { renderVideoCard, renderSkeletonCards, renderErrorState } from '../../components/video/videoCard.js';
import { getHistory } from '../../storage/history/historyStorage.js';
import { escapeHtml } from '../../utils/dom.js';

const CATEGORIES = ['All', 'Music', 'Gaming', 'News', 'Tech', 'Animation', 'Podcasts'];
let activeCategory = 'All';
let homeRenderSeq = 0;

export async function renderHomePage(container) {
  const currentSeq = ++homeRenderSeq;

  const history = getHistory();
  const continueWatching = history.slice(0, 4);

  let html = `
    <div class="category-bar">
      ${CATEGORIES.map((cat) => `
        <button class="category-chip ${cat === activeCategory ? 'active' : ''}" data-category="${escapeHtml(cat)}">
          ${escapeHtml(cat)}
        </button>
      `).join('')}
    </div>
  `;

  if (continueWatching.length > 0 && activeCategory === 'All') {
    html += `
      <div class="section-header">
        <h2 class="section-title">
          <span class="material-symbols-rounded">history</span>
          Continue Watching
        </h2>
      </div>
      <div class="continue-watching-rail">
        ${continueWatching.map((v) => `
          <div class="continue-card" onclick="window.location.hash='#/watch?v=${encodeURIComponent(v.id)}'">
            <div class="continue-thumb-wrap">
              <img src="${escapeHtml(v.thumb || '')}" alt="${escapeHtml(v.title)}" loading="lazy" />
              <div class="duration-badge">${escapeHtml(v.durationFormatted || '0:00')}</div>
            </div>
            <div class="card-title" style="font-size:13.5px;margin-top:6px;">${escapeHtml(v.title)}</div>
            <div class="card-channel" style="font-size:12px;">${escapeHtml(v.channel || v.author || '')}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  html += `
    <div class="section-header">
      <h2 class="section-title">
        <span class="material-symbols-rounded">${activeCategory === 'All' ? 'auto_awesome' : 'local_fire_department'}</span>
        ${activeCategory === 'All' ? 'Recommended for You' : escapeHtml(activeCategory)}
      </h2>
    </div>
    <div class="video-grid" id="home-grid">
      ${renderSkeletonCards(8)}
    </div>
  `;

  container.innerHTML = html;

  // Bind category chips
  container.querySelectorAll('.category-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      activeCategory = chip.getAttribute('data-category');
      renderHomePage(container);
    });
  });

  const grid = container.querySelector('#home-grid');
  if (!grid) return;

const FALLBACK_VIDEOS = [
  {
    id: 'dQw4w9WgXcQ',
    title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)',
    channel: 'Rick Astley',
    author: 'Rick Astley',
    channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
    thumb: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    duration: 213,
    durationFormatted: '3:33',
    views: 1500000000,
    viewsFormatted: '1.5B views',
    type: 'video'
  },
  {
    id: 'jfKfPfyJRdk',
    title: 'lofi hip hop radio 📚 - beats to relax/study to',
    channel: 'Lofi Girl',
    author: 'Lofi Girl',
    channelId: 'UCSJ4gkVC6NrvII8umztf0Ow',
    thumb: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
    duration: -1,
    durationFormatted: 'LIVE',
    views: 45000,
    viewsFormatted: '45K watching',
    isLive: true,
    type: 'video'
  },
  {
    id: 'JGwWNGJdvx8',
    title: 'Ed Sheeran - Shape of You (Official Music Video)',
    channel: 'Ed Sheeran',
    author: 'Ed Sheeran',
    channelId: 'UC0C-w0YjGpqDXGB8IHb662A',
    thumb: 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg',
    duration: 264,
    durationFormatted: '4:24',
    views: 6200000000,
    viewsFormatted: '6.2B views',
    type: 'video'
  },
  {
    id: '9bZkp7q19f0',
    title: 'PSY - GANGNAM STYLE(강남스타일) M/V',
    channel: 'officialpsy',
    author: 'officialpsy',
    channelId: 'UCrDkAvwZum-UTjHmzDI2iIw',
    thumb: 'https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg',
    duration: 253,
    durationFormatted: '4:13',
    views: 5100000000,
    viewsFormatted: '5.1B views',
    type: 'video'
  },
  {
    id: 'fJ9rUzIMcZQ',
    title: 'Queen - Bohemian Rhapsody (Official Video Remastered)',
    channel: 'Queen Official',
    author: 'Queen Official',
    channelId: 'UCiMhD4jzUqG-IgPzUmmytRQ',
    thumb: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg',
    duration: 360,
    durationFormatted: '6:00',
    views: 1700000000,
    viewsFormatted: '1.7B views',
    type: 'video'
  },
  {
    id: '2Vv-BfVoq4g',
    title: 'Ed Sheeran - Perfect (Official Music Video)',
    channel: 'Ed Sheeran',
    author: 'Ed Sheeran',
    channelId: 'UC0C-w0YjGpqDXGB8IHb662A',
    thumb: 'https://i.ytimg.com/vi/2Vv-BfVoq4g/hqdefault.jpg',
    duration: 280,
    durationFormatted: '4:40',
    views: 3700000000,
    viewsFormatted: '3.7B views',
    type: 'video'
  }
];

  try {
    let result;
    if (activeCategory === 'All') {
      result = await PipedApi.getTrending('US');
    } else {
      result = await PipedApi.search(activeCategory, 'all');
    }

    if (currentSeq !== homeRenderSeq) return;

    const items = result?.items || [];
    if (items.length === 0) {
      grid.innerHTML = FALLBACK_VIDEOS.map(renderVideoCard).join('');
      return;
    }

    grid.innerHTML = items.map(renderVideoCard).join('');
  } catch (err) {
    if (currentSeq !== homeRenderSeq || isAbortError(err)) return;
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('abort') || msg.includes('signal') || msg.includes('cancel')) return;

    console.warn('Home feed network unavailable, loading curated fallback:', err?.message || err);
    if (currentSeq === homeRenderSeq && grid) {
      grid.innerHTML = FALLBACK_VIDEOS.map(renderVideoCard).join('');
    }
  }
}

export default renderHomePage;
