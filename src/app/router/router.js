/**
 * PawTube - Centralized Router
 * Handles both HTML5 pathname routes (/watch?v=..., /shorts) and hash routes (#/watch?v=...)
 * Ensures direct pasted URLs work upon refresh.
 */

import { extractVideoId } from '../../player/videoId.js';
import { extractPlaylistId } from '../../utils/playlistId.js';
import { playerController } from '../../player/player.js';
import { bottomNavManager } from '../../components/nav/bottomNavManager.js';
import { renderHomePage } from '../../pages/Home/homePage.js';
import { renderShortsPage } from '../../pages/Shorts/shortsPage.js';
import { renderLibraryPage } from '../../pages/Library/libraryPage.js';
import { renderYouPage } from '../../pages/You/youPage.js';
import { renderWatchPage } from '../../pages/Watch/watchPage.js';
import { renderSearchPage } from '../../pages/Search/searchPage.js';
import { renderChannelPage } from '../../pages/Channel/channelPage.js';
import { renderPlaylistPage } from '../../pages/Playlist/playlistPage.js';

export class Router {
  constructor(mountElement) {
    this.mount = mountElement;
    this.currentRoute = null;
  }

  init() {
    bottomNavManager.init();
    window.addEventListener('hashchange', () => this.handleRoute());
    window.addEventListener('popstate', () => this.handleRoute());
    this.handleRoute();
  }

