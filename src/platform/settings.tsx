import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../net/api';
import { sfx } from '../game/audio';
import { useSession } from '../session';

export interface PlatformSettings {
  version: number;
  privacy: {
    profileVisibility: 'public' | 'friends' | 'private';
    friendRequests: 'everyone' | 'nobody';
    messages: 'everyone' | 'friends';
    invitations: 'everyone' | 'nobody';
  };
  notifications: {
    messages: boolean;
    friendRequests: boolean;
    invitations: boolean;
    worldActivity: boolean;
    events: boolean;
    announcements: boolean;
  };
  audio: { muted: boolean };
  graphics: { quality: 'low' | 'medium' | 'high' };
  camera: { mobileMode: 'auto' | 'isometric' | 'third-person' };
  accessibility: { largeText: boolean; highContrast: boolean; reduceMotion: boolean };
}

/** Platform-owned sections. Controls, touch and voice use their existing systems. */
export type SettingsSection = 'privacy' | 'notifications' | 'audio' | 'graphics' | 'camera' | 'accessibility';

export type SettingsSync = 'local' | 'saving' | 'synced' | 'error';

export const DEFAULT_SETTINGS: PlatformSettings = {
  version: 1,
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
  audio: { muted: false },
  graphics: { quality: 'high' },
  camera: { mobileMode: 'auto' },
  accessibility: { largeText: false, highContrast: false, reduceMotion: false },
};

const STORAGE_KEY = 'loftlife_platform_settings_v1';

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

const bool = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback;

export function normalizeSettings(input: unknown): PlatformSettings {
  const raw = asObject(input);
  const privacy = asObject(raw.privacy);
  const notifications = asObject(raw.notifications);
  const audio = asObject(raw.audio);
  const graphics = asObject(raw.graphics);
  const camera = asObject(raw.camera);
  const accessibility = asObject(raw.accessibility);
  return {
    version: 1,
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
    audio: { muted: bool(audio.muted, false) },
    graphics: { quality: pick(graphics.quality, ['low', 'medium', 'high'], 'high') },
    camera: { mobileMode: pick(camera.mobileMode, ['auto', 'isometric', 'third-person'], 'auto') },
    accessibility: {
      largeText: bool(accessibility.largeText, false),
      highContrast: bool(accessibility.highContrast, false),
      reduceMotion: bool(accessibility.reduceMotion, false),
    },
  };
}

function readLocal(): PlatformSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persistLocal(settings: PlatformSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode or a full quota: the account copy still saves when online.
  }
}

interface SettingsContextValue {
  settings: PlatformSettings;
  sync: SettingsSync;
  update: (mutator: (current: PlatformSettings) => PlatformSettings) => void;
  resetSection: (section: SettingsSection) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const [settings, setSettings] = useState<PlatformSettings>(readLocal);
  const [sync, setSync] = useState<SettingsSync>('local');
  const timer = useRef<number | null>(null);
  const latest = useRef(settings);

  // Account settings win when the signed-in copy exists; local stays the offline fallback.
  useEffect(() => {
    if (session.status !== 'online') {
      setSync('local');
      return;
    }
    let cancelled = false;
    api
      .settings()
      .then((payload) => {
        if (cancelled) return;
        const next = normalizeSettings(payload.settings);
        latest.current = next;
        setSettings(next);
        persistLocal(next);
        setSync('synced');
      })
      .catch(() => {
        if (!cancelled) setSync('local');
      });
    return () => {
      cancelled = true;
    };
  }, [session.status]);

  const queueRemote = useCallback(
    (next: PlatformSettings) => {
      if (session.status !== 'online') {
        setSync('local');
        return;
      }
      setSync('saving');
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        api
          .saveSettings(next)
          .then(() => setSync('synced'))
          .catch(() => setSync('error'));
      }, 900);
    },
    [session.status]
  );

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  const update = useCallback(
    (mutator: (current: PlatformSettings) => PlatformSettings) => {
      setSettings((current) => {
        const next = normalizeSettings(mutator(current));
        latest.current = next;
        persistLocal(next);
        queueRemote(next);
        return next;
      });
    },
    [queueRemote]
  );

  const resetSection = useCallback(
    (section: SettingsSection) => {
      update((current) => ({ ...current, [section]: { ...DEFAULT_SETTINGS[section] } }));
    },
    [update]
  );

  useEffect(() => {
    sfx.muted = settings.audio.muted;
  }, [settings.audio.muted]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('loftlife-large-text', settings.accessibility.largeText);
    root.classList.toggle('loftlife-high-contrast', settings.accessibility.highContrast);
    root.classList.toggle('loftlife-reduce-motion', settings.accessibility.reduceMotion);
  }, [settings.accessibility]);

  const value = useMemo(
    () => ({ settings, sync, update, resetSection }),
    [settings, sync, update, resetSection]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) throw new Error('useSettings must be used inside <SettingsProvider>');
  return value;
}
