/**
 * PawTube - Media Normalization & Validation Models
 */

import { extractVideoId } from '../../player/videoId.js';

export function formatDuration(seconds) {
  if (seconds === undefined || seconds === null) return '0:00';
  if (seconds < 0) return 'LIVE';
  const num = Math.floor(Number(seconds)) || 0;
  if (num <= 0) return '0:00';
  const h = Math.floor(num / 3600);
  const m = Math.floor((num % 3600) / 60);
  const s = num % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatViews(views) {
  if (views === null || views === undefined) return '';
  const num = typeof views === 'number' ? views : parseInt(String(views).replace(/[^0-9]/g, ''), 10);
  if (isNaN(num)) return '';
  if (num === 0) return '0 views';
  if (num === 1) return '1 view';
  if (num >= 1000000000) return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'B views';
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M views';
  if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K views';
  return `${num.toLocaleString()} views`;
}

export function formatUploadedDate(dateVal) {
  if (!dateVal || dateVal === -1) return '';
  if (typeof dateVal === 'string') {
    const trimmed = dateVal.trim();
    if (trimmed.toLowerCase().includes('ago') || trimmed.toLowerCase() === 'live') return trimmed;
    const parsed = Date.parse(trimmed);
    if (!isNaN(parsed) && parsed > 0) {
      dateVal = parsed;
    }
  }
  const num = typeof dateVal === 'number' ? dateVal : parseInt(String(dateVal), 10);
  if (num && !isNaN(num) && num > 0) {
    const ms = num < 10000000000 ? num * 1000 : num;
    const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (diffSec < 60) return 'Just now';
    const minutes = Math.floor(diffSec / 60);
    if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return days === 1 ? '1 day ago' : `${days} days ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
    const months = Math.floor(days / 30.4375);
    if (months < 12) return months <= 1 ? '1 month ago' : `${months} months ago`;
    const years = Math.floor(days / 365.25);
    return years <= 1 ? '1 year ago' : `${years} years ago`;
  }
  return '';
}

export function normalizeMediaItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = extractVideoId(raw.id || raw.videoId || raw.url);
  if (!id || id.length !== 11 || !raw.title) return null;

  const duration = typeof raw.duration === 'number' ? raw.duration : (parseInt(raw.duration, 10) || 0);
  const views = typeof raw.views === 'number' ? raw.views : (parseInt(String(raw.views || '').replace(/[^0-9]/g, ''), 10) || 0);

  return {
    id,
    url: `https://www.youtube.com/watch?v=${id}`,
    pawtubeUrl: `#/watch?v=${id}`,
    title: (raw.title || '').trim(),
    channel: raw.channel || raw.author || raw.uploaderName || raw.uploader || 'Unknown Channel',
    author: raw.channel || raw.author || raw.uploaderName || raw.uploader || 'Unknown Channel',
    channelId: raw.channelId || raw.authorId || (raw.uploaderUrl ? raw.uploaderUrl.replace(/^\/channel\//, '') : ''),
    thumb: raw.thumb || raw.thumbnail || raw.thumbnailUrl || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    avatar: raw.avatar || raw.authorAvatar || raw.uploaderAvatar || '',
    duration,
    durationFormatted: raw.durationFormatted || formatDuration(duration),
    views,
    viewsFormatted: raw.viewsFormatted || formatViews(views),
    uploadedDate: raw.uploadedDate || raw.uploadDate || raw.uploaded || '',
    publishedTime: raw.publishedTime || raw.uploadedDate || '',
    uploadedFormatted: raw.uploadedFormatted || formatUploadedDate(raw.uploadedDate || raw.uploadDate || raw.uploaded || raw.publishedTime),
    isShort: Boolean(raw.isShort || (duration > 0 && duration <= 75)),
    isLive: Boolean(raw.isLive || duration < 0),
    type: raw.type || 'video'
  };
}
