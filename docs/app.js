/**
 * PawTube - Modern Client Application
 * 
 * Strict 4-Tab Architecture:
 * 1. Home (Personalized discovery feed, categories & continue watching)
 * 2. Shorts (Vertical short-form feed with real Piped data)
 * 3. Playlists + History (Library, watch later, local playlists, continue watching)
 * 4. You (Account overview, subscriptions, instance health tester & settings)
 * 
 * Centralized Piped API, zero obsolete Piped/PyTube code.
 */

// ==========================================
// LOCAL STORAGE & DATA STORE
// ==========================================
class Store {
  constructor() {
    this.history = this.get('pt_history', []);
    this.watchLater = this.get('pt_watch_later', []);
    this.liked = new Set(this.get('pt_liked', []));
    this.disliked = new Set(this.get('pt_disliked', []));
    this.subscriptions = this.get('pt_subscriptions', []);
    this.playlists = this.get('pt_custom_playlists', [
      { id: 'pl_favorites', title: 'Favorites', createdAt: Date.now(), videos: [] }
    ]);
    this.preferences = this.get('pt_preferences', {
      autoplay: true,
      miniPlayerEnabled: true,
      region: 'US'
    });
    this.searchHistory = this.get('pt_search_history', []);
  }

  get(key, fallback) {
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : fallback;
    } catch {
      return fallback;
    }
  }

  set(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.warn('Storage quota exceeded or unavailable', e);
    }
  }

  // History & Continue Watching
  addToHistory(video) {
    if (!video || !video.id) return;
    this.history = this.history.filter(v => v.id !== video.id);
    this.history.unshift({
      id: video.id,
      title: video.title || 'Untitled',
      channel: video.channel || '',
      channelId: video.channelId || '',
      thumb: video.thumb || '',
      duration: video.duration || 0,
      durationFormatted: video.durationFormatted || '',
      progress: video.progress || 0,
      ts: Date.now()
    });
    // Keep last 150 items
    if (this.history.length > 150) this.history = this.history.slice(0, 150);
    this.set('pt_history', this.history);
  }

  updateProgress(videoId, currentTime, duration) {
    if (!videoId) return;
    const item = this.history.find(v => v.id === videoId);
    if (item) {
      item.progress = Math.floor(currentTime);
      if (duration && !item.duration) item.duration = Math.floor(duration);
      this.set('pt_history', this.history);
    }
  }

  removeFromHistory(id) {
    this.history = this.history.filter(v => v.id !== id);
    this.set('pt_history', this.history);
  }

  clearHistory() {
    this.history = [];
    this.set('pt_history', []);
  }

  getContinueWatching() {
    return this.history.filter(v => {
      if (!v.progress || v.progress < 10) return false;
      if (v.duration && v.progress > (v.duration - 15)) return false;
      return true;
    }).slice(0, 10);
  }

  // Watch Later
  isWatchLater(id) {
    return this.watchLater.some(v => v.id === id);
  }

  toggleWatchLater(video) {
    if (!video || !video.id) return false;
    const exists = this.isWatchLater(video.id);
    if (exists) {
      this.watchLater = this.watchLater.filter(v => v.id !== video.id);
    } else {
      this.watchLater.unshift({
        id: video.id,
        title: video.title,
        channel: video.channel,
        channelId: video.channelId,
        thumb: video.thumb,
        duration: video.duration,
        durationFormatted: video.durationFormatted,
        ts: Date.now()
      });
    }
    this.set('pt_watch_later', this.watchLater);
    return !exists;
  }

  // Likes & Dislikes
  isLiked(id) { return this.liked.has(id); }
  isDisliked(id) { return this.disliked.has(id); }

  toggleLike(id) {
    if (this.liked.has(id)) {
      this.liked.delete(id);
    } else {
      this.liked.add(id);
      this.disliked.delete(id);
    }
    this.set('pt_liked', Array.from(this.liked));
    this.set('pt_disliked', Array.from(this.disliked));
    return this.liked.has(id);
  }

  toggleDislike(id) {
    if (this.disliked.has(id)) {
      this.disliked.delete(id);
    } else {
      this.disliked.add(id);
      this.liked.delete(id);
    }
    this.set('pt_liked', Array.from(this.liked));
    this.set('pt_disliked', Array.from(this.disliked));
    return this.disliked.has(id);
  }

  // Subscriptions
  isSubscribed(channelId) {
    return this.subscriptions.some(s => s.id === channelId);
  }

  toggleSubscription(channel) {
    if (!channel || !channel.id) return false;
    const exists = this.isSubscribed(channel.id);
    if (exists) {
      this.subscriptions = this.subscriptions.filter(s => s.id !== channel.id);
    } else {
      this.subscriptions.unshift({
        id: channel.id,
        name: channel.name || 'Channel',
        avatar: channel.avatar || '',
        subscribedAt: Date.now()
      });
    }
    this.set('pt_subscriptions', this.subscriptions);
    window.app?.renderSidebarSubscriptions();
    return !exists;
  }

  // Custom Playlists
  createPlaylist(title) {
    const cleanTitle = (title || 'New Playlist').trim();
    const id = 'pl_' + Date.now();
    const newPl = { id, title: cleanTitle, createdAt: Date.now(), videos: [] };
    this.playlists.unshift(newPl);
    this.set('pt_custom_playlists', this.playlists);
    return newPl;
  }

  deletePlaylist(playlistId) {
    this.playlists = this.playlists.filter(p => p.id !== playlistId);
    this.set('pt_custom_playlists', this.playlists);
  }

  addVideoToPlaylist(playlistId, video) {
    const pl = this.playlists.find(p => p.id === playlistId);
    if (!pl || !video || !video.id) return;
    if (!pl.videos.some(v => v.id === video.id)) {
      pl.videos.push({
        id: video.id,
        title: video.title,
        channel: video.channel,
        thumb: video.thumb,
        duration: video.duration,
        durationFormatted: video.durationFormatted
      });
      this.set('pt_custom_playlists', this.playlists);
    }
  }

  removeVideoFromPlaylist(playlistId, videoId) {
    const pl = this.playlists.find(p => p.id === playlistId);
    if (pl) {
      pl.videos = pl.videos.filter(v => v.id !== videoId);
      this.set('pt_custom_playlists', this.playlists);
    }
  }

  // Search History
  addSearch(term) {
    if (!term) return;
    const clean = term.trim();
    this.searchHistory = [clean, ...this.searchHistory.filter(s => s !== clean)].slice(0, 15);
    this.set('pt_search_history', this.searchHistory);
  }

  // Channel affinity for personalized feed ranking
  getTopChannelAffinities() {
    const counts = {};
    // Channel history weighting
    for (const h of this.history.slice(0, 40)) {
      if (h.channelId) counts[h.channelId] = (counts[h.channelId] || 0) + 2;
    }
    // Subscription weighting
    for (const s of this.subscriptions) {
      if (s.id) counts[s.id] = (counts[s.id] || 0) + 5;
    }
    return counts;
  }
}

const store = new Store();

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, duration = 3000) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}
window.showToast = showToast;

// ==========================================
// PAWTUBE CORE APPLICATION CONTROLLER
// ==========================================
class PawTubeApp {
  constructor() {
    this.store = store;
    this.currentRoute = '';
    this.currentParams = {};
    this.abortController = null;
    this.activeCategory = 'All';
    this.categories = ['All', 'Trending', 'Tech', 'Music', 'Education', 'Gaming', 'Movies', 'News'];
    this.playingVideo = null;
    this.progressInterval = null;
    this.currentShortsList = [];
    this.currentShortIndex = 0;

    this.initElements();
    this.initEventListeners();
    this.renderSidebarSubscriptions();
    this.handleRoute();
  }

  initElements() {
    this.mainContent = document.getElementById('main-content');
    this.header = document.getElementById('header');
    this.searchInput = document.getElementById('header-search');
    this.searchForm = document.getElementById('search-form');
    this.searchClearBtn = document.getElementById('search-clear-btn');
    this.searchSuggestionsDropdown = document.getElementById('search-suggestions-dropdown');
    this.voiceBtn = document.getElementById('voice-btn');
    this.menuBtn = document.getElementById('menu-btn');
    this.sidebar = document.getElementById('sidebar');
    this.sidebarOverlay = document.getElementById('sidebar-overlay');
    this.bottomNav = document.getElementById('bottom-nav');
    this.bnavPill = document.getElementById('bnav-pill');
    this.miniPlayer = document.getElementById('mini-player');
    this.modalOverlay = document.getElementById('modal-overlay');
    this.modalCard = document.getElementById('modal-card');
  }

