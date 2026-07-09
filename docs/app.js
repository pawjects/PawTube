/**
 * PawTube - PWA MD3 Edition with Complete Bug Fixes
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW setup failed', err));
  });
}

const STORAGE = { HISTORY: 'pawtube_history', SAVED: 'pawtube_saved', LIKED: 'pawtube_liked', DISLIKED: 'pawtube_disliked' };
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
  isDisliked(id) { return this.get(STORAGE.DISLIKED).includes(id); }
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
async function fetchPiped(path) {
  try {
    const res = await fetch('https://piped-instances.kavin.rocks/');
    const instances = await res.json();
    const candidates = instances.filter(x => x.api_url && x.uptime_24h > 80).sort((a,b) => b.uptime_24h - a.uptime_24h).slice(0,4).map(x => x.api_url);
    if (apiBase) candidates.unshift(apiBase);
    
    for (const api of [...new Set(candidates)]) {
      try {
        const c = new AbortController(); setTimeout(() => c.abort(), 8000);
        const r = await fetch(`${api}${path}`, { signal: c.signal });
        if (r.ok) { apiBase = api; return await r.json(); }
      } catch(e) {}
    }
    throw new Error('API down');
  } catch(e) { throw e; }
}

async function loadFeed() {
  if (feedCache.length) return;
  feedLoading = true; render();
  try {
    const results = await Promise.allSettled(FEED_QUERIES.map(q => fetchPiped(`/search?q=${encodeURIComponent(q.q)}&filter=videos`)));
    const deduped = new Map();
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        (r.value.items || []).forEach(x => {
          const id = (x.url || '').match(/v=([a-zA-Z0-9_-]{11})/)?.[1];
          if (id && !deduped.has(id)) deduped.set(id, { ...x, id, _cat: FEED_QUERIES[i].category });
        });
      }
    });
    feedCache = [...deduped.values()].map(x => ({
      id: x.id, title: x.title, channel: x.uploaderName,
      thumb: x.thumbnail, avatar: x.uploaderAvatar,
      duration: x.duration, views: x.views, uploaded: x.uploaded, cat: x._cat
    }));
    feed = activeCategory === 'All' ? feedCache : feedCache.filter(x => x.cat === activeCategory);
  } catch(e) { showToast('Could not load feed'); }
  feedLoading = false; render();
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

async function runSearch(q) {
  const query = (q || '').trim();
  searchQuery = query;
  if (!query) { searchResults = []; render(); return; }
  
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
  
  feedLoading = true; render();
  try {
    const [rel, recent] = await Promise.allSettled([
      fetchPiped(`/search?q=${encodeURIComponent(query)}&filter=videos`),
      fetchPiped(`/search?q=${encodeURIComponent(query)}&filter=videos&sort_by=upload_date`)
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
    searchResults = [...deduped.values()].map(x => ({
      id: (x.url || '').match(/v=([a-zA-Z0-9_-]{11})/)?.[1],
      title: x.title || 'Untitled',
      channel: x.uploaderName || 'Unknown',
      thumb: x.thumbnail || '',
      avatar: x.uploaderAvatar || '',
      duration: x.duration || 0,
      views: x.views || 0,
      uploaded: x.uploaded || Date.now()
    })).filter(x => x.id).sort((a,b) => scoreResult(b, query) - scoreResult(a, query)).slice(0,24);
  } catch(_) {
    showToast('Search unavailable');
    searchResults = [];
  } finally {
    feedLoading = false;
    render();
  }
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

function viewHome() {
  const cats = ['All', 'Tech', 'Education', 'Music', 'Movies', 'Gaming'];
  const catHtml = `<div class="category-bar">${cats.map(c => `<button class="category-chip ${activeCategory === c ? 'active':''}" data-action="cat" data-val="${c}">${c}</button>`).join('')}</div>`;
  
  const searchHtml = window.innerWidth > 600 ? `<div class="search-section"><div class="search-row">
    <input type="text" id="home-search" class="search-input" placeholder="Search videos or paste YouTube link..." value="${esc(searchQuery)}" autocomplete="off"/>
    <button class="btn-primary" data-action="run-search-home"><span class="material-symbols-rounded" style="font-size:20px">search</span>Search</button>
  </div></div>` : '';
  
  if (searchQuery) {
    const resultsHtml = feedLoading 
      ? '<div style="padding:40px;text-align:center;">Searching...</div>'
      : `<h2 class="section-title" style="margin-bottom:16px; font-size:18px;">Search Results for "${esc(searchQuery)}"</h2>
         <div class="video-grid" style="margin-bottom: 32px;">${searchResults.map(r => renderVideo(r)).join('')}</div>
         <h2 class="section-title" style="margin-bottom:16px; font-size:18px;">Suggested</h2>`;
         
    const feedHtml = feedLoading ? '' : `<div class="video-grid">${feed.map(f => renderVideo(f)).join('')}</div>`;
    return `<div>${searchHtml}${catHtml}${resultsHtml}${feedHtml}</div>`;
  } else {
    let content = feedLoading ? '<div style="padding:40px;text-align:center;">Loading...</div>' : `<div class="video-grid">${feed.map(f => renderVideo(f)).join('')}</div>`;
    return `<div>${searchHtml}${catHtml}${content}</div>`;
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

  const meta = feedCache.find(f => f.id === currentVideoId) || searchResults.find(r => r.id === currentVideoId) || { title: 'Video Details', channel: 'YouTube Curated' };
  const saved = store.isSaved(currentVideoId);
  const liked = store.isLiked(currentVideoId);
  const disliked = store.isDisliked(currentVideoId);
  const suggestions = feedCache.filter(f => f.id !== currentVideoId).slice(0, 15);
  
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
            <button class="btn-subscribe">Subscribe</button>
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
          <p><strong>${fmtViews(meta.views || 4500)} • ${timeAgo(meta.uploaded) || 'Just now'}</strong></p>
          <p style="margin-top:8px">Clean, tracker-free player presentation on PawTube frontend environment.</p>
        </div>
      </div>
    </div>
    <div class="related-section">
      ${suggestions.map(s => renderVideo(s, true)).join('')}
    </div>
  </div></div>`;
}

function viewHistory() {
  const items = store.get(STORAGE.HISTORY).map(h => {
    let f = feedCache.find(x => x.id === h.id) || searchResults.find(r => r.id === h.id) || { title: `Video ${h.id}`, channel: 'Playback History', id: h.id };
    return renderVideo(f, true);
  });
  if (!items.length) return `<div class="empty-state"><span class="material-symbols-rounded">history</span><h2>Keep track of what you watch</h2><p style="margin-top:8px">Your local history buffer is currently blank.</p></div>`;
  return `<div><h1 class="section-title" style="margin-bottom:24px">Watch History</h1><div class="related-list" style="max-width:800px">${items.join('')}</div></div>`;
}

function viewSaved() {
  const items = store.get(STORAGE.SAVED).map(h => {
    let f = feedCache.find(x => x.id === h.id) || searchResults.find(r => r.id === h.id) || { title: `Video ${h.id}`, channel: 'Saved Reference', id: h.id };
    return renderVideo(f, true);
  });
  if (!items.length) return `<div class="empty-state"><span class="material-symbols-rounded">bookmark</span><h2>No saved videos</h2><p style="margin-top:8px">Bookmark links to access later on demand.</p></div>`;
  return `<div><h1 class="section-title" style="margin-bottom:24px">Watch Later</h1><div class="related-list" style="max-width:800px">${items.join('')}</div></div>`;
}

function render() {
  const h = location.hash.replace('#', '') || '/home';
  route = ['home','watch','history','saved'].includes(h.slice(1)) ? h.slice(1) : 'home';
  
  $$('[data-route]').forEach(el => el.classList.toggle('active', el.dataset.route === '/'+route));
  
  const main = $('#main-content');
  if(route === 'home') main.innerHTML = viewHome();
  else if(route === 'watch') main.innerHTML = viewWatch();
  else if(route === 'history') main.innerHTML = viewHistory();
  else if(route === 'saved') main.innerHTML = viewSaved();
  
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
  
  // Mockup Subscriptions Utility Action
  if (target.closest('.btn-subscribe')) {
    const btn = target.closest('.btn-subscribe');
    if (btn.textContent === 'Subscribe') {
      btn.textContent = 'Subscribed';
      btn.style.background = 'var(--bg-hover)';
      btn.style.color = 'var(--text-primary)';
      showToast('Subscribed to content updates');
    } else {
      btn.textContent = 'Subscribe';
      btn.style.background = 'var(--text-primary)';
      btn.style.color = 'var(--bg-primary)';
      showToast('Unsubscribed');
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
$('#voice-btn')?.addEventListener('click', () => showToast('Voice activation audio interface ready...'));
$('#create-btn')?.addEventListener('click', () => showToast('Creator dashboard is coming soon!'));
$('#notif-btn')?.addEventListener('click', () => showToast('No new activity notifications.'));

// About System Modal Controllers
$('#about-btn')?.addEventListener('click', () => $('#about-modal').classList.add('show'));
$('#modal-close')?.addEventListener('click', () => $('#about-modal').classList.remove('show'));
$('#about-modal')?.addEventListener('click', (e) => { if (e.target.id === 'about-modal') $('#about-modal').classList.remove('show'); });

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