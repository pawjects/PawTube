/**
 * PawTube - Canonical Video Player Controller
 * Uses YouTube No-Cookie Embed Player (https://www.youtube-nocookie.com/embed/VIDEO_ID)
 * Completely decouples video playback from Piped metadata fetching.
 */

import { extractVideoId } from './videoId.js';
import { buildNoCookieEmbedUrl } from './embed.js';
import { addToHistory } from '../storage/history/historyStorage.js';

export class VideoPlayerController {
  constructor() {
    this.currentVideoId = null;
    this.currentMetadata = null;
    this.iframe = null;
    this.container = null;
    this.isMiniPlayerActive = false;
  }

  initMiniPlayer() {
    const miniWrap = document.getElementById('mini-player');
    const closeBtn = document.getElementById('mini-player-close-btn');
    const expandBtn = document.getElementById('mini-player-expand');
    const playBtn = document.getElementById('mini-player-play-btn');

    if (closeBtn) {
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        this.closeMiniPlayer();
      };
    }

    if (expandBtn) {
      expandBtn.onclick = () => {
        if (this.currentVideoId) {
          window.location.hash = `#/watch?v=${this.currentVideoId}`;
        }
      };
    }

    if (playBtn) {
      playBtn.onclick = (e) => {
        e.stopPropagation();
        // Toggle play/pause if mini-player supports iframe postMessage
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

    if (thumb) {
      thumb.src = metadata?.thumb || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }
    if (title) {
      title.textContent = metadata?.title || 'YouTube Video';
    }
    if (channel) {
      channel.textContent = metadata?.channel || metadata?.author || '';
    }
  }

  closeMiniPlayer() {
    const mini = document.getElementById('mini-player');
    if (mini) mini.style.display = 'none';
    this.isMiniPlayerActive = false;
    this.currentVideoId = null;
  }

  hideMiniPlayer() {
    const mini = document.getElementById('mini-player');
    if (mini) mini.style.display = 'none';
  }

  createIframe(videoId) {
    const cleanId = extractVideoId(videoId);
    if (!cleanId) return null;

    const embedUrl = buildNoCookieEmbedUrl(cleanId, {
      autoplay: 1,
      playsinline: 1,
      controls: 1
    });

    const iframe = document.createElement('iframe');
    iframe.src = embedUrl;
    iframe.title = 'PawTube Player';
    iframe.className = 'player-iframe';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.borderRadius = '12px';

    this.iframe = iframe;
    this.currentVideoId = cleanId;

    // Record to local watch history immediately
    addToHistory({
      id: cleanId,
      title: this.currentMetadata?.title || 'YouTube Video',
      author: this.currentMetadata?.author || this.currentMetadata?.channel || '',
      channel: this.currentMetadata?.channel || this.currentMetadata?.author || '',
      thumb: `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`
    });

    return iframe;
  }
}

export const playerController = new VideoPlayerController();
export default playerController;