  parseLocation() {
    const pathname = window.location.pathname || '/';
    const hash = window.location.hash || '';
    const search = window.location.search || '';

    // If there is a hash route like #/watch?v=..., #/channel/..., #/playlist..., or #/shorts
    if (hash.startsWith('#')) {
      const hashClean = hash.slice(1);
      const [rawPath, qs] = hashClean.split('?');
      const params = new URLSearchParams(qs || '');
      const path = rawPath || '/home';

      // 1. Check for /watch in hash FIRST: e.g. #/watch?v=... or #/watch?v=...&list=...
      if (path.startsWith('/watch') || (params.has('v') && !path.startsWith('/playlist') && !path.startsWith('/channel'))) {
        let videoId = params.get('v') || params.get('id');
        if (!videoId) {
          const parts = path.split('/');
          if (parts.length >= 3) videoId = parts[2];
        }
        return { path: '/watch', params, videoId, raw: hashClean };
      }

      // 2. Check for /playlist in hash e.g. #/playlist?list=... or #/playlist/PL... or #/pawtube/playlist/PL...
      if (
        path.startsWith('/playlist') ||
        path.startsWith('/playlists') ||
        path.startsWith('/pawtube/playlist') ||
        (params.has('list') && !params.has('v'))
      ) {
        const playlistId = params.get('list') || extractPlaylistId(hashClean);
        return { path: '/playlist', params, playlistId, raw: hashClean };
      }

      // 3. Check for /channel/:id in hash
      if (path.startsWith('/channel/')) {
        const channelId = decodeURIComponent(path.replace(/^\/channel\//, ''));
        return { path: '/channel', params, channelId, raw: hashClean };
      }

      return { path, params, raw: hashClean };
    }

    // Direct pathname support for watch e.g. /watch?v=...&list=...
    if (pathname.startsWith('/watch')) {
      const parts = pathname.split('/');
      const params = new URLSearchParams(search);
      let videoId = params.get('v') || params.get('id');
      if (!videoId && parts.length >= 3) {
        videoId = parts[2];
      }
      return { path: '/watch', params, videoId };
    }

    // Direct pathname support (e.g. /playlist/ID, /pawtube/playlist/ID, /playlist?list=ID)
    if (pathname.includes('/playlist') || pathname.includes('/playlists')) {
      const params = new URLSearchParams(search);
      const playlistId = params.get('list') || extractPlaylistId(pathname + search);
      return { path: '/playlist', params, playlistId };
    }

    // Direct pathname support for channel (e.g. /channel/CHANNEL_ID)
    if (pathname.startsWith('/channel/')) {
      const channelId = decodeURIComponent(pathname.replace(/^\/channel\//, ''));
      const params = new URLSearchParams(search);
      return { path: '/channel', params, channelId };
    }

    if (pathname.length > 1 && pathname !== '/index.html') {
      const params = new URLSearchParams(search);
      if (params.has('v')) {
        return { path: '/watch', params, videoId: params.get('v') };
      }
      if (params.has('list')) {
        return { path: '/playlist', params, playlistId: params.get('list') };
      }
      return { path: pathname, params };
    }

    // Fallback default
    const params = new URLSearchParams(search);
    const v = params.get('v');
    if (v) {
      return { path: '/watch', params, videoId: v };
    }
    const list = params.get('list');
    if (list) {
      return { path: '/playlist', params, playlistId: list };
    }

    return { path: '/home', params };
  }

  handleRoute() {
    const loc = this.parseLocation();
    const path = loc.path.toLowerCase();
    this.currentRoute = path;

    // Check direct video playback in any route format
    const possibleVideoId = extractVideoId(window.location.href);
    const isNavigatingToWatch = path.includes('watch') || (possibleVideoId && !['/home', '/shorts', '/library', '/you', '/channel', '/search', '/playlist', '/pawtube'].some(p => path.startsWith(p)));

    // Handle mini-player transitions: preserve playback when navigating away from watch
    if (!isNavigatingToWatch && playerController.state.mode === 'watch' && playerController.state.currentVideoId) {
      playerController.onNavigateAwayFromWatch();
    }

    if (isNavigatingToWatch) {
      const videoId = loc.videoId || loc.params.get('v') || possibleVideoId;
      const rawTime = loc.params.get('t') || loc.params.get('start') || '0';
      const startTime = parseFloat(rawTime) || 0;
      this.updateNavigationUI('/watch');
      renderWatchPage(this.mount, videoId, startTime);
      window.scrollTo(0, 0);
      return;
    }

    if (path.includes('playlist') || loc.playlistId) {
      const playlistId = loc.playlistId || loc.params.get('list') || extractPlaylistId(window.location.href);
      this.updateNavigationUI('/playlist');
      renderPlaylistPage(this.mount, playlistId);
      window.scrollTo(0, 0);
      return;
    }

    if (path.includes('channel')) {
      const channelId = loc.channelId || loc.params.get('id') || '';
      this.updateNavigationUI('/channel');
      renderChannelPage(this.mount, channelId);
      window.scrollTo(0, 0);
      return;
    }

    if (path.includes('shorts')) {
      this.updateNavigationUI('/shorts');
      renderShortsPage(this.mount);
      window.scrollTo(0, 0);
      return;
    }

    if (path.includes('library')) {
      this.updateNavigationUI('/library');
      renderLibraryPage(this.mount);
      window.scrollTo(0, 0);
      return;
    }

    if (path.includes('you')) {
      this.updateNavigationUI('/you');
      renderYouPage(this.mount);
      window.scrollTo(0, 0);
      return;
    }

    if (path.includes('search')) {
      const query = loc.params.get('q') || '';
      this.updateNavigationUI('/search');
      renderSearchPage(this.mount, query);
      window.scrollTo(0, 0);
      return;
    }

    // Default: Home
    this.updateNavigationUI('/home');
    renderHomePage(this.mount);
    window.scrollTo(0, 0);
  }

  updateNavigationUI(route) {
    // Update active nav links across desktop and mobile
    const links = document.querySelectorAll('[data-route]');
    links.forEach((el) => {
      const r = el.getAttribute('data-route');
      if (r === route) {
        el.classList.add('active');
        el.setAttribute('aria-selected', 'true');
      } else {
        el.classList.remove('active');
        el.setAttribute('aria-selected', 'false');
      }
    });

    // Delegate bottom nav pill positioning and animation
    bottomNavManager.setActive(route);
  }
}

export default Router;
