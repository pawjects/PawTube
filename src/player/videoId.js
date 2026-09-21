/**
 * PawTube - Canonical Video ID Extractor
 * Extracts and validates an 11-character YouTube video ID from any format.
 */

export function extractVideoId(input) {
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

export default extractVideoId;
