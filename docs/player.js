/**
 * PawTube - Canonical Video Player & Video Routing Utilities
 * Strictly uses YouTube No-Cookie Embed Player (https://www.youtube-nocookie.com/embed/VIDEO_ID)
 * Completely decouples video playback from Piped metadata fetching.
 */

(function () {
  'use strict';

  /**
   * Canonical Video ID Extractor
   * Safely extracts and validates an 11-character YouTube video ID from any format.
   * Handles:
   *   - "dQw4w9WgXcQ"
   *   - "/watch?v=dQw4w9WgXcQ"
   *   - "/watch/dQw4w9WgXcQ"
   *   - "https://pawtube.example/watch?v=dQw4w9WgXcQ"
   *   - "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
   *   - "https://youtu.be/dQw4w9WgXcQ"
   *   - "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
   *   - "#/watch?v=dQw4w9WgXcQ"
   *   - "#/watch/dQw4w9WgXcQ"
   *   - URLs with extra query params (&t=30s, &feature=share, etc.)
   * Returns: 11-char string or null
   */
  function extractVideoId(input) {
    if (!input || typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (!trimmed) return null;

    // 1. Direct 11-character YouTube video ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }

    try {
      let urlStr = trimmed;
      // Strip leading hash if present (e.g. #/watch?v=...)
      if (urlStr.startsWith('#')) {
        urlStr = urlStr.slice(1);
      }

      // 2. Query parameter ?v=ID or &v=ID
      const vQueryMatch = urlStr.match(/[?&]v=([a-zA-Z0-9_-]{11})(?:[&/#]|$)/);
      if (vQueryMatch) {
        return vQueryMatch[1];
      }

      // 3. Known path prefixes: /watch/ID, /embed/ID, youtu.be/ID, /shorts/ID, /v/ID
      const pathMatch = urlStr.match(/(?:^|\/|\.)(?:watch\/|embed\/|youtu\.be\/|shorts\/|v\/)([a-zA-Z0-9_-]{11})(?:[?&#/]|$)/);
      if (pathMatch) {
        return pathMatch[1];
      }

      // 4. Fallback URL parser
      const fullUrl = urlStr.startsWith('http://') || urlStr.startsWith('https://')
        ? urlStr
        : 'https://dummy.local/' + urlStr.replace(/^\/+/, '');
      const parsed = new URL(fullUrl);

      if (parsed.searchParams.has('v')) {
        const v = parsed.searchParams.get('v');
        if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
          return v;
        }
      }

      if (parsed.hostname.includes('youtu.be')) {
        const id = parsed.pathname.replace(/^\/+/, '').split('/')[0];
        if (/^[a-zA-Z0-9_-]{11}$/.test(id)) {
          return id;
        }
      }
    } catch (e) {
      // Gracefully handle malformed URL strings
    }

    return null;
  }

  /**
   * Canonical YouTube No-Cookie Embed URL Builder
   * Constructs the safe, tracker-free embed player URL for a given video ID.
   * Format: https://www.youtube-nocookie.com/embed/{videoId}?autoplay=1&playsinline=1&controls=1&rel=0&modestbranding=1&enablejsapi=1
   */
  function buildEmbedUrl(videoId, options = {}) {
    const cleanId = extractVideoId(videoId);
    if (!cleanId) return null;

    const params = new URLSearchParams({
      autoplay: options.autoplay !== undefined ? (options.autoplay ? '1' : '0') : '1',
      playsinline: '1',
      controls: options.controls !== undefined ? (options.controls ? '1' : '0') : '1',
      rel: '0',
      modestbranding: '1',
      enablejsapi: '1'
    });

    if (options.start && Number.isFinite(options.start) && options.start > 0) {
      params.set('start', String(Math.floor(options.start)));
    }

    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(cleanId)}?${params.toString()}`;
  }

  /**
   * Canonical VideoPlayer implementation
   * Renders and manages the YouTube No-Cookie iframe with AMOLED liquid-glass styling.
   */
  class VideoPlayer {
    constructor() {
      this.currentVideoId = null;
      this.isTheater = false;
      this.wrapper = null;
      this.iframe = null;
      this.loadingOverlay = null;
      this.errorOverlay = null;
      this.onVideoChangeCallbacks = [];

      this.initDOM();
    }

    initDOM() {
      this.wrapper = document.createElement('div');
      this.wrapper.className = 'custom-player-wrapper';
      this.wrapper.id = 'pawtube-player-wrapper';
      this.wrapper.style.cssText = 'position: relative; width: 100%; height: 100%; background: #000; overflow: hidden; border-radius: var(--radius-lg, 16px);';

      // 1. Iframe Container
      const iframeContainer = document.createElement('div');
      iframeContainer.className = 'player-iframe-container';
      iframeContainer.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; background: #000; z-index: 1;';

      this.iframe = document.createElement('iframe');
      this.iframe.id = 'pawtube-embed-iframe';
      this.iframe.title = 'PawTube No-Cookie Video Player';
      this.iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
      this.iframe.setAttribute('allowfullscreen', 'true');
      this.iframe.setAttribute('loading', 'eager');
      this.iframe.style.cssText = 'width: 100%; height: 100%; border: none; display: block; background: #000;';

      this.iframe.addEventListener('load', () => {
        if (this.loadingOverlay) {
          this.loadingOverlay.style.display = 'none';
        }
      });

      iframeContainer.appendChild(this.iframe);
      this.wrapper.appendChild(iframeContainer);

      // 2. Loading Overlay (Skeleton / Spinner)
      this.loadingOverlay = document.createElement('div');
      this.loadingOverlay.className = 'player-loading-overlay';
      this.loadingOverlay.style.cssText = 'position: absolute; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 5; color: #fff; pointer-events: none;';
      this.loadingOverlay.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 12px;">
          <div style="width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.2); border-top-color: var(--brand-blue, #3b82f6); border-radius: 50%; animation: pawtube-spin 0.8s linear infinite;"></div>
          <span style="font-size: 13px; font-weight: 500; letter-spacing: 0.5px; opacity: 0.8;">Loading video...</span>
        </div>
      `;
      this.wrapper.appendChild(this.loadingOverlay);

      // 3. Error Overlay
      this.errorOverlay = document.createElement('div');
      this.errorOverlay.className = 'player-error-overlay';
      this.errorOverlay.style.cssText = 'position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center; background: #0a0a0c; z-index: 10; color: #fff; padding: 24px; text-align: center; gap: 16px;';
      this.errorOverlay.innerHTML = `
        <span class="material-symbols-rounded" style="font-size: 48px; color: #ef4444;">error_outline</span>
        <div style="font-size: 16px; font-weight: 600;">Unable to Play Video</div>
        <div id="player-error-message" style="font-size: 13px; color: rgba(255,255,255,0.7); max-width: 360px;">Invalid or missing video ID.</div>
        <a href="#/home" class="btn-primary" style="margin-top: 8px; padding: 8px 20px; border-radius: 9999px; background: var(--brand-blue, #3b82f6); color: #fff; text-decoration: none; font-size: 13px; font-weight: 500;">
          Return to Home
        </a>
      `;
      this.wrapper.appendChild(this.errorOverlay);

      // Inject spinner animation if not present
      if (!document.getElementById('pawtube-player-keyframes')) {
        const style = document.createElement('style');
        style.id = 'pawtube-player-keyframes';
        style.textContent = `
          @keyframes pawtube-spin {
            to { transform: rotate(360deg); }
          }
        `;
        document.head.appendChild(style);
      }
    }

    /**
     * Loads a video into the no-cookie player.
     * @param {string} videoId - video ID, watch path, or full YouTube URL
     * @param {object} options - player options (autoplay, start, controls, force)
     */
    loadVideo(videoId, options = {}) {
      const cleanId = extractVideoId(videoId);

      if (!cleanId) {
        console.warn('[PawTube Player] Invalid video ID provided:', videoId);
        this.showError('Invalid video ID. Please check the URL and try again.');
        return false;
      }

      // If already playing this video and not forced, keep playing
      if (this.currentVideoId === cleanId && !options.force) {
        return true;
      }

      this.currentVideoId = cleanId;
      this.hideError();

      const embedUrl = buildEmbedUrl(cleanId, options);
      if (!embedUrl) {
        this.showError('Failed to construct embed player URL.');
        return false;
      }

      // Show loading indicator
      if (this.loadingOverlay) {
        this.loadingOverlay.style.display = 'flex';
      }

      // Update iframe source cleanly
      this.iframe.src = embedUrl;

      // Notify any listeners
      this.onVideoChangeCallbacks.forEach((cb) => {
        try {
          cb(cleanId);
        } catch (e) {
          console.error('[PawTube Player] Callback error:', e);
        }
      });

      return true;
    }

    /**
     * Stops playback and frees resources.
     */
    stop() {
      this.currentVideoId = null;
      if (this.iframe) {
        this.iframe.src = 'about:blank';
      }
      if (this.loadingOverlay) {
        this.loadingOverlay.style.display = 'none';
      }
      this.hideError();
    }

    showError(message) {
      if (this.iframe) {
        this.iframe.src = 'about:blank';
      }
      if (this.loadingOverlay) {
        this.loadingOverlay.style.display = 'none';
      }
      if (this.errorOverlay) {
        const msgEl = this.errorOverlay.querySelector('#player-error-message');
        if (msgEl) msgEl.textContent = message || 'An unexpected error occurred.';
        this.errorOverlay.style.display = 'flex';
      }
    }

    hideError() {
      if (this.errorOverlay) {
        this.errorOverlay.style.display = 'none';
      }
    }

    getCurrentVideoId() {
      return this.currentVideoId;
    }

    getWrapper() {
      return this.wrapper;
    }

    onVideoChange(cb) {
      if (typeof cb === 'function') {
        this.onVideoChangeCallbacks.push(cb);
      }
    }

    toggleTheater() {
      this.isTheater = !this.isTheater;
      const watchContainer = document.querySelector('.watch-container');
      if (watchContainer) {
        watchContainer.classList.toggle('theater-mode', this.isTheater);
      }
      return this.isTheater;
    }

    toggleFullscreen() {
      if (!document.fullscreenElement) {
        if (this.wrapper.requestFullscreen) {
          this.wrapper.requestFullscreen();
        } else if (this.wrapper.webkitRequestFullscreen) {
          this.wrapper.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
    }
  }

  // Export canonical utilities and instance to window
  window.extractVideoId = extractVideoId;
  window.buildEmbedUrl = buildEmbedUrl;
  window.VideoPlayer = VideoPlayer;

  // Single canonical player instance
  window.videoPlayer = new VideoPlayer();

  // Backward-compatibility aliases
  window.customPlayer = window.videoPlayer;
  window.initPlayer = function (id, options) {
    return window.videoPlayer.loadVideo(id, options);
  };
})();
