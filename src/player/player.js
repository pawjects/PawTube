/**
 * PawTube - Canonical Video Player Controller & Virtual Controls
 * Uses YouTube No-Cookie Embed Player (https://www.youtube-nocookie.com/embed/VIDEO_ID)
 * Decoupled from Piped API with full virtual controls and mini-player support.
 */

import { extractVideoId } from './videoId.js';
import { buildNoCookieEmbedUrl } from './embed.js';
import { addToHistory, updateHistoryProgress } from '../storage/history/historyStorage.js';
import { escapeHtml } from '../utils/dom.js';

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const remSec = s % 60;
  const remSecStr = remSec < 10 ? `0${remSec}` : `${remSec}`;
  if (m < 60) {
    return `${m}:${remSecStr}`;
  }
  const h = Math.floor(m / 60);
  const remMin = m % 60;
  const remMinStr = remMin < 10 ? `0${remMin}` : `${remMin}`;
  return `${h}:${remMinStr}:${remSecStr}`;
}

export class VideoPlayerController {
  constructor() {
    this.currentVideoId = null;
    this.currentMetadata = null;
    this.iframe = null;
    this.wrapper = null;
    this.container = null;

    // Playback state
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 0;
    this.volume = 100;
    this.isMuted = false;
    this.playbackRate = 1.0;
    this.isBuffering = false;
    this.captionsEnabled = false;

    // Mini-player state
    this.isMiniPlayerActive = false;

    // UI timers
    this.controlsTimeout = null;
    this.tickerInterval = null;
    this.isDraggingSeek = false;
    this.hasUserInteracted = false;

    // Listen to iframe postMessage events globally
    this.initMessageListener();
  }

