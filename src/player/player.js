/**
 * PawTube - Unified Persistent Video Player Controller
 * Single source of truth for player state across Watch and Mini-Player modes.
 * Eliminates duplicate playback systems and maintains seamless playback during navigation.
 */

import { buildNoCookieEmbedUrl } from './embed.js';
import { extractVideoId } from './videoId.js';
import { addToHistory, updateHistoryProgress, markVideoCompleted } from '../storage/history/historyStorage.js';
import { formatDuration } from '../api/normalization/mediaModels.js';

export class VideoPlayerController {
  constructor() {
    this.host = null;
    this.iframe = null;
    this.slotElement = null;

    // Single source of truth for player state
    this.state = {
      currentVideoId: null,
      currentMetadata: null,
      isPlaying: false,
      isBuffering: false,
      currentTime: 0,
      duration: 0,
      volume: 100,
      isMuted: false,
      playbackRate: 1.0,
      captionsEnabled: false,
      mode: 'hidden', // 'watch' | 'mini' | 'hidden'
      isFullscreen: false,
      isTheatre: false
    };

    this.isDraggingSeek = false;
    this.controlsTimeout = null;
    this.tickerInterval = null;
    this.boundOnMessage = this.handleIframeMessage.bind(this);
    this.boundSyncPosition = this.syncPositionWithSlot.bind(this);
    this.resizeObserver = null;
    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized) return;
    this.host = document.getElementById('pawtube-persistent-player');
    this.iframe = document.getElementById('pawtube-iframe');
    if (!this.host || !this.iframe) return;

    this.bindPlayerEvents();
    this.startTicker();

    this.iframe.addEventListener('load', () => {
      this.sendListeningHandshake();
      setTimeout(() => this.sendListeningHandshake(), 300);
      setTimeout(() => this.sendListeningHandshake(), 1000);
    });

    window.addEventListener('message', this.boundOnMessage);
    window.addEventListener('scroll', this.boundSyncPosition, { passive: true });
    window.addEventListener('resize', this.boundSyncPosition, { passive: true });
    window.addEventListener('orientationchange', this.boundSyncPosition, { passive: true });

    const handleFullscreenChange = () => {
      this.state.isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
      this.host.classList.toggle('fullscreen', this.state.isFullscreen);
      const icon = this.host.querySelector('#icon-fullscreen');
      if (icon) icon.textContent = this.state.isFullscreen ? 'fullscreen_exit' : 'fullscreen';
      this.syncPositionWithSlot();
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    this.isInitialized = true;
  }

  initMiniPlayer() {
    this.init();
  }

  setMode(mode) {
    if (mode !== 'watch') {
      this.exitTheatreMode();
    }
    this.state.mode = mode;
    if (!this.host) return;

    this.host.classList.remove('mode-hidden', 'mode-watch', 'mode-mini');
    this.host.classList.add(`mode-${mode}`);

    if (mode === 'watch') {
      this.syncPositionWithSlot();
      this.updateProgressUI();
      this.updateVolumeUI();
      this.syncPlayStateUI();
    } else if (mode === 'mini') {
      // Clear manual coordinates so CSS floating dock takes over
      this.host.style.top = '';
      this.host.style.left = '';
      this.host.style.width = '';
      this.host.style.height = '';
      this.syncMiniPlayerUI();
    } else {
      this.host.style.top = '';
      this.host.style.left = '';
      this.host.style.width = '';
      this.host.style.height = '';
    }
  }

