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
  const subs = getSubscriptions();
  return subs.some((s) => s.id === channelId);
}

export function toggleSubscription(channel) {
  if (!channel || (!channel.id && !channel.channelId)) return false;
  const id = channel.id || channel.channelId;
  const subs = getSubscriptions();
  const index = subs.findIndex((s) => s.id === id);

  if (index >= 0) {
    subs.splice(index, 1);
    localStorage.setItem(SUBS_KEY, JSON.stringify(subs));
    return false; // unsubscribed
  } else {
    subs.push({
      id,
      name: channel.name || channel.channel || channel.author || 'Channel',
      avatar: channel.avatar || channel.thumb || '',
      subscribedAt: Date.now()
    });
    localStorage.setItem(SUBS_KEY, JSON.stringify(subs));
    return true; // subscribed
  }
}
