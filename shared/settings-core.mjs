/**
 * Platform settings shared by the Node API and the Cloudflare Worker.
 *
 * Keybindings, touch layout and voice preferences are owned by the existing
 * controls/voice systems; this module stores the platform-only preferences:
 * privacy, notification visibility, interface sound, graphics and accessibility.
 */

export const SETTINGS_VERSION = 1;

export const DEFAULT_SETTINGS = {
  version: SETTINGS_VERSION,
  privacy: {
    profileVisibility: 'public',
    friendRequests: 'everyone',
    messages: 'everyone',
    invitations: 'everyone',
  },
  notifications: {
    messages: true,
    friendRequests: true,
    invitations: true,
    worldActivity: true,
    events: true,
    announcements: true,
  },
  audio: {
    muted: false,
  },
  graphics: {
    quality: 'high',
  },
  accessibility: {
    largeText: false,
    highContrast: false,
    reduceMotion: false,
  },
};

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const pick = (value, allowed, fallback) =>
  typeof value === 'string' && allowed.includes(value) ? value : fallback;

const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

/** Normalise arbitrary client input into the stored settings shape. */
export function sanitizeSettings(input) {
  const raw = isObject(input) ? input : {};
  const privacy = isObject(raw.privacy) ? raw.privacy : {};
  const notifications = isObject(raw.notifications) ? raw.notifications : {};
  const audio = isObject(raw.audio) ? raw.audio : {};
  const graphics = isObject(raw.graphics) ? raw.graphics : {};
  const accessibility = isObject(raw.accessibility) ? raw.accessibility : {};

  return {
    version: SETTINGS_VERSION,
    privacy: {
      profileVisibility: pick(privacy.profileVisibility, ['public', 'friends', 'private'], 'public'),
      friendRequests: pick(privacy.friendRequests, ['everyone', 'nobody'], 'everyone'),
      messages: pick(privacy.messages, ['everyone', 'friends'], 'everyone'),
      invitations: pick(privacy.invitations, ['everyone', 'nobody'], 'everyone'),
    },
    notifications: {
      messages: bool(notifications.messages, true),
      friendRequests: bool(notifications.friendRequests, true),
      invitations: bool(notifications.invitations, true),
      worldActivity: bool(notifications.worldActivity, true),
      events: bool(notifications.events, true),
      announcements: bool(notifications.announcements, true),
    },
    audio: {
      muted: bool(audio.muted, false),
    },
    graphics: {
      quality: pick(graphics.quality, ['low', 'medium', 'high'], 'high'),
    },
    accessibility: {
      largeText: bool(accessibility.largeText, false),
      highContrast: bool(accessibility.highContrast, false),
      reduceMotion: bool(accessibility.reduceMotion, false),
    },
  };
}