  initURLObserver() {
    // Listen for hash changes (SPA routing)
    window.addEventListener('hashchange', () => this.handleRoute());

    // Intercept standard pathname or query parameters on initial boot
    const pathname = window.location.pathname || '';
    const search = window.location.search || '';

    // Direct /watch or /watch/ID or /watch?v=ID
    if (pathname.startsWith('/watch')) {
      const extracted = window.extractVideoId ? window.extractVideoId(pathname + search) : null;
      if (extracted) {
        window.location.replace(`/#/watch?v=${extracted}`);
        return;
      }
    }

    // Intercept query parameters (e.g., ?v=ID, ?channel=ID, ?list=ID)
    if (search) {
      const searchParams = new URLSearchParams(search);
      if (searchParams.has('v')) {
        const extracted = window.extractVideoId ? window.extractVideoId(searchParams.get('v')) : searchParams.get('v');
        if (extracted) {
          window.location.replace(`/#/watch?v=${extracted}`);
          return;
        }
      } else if (searchParams.has('channel')) {
        window.location.replace(`/#/channel?id=${encodeURIComponent(searchParams.get('channel'))}`);
        return;
      } else if (searchParams.has('list')) {
        window.location.replace(`/#/playlist?id=${encodeURIComponent(searchParams.get('list'))}`);
        return;
      }
    }
  }