  /**
   * Attaches player to watch page container
   */
  attachToWatch(slot, videoId, metadata = null, startTime = 0) {
    this.init();
    const cleanId = extractVideoId(videoId);
    if (!cleanId) return;

    this.slotElement = slot;
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (slot && window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(this.boundSyncPosition);
      this.resizeObserver.observe(slot);
    }

    const isSameVideo = this.state.currentVideoId === cleanId;
    this.state.currentMetadata = metadata || this.state.currentMetadata;

    if (isSameVideo) {
      // Seamlessly expand from mini-player to watch mode
      this.setMode('watch');
      this.updateMetadata(metadata);
      return;
    }

    // New video: initialize
    this.state.currentVideoId = cleanId;
    this.state.currentTime = startTime || 0;
    const initialDuration = metadata
      ? (metadata.durationSeconds !== undefined && metadata.durationSeconds !== null
          ? metadata.durationSeconds
          : (metadata.duration || 0))
      : 0;
    this.state.duration = initialDuration;
    this.state.isPlaying = true;
    this.state.isBuffering = true;

    const embedUrl = buildNoCookieEmbedUrl(cleanId, {
      autoplay: 1,
      enablejsapi: 1,
      playsinline: 1,
      controls: 0,
      start: startTime
    });

    this.iframe.src = embedUrl;
    this.setMode('watch');
    this.updateMetadata(metadata);
    this.setBufferingState(true);

    // Record in history
    if (metadata) {
      addToHistory({
        id: cleanId,
        title: metadata.title || 'YouTube Video',
        author: metadata.author || metadata.channel || '',
        channel: metadata.channel || metadata.author || '',
        thumb: metadata.thumb || `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`,
        duration: this.state.duration,
        durationSeconds: this.state.duration,
        progress: startTime
      });
    }

    // Handshake with YouTube IFrame API (both listening event and immediate query)
    this.sendListeningHandshake();
    setTimeout(() => this.sendListeningHandshake(), 300);
    setTimeout(() => this.sendListeningHandshake(), 800);
    setTimeout(() => this.sendListeningHandshake(), 1600);
  }

  mountPlayer(slot, cleanId, metadata = null, startTime = 0) {
    return this.attachToWatch(slot, cleanId, metadata, startTime);
  }

