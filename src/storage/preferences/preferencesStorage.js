/**
 * PawTube - User Preferences, Subscriptions & Identity Storage
 */

const PREFS_KEY = 'pawtube_prefs';
const SUBS_KEY = 'pawtube_subscriptions';

export const DEFAULT_PREFS = {
  // PLAYBACK
  autoplay: true,
  defaultQuality: 'auto', // 'auto' | '1080p' | '720p' | '480p' | '360p'
  captions: false,
  rememberPosition: true,

  // APPEARANCE
  theme: 'amoled', // 'amoled' | 'midnight'
  liquidGlass: true,
  reducedMotion: false,

  // PRIVACY
  historyEnabled: true,
  searchHistoryEnabled: true,
  personalizationEnabled: true,

  // FEED
  region: 'IN', // 'IN' | 'US' | 'GB' | 'DE' | 'JP' | 'FR' | 'CA'
  hideShorts: false,

  // PLAYER
  miniPlayerEnabled: true,
  theatreModeDefault: false,
  rememberVolume: true,
  savedVolume: 100,

  // INSTANCE & NETWORK
  customInstance: '',

  // LOCAL IDENTITY
  username: 'PawTube Explorer',
  avatarTheme: 'blue' // 'blue' | 'purple' | 'emerald' | 'amber' | 'crimson'
};

export function getPreferences() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS };
  } catch (err) {
    return { ...DEFAULT_PREFS };
  }
}

export function savePreferences(prefs) {
  try {
    const current = getPreferences();
    const updated = { ...current, ...prefs };
    localStorage.setItem(PREFS_KEY, JSON.stringify(updated));
    applyAppearancePreferences(updated);
    window.dispatchEvent(new CustomEvent('pawtube:prefsChanged', { detail: updated }));
    return updated;
  } catch (err) {
    console.error('Failed to save preferences:', err);
    return getPreferences();
  }
}

export function applyAppearancePreferences(prefs = getPreferences()) {
  try {
    const root = document.documentElement;

    // Theme (AMOLED vs Midnight)
    if (prefs.theme === 'midnight') {
      root.setAttribute('data-theme', 'midnight');
    } else {
      root.removeAttribute('data-theme');
    }

    // Liquid Glass effects
    if (prefs.liquidGlass === false) {
      root.classList.add('no-glass');
    } else {
      root.classList.remove('no-glass');
    }

    // Reduced motion
    if (prefs.reducedMotion) {
      root.classList.add('reduced-motion');
    } else {
      root.classList.remove('reduced-motion');
    }
  } catch (e) {
    console.warn('Failed to apply appearance preferences:', e);
  }
}

export function resetPreferences() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(DEFAULT_PREFS));
    applyAppearancePreferences(DEFAULT_PREFS);
    window.dispatchEvent(new CustomEvent('pawtube:prefsChanged', { detail: DEFAULT_PREFS }));
    return DEFAULT_PREFS;
  } catch (err) {
    return DEFAULT_PREFS;
  }
}

export function getCustomInstance() {
  const prefs = getPreferences();
  return (prefs.customInstance || '').trim();
}

export function setCustomInstance(url) {
  const clean = (url || '').trim();
  savePreferences({ customInstance: clean });
}

export function getSubscriptions() {
  try {
    const raw = localStorage.getItem(SUBS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

export function isSubscribed(channelId) {
  if (!channelId) return false;
  const cleanId = channelId.replace(/^\/channel\//, '');
  const subs = getSubscriptions();
  return subs.some((s) => s.id === cleanId || s.id === channelId);
}

export function toggleSubscription(channel) {
  if (!channel || (!channel.id && !channel.channelId)) return false;
  const rawId = channel.id || channel.channelId;
  const id = rawId.replace(/^\/channel\//, '');
  const subs = getSubscriptions();
  const index = subs.findIndex((s) => s.id === id || s.id === rawId);

  let status = false;
  if (index >= 0) {
    subs.splice(index, 1);
    localStorage.setItem(SUBS_KEY, JSON.stringify(subs));
    status = false; // unfollowed
  } else {
    subs.push({
      id,
      name: channel.name || channel.channel || channel.author || 'Channel',
      avatar: channel.avatar || channel.thumb || '',
      verified: Boolean(channel.verified),
      subscribers: channel.subscribers || 0,
      subscribedAt: Date.now()
    });
    localStorage.setItem(SUBS_KEY, JSON.stringify(subs));
    status = true; // followed
  }

  try {
    window.dispatchEvent(new CustomEvent('pawtube:followChange', { detail: { id, followed: status } }));
  } catch {}

  return status;
}

// Aliases for clear local "Follow" semantics
export const getFollowedChannels = getSubscriptions;
export const isFollowed = isSubscribed;
export const toggleFollow = toggleSubscription;

/**
 * Export all local PawTube data as a downloadable JSON object
 */
export function exportAllUserData() {
  return {
    version: '1.2.0',
    exportedAt: new Date().toISOString(),
    preferences: getPreferences(),
    subscriptions: getSubscriptions(),
    history: JSON.parse(localStorage.getItem('pawtube_history') || '[]'),
    playlists: JSON.parse(localStorage.getItem('pawtube_playlists') || '[]'),
    likedVideos: JSON.parse(localStorage.getItem('pawtube_liked_videos') || '[]'),
    recentSearches: JSON.parse(localStorage.getItem('pawtube_recent_searches') || '[]')
  };
}

/**
 * Completely wipe local PawTube storage
 */
export function clearAllLocalUserData() {
  const keys = [
    PREFS_KEY,
    SUBS_KEY,
    'pawtube_history',
    'pawtube_playlists',
    'pawtube_liked_videos',
    'pawtube_recent_searches',
    'pawtube_video_cache'
  ];
  keys.forEach((k) => localStorage.removeItem(k));
  applyAppearancePreferences(DEFAULT_PREFS);
}

