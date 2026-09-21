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
   * Requirement 16: The primary PawTube player MUST be https://www.youtube-nocookie.com/embed/{VIDEO_ID}
   * For dQw4w9WgXcQ it must produce https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ
   */
  function buildNoCookieEmbedUrl(videoId, options = null) {
    const cleanId = extractVideoId(videoId);
    if (!cleanId) return null;

    const base = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(cleanId)}`;
    if (!options || Object.keys(options).length === 0) {
      return base;
    }

    const params = new URLSearchParams();
    if (options.autoplay !== undefined) {
      params.set('autoplay', options.autoplay ? '1' : '0');
    }
    if (options.playsinline !== false) {
      params.set('playsinline', '1');
    }
    if (options.controls !== undefined) {
      params.set('controls', options.controls ? '1' : '0');
    }
    params.set('rel', '0');
    params.set('modestbranding', '1');
    if (options.enablejsapi !== false) {
      params.set('enablejsapi', '1');
    }

    if (options.start && Number.isFinite(options.start) && options.start > 0) {
      params.set('start', String(Math.floor(options.start)));
    }

    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }

  // Alias for backwards compatibility
  const buildEmbedUrl = buildNoCookieEmbedUrl;

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
      this.controlsUi = null;
      this.loadingOverlay = null;
      this.errorOverlay = null;
      this.onVideoChangeCallbacks = [];

      // Control bar & playback state
      this.isPlaying = false;
      this.currentTime = 0;
      this.duration = 0;
      this.volume = 100;
      this.isMuted = false;
      this.isScrubbing = false;
      this.idleTimeout = null;
      this.progressInterval = null;

      // Picture-in-Picture state
      this.isPip = false;
      this.pipWindow = null;
      this.pipPlaceholder = null;
      this.originalParent = null;
      this.isDetachedFloat = false;

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
      iframeContainer.id = 'pawtube-iframe-container';
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
        this.postMessage('listening');
      });

      iframeContainer.appendChild(this.iframe);
      this.wrapper.appendChild(iframeContainer);

      // 2. Custom Player UI & Bottom Control Bar
      this.controlsUi = document.createElement('div');
      this.controlsUi.className = 'custom-player-ui';
      this.controlsUi.id = 'custom-player-ui';
      this.controlsUi.innerHTML = `
        <div class="player-bottom-controls" id="player-bottom-controls">
          <!-- Progress Bar Container -->
          <div class="player-progress-container" id="player-progress-container" role="slider" aria-label="Seek time" tabindex="0">
            <div class="player-progress-buffered" id="player-progress-buffered" style="width: 0%;"></div>
            <div class="player-progress-hover" id="player-progress-hover" style="width: 0%;"></div>
            <div class="player-progress-filled" id="player-progress-filled" style="width: 0%;"></div>
            <div class="player-progress-thumb" id="player-progress-thumb" style="left: 0%;"></div>
            <div class="player-time-tooltip" id="player-time-tooltip">0:00</div>
          </div>

          <!-- Controls Row -->
          <div class="player-controls-row" id="player-controls-row">
            <!-- Left Side Controls -->
            <div class="player-controls-left" id="player-controls-left">
              <button type="button" class="player-btn" id="player-play-btn" aria-label="Play or Pause (k)" title="Play/Pause (k)">
                <span class="material-symbols-rounded" id="player-play-icon">play_arrow</span>
              </button>

              <div class="player-volume-group" id="player-volume-group">
                <button type="button" class="player-btn" id="player-volume-btn" aria-label="Mute or Unmute (m)" title="Mute/Unmute (m)">
                  <span class="material-symbols-rounded" id="player-volume-icon">volume_up</span>
                </button>
                <input type="range" class="player-volume-slider" id="player-volume-slider" min="0" max="100" value="100" aria-label="Volume" />
              </div>

              <div class="player-time-display" id="player-time-display">
                <span id="player-current-time">0:00</span> / <span id="player-duration">0:00</span>
              </div>
            </div>

            <!-- Right Side Controls -->
            <div class="player-controls-right" id="player-controls-right">
              <!-- NATIVE PICTURE-IN-PICTURE BUTTON -->
              <button type="button" class="player-btn" id="player-pip-btn" aria-label="Picture in Picture (p)" title="Picture-in-Picture (Detached Viewing)">
                <span class="material-symbols-rounded" id="player-pip-icon">picture_in_picture_alt</span>
              </button>

              <button type="button" class="player-btn" id="player-theater-btn" aria-label="Theater Mode (t)" title="Theater Mode (t)">
                <span class="material-symbols-rounded" id="player-theater-icon">rectangle</span>
              </button>

              <button type="button" class="player-btn" id="player-fullscreen-btn" aria-label="Fullscreen (f)" title="Fullscreen (f)">
                <span class="material-symbols-rounded" id="player-fullscreen-icon">fullscreen</span>
              </button>
            </div>
          </div>
        </div>
      `;
      this.wrapper.appendChild(this.controlsUi);

      // 3. Loading Overlay (Skeleton / Spinner)
      this.loadingOverlay = document.createElement('div');
      this.loadingOverlay.className = 'player-loading-overlay';
      this.loadingOverlay.id = 'pawtube-player-loading';
      this.loadingOverlay.style.cssText = 'position: absolute; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.75); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 5; color: #fff; pointer-events: none;';
      this.loadingOverlay.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; gap: 12px;">
          <div style="width: 40px; height: 40px; border: 3px solid rgba(255,255,255,0.2); border-top-color: var(--brand-blue, #3b82f6); border-radius: 50%; animation: pawtube-spin 0.8s linear infinite;"></div>
          <span style="font-size: 13px; font-weight: 500; letter-spacing: 0.5px; opacity: 0.8;">Loading video...</span>
        </div>
      `;
      this.wrapper.appendChild(this.loadingOverlay);

      // 4. Error Overlay
      this.errorOverlay = document.createElement('div');
      this.errorOverlay.className = 'player-error-overlay';
      this.errorOverlay.id = 'pawtube-player-error';
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

      this.initControlBarEvents();
    }

    initControlBarEvents() {
      // DOM elements
      this.playBtn = this.wrapper.querySelector('#player-play-btn');
      this.playIcon = this.wrapper.querySelector('#player-play-icon');
      this.volumeBtn = this.wrapper.querySelector('#player-volume-btn');
      this.volumeIcon = this.wrapper.querySelector('#player-volume-icon');
      this.volumeSlider = this.wrapper.querySelector('#player-volume-slider');
      this.currentTimeEl = this.wrapper.querySelector('#player-current-time');
      this.durationEl = this.wrapper.querySelector('#player-duration');
      this.pipBtn = this.wrapper.querySelector('#player-pip-btn');
      this.pipIcon = this.wrapper.querySelector('#player-pip-icon');
      this.theaterBtn = this.wrapper.querySelector('#player-theater-btn');
      this.theaterIcon = this.wrapper.querySelector('#player-theater-icon');
      this.fullscreenBtn = this.wrapper.querySelector('#player-fullscreen-btn');
      this.fullscreenIcon = this.wrapper.querySelector('#player-fullscreen-icon');
      this.bottomControls = this.wrapper.querySelector('#player-bottom-controls');

      // Progress elements
      this.progressContainer = this.wrapper.querySelector('#player-progress-container');
      this.progressBuffered = this.wrapper.querySelector('#player-progress-buffered');
      this.progressHover = this.wrapper.querySelector('#player-progress-hover');
      this.progressFilled = this.wrapper.querySelector('#player-progress-filled');
      this.progressThumb = this.wrapper.querySelector('#player-progress-thumb');
      this.timeTooltip = this.wrapper.querySelector('#player-time-tooltip');

      // 1. Play / Pause Button
      this.playBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePlay();
      });

      // 2. Volume & Mute Controls
      this.volumeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleMute();
      });

      this.volumeSlider?.addEventListener('input', (e) => {
        e.stopPropagation();
        this.setVolume(Number(e.target.value));
      });

      // 3. PICTURE-IN-PICTURE BUTTON (triggers browser's native Picture-in-Picture API)
      this.pipBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePictureInPicture();
      });

      // 4. Theater Mode Button
      this.theaterBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleTheater();
      });

      // 5. Fullscreen Button
      this.fullscreenBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleFullscreen();
      });

      // 6. Progress Bar Seeking & Hover Tooltip
      if (this.progressContainer) {
        const updateHover = (e) => {
          const rect = this.progressContainer.getBoundingClientRect();
          if (rect.width <= 0) return;
          const pos = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
          const ratio = pos / rect.width;
          if (this.progressHover) {
            this.progressHover.style.width = `${ratio * 100}%`;
          }
          if (this.timeTooltip && this.duration > 0) {
            const hoverSec = ratio * this.duration;
            this.timeTooltip.textContent = this.formatTime(hoverSec);
            this.timeTooltip.style.left = `${pos}px`;
            this.timeTooltip.style.display = 'block';
          }
        };

        this.progressContainer.addEventListener('mousemove', updateHover);
        this.progressContainer.addEventListener('mouseleave', () => {
          if (this.timeTooltip) this.timeTooltip.style.display = 'none';
          if (this.progressHover) this.progressHover.style.width = '0%';
        });

        this.progressContainer.addEventListener('click', (e) => {
          const rect = this.progressContainer.getBoundingClientRect();
          if (rect.width <= 0) return;
          const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
          if (this.duration > 0) {
            this.seekTo(ratio * this.duration);
          }
        });
      }

      // 7. Idle Auto-hide Management
      const resetIdle = () => {
        this.wrapper.classList.remove('idle');
        if (this.idleTimeout) clearTimeout(this.idleTimeout);
        if (this.isPlaying) {
          this.idleTimeout = setTimeout(() => {
            this.wrapper.classList.add('idle');
          }, 2600);
        }
      };

      this.wrapper.addEventListener('mousemove', resetIdle);
      this.wrapper.addEventListener('pointerdown', resetIdle);
      this.bottomControls?.addEventListener('mouseenter', () => {
        if (this.idleTimeout) clearTimeout(this.idleTimeout);
        this.wrapper.classList.remove('idle');
      });
      this.bottomControls?.addEventListener('mouseleave', resetIdle);

      // 8. Fullscreen changes
      document.addEventListener('fullscreenchange', () => {
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        this.wrapper.classList.toggle('fullscreen', isFs);
        this.updateFullscreenUI(isFs);
      });

      // 9. YouTube Embed postMessage listener
      window.addEventListener('message', (event) => {
        if (!event.data) return;
        let data;
        try {
          data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        } catch (e) {
          return;
        }
        if (!data || typeof data !== 'object') return;

        if (data.event === 'infoDelivery' && data.info) {
          if (data.info.playerState !== undefined) {
            // 1: playing, 2: paused, 0: ended
            if (data.info.playerState === 1) {
              this.isPlaying = true;
              this.updatePlayUI(true);
            } else if (data.info.playerState === 2 || data.info.playerState === 0) {
              this.isPlaying = false;
              this.updatePlayUI(false);
            }
          }
          if (typeof data.info.currentTime === 'number') {
            this.currentTime = data.info.currentTime;
          }
          if (typeof data.info.duration === 'number' && data.info.duration > 0) {
            this.duration = data.info.duration;
          }
          if (typeof data.info.videoLoadedFraction === 'number') {
            if (this.progressBuffered) {
              this.progressBuffered.style.width = `${Math.min(100, data.info.videoLoadedFraction * 100)}%`;
            }
          }
          this.updateProgressUI();
        } else if (data.event === 'onReady') {
          this.postMessage('listening');
        }
      });

      // 10. Periodic ticker while playing for smooth progress updates
      setInterval(() => {
        if (this.isPlaying && this.duration > 0) {
          this.currentTime = Math.min(this.duration, this.currentTime + 0.5);
          this.updateProgressUI();
        }
      }, 500);

      // 11. Keyboard Shortcuts
      window.addEventListener('keydown', (e) => {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.isContentEditable) {
          return;
        }

        // 'p' or 'P' toggles Picture-in-Picture
        if (e.key === 'p' || e.key === 'P') {
          if (this.currentVideoId) {
            e.preventDefault();
            this.togglePictureInPicture();
          }
        } else if (e.key === ' ' || e.key === 'k' || e.key === 'K') {
          if (this.currentVideoId) {
            e.preventDefault();
            this.togglePlay();
          }
        } else if (e.key === 'f' || e.key === 'F') {
          if (this.currentVideoId) {
            e.preventDefault();
            this.toggleFullscreen();
          }
        } else if (e.key === 't' || e.key === 'T') {
          if (this.currentVideoId) {
            e.preventDefault();
            this.toggleTheater();
          }
        } else if (e.key === 'm' || e.key === 'M') {
          if (this.currentVideoId) {
            e.preventDefault();
            this.toggleMute();
          }
        } else if (e.key === 'ArrowLeft') {
          if (this.currentVideoId && this.currentTime !== undefined) {
            e.preventDefault();
            this.seekTo(Math.max(0, this.currentTime - 5));
          }
        } else if (e.key === 'ArrowRight') {
          if (this.currentVideoId && this.currentTime !== undefined && this.duration) {
            e.preventDefault();
            this.seekTo(Math.min(this.duration, this.currentTime + 5));
          }
        }
      });
    }

    /**
     * Sends postMessage commands to YouTube Iframe Embed API
     */
    postMessage(func, args = []) {
      if (!this.iframe || !this.iframe.contentWindow) return;
      try {
        this.iframe.contentWindow.postMessage(
          JSON.stringify({
            event: 'command',
            func: func,
            args: args
          }),
          '*'
        );
      } catch (e) {
        // Suppress cross-origin security errors
      }
    }

    /**
     * Toggles playback between play and pause.
     */
    togglePlay() {
      this.isPlaying = !this.isPlaying;
      this.postMessage(this.isPlaying ? 'playVideo' : 'pauseVideo');
      this.updatePlayUI(this.isPlaying);
      this.wrapper.classList.remove('idle');
    }

    /**
     * Toggles mute state.
     */
    toggleMute() {
      this.isMuted = !this.isMuted;
      this.postMessage(this.isMuted ? 'mute' : 'unMute');
      this.updateVolumeUI(this.volume, this.isMuted);
    }

    /**
     * Sets playback volume (0-100).
     */
    setVolume(val) {
      this.volume = Math.max(0, Math.min(100, val));
      this.isMuted = this.volume === 0;
      this.postMessage('setVolume', [this.volume]);
      if (this.isMuted) {
        this.postMessage('mute');
      } else {
        this.postMessage('unMute');
      }
      this.updateVolumeUI(this.volume, this.isMuted);
    }

    /**
     * Seeks to specified time in seconds.
     */
    seekTo(seconds) {
      const target = Math.max(0, Math.min(this.duration || 0, seconds));
      this.currentTime = target;
      this.postMessage('seekTo', [target, true]);
      this.updateProgressUI();
    }

    formatTime(seconds) {
      if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
      const total = Math.floor(seconds);
      const hrs = Math.floor(total / 3600);
      const mins = Math.floor((total % 3600) / 60);
      const secs = total % 60;
      const sStr = secs < 10 ? '0' + secs : String(secs);
      if (hrs > 0) {
        const mStr = mins < 10 ? '0' + mins : String(mins);
        return `${hrs}:${mStr}:${sStr}`;
      }
      return `${mins}:${sStr}`;
    }

    updatePlayUI(isPlaying) {
      if (this.playIcon) {
        this.playIcon.textContent = isPlaying ? 'pause' : 'play_arrow';
      }
      if (this.playBtn) {
        this.playBtn.title = isPlaying ? 'Pause (k)' : 'Play (k)';
        this.playBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
      }
    }

    updateVolumeUI(volume, isMuted) {
      if (this.volumeIcon) {
        if (isMuted || volume === 0) {
          this.volumeIcon.textContent = 'volume_off';
        } else if (volume < 50) {
          this.volumeIcon.textContent = 'volume_down';
        } else {
          this.volumeIcon.textContent = 'volume_up';
        }
      }
      if (this.volumeSlider) {
        this.volumeSlider.value = isMuted ? 0 : volume;
      }
    }

    updateProgressUI() {
      if (this.currentTimeEl) {
        this.currentTimeEl.textContent = this.formatTime(this.currentTime);
      }
      if (this.durationEl && this.duration > 0) {
        this.durationEl.textContent = this.formatTime(this.duration);
      }
      if (this.duration > 0) {
        const percent = Math.min(100, Math.max(0, (this.currentTime / this.duration) * 100));
        if (this.progressFilled) {
          this.progressFilled.style.width = `${percent}%`;
        }
        if (this.progressThumb) {
          this.progressThumb.style.left = `${percent}%`;
        }
      }
    }

    updateFullscreenUI(isFs) {
      if (this.fullscreenIcon) {
        this.fullscreenIcon.textContent = isFs ? 'fullscreen_exit' : 'fullscreen';
      }
      if (this.fullscreenBtn) {
        this.fullscreenBtn.title = isFs ? 'Exit Fullscreen (f)' : 'Fullscreen (f)';
        this.fullscreenBtn.setAttribute('aria-label', isFs ? 'Exit Fullscreen' : 'Fullscreen');
      }
    }

    updateTheaterUI(isTheater) {
      if (this.theaterIcon) {
        this.theaterIcon.textContent = isTheater ? 'branding_watermark' : 'rectangle';
      }
      if (this.theaterBtn) {
        this.theaterBtn.title = isTheater ? 'Default view (t)' : 'Theater mode (t)';
        this.theaterBtn.setAttribute('aria-label', isTheater ? 'Default view' : 'Theater mode');
      }
    }

    updatePipUI(active) {
      if (this.pipBtn) {
        this.pipBtn.classList.toggle('active', !!active);
        this.pipBtn.title = active ? 'Exit Picture-in-Picture (p)' : 'Picture in Picture (p)';
        this.pipBtn.setAttribute('aria-label', active ? 'Exit Picture in Picture' : 'Picture in Picture');
      }
      if (this.pipIcon) {
        this.pipIcon.textContent = active ? 'picture_in_picture' : 'picture_in_picture_alt';
      }
    }

    /**
     * Toggles Picture-in-Picture using the browser's native Picture-in-Picture API.
     */
    async togglePictureInPicture() {
      if (this.isPip) {
        return await this.exitPictureInPicture();
      } else {
        return await this.requestPictureInPicture();
      }
    }

    /**
     * Triggers the browser's native Picture-in-Picture API to allow detached viewing.
     * Prioritizes Document Picture-in-Picture API (Chrome/Edge 116+) which detaches
     * the player into a native always-on-top window, with fallback to HTMLVideoElement PiP
     * and in-viewport floating detached player for restricted iframe environments.
     */
    async requestPictureInPicture() {
      // 1. Browser's Native Document Picture-in-Picture API (Chrome/Edge 116+)
      if ('documentPictureInPicture' in window && typeof window.documentPictureInPicture.requestWindow === 'function') {
        try {
          const rect = this.wrapper.getBoundingClientRect();
          const width = Math.min(Math.max(Math.round(rect.width) || 640, 360), 1280);
          const height = Math.round(width * (9 / 16));

          const pipWindow = await window.documentPictureInPicture.requestWindow({
            width,
            height
          });

          this.pipWindow = pipWindow;
          this.isPip = true;

          // Copy all stylesheets from host document into the PiP window so styling remains pristine
          [...document.styleSheets].forEach((sheet) => {
            try {
              if (sheet.href) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.type = sheet.type || 'text/css';
                link.href = sheet.href;
                pipWindow.document.head.appendChild(link);
              } else if (sheet.cssRules) {
                const style = document.createElement('style');
                [...sheet.cssRules].forEach(rule => {
                  style.appendChild(document.createTextNode(rule.cssText));
                });
                pipWindow.document.head.appendChild(style);
              }
            } catch (e) {
              if (sheet.href) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = sheet.href;
                pipWindow.document.head.appendChild(link);
              }
            }
          });

          // Inject PiP container reset styles
          const pipStyle = document.createElement('style');
          pipStyle.textContent = `
            * { box-sizing: border-box; }
            html, body {
              margin: 0;
              padding: 0;
              width: 100vw;
              height: 100vh;
              background: #000;
              overflow: hidden;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            }
            .custom-player-wrapper {
              width: 100vw !important;
              height: 100vh !important;
              border-radius: 0 !important;
              position: absolute !important;
              inset: 0 !important;
            }
          `;
          pipWindow.document.head.appendChild(pipStyle);

          // Create placeholder in original mount location
          if (this.wrapper.parentNode) {
            this.pipPlaceholder = document.createElement('div');
            this.pipPlaceholder.className = 'player-pip-placeholder';
            this.pipPlaceholder.id = 'pawtube-pip-placeholder';
            this.pipPlaceholder.innerHTML = `
              <span class="material-symbols-rounded" style="font-size: 48px; color: var(--brand-blue, #3b82f6); animation: pawtube-spin 4s linear infinite;">picture_in_picture_alt</span>
              <div style="font-size: 15px; font-weight: 600; color: #fff; margin-top: 8px;">Playing in Picture-in-Picture</div>
              <div style="font-size: 13px; color: rgba(255,255,255,0.7); max-width: 320px; text-align: center; margin-top: 4px;">Detached window is active. You can browse other apps or tabs.</div>
              <button type="button" class="pill-btn primary" id="pawtube-pip-return-btn" style="margin-top: 14px; padding: 8px 20px; border-radius: 9999px; background: var(--brand-blue, #3b82f6); color: #fff; border: none; font-size: 13px; font-weight: 500; cursor: pointer;">
                Return Player to Tab
              </button>
            `;
            this.pipPlaceholder.querySelector('#pawtube-pip-return-btn')?.addEventListener('click', () => {
              this.exitPictureInPicture();
            });
            this.originalParent = this.wrapper.parentNode;
            this.originalParent.replaceChild(this.pipPlaceholder, this.wrapper);
          }

          // Move player wrapper into PiP window body
          pipWindow.document.body.appendChild(this.wrapper);
          this.updatePipUI(true);

          // Handle window closing (user closes PiP floating window)
          pipWindow.addEventListener('pagehide', () => {
            this.restoreFromPip();
          });

          if (window.showToast) {
            window.showToast('Detached viewing active in Picture-in-Picture window');
          }
          return true;
        } catch (err) {
          console.warn('[PawTube Player] Document PiP request error:', err);
        }
      }

      // 2. Browser's Native Video Picture-in-Picture API
      if (document.pictureInPictureEnabled) {
        try {
          if (this.videoElement && typeof this.videoElement.requestPictureInPicture === 'function' && this.videoElement.src) {
            await this.videoElement.requestPictureInPicture();
            this.isPip = true;
            this.updatePipUI(true);
            return true;
          }
        } catch (err) {
          console.warn('[PawTube Player] Video PiP request error:', err);
        }
      }

      // 3. Fallback: In-viewport floating detached player (when running in restricted sandbox/iframe)
      this.toggleDetachedFloat(true);
      if (window.showToast) {
        window.showToast('Detached viewing enabled. Open in a new tab for native OS floating window.');
      }
      return false;
    }

    /**
     * Exits Picture-in-Picture mode.
     */
    async exitPictureInPicture() {
      if (this.pipWindow) {
        try {
          this.pipWindow.close();
        } catch (e) {
          // ignore
        }
        this.restoreFromPip();
      } else if (document.pictureInPictureElement) {
        try {
          await document.exitPictureInPicture();
        } catch (e) {
          // ignore
        }
        this.isPip = false;
        this.updatePipUI(false);
      } else if (this.isDetachedFloat) {
        this.toggleDetachedFloat(false);
      }
    }

    restoreFromPip() {
      if (this.pipPlaceholder && this.pipPlaceholder.parentNode) {
        this.pipPlaceholder.parentNode.replaceChild(this.wrapper, this.pipPlaceholder);
        this.pipPlaceholder = null;
      } else if (this.originalParent) {
        this.originalParent.appendChild(this.wrapper);
      }
      this.pipWindow = null;
      this.isPip = false;
      this.updatePipUI(false);
    }

    toggleDetachedFloat(force) {
      const state = force !== undefined ? force : !this.isDetachedFloat;
      this.isDetachedFloat = state;
      this.isPip = state;
      this.wrapper.classList.toggle('detached-pip', state);
      this.updatePipUI(state);
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
      this.isPlaying = true;
      this.currentTime = 0;
      this.duration = 0;
      this.updatePlayUI(true);
      this.updateProgressUI();

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

    /**
     * Loads a normalized MediaItem via the provider architecture.
     */
    loadMedia(mediaItem, streamInfo = null, options = {}) {
      if (!mediaItem) return false;
      const id = typeof mediaItem === 'string' ? mediaItem : (mediaItem.id || mediaItem.videoId);
      return this.loadVideo(id, {
        ...options,
        title: mediaItem.title,
        author: mediaItem.author || mediaItem.channel,
        thumb: mediaItem.thumb
      });
    }

    onVideoChange(cb) {
      if (typeof cb === 'function') {
        this.onVideoChangeCallbacks.push(cb);
      }
    }

    toggleTheater() {
      this.isTheater = !this.isTheater;
      const watchContainer = document.querySelector('.watch-container') || document.querySelector('.watch-layout');
      if (watchContainer) {
        watchContainer.classList.toggle('theater-mode', this.isTheater);
      }
      this.updateTheaterUI(this.isTheater);
      return this.isTheater;
    }

    toggleFullscreen() {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (this.wrapper.requestFullscreen) {
          this.wrapper.requestFullscreen();
        } else if (this.wrapper.webkitRequestFullscreen) {
          this.wrapper.webkitRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
      }
    }
  }

  // Export canonical utilities and instance to window
  window.extractVideoId = extractVideoId;
  window.buildNoCookieEmbedUrl = buildNoCookieEmbedUrl;
  window.buildEmbedUrl = buildNoCookieEmbedUrl;
  window.VideoPlayer = VideoPlayer;

  // Single canonical player instance
  window.videoPlayer = new VideoPlayer();

  if (window.pawtubePlayerAdapter) {
    window.pawtubePlayerAdapter.setPlayer(window.videoPlayer);
  }

  // Backward-compatibility aliases
  window.customPlayer = window.videoPlayer;
  window.initPlayer = function (id, options) {
    return window.videoPlayer.loadVideo(id, options);
  };
})();
