/**
 * PawTube - User Preferences & Subscriptions Storage
 */

const PREFS_KEY = 'pawtube_prefs';
const SUBS_KEY = 'pawtube_subscriptions';

const DEFAULT_PREFS = {
  region: 'US',
  customInstance: '',
  autoplay: true,
  reducedMotion: false,
  highQuality: true
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
    return updated;
  } catch (err) {
    console.error('Failed to save preferences:', err);
    return getPreferences();
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

