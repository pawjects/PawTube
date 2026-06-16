/**
 * PawTube - Curated Feed + Watch Later Edition
 */

const STORAGE = { HISTORY: 'pawtube_history', SAVED: 'pawtube_saved' };
const FEED_REGION = 'IN';
const SUGGESTED = ['dQw4w9WgXcQ','3JZ_D3ELwOQ','M7lc1UVf-VE','ysz5S6PUM-U','ScMzIvxBSi4','aqz-KE-bpKQ','5qap5aO4i9A','kxopViU98Xo'];

const FEED_QUERIES = [
  // Tech
  { q: 'Indian tech review latest', category: 'Tech' },
  { q: 'technology news India', category: 'Tech' },
  { q: 'best gadgets India', category: 'Tech' },
  // Music
  { q: 'Bollywood songs latest', category: 'Music' },
  { q: 'Indian music video', category: 'Music' },
  { q: 'Indian classical music', category: 'Music' },
  // Movies
  { q: 'Indian movie trailer', category: 'Movies' },
  { q: 'Bollywood movie review', category: 'Movies' },
  { q: 'Indian cinema analysis', category: 'Movies' },
  // Anime
  { q: 'anime review', category: 'Anime' },
  { q: 'best anime recommendation', category: 'Anime' },
  { q: 'anime explained', category: 'Anime' },
  // Cartoon
  { q: 'cartoon network classics', category: 'Cartoon' },
  { q: 'animated series review', category: 'Cartoon' },
  { q: 'best cartoons', category: 'Cartoon' },
  // Kids
  { q: 'educational kids content', category: 'Kids' },
  { q: 'children learning videos', category: 'Kids' },
  { q: 'kids science experiments', category: 'Kids' },
  // Comics
  { q: 'comic book review', category: 'Comics' },
  { q: 'marvel dc explained', category: 'Comics' },
  { q: 'graphic novel review', category: 'Comics' },
  // Education
  { q: 'Indian education channel', category: 'Education' },
  { q: 'science explained Hindi', category: 'Education' },
  { q: 'learn programming India', category: 'Education' },
  // Gaming
  { q: 'Indian gaming channel', category: 'Gaming' },
  { q: 'game review India', category: 'Gaming' },
  { q: 'esports India', category: 'Gaming' }
];

let route = 'home';
let currentVideoId = null;
let bgMode = false;
let theater = false;
let sidebarOpen = false;
let aboutOpen = false;
let apiBase = null;
let feed = [];
let feedCache = [];
let feedLoading = false;
let lastFeedRefresh = null;
let searchQuery = '';
let searchResults = [];
let searchLoading = false;
let searchTimers = {};
let activeCategory = 'All';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function getRoute() {
  const h = location.hash.replace('#', '') || '/home';
  route = ['home','watch','history','saved'].includes(h.slice(1)) ? h.slice(1) : 'home';
}

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

function extractTimestamp(raw) {
  try {
    const t = new URL((raw||'').trim()).searchParams.get('t'); if (!t) return 0;
    if (/^\d+$/.test(t)) return Number(t);
    let sec = 0; const h=t.match(/(\d+)h/); if(h) sec+=parseInt(h[1])*3600;
    const m=t.match(/(\d+)m/); if(m) sec+=parseInt(m[1])*60;
    const sc=t.match(/(\d+)s/); if(sc) sec+=parseInt(sc[1]); return sec;
  } catch(_) { return 0; }
}

function parseVideoIdFromUrl(url) {
  const m = (url||'').match(/v=([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

function embedSrc(id, ts) {
  if (!id) return '';
  const url = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
  url.searchParams.set('rel','0'); url.searchParams.set('modestbranding','1'); url.searchParams.set('autoplay','1');
  if (ts) url.searchParams.set('start', String(ts));
  return url.toString();
}

function getHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE.HISTORY)) || []; } catch(_) { return []; }
}
function saveHistory(id) {
  const h = getHistory().filter(x => x.id !== id);
  h.unshift({ id, ts: Date.now() });
  localStorage.setItem(STORAGE.HISTORY, JSON.stringify(h.slice(0, 50)));
}

function getSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE.SAVED)) || []; } catch(_) { return []; }
}
function isSaved(id) {
  return getSaved().some(x => x.id === id);
}
function toggleSaved(id) {
  const saved = getSaved();
  const idx = saved.findIndex(x => x.id === id);
  if (idx >= 0) {
    saved.splice(idx, 1);
    showToast('Removed from Watch Later');
  } else {
    saved.unshift({ id, ts: Date.now() });
    showToast('Saved to Watch Later');
  }
  localStorage.setItem(STORAGE.SAVED, JSON.stringify(saved.slice(0, 200)));
}

async function fetchFromAny(path) {
  try {
    const res = await fetch('https://piped-instances.kavin.rocks/');
    if (!res.ok) throw new Error('instances failed');
    const instances = await res.json();
    const candidates = instances
      .filter(x => x.api_url && x.uptime_24h > 80)
      .sort((a,b) => (b.uptime_24h||0)-(a.uptime_24h||0))
      .slice(0,6)
      .map(x => x.api_url);
    if (apiBase) candidates.unshift(apiBase);
    const unique = [...new Set(candidates)];
    let lastErr = null;
    for (const api of unique) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 8000);
        const r = await fetch(`${api}${path}`, { signal: controller.signal });
        clearTimeout(t);
        if (!r.ok) throw new Error('status '+r.status);
        apiBase = api;
        return await r.json();
      } catch(e) { lastErr = e; }
    }
    throw lastErr || new Error('all failed');
  } catch(e) {
    throw e;
  }
}

function buildExploreFeed() {
  // Group by category
  const byCat = {};
  for (const v of feedCache) {
    if (!byCat[v.category]) byCat[v.category] = [];
    byCat[v.category].push(v);
  }
  const cats = Object.keys(byCat);
  const result = [];
  let idx = 0;
  // Round-robin pick from each category to create a diverse explore feed
  while (result.length < 30) {
    let added = false;
    for (const cat of cats) {
      const arr = byCat[cat];
      if (idx < arr.length) {
        result.push(arr[idx]);
        added = true;
        if (result.length >= 30) break;
      }
    }
    if (!added) break;
    idx++;
  }
  return result;
}

function applyFeedFilter() {
  if (activeCategory === 'All') {
    feed = buildExploreFeed();
  } else {
    feed = feedCache.filter(x => x.category === activeCategory).slice(0, 30);
  }
}

