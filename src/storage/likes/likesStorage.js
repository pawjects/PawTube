/**
 * PawTube - Local Likes & Favorites Storage Manager
 * Strictly local-only favorites system using localStorage.
 * Does not send fake requests or simulate unauthorized YouTube accounts.
 */

import { addToPlaylist, removeFromPlaylist } from '../playlists/playlistStorage.js';

const LIKES_KEY = 'pawtube_liked_videos';

export function getLikedVideos() {
  try {
    const raw = localStorage.getItem(LIKES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read liked videos:', err);
    return [];
  }
}

export function saveLikedVideos(likes) {
  try {
    localStorage.setItem(LIKES_KEY, JSON.stringify(likes));
    window.dispatchEvent(new CustomEvent('pawtube:likeChange', { detail: { count: likes.length } }));
  } catch (err) {
    console.error('Failed to save liked videos:', err);
  }
}

export function isLiked(videoId) {
  if (!videoId) return false;
  const likes = getLikedVideos();
  return likes.some((v) => v.id === videoId);
}

export function toggleLike(video) {
  if (!video || !video.id) return false;
  const likes = getLikedVideos();
  const existingIdx = likes.findIndex((v) => v.id === video.id);
  const currentlyLiked = existingIdx !== -1;

  if (currentlyLiked) {
    likes.splice(existingIdx, 1);
    saveLikedVideos(likes);
    removeFromPlaylist('favorites', video.id);
    return false;
  } else {
    likes.unshift({
      id: video.id,
      title: video.title || 'YouTube Video',
      channel: video.channel || video.author || '',
      author: video.author || video.channel || '',
      thumb: video.thumb || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
      durationFormatted: video.durationFormatted || '',
      likedAt: Date.now()
    });
    saveLikedVideos(likes);
    addToPlaylist('favorites', {
      id: video.id,
      title: video.title || 'YouTube Video',
      channel: video.channel || video.author || '',
      author: video.author || video.channel || '',
      thumb: video.thumb || `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
      durationFormatted: video.durationFormatted || ''
    });
    return true;
  }
}

export function removeLike(videoId) {
  if (!videoId) return;
  const likes = getLikedVideos().filter((v) => v.id !== videoId);
  saveLikedVideos(likes);
  removeFromPlaylist('favorites', videoId);
}

export function clearLikes() {
  saveLikedVideos([]);
}