  syncPositionWithSlot() {
    if (this.state.mode !== 'watch' || !this.host) return;

    if (this.state.isFullscreen) {
      this.host.style.top = '0px';
      this.host.style.left = '0px';
      this.host.style.width = '100vw';
      this.host.style.height = '100vh';
      return;
    }

    if (!this.slotElement) {
      this.slotElement = document.getElementById('watch-player-slot');
    }

    if (!this.slotElement) return;

    const rect = this.slotElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.host.style.top = `${rect.top}px`;
      this.host.style.left = `${rect.left}px`;
      this.host.style.width = `${rect.width}px`;
      this.host.style.height = `${rect.height}px`;
    }
  }

  onNavigateAwayFromWatch() {
    this.exitTheatreMode();
    if (this.state.currentVideoId) {
      updateHistoryProgress(this.state.currentVideoId, this.state.currentTime, this.state.duration, { immediate: true });
    }
    if (this.state.currentVideoId && this.state.mode === 'watch') {
      this.setMode('mini');
    }
  }

  showMiniPlayer(videoId, metadata = null) {
    this.init();
    if (videoId) {
      const cleanId = extractVideoId(videoId);
      if (cleanId !== this.state.currentVideoId) {
        this.state.currentVideoId = cleanId;
        this.iframe.src = buildNoCookieEmbedUrl(cleanId, {
          autoplay: 1,
          enablejsapi: 1,
          playsinline: 1,
          controls: 0
        });
      }
    }
    if (metadata) {
      this.updateMetadata(metadata);
    }
    this.setMode('mini');
  }

  closeMiniPlayer() {
    if (this.state.currentVideoId) {
      updateHistoryProgress(this.state.currentVideoId, this.state.currentTime, this.state.duration, { immediate: true });
    }
    this.pause();
    this.sendIframeCommand('stopVideo');
    this.state.currentVideoId = null;
    this.state.currentMetadata = null;
    this.state.currentTime = 0;
    this.state.duration = 0;
    this.iframe.src = 'about:blank';
    this.setMode('hidden');
  }

  hideMiniPlayer() {
    if (this.state.mode === 'mini') {
      this.setMode('hidden');
    }
  }

  expandToWatch() {
    if (!this.state.currentVideoId) return;
    window.location.hash = `#/watch?v=${encodeURIComponent(this.state.currentVideoId)}`;
  }

  bindPlayerEvents() {
    if (!this.host) return;

    const playPauseBtn = this.host.querySelector('#btn-play-pause');
    const centerPlay = this.host.querySelector('#player-center-play');
    const clickLayer = this.host.querySelector('#player-click-layer');
    const replayBtn = this.host.querySelector('#btn-replay-10');
    const forwardBtn = this.host.querySelector('#btn-forward-10');
    const volumeBtn = this.host.querySelector('#btn-volume');
    const volumeSlider = this.host.querySelector('#volume-slider');
    const captionsBtn = this.host.querySelector('#btn-captions');
    const settingsBtn = this.host.querySelector('#btn-settings');
    const settingsMenu = this.host.querySelector('#player-settings-menu');
    const speedMenuItem = this.host.querySelector('#menu-speed');
    const theatreToggleItem = this.host.querySelector('#menu-theatre-toggle');
    const theatreBtn = this.host.querySelector('#btn-theatre');
    const pipBtn = this.host.querySelector('#btn-pip');
    const fullscreenBtn = this.host.querySelector('#btn-fullscreen');
    const progressContainer = this.host.querySelector('#player-progress-container');

    // Mini-player elements
    const miniPlayBtn = this.host.querySelector('#mini-player-play-btn');
    const miniCloseBtn = this.host.querySelector('#mini-player-close-btn');
    const miniExpandTap = this.host.querySelector('#mini-player-expand-tap');
    const playerMediaBox = this.host.querySelector('#player-media-box');

    // Play/Pause toggles
    const handleTogglePlay = (e) => {
      e?.stopPropagation();
      this.togglePlay();
    };

    if (playPauseBtn) playPauseBtn.onclick = handleTogglePlay;
    if (centerPlay) centerPlay.onclick = handleTogglePlay;
    if (miniPlayBtn) miniPlayBtn.onclick = handleTogglePlay;

    // Mini player actions
    if (miniCloseBtn) {
      miniCloseBtn.onclick = (e) => {
        e.stopPropagation();
        this.closeMiniPlayer();
      };
    }

    if (miniExpandTap) {
      miniExpandTap.onclick = () => this.expandToWatch();
    }

    if (playerMediaBox) {
      playerMediaBox.onclick = (e) => {
        if (this.state.mode === 'mini') {
          e.stopPropagation();
          this.expandToWatch();
        }
      };
    }

    // Click Layer: Single-tap play/pause, Double-tap -10s / +10s seek
    if (clickLayer) {
      let clickTimer = null;
      clickLayer.onclick = (e) => {
        if (this.state.mode === 'mini') {
          this.expandToWatch();
          return;
        }
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
          this.togglePlay();
        }, 240);
      };

      clickLayer.ondblclick = (e) => {
        if (this.state.mode === 'mini') return;
        if (clickTimer) clearTimeout(clickTimer);
        const rect = clickLayer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        if (clickX < rect.width / 2) {
          this.triggerSeekRipple('left');
          this.seekRelative(-10);
        } else {
          this.triggerSeekRipple('right');
          this.seekRelative(10);
        }
      };
    }

    // Rewind / Forward
    if (replayBtn) replayBtn.onclick = (e) => { e.stopPropagation(); this.seekRelative(-10); };
    if (forwardBtn) forwardBtn.onclick = (e) => { e.stopPropagation(); this.seekRelative(10); };

    // Volume & Mute
    if (volumeBtn) volumeBtn.onclick = (e) => { e.stopPropagation(); this.toggleMute(); };
    if (volumeSlider) {
      volumeSlider.oninput = (e) => {
        this.setVolume(Number(e.target.value));
      };
    }

    // Captions
    if (captionsBtn) {
      captionsBtn.onclick = (e) => {
        e.stopPropagation();
        this.state.captionsEnabled = !this.state.captionsEnabled;
        captionsBtn.classList.toggle('active', this.state.captionsEnabled);
        this.sendIframeCommand(this.state.captionsEnabled ? 'loadModule' : 'unloadModule', ['captions']);
      };
    }

    // Settings Dropdown
    if (settingsBtn && settingsMenu) {
      settingsBtn.onclick = (e) => {
        e.stopPropagation();
        settingsMenu.classList.toggle('open');
      };

      document.addEventListener('click', (e) => {
        if (!settingsBtn.contains(e.target) && !settingsMenu.contains(e.target)) {
          settingsMenu.classList.remove('open');
        }
      });
    }

    // Playback Speed Cycle: 0.25 -> 0.5 -> 0.75 -> 1 -> 1.25 -> 1.5 -> 1.75 -> 2 -> 1
    const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    if (speedMenuItem) {
      speedMenuItem.onclick = (e) => {
        e.stopPropagation();
        const currentIdx = SPEEDS.indexOf(this.state.playbackRate);
        const nextIdx = (currentIdx + 1) % SPEEDS.length;
        this.setPlaybackRate(SPEEDS[nextIdx]);
      };
    }

    // Theatre Mode toggles
    if (theatreBtn) {
      theatreBtn.onclick = (e) => {
        e.stopPropagation();
        this.toggleTheatreMode();
      };
    }

    if (theatreToggleItem) {
      theatreToggleItem.onclick = (e) => {
        e.stopPropagation();
        this.toggleTheatreMode();
      };
    }

    // PiP button
    if (pipBtn) {
      pipBtn.onclick = (e) => {
        e.stopPropagation();
        this.setMode('mini');
        if (window.location.hash.startsWith('#/watch')) {
          window.location.hash = '#/home';
        }
      };
    }

    // Fullscreen button
    if (fullscreenBtn) {
      fullscreenBtn.onclick = (e) => {
        e.stopPropagation();
        this.toggleFullscreen();
      };
    }

    // Progress Bar Scrubbing with Mouse and Touch
    if (progressContainer) {
      const getPos = (e) => {
        const rect = progressContainer.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      };

      const hoverBar = this.host.querySelector('#player-progress-hover');
      const tooltip = this.host.querySelector('#player-time-tooltip');

      progressContainer.onmousemove = (e) => {
        const pos = getPos(e);
        if (hoverBar) hoverBar.style.width = `${pos * 100}%`;
        if (tooltip && this.state.duration > 0) {
          tooltip.style.display = 'block';
          tooltip.style.left = `${pos * 100}%`;
          tooltip.textContent = formatDuration(pos * this.state.duration);
        }
      };

      progressContainer.onmouseleave = () => {
        if (hoverBar) hoverBar.style.width = '0%';
        if (tooltip) tooltip.style.display = 'none';
      };

      const handleSeekAction = (e) => {
        const pos = getPos(e);
        if (this.state.duration > 0) {
          this.seekTo(pos * this.state.duration);
        }
      };

      progressContainer.onclick = (e) => {
        e.stopPropagation();
        handleSeekAction(e);
      };

      // Drag Scrubbing with immediate visual response and single seek on release
      let dragSeekPos = -1;
      const updateVisualScrub = (pos) => {
        const fillBar = this.host.querySelector('#player-progress-filled');
        const thumb = this.host.querySelector('#player-progress-thumb');
        const timeDisplay = this.host.querySelector('#player-time-display');
        if (fillBar) fillBar.style.width = `${pos * 100}%`;
        if (thumb) thumb.style.left = `${pos * 100}%`;
        if (hoverBar) hoverBar.style.width = `${pos * 100}%`;
        if (tooltip && this.state.duration > 0) {
          tooltip.style.display = 'block';
          tooltip.style.left = `${pos * 100}%`;
          tooltip.textContent = formatDuration(pos * this.state.duration);
        }
        if (timeDisplay && this.state.duration > 0) {
          timeDisplay.textContent = `${formatDuration(pos * this.state.duration)} / ${formatDuration(this.state.duration)}`;
        }
      };

      const startDrag = (e) => {
        this.isDraggingSeek = true;
        progressContainer.classList.add('dragging');
        const pos = getPos(e);
        dragSeekPos = pos;
        updateVisualScrub(pos);

        const onMove = (moveEvent) => {
          if (this.isDraggingSeek) {
            const currentPos = getPos(moveEvent);
            dragSeekPos = currentPos;
            updateVisualScrub(currentPos);
          }
        };

        const onEnd = () => {
          if (this.isDraggingSeek && dragSeekPos >= 0 && this.state.duration > 0) {
            this.seekTo(dragSeekPos * this.state.duration);
          }
          this.isDraggingSeek = false;
          dragSeekPos = -1;
          progressContainer.classList.remove('dragging');
          if (tooltip) tooltip.style.display = 'none';
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onEnd);
          window.removeEventListener('touchmove', onMove);
          window.removeEventListener('touchend', onEnd);
        };

        window.addEventListener('mousemove', onMove, { passive: true });
        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('touchend', onEnd);
      };

      progressContainer.onmousedown = startDrag;
      progressContainer.ontouchstart = startDrag;
    }

    // Auto-hide controls after 3 seconds of inactivity
    const resetControlsTimeout = () => {
      if (!this.host) return;
      this.host.classList.remove('idle');
      clearTimeout(this.controlsTimeout);
      if (this.state.isPlaying && !this.isDraggingSeek && this.state.mode === 'watch') {
        this.controlsTimeout = setTimeout(() => {
          if (this.state.isPlaying && this.host && !settingsMenu?.classList.contains('open')) {
            this.host.classList.add('idle');
          }
        }, 3000);
      }
    };

    this.host.onmousemove = resetControlsTimeout;
    this.host.ontouchstart = resetControlsTimeout;

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (this.state.mode !== 'watch') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        this.togglePlay();
      } else if (e.key === 'ArrowLeft' || e.key === 'j') {
        e.preventDefault();
        this.triggerSeekRipple('left');
        this.seekRelative(-10);
      } else if (e.key === 'ArrowRight' || e.key === 'l') {
        e.preventDefault();
        this.triggerSeekRipple('right');
        this.seekRelative(10);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.setVolume(Math.min(100, this.state.volume + 10));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.setVolume(Math.max(0, this.state.volume - 10));
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        this.toggleMute();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        this.toggleFullscreen();
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        this.toggleTheatreMode();
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        captionsBtn?.click();
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        pipBtn?.click();
      }
    });
  }

  triggerSeekRipple(direction) {
    if (!this.host) return;
    const ripple = this.host.querySelector(`#seek-ripple-${direction}`);
    if (ripple) {
      ripple.classList.add('active');
      setTimeout(() => ripple.classList.remove('active'), 400);
    }
  }

  sendListeningHandshake() {
    if (this.iframe && this.iframe.contentWindow) {
      try {
        this.iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1 }), '*');
        this.iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*');
      } catch {}
    }
  }

  handleIframeMessage(event) {
    if (!event || !event.data) return;
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;

      // Handle onStateChange events
      if (data.event === 'onStateChange') {
        if (data.info === 1) { // PLAYING
          this.setPlayingState(true);
        } else if (data.info === 2) { // PAUSED
          this.setPlayingState(false);
        } else if (data.info === 3) { // BUFFERING
          this.setBufferingState(true);
        } else if (data.info === 0) { // ENDED
          this.onVideoEnded();
        }
      }

      // Handle infoDelivery and initialDelivery events from YouTube Iframe API
      if ((data.event === 'infoDelivery' || data.event === 'initialDelivery') && data.info) {
        const info = data.info;
        if (info.currentTime !== undefined && !this.isDraggingSeek) {
          this.state.currentTime = info.currentTime;
          this.updateProgressUI();
        }
        if (info.duration !== undefined && typeof info.duration === 'number' && info.duration > 0) {
          this.state.duration = info.duration;
          this.updateProgressUI();
        }
        if (info.videoLoadedFraction !== undefined) {
          const bufBar = this.host?.querySelector('#player-progress-buffered');
          if (bufBar) bufBar.style.width = `${Math.min(100, Math.max(0, info.videoLoadedFraction * 100))}%`;
        }
        if (info.playerState !== undefined) {
          if (info.playerState === 1) this.setPlayingState(true);
          else if (info.playerState === 2) this.setPlayingState(false);
          else if (info.playerState === 3) this.setBufferingState(true);
          else if (info.playerState === 0) this.onVideoEnded();
        }
      }
    } catch {}
  }

  sendIframeCommand(func, args = []) {
    if (this.iframe && this.iframe.contentWindow) {
      try {
        this.iframe.contentWindow.postMessage(
          JSON.stringify({
            event: 'command',
            func,
            args: Array.isArray(args) ? args : [args]
          }),
          '*'
        );
      } catch {}
    }
  }

  togglePlay() {
    if (this.state.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    this.sendIframeCommand('playVideo');
    this.setPlayingState(true);
  }

  pause() {
    this.sendIframeCommand('pauseVideo');
    this.setPlayingState(false);
    if (this.state.currentVideoId) {
      updateHistoryProgress(this.state.currentVideoId, this.state.currentTime, this.state.duration, { immediate: true });
    }
  }

  setPlayingState(playing) {
    this.state.isPlaying = playing;
    this.setBufferingState(false);
    this.syncPlayStateUI();
  }

  setBufferingState(buffering) {
    this.state.isBuffering = buffering;
    if (this.host) {
      const spinner = this.host.querySelector('#player-loading-spinner');
      if (spinner) spinner.style.display = buffering ? 'block' : 'none';
    }
  }

  syncPlayStateUI() {
    if (!this.host) return;

    const playing = this.state.isPlaying;
    const playIcon = this.host.querySelector('#icon-play-pause');
    const centerPlay = this.host.querySelector('#player-center-play');
    const miniIcon = this.host.querySelector('#mini-player-play-icon');

    if (playIcon) playIcon.textContent = playing ? 'pause' : 'play_arrow';
    if (miniIcon) miniIcon.textContent = playing ? 'pause' : 'play_arrow';
    if (centerPlay) centerPlay.style.display = playing ? 'none' : 'flex';

    this.host.classList.toggle('paused', !playing);
    if (!playing) this.host.classList.remove('idle');
  }

  seekTo(seconds) {
    const target = Math.max(0, Math.min(this.state.duration || seconds, seconds));
    this.state.currentTime = target;
    this.sendIframeCommand('seekTo', [target, true]);
    this.updateProgressUI();
    if (this.state.currentVideoId) {
      updateHistoryProgress(this.state.currentVideoId, this.state.currentTime, this.state.duration, { immediate: true });
    }
  }

  seekRelative(deltaSeconds) {
    this.seekTo(this.state.currentTime + deltaSeconds);
  }

  toggleMute() {
    this.state.isMuted = !this.state.isMuted;
    this.sendIframeCommand(this.state.isMuted ? 'mute' : 'unMute');
    this.updateVolumeUI();
  }

  setVolume(val) {
    this.state.volume = val;
    this.state.isMuted = val === 0;
    this.sendIframeCommand('setVolume', [val]);
    if (this.state.isMuted) {
      this.sendIframeCommand('mute');
    } else {
      this.sendIframeCommand('unMute');
    }
    this.updateVolumeUI();
  }

  updateVolumeUI() {
    if (!this.host) return;
    const icon = this.host.querySelector('#icon-volume');
    const slider = this.host.querySelector('#volume-slider');

    if (slider) slider.value = this.state.isMuted ? 0 : this.state.volume;
    if (icon) {
      if (this.state.isMuted || this.state.volume === 0) {
        icon.textContent = 'volume_off';
      } else if (this.state.volume < 50) {
        icon.textContent = 'volume_down';
      } else {
        icon.textContent = 'volume_up';
      }
    }
  }

  setPlaybackRate(rate) {
    this.state.playbackRate = rate;
    this.sendIframeCommand('setPlaybackRate', [rate]);
    if (this.host) {
      const label = this.host.querySelector('#speed-label');
      if (label) label.textContent = `${rate}x`;
    }
  }

  toggleFullscreen() {
    if (!this.host) return;
    const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (!isFull) {
      if (this.host.requestFullscreen) {
        this.host.requestFullscreen().catch(() => {});
      } else if (this.host.webkitRequestFullscreen) {
        this.host.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  }

  toggleTheatreMode() {
    if (this.state.mode !== 'watch') return;
    this.state.isTheatre = !this.state.isTheatre;

    const theatreWrapper = document.getElementById('theatre-stage-wrapper');
    const normalParent = document.getElementById('normal-player-slot-parent');
    const slot = document.getElementById('watch-player-slot');

    if (this.host) {
      this.host.classList.add('transitioning');
      setTimeout(() => this.host?.classList.remove('transitioning'), 350);
    }

    if (this.state.isTheatre) {
      document.body.classList.add('theatre-mode-active');
      if (theatreWrapper && slot && slot.parentElement !== theatreWrapper) {
        theatreWrapper.appendChild(slot);
      }
    } else {
      document.body.classList.remove('theatre-mode-active');
      if (normalParent && slot && slot.parentElement !== normalParent) {
        normalParent.appendChild(slot);
      }
    }

    this.syncTheatreUI();
    // Allow multiple frame stages for layout reflow
    requestAnimationFrame(() => {
      this.syncPositionWithSlot();
      setTimeout(() => this.syncPositionWithSlot(), 60);
      setTimeout(() => this.syncPositionWithSlot(), 200);
      setTimeout(() => this.syncPositionWithSlot(), 320);
    });
  }

  exitTheatreMode() {
    if (!this.state.isTheatre) return;
    this.state.isTheatre = false;
    document.body.classList.remove('theatre-mode-active');
    const normalParent = document.getElementById('normal-player-slot-parent');
    const slot = document.getElementById('watch-player-slot');
    if (normalParent && slot && slot.parentElement !== normalParent) {
      normalParent.appendChild(slot);
    }
    this.syncTheatreUI();
    requestAnimationFrame(() => {
      this.syncPositionWithSlot();
      setTimeout(() => this.syncPositionWithSlot(), 80);
    });
  }

  syncTheatreUI() {
    if (!this.host) return;
    const theatreBtn = this.host.querySelector('#btn-theatre');
    const theatreIcon = this.host.querySelector('#icon-theatre');
    const menuLabel = this.host.querySelector('#menu-theatre-label');

    if (theatreBtn) theatreBtn.classList.toggle('active', this.state.isTheatre);
    if (theatreIcon) theatreIcon.textContent = this.state.isTheatre ? 'crop_16_9' : 'aspect_ratio';
    if (menuLabel) menuLabel.textContent = this.state.isTheatre ? 'On' : 'Off';
  }

  onVideoEnded() {
    this.setPlayingState(false);
    if (this.state.currentVideoId) {
      markVideoCompleted(this.state.currentVideoId);
    }
    this.seekTo(0);
  }

  updateMetadata(metadata) {
    if (!metadata) return;
    this.state.currentMetadata = { ...this.state.currentMetadata, ...metadata };
    const dur = (metadata.durationSeconds !== undefined && metadata.durationSeconds !== null)
      ? metadata.durationSeconds
      : metadata.duration;
    if (dur && typeof dur === 'number' && dur > 0) {
      if (!this.state.duration || this.state.duration <= 0) {
        this.state.duration = dur;
        this.updateProgressUI();
      }
    }
    this.syncMiniPlayerUI();
  }

  syncMiniPlayerUI() {
    if (!this.host) return;
    const titleEl = this.host.querySelector('#mini-player-title');
    const channelEl = this.host.querySelector('#mini-player-channel');
    const meta = this.state.currentMetadata;

    if (titleEl) titleEl.textContent = meta?.title || 'Playing Video';
    if (channelEl) channelEl.textContent = meta?.author || meta?.channel || 'YouTube';
    this.syncPlayStateUI();
  }

  updateProgressUI() {
    if (!this.host) return;
    const filled = this.host.querySelector('#player-progress-filled');
    const thumb = this.host.querySelector('#player-progress-thumb');
    const timeDisplay = this.host.querySelector('#player-time-display');
    const progressContainer = this.host.querySelector('#player-progress-container');
    const miniProgress = this.host.querySelector('#mini-player-progress-line');

    const duration = this.state.duration;
    const currentTime = this.state.currentTime;
    const pct = (duration > 0)
      ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
      : 0;

    if (filled) {
      filled.style.width = `${pct}%`;
      filled.style.backgroundColor = 'var(--brand-red, #ff334b)';
    }
    if (thumb) {
      thumb.style.left = `${pct}%`;
      thumb.style.backgroundColor = 'var(--brand-red, #ff334b)';
    }
    if (miniProgress) {
      miniProgress.style.width = `${pct}%`;
      miniProgress.style.backgroundColor = 'var(--brand-red, #ff334b)';
    }
    if (progressContainer) {
      progressContainer.setAttribute('aria-valuenow', Math.round(pct));
    }
    if (timeDisplay) {
      timeDisplay.textContent = `${formatDuration(currentTime)} / ${formatDuration(duration)}`;
    }
  }

  startTicker() {
    clearInterval(this.tickerInterval);
    this.tickerInterval = setInterval(() => {
      if (this.state.isPlaying && !this.isDraggingSeek) {
        // Direct query to iframe to guarantee synchronization and keep connection active
        this.sendIframeCommand('getCurrentTime');
        this.sendIframeCommand('getDuration');
        this.sendListeningHandshake();

        this.state.currentTime += 0.5 * this.state.playbackRate;
        if (this.state.duration > 0 && this.state.currentTime > this.state.duration) {
          this.state.currentTime = this.state.duration;
        }
        this.updateProgressUI();
        if (this.state.currentVideoId) {
          updateHistoryProgress(this.state.currentVideoId, this.state.currentTime, this.state.duration);
        }
      }
    }, 500);
  }
}

export const playerController = new VideoPlayerController();
export default playerController;
