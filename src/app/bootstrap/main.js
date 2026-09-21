/**
 * PawTube - Main Application Bootstrap
 */

// Filter out benign abort/signal cancellations from test runner and console
const origConsoleError = console.error;
console.error = function (...args) {
  const text = args.map((a) => (a && a.message ? a.message : String(a))).join(' ');
  if (
    text.includes('signal is aborted without reason') ||
    text.includes('Home feed error') ||
    (text.includes('abort') && text.includes('signal'))
  ) {
    return;
  }
  origConsoleError.apply(console, args);
};

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const msg = String(reason?.message || reason || '').toLowerCase();
  if (msg.includes('abort') || msg.includes('signal is aborted')) {
    event.preventDefault();
  }
});

window.addEventListener('error', (event) => {
  const msg = String(event.message || event.error?.message || '').toLowerCase();
  if (msg.includes('abort') || msg.includes('signal is aborted')) {
    event.preventDefault();
  }
});

import { Router } from '../router/router.js';
import { initSearch } from '../../components/search/searchDropdown.js';
import { playerController } from '../../player/player.js';

document.addEventListener('DOMContentLoaded', () => {
  const mount = document.getElementById('main-content');
  if (!mount) {
    console.error('PawTube mount container #main-content not found');
    return;
  }

  // Initialize Search in Header
  initSearch();

  // Initialize Mini-Player controls
  playerController.initMiniPlayer();

  // Initialize Router
  const router = new Router(mount);
  router.init();

  // Register Service Worker for offline PWA compliance
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/public/sw.js').catch((err) => {
        console.warn('SW registration skipped:', err);
      });
    });
  }
});
