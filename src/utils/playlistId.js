/**
 * PawTube - Playlist ID Extraction Utility
 * Handles various playlist URL schemes and ID formats reliably:
 * - Direct IDs: PL..., OLAK..., RD..., UU...
 * - Query URLs: ?list=PL... or &list=PL...
 * - Path URLs: /playlist/PL..., /playlists/PL..., /pawtube/playlist/PL...
 * - Hash URLs: #/playlist?list=PL..., #/playlist/PL...
 * - Full URLs: https://www.youtube.com/playlist?list=PL...
 * - VL prefix: VLPL... -> PL...
 */

export function extractPlaylistId(input) {
  if (!input || typeof input !== 'string') return '';
  let clean = decodeURIComponent(input.trim());

  // Extract from query parameters e.g. ?list=... or &list=...
  const listMatch = clean.match(/[?&]list=([^&#]+)/i);
  if (listMatch) {
    clean = listMatch[1];
  }

  // Strip leading prefixes
  clean = clean.replace(/^(?:#|\/pawtube)?\/?playlists?\//i, '');
  clean = clean.replace(/^(?:#|\/pawtube)?\/?playlist\?list=/i, '');

  // Strip VL prefix if present (YouTube uses VL for playlist view e.g. VLPL...)
  if (clean.startsWith('VLPL')) {
    clean = clean.substring(2);
  }

  // Strip trailing slashes, fragments, or extra query parameters
  clean = clean.split(/[?#&]/)[0].trim();

  return clean;
}

export default extractPlaylistId;
