/**
 * PawTube - Centralized Router
 * Handles both HTML5 pathname routes (/watch?v=..., /shorts) and hash routes (#/watch?v=...)
 * Ensures direct pasted URLs work upon refresh.
 */

import { extractVideoId } from '../../player/videoId.js';
import { playerController } from '../../player/player.js';
import { renderHomePage } from '../../pages/Home/homePage.js';
import { renderShortsPage } from '../../pages/Shorts/shortsPage.js';
import { renderLibraryPage } from '../../pages/Library/libraryPage.js';
import { renderYouPage } from '../../pages/You/youPage.js';
import { renderWatchPage } from '../../pages/Watch/watchPage.js';
import { renderSearchPage } from '../../pages/Search/searchPage.js';

export class Router {
  constructor(mountElement) {
    this.mount = mountElement;
    this.currentRoute = null;
  }

  init() {
    window.addEventListener('hashchange', () => this.handleRoute());
    window.addEventListener('popstate', () => this.handleRoute());
    this.handleRoute();
  }

  parseLocation() {
    const pathname = window.location.pathname || '/';
    const hash = window.location.hash || '';
    const search = window.location.search || '';

    // If there is a hash route like #/watch?v=... or #/shorts
    if (hash.startsWith('#')) {
      const hashClean = hash.slice(1);
      const [path, qs] = hashClean.split('?');
      const params = new URLSearchParams(qs || '');
      return { path: path || '/home', params, raw: hashClean };
    }

    // Direct pathname support (e.g. /watch?v=... or /shorts or /watch/VIDEO_ID)
    if (pathname.startsWith('/watch')) {
      const parts = pathname.split('/');
      const params = new URLSearchParams(search);
      let videoId = params.get('v') || params.get('id');
      if (!videoId && parts.length >= 3) {
        videoId = parts[2];
      }
      return { path: '/watch', params, videoId };
    }

    if (pathname.length > 1 && pathname !== '/index.html') {
      const params = new URLSearchParams(search);
      return { path: pathname, params };
    }

    // Fallback default
    const params = new URLSearchParams(search);
    const v = params.get('v');
    if (v) {
      return { path: '/watch', params, videoId: v };
    }

    return { path: '/home', params };
  }

  handleRoute() {
    const loc = this.parseLocation();
    const path = loc.path.toLowerCase();
    const previousRoute = this.currentRoute;
    this.currentRoute = path;

    // Check direct video playback in any route format
    const possibleVideoId = extractVideoId(window.location.href);
    const isNavigatingToWatch = path.includes('watch') || (possibleVideoId && !['/home', '/shorts', '/library', '/you'].includes(path));

    // Handle mini-player transitions
    if (previousRoute && previousRoute.includes('watch') && !isNavigatingToWatch) {
      playerController.onNavigateAwayFromWatch();
    } else if (isNavigatingToWatch) {
      playerController.hideMiniPlayer();
    }

    if (isNavigatingToWatch) {
      const videoId = loc.videoId || loc.params.get('v') || possibleVideoId;
      this.updateNavigationUI('/watch');
      renderWatchPage(this.mount, videoId);
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
      } else {
        el.classList.remove('active');
      }
    });

    // Update bottom nav sliding pill position if applicable
    const activeBottom = document.querySelector(`.bottom-nav [data-route="${route}"]`);
    const pill = document.getElementById('bnav-pill');
    if (activeBottom && pill) {
      const rect = activeBottom.getBoundingClientRect();
      const parent = activeBottom.parentElement.getBoundingClientRect();
      pill.style.width = `${rect.width}px`;
      pill.style.transform = `translateX(${rect.left - parent.left}px)`;
    }
  }
}

export default Router;
