class CustomPlayer {
  constructor() {
    this.player = null;
    this.wrapper = null;
    this.uiTimeout = null;
    this.isDragging = false;
    this.currentVideoId = null;
    this.isTheater = false;
    this.settingsMenuState = 'main'; // main, speed, quality
    
    // Create UI elements
    this.initDOM();
    this.bindEvents();
    
    window.onYouTubeIframeAPIReady = () => {
      this.apiReady = true;
      if (this.pendingVideoId) {
        this.loadVideo(this.pendingVideoId);
        this.pendingVideoId = null;
      }
    };
  }
  
  initDOM() {
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'custom-player-wrapper idle';
    this.wrapper.innerHTML = `
       <div id="yt-player-container"></div>
       <div class="player-click-layer"></div>
       <div class="custom-player-ui" id="custom-player-ui">
           <div class="player-loading-spinner" id="player-loading-spinner"><span class="material-symbols-rounded spinner-icon">progress_activity</span></div>
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
                        <button class="player-btn" id="player-cc-btn" aria-label="Subtitles/CC"><span class="material-symbols-rounded">closed_caption</span></button>
                        
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
    };
    
    // Hide PiP if not supported
    if (!document.pictureInPictureEnabled) {
      this.el.pipBtn.style.display = 'none';
    }
    
    // Load saved preferences
    const savedVol = localStorage.getItem('pt_volume');
    if (savedVol !== null) this.el.volumeSlider.value = savedVol;
  }

  bindEvents() {
    // Mouse movement to show/hide controls
    this.wrapper.addEventListener('mousemove', (e) => {
      this.showControls();
      if (!this.wrapper.classList.contains('paused')) {
        clearTimeout(this.uiTimeout);
        this.uiTimeout = setTimeout(() => this.hideControls(), 2500);
      }
      
      // Update progress hover
      if (e.target.closest('#player-progress-container')) {
         const rect = this.el.progressContainer.getBoundingClientRect();
         let x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
         let percent = x / rect.width;
         this.el.progressHover.style.width = (percent * 100) + '%';
         
         if (this.player && this.player.getDuration) {
           const time = percent * this.player.getDuration();
           this.el.timeTooltip.textContent = this.formatTime(time);
           this.el.timeTooltip.style.display = 'block';
           this.el.timeTooltip.style.left = (percent * 100) + '%';
         }
      } else {
         this.el.timeTooltip.style.display = 'none';
      }
    });
    
    this.wrapper.addEventListener('mouseleave', () => {
      if (!this.wrapper.classList.contains('paused')) {
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
      if (this.player && this.player.getDuration) {
         this.player.seekTo(percent * this.player.getDuration(), true);
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
    
    // CC
    this.el.ccBtn.addEventListener('click', () => this.toggleCC());
    
    // Keyboard
    document.addEventListener('keydown', (e) => this.handleKeydown(e));
  }

  showControls() {
    this.wrapper.classList.remove('idle');
  }

  hideControls() {
    this.wrapper.classList.add('idle');
    this.el.settingsMenu.classList.remove('open');
  }

  loadVideo(videoId) {
    if (!this.apiReady) {
      this.pendingVideoId = videoId;
      return;
    }
    
    this.currentVideoId = videoId;
    this.wrapper.classList.add('buffering');
    
    if (this.player) {
      this.player.loadVideoById(videoId);
    } else {
      this.player = new YT.Player('yt-player-container', {
        videoId: videoId,
        playerVars: {
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          iv_load_policy: 3,
          autoplay: 1,
          playsinline: 1,
          origin: window.location.origin
        },
        events: {
          onReady: (e) => this.onPlayerReady(e),
          onStateChange: (e) => this.onStateChange(e),
          onError: (e) => this.onError(e)
        }
      });
    }
  }

  onPlayerReady(event) {
    // Apply saved volume
    const savedVol = localStorage.getItem('pt_volume');
    if (savedVol !== null) {
      this.player.setVolume(parseInt(savedVol));
    }
    this.updateVolumeUI();
    
    // Start progress loop
    if (this.progressInterval) clearInterval(this.progressInterval);
    this.progressInterval = setInterval(() => this.updateProgress(), 500);
    
    this.player.playVideo();
  }

  onStateChange(event) {
    // YT.PlayerState: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
    this.wrapper.classList.remove('buffering');
    
    if (event.data === YT.PlayerState.PLAYING) {
      this.wrapper.classList.remove('paused');
      this.el.playBtn.innerHTML = '<span class="material-symbols-rounded">pause</span>';
      this.el.centerPlay.style.display = 'none';
      clearTimeout(this.uiTimeout);
      this.uiTimeout = setTimeout(() => this.hideControls(), 2500);
    } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
      this.wrapper.classList.add('paused');
      this.el.playBtn.innerHTML = '<span class="material-symbols-rounded">play_arrow</span>';
      this.el.centerPlay.innerHTML = event.data === YT.PlayerState.ENDED ? '<span class="material-symbols-rounded">replay</span>' : '<span class="material-symbols-rounded">play_arrow</span>';
      this.el.centerPlay.style.display = 'flex';
      this.showControls();
    } else if (event.data === YT.PlayerState.BUFFERING) {
      this.wrapper.classList.add('buffering');
    }
  }
  
  onError(e) {
    this.wrapper.classList.remove('buffering');
    console.error('Player error:', e.data);
  }

  togglePlay() {
    if (!this.player || !this.player.getPlayerState) return;
    const state = this.player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
      this.player.pauseVideo();
    } else {
      this.player.playVideo();
    }
  }

  skip(seconds) {
    if (!this.player || !this.player.getCurrentTime) return;
    const curr = this.player.getCurrentTime();
    this.player.seekTo(curr + seconds, true);
    this.showControls();
  }

  toggleMute() {
    if (!this.player || !this.player.isMuted) return;
    if (this.player.isMuted()) {
      this.player.unMute();
      if (this.player.getVolume() === 0) {
        this.player.setVolume(100);
        this.el.volumeSlider.value = 100;
      }
    } else {
      this.player.mute();
    }
    this.updateVolumeUI();
  }

  setVolume(vol) {
    if (!this.player || !this.player.setVolume) return;
    this.player.unMute();
    this.player.setVolume(vol);
    localStorage.setItem('pt_volume', vol);
    this.updateVolumeUI();
  }

  updateVolumeUI() {
    if (!this.player || !this.player.isMuted) return;
    const muted = this.player.isMuted();
    const vol = this.player.getVolume();
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
    // Attempt PiP on the iframe wrapper... actually PiP API requires a video element.
    // If the browser doesn't expose it across origins, we might fail gracefully.
    try {
      const video = this.wrapper.querySelector('video'); // May not exist due to cross-origin iframe
      if (video) {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await video.requestPictureInPicture();
        }
      } else {
         window.showToast?.("PiP not fully supported for this player");
      }
    } catch(err) {
       console.error("PiP error:", err);
       window.showToast?.("PiP not supported");
    }
  }

  toggleCC() {
     if (!this.player) return;
     try {
       // A quick toggle if tracks exist
       const tracks = this.player.getOption('captions', 'tracklist') || [];
       if (tracks.length > 0) {
         this.player.loadModule('captions');
         this.player.setOption('captions', 'track', { languageCode: tracks[0].languageCode });
         window.showToast?.("Captions enabled");
       } else {
         this.player.loadModule('captions');
         this.player.setOption('captions', 'track', { languageCode: 'en' });
         window.showToast?.("Captions enabled (English)");
       }
     } catch(e) {}
  }

  updateProgress() {
    if (!this.player || !this.player.getCurrentTime || this.isDragging) return;
    const curr = this.player.getCurrentTime();
    const dur = this.player.getDuration() || 0;
    const fraction = dur > 0 ? (curr / dur) * 100 : 0;
    
    this.el.progressFilled.style.width = `${fraction}%`;
    this.el.progressThumb.style.left = `${fraction}%`;
    this.el.timeDisplay.textContent = `${this.formatTime(curr)} / ${this.formatTime(dur)}`;
    
    const loaded = this.player.getVideoLoadedFraction();
    this.el.progressBuffered.style.width = `${loaded * 100}%`;
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
      case 'arrowup': e.preventDefault(); this.setVolume(Math.min(100, (this.player?.getVolume()||0) + 5)); break;
      case 'arrowdown': e.preventDefault(); this.setVolume(Math.max(0, (this.player?.getVolume()||0) - 5)); break;
      case 'm': this.toggleMute(); break;
      case 'f': this.toggleFullscreen(); break;
      case 't': this.toggleTheater(); break;
      case '0': 
      case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8': case '9':
          if (this.player && this.player.getDuration) {
              const p = parseInt(key) / 10;
              this.player.seekTo(this.player.getDuration() * p, true);
          }
          break;
    }
  }

  renderSettingsMenu(state) {
     this.settingsMenuState = state;
     let html = '';
     if (state === 'main') {
        html = `
          <div class="player-menu-item" onclick="customPlayer.renderSettingsMenu('captions')">
             <span>Subtitles/CC</span>
             <span class="material-symbols-rounded">chevron_right</span>
          </div>
          <div class="player-menu-item" onclick="customPlayer.renderSettingsMenu('speed')">
             <span>Playback Speed</span>
             <span class="material-symbols-rounded">chevron_right</span>
          </div>
          <div class="player-menu-item" onclick="customPlayer.renderSettingsMenu('quality')">
             <span>Quality</span>
             <span class="material-symbols-rounded">chevron_right</span>
          </div>
        `;
     } else if (state === 'captions') {
        html = `<div class="player-menu-header" onclick="customPlayer.renderSettingsMenu('main')">
                  <span class="material-symbols-rounded">arrow_back</span> Subtitles/CC
                </div>`;
        html += `<div class="player-menu-item" onclick="customPlayer.setCaption('')">
                    <span>Off</span>
                 </div>`;
        let tracks = [];
        try {
           tracks = this.player?.getOption('captions', 'tracklist') || [];
        } catch(e) {}
        
        if (tracks.length === 0) {
           html += `<div class="player-menu-item" onclick="customPlayer.setCaption('en')">
                      <span>English (Auto-generated/Default)</span>
                    </div>`;
        } else {
           tracks.forEach(t => {
              html += `<div class="player-menu-item" onclick="customPlayer.setCaption('${t.languageCode}')">
                        <span>${t.languageName || t.displayName || t.languageCode}</span>
                      </div>`;
           });
        }
     } else if (state === 'speed') {
        const rates = this.player?.getAvailablePlaybackRates() || [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
        const curr = this.player?.getPlaybackRate() || 1;
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
        const levels = this.player?.getAvailableQualityLevels() || ['auto'];
        const curr = this.player?.getPlaybackQuality() || 'auto';
        html = `<div class="player-menu-header" onclick="customPlayer.renderSettingsMenu('main')">
                  <span class="material-symbols-rounded">arrow_back</span> Quality
                </div>`;
        levels.forEach(q => {
           let label = q;
           if (q === 'hd1080') label = '1080p';
           if (q === 'hd720') label = '720p';
           if (q === 'large') label = '480p';
           if (q === 'medium') label = '360p';
           if (q === 'small') label = '240p';
           if (q === 'tiny') label = '144p';
           if (q === 'highres') label = '4K';
           html += `<div class="player-menu-item" onclick="customPlayer.setQuality('${q}')">
                      <span style="text-transform:capitalize">${label}</span>
                      ${q === curr ? '<span class="material-symbols-rounded">check</span>' : ''}
                    </div>`;
        });
     }
     this.el.settingsMenu.innerHTML = html;
  }
  
  setSpeed(speed) {
    if (this.player) this.player.setPlaybackRate(speed);
    this.el.settingsMenu.classList.remove('open');
  }
  
  setQuality(q) {
    if (this.player) this.player.setPlaybackQuality(q);
    this.el.settingsMenu.classList.remove('open');
  }

  setCaption(lang) {
    if (!this.player) return;
    if (lang) {
      this.player.loadModule('captions');
      this.player.setOption('captions', 'track', { languageCode: lang });
      window.showToast?.(`Captions set to ${lang}`);
    } else {
      this.player.unloadModule('captions');
      window.showToast?.('Captions disabled');
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
