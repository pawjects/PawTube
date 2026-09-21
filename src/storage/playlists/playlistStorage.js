/**
 * PawTube - Local Playlists Storage Manager
 */

const PLAYLISTS_KEY = 'pawtube_playlists';

export function getPlaylists() {
  try {
    const raw = localStorage.getItem(PLAYLISTS_KEY);
    return raw ? JSON.parse(raw) : [
      { id: 'watch-later', name: 'Watch Later', items: [], createdAt: Date.now() },
      { id: 'favorites', name: 'Favorites', items: [], createdAt: Date.now() }
    ];
  } catch (err) {
    console.error('Failed to read playlists from localStorage:', err);
    return [];
  }
}

export function savePlaylists(playlists) {
  try {
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
  } catch (err) {
    console.error('Failed to save playlists to localStorage:', err);
  }
}

export function createPlaylist(name) {
  if (!name || !name.trim()) return null;
  const list = getPlaylists();
  const newPl = {
    id: 'pl_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    name: name.trim(),
    items: [],
    createdAt: Date.now()
  };
  list.push(newPl);
  savePlaylists(list);
  return newPl;
}

export function deletePlaylist(playlistId) {
  if (playlistId === 'watch-later' || playlistId === 'favorites') return;
  const list = getPlaylists().filter((p) => p.id !== playlistId);
  savePlaylists(list);
}

export function addToPlaylist(playlistId, item) {
  if (!playlistId || !item || !item.id) return false;
  const list = getPlaylists();
  const pl = list.find((p) => p.id === playlistId);
  if (!pl) return false;

  if (!pl.items.some((i) => i.id === item.id)) {
    pl.items.unshift({
      id: item.id,
      title: item.title,
      author: item.author || item.channel || '',
      channel: item.channel || item.author || '',
      thumb: item.thumb || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
      durationFormatted: item.durationFormatted || '',
      addedAt: Date.now()
    });
    savePlaylists(list);
  }
  return true;
}

export function removeFromPlaylist(playlistId, videoId) {
  if (!playlistId || !videoId) return;
  const list = getPlaylists();
  const pl = list.find((p) => p.id === playlistId);
  if (!pl) return;

  pl.items = pl.items.filter((i) => i.id !== videoId);
  savePlaylists(list);
}