async function fetchTrending(force) {
  if (feedLoading) return;
  if (feedCache.length && !force) return;
  feedLoading = true; render();
  try {
    const results = await Promise.allSettled(
      FEED_QUERIES.map(q => fetchFromAny(`/search?q=${encodeURIComponent(q.q)}&filter=videos`))
    );
    const all = [];
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        const items = Array.isArray(r.value) ? r.value : (r.value?.items || []);
        items.forEach(item => { item._category = FEED_QUERIES[idx].category; });
        all.push(...items);
      }
    });
    const deduped = new Map();
    for (const x of all) {
      const id = parseVideoIdFromUrl(x.url);
      if (!id || deduped.has(id)) continue;
      deduped.set(id, x);
    }
    feedCache = [...deduped.values()].map((x,i) => ({
      id: parseVideoIdFromUrl(x.url),
      title: x.title || 'Untitled',
      channel: x.uploaderName || 'Unknown',
      thumb: x.thumbnail || '',
      avatar: x.uploaderAvatar || '',
      duration: x.duration || 0,
      views: x.views || 0,
      uploaded: x.uploaded || Date.now(),
      category: x._category || 'All',
      fetchedAt: Date.now()-i
    })).filter(x => x.id).sort((a,b) => b.fetchedAt - a.fetchedAt);
    applyFeedFilter();
    lastFeedRefresh = Date.now();
  } catch(e) {
    showToast('Feed unavailable');
  } finally {
    feedLoading = false;
    render();
  }
}

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
  const query = (q || searchQuery || '').trim();
  if (!query) { searchResults = []; render(); return; }
  searchQuery = query;
  searchLoading = true; render();
  try {
    const [rel, recent] = await Promise.allSettled([
      fetchFromAny(`/search?q=${encodeURIComponent(query)}&filter=videos`),
      fetchFromAny(`/search?q=${encodeURIComponent(query)}&filter=videos&sort_by=upload_date`)
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
      const id = parseVideoIdFromUrl(x.url);
      if (!id || deduped.has(id)) continue;
      deduped.set(id, x);
    }
    searchResults = [...deduped.values()].map(x => ({
      id: parseVideoIdFromUrl(x.url),
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
    searchLoading = false;
    render();
  }
}

function loadVideo(id, ts) {
  if (!id) return;
  currentVideoId = id;
  const p = new URLSearchParams({ v: id });
  if (ts) p.set('t', String(ts));
  history.replaceState(null, '', `?${p.toString()}${location.hash || '#/watch'}`);
  saveHistory(id);
  location.hash = '#/watch';
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function fmtViews(n) {
  if (!n) return '';
  const num = Number(n);
  if (num >= 1e9) return (num/1e9).toFixed(1)+'B views';
  if (num >= 1e6) return (num/1e6).toFixed(1)+'M views';
  if (num >= 1e3) return (num/1e3).toFixed(0)+'K views';
  return num+' views';
}
function fmtDuration(s) {
  if (!s) return '';
  const sec = Number(s);
  const h = Math.floor(sec/3600);
  const m = Math.floor((sec%3600)/60);
  const sc = Math.floor(sec%60);
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`;
  return `${m}:${String(sc).padStart(2,'0')}`;
}
function timeAgo(ts) {
  if (!ts || Number(ts) <= 0 || Number(ts) > Date.now()) return '';
  const diff = Date.now() - Number(ts);
  if (diff < 0) return '';
  const s = Math.floor(diff/1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s/60); if (m < 60) return m+'m ago';
  const h = Math.floor(m/60); if (h < 24) return h+'h ago';
  const d = Math.floor(h/24); if (d < 30) return d+'d ago';
  const mo = Math.floor(d/30); if (mo < 12) return mo+'mo ago';
  return Math.floor(mo/12)+'y ago';
}
function chInitial(c) { return (c||'?').charAt(0).toUpperCase(); }

function videoCard(v, compact) {
  const saved = isSaved(v.id);
  const thumb = v.thumb || `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
  const dur = fmtDuration(v.duration);
  const views = fmtViews(v.views);
  const ago = timeAgo(v.uploaded);
  const watched = v.watched ? 'Watched ' + timeAgo(v.watched) : '';
  const extraParts = [];
  if (views) extraParts.push(views);
  if (ago) extraParts.push(ago);
  if (watched) extraParts.push(watched);
  const extra = extraParts.join(' \u00b7 ');
  const fallbackInitial = chInitial(v.channel);
  const avatarHtml = v.avatar 
    ? `<div class="channel-avatar-wrap"><div class="channel-avatar-text">${fallbackInitial}</div><img src="${esc(v.avatar)}" alt="" class="channel-avatar-img" loading="lazy" onerror="this.style.display='none'"></div>`
    : `<div class="channel-avatar">${fallbackInitial}</div>`;
  const saveBtn = `<button class="save-btn ${saved ? 'saved' : ''}" data-action="toggle-save" data-id="${v.id}" title="${saved ? 'Remove from Saved' : 'Save to Watch Later'}"><span class="material-symbols-rounded">${saved ? 'bookmark' : 'bookmark_add'}</span></button>`;

  if (compact) {
    return `<div class="related-card" data-id="${v.id}" data-action="play-id">
      <div class="related-thumb"><img src="${thumb}" alt="" loading="lazy"/>${dur?`<span class="duration-badge">${dur}</span>`:''}${saveBtn}</div>
      <div class="related-meta"><div class="related-title-text">${esc(v.title)}</div><div class="related-channel">${esc(v.channel)}${extra?' \u00b7 '+extra:''}</div></div>
    </div>`;
  }
  return `<div class="video-card" data-id="${v.id}" data-action="play-id">
    <div class="thumbnail-wrap"><img src="${thumb}" alt="" loading="lazy"/><div class="play-overlay"><span class="material-symbols-rounded">play_arrow</span></div>${dur?`<span class="duration-badge">${dur}</span>`:''}${saveBtn}</div>
    <div class="card-info">${avatarHtml}<div class="card-meta"><div class="card-title">${esc(v.title)}</div><div class="card-channel">${esc(v.channel)}</div>${extra?`<div class="card-extra">${extra}</div>`:''}</div></div>
  </div>`;
}

function videoGrid(items, emptyMsg) {
  if (!items || !items.length) return `<div class="empty-state"><span class="material-symbols-rounded">video_library</span><p>${emptyMsg}</p></div>`;
  return `<div class="video-grid">${items.map(v => videoCard(v)).join('')}</div>`;
}

function categories() {
  const cats = ['All','Tech','Music','Movies','Anime','Cartoon','Kids','Comics','Education','Gaming'];
  return `<div class="category-bar">${cats.map(c => `<button class="category-chip ${activeCategory === c ? 'active' : ''}" data-action="set-category" data-category="${c}" type="button">${c === 'All' ? 'Explore' : c}</button>`).join('')}</div>`;
}

function viewHome() {
  const feedMeta = lastFeedRefresh ? `Updated ${timeAgo(lastFeedRefresh)}` : 'Not loaded yet';
  const sectionTitle = activeCategory === 'All' ? 'Explore' : activeCategory;
  return `<div class="home-page">
    
    <div class="search-section"><div class="search-row">
      <input type="text" id="home-search" class="search-input" placeholder="Search videos by name (e.g. lofi hip hop, tech reviews...)" value="${esc(searchQuery)}" autocomplete="off"/>
      <button class="btn btn-primary" data-action="run-search"><span class="material-symbols-rounded" style="font-size:18px">search</span>Search</button>
    </div></div>
    ${searchQuery?`<section style="margin-bottom:32px"><div class="section-header"><h2 class="section-title"><span class="material-symbols-rounded">search</span>Search Results</h2><span style="color:var(--text-secondary);font-size:14px">"${esc(searchQuery)}"</span></div>${searchLoading?'<div class="loading-spinner">Searching...</div>':videoGrid(searchResults, `No results for "${esc(searchQuery)}"`)}</section>`:''}
    ${categories()}
    <section><div class="section-header"><h2 class="section-title"><span class="material-symbols-rounded">trending_up</span>${sectionTitle}</h2><div class="section-actions"><span style="color:var(--text-secondary);font-size:13px">${feedMeta}</span><button class="btn btn-secondary btn-sm" data-action="refresh-feed"><span class="material-symbols-rounded" style="font-size:18px">refresh</span>${feedLoading?'...':'Refresh'}</button></div></div>${feedLoading&&!feed.length?'<div class="loading-spinner">Loading curated videos...</div>':videoGrid(feed, 'No videos in this category')}</section>
  </div>`;
}

function viewWatch() {
  const historyIds = getHistory().map(h => h.id);
  const feedIds = feed.map(f => f.id);
  const unique = [...new Set([...historyIds, ...feedIds, ...SUGGESTED])].filter(id => id !== currentVideoId).slice(0,12);
  const suggestions = unique.map(id => {
    const fromFeed = feed.find(f => f.id === id);
    return fromFeed || { id, title: 'Suggested Video', channel: 'YouTube', thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg` };
  });
  const saved = isSaved(currentVideoId);
  return `<div class="watch-page">
    ${theater?'<button class="theater-exit" data-action="toggle-theater" title="Exit Theater"><span class="material-symbols-rounded">close_fullscreen</span></button>':''}
    <div class="watch-layout">
      <div class="player-section">
        <div class="player-container">
          ${currentVideoId?`<iframe src="${embedSrc(currentVideoId)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="YouTube video player"></iframe>`:`<div class="player-placeholder"><span class="material-symbols-rounded">play_circle</span><p>Enter a YouTube URL or video ID to start watching</p></div>`}
          <div class="player-overlay ${bgMode?'show':''}"><span class="material-symbols-rounded">headphones</span><p>Background playback is enabled</p><p style="font-size:13px;color:var(--text-secondary)">Audio continues while you browse</p></div>
        </div>
        <div class="video-details">
          ${currentVideoId?`<h2 class="video-title">Now Playing</h2><div class="video-actions-bar">
            <button class="btn btn-secondary" data-action="toggle-theater"><span class="material-symbols-rounded" style="font-size:18px">theater_comedy</span>${theater?'Exit Theater':'Theater'}</button>
            <button class="btn btn-secondary" data-action="toggle-bg"><span class="material-symbols-rounded" style="font-size:18px">headphones</span>${bgMode?'Stop BG':'Background'}</button>
            <button class="btn btn-secondary" data-action="toggle-save" data-id="${currentVideoId}"><span class="material-symbols-rounded" style="font-size:18px">${saved?'bookmark':'bookmark_add'}</span>${saved?'Saved':'Save'}</button>
            <button class="btn btn-secondary" data-action="share"><span class="material-symbols-rounded" style="font-size:18px">share</span>Share</button>
          </div>`:`<div class="search-section" style="margin-top:16px"><div class="search-row"><input type="text" id="watch-input" class="search-input" placeholder="Paste YouTube link or video ID" autocomplete="off"/><button class="btn btn-primary" data-action="play-input"><span class="material-symbols-rounded" style="font-size:18px">play_arrow</span>Play</button></div></div>`}
        </div>
      </div>
      <aside class="related-section"><h3 class="related-title"><span class="material-symbols-rounded" style="font-size:20px;color:var(--brand-red)">smart_display</span>Suggested</h3><div class="related-list">${suggestions.length?suggestions.map(v=>videoCard(v,true)).join(''):'<div class="empty-state"><p>No suggestions yet</p></div>'}</div></aside>
    </div>
  </div>`;
}

function viewHistory() {
  const history = getHistory();
  if (!history.length) {
    return `<div class="history-page"><div class="history-empty"><span class="material-symbols-rounded">history</span><h3>No watch history</h3><p>Videos you watch will appear here. Start watching to build your history.</p><button class="btn btn-primary" style="margin-top:20px" data-route="/watch"><span class="material-symbols-rounded" style="font-size:18px">play_arrow</span>Start Watching</button></div></div>`;
  }
  const items = history.map(h => {
    const meta = feed.find(f => f.id === h.id);
    return { id: h.id, title: meta?.title || `Video ${h.id}`, channel: meta?.channel || 'YouTube', thumb: meta?.thumb || `https://i.ytimg.com/vi/${h.id}/mqdefault.jpg`, uploaded: meta?.uploaded || 0, watched: h.ts, avatar: meta?.avatar || '' };
  });
  return `<div class="history-page"><div class="section-header"><h2 class="section-title"><span class="material-symbols-rounded">history</span>Watch History</h2><div class="section-actions"><span style="color:var(--text-secondary);font-size:13px">${history.length} video${history.length>1?'s':''}</span><button class="btn btn-danger btn-sm" data-action="clear-history"><span class="material-symbols-rounded" style="font-size:18px">delete</span>Clear All</button></div></div>${videoGrid(items, 'History is empty')}</div>`;
}

function viewSaved() {
  const saved = getSaved();
  if (!saved.length) {
    return `<div class="history-page"><div class="history-empty"><span class="material-symbols-rounded">bookmark</span><h3>No saved videos</h3><p>Videos you save will appear here. Click the bookmark icon on any video to save it for later.</p><button class="btn btn-primary" style="margin-top:20px" data-route="/home"><span class="material-symbols-rounded" style="font-size:18px">home</span>Browse Videos</button></div></div>`;
  }
  const items = saved.map(s => {
    const meta = feed.find(f => f.id === s.id) || searchResults.find(r => r.id === s.id);
    return { id: s.id, title: meta?.title || `Video ${s.id}`, channel: meta?.channel || 'YouTube', thumb: meta?.thumb || `https://i.ytimg.com/vi/${s.id}/mqdefault.jpg`, uploaded: meta?.uploaded || 0, avatar: meta?.avatar || '' };
  });
  return `<div class="history-page"><div class="section-header"><h2 class="section-title"><span class="material-symbols-rounded">bookmark</span>Watch Later</h2><div class="section-actions"><span style="color:var(--text-secondary);font-size:13px">${saved.length} video${saved.length>1?'s':''}</span><button class="btn btn-danger btn-sm" data-action="clear-saved"><span class="material-symbols-rounded" style="font-size:18px">delete</span>Clear All</button></div></div>${videoGrid(items, 'No saved videos')}</div>`;
}

function render() {
  const active = document.activeElement;
  const activeId = active?.id;
  const activeValue = active?.value;
  const activeSel = (active && 'selectionStart' in active) 
    ? { start: active.selectionStart, end: active.selectionEnd, dir: active.selectionDirection } 
    : null;

  getRoute();
  $$('[data-route]').forEach(el => el.classList.toggle('active', el.dataset.route === '/'+route));
  const main = $('#main-content');
  if (main) {
    const html = route === 'watch' ? viewWatch() : route === 'history' ? viewHistory() : route === 'saved' ? viewSaved() : viewHome();
    main.innerHTML = html;
  }
  const hs = $('#header-search');
  if (hs && searchQuery && document.activeElement !== hs) hs.value = searchQuery;

  if (activeId) {
    const el = $('#' + activeId);
    if (el) {
      el.focus();
      if (activeValue !== undefined && 'value' in el) {
        el.value = activeValue;
      }
      if (activeSel && 'selectionStart' in el) {
        el.setSelectionRange(activeSel.start, activeSel.end, activeSel.dir);
      }
    }
  }
}

let toastTimer = null;
function showToast(msg) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

function toggleBg() { bgMode = !bgMode; render(); }
function toggleTheater() {
  theater = !theater;
  document.body.classList.toggle('theater', theater);
  localStorage.setItem('pawtube_theater', String(theater));
  render();
}
async function doShare() {
  if (!currentVideoId) { showToast('No video to share'); return; }
  const url = `${location.origin}${location.pathname}?v=${currentVideoId}#/watch`;
  try { if (navigator.share) { await navigator.share({title:'PawTube',url}); showToast('Shared!'); return; } } catch(_) {}
  try { await navigator.clipboard.writeText(url); showToast('Link copied'); } catch(_) { showToast(url); }
}
function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  $('#sidebar').classList.toggle('open', sidebarOpen);
  $('#sidebar-overlay').classList.toggle('show', sidebarOpen);
}
function closeSidebar() {
  sidebarOpen = false;
  $('#sidebar').classList.remove('open');
  $('#sidebar-overlay').classList.remove('show');
}
function openAbout() { aboutOpen = true; $('#about-modal').classList.add('show'); document.body.style.overflow = 'hidden'; }
function closeAbout() { aboutOpen = false; $('#about-modal').classList.remove('show'); document.body.style.overflow = ''; }

document.addEventListener('click', function(e) {
  const target = e.target;
  const routeEl = target.closest('[data-route]');
  if (routeEl) { e.preventDefault(); location.hash = routeEl.dataset.route; closeSidebar(); return; }
  const actionEl = target.closest('[data-action]');
  if (actionEl) {
    const action = actionEl.dataset.action;
    const card = actionEl.closest('[data-id]');
    if (action === 'play-input') {
      const input = $('#watch-input') || $('#home-search');
      const raw = input?.value || ''; const id = extractVideoId(raw);
      if (!id) { showToast('Invalid link or video ID'); return; }
      loadVideo(id, extractTimestamp(raw));
    } else if (action === 'play-id') {
      const id = card?.dataset?.id; if (id) loadVideo(id);
    } else if (action === 'toggle-bg') { toggleBg(); }
    else if (action === 'toggle-theater') { toggleTheater(); }
    else if (action === 'share') { doShare(); }
    else if (action === 'clear-history') { localStorage.removeItem(STORAGE.HISTORY); showToast('History cleared'); render(); }
    else if (action === 'clear-saved') { localStorage.removeItem(STORAGE.SAVED); showToast('Saved videos cleared'); render(); }
    else if (action === 'refresh-feed') { fetchTrending(true); }
    else if (action === 'run-search') {
      const input = $('#home-search');
      const q = input?.value?.trim() || '';
      searchQuery = q;
      if (q) runSearch(q); else { searchResults = []; render(); }
    } else if (action === 'toggle-save') {
      e.stopPropagation();
      const id = actionEl.dataset.id || card?.dataset?.id;
      if (id) { toggleSaved(id); render(); }
    } else if (action === 'set-category') {
      activeCategory = actionEl.dataset.category;
      applyFeedFilter();
      render();
    }
    return;
  }
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    if (e.target?.id === 'watch-input' || e.target?.id === 'url-input') {
      e.preventDefault(); const raw = e.target.value || ''; const id = extractVideoId(raw);
      if (!id) { showToast('Invalid link or video ID'); return; }
      loadVideo(id, extractTimestamp(raw));
    }
    if (e.target?.id === 'home-search') {
      e.preventDefault(); const q = e.target.value.trim(); searchQuery = q;
      if (q) runSearch(q); else { searchResults = []; render(); }
    }
    if (e.target?.id === 'header-search') {
      e.preventDefault(); const q = e.target.value.trim(); searchQuery = q;
      location.hash = '#/home'; if (q) runSearch(q); else render();
    }
  }
  if (e.key === 'Escape') {
    if (aboutOpen) { closeAbout(); return; }
    if (sidebarOpen) { closeSidebar(); return; }
    if (theater) { toggleTheater(); return; }
  }
});

document.addEventListener('input', function(e) {
  if (e.target?.id === 'home-search') {
    searchQuery = e.target.value;
    if (searchTimers.home) clearTimeout(searchTimers.home);
    searchTimers.home = setTimeout(() => {
      const q = e.target.value.trim();
      if (q) runSearch(q); else { searchResults = []; render(); }
    }, 400);
  }
  if (e.target?.id === 'header-search') {
    searchQuery = e.target.value;
    if (searchTimers.header) clearTimeout(searchTimers.header);
    searchTimers.header = setTimeout(() => {
      const q = e.target.value.trim();
      if (q) { location.hash = '#/home'; runSearch(q); }
    }, 400);
  }
});

window.addEventListener('hashchange', function() { render(); window.scrollTo(0,0); });

function init() {
  if (localStorage.getItem('pawtube_theater') === 'true') { theater = true; document.body.classList.add('theater'); }
  const v = new URLSearchParams(location.search).get('v');
  if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) currentVideoId = v;

  $('#menu-btn')?.addEventListener('click', (e) => { e.stopPropagation(); toggleSidebar(); });
  $('#sidebar-overlay')?.addEventListener('click', closeSidebar);
  $('#about-btn')?.addEventListener('click', (e) => { e.stopPropagation(); openAbout(); });
  $('#modal-close')?.addEventListener('click', closeAbout);
  $('#about-modal')?.addEventListener('click', (e) => { if (e.target === $('#about-modal')) closeAbout(); });
  $('#search-btn')?.addEventListener('click', () => {
    const q = $('#header-search')?.value?.trim();
    if (q) { searchQuery = q; location.hash = '#/home'; runSearch(q); }
  });

  if (!location.hash) location.hash = '#/home';
  else getRoute();
  render();
  fetchTrending(false);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
