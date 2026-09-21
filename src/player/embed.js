/**
 * PawTube - Canonical YouTube No-Cookie Embed Builder
 * URL format: https://www.youtube-nocookie.com/embed/{VIDEO_ID}
 */

import { extractVideoId } from './videoId.js';

export function buildNoCookieEmbedUrl(videoId, options = null) {
  const cleanId = extractVideoId(videoId);
  if (!cleanId) return null;

  const base = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(cleanId)}`;
  if (!options || Object.keys(options).length === 0) {
    return `${base}?autoplay=1&playsinline=1&rel=0&modestbranding=1&enablejsapi=1`;
  }

  const params = new URLSearchParams();
  if (options.autoplay !== undefined) {
    params.set('autoplay', options.autoplay ? '1' : '0');
  } else {
    params.set('autoplay', '1');
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

export const buildEmbedUrl = buildNoCookieEmbedUrl;
export default buildNoCookieEmbedUrl;