  initMessageListener() {
    window.addEventListener('message', (event) => {
      if (!event.data) return;
      let data = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }

      if (data.event === 'onStateChange') {
        // -1: unstarted, 0: ended, 1: playing, 2: paused, 3: buffering, 5: cued
        if (data.info === 1) {
          this.setPlayingState(true);
        } else if (data.info === 2) {
          this.setPlayingState(false);
        } else if (data.info === 3) {
          this.setBufferingState(true);
        } else if (data.info === 0) {
          this.onVideoEnded();
        }
      } else if (data.event === 'infoDelivery' && data.info) {
        if (typeof data.info.currentTime === 'number') {
          this.currentTime = data.info.currentTime;
          this.updateProgressUI();
        }
        if (typeof data.info.duration === 'number' && data.info.duration > 0) {
          this.duration = data.info.duration;
          this.updateProgressUI();
        }
        if (typeof data.info.volume === 'number') {
          this.volume = data.info.volume;
        }
        if (typeof data.info.muted === 'boolean') {
          this.isMuted = data.info.muted;
          this.updateVolumeUI();
        }
      }
    });
  }

  initMiniPlayer() {
    const mini = document.getElementById('mini-player');
    const closeBtn = document.getElementById('mini-player-close-btn');
    const expandBtn = document.getElementById('mini-player-expand');
    const infoArea = document.getElementById('mini-player-info');
    const playBtn = document.getElementById('mini-player-play-btn');

    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        this.closeMiniPlayer();
      };
    }

    const expandToWatch = () => {
      if (this.currentVideoId) {
        this.hideMiniPlayer();
        window.location.hash = `#/watch?v=${encodeURIComponent(this.currentVideoId)}`;
      }
    };

    if (expandBtn) expandBtn.onclick = expandToWatch;
    if (infoArea) infoArea.onclick = expandToWatch;

    if (playBtn) {
      playBtn.onclick = (e) => {
        e.stopPropagation();
        this.togglePlay();
      };
    }
  }

  showMiniPlayer(videoId, metadata = null) {
    const mini = document.getElementById('mini-player');
    if (!mini) return;

    this.isMiniPlayerActive = true;
    mini.style.display = 'flex';

    const thumb = document.getElementById('mini-player-thumb');
    const title = document.getElementById('mini-player-title');
    const channel = document.getElementById('mini-player-channel');
    const playIcon = mini.querySelector('#mini-player-play-btn .material-symbols-rounded');

    if (thumb) {
      thumb.src = metadata?.thumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }
    if (title) {
      title.textContent = metadata?.title || 'YouTube Video';
    }
    if (channel) {
      channel.textContent = metadata?.channel || metadata?.author || '';
    }
    if (playIcon) {
      playIcon.textContent = this.isPlaying ? 'pause' : 'play_arrow';
    }
  }

  closeMiniPlayer() {
    const mini = document.getElementById('mini-player');
    if (mini) mini.style.display = 'none';
    this.isMiniPlayerActive = false;
    this.pause();
    this.currentVideoId = null;
  }

  hideMiniPlayer() {
    const mini = document.getElementById('mini-player');
    if (mini) mini.style.display = 'none';
    this.isMiniPlayerActive = false;
  }

  onNavigateAwayFromWatch() {
    if (this.currentVideoId) {
      this.showMiniPlayer(this.currentVideoId, this.currentMetadata);
    }
  }

  mountPlayer(container, videoId, initialMetadata = null) {
    const cleanId = extractVideoId(videoId);
    if (!cleanId || !container) return null;

    this.container = container;
    this.currentVideoId = cleanId;
    this.currentMetadata = initialMetadata;
    this.hideMiniPlayer();

    // Reset playback state
    this.isPlaying = true;
    this.currentTime = 0;
    this.isBuffering = true;

    // Record to watch history immediately
    addToHistory({
      id: cleanId,
      title: initialMetadata?.title || 'YouTube Video',
      author: initialMetadata?.author || initialMetadata?.channel || '',
      channel: initialMetadata?.channel || initialMetadata?.author || '',
      thumb: initialMetadata?.thumb || `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`,
      duration: initialMetadata?.duration || 0,
      progress: 0,
      watchedPercentage: 0
    });

    const embedUrl = buildNoCookieEmbedUrl(cleanId, {
      autoplay: 1,
      playsinline: 1,
      controls: 0,
      enablejsapi: 1
    });

    container.innerHTML = `
      <div class="custom-player-wrapper" id="pawtube-player" tabindex="0">
        <!-- Iframe Video -->
        <iframe 
          id="pawtube-iframe"
          src="${embedUrl}" 
          title="${escapeHtml(initialMetadata?.title || 'PawTube Player')}" 
          style="position:absolute;inset:0;width:100%;height:100%;border:none;"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen>
        </iframe>

        <!-- Clickable layer for pause/play -->
        <div class="player-click-layer" id="player-click-layer"></div>

        <!-- Center Buffering Spinner -->
        <div class="player-loading-spinner" id="player-loading-spinner" style="display:none;">
          <span class="material-symbols-rounded spinner-icon">progress_activity</span>
        </div>

        <!-- Center Big Play Button (shows on pause / initial load) -->
        <div class="player-center-play" id="player-center-play" style="display:none;" aria-label="Play">
          <span class="material-symbols-rounded" style="font-size:42px;">play_arrow</span>
        </div>

        <!-- Virtual Controls UI Overlay -->
        <div class="custom-player-ui" id="player-ui">
          <div class="player-bottom-controls">
            <!-- Progress / Scrubbing Bar -->
            <div class="player-progress-container" id="player-progress-container" role="slider" aria-label="Seek Video" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
              <div class="player-progress-hover" id="player-progress-hover" style="width:0%;"></div>
              <div class="player-progress-buffered" id="player-progress-buffered" style="width:0%;"></div>
              <div class="player-progress-filled" id="player-progress-filled" style="width:0%;"></div>
              <div class="player-progress-thumb" id="player-progress-thumb" style="left:0%;"></div>
              <div class="player-time-tooltip" id="player-time-tooltip">0:00</div>
            </div>

            <!-- Controls Row -->
            <div class="player-controls-row">
              <!-- Left Controls -->
              <div class="player-controls-left">
                <!-- Play/Pause -->
                <button class="player-btn" id="btn-play-pause" title="Play/Pause (Space)" aria-label="Play or Pause">
                  <span class="material-symbols-rounded" id="icon-play-pause">pause</span>
                </button>

                <!-- Rewind 10s -->
                <button class="player-btn" id="btn-replay-10" title="Rewind 10s" aria-label="Rewind 10 seconds">
                  <span class="material-symbols-rounded">replay_10</span>
                </button>

                <!-- Forward 10s -->
                <button class="player-btn" id="btn-forward-10" title="Skip 10s" aria-label="Skip forward 10 seconds">
                  <span class="material-symbols-rounded">forward_10</span>
                </button>

                <!-- Volume Group -->
                <div class="player-volume-group">
                  <button class="player-btn" id="btn-volume" title="Mute/Unmute (M)" aria-label="Mute or Unmute">
                    <span class="material-symbols-rounded" id="icon-volume">volume_up</span>
                  </button>
                  <input type="range" class="player-volume-slider" id="volume-slider" min="0" max="100" value="100" aria-label="Volume Slider" />
                </div>

                <!-- Time Display -->
                <div class="player-time-display" id="player-time-display">
                  0:00 / 0:00
                </div>
              </div>

              <!-- Right Controls -->
              <div class="player-controls-right">
                <!-- Captions -->
                <button class="player-btn" id="btn-captions" title="Subtitles/CC" aria-label="Toggle Subtitles">
                  <span class="material-symbols-rounded" id="icon-captions">closed_caption</span>
                </button>

                <!-- Settings -->
                <div class="player-settings-container">
                  <button class="player-btn" id="btn-settings" title="Settings" aria-label="Player Settings">
                    <span class="material-symbols-rounded">settings</span>
                  </button>
                  <div class="player-settings-menu" id="player-settings-menu">
                    <div class="player-menu-header">
                      <span class="material-symbols-rounded">tune</span>
                      <span>Playback Settings</span>
                    </div>
                    <div class="player-menu-item" id="menu-speed">
                      <span>Speed</span>
                      <span id="speed-label" style="color:var(--brand-blue);font-weight:600;">1x</span>
                    </div>
                    <div class="player-menu-item" id="menu-quality">
                      <span>Quality</span>
                      <span style="color:var(--text-secondary);font-size:12px;">Auto</span>
                    </div>
                  </div>
                </div>

                <!-- Picture-in-Picture / Mini-player -->
                <button class="player-btn" id="btn-pip" title="Mini-Player" aria-label="Open Mini Player">
                  <span class="material-symbols-rounded">picture_in_picture_alt</span>
                </button>

                <!-- Fullscreen -->
                <button class="player-btn" id="btn-fullscreen" title="Fullscreen (F)" aria-label="Toggle Fullscreen">
                  <span class="material-symbols-rounded" id="icon-fullscreen">fullscreen</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.wrapper = container.querySelector('#pawtube-player');
    this.iframe = container.querySelector('#pawtube-iframe');

    this.bindPlayerEvents();
    this.startTicker();

    // Handshake with YouTube iframe API
    setTimeout(() => {
      this.sendIframeCommand('listening');
    }, 600);

    return this.wrapper;
  }

  bindPlayerEvents() {
    if (!this.wrapper) return;

    const playPauseBtn = this.wrapper.querySelector('#btn-play-pause');
    const centerPlay = this.wrapper.querySelector('#player-center-play');
    const clickLayer = this.wrapper.querySelector('#player-click-layer');
    const replayBtn = this.wrapper.querySelector('#btn-replay-10');
    const forwardBtn = this.wrapper.querySelector('#btn-forward-10');
    const volumeBtn = this.wrapper.querySelector('#btn-volume');
    const volumeSlider = this.wrapper.querySelector('#volume-slider');
    const captionsBtn = this.wrapper.querySelector('#btn-captions');
    const settingsBtn = this.wrapper.querySelector('#btn-settings');
    const settingsMenu = this.wrapper.querySelector('#player-settings-menu');
    const speedMenuItem = this.wrapper.querySelector('#menu-speed');
    const pipBtn = this.wrapper.querySelector('#btn-pip');
    const fullscreenBtn = this.wrapper.querySelector('#btn-fullscreen');
    const progressContainer = this.wrapper.querySelector('#player-progress-container');

    // Toggle Play/Pause
    const handleTogglePlay = () => this.togglePlay();
    if (playPauseBtn) playPauseBtn.onclick = handleTogglePlay;
    if (centerPlay) centerPlay.onclick = handleTogglePlay;
    if (clickLayer) {
      let clickTimer = null;
      clickLayer.onclick = () => {
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
          this.togglePlay();
        }, 220);
      };
      clickLayer.ondblclick = (e) => {
        if (clickTimer) clearTimeout(clickTimer);
        const rect = clickLayer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        if (clickX < rect.width / 2) {
          this.seekRelative(-10);
        } else {
          this.seekRelative(10);
        }
      };
    }

    // Rewind / Forward
    if (replayBtn) replayBtn.onclick = () => this.seekRelative(-10);
    if (forwardBtn) forwardBtn.onclick = () => this.seekRelative(10);

    // Volume
    if (volumeBtn) volumeBtn.onclick = () => this.toggleMute();
    if (volumeSlider) {
      volumeSlider.oninput = (e) => {
        const val = Number(e.target.value);
        this.setVolume(val);
      };
    }

    // Captions
    if (captionsBtn) {
      captionsBtn.onclick = () => {
        this.captionsEnabled = !this.captionsEnabled;
        captionsBtn.classList.toggle('active', this.captionsEnabled);
        this.sendIframeCommand(this.captionsEnabled ? 'loadModule' : 'unloadModule', ['captions']);
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

    // Speed Cycle: 0.5 -> 0.75 -> 1 -> 1.25 -> 1.5 -> 2 -> 1
    const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
    if (speedMenuItem) {
      speedMenuItem.onclick = (e) => {
        e.stopPropagation();
        const currentIdx = SPEEDS.indexOf(this.playbackRate);
        const nextIdx = (currentIdx + 1) % SPEEDS.length;
        this.setPlaybackRate(SPEEDS[nextIdx]);
      };
    }

    // Picture in Picture / Mini-player
    if (pipBtn) {
      pipBtn.onclick = () => {
        this.showMiniPlayer(this.currentVideoId, this.currentMetadata);
        window.location.hash = '#/home';
      };
    }

    // Fullscreen
    if (fullscreenBtn) {
      fullscreenBtn.onclick = () => this.toggleFullscreen();
    }

    // Progress Bar Scrubbing
    if (progressContainer) {
      const getPos = (e) => {
        const rect = progressContainer.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        return pos;
      };

      progressContainer.onmousemove = (e) => {
        const pos = getPos(e);
        const hoverBar = this.wrapper.querySelector('#player-progress-hover');
        const tooltip = this.wrapper.querySelector('#player-time-tooltip');
        if (hoverBar) hoverBar.style.width = `${pos * 100}%`;
        if (tooltip && this.duration > 0) {
          tooltip.style.display = 'block';
          tooltip.style.left = `${pos * 100}%`;
          tooltip.textContent = formatTime(pos * this.duration);
        }
      };

      progressContainer.onmouseleave = () => {
        const hoverBar = this.wrapper.querySelector('#player-progress-hover');
        const tooltip = this.wrapper.querySelector('#player-time-tooltip');
        if (hoverBar) hoverBar.style.width = '0%';
        if (tooltip) tooltip.style.display = 'none';
      };

      const handleSeek = (e) => {
        const pos = getPos(e);
        if (this.duration > 0) {
          const targetTime = pos * this.duration;
          this.seekTo(targetTime);
        }
      };

      progressContainer.onclick = handleSeek;

      progressContainer.onmousedown = () => {
        this.isDraggingSeek = true;
        const onMouseMove = (e) => {
          if (this.isDraggingSeek) handleSeek(e);
        };
        const onMouseUp = () => {
          this.isDraggingSeek = false;
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      };
    }

    // Auto-hide controls
    const resetControlsTimeout = () => {
      if (!this.wrapper) return;
      this.wrapper.classList.remove('idle');
      clearTimeout(this.controlsTimeout);
      if (this.isPlaying && !this.isDraggingSeek) {
        this.controlsTimeout = setTimeout(() => {
          if (this.isPlaying && this.wrapper && !settingsMenu?.classList.contains('open')) {
            this.wrapper.classList.add('idle');
          }
        }, 3200);
      }
    };

    this.wrapper.onmousemove = resetControlsTimeout;
    this.wrapper.ontouchstart = resetControlsTimeout;

    // Keyboard Shortcuts
    this.wrapper.onkeydown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        this.togglePlay();
      } else if (e.key === 'ArrowLeft' || e.key === 'j') {
        e.preventDefault();
        this.seekRelative(-10);
      } else if (e.key === 'ArrowRight' || e.key === 'l') {
        e.preventDefault();
        this.seekRelative(10);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.setVolume(Math.min(100, this.volume + 10));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.setVolume(Math.max(0, this.volume - 10));
      } else if (e.key === 'm') {
        e.preventDefault();
        this.toggleMute();
      } else if (e.key === 'f') {
        e.preventDefault();
        this.toggleFullscreen();
      }
    };
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
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    this.isPlaying = true;
    this.sendIframeCommand('playVideo');
    this.setPlayingState(true);
  }

  pause() {
    this.isPlaying = false;
    this.sendIframeCommand('pauseVideo');
    this.setPlayingState(false);
  }

  setPlayingState(playing) {
    this.isPlaying = playing;
    this.setBufferingState(false);

    if (this.wrapper) {
      const icon = this.wrapper.querySelector('#icon-play-pause');
      const centerPlay = this.wrapper.querySelector('#player-center-play');
      if (icon) icon.textContent = playing ? 'pause' : 'play_arrow';
      if (centerPlay) centerPlay.style.display = playing ? 'none' : 'flex';
      this.wrapper.classList.toggle('paused', !playing);
      if (!playing) this.wrapper.classList.remove('idle');
    }

    // Update mini-player play icon if active
    const miniIcon = document.querySelector('#mini-player-play-btn .material-symbols-rounded');
    if (miniIcon) {
      miniIcon.textContent = playing ? 'pause' : 'play_arrow';
    }
  }

  setBufferingState(buffering) {
    this.isBuffering = buffering;
    if (this.wrapper) {
      const spinner = this.wrapper.querySelector('#player-loading-spinner');
      if (spinner) spinner.style.display = buffering ? 'block' : 'none';
    }
  }

  seekTo(seconds) {
    const clamped = Math.max(0, Math.min(this.duration || seconds, seconds));
    this.currentTime = clamped;
    this.sendIframeCommand('seekTo', [clamped, true]);
    this.updateProgressUI();
    if (this.currentVideoId) {
      updateHistoryProgress(this.currentVideoId, this.currentTime, this.duration);
    }
  }

  seekRelative(deltaSeconds) {
    this.seekTo(this.currentTime + deltaSeconds);
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.sendIframeCommand(this.isMuted ? 'mute' : 'unMute');
    this.updateVolumeUI();
  }

  setVolume(val) {
    this.volume = val;
    this.isMuted = val === 0;
    this.sendIframeCommand('setVolume', [val]);
    if (this.isMuted) {
      this.sendIframeCommand('mute');
    } else {
      this.sendIframeCommand('unMute');
    }
    this.updateVolumeUI();
  }

  updateVolumeUI() {
    if (!this.wrapper) return;
    const icon = this.wrapper.querySelector('#icon-volume');
    const slider = this.wrapper.querySelector('#volume-slider');

    if (slider) slider.value = this.isMuted ? 0 : this.volume;
    if (icon) {
      if (this.isMuted || this.volume === 0) {
        icon.textContent = 'volume_off';
      } else if (this.volume < 50) {
        icon.textContent = 'volume_down';
      } else {
        icon.textContent = 'volume_up';
      }
    }
  }

  setPlaybackRate(rate) {
    this.playbackRate = rate;
    this.sendIframeCommand('setPlaybackRate', [rate]);
    if (this.wrapper) {
      const label = this.wrapper.querySelector('#speed-label');
      if (label) label.textContent = `${rate}x`;
    }
  }

  toggleFullscreen() {
    if (!this.wrapper) return;
    if (!document.fullscreenElement) {
      this.wrapper.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  onVideoEnded() {
    this.setPlayingState(false);
    this.seekTo(0);
  }

  updateMetadata(metadata) {
    this.currentMetadata = { ...this.currentMetadata, ...metadata };
    if (metadata.duration && typeof metadata.duration === 'number') {
      this.duration = metadata.duration;
      this.updateProgressUI();
    }
    if (this.isMiniPlayerActive) {
      this.showMiniPlayer(this.currentVideoId, this.currentMetadata);
    }
  }

  updateProgressUI() {
    if (!this.wrapper) return;
    const filled = this.wrapper.querySelector('#player-progress-filled');
    const thumb = this.wrapper.querySelector('#player-progress-thumb');
    const timeDisplay = this.wrapper.querySelector('#player-time-display');
    const progressContainer = this.wrapper.querySelector('#player-progress-container');

    const pct = this.duration > 0 ? (this.currentTime / this.duration) * 100 : 0;
    if (filled) filled.style.width = `${pct}%`;
    if (thumb) thumb.style.left = `${pct}%`;
    if (progressContainer) progressContainer.setAttribute('aria-valuenow', Math.round(pct));
    if (timeDisplay) {
      timeDisplay.textContent = `${formatTime(this.currentTime)} / ${formatTime(this.duration)}`;
    }
  }

  startTicker() {
    clearInterval(this.tickerInterval);
    this.tickerInterval = setInterval(() => {
      if (this.isPlaying && !this.isDraggingSeek) {
        this.currentTime += 0.5 * this.playbackRate;
        if (this.duration > 0 && this.currentTime > this.duration) {
          this.currentTime = this.duration;
        }
        this.updateProgressUI();
        if (this.currentVideoId) {
          updateHistoryProgress(this.currentVideoId, this.currentTime, this.duration);
        }
      }
    }, 500);
  }
}

export const playerController = new VideoPlayerController();
export default playerController;
