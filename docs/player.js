class CustomPlayer {
  constructor() {
    this.videoEl = null;
    this.wrapper = null;
    this.uiTimeout = null;
    this.isDragging = false;
    this.currentVideoId = null;
    this.isTheater = false;
    this.settingsMenuState = 'main'; // main, speed, quality
    
    // Create UI elements
    this.initDOM();
    this.bindEvents();
    this.apiReady = true; // No need to wait for external API
  }
  
  initDOM() {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'custom-player-wrapper idle';
    this.wrapper.innerHTML = `
       <div id="yt-player-container" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #000;">
         <video id="html5-video-player" playsinline style="width: 100%; height: 100%; object-fit: contain;"></video>
       </div>
       <div class="player-click-layer"></div>
       <div class="custom-player-ui" id="custom-player-ui">
           <div class="player-loading-spinner" id="player-loading-spinner" style="display: none;"><span class="material-symbols-rounded spinner-icon">progress_activity</span></div>
           <div class="player-center-play" id="player-center-play"><span class="material-symbols-rounded" style="font-size: 48px;">play_arrow</span></div>
           
           <div class="player-bottom-controls" id="player-bottom-controls">
                <div class="player-progress-container" id="player-progress-container">
                    <div class="player-progress-hover" id="player-progress-hover"></div>
                    <div class="player-progress-buffered" id="player-progress-buffered"></div>
                    <div class="player-progress-filled" id="player-progress-filled"></div>
                    <div class="player-progress-thumb" id="player-progress-thumb"></div>
                    <div class="player-time-tooltip" id="player-time-tooltip">0:00</div>
                </div>
                
                <div class="player-controls-row">
                    <div class="player-controls-left">
                        <button class="player-btn" id="player-play-btn" aria-label="Play (k)"><span class="material-symbols-rounded">play_arrow</span></button>
                        <button class="player-btn" id="player-rewind-btn" aria-label="Rewind 10s (j)"><span class="material-symbols-rounded">replay_10</span></button>
                        <button class="player-btn" id="player-forward-btn" aria-label="Forward 10s (l)"><span class="material-symbols-rounded">forward_10</span></button>
                        <div class="player-volume-group">
                            <button class="player-btn" id="player-mute-btn" aria-label="Mute (m)"><span class="material-symbols-rounded">volume_up</span></button>
                            <input type="range" class="player-volume-slider" id="player-volume-slider" min="0" max="100" value="100" aria-label="Volume">
                        </div>
                        <div class="player-time-display" id="player-time-display">0:00 / 0:00</div>
                    </div>
                    <div class="player-controls-right">
                        <button class="player-btn" id="player-cc-btn" aria-label="Subtitles/CC" style="display: none;"><span class="material-symbols-rounded">closed_caption</span></button>
                        
                        <div class="player-settings-container">
                            <button class="player-btn" id="player-settings-btn" aria-label="Settings"><span class="material-symbols-rounded">settings</span></button>
                            <div class="player-settings-menu" id="player-settings-menu">
                                 <!-- Dynamic Menu -->
                            </div>
                        </div>
                        
                        <button class="player-btn" id="player-pip-btn" aria-label="Picture-in-Picture"><span class="material-symbols-rounded">picture_in_picture_alt</span></button>
                        <button class="player-btn" id="player-theater-btn" aria-label="Theater mode (t)"><span class="material-symbols-rounded">crop_16_9</span></button>
                        <button class="player-btn" id="player-fullscreen-btn" aria-label="Fullscreen (f)"><span class="material-symbols-rounded">fullscreen</span></button>
                    </div>
                </div>
           </div>
       </div>
    `;
    
    // Expose wrapper globally
    window.playerWrapper = this.wrapper;
    
    this.videoEl = this.wrapper.querySelector('#html5-video-player');
    this.el = {
      clickLayer: this.wrapper.querySelector('.player-click-layer'),
      playBtn: this.wrapper.querySelector('#player-play-btn'),
      centerPlay: this.wrapper.querySelector('#player-center-play'),
      rewindBtn: this.wrapper.querySelector('#player-rewind-btn'),
      forwardBtn: this.wrapper.querySelector('#player-forward-btn'),
      muteBtn: this.wrapper.querySelector('#player-mute-btn'),
      volumeSlider: this.wrapper.querySelector('#player-volume-slider'),
      timeDisplay: this.wrapper.querySelector('#player-time-display'),
      progressContainer: this.wrapper.querySelector('#player-progress-container'),
      progressFilled: this.wrapper.querySelector('#player-progress-filled'),
      progressBuffered: this.wrapper.querySelector('#player-progress-buffered'),
      progressHover: this.wrapper.querySelector('#player-progress-hover'),
      progressThumb: this.wrapper.querySelector('#player-progress-thumb'),
      timeTooltip: this.wrapper.querySelector('#player-time-tooltip'),
      ccBtn: this.wrapper.querySelector('#player-cc-btn'),
      settingsBtn: this.wrapper.querySelector('#player-settings-btn'),
      settingsMenu: this.wrapper.querySelector('#player-settings-menu'),
      pipBtn: this.wrapper.querySelector('#player-pip-btn'),
      theaterBtn: this.wrapper.querySelector('#player-theater-btn'),
      fullscreenBtn: this.wrapper.querySelector('#player-fullscreen-btn'),
      spinner: this.wrapper.querySelector('#player-loading-spinner'),
    };
    
    // Hide PiP if not supported
    if (!document.pictureInPictureEnabled) {
      this.el.pipBtn.style.display = 'none';
    }
    
    // Load saved preferences
    const savedVol = localStorage.getItem('pt_volume');
    if (savedVol !== null) {
        this.el.volumeSlider.value = savedVol;
        this.videoEl.volume = savedVol / 100;
        this.updateVolumeUI();
    }
  }

  bindEvents() {
    // Mouse movement to show/hide controls
    this.wrapper.addEventListener('mousemove', (e) => {
      this.showControls();
      if (!this.videoEl.paused) {
        clearTimeout(this.uiTimeout);
        this.uiTimeout = setTimeout(() => this.hideControls(), 3000);
      }
      
      // Update progress hover
      if (e.target.closest('#player-progress-container')) {
         const rect = this.el.progressContainer.getBoundingClientRect();
         let x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
         let percent = x / rect.width;
         this.el.progressHover.style.width = (percent * 100) + '%';
         
         if (this.videoEl.duration) {
           const time = percent * this.videoEl.duration;
           this.el.timeTooltip.textContent = this.formatTime(time);
           this.el.timeTooltip.style.display = 'block';
           this.el.timeTooltip.style.left = (percent * 100) + '%';
         }
      } else {
         this.el.timeTooltip.style.display = 'none';
      }
    });
    
    this.wrapper.addEventListener('mouseleave', () => {
      if (!this.videoEl.paused) {
        this.hideControls();
      }
      this.el.timeTooltip.style.display = 'none';
    });

    // Playback
    this.el.clickLayer.addEventListener('click', () => this.togglePlay());
    this.el.clickLayer.addEventListener('dblclick', (e) => {
       const rect = this.wrapper.getBoundingClientRect();
       if (e.clientX < rect.left + rect.width / 3) this.skip(-10);
       else if (e.clientX > rect.left + rect.width * 2 / 3) this.skip(10);
       else this.toggleFullscreen();
    });
    
    this.el.playBtn.addEventListener('click', () => this.togglePlay());
    this.el.centerPlay.addEventListener('click', () => this.togglePlay());
    this.el.rewindBtn.addEventListener('click', () => this.skip(-10));
    this.el.forwardBtn.addEventListener('click', () => this.skip(10));
    
    // Volume
    this.el.muteBtn.addEventListener('click', () => this.toggleMute());
    this.el.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));
    
    // Seeking
    let isDragging = false;
    const updateSeek = (e) => {
      const rect = this.el.progressContainer.getBoundingClientRect();
      let percent = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
      this.el.progressFilled.style.width = (percent * 100) + '%';
      this.el.progressThumb.style.left = (percent * 100) + '%';
      if (this.videoEl.duration) {
         this.videoEl.currentTime = percent * this.videoEl.duration;
      }
    };
    this.el.progressContainer.addEventListener('mousedown', (e) => {
       isDragging = true;
       this.el.progressContainer.classList.add('dragging');
       updateSeek(e);
    });
    document.addEventListener('mousemove', (e) => { if (isDragging) updateSeek(e); });
    document.addEventListener('mouseup', () => {
       if (isDragging) {
           isDragging = false;
           this.el.progressContainer.classList.remove('dragging');
       }
    });
    
    // PiP, Theater, Fullscreen
    this.el.pipBtn.addEventListener('click', () => this.togglePiP());
    this.el.theaterBtn.addEventListener('click', () => this.toggleTheater());
    this.el.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    
    // Settings
    this.el.settingsBtn.addEventListener('click', (e) => {
       e.stopPropagation();
       this.renderSettingsMenu('main');
       this.el.settingsMenu.classList.toggle('open');
    });
    
    // Close settings if clicked outside
    document.addEventListener('click', (e) => {
       if (!e.target.closest('#player-settings-menu') && !e.target.closest('#player-settings-btn')) {
           this.el.settingsMenu.classList.remove('open');
       }
    });
    
    // Keyboard
    document.addEventListener('keydown', (e) => this.handleKeydown(e));

    // Video Element Events
    this.videoEl.addEventListener('play', () => {
        this.wrapper.classList.remove('paused');
        this.el.playBtn.innerHTML = '<span class="material-symbols-rounded">pause</span>';
        this.el.centerPlay.style.display = 'none';
        clearTimeout(this.uiTimeout);
        this.uiTimeout = setTimeout(() => this.hideControls(), 3000);
    });
    this.videoEl.addEventListener('pause', () => {
        clearTimeout(this.uiTimeout);
        this.wrapper.classList.add('paused');
        this.el.playBtn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span>';
        this.el.centerPlay.innerHTML = '<span class="material-symbols-rounded">play_arrow</span>';
        this.el.centerPlay.style.display = 'flex';
        this.showControls();
    });
    this.videoEl.addEventListener('ended', () => {
        clearTimeout(this.uiTimeout);
        this.wrapper.classList.add('paused');
        this.el.playBtn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span>';
        this.el.centerPlay.innerHTML = '<span class="material-symbols-rounded">replay</span>';
        this.el.centerPlay.style.display = 'flex';
        this.showControls();
    });
    this.videoEl.addEventListener('enterpictureinpicture', () => {
        this.el.pipBtn.innerHTML = '<span class="material-symbols-rounded">picture_in_picture</span>';
    });
    this.videoEl.addEventListener('leavepictureinpicture', () => {
        this.el.pipBtn.innerHTML = '<span class="material-symbols-rounded">picture_in_picture_alt</span>';
    });
    this.videoEl.addEventListener('timeupdate', () => this.updateProgress());
    this.videoEl.addEventListener('waiting', () => {
        this.wrapper.classList.add('buffering');
        this.el.spinner.style.display = 'flex';
        this.el.centerPlay.style.display = 'none';
    });
    this.videoEl.addEventListener('playing', () => {
        this.wrapper.classList.remove('buffering');
        this.el.spinner.style.display = 'none';
    });
    this.videoEl.addEventListener('progress', () => {
        if (this.videoEl.duration > 0) {
            let loaded = 0;
            for (let i = 0; i < this.videoEl.buffered.length; i++) {
                loaded = Math.max(loaded, this.videoEl.buffered.end(i));
            }
            this.el.progressBuffered.style.width = `${(loaded / this.videoEl.duration) * 100}%`;
        }
    });
  }

  showControls() {
    this.wrapper.classList.remove('idle');
  }

  hideControls() {
    this.wrapper.classList.add('idle');
    this.el.settingsMenu.classList.remove('open');
  }

  async loadVideo(videoId) {
    this.currentVideoId = videoId;
    this.wrapper.classList.add('buffering');
    this.el.spinner.style.display = 'flex';
    this.el.centerPlay.style.display = 'none';
    
    try {
        const res = await window.PawTubeAPI.getVideoInfo(videoId);
        const info = res.video || res;
        const instance = res.instance || "";
        this.currentInstance = res.instance || "";
        this.currentProvider = res.provider || "piped";
        
        this.currentStreams = info.streams || info.formatStreams || [];
        
        // Prefer 720p mp4, fallback to anything else
        let bestStream = this.currentStreams.find(s => (s.quality === '720p' || s.resolution === '720p') && (s.mimeType || s.container || '').includes('mp4') && s.hasAudio) 
            || this.currentStreams.find(s => (s.quality === '360p' || s.resolution === '360p') && (s.mimeType || s.container || '').includes('mp4') && s.hasAudio)
            || this.currentStreams.find(s => (s.mimeType || '').includes('mp4') && s.hasAudio)
            || this.currentStreams[0];

        if (bestStream && bestStream.url) {
            this.currentQuality = bestStream.quality || bestStream.resolution || 'Auto';
            let streamUrl = bestStream.url;
            
            // Re-route proxy to the healthy this.currentInstance chosen by unified backend
            if (this.currentInstance && !streamUrl.startsWith('http')) {
               streamUrl = this.currentInstance + streamUrl;
            }
            this.videoEl.src = streamUrl;
            this.videoEl.play().catch(e => console.warn('Auto-play prevented:', e));
        } else {
            throw new Error('No compatible video streams found.');
        }
    } catch (e) {
        console.error('Failed to load video stream:', e);
        this.wrapper.classList.remove('buffering');
        this.el.spinner.style.display = 'none';
        window.showToast?.("Upstream API Error (Instances may be blocked by YouTube)");
    }
  }

  togglePlay() {
    if (this.videoEl.paused) {
      this.videoEl.play();
    } else {
      this.videoEl.pause();
    }
  }

  skip(seconds) {
    if (this.videoEl.duration) {
        this.videoEl.currentTime = Math.min(this.videoEl.duration, Math.max(0, this.videoEl.currentTime + seconds));
    }
    this.showControls();
  }

  toggleMute() {
    this.videoEl.muted = !this.videoEl.muted;
    if (!this.videoEl.muted && this.videoEl.volume === 0) {
        this.videoEl.volume = 1;
        this.el.volumeSlider.value = 100;
        localStorage.setItem('pt_volume', '100');
    }
    this.updateVolumeUI();
  }

  setVolume(vol) {
    this.videoEl.muted = false;
    this.videoEl.volume = vol / 100;
    localStorage.setItem('pt_volume', vol);
    this.updateVolumeUI();
  }

  updateVolumeUI() {
    const muted = this.videoEl.muted;
    const vol = this.videoEl.volume * 100;
    this.el.volumeSlider.value = muted ? 0 : vol;
    
    let icon = 'volume_up';
    if (muted || vol === 0) icon = 'volume_off';
    else if (vol < 50) icon = 'volume_down';
    this.el.muteBtn.innerHTML = `<span class="material-symbols-rounded">${icon}</span>`;
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      if (this.wrapper.requestFullscreen) this.wrapper.requestFullscreen();
      this.el.fullscreenBtn.innerHTML = '<span class="material-symbols-rounded">fullscreen_exit</span>';
      this.wrapper.classList.add('fullscreen');
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      this.el.fullscreenBtn.innerHTML = '<span class="material-symbols-rounded">fullscreen</span>';
      this.wrapper.classList.remove('fullscreen');
    }
  }

  toggleTheater() {
    this.isTheater = !this.isTheater;
    if (this.isTheater) {
      document.body.classList.add('theater');
    } else {
      document.body.classList.remove('theater');
    }
  }

  async togglePiP() {
    try {
      if (!document.pictureInPictureEnabled) {
        window.showToast?.("PiP is not supported in this browser or iframe");
        return;
      }
      
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await this.videoEl.requestPictureInPicture();
      }
    } catch(err) {
       console.error("PiP error:", err);
       window.showToast?.("Picture-in-Picture failed. Try opening the app in a new tab.");
    }
  }

  updateProgress() {
    if (this.isDragging) return;
    const curr = this.videoEl.currentTime || 0;
    const dur = this.videoEl.duration || 0;
    const fraction = dur > 0 ? (curr / dur) * 100 : 0;
    
    this.el.progressFilled.style.width = `${fraction}%`;
    this.el.progressThumb.style.left = `${fraction}%`;
    this.el.timeDisplay.textContent = `${this.formatTime(curr)} / ${this.formatTime(dur)}`;
  }

  formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    seconds = Math.floor(seconds);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  handleKeydown(e) {
    if (!this.wrapper.parentNode || this.wrapper.style.display === 'none') return;
    // Don't intercept if user is typing
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.isContentEditable) return;
    
    const key = e.key.toLowerCase();
    switch(key) {
      case ' ':
      case 'k': e.preventDefault(); this.togglePlay(); break;
      case 'j': this.skip(-10); break;
      case 'l': this.skip(10); break;
      case 'arrowleft': this.skip(-5); break;
      case 'arrowright': this.skip(5); break;
      case 'arrowup': e.preventDefault(); this.setVolume(Math.min(100, (this.videoEl.volume * 100) + 5)); break;
      case 'arrowdown': e.preventDefault(); this.setVolume(Math.max(0, (this.videoEl.volume * 100) - 5)); break;
      case 'm': this.toggleMute(); break;
      case 'f': this.toggleFullscreen(); break;
      case 't': this.toggleTheater(); break;
      case '0': 
      case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9':
          if (this.videoEl.duration) {
              const p = parseInt(key) / 10;
              this.videoEl.currentTime = this.videoEl.duration * p;
          }
          break;
    }
  }

  renderSettingsMenu(state) {
     this.settingsMenuState = state;
     let html = '';
     if (state === 'main') {
        html = `
          <div class="player-menu-item" onclick="customPlayer.renderSettingsMenu('speed')">
             <span>Playback Speed</span>
             <span class="material-symbols-rounded">chevron_right</span>
          </div>
          <div class="player-menu-item" onclick="customPlayer.renderSettingsMenu('quality')">
             <span>Quality (${this.currentQuality || 'Auto'})</span>
             <span class="material-symbols-rounded">chevron_right</span>
          </div>
        `;
     } else if (state === 'speed') {
        const rates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
        const curr = this.videoEl.playbackRate || 1;
        html = `<div class="player-menu-header" onclick="customPlayer.renderSettingsMenu('main')">
                  <span class="material-symbols-rounded">arrow_back</span> Speed
                </div>`;
        rates.forEach(r => {
           html += `<div class="player-menu-item" onclick="customPlayer.setSpeed(${r})">
                      <span>${r === 1 ? 'Normal' : r + 'x'}</span>
                      ${r === curr ? '<span class="material-symbols-rounded">check</span>' : ''}
                    </div>`;
        });
     } else if (state === 'quality') {
        html = `<div class="player-menu-header" onclick="customPlayer.renderSettingsMenu('main')">
                  <span class="material-symbols-rounded">arrow_back</span> Quality
                </div>`;
        if (this.currentStreams && this.currentStreams.length > 0) {
            // Get unique resolutions preferring mp4 container
            const uniqueRes = [];
            const seen = new Set();
            this.currentStreams.forEach(s => {
                if ((s.resolution || s.quality) && !seen.has(s.resolution || s.quality)) {
                    seen.add(s.resolution || s.quality);
                    uniqueRes.push(s);
                }
            });
            // Sort by numerical resolution descending
            uniqueRes.sort((a, b) => {
                const numA = parseInt(a.resolution || a.quality) || 0;
                const numB = parseInt(b.resolution || b.quality) || 0;
                return numB - numA;
            });
            uniqueRes.forEach(s => {
               html += `<div class="player-menu-item" onclick="customPlayer.setQuality('${s.resolution || s.quality}')">
                          <span>${s.resolution || s.quality}</span>
                          ${(s.resolution || s.quality) === this.currentQuality ? '<span class="material-symbols-rounded">check</span>' : ''}
                        </div>`;
            });
        } else {
            html += `<div class="player-menu-item"><span>Auto</span></div>`;
        }
     }
     this.el.settingsMenu.innerHTML = html;
  }
  
  setSpeed(speed) {
    this.videoEl.playbackRate = speed;
    this.el.settingsMenu.classList.remove('open');
  }

  setQuality(resolution) {
    if (!this.currentStreams || this.currentQuality === resolution) return;
    
    // Find best stream for this resolution
    let stream = this.currentStreams.find(s => (s.resolution === resolution || s.quality === resolution) && s.container === 'mp4') 
              || this.currentStreams.find(s => (s.resolution === resolution || s.quality === resolution));
              
    if (stream && stream.url) {
        const currentTime = this.videoEl.currentTime;
        const isPaused = this.videoEl.paused;
        const playbackRate = this.videoEl.playbackRate;
        
        this.currentQuality = resolution;
        
        let streamUrl = stream.url;
        
        
        this.videoEl.src = streamUrl;
        this.videoEl.playbackRate = playbackRate;
        this.videoEl.currentTime = currentTime;
        
        if (!isPaused) {
            this.videoEl.play().catch(e => console.warn('Auto-play prevented on quality change:', e));
        }
    }
    this.el.settingsMenu.classList.remove('open');
  }
}

window.customPlayer = new CustomPlayer();
window.initPlayer = (id) => window.customPlayer.loadVideo(id);

// Ensure fullscreen exit updates button UI correctly
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && window.customPlayer) {
        window.customPlayer.el.fullscreenBtn.innerHTML = '<span class="material-symbols-rounded">fullscreen</span>';
        window.customPlayer.wrapper.classList.remove('fullscreen');
    }
});