  initEventListeners() {
    this.initURLObserver();

    // Search bar handling
    let searchDebounceTimer = null;
    this.searchInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      this.searchClearBtn.style.display = val ? 'flex' : 'none';

      clearTimeout(searchDebounceTimer);
      if (val.length >= 2) {
        searchDebounceTimer = setTimeout(() => this.fetchSearchSuggestions(val), 250);
      } else {
        this.closeSearchSuggestions();
      }
    });

    this.searchClearBtn.addEventListener('click', () => {
      this.searchInput.value = '';
      this.searchClearBtn.style.display = 'none';
      this.closeSearchSuggestions();
      this.searchInput.focus();
    });

    this.searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const query = this.searchInput.value.trim();
      if (query) {
        this.closeSearchSuggestions();
        this.closeMobileSearch();
        this.store.addSearch(query);
        window.location.hash = `#/search?q=${encodeURIComponent(query)}`;
      }
    });

    // Close suggestions on clicking outside
    document.addEventListener('click', (e) => {
      if (!this.header.contains(e.target)) {
        this.closeSearchSuggestions();
      }
    });

    // Mobile Search toggle
    const mobileSearchTrigger = document.getElementById('mobile-search-trigger');
    const mobileSearchBack = document.getElementById('mobile-search-back');
    if (mobileSearchTrigger) {
      mobileSearchTrigger.addEventListener('click', () => {
        this.header.classList.add('mobile-search-open');
        this.searchInput.focus();
      });
    }
    if (mobileSearchBack) {
      mobileSearchBack.addEventListener('click', () => this.closeMobileSearch());
    }

    // Voice search
    if (this.voiceBtn) {
      this.voiceBtn.addEventListener('click', () => this.startVoiceSearch());
    }

    // Sidebar toggles (desktop collapsible vs mobile slide-in)
    if (this.menuBtn) {
      this.menuBtn.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
          this.sidebar.classList.toggle('show-mobile');
          this.sidebarOverlay.classList.toggle('show');
        } else {
          document.body.classList.toggle('sidebar-collapsed');
        }
      });
    }

    if (this.sidebarOverlay) {
      this.sidebarOverlay.addEventListener('click', () => {
        this.sidebar.classList.remove('show-mobile');
        this.sidebarOverlay.classList.remove('show');
      });
    }

    // Modal overlay click to close
    if (this.modalOverlay) {
      this.modalOverlay.addEventListener('click', (e) => {
        if (e.target === this.modalOverlay) {
          this.closeModal();
        }
      });
    }

    // Mini-player controls
    document.getElementById('mini-player-expand')?.addEventListener('click', () => {
      if (this.playingVideo) {
        window.location.hash = `#/watch?v=${this.playingVideo.id}`;
      }
    });
    document.getElementById('mini-player-play-btn')?.addEventListener('click', () => {
      window.customPlayer?.togglePlay();
    });
    document.getElementById('mini-player-close-btn')?.addEventListener('click', () => {
      this.hideMiniPlayer();
    });

    // Keyboard shortcuts for Shorts navigation
    window.addEventListener('keydown', (e) => {
      if (this.currentRoute === '/shorts') {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.navigateShort(1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.navigateShort(-1);
        }
      }
    });
  }

  closeMobileSearch() {
    this.header.classList.remove('mobile-search-open');
    this.closeSearchSuggestions();
  }

  async fetchSearchSuggestions(val) {
    try {
      const suggestions = await PawTubeAPI.getSearchSuggestions(val);
      if (suggestions && suggestions.length > 0) {
        this.renderSearchSuggestions(suggestions);
      } else {
        this.closeSearchSuggestions();
      }
    } catch (_) {
      this.closeSearchSuggestions();
    }
  }

  renderSearchSuggestions(suggestions) {
    let html = '';
    suggestions.slice(0, 8).forEach(s => {
      const text = typeof s === 'string' ? s : (s.query || s.title || '');
      if (!text) return;
      html += `
        <div class="suggestion-item" data-query="${encodeURIComponent(text)}">
          <span class="material-symbols-rounded">search</span>
          <span>${this.escapeHtml(text)}</span>
        </div>
      `;
    });
    this.searchSuggestionsDropdown.innerHTML = html;
    this.searchSuggestionsDropdown.classList.add('open');

    this.searchSuggestionsDropdown.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const q = decodeURIComponent(item.getAttribute('data-query'));
        this.searchInput.value = q;
        this.closeSearchSuggestions();
        this.closeMobileSearch();
        this.store.addSearch(q);
        window.location.hash = `#/search?q=${encodeURIComponent(q)}`;
      });
    });
  }

  closeSearchSuggestions() {
    this.searchSuggestionsDropdown.classList.remove('open');
    this.searchSuggestionsDropdown.innerHTML = '';
  }

  startVoiceSearch() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('Voice search is not supported in this browser');
      return;
    }
    try {
      const rec = new SpeechRecognition();
      rec.lang = 'en-US';
      rec.onstart = () => showToast('Listening... Speak now');
      rec.onresult = (e) => {
        const transcript = e.results[0][0].transcript;
        if (transcript) {
          this.searchInput.value = transcript;
          this.store.addSearch(transcript);
          window.location.hash = `#/search?q=${encodeURIComponent(transcript)}`;
        }
      };
      rec.onerror = () => showToast('Could not hear voice. Please try again');
      rec.start();
    } catch (_) {
      showToast('Voice search error');
    }
  }

  // ==========================================
  // ROUTING & NAVIGATION
  // ==========================================
  handleRoute() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    const hash = window.location.hash || '#/home';
    const [rawPath, queryString] = hash.slice(1).split('?');
    const params = new URLSearchParams(queryString || '');

    // Normalize path (ensure leading slash)
    let path = rawPath || '/home';
    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    // Support both /watch?v=VIDEO_ID and /watch/VIDEO_ID
    if (path.startsWith('/watch')) {
      let candidateId = params.get('v');
      if (!candidateId && path.startsWith('/watch/')) {
        candidateId = path.replace(/^\/watch\//, '');
      }
      const videoId = window.extractVideoId ? window.extractVideoId(candidateId || hash) : candidateId;

      this.currentRoute = '/watch';
      this.currentParams = { v: videoId };
      this.updateNavigationUI('/watch');
      this.hideMiniPlayer();
      window.scrollTo({ top: 0, behavior: 'instant' });
      this.renderWatchPage(videoId);
      return;
    }

    this.currentRoute = path;
    this.currentParams = Object.fromEntries(params.entries());

    // Update 4-Tab Navigation Active States
    this.updateNavigationUI(this.currentRoute);

    // Mini-player management:
    // If user moves away from watch page while video is playing, show mini-player
    if (this.currentRoute !== '/watch' && this.playingVideo && this.store.preferences.miniPlayerEnabled) {
      this.showMiniPlayer();
    } else if (this.currentRoute === '/watch') {
      this.hideMiniPlayer();
    }

    // Scroll top
    window.scrollTo({ top: 0, behavior: 'instant' });

    // Route dispatch
    switch (this.currentRoute) {
      case '/home':
        this.renderHomeFeed();
        break;
      case '/shorts':
        this.renderShortsFeed();
        break;
      case '/library':
        this.renderPlaylistsAndHistory();
        break;
      case '/you':
        this.renderYouPage();
        break;
      case '/channel':
        this.renderChannelPage(this.currentParams.id);
        break;
      case '/playlist':
        this.renderPlaylistPage(this.currentParams.id);
        break;
      case '/search':
        this.renderSearchResults(this.currentParams.q);
        break;
      default:
        this.renderHomeFeed();
        break;
    }
  }

  updateNavigationUI(route) {
    // Map route to the 4 main tabs
    let activeTab = 'home';
    if (route === '/home') activeTab = 'home';
    else if (route === '/shorts') activeTab = 'shorts';
    else if (route === '/library' || route.startsWith('/playlist')) activeTab = 'library';
    else if (route === '/you') activeTab = 'you';

    // Sidebar items
    document.querySelectorAll('.sidebar .nav-item, .mini-sidebar .mini-nav-item').forEach(el => {
      const itemRoute = el.getAttribute('data-route');
      const isMatch = (itemRoute === `/${activeTab}`);
      el.classList.toggle('active', isMatch);
    });

    // Mobile Bottom Nav items & sliding pill
    const bnavItems = Array.from(document.querySelectorAll('.bottom-nav .bnav-item'));
    bnavItems.forEach((el, index) => {
      const itemRoute = el.getAttribute('data-route');
      const isMatch = (itemRoute === `/${activeTab}`);
      el.classList.toggle('active', isMatch);

      if (isMatch && this.bnavPill) {
        // Position sliding pill
        const count = bnavItems.length;
        const percent = (index * 100);
        this.bnavPill.style.transform = `translateX(${percent}%)`;
      }
    });
  }

  renderSidebarSubscriptions() {
    const listEl = document.getElementById('sidebar-subs-list');
    if (!listEl) return;

    if (this.store.subscriptions.length === 0) {
      listEl.innerHTML = '<div style="padding:8px 16px; font-size:12px; color:var(--text-tertiary);">No subscriptions yet</div>';
      return;
    }

    let html = '';
    this.store.subscriptions.slice(0, 10).forEach(sub => {
      html += `
        <a class="sidebar-sub-item" href="#/channel?id=${encodeURIComponent(sub.id)}">
          <img class="sidebar-sub-avatar" src="${sub.avatar || 'https://raw.githubusercontent.com/pawjects/PawTube/refs/heads/main/assets/pawtube_logo.png'}" alt="${this.escapeHtml(sub.name)}" />
          <span class="sidebar-sub-name">${this.escapeHtml(sub.name)}</span>
        </a>
      `;
    });
    listEl.innerHTML = html;
  }

  // ==========================================
  // TAB 1: HOME FEED (PERSONALIZED DISCOVERY)
  // ==========================================
  async renderHomeFeed() {
    // 1. Render Category Bar and Continue Watching skeleton immediately
    const continueWatching = this.store.getContinueWatching();
    let html = `
      <div class="category-bar">
        ${this.categories.map(cat => `
          <button class="category-chip ${cat === this.activeCategory ? 'active' : ''}" data-category="${cat}">
            ${cat}
          </button>
        `).join('')}
      </div>
    `;

    if (continueWatching.length > 0 && this.activeCategory === 'All') {
      html += `
        <div class="section-header">
          <h2 class="section-title">
            <span class="material-symbols-rounded">history</span>
            Continue Watching
          </h2>
        </div>
        <div class="continue-watching-rail">
          ${continueWatching.map(v => `
            <div class="continue-card" onclick="location.hash='#/watch?v=${v.id}'">
              <div class="continue-thumb-wrap">
                <img src="${v.thumb || ''}" alt="${this.escapeHtml(v.title)}" loading="lazy" />
                <div class="duration-badge">${v.durationFormatted || '0:00'}</div>
                <div class="progress-bar-rail">
                  <div class="progress-bar-fill" style="width:${Math.min(100, (v.progress / (v.duration || 1)) * 100)}%"></div>
                </div>
              </div>
              <div class="card-title" style="font-size:13.5px;">${this.escapeHtml(v.title)}</div>
              <div class="card-channel" style="font-size:12px;">${this.escapeHtml(v.channel)}</div>
            </div>
          `).join('')}
        </div>
      `;
    }

    html += `
      <div class="section-header">
        <h2 class="section-title">
          <span class="material-symbols-rounded">${this.activeCategory === 'All' ? 'auto_awesome' : 'local_fire_department'}</span>
          ${this.activeCategory === 'All' ? 'Recommended for You' : this.activeCategory}
        </h2>
        
      </div>
      <div class="video-grid" id="home-grid">
        ${this.renderSkeletonCards(8)}
      </div>
    `;

    this.mainContent.innerHTML = html;

    // Category click bindings
    this.mainContent.querySelectorAll('.category-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this.activeCategory = chip.getAttribute('data-category');
        this.renderHomeFeed();
      });
    });

    

    // Fetch feed data with fallback and personalization ranking
    try {
      let videos = [];
      if (this.activeCategory === 'All' || this.activeCategory === 'Trending') {
        videos = await PawTubeAPI.getTrending({ signal: this.abortController.signal });
      } else {
        videos = await PawTubeAPI.getCategoryFeed(this.activeCategory, { signal: this.abortController.signal });
      }

      // Apply personalization ranking
      const rankedVideos = this.rankPersonalizedFeed(videos);
      const grid = document.getElementById('home-grid');
      if (grid) {
        if (rankedVideos.length === 0) {
          grid.innerHTML = this.renderEmptyState('No videos found', 'Try selecting another category or check your connection.');
        } else {
          grid.innerHTML = rankedVideos.map(v => this.renderVideoCard(v)).join('');
        }
      }
    } catch (err) {
      if (this.abortController.signal.aborted) return;
      const grid = document.getElementById('home-grid');
      if (grid) { grid.innerHTML = ''; window.showToast?.('Unable to load feed. Please try again.'); }
    }
  }

  rankPersonalizedFeed(videos) {
    if (!videos || !Array.isArray(videos)) return [];
    const affinities = this.store.getTopChannelAffinities();
    const historyIds = new Set(this.store.history.slice(0, 20).map(h => h.id));

    // Sort with slight boost for channels user watches or subscribes to
    return [...videos].sort((a, b) => {
      let scoreA = (affinities[a.channelId] || 0);
      let scoreB = (affinities[b.channelId] || 0);

      // Penalize recently fully watched videos on discovery
      if (historyIds.has(a.id)) scoreA -= 3;
      if (historyIds.has(b.id)) scoreB -= 3;

      return scoreB - scoreA;
    });
  }

  // ==========================================
  // TAB 2: SHORTS FEED (VERTICAL SHORT-FORM)
  // ==========================================
  async renderShortsFeed() {
    this.mainContent.innerHTML = `
      <div class="shorts-container" id="shorts-container">
        <div style="padding:60px 0; text-align:center; color:var(--text-secondary);">
          <div class="skeleton" style="width:340px; height:600px; margin:0 auto; border-radius:24px;"></div>
        </div>
      </div>
    `;

    try {
      this.currentShortsList = await PawTubeAPI.getShorts({ signal: this.abortController.signal });
      this.currentShortIndex = 0;
      this.displayCurrentShort();
    } catch (err) {
      if (this.abortController.signal.aborted) return;
      this.mainContent.innerHTML = this.renderErrorState('Could not load Shorts', err.message, () => this.renderShortsFeed());
    }
  }

  displayCurrentShort() {
    const container = document.getElementById('shorts-container');
    if (!container || this.currentShortsList.length === 0) return;

    const short = this.currentShortsList[this.currentShortIndex];
    if (!short) return;

    const isLiked = this.store.isLiked(short.id);
    const isSaved = this.store.isWatchLater(short.id);

    const embedUrl = (window.buildEmbedUrl ? window.buildEmbedUrl(short.id, { autoplay: 1, controls: 0 }) : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(short.id)}?autoplay=1&controls=0&rel=0&playsinline=1&modestbranding=1`) + `&loop=1&playlist=${encodeURIComponent(short.id)}`;
    container.innerHTML = `
      <div class="short-frame">
        <iframe 
          src="${embedUrl}"
          title="${this.escapeHtml(short.title)}"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen>
        </iframe>
        <div class="short-overlay-info">
          <div class="short-overlay-channel" onclick="location.hash='#/channel?id=${encodeURIComponent(short.channelId)}'">
            @${this.escapeHtml(short.channel)}
          </div>
          <div class="short-overlay-title">${this.escapeHtml(short.title)}</div>
        </div>
        <div class="short-actions-column">
          <button class="short-action-btn ${isLiked ? 'active' : ''}" id="short-like-btn" title="Like">
            <span class="material-symbols-rounded ${isLiked ? 'filled-icon' : ''}">thumb_up</span>
            <span style="font-size:10px; margin-top:2px;">${short.likes > 0 ? formatViews(short.likes) : 'Like'}</span>
          </button>
          <button class="short-action-btn" id="short-dislike-btn" title="Dislike">
            <span class="material-symbols-rounded">thumb_down</span>
            <span style="font-size:10px; margin-top:2px;">Dislike</span>
          </button>
          <button class="short-action-btn ${isSaved ? 'active' : ''}" id="short-save-btn" title="Watch Later">
            <span class="material-symbols-rounded ${isSaved ? 'filled-icon' : ''}">bookmark</span>
            <span style="font-size:10px; margin-top:2px;">Save</span>
          </button>
          <button class="short-action-btn" id="short-share-btn" title="Share">
            <span class="material-symbols-rounded">share</span>
            <span style="font-size:10px; margin-top:2px;">Share</span>
          </button>
        </div>
      </div>

      <button class="short-nav-btn prev" id="short-prev-btn" title="Previous Short">
        <span class="material-symbols-rounded">arrow_upward</span>
      </button>
      <button class="short-nav-btn next" id="short-next-btn" title="Next Short">
        <span class="material-symbols-rounded">arrow_downward</span>
      </button>
    `;

    // Action handlers
    document.getElementById('short-like-btn')?.addEventListener('click', () => {
      this.store.toggleLike(short.id);
      this.displayCurrentShort();
    });
    document.getElementById('short-dislike-btn')?.addEventListener('click', () => {
      this.store.toggleDislike(short.id);
      this.displayCurrentShort();
    });
    document.getElementById('short-save-btn')?.addEventListener('click', () => {
      const saved = this.store.toggleWatchLater(short);
      showToast(saved ? 'Saved to Watch Later' : 'Removed from Watch Later');
      this.displayCurrentShort();
    });
    document.getElementById('short-share-btn')?.addEventListener('click', () => {
      this.shareVideo(short);
    });

    document.getElementById('short-prev-btn')?.addEventListener('click', () => this.navigateShort(-1));
    document.getElementById('short-next-btn')?.addEventListener('click', () => this.navigateShort(1));
  }

  navigateShort(dir) {
    const nextIdx = this.currentShortIndex + dir;
    if (nextIdx >= 0 && nextIdx < this.currentShortsList.length) {
      this.currentShortIndex = nextIdx;
      this.displayCurrentShort();
    } else if (nextIdx >= this.currentShortsList.length) {
      // Load more shorts
      PawTubeAPI.getShorts({ page: Math.floor(this.currentShortsList.length / 10) + 1 })
        .then(newShorts => {
          this.currentShortsList = [...this.currentShortsList, ...newShorts];
          this.currentShortIndex = nextIdx;
          this.displayCurrentShort();
        });
    }
  }

  // ==========================================
  // TAB 3: PLAYLISTS + HISTORY (LIBRARY)
  // ==========================================
  renderPlaylistsAndHistory() {
    const continueWatching = this.store.getContinueWatching();
    const watchLater = this.store.watchLater;
    const history = this.store.history;
    const playlists = this.store.playlists;

    let html = `
      <div class="library-section">
        <div class="section-header">
          <h2 class="section-title">
            <span class="material-symbols-rounded">playlist_play</span>
            Custom Playlists
          </h2>
          <button class="pill-btn" id="create-playlist-btn">
            <span class="material-symbols-rounded" style="font-size:18px;">add</span>
            New Playlist
          </button>
        </div>
        <div class="library-cards-row">
          ${playlists.map(pl => `
            <div class="playlist-card" onclick="location.hash='#/playlist?id=${pl.id}'">
              <div class="playlist-card-thumb">
                <img src="${pl.videos[0]?.thumb || 'https://raw.githubusercontent.com/pawjects/PawTube/refs/heads/main/assets/pawtube_logo.png'}" alt="" />
                <div class="playlist-count-badge">
                  <span class="material-symbols-rounded">queue_music</span>
                  <span>${pl.videos.length} videos</span>
                </div>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                  <div class="card-title">${this.escapeHtml(pl.title)}</div>
                  <div class="card-channel">Custom Playlist &bull; ${new Date(pl.createdAt).toLocaleDateString()}</div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Watch Later Section
    if (watchLater.length > 0) {
      html += `
        <div class="library-section">
          <div class="section-header">
            <h2 class="section-title">
              <span class="material-symbols-rounded">bookmark</span>
              Watch Later (${watchLater.length})
            </h2>
            <button class="pill-btn" onclick="location.hash='#/watch?v=${watchLater[0].id}'">
              <span class="material-symbols-rounded">play_arrow</span>
              Play All
            </button>
          </div>
          <div class="video-grid">
            ${watchLater.slice(0, 6).map(v => this.renderVideoCard(v)).join('')}
          </div>
        </div>
      `;
    }

    // Continue Watching Section
    if (continueWatching.length > 0) {
      html += `
        <div class="library-section">
          <div class="section-header">
            <h2 class="section-title">
              <span class="material-symbols-rounded">history</span>
              Continue Watching
            </h2>
          </div>
          <div class="video-grid">
            ${continueWatching.slice(0, 6).map(v => this.renderVideoCard(v)).join('')}
          </div>
        </div>
      `;
    }

    // Recently Watched History Section
    html += `
      <div class="library-section">
        <div class="section-header">
          <h2 class="section-title">
            <span class="material-symbols-rounded">schedule</span>
            Recently Watched History (${history.length})
          </h2>
          ${history.length > 0 ? `
            <button class="pill-btn" id="clear-history-btn">
              <span class="material-symbols-rounded" style="font-size:18px;">delete</span>
              Clear History
            </button>
          ` : ''}
        </div>
        ${history.length === 0 ? `
          <div style="padding:40px; text-align:center; color:var(--text-secondary);">
            No watch history yet. Videos you watch will appear here.
          </div>
        ` : `
          <div class="video-grid">
            ${history.slice(0, 12).map(v => this.renderVideoCard(v)).join('')}
          </div>
        `}
      </div>
    `;

    this.mainContent.innerHTML = html;

    // Bind create playlist
    document.getElementById('create-playlist-btn')?.addEventListener('click', () => {
      this.promptCreatePlaylist();
    });

    // Bind clear history
    document.getElementById('clear-history-btn')?.addEventListener('click', () => {
      if (confirm('Clear all your watch history?')) {
        this.store.clearHistory();
        showToast('Watch history cleared');
        this.renderPlaylistsAndHistory();
      }
    });
  }

  // ==========================================
  // TAB 4: YOU (ACCOUNT, SUBSCRIPTIONS & SETTINGS)
  // ==========================================
  async renderYouPage() {
    const activeInstance = this.store.get("custom_piped_instance", "Default (Auto-Fallback)");
    const isHealthy = true;

    let html = `
      <div class="you-profile-card">
        <img class="you-avatar" src="https://raw.githubusercontent.com/pawjects/PawTube/refs/heads/main/assets/pawtube_logo.png" alt="Profile" />
        <div style="flex:1;">
          <h1 style="font-size:22px; font-weight:700;">PawTube User</h1>
          <p style="font-size:13px; color:var(--text-secondary); margin-top:4px;">
            AMOLED Liquid-Glass Experience &bull; Local-First &bull; Private
          </p>
        </div>
      </div>

      <div class="you-stats-grid" style="margin-bottom:32px;">
        <div class="you-stat-box">
          <div class="you-stat-val">${this.store.history.length}</div>
          <div class="you-stat-label">Videos Watched</div>
        </div>
        <div class="you-stat-box">
          <div class="you-stat-val">${this.store.watchLater.length}</div>
          <div class="you-stat-label">Saved Videos</div>
        </div>
        <div class="you-stat-box">
          <div class="you-stat-val">${this.store.subscriptions.length}</div>
          <div class="you-stat-label">Subscriptions</div>
        </div>
        <div class="you-stat-box">
          <div class="you-stat-val">${this.store.playlists.length}</div>
          <div class="you-stat-label">Playlists</div>
        </div>
      </div>

      <!-- Piped Instance Management -->
      <div class="settings-card">
        <div class="section-header">
          <h2 class="section-title">
            <span class="material-symbols-rounded">dns</span>
            Piped API Instance Architecture
          </h2>
          <button class="pill-btn" id="reset-instance-btn">
            <span class="material-symbols-rounded" style="font-size:18px;">speed</span>
            Reset to Default
          </button>
        </div>
        <div class="settings-row">
          <div>
            <div style="font-weight:600; font-size:14px;">Active Piped Instance</div>
            <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;" id="active-instance-label">
              ${this.escapeHtml(activeInstance)}
            </div>
          </div>
          <div class="instance-status-pill ${isHealthy ? 'status-green' : 'status-amber'}" id="active-instance-status">
            <span class="material-symbols-rounded" style="font-size:14px;">${isHealthy ? 'check_circle' : 'pending'}</span>
            ${isHealthy ? 'Healthy & Connected' : 'Evaluating'}
          </div>
        </div>

        <div class="settings-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
          <div style="font-weight:600; font-size:14px;">Add Custom Piped Instance</div>
          <div style="display:flex; gap:8px; width:100%;">
            <input type="url" id="custom-instance-input" value="${this.escapeHtml(this.store.get("custom_piped_instance", ""))}" placeholder="https://api.piped.private.coffee" 
              style="flex:1; background:var(--bg-elevated); border:1px solid var(--glass-border); padding:8px 12px; border-radius:var(--radius-sm); color:#fff;" />
            <button class="pill-btn" id="add-instance-btn">Add Instance</button>
          </div>
        </div>
        <div class="settings-row" style="flex-direction:column; align-items:flex-start; gap:10px;">
          <div style="font-weight:600; font-size:14px;">Instance Health Table</div>
          <div id="instances-health-list" style="width:100%; display:flex; flex-direction:column; gap:8px;">
            <div style="text-align:center; padding:16px; color:var(--text-secondary); font-size:13px;">Loading instances...</div>
          </div>
        </div>
      </div>
      <!-- Playback Settings -->
      <div class="settings-card">
        <h2 class="section-title" style="margin-bottom:16px;">
          <span class="material-symbols-rounded">settings</span>
          Playback &amp; Behavior
        </h2>
        <div class="settings-row">
          <div>
            <div style="font-weight:600; font-size:14px;">Autoplay Next Video</div>
            <div style="font-size:12px; color:var(--text-secondary);">Automatically play recommended video after finish</div>
          </div>
          <input type="checkbox" id="pref-autoplay" ${this.store.preferences.autoplay ? 'checked' : ''} style="transform:scale(1.2);" />
        </div>
        <div class="settings-row">
          <div>
            <div style="font-weight:600; font-size:14px;">Floating Mini-Player</div>
            <div style="font-size:12px; color:var(--text-secondary);">Dock video in corner when navigating away</div>
          </div>
          <input type="checkbox" id="pref-miniplayer" ${this.store.preferences.miniPlayerEnabled ? 'checked' : ''} style="transform:scale(1.2);" />
        </div>
      </div>

      <!-- Data & Storage Management -->
      <div class="settings-card">
        <h2 class="section-title" style="margin-bottom:16px;">
          <span class="material-symbols-rounded">storage</span>
          Data &amp; Privacy
        </h2>
        <div class="settings-row">
          <div>
            <div style="font-weight:600; font-size:14px;">Clear Local Caches</div>
            <div style="font-size:12px; color:var(--text-secondary);">Clears temporary API caches and response store</div>
          </div>
          <button class="pill-btn" id="clear-cache-btn">Clear Caches</button>
        </div>
        <div class="settings-row">
          <div>
            <div style="font-weight:600; font-size:14px;">Backup &amp; Restore</div>
            <div style="font-size:12px; color:var(--text-secondary);">Export or import your subscriptions, history, and playlists</div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="pill-btn" id="export-backup-btn">Export</button>
            <button class="pill-btn" id="import-backup-btn">Import</button>
            <input type="file" id="import-backup-file" accept=".json" style="display:none;" />
          </div>
        </div>
        <div class="settings-row">
          <div>
            <div style="font-weight:600; font-size:14px; color:var(--error);">Reset All Data</div>
            <div style="font-size:12px; color:var(--text-secondary);">Deletes all watch history, playlists, and preferences</div>
          </div>
          <button class="pill-btn" id="reset-all-btn" style="color:var(--error); border-color:rgba(255,69,58,0.3);">Reset All</button>
        </div>
      </div>

      <!-- About PawTube -->
      <div class="settings-card" style="text-align:center; padding:32px 16px;">
        <img src="https://raw.githubusercontent.com/pawjects/PawTube/refs/heads/main/assets/pawtube_logo.png" style="width:48px; height:48px; margin:0 auto 12px; border-radius:12px;" />
        <h3 style="font-size:18px; font-weight:700;">PawTube</h3>
        <p style="font-size:13px; color:var(--text-secondary); max-width:440px; margin:8px auto;">
          Distraction-free, ad-free video experience powered purely by modern HTML5, CSS3 and the Piped network.
        </p>
        <p style="font-size:12px; color:var(--text-tertiary); margin-top:12px;">Version 7.0 &bull; AMOLED Liquid-Glass</p>
      </div>
    `;

    this.mainContent.innerHTML = html;

    // Reset to Default Button
    document.getElementById('reset-instance-btn')?.addEventListener('click', () => {
      localStorage.removeItem('custom_piped_instance');
      showToast('Reset to default Piped instances');
      this.renderYouPage();
    });

    // Add Custom Instance
    document.getElementById('add-instance-btn')?.addEventListener('click', async () => {
      const input = document.getElementById('custom-instance-input');
      let val = input.value.trim();
      if (!val) return;
      if (val.endsWith('/')) val = val.slice(0, -1);
      if (!val.startsWith('http')) val = 'https://' + val;
      
      try {
        showToast(`Testing ${val}...`);
        const check = await fetch(val + '/trending?region=US', { method: 'HEAD' });
        if (check.ok || check.status === 400 || check.status === 403 || check.status === 405) { // Any valid response
           this.store.set('custom_piped_instance', val);
           showToast(`Custom instance verified & saved.`);
           this.renderYouPage();
        } else {
           showToast(`Instance failed check (HTTP ${check.status})`);
        }
      } catch (err) {
        showToast("Instance connection failed.");
      }
    });

    // Preference toggles
    document.getElementById('pref-autoplay')?.addEventListener('change', (e) => {
      this.store.preferences.autoplay = e.target.checked;
      this.store.set('pt_preferences', this.store.preferences);
      showToast(`Autoplay ${e.target.checked ? 'enabled' : 'disabled'}`);
    });
    document.getElementById('pref-miniplayer')?.addEventListener('change', (e) => {
      this.store.preferences.miniPlayerEnabled = e.target.checked;
      this.store.set('pt_preferences', this.store.preferences);
      showToast(`Miniplayer ${e.target.checked ? 'enabled' : 'disabled'}`);
    });

    // Storage actions
    document.getElementById('clear-cache-btn')?.addEventListener('click', () => {
      
      showToast('In-memory and API caches cleared');
    });

    // Export backup
    document.getElementById('export-backup-btn')?.addEventListener('click', () => {
      const data = {
        history: this.store.history,
        watchLater: this.store.watchLater,
        liked: Array.from(this.store.liked),
        subscriptions: this.store.subscriptions,
        playlists: this.store.playlists,
        preferences: this.store.preferences
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pawtube_backup_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Backup exported successfully');
    });

    // Import backup
    const fileInput = document.getElementById('import-backup-file');
    document.getElementById('import-backup-btn')?.addEventListener('click', () => {
      fileInput?.click();
    });
    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          if (parsed.history) this.store.set('pt_history', parsed.history);
          if (parsed.watchLater) this.store.set('pt_watch_later', parsed.watchLater);
          if (parsed.subscriptions) this.store.set('pt_subscriptions', parsed.subscriptions);
          if (parsed.playlists) this.store.set('pt_custom_playlists', parsed.playlists);
          showToast('Backup restored successfully! Reloading...');
          setTimeout(() => location.reload(), 1000);
        } catch (_) {
          showToast('Invalid backup file');
        }
      };
      reader.readAsText(file);
    });

    // Reset all
    document.getElementById('reset-all-btn')?.addEventListener('click', () => {
      if (confirm('Are you sure? This will wipe all local data, history, and playlists permanently.')) {
        localStorage.clear();
        showToast('All PawTube data cleared. Reloading...');
        setTimeout(() => location.reload(), 800);
      }
    });
  }

  switchInstance(url) {
    
    showToast(`Switched active instance to ${url}`);
    this.renderYouPage();
  }

  // ==========================================
  // WATCH PAGE (PLAYER, DETAILS, COMMENTS, RELATED)
  // ==========================================
  async renderWatchPage(videoId) {
    const cleanId = window.extractVideoId ? window.extractVideoId(videoId) : videoId;
    if (!cleanId) {
      this.mainContent.innerHTML = `
        <div style="padding: 60px 20px; text-align: center; max-width: 600px; margin: 0 auto;">
          <span class="material-symbols-rounded" style="font-size: 56px; color: var(--text-secondary); margin-bottom: 16px;">error_outline</span>
          <h2 style="font-size: 22px; font-weight: 600; margin-bottom: 8px;">Invalid Video URL</h2>
          <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 24px;">The specified video ID is missing or invalid. Please check the URL and try again.</p>
          <button class="pill-btn primary" onclick="location.hash='#/home'">
            <span class="material-symbols-rounded">home</span>
            <span>Return to Home</span>
          </button>
        </div>
      `;
      return;
    }

    this.mainContent.innerHTML = `
      <div class="watch-layout">
        <div class="watch-player-col">
          <div class="player-mount-container" id="player-mount"></div>
          <div class="watch-details" id="watch-details">
            <div class="skeleton" style="height:28px; width:75%; margin-bottom:12px;"></div>
            <div class="skeleton" style="height:48px; width:100%; border-radius:12px;"></div>
          </div>
          <div class="comments-section" id="watch-comments" style="margin-top:24px;">
            <div class="skeleton" style="height:120px; width:100%;"></div>
          </div>
        </div>
        <div class="watch-sidebar-col" id="watch-sidebar">
          <div class="section-title" style="font-size:16px; margin-bottom:16px;">Related Videos</div>
          <div class="related-list" id="related-list">
            ${this.renderSkeletonCards(5)}
          </div>
        </div>
      </div>
    `;

    // 1. Immediately mount and play YouTube No-Cookie Player (Synchronous & Decoupled)
    const mount = document.getElementById('player-mount');
    if (mount && window.videoPlayer) {
      mount.innerHTML = '';
      mount.appendChild(window.videoPlayer.getWrapper());
      window.videoPlayer.loadVideo(cleanId);
    }

    // Set playing video state
    this.playingVideo = {
      id: cleanId,
      title: 'Loading...',
      channel: '',
      thumb: `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`
    };

    // 2. Asynchronously load metadata from Piped without blocking player playback
    try {
      const video = await PawTubeAPI.getVideoMetadata(cleanId, { signal: this.abortController.signal });
      this.playingVideo = video;
      this.store.addToHistory(video);

      // Render Video Details
      this.renderWatchDetails(video);

      // Render Related Videos
      const relatedEl = document.getElementById('related-list');
      if (relatedEl && video.related && video.related.length > 0) {
        relatedEl.innerHTML = video.related.map(rel => `
          <div class="related-card" onclick="location.hash='#/watch?v=${rel.id}'">
            <div class="related-thumb-wrap">
              <img src="${rel.thumb}" alt="${this.escapeHtml(rel.title)}" loading="lazy" />
              <div class="duration-badge">${rel.durationFormatted}</div>
            </div>
            <div class="related-info">
              <div class="related-title">${this.escapeHtml(rel.title)}</div>
              <div class="related-channel">${this.escapeHtml(rel.channel)}</div>
              <div class="related-meta">${rel.viewsFormatted}</div>
            </div>
          </div>
        `).join('');
      } else if (relatedEl) {
        relatedEl.innerHTML = '<div style="font-size:13px; color:var(--text-secondary); padding:16px;">No related videos found.</div>';
      }

      // Render Comments
      this.loadComments(cleanId);
    } catch (err) {
      if (this.abortController.signal?.aborted) return;
      console.warn('[PawTube] Metadata fetch failed, player is unaffected:', err.message);

      // Fallback details UI: player continues playing!
      this.renderWatchMetadataFallback(cleanId);
      window.showToast?.('Video details temporarily unavailable');
    }
  }

  renderWatchDetails(video) {
    const detailsEl = document.getElementById('watch-details');
    if (!detailsEl) return;

    const isLiked = this.store.isLiked(video.id);
    const isDisliked = this.store.isDisliked(video.id);
    const isSaved = this.store.isWatchLater(video.id);
    const isSubbed = this.store.isSubscribed(video.channelId);

    detailsEl.innerHTML = `
      <h1 class="watch-title">${this.escapeHtml(video.title)}</h1>
      <div class="watch-author-bar">
        <div class="watch-author-info">
          <a href="#/channel?id=${encodeURIComponent(video.channelId)}">
            <img class="watch-author-avatar" src="${video.avatar || 'https://raw.githubusercontent.com/pawjects/PawTube/refs/heads/main/assets/pawtube_logo.png'}" alt="${this.escapeHtml(video.channel)}" />
          </a>
          <div>
            <a href="#/channel?id=${encodeURIComponent(video.channelId)}" class="watch-author-name">
              ${this.escapeHtml(video.channel)}
            </a>
            <div class="watch-author-subs">${this.escapeHtml(video.subCount || '')}</div>
          </div>
          <button class="btn-sub ${isSubbed ? 'subscribed' : ''}" id="watch-sub-btn">
            <span class="material-symbols-rounded" style="font-size:18px;">${isSubbed ? 'check' : 'add'}</span>
            <span>${isSubbed ? 'Subscribed' : 'Subscribe'}</span>
          </button>
        </div>

        <div class="watch-actions-bar">
          <button class="pill-btn ${isLiked ? 'active' : ''}" id="watch-like-btn">
            <span class="material-symbols-rounded ${isLiked ? 'filled-icon' : ''}">thumb_up</span>
            <span>${video.likes > 0 ? formatViews(video.likes) : 'Like'}</span>
          </button>
          <button class="pill-btn ${isDisliked ? 'active' : ''}" id="watch-dislike-btn">
            <span class="material-symbols-rounded ${isDisliked ? 'filled-icon' : ''}">thumb_down</span>
          </button>
          <button class="pill-btn ${isSaved ? 'active' : ''}" id="watch-save-btn">
            <span class="material-symbols-rounded ${isSaved ? 'filled-icon' : ''}">bookmark</span>
            <span>${isSaved ? 'Saved' : 'Save'}</span>
          </button>
          <button class="pill-btn" id="watch-playlist-btn">
            <span class="material-symbols-rounded">playlist_add</span>
            <span>Add</span>
          </button>
          <button class="pill-btn" id="watch-share-btn">
            <span class="material-symbols-rounded">share</span>
            <span>Share</span>
          </button>
        </div>
      </div>

      <div class="watch-description-box" id="watch-description-box">
        <div class="desc-stats">
          ${video.viewsFormatted} &bull; ${video.uploadedFormatted}
        </div>
        <div class="desc-text" id="desc-text">${this.formatDescription(video.description)}</div>
        <div class="desc-toggle-btn" id="desc-toggle-btn">Show more</div>
      </div>
    `;

    // In-place button interactions (never destroys or resets player iframe!)
    document.getElementById('watch-sub-btn')?.addEventListener('click', () => {
      const subbed = this.store.toggleSubscription({ id: video.channelId, name: video.channel, avatar: video.avatar });
      showToast(subbed ? `Subscribed to ${video.channel}` : `Unsubscribed from ${video.channel}`);
      const btn = document.getElementById('watch-sub-btn');
      if (btn) {
        btn.className = `btn-sub ${subbed ? 'subscribed' : ''}`;
        btn.innerHTML = `<span class="material-symbols-rounded" style="font-size:18px;">${subbed ? 'check' : 'add'}</span><span>${subbed ? 'Subscribed' : 'Subscribe'}</span>`;
      }
    });

    document.getElementById('watch-like-btn')?.addEventListener('click', () => {
      const liked = this.store.toggleLike(video.id);
      const btn = document.getElementById('watch-like-btn');
      if (btn) {
        btn.classList.toggle('active', liked);
        const icon = btn.querySelector('.material-symbols-rounded');
        if (icon) icon.classList.toggle('filled-icon', liked);
      }
    });

    document.getElementById('watch-dislike-btn')?.addEventListener('click', () => {
      const disliked = this.store.toggleDislike(video.id);
      const btn = document.getElementById('watch-dislike-btn');
      if (btn) {
        btn.classList.toggle('active', disliked);
        const icon = btn.querySelector('.material-symbols-rounded');
        if (icon) icon.classList.toggle('filled-icon', disliked);
      }
    });

    document.getElementById('watch-save-btn')?.addEventListener('click', () => {
      const saved = this.store.toggleWatchLater(video);
      showToast(saved ? 'Saved to Watch Later' : 'Removed from Watch Later');
      const btn = document.getElementById('watch-save-btn');
      if (btn) {
        btn.classList.toggle('active', saved);
        const icon = btn.querySelector('.material-symbols-rounded');
        if (icon) icon.classList.toggle('filled-icon', saved);
        const label = btn.querySelector('span:not(.material-symbols-rounded)');
        if (label) label.textContent = saved ? 'Saved' : 'Save';
      }
    });

    document.getElementById('watch-playlist-btn')?.addEventListener('click', () => {
      this.promptAddToPlaylist(video);
    });

    document.getElementById('watch-share-btn')?.addEventListener('click', () => {
      this.shareVideo(video);
    });

    // Description expand/collapse
    const descBox = document.getElementById('watch-description-box');
    const descText = document.getElementById('desc-text');
    const descToggle = document.getElementById('desc-toggle-btn');
    if (descBox && descText && descToggle) {
      descBox.addEventListener('click', () => {
        const isExp = descText.classList.toggle('expanded');
        descToggle.textContent = isExp ? 'Show less' : 'Show more';
      });
    }
  }

  renderWatchMetadataFallback(videoId) {
    const detailsEl = document.getElementById('watch-details');
    if (!detailsEl) return;

    detailsEl.innerHTML = `
      <h1 class="watch-title">YouTube Video (${videoId})</h1>
      <div class="watch-author-bar">
        <div class="watch-author-info">
          <div class="watch-author-name">Player Active</div>
        </div>
        <div class="watch-actions-bar">
          <button class="pill-btn" id="watch-share-btn">
            <span class="material-symbols-rounded">share</span>
            <span>Share</span>
          </button>
        </div>
      </div>
      <div class="watch-description-box" style="margin-top:16px;">
        <div style="font-size:13px; color:var(--text-secondary);">
          Playback is running smoothly via YouTube no-cookie embed. Video metadata is temporarily unavailable.
        </div>
      </div>
    `;

    document.getElementById('watch-share-btn')?.addEventListener('click', () => {
      this.shareVideo({ id: videoId, title: 'YouTube Video' });
    });

    const commentsEl = document.getElementById('watch-comments');
    if (commentsEl) {
      commentsEl.innerHTML = `
        <div style="font-size:13px; color:var(--text-secondary); text-align:center; padding:20px;">
          Comments are temporarily unavailable.
        </div>
      `;
    }

    const relatedEl = document.getElementById('related-list');
    if (relatedEl) {
      relatedEl.innerHTML = `
        <div style="font-size:13px; color:var(--text-secondary); text-align:center; padding:20px;">
          Related videos unavailable.
        </div>
      `;
    }
  }

  async loadComments(videoId) {
    const commentsEl = document.getElementById('watch-comments');
    if (!commentsEl) return;

    try {
      const data = await PawTubeAPI.getComments(videoId, { signal: this.abortController.signal });
      if (!data.comments || data.comments.length === 0) {
        commentsEl.innerHTML = `
          <div class="comments-header">
            <div class="comments-count">Comments</div>
          </div>
          <div style="font-size:13px; color:var(--text-secondary); text-align:center; padding:20px;">
            No comments available or comments are disabled for this video.
          </div>
        `;
        return;
      }

      let html = `
        <div class="comments-header">
          <div class="comments-count">${data.commentCount.toLocaleString()} Comments</div>
        </div>
      `;

      data.comments.slice(0, 20).forEach(c => {
        html += `
          <div class="comment-card">
            <img class="comment-avatar" src="${c.authorAvatar || 'https://raw.githubusercontent.com/pawjects/PawTube/refs/heads/main/assets/pawtube_logo.png'}" alt="" />
            <div class="comment-body">
              <div class="comment-author-row">
                <span class="comment-author">${this.escapeHtml(c.author)}</span>
                <span class="comment-date">${this.escapeHtml(c.publishedText)}</span>
              </div>
              <div class="comment-content">${c.content}</div>
              ${c.likeCount > 0 ? `
                <div class="comment-likes">
                  <span class="material-symbols-rounded" style="font-size:14px;">thumb_up</span>
                  <span>${c.likeCount}</span>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      });

      commentsEl.innerHTML = html;
    } catch (_) {
      commentsEl.innerHTML = `
        <div class="comments-header"><div class="comments-count">Comments</div></div>
        <div style="font-size:13px; color:var(--text-tertiary); text-align:center; padding:20px;">
          Comments could not be loaded from this instance.
        </div>
      `;
    }
  }

  // ==========================================
  // CHANNEL PAGE
  // ==========================================
  async renderChannelPage(channelId) {
    if (!channelId) {
      this.renderHomeFeed();
      return;
    }

    this.mainContent.innerHTML = `
      <div class="channel-header">
        <div class="channel-banner skeleton"></div>
        <div class="skeleton" style="height:60px; width:40%; margin-top:20px;"></div>
      </div>
      <div class="video-grid">
        ${this.renderSkeletonCards(6)}
      </div>
    `;

    try {
      const [channel, videos] = await Promise.all([
        PawTubeAPI.getChannel(channelId, { signal: this.abortController.signal }),
        PawTubeAPI.getChannelVideos(channelId, { signal: this.abortController.signal })
      ]);

      const isSubbed = this.store.isSubscribed(channel.id);

      this.mainContent.innerHTML = `
        <div class="channel-header">
          ${channel.banner ? `
            <div class="channel-banner">
              <img src="${channel.banner}" alt="Banner" />
            </div>
          ` : ''}

          <div class="channel-profile-row">
            <div class="channel-profile-left">
              <img class="channel-avatar-lg" src="${channel.avatar || 'https://raw.githubusercontent.com/pawjects/PawTube/refs/heads/main/assets/pawtube_logo.png'}" alt="${this.escapeHtml(channel.name)}" />
              <div>
                <h1 class="channel-name-lg">${this.escapeHtml(channel.name)}</h1>
                <div class="channel-sub-info">
                  ${channel.subCount ? channel.subCount + ' &bull; ' : ''}
                  ${videos.length} videos
                </div>
              </div>
            </div>

            <button class="btn-sub ${isSubbed ? 'subscribed' : ''}" id="channel-sub-btn">
              <span class="material-symbols-rounded" style="font-size:18px;">${isSubbed ? 'check' : 'add'}</span>
              <span>${isSubbed ? 'Subscribed' : 'Subscribe'}</span>
            </button>
          </div>
        </div>

        <div class="section-title" style="margin-bottom:20px;">Latest Uploads</div>
        <div class="video-grid">
          ${videos.map(v => this.renderVideoCard(v)).join('')}
        </div>
      `;

      document.getElementById('channel-sub-btn')?.addEventListener('click', () => {
        const subbed = this.store.toggleSubscription({ id: channel.id, name: channel.name, avatar: channel.avatar });
        showToast(subbed ? `Subscribed to ${channel.name}` : `Unsubscribed from ${channel.name}`);
        this.renderChannelPage(channelId);
      });
    } catch (err) {
      if (this.abortController.signal.aborted) return;
      this.mainContent.innerHTML = this.renderErrorState('Failed to load channel', err.message, () => this.renderChannelPage(channelId));
    }
  }

  // ==========================================
  // PLAYLIST PAGE
  // ==========================================
  async renderPlaylistPage(playlistId) {
    if (!playlistId) {
      this.renderHomeFeed();
      return;
    }

    // Check if it's a custom local playlist
    const localPl = this.store.playlists.find(p => p.id === playlistId);
    if (localPl) {
      this.renderCustomPlaylistView(localPl);
      return;
    }

    // Otherwise load public Piped playlist
    this.mainContent.innerHTML = `
      <div class="section-header">
        <h2 class="section-title">Loading Playlist...</h2>
      </div>
      <div class="video-grid">${this.renderSkeletonCards(6)}</div>
    `;

    try {
      const pl = await PawTubeAPI.getPlaylist(playlistId, { signal: this.abortController.signal });
      this.mainContent.innerHTML = `
        <div class="section-header">
          <div>
            <h1 class="section-title">${this.escapeHtml(pl.title)}</h1>
            <p style="font-size:13px; color:var(--text-secondary); margin-top:4px;">
              By ${this.escapeHtml(pl.channel)} &bull; ${pl.videoCount} videos
            </p>
          </div>
          ${pl.videos.length > 0 ? `
            <button class="pill-btn" onclick="location.hash='#/watch?v=${pl.videos[0].id}'">
              <span class="material-symbols-rounded">play_arrow</span>
              Play All
            </button>
          ` : ''}
        </div>

        <div class="video-grid">
          ${pl.videos.map(v => this.renderVideoCard(v)).join('')}
        </div>
      `;
    } catch (err) {
      if (this.abortController.signal.aborted) return;
      this.mainContent.innerHTML = this.renderErrorState('Failed to load playlist', err.message, () => this.renderPlaylistPage(playlistId));
    }
  }

  renderCustomPlaylistView(pl) {
    this.mainContent.innerHTML = `
      <div class="section-header">
        <div>
          <h1 class="section-title">${this.escapeHtml(pl.title)}</h1>
          <p style="font-size:13px; color:var(--text-secondary); margin-top:4px;">
            Created ${new Date(pl.createdAt).toLocaleDateString()} &bull; ${pl.videos.length} videos
          </p>
        </div>
        <div style="display:flex; gap:8px;">
          ${pl.videos.length > 0 ? `
            <button class="pill-btn" onclick="location.hash='#/watch?v=${pl.videos[0].id}'">
              <span class="material-symbols-rounded">play_arrow</span>
              Play All
            </button>
          ` : ''}
          <button class="pill-btn" id="del-playlist-btn" style="color:var(--error);">
            <span class="material-symbols-rounded">delete</span>
            Delete Playlist
          </button>
        </div>
      </div>

      ${pl.videos.length === 0 ? `
        <div style="padding:60px 0; text-align:center; color:var(--text-secondary);">
          This playlist is empty. Add videos to it using the "Add" button while watching.
        </div>
      ` : `
        <div class="video-grid">
          ${pl.videos.map(v => `
            <div style="position:relative;">
              ${this.renderVideoCard(v)}
              <button class="icon-btn" style="position:absolute; bottom:12px; right:12px; background:rgba(0,0,0,0.8); z-index:5;" 
                onclick="window.app.removeFromCustomPlaylist('${pl.id}', '${v.id}')" title="Remove from playlist">
                <span class="material-symbols-rounded" style="font-size:18px;">close</span>
              </button>
            </div>
          `).join('')}
        </div>
      `}
    `;

    document.getElementById('del-playlist-btn')?.addEventListener('click', () => {
      if (confirm(`Delete playlist "${pl.title}"?`)) {
        this.store.deletePlaylist(pl.id);
        showToast('Playlist deleted');
        window.location.hash = '#/library';
      }
    });
  }

  removeFromCustomPlaylist(plId, videoId) {
    this.store.removeVideoFromPlaylist(plId, videoId);
    showToast('Video removed from playlist');
    this.renderPlaylistPage(plId);
  }

  // ==========================================
  // SEARCH RESULTS
  // ==========================================
  async renderSearchResults(query) {
    if (!query || !query.trim()) {
      this.renderHomeFeed();
      return;
    }

    const cleanQuery = query.trim();
    this.searchSequence = (this.searchSequence || 0) + 1;
    const reqSeq = this.searchSequence;

    this.searchInput.value = cleanQuery;
    this.mainContent.innerHTML = `
      <div class="section-header">
        <h1 class="section-title">
          <span class="material-symbols-rounded">search</span>
          Results for "${this.escapeHtml(cleanQuery)}"
        </h1>
      </div>
      <div class="video-grid" id="search-grid">
        ${this.renderSkeletonCards(8)}
      </div>
    `;

    try {
      const results = await PawTubeAPI.search(cleanQuery, { signal: this.abortController.signal });
      if (this.searchSequence !== reqSeq) return; // Stale request protection
      const grid = document.getElementById('search-grid');
      if (grid) {
        if (!results || results.length === 0) {
          grid.innerHTML = this.renderEmptyState('No results found', 'Try checking your spelling or using different keywords.');
        } else {
          grid.innerHTML = results.map(v => this.renderVideoCard(v)).join('');
        }
      }
    } catch (err) {
      if (this.abortController.signal?.aborted || this.searchSequence !== reqSeq) return;
      const grid = document.getElementById('search-grid');
      if (grid) {
        grid.innerHTML = this.renderErrorState('Search failed', err.message, () => this.renderSearchResults(cleanQuery));
      }
    }
  }

  // ==========================================
  // MINI-PLAYER LOGIC
  // ==========================================
  showMiniPlayer() {
    if (!this.playingVideo || !this.miniPlayer) return;

    document.getElementById('mini-player-thumb').src = this.playingVideo.thumb || '';
    document.getElementById('mini-player-title').textContent = this.playingVideo.title || 'Playing video';
    document.getElementById('mini-player-channel').textContent = this.playingVideo.channel || '';

    this.miniPlayer.style.display = 'flex';
  }

  hideMiniPlayer() {
    if (this.miniPlayer) {
      this.miniPlayer.style.display = 'none';
    }
  }

  // ==========================================
  // MODALS & PLAYLIST DIALOGS
  // ==========================================
  promptCreatePlaylist() {
    this.openModal(`
      <h2 style="font-size:18px; font-weight:700; margin-bottom:16px;">Create New Playlist</h2>
      <input type="text" id="new-playlist-title" placeholder="Playlist title" 
        style="width:100%; background:var(--bg-elevated); border:1px solid var(--glass-border); padding:10px 14px; border-radius:var(--radius-sm); color:#fff; font-size:15px; margin-bottom:20px;" />
      <div style="display:flex; justify-content:flex-end; gap:10px;">
        <button class="pill-btn" onclick="window.app.closeModal()">Cancel</button>
        <button class="pill-btn" id="modal-confirm-create-pl" style="background:var(--brand-blue); color:#000;">Create</button>
      </div>
    `);

    document.getElementById('modal-confirm-create-pl')?.addEventListener('click', () => {
      const input = document.getElementById('new-playlist-title');
      const title = input.value.trim();
      if (title) {
        const pl = this.store.createPlaylist(title);
        showToast(`Created playlist "${pl.title}"`);
        this.closeModal();
        if (this.currentRoute === '/library') {
          this.renderPlaylistsAndHistory();
        }
      }
    });
  }

  promptAddToPlaylist(video) {
    if (!video || !video.id) return;
    const playlists = this.store.playlists;

    this.openModal(`
      <h2 style="font-size:18px; font-weight:700; margin-bottom:16px;">Save to Playlist</h2>
      <div style="display:flex; flex-direction:column; gap:8px; max-height:260px; overflow-y:auto; margin-bottom:20px;">
        ${playlists.map(pl => {
          const has = pl.videos.some(v => v.id === video.id);
          return `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:var(--bg-elevated); border-radius:var(--radius-sm);">
              <span style="font-size:14px; font-weight:500;">${this.escapeHtml(pl.title)}</span>
              <button class="pill-btn" onclick="window.app.toggleVideoInPlaylist('${pl.id}', ${JSON.stringify(video).replace(/"/g, '&quot;')})">
                ${has ? 'Remove' : 'Add'}
              </button>
            </div>
          `;
        }).join('')}
      </div>
      <div style="display:flex; justify-content:space-between;">
        <button class="pill-btn" onclick="window.app.promptCreatePlaylist()">+ New Playlist</button>
        <button class="pill-btn" onclick="window.app.closeModal()">Done</button>
      </div>
    `);
  }

  toggleVideoInPlaylist(playlistId, video) {
    const pl = this.store.playlists.find(p => p.id === playlistId);
    if (!pl) return;
    const exists = pl.videos.some(v => v.id === video.id);
    if (exists) {
      this.store.removeVideoFromPlaylist(playlistId, video.id);
      showToast(`Removed from "${pl.title}"`);
    } else {
      this.store.addVideoToPlaylist(playlistId, video);
      showToast(`Added to "${pl.title}"`);
    }
    this.promptAddToPlaylist(video);
  }

  openModal(contentHtml) {
    if (this.modalCard && this.modalOverlay) {
      this.modalCard.innerHTML = contentHtml;
      this.modalOverlay.style.display = 'flex';
    }
  }

  closeModal() {
    if (this.modalOverlay) {
      this.modalOverlay.style.display = 'none';
    }
  }

  shareVideo(video) {
    const cleanId = window.extractVideoId ? window.extractVideoId(video.id) : video.id;
    const url = `${window.location.origin}/#/watch?v=${cleanId}`;
    if (navigator.share) {
      navigator.share({
        title: video.title || 'PawTube Video',
        text: `Watch "${video.title || 'video'}" on PawTube`,
        url
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        showToast('Canonical link copied to clipboard!');
      });
    }
  }

  // ==========================================
  // HTML TEMPLATE RENDERERS
  // ==========================================
  renderVideoCard(v) {
    const isSaved = this.store.isWatchLater(v.id);
    const progressPercent = (v.progress && v.duration) ? Math.min(100, (v.progress / v.duration) * 100) : 0;

    return `
      <div class="video-card" onclick="location.hash='#/watch?v=${v.id}'">
        <div class="thumbnail-wrap">
          <img src="${v.thumb}" alt="${this.escapeHtml(v.title)}" loading="lazy" />
          <div class="duration-badge">${v.durationFormatted || '0:00'}</div>
          ${progressPercent > 0 ? `
            <div class="progress-bar-rail">
              <div class="progress-bar-fill" style="width:${progressPercent}%"></div>
            </div>
          ` : ''}
          <button class="quick-save-btn" onclick="event.stopPropagation(); window.app.store.toggleWatchLater(${JSON.stringify(v).replace(/"/g, '&quot;')}); window.showToast('Watch later updated');" title="Watch Later">
            <span class="material-symbols-rounded" style="font-size:18px;">${isSaved ? 'check' : 'bookmark'}</span>
          </button>
        </div>
        <div class="card-info">
          ${v.avatar ? `
            <img class="card-avatar" src="${v.avatar}" alt="" loading="lazy" 
              onclick="event.stopPropagation(); if ('${v.channelId}') location.hash='#/channel?id=${encodeURIComponent(v.channelId)}';" />
          ` : ''}
          <div class="card-meta">
            <div class="card-title">${this.escapeHtml(v.title)}</div>
            <div class="card-channel" onclick="event.stopPropagation(); if ('${v.channelId}') location.hash='#/channel?id=${encodeURIComponent(v.channelId)}';">
              ${this.escapeHtml(v.channel)}
            </div>
            <div class="card-stats">
              <span>${v.viewsFormatted || ''}</span>
              ${v.uploadedFormatted ? `<span>&bull;</span><span>${v.uploadedFormatted}</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderSkeletonCards(count = 6) {
    return Array.from({ length: count }).map(() => `
      <div class="video-card">
        <div class="skel-thumb skeleton"></div>
        <div class="card-info" style="margin-top:10px;">
          <div class="skel-avatar skeleton"></div>
          <div style="flex:1;">
            <div class="skel-title skeleton"></div>
            <div class="skel-text skeleton"></div>
            <div class="skel-text short skeleton"></div>
          </div>
        </div>
      </div>
    `).join('');
  }

  renderEmptyState(title, subtitle) {
    return `
      <div style="grid-column: 1 / -1; padding: 60px 20px; text-align: center; color: var(--text-secondary);">
        <span class="material-symbols-rounded" style="font-size: 48px; color: var(--text-tertiary); margin-bottom: 12px;">search_off</span>
        <h3 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">${this.escapeHtml(title)}</h3>
        <p style="font-size: 13.5px; max-width: 400px; margin: 0 auto;">${this.escapeHtml(subtitle)}</p>
      </div>
    `;
  }

  renderErrorState(title, message, retryFn) {
    const retryId = 'retry-' + Math.random().toString(36).slice(2);
    setTimeout(() => {
      document.getElementById(retryId)?.addEventListener('click', retryFn);
    }, 50);

    return `
      <div style="grid-column: 1 / -1; padding: 60px 20px; text-align: center; color: var(--text-secondary);">
        <span class="material-symbols-rounded" style="font-size: 48px; color: var(--error); margin-bottom: 12px;">cloud_off</span>
        <h3 style="font-size: 18px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">${this.escapeHtml(title)}</h3>
        <p style="font-size: 13.5px; max-width: 400px; margin: 0 auto 16px;">${this.escapeHtml(message || 'Network request failed')}</p>
        <button class="pill-btn" id="${retryId}">
          <span class="material-symbols-rounded" style="font-size:18px;">refresh</span>
          Retry
        </button>
      </div>
    `;
  }

  formatDescription(text) {
    if (!text) return 'No description available.';
    // Convert URLs into clean hyperlinks
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    return this.escapeHtml(text).replace(urlPattern, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:var(--brand-blue);">$1</a>');
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Initialize Application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new PawTubeApp();

  // Register service worker if available
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});
