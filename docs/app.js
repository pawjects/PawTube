/**
 * PawTube - PWA MD3 Edition with Complete Bug Fixes
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW setup failed', err));
  });
}

const STORAGE = { HISTORY: 'pawtube_history', SAVED: 'pawtube_saved', LIKED: 'pawtube_liked', DISLIKED: 'pawtube_disliked', SUBS: 'pawtube_subs' };
const FEED_QUERIES = [
  { q: 'tech reviews latest', category: 'Tech' },
  { q: 'coding tutorials', category: 'Education' },
  { q: 'lofi hip hop radio', category: 'Music' },
  { q: 'movie trailers 2026', category: 'Movies' },
  { q: 'gaming highlights', category: 'Gaming' }
];

let route = 'home';
let currentVideoId = null;
let apiBase = null;
let feedCache = [];
let feed = [];
let activeCategory = 'All';
let feedLoading = false;
let searchQuery = '';
let searchResults = [];

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function extractVideoId(raw) {
  const s = (raw || '').trim(); if (!s) return null;
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    if (u.hostname.includes('youtube.com')) {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/); if (m) return m[1];
    }
  } catch(_) {}
  return null;
}

function embedSrc(id) {
  if (!id) return '';
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&autoplay=1`;
}

// Data Store Layer
const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } },
  save(key, data) { localStorage.setItem(key, JSON.stringify(data)); },
  addHistory(id) {
    if (!id) return;
    let h = this.get(STORAGE.HISTORY).filter(x => x.id !== id);
    h.unshift({ id, ts: Date.now() });
    this.save(STORAGE.HISTORY, h.slice(0, 50));
  },
  removeHistory(id) {
    let h = this.get(STORAGE.HISTORY).filter(x => x.id !== id);
    this.save(STORAGE.HISTORY, h);
    showToast('Removed from History');
  },
  clearHistory() {
    this.save(STORAGE.HISTORY, []);
    showToast('History cleared');
  },
  toggleSaved(id) {
    if (!id) return;
    let s = this.get(STORAGE.SAVED);
    const idx = s.findIndex(x => x.id === id);
    if (idx >= 0) { s.splice(idx, 1); showToast('Removed from Watch Later'); }
    else { s.unshift({ id, ts: Date.now() }); showToast('Saved to Watch Later'); }
    this.save(STORAGE.SAVED, s.slice(0, 200));
  },
  isSaved(id) { return this.get(STORAGE.SAVED).some(x => x.id === id); },
  
  toggleLike(id) {
    if (!id) return;
    let l = this.get(STORAGE.LIKED);
    let d = this.get(STORAGE.DISLIKED).filter(x => x !== id);
    this.save(STORAGE.DISLIKED, d);
    const idx = l.indexOf(id);
    if (idx >= 0) { l.splice(idx, 1); showToast('Removed from Liked videos'); }
    else { l.push(id); showToast('Added to Liked videos'); }
    this.save(STORAGE.LIKED, l);
  },
  toggleDislike(id) {
    if (!id) return;
    let d = this.get(STORAGE.DISLIKED);
    let l = this.get(STORAGE.LIKED).filter(x => x !== id);
    this.save(STORAGE.LIKED, l);
    const idx = d.indexOf(id);
    if (idx >= 0) { d.splice(idx, 1); }
    else { d.push(id); showToast('Video disliked'); }
    this.save(STORAGE.DISLIKED, d);
  },
  isLiked(id) { return this.get(STORAGE.LIKED).includes(id); },
  isDisliked(id) { return this.get(STORAGE.DISLIKED).includes(id); },
  
  getSubs() { return this.get(STORAGE.SUBS); },
  isSubscribed(channelId) { return this.get(STORAGE.SUBS).some(s => s.id === channelId); },
  toggleSub(channel) {
    if (!channel || !channel.id) return;
    let subs = this.get(STORAGE.SUBS);
    const idx = subs.findIndex(s => s.id === channel.id);
    if (idx >= 0) { subs.splice(idx, 1); showToast('Unsubscribed'); }
    else { subs.unshift({ id: channel.id, name: channel.name, avatar: channel.avatar, subscribedAt: Date.now() }); showToast('Subscribed to ' + channel.name); }
    this.save(STORAGE.SUBS, subs);
    return subs;
  }
};

// Precise UI Updater for action buttons (prevents full iframe reload!)
function updateActionButtons() {
    if(route !== 'watch' || !currentVideoId) return;
    
    const liked = store.isLiked(currentVideoId);
    const disliked = store.isDisliked(currentVideoId);
    const saved = store.isSaved(currentVideoId);
    
    const likeBtn = document.querySelector('[data-action="like"]');
    const dislikeBtn = document.querySelector('[data-action="dislike"]');
    const saveBtn = document.querySelector('[data-action="save"]');
    
    if(likeBtn) {
        likeBtn.className = `pill-btn ${liked ? 'active-liked' : ''}`;
        likeBtn.innerHTML = `<span class="material-symbols-rounded ${liked ? 'filled-icon' : ''}">thumb_up</span>Like`;
    }
    if(dislikeBtn) {
        dislikeBtn.className = `pill-btn ${disliked ? 'active-liked' : ''}`;
        dislikeBtn.innerHTML = `<span class="material-symbols-rounded ${disliked ? 'filled-icon' : ''}">thumb_down</span>`;
    }
    if(saveBtn) {
        saveBtn.innerHTML = `<span class="material-symbols-rounded">${saved?'bookmark':'bookmark_add'}</span>${saved?'Saved':'Save'}`;
    }
}

// Share Feature Logic
function doShare() {
  if (!currentVideoId) { showToast('No video playing to share'); return; }
  const url = `${location.origin}${location.pathname}?v=${currentVideoId}#/watch`;
  
  if (navigator.share) {
    navigator.share({ title: 'PawTube', url: url })
      .then(() => showToast('Shared successfully!'))
      .catch(e => {
        fallbackShare(url);
      });
  } else {
    fallbackShare(url);
  }
}

function fallbackShare(url) {
  navigator.clipboard.writeText(url)
    .then(() => showToast('Watch link copied to clipboard!'))
    .catch(() => showToast('Failed to copy link.'));
}

// API Connection Layer
const API = {
  primary: 'https://piped.private.coffee',
  fallbacks: [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.in.projectsegfau.lt',
    'https://pipedapi.adminforge.de'
  ],
  unhealthy: new Set(),
  activeRequest: null,

  async getInstances() {
    return [this.primary, ...this.fallbacks].filter(url => !this.unhealthy.has(url));
  },

  markUnhealthy(url) {
    if (url === this.primary) return; // Keep primary but deprioritize
    this.unhealthy.add(url);
    setTimeout(() => this.unhealthy.delete(url), 5 * 60 * 1000); // 5 min cooldown
  },

  async request(path, options = {}) {
    const instances = await this.getInstances();
    let lastError = null;

    for (const api of instances) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || 8000);

      try {
        const response = await fetch(`${api}${path}`, {
          ...options,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status >= 500) {
            this.markUnhealthy(api);
          }
          throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.json();
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error;
        
        if (error.name !== 'AbortError' && !error.message.includes('HTTP 4')) {
           this.markUnhealthy(api);
        }
      }
    }
    throw lastError || new Error('All API instances unavailable');
  }
};

async function fetchPiped(path) {
  return API.request(path);
}

// Feed Manager
const feedManager = {
  lastRefresh: 0,
  isRefreshing: false,
  
  async loadFeed(force = false) {
    if (feedCache.length > 0 && !force && (Date.now() - this.lastRefresh < 15 * 60 * 1000)) return;
    if (this.isRefreshing) return;
    
    this.isRefreshing = true;
    feedLoading = true;
    render();
    
    try {
      const history = store.get(STORAGE.HISTORY).slice(0, 10);
      let queryBase = FEED_QUERIES;
      
      // Basic local personalization: add history items to search queries occasionally
      if (history.length > 0 && Math.random() > 0.5) {
        queryBase = [...FEED_QUERIES, { q: `related to video`, category: 'Recommended' }];
      }
      
      const results = await Promise.allSettled([
        fetchPiped('/trending?region=US'), // Get actual trending
        ...queryBase.map(q => fetchPiped(`/search?q=${encodeURIComponent(q.q)}&filter=videos`))
      ]);
      
      const deduped = new Map();
      
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          const items = r.value.items || Array.isArray(r.value) ? r.value : [];
          
          let cat = 'Trending';
          if (i > 0) cat = queryBase[i - 1].category;

          items.forEach(x => {
            const id = x.url ? (x.url.match(/v=([a-zA-Z0-9_-]{11})/) || [])[1] : (x.videoId || '');
            if (id && !deduped.has(id) && x.type === 'stream') {
               deduped.set(id, { ...x, id, _cat: cat });
            }
          });
        }
      });
      
      const combined = [...deduped.values()].map(x => ({
        id: x.id, 
        title: x.title, 
        channel: x.uploaderName, 
        channelId: (x.uploaderUrl||'').replace('/channel/',''),
        thumb: x.thumbnail, 
        avatar: x.uploaderAvatar,
        duration: x.duration, 
        views: x.views, 
        uploaded: x.uploaded || Date.now(), 
        cat: x._cat
      }));

      // Basic transparent scoring
      // Boost fresh content
      combined.forEach(item => {
        let score = 0;
        const historyIds = history.map(h => h.id);
        if (historyIds.includes(item.id)) score -= 50; // Penalty for recently watched
        if (item.cat === 'Trending') score += 10;
        
        // freshness (rough heuristic)
        if (typeof item.uploaded === 'number') {
           const ageDays = (Date.now() - item.uploaded) / (1000 * 60 * 60 * 24);
           if (ageDays < 7) score += 20;
        }
        item._score = score;
      });
      
      combined.sort((a, b) => b._score - a._score);
      
      feedCache = combined;
      this.lastRefresh = Date.now();
      
      feed = activeCategory === 'All' ? feedCache : feedCache.filter(x => x.cat === activeCategory);
    } catch(e) { 
      showToast('Could not load feed. Using offline cache if available.'); 
    } finally {
      this.isRefreshing = false;
      feedLoading = false; 
      render();
    }
  }
};

async function loadFeed(force = false) {
  return feedManager.loadFeed(force);
}

// Search Logic
function scoreResult(item, q) {
  const query = q.toLowerCase();
  const title = String(item.title||'').toLowerCase();
  const channel = String(item.channel||'').toLowerCase();
  let score = 0;
  if (title === query) score += 120;
  if (title.startsWith(query)) score += 80;
  if (title.includes(query)) score += 45;
  const terms = query.split(/\s+/).filter(Boolean);
  score += terms.filter(t => title.includes(t)).length * 12;
  if (channel.includes(query)) score += 8;
  return score;
}

const searchManager = {
  controller: null,
  isSearching: false,
  cache: new Map(),

  async runSearch(query) {
    if (this.controller) this.controller.abort();
    this.controller = new AbortController();
    
    if (!query) { searchResults = []; render(); return; }
    
    // Check cache
    if (this.cache.has(query)) {
      searchResults = this.cache.get(query);
      render();
      return;
    }

    this.isSearching = true;
    feedLoading = true;
    render();

    try {
      const [rel, recent] = await Promise.allSettled([
        API.request(`/search?q=${encodeURIComponent(query)}&filter=videos`, { signal: this.controller.signal }),
        API.request(`/search?q=${encodeURIComponent(query)}&filter=videos&sort_by=upload_date`, { signal: this.controller.signal })
      ]);

      const all = [];
      for (const r of [rel, recent]) {
        if (r.status === 'fulfilled') {
          const items = Array.isArray(r.value) ? r.value : (r.value?.items || []);
          all.push(...items);
        }
      }

      const deduped = new Map();
      for (const x of all) {
        const id = (x.url || '').match(/v=([a-zA-Z0-9_-]{11})/)?.[1];
        if (!id || deduped.has(id)) continue;
        deduped.set(id, x);
      }

      const results = [...deduped.values()].map(x => ({
        id: (x.url || '').match(/v=([a-zA-Z0-9_-]{11})/)?.[1],
        title: x.title || 'Untitled',
        channel: x.uploaderName || 'Unknown',
        channelId: (x.uploaderUrl||'').replace('/channel/',''),
        thumb: x.thumbnail || '',
        avatar: x.uploaderAvatar || '',
        duration: x.duration || 0,
        views: x.views || 0,
        uploaded: x.uploaded || Date.now()
      })).filter(x => x.id).sort((a,b) => scoreResult(b, query) - scoreResult(a, query)).slice(0,24);
      
      this.cache.set(query, results);
      searchResults = results;
    } catch(err) {
      if (err.name !== 'AbortError') {
        showToast('Search unavailable');
        searchResults = [];
      }
    } finally {
      if (this.controller && !this.controller.signal.aborted) {
         this.isSearching = false;
         feedLoading = false;
         render();
      }
    }
  }
};

async function runSearch(q) {
  const query = (q || '').trim();
  searchQuery = query;
  
  const pastedId = extractVideoId(query);
  if (pastedId) {
    currentVideoId = pastedId;
    store.addHistory(pastedId);
    history.pushState(null, '', `?v=${pastedId}#/watch`);
    location.hash = '#/watch';
    $('#header').classList.remove('search-active');
    render();
    return;
  }
  
  return searchManager.runSearch(query);
}

// Formatting Helpers
function esc(s) { return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtViews(n) {
  if (!n) return '';
  if (n >= 1e9) return (n/1e9).toFixed(1)+'B views';
  if (n >= 1e6) return (n/1e6).toFixed(1)+'M views';
  if (n >= 1e3) return (n/1e3).toFixed(0)+'K views';
  return n + ' views';
}
function timeAgo(ts) {
  const diff = Date.now() - Number(ts); if (diff < 0 || !ts) return '';
  const m = Math.floor(diff/60000); if (m < 60) return m+'m ago';
  const h = Math.floor(m/60); if (h < 24) return h+'h ago';
  const d = Math.floor(h/24); if (d < 30) return d+'d ago';
  const mo = Math.floor(d/30); if (mo < 12) return mo+'mo ago';
  return Math.floor(mo/12)+'y ago';
}
function fmtDuration(s) {
  if (!s) return '';
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sc = Math.floor(s%60);
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}` : `${m}:${String(sc).padStart(2,'0')}`;
}

// Render Templates
function renderVideo(v, isCompact) {
  const saved = store.isSaved(v.id);
  const dur = fmtDuration(v.duration);
  const meta = [fmtViews(v.views), timeAgo(v.uploaded)].filter(Boolean).join(' • ');
  const sBtn = `<button class="save-btn ${saved?'saved':''}" data-action="save" data-id="${v.id}"><span class="material-symbols-rounded">${saved?'bookmark':'bookmark_add'}</span></button>`;
  const thumb = v.thumb || `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
  
  if (isCompact) {
    return `<div class="related-card" data-id="${v.id}" data-action="play">
      <div class="related-thumb"><img src="${thumb}" loading="lazy">${dur?`<span class="duration-badge">${dur}</span>`:''}${sBtn}</div>
      <div class="related-meta"><div class="related-title-text">${esc(v.title)}</div><div class="related-channel">${esc(v.channel)}<br>${meta}</div></div>
    </div>`;
  }
  
  return `<div class="video-card" data-id="${v.id}" data-action="play">
    <div class="thumbnail-wrap"><img src="${thumb}" loading="lazy">${dur?`<span class="duration-badge">${dur}</span>`:''}${sBtn}</div>
    <div class="card-info">
      <div class="channel-avatar">${v.avatar ? `<img src="${v.avatar}">` : ''}</div>
      <div class="card-meta">
        <div class="card-title">${esc(v.title)}</div>
        <div class="card-channel">${esc(v.channel)}</div>
        <div class="card-extra">${meta}</div>
      </div>
    </div>
  </div>`;
}

function getSkeletonGrid(count = 12) {
  return `<div class="skel-grid">
    ${Array(count).fill(0).map(() => `
      <div class="skel-video-card">
        <div class="skeleton skel-thumb"></div>
        <div class="skel-card-info">
          <div class="skeleton skel-avatar"></div>
          <div class="skel-card-meta">
            <div class="skeleton skel-title"></div>
            <div class="skeleton skel-text"></div>
            <div class="skeleton skel-text short"></div>
          </div>
        </div>
      </div>
    `).join('')}
  </div>`;
}

function viewHome() {
  const cats = ['All', 'Tech', 'Education', 'Music', 'Movies', 'Gaming'];
  const catHtml = `<div class="category-bar">${cats.map(c => `<button class="category-chip ${activeCategory === c ? 'active':''}" data-action="cat" data-val="${c}">${c}</button>`).join('')}</div>`;
  
  const searchHtml = window.innerWidth > 600 ? `<div class="search-section"><div class="search-row">
    <input type="text" id="home-search" class="search-input" placeholder="Search videos or paste YouTube link..." value="${esc(searchQuery)}" autocomplete="off"/>
    <button class="btn-primary" data-action="run-search-home"><span class="material-symbols-rounded" style="font-size:20px">search</span>Search</button>
  </div></div>` : '';
  
  if (searchQuery) {
    const resultsHtml = feedLoading 
      ? `<h2 class="section-title" style="margin-bottom:16px; font-size:18px;">Searching...</h2>` + getSkeletonGrid(8)
      : `<h2 class="section-title" style="margin-bottom:16px; font-size:18px;">Search Results for "${esc(searchQuery)}"</h2>
         <div class="video-grid" style="margin-bottom: 32px;">${searchResults.map(r => renderVideo(r)).join('')}</div>
         <h2 class="section-title" style="margin-bottom:16px; font-size:18px;">Suggested</h2>`;
         
    const feedHtml = feedLoading ? '' : `<div class="video-grid">${feed.map(f => renderVideo(f)).join('')}</div>`;
    return `<div>${searchHtml}${catHtml}${resultsHtml}${feedHtml}</div>`;
  } else {
    let content = feedLoading ? getSkeletonGrid(12) : `<div class="video-grid">${feed.map(f => renderVideo(f)).join('')}</div>`;
    return `<div>${searchHtml}${catHtml}${content}</div>`;
  }
}

let watchLoading = false;
let watchDetailsCache = new Map();

async function fetchVideoDetails(id) {
  if (watchDetailsCache.has(id)) return watchDetailsCache.get(id);
  try {
    const data = await API.request(`/streams/${id}`);
    const details = {
      id: id,
      title: data.title,
      channel: data.uploader,
      channelId: (data.uploaderUrl||'').replace('/channel/',''),
      avatar: data.uploaderAvatar,
      views: data.views,
      uploaded: data.uploadDate,
      description: data.description || '',
      related: (data.relatedStreams || []).map(x => ({
        id: (x.url || '').match(/v=([a-zA-Z0-9_-]{11})/)?.[1] || x.videoId,
        title: x.title,
        channel: x.uploaderName,
        thumb: x.thumbnail,
        duration: x.duration,
        views: x.views,
        uploaded: x.uploaded
      })).filter(x => x.id).slice(0, 15)
    };
    watchDetailsCache.set(id, details);
    return details;
  } catch (err) {
    return null;
  }
}

function viewWatch() {
  if (!currentVideoId) {
    return `<div class="watch-page"><div class="watch-layout">
      <div class="player-section" style="height: 60vh; display: flex; flex-direction: column; align-items: center; justify-content: center;">
         <span class="material-symbols-rounded" style="font-size:80px; color:var(--text-disabled); margin-bottom: 16px;">smart_display</span>
         <h2 style="margin-bottom: 24px; color: var(--text-secondary);">Enter a video link to start watching</h2>
         <div class="search-row" style="width: 100%; max-width: 500px; display:flex;">
            <input type="text" id="watch-input" class="search-input" placeholder="Paste YouTube link or ID..." autocomplete="off"/>
            <button class="btn-primary" data-action="play-input"><span class="material-symbols-rounded" style="font-size:20px">play_arrow</span>Play</button>
         </div>
      </div>
    </div></div>`;
  }

  const cachedMeta = feedCache.find(f => f.id === currentVideoId) || searchResults.find(r => r.id === currentVideoId);
  const meta = watchDetailsCache.get(currentVideoId) || cachedMeta || { title: 'Loading details...', channel: 'Loading...', loading: true };
  
  if (meta.loading && !watchLoading) {
    watchLoading = true;
    fetchVideoDetails(currentVideoId).then(details => {
      watchLoading = false;
      if (details) render();
    }).catch(() => { watchLoading = false; });
  }

  const saved = store.isSaved(currentVideoId);
  const liked = store.isLiked(currentVideoId);
  const disliked = store.isDisliked(currentVideoId);
  
  const relatedVideos = meta.related || feedCache.filter(f => f.id !== currentVideoId).slice(0, 15);
  
  return `<div class="watch-page"><div class="watch-layout">
    <div class="player-section">
      <div class="player-container">
        <iframe src="${embedSrc(currentVideoId)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
      </div>
      <div class="video-details">
        <h1 class="video-title">${esc(meta.title)}</h1>
        <div class="watch-actions-bar">
          <div class="watch-channel-info">
            <div class="watch-channel-avatar">${meta.avatar ? `<img src="${meta.avatar}">`:''}</div>
            <div class="watch-channel-text">
              <span class="w-channel-name">${esc(meta.channel)}</span>
              <span class="w-channel-subs">Verified Stream</span>
            </div>
            <button class="btn-subscribe" data-channel-id="${esc(meta.channelId || meta.channel)}" data-channel-name="${esc(meta.channel)}" data-channel-avatar="${esc(meta.avatar || '')}">${store.isSubscribed(meta.channelId || meta.channel) ? 'Subscribed' : 'Subscribe'}</button>
          </div>
          <div class="watch-action-buttons">
            <div class="pill-group">
              <button class="pill-btn ${liked ? 'active-liked' : ''}" data-action="like">
                <span class="material-symbols-rounded ${liked ? 'filled-icon' : ''}">thumb_up</span>Like
              </button>
              <div class="pill-divider"></div>
              <button class="pill-btn ${disliked ? 'active-liked' : ''}" data-action="dislike">
                <span class="material-symbols-rounded ${disliked ? 'filled-icon' : ''}">thumb_down</span>
              </button>
            </div>
            <button class="pill-btn" data-action="share"><span class="material-symbols-rounded">share</span>Share</button>
            <button class="pill-btn" data-action="save" data-id="${currentVideoId}"><span class="material-symbols-rounded">${saved?'bookmark':'bookmark_add'}</span>${saved?'Saved':'Save'}</button>
          </div>
        </div>
        <div class="video-description">
          <p><strong>${fmtViews(meta.views || 4500)} ${meta.uploaded ? `• ${timeAgo(meta.uploaded) || meta.uploaded}` : ''}</strong></p>
          <p style="margin-top:8px; white-space: pre-wrap; word-break: break-word;">${meta.description ? esc(meta.description.substring(0, 300)) + (meta.description.length > 300 ? '...' : '') : 'Clean, tracker-free player presentation on PawTube frontend environment.'}</p>
        </div>
      </div>
    </div>
    <div class="related-section">
      ${watchLoading && !meta.related ? getSkeletonGrid(6) : relatedVideos.map(s => renderVideo(s, true)).join('')}
    </div>
  </div></div>`;
}

function viewHistory() {
  const historyData = store.get(STORAGE.HISTORY);
  const items = historyData.map(h => {
    let f = feedCache.find(x => x.id === h.id) || searchResults.find(r => r.id === h.id) || watchDetailsCache.get(h.id) || { title: `Video ${h.id}`, channel: 'Playback History', id: h.id };
    const rendered = renderVideo(f, true);
    // Inject remove button into the related-card
    return rendered.replace('</div>\n    </div>', `<button class="icon-btn" style="position:absolute; right:8px; top:8px; width:32px; height:32px; background:rgba(0,0,0,0.6);" data-action="remove-history" data-id="${f.id}"><span class="material-symbols-rounded" style="font-size:18px;">close</span></button></div>\n    </div>`).replace('class="related-card"', 'class="related-card" style="position:relative;"');
  });
  if (!items.length) return `<div class="empty-state"><span class="material-symbols-rounded">history</span><h2>Keep track of what you watch</h2><p style="margin-top:8px">Your local history buffer is currently blank.</p></div>`;
  return `<div>
    <div class="section-header">
      <h1 class="section-title">Watch History</h1>
      <button class="pill-btn" data-action="clear-history" style="height:32px; font-size:13px; color:var(--text-secondary);"><span class="material-symbols-rounded" style="font-size:18px;">delete</span>Clear all</button>
    </div>
    <div class="related-list" style="max-width:800px">${items.join('')}</div>
  </div>`;
}

let subsChannelVideos = {};
let subsLoading = false;
let activeChannelFetches = new Map();

async function fetchChannelVideos(channelId) {
  if (subsChannelVideos[channelId]) return subsChannelVideos[channelId];
  if (activeChannelFetches.has(channelId)) return activeChannelFetches.get(channelId);
  
  const sub = store.getSubs().find(s => s.id === channelId);
  if (!sub) return [];
  
  const fetchPromise = (async () => {
    try {
      const data = await API.request(`/search?q=${encodeURIComponent(sub.name)}&filter=videos`);
      const items = (data.items || []).map(x => {
        const id = (x.url || '').match(/v=([a-zA-Z0-9_-]{11})/)?.[1];
        const xChannelId = (x.uploaderUrl||'').replace('/channel/','');
        if (!id || xChannelId !== channelId) return null;
        return { id, title: x.title, channel: x.uploaderName, channelId: xChannelId, thumb: x.thumbnail, avatar: x.uploaderAvatar, duration: x.duration, views: x.views, uploaded: x.uploaded };
      }).filter(Boolean);
      subsChannelVideos[channelId] = items;
      return items;
    } catch { 
      return []; 
    } finally {
      activeChannelFetches.delete(channelId);
    }
  })();
  
  activeChannelFetches.set(channelId, fetchPromise);
  return fetchPromise;
}

function viewSubscriptions() {
  const subs = store.getSubs();
  if (!subs.length) {
    return `<div class="empty-state"><span class="material-symbols-rounded">subscriptions</span><h2>No subscriptions yet</h2><p style="margin-top:8px">Subscribe to channels from the watch page to see their videos here.</p></div>`;
  }
  
  const subsGrid = subs.map(s => `
    <div class="subs-card" data-action="sub-channel" data-channel-id="${esc(s.id)}">
      <img class="subs-avatar" src="${s.avatar || 'https://i.ytimg.com/vi/placeholder/mqdefault.jpg'}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><circle cx=%2250%22 cy=%2250%22 r=%2248%22 fill=%22%23555%22/><text x=%2250%22 y=%2255%22 text-anchor=%22middle%22 fill=%22%23fff%22 font-size=%2230%22 font-family=%22sans-serif%22>${esc(s.name[0])}</text></svg>'">
      <div class="subs-name">${esc(s.name)}</div>
      <button class="subs-unsub" data-action="unsub" data-channel-id="${esc(s.id)}">Unsubscribe</button>
    </div>
  `).join('');
  
  const allVideos = subs.map(s => subsChannelVideos[s.id] || []).flat();
  const videosHtml = allVideos.length 
    ? `<h2 class="section-title" style="margin-bottom:16px;font-size:18px;">Latest from Subscriptions</h2>
       <div class="video-grid">${allVideos.map(v => renderVideo(v)).join('')}</div>`
    : subsLoading 
      ? `<h2 class="section-title" style="margin-bottom:16px;font-size:18px;">Latest from Subscriptions</h2>` + getSkeletonGrid(8)
      : '<div class="empty-state" style="padding:40px;"><span class="material-symbols-rounded">movie</span><h2>No recent videos</h2><p style="margin-top:8px">Channels you subscribed to haven\'t posted anything recently.</p></div>';
  
  return `<div>
    <div class="subs-header"><span class="material-symbols-rounded">subscriptions</span><h1 class="section-title" style="font-size:22px;">Subscriptions</h1></div>
    <div class="subs-grid">${subsGrid}</div>
    ${videosHtml}
  </div>`;
}

function viewSaved() {
  const items = store.get(STORAGE.SAVED).map(h => {
    let f = feedCache.find(x => x.id === h.id) || searchResults.find(r => r.id === h.id) || watchDetailsCache.get(h.id) || { title: `Video ${h.id}`, channel: 'Saved Reference', id: h.id };
    return renderVideo(f, true);
  });
  if (!items.length) return `<div class="empty-state"><span class="material-symbols-rounded">bookmark</span><h2>No saved videos</h2><p style="margin-top:8px">Bookmark links to access later on demand.</p></div>`;
  return `<div><h1 class="section-title" style="margin-bottom:24px">Watch Later</h1><div class="related-list" style="max-width:800px">${items.join('')}</div></div>`;
}

function render() {
  const h = location.hash.replace('#', '') || '/home';
  route = ['home','watch','history','saved','subscriptions'].includes(h.slice(1)) ? h.slice(1) : 'home';
  
  $$('.nav-item, .bnav-item').forEach(el => el.classList.remove('active'));
  $$(`[data-route="/${route}"]`).forEach(el => el.classList.add('active'));
  
  const main = $('#main-content');
  if(route === 'home') { main.innerHTML = viewHome(); }
  else if(route === 'watch') { main.innerHTML = viewWatch(); }
  else if(route === 'history') { main.innerHTML = viewHistory(); }
  else if(route === 'saved') { main.innerHTML = viewSaved(); }
  else if(route === 'subscriptions') { 
    main.innerHTML = viewSubscriptions();
    if (!subsLoading && store.getSubs().length) {
      subsLoading = true;
      Promise.all(store.getSubs().map(s => fetchChannelVideos(s.id)))
        .then(() => { subsLoading = false; render(); })
        .catch(() => { subsLoading = false; });
    }
  }
  
  const hs = $('#header-search');
  if (hs && document.activeElement !== hs) hs.value = searchQuery;
}

let toastTimer;
function showToast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

// Global Event Coordinator
document.addEventListener('click', e => {
  const target = e.target;
  
  // Route Navigation Clicking
  const routeEl = target.closest('[data-route]');
  if (routeEl) { location.hash = routeEl.dataset.route; return; }
  
  // Proper Subscription Logic
  if (target.closest('.btn-subscribe')) {
    const btn = target.closest('.btn-subscribe');
    const channelId = btn.dataset.channelId;
    const channelName = btn.dataset.channelName;
    const channelAvatar = btn.dataset.channelAvatar;
    if (channelId) {
      store.toggleSub({ id: channelId, name: channelName, avatar: channelAvatar });
      const isSubbed = store.isSubscribed(channelId);
      btn.textContent = isSubbed ? 'Subscribed' : 'Subscribe';
      btn.className = `btn-subscribe ${isSubbed ? 'subscribed-label' : ''}`;
    }
    return;
  }
  
  // Custom Hook Functional Pipeline Actions
  const actionEl = target.closest('[data-action]');
  if (actionEl) {
    const act = actionEl.dataset.action;
    const id = actionEl.dataset.id || actionEl.closest('.video-card, .related-card')?.dataset.id;
    
    if (act === 'cat') { activeCategory = actionEl.dataset.val; feed = activeCategory === 'All' ? feedCache : feedCache.filter(x => x.cat === activeCategory); render(); }
    
    if (act === 'play' && id) { 
        currentVideoId = id; 
        store.addHistory(id); 
        history.pushState(null, '', `?v=${id}#/watch`);
        location.hash = '#/watch'; 
        render(); 
    }
    
    if (act === 'save' && id) { 
        e.stopPropagation(); e.preventDefault(); 
        store.toggleSaved(id); 
        updateActionButtons();
        // Also update standard card UI to avoid full render loop
        document.querySelectorAll(`.save-btn[data-id="${id}"]`).forEach(btn => {
            const isSaved = store.isSaved(id);
            btn.className = `save-btn ${isSaved ? 'saved' : ''}`;
            btn.innerHTML = `<span class="material-symbols-rounded">${isSaved ? 'bookmark' : 'bookmark_add'}</span>`;
        });
    }
    
    if (act === 'share' && currentVideoId) { e.stopPropagation(); doShare(); }
    if (act === 'like' && currentVideoId) { e.stopPropagation(); store.toggleLike(currentVideoId); updateActionButtons(); }
    if (act === 'dislike' && currentVideoId) { e.stopPropagation(); store.toggleDislike(currentVideoId); updateActionButtons(); }
    
    if (act === 'remove-history') {
      e.stopPropagation();
      if (id) {
        store.removeHistory(id);
        render();
      }
    }
    
    if (act === 'clear-history') {
      e.stopPropagation();
      store.clearHistory();
      render();
    }
    
    if (act === 'unsub') {
      e.stopPropagation();
      const chId = actionEl.dataset.channelId;
      if (chId) {
        const subs = store.getSubs();
        const sub = subs.find(s => s.id === chId);
        if (sub) store.toggleSub(sub);
        render();
      }
    }
    
    if (act === 'sub-channel') {
      const chId = actionEl.dataset.channelId;
      if (chId) {
        location.hash = '#/subscriptions';
        render();
      }
    }
    
    if (act === 'run-search-home') {
        const q = $('#home-search')?.value;
        if (q) runSearch(q);
    }
    
    if (act === 'play-input') {
        const q = $('#watch-input')?.value;
        const vid = extractVideoId(q);
        if (vid) {
            currentVideoId = vid;
            store.addHistory(vid);
            history.pushState(null, '', `?v=${vid}#/watch`);
            location.hash = '#/watch';
            render();
        } else if (q) {
            location.hash = '#/home';
            runSearch(q);
        } else {
            showToast('Please enter a valid link or ID');
        }
    }
  }
});

// App Layout Menu Toggles
$('#menu-btn')?.addEventListener('click', () => {
  if (window.innerWidth > 1300) {
    $('#sidebar').style.transform = $('#sidebar').style.transform === 'translateX(-100%)' ? 'translateX(0)' : 'translateX(-100%)';
    $('#main-content').style.marginLeft = $('#sidebar').style.transform === 'translateX(-100%)' ? 'var(--mini-sidebar-width)' : 'var(--sidebar-width)';
  } else {
    $('#sidebar').style.transform = 'translateX(0)';
    $('#sidebar-overlay').classList.add('show');
  }
});
$('#sidebar-overlay')?.addEventListener('click', () => {
  $('#sidebar').style.transform = 'translateX(-100%)';
  $('#sidebar-overlay').classList.remove('show');
});

// Search overlay controller hooks
$$('.mobile-search-trigger').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    $('#header').classList.add('search-active');
    setTimeout(() => $('#header-search').focus(), 100);
  });
});
$('#mobile-search-back')?.addEventListener('click', () => {
  $('#header').classList.remove('search-active');
});

// Debounced typing listener to restore smooth live searching
let searchDebounceTimer;
$('#header-search')?.addEventListener('input', e => {
  searchQuery = e.target.value;
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    const q = e.target.value.trim();
    if (q) {
      location.hash = '#/home';
      runSearch(q);
    } else {
      searchResults = [];
      render();
    }
  }, 500);
});

// Using form submission to natively support mobile keyboard Search/Go buttons
$('#search-form')?.addEventListener('submit', e => {
  e.preventDefault();
  const q = $('#header-search').value.trim();
  if (window.innerWidth <= 600) $('#header').classList.remove('search-active');
  location.hash = '#/home';
  runSearch(q);
});

// Handle standalone inputs globally
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    if (e.target?.id === 'watch-input' || e.target?.id === 'home-search') {
      e.preventDefault();
      const q = e.target.value.trim();
      const vid = extractVideoId(q);
      if (vid) {
        currentVideoId = vid;
        store.addHistory(vid);
        history.pushState(null, '', `?v=${vid}#/watch`);
        location.hash = '#/watch';
        render();
      } else if (q) {
        location.hash = '#/home';
        runSearch(q);
      }
    }
  }
});

// Passive Mock Button Toasts
$('#voice-btn')?.addEventListener('click', () => showToast('Voice search ready...'));

// About Button - show info toast
$('#about-btn')?.addEventListener('click', () => showToast('PawTube v2.0 - Privacy-focused YouTube client'));

window.addEventListener('hashchange', () => { 
  window.scrollTo(0,0); 
  const v = new URLSearchParams(location.search).get('v');
  if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) currentVideoId = v;
  render(); 
});

function init() {
  const v = new URLSearchParams(location.search).get('v');
  if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) currentVideoId = v;
  render();
  loadFeed();
}

document.addEventListener('DOMContentLoaded', init);