/**
 * Session layer: account state, persistent character/room sync, realtime
 * presence and chat. Everything the game UI needs from the backend lives here
 * so components stay presentational.
 *
 * The legacy localStorage flow still works: if the API is unreachable the
 * player can choose "Play offline" and use the room builder as before.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_AVATAR } from './game/catalog';
import type { AvatarConfig, LightingMood, PlacedItem, RoomSurfaceConfig } from './game/types';
import {
  ApiError,
  api,
  getToken,
  setToken,
  type InventoryEntry,
  type MicrophoneMode,
  type Profile,
  type SessionUser,
  type SuiteState,
  type VoicePreferences,
  type VoiceRangeSetting,
  type Wallet,
} from './net/api';
import {
  RealtimeClient,
  type ChatEvent,
  type ChatScope,
  type ConnectionStatus,
  type InstanceInfo,
  type Party,
  type RemotePlayer,
  type TransitLine,
  type TransitVehicle,
} from './net/realtime';
import { VoiceManager, type VoiceDevice, type VoiceStatus } from './net/voice';
import {
  VoiceControlState,
  microphoneIndicator,
  normalizeVoicePreferences,
  rangeToAudibleMode,
  sensitivityToThreshold,
} from '../shared/voice-controls.mjs';
import { isTouchDevice } from './game/touchInput';

export type SessionStatus = 'loading' | 'anonymous' | 'online' | 'offline';

/** Device-to-account persistence state, surfaced in the HUD so saves are never a guess. */
export type SyncState = 'local' | 'saving' | 'synced' | 'error';

export interface RidingState {
  vehicleId: string;
  lineId: string;
  seat: number;
  label?: string;
}

/** Snapshot of the shared voice state every control surface renders. */
export interface VoiceSnapshot {
  status: VoiceStatus;
  range: VoiceRangeSetting;
  micMode: MicrophoneMode;
  sensitivity: number;
  transmitting: boolean;
  muted: boolean;
  suspended: boolean;
  indicator:
    | 'off'
    | 'unavailable'
    | 'denied'
    | 'requesting'
    | 'range-off'
    | 'idle'
    | 'transmitting'
    | 'muted'
    | 'suspended';
  devices: VoiceDevice[];
  deviceId: string;
}

export interface RoomStatePayload {
  name?: string;
  items: PlacedItem[];
  surfaces: RoomSurfaceConfig;
  mood: LightingMood;
}

interface SessionValue {
  status: SessionStatus;
  user: SessionUser | null;
  profile: Profile | null;
  wallet: Wallet;
  inventory: InventoryEntry[];
  suite: SuiteState | null;
  authError: string | null;
  authBusy: boolean;
  /** True right after a brand-new account was created, so the local character can be adopted. */
  justRegistered: boolean;
  /** 'local' while offline, then saving/synced/error for the account mirror. */
  syncState: SyncState;
  syncError: string | null;
  connection: ConnectionStatus;
  instance: InstanceInfo | null;
  remotePlayers: RemotePlayer[];
  messages: ChatEvent[];
  chatError: string | null;
  presenceOnline: number;
  party: Party | null;
  partyInvites: Party[];
  transitLines: TransitLine[];
  transitVehicles: TransitVehicle[];
  riding: RidingState | null;
  voice: VoiceSnapshot;
  /** Shared chat panel visibility (C key and the mobile chat button). */
  chatOpen: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (payload: {
    handle: string;
    email: string;
    password: string;
    displayName?: string;
    avatar?: AvatarConfig;
  }) => Promise<void>;
  continueOffline: () => void;
  clearJustRegistered: () => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  buy: (catalogId: string) => Promise<void>;
  claimDaily: () => Promise<{ yuanzi: number; tongbao: number } | null>;
  saveRoomState: (payload: RoomStatePayload) => void;
  saveWorldState: (worldId: string, payload: RoomStatePayload) => void;
  saveAvatar: (avatar: AvatarConfig) => void;
  sendChat: (chat: ChatScope) => boolean;
  setPose: (pose: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    location: string;
    emote: string;
  }) => void;
  enterCity: () => void;
  enterWorld: (worldId: string) => Promise<void>;
  clearChatError: () => void;
  partyAction: (
    action: 'create' | 'invite' | 'accept' | 'leave' | 'kick' | 'join',
    data?: { handle?: string; userId?: string }
  ) => boolean;
  boardTransit: (lineId: string, stopId: string) => boolean;
  exitTransit: () => boolean;
  setVoiceAnchor: (anchor: { x: number; z: number; location: string }) => void;
  enableVoice: () => Promise<VoiceStatus>;
  disableVoice: () => void;
  cycleVoiceRange: () => VoiceRangeSetting;
  setVoiceRange: (range: VoiceRangeSetting) => void;
  setVoiceSensitivity: (value: number) => void;
  setMicMode: (mode: MicrophoneMode) => void;
  pressMicrophone: () => Promise<void>;
  releaseMicrophone: () => void;
  setVoiceInputDevice: (deviceId: string) => Promise<boolean>;
  getVoiceLevel: () => number;
  setChatOpen: (open: boolean) => void;
  toggleChat: () => void;
}

const EMPTY_WALLET: Wallet = { yuanzi: 0, tongbao: 0 };
// Voice preferences live on the device offline and mirror to the account online.
const VOICE_PREFS_KEY = 'loftlife_voice_prefs_v1';

function loadDeviceVoicePreferences(): VoicePreferences {
  const micMode: MicrophoneMode = isTouchDevice() ? 'open-mic' : 'push-to-talk';
  const fallback = normalizeVoicePreferences({ range: 'off', micMode, sensitivity: 0.55 });
  try {
    const raw = localStorage.getItem(VOICE_PREFS_KEY);
    if (raw) return normalizeVoicePreferences(JSON.parse(raw));
  } catch {
    // A private-mode browser simply uses the platform default.
  }
  return fallback;
}
const SessionContext = createContext<SessionValue | null>(null);

const messageOf = (error: unknown): string =>
  error instanceof ApiError ? error.message : (error as Error)?.message ?? 'Something went wrong';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [wallet, setWallet] = useState<Wallet>(EMPTY_WALLET);
  const [inventory, setInventory] = useState<InventoryEntry[]>([]);
  const [suite, setSuite] = useState<SuiteState | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [justRegistered, setJustRegistered] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>('local');
  const [syncError, setSyncError] = useState<string | null>(null);
  const syncSeq = useRef(0);

  const [connection, setConnection] = useState<ConnectionStatus>('idle');
  const [instance, setInstance] = useState<InstanceInfo | null>(null);
  const [remotePlayers, setRemotePlayers] = useState<RemotePlayer[]>([]);
  const [messages, setMessages] = useState<ChatEvent[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  const [presenceOnline, setPresenceOnline] = useState(0);

  const [party, setParty] = useState<Party | null>(null);
  const [partyInvites, setPartyInvites] = useState<Party[]>([]);
  const [transitLines, setTransitLines] = useState<TransitLine[]>([]);
  const [transitVehicles, setTransitVehicles] = useState<TransitVehicle[]>([]);
  const [riding, setRiding] = useState<RidingState | null>(null);
  const [chatOpen, setChatOpenState] = useState(false);

  const voiceControlsRef = useRef<VoiceControlState | null>(null);
  if (!voiceControlsRef.current) {
    voiceControlsRef.current = new VoiceControlState(loadDeviceVoicePreferences());
  }
  const [voice, setVoice] = useState<VoiceSnapshot>(() => {
    const controls = voiceControlsRef.current!;
    const snapshot = controls.snapshot();
    return {
      status: 'off',
      range: snapshot.range,
      micMode: snapshot.micMode,
      sensitivity: snapshot.sensitivity,
      transmitting: false,
      muted: false,
      suspended: false,
      indicator: 'off',
      devices: [],
      deviceId: '',
    };
  });
  const publishVoiceRef = useRef<() => void>(() => {});
  const voiceSaveTimer = useRef<number | null>(null);
  const voicePrefsMirrored = useRef<string>('');
  /** Set when preferences changed while offline, so sign-in uploads them. */
  const voiceLocalDirty = useRef(false);
  const statusRef = useRef<SessionStatus>('loading');

  const realtimeRef = useRef<RealtimeClient | null>(null);
  const selfConnRef = useRef<string | null>(null);
  const remoteRef = useRef<RemotePlayer[]>([]);
  const voiceAnchorRef = useRef({ x: 0, z: 0, location: 'world' });
  const voiceRef = useRef<VoiceManager | null>(null);
  if (!voiceRef.current) {
    voiceRef.current = new VoiceManager({
      sendSignal: (to, kind, data) =>
        realtimeRef.current?.sendVoiceSignal(to, kind, data) ?? false,
      onChange: () => publishVoiceRef.current(),
    });
  }

  /** Mirror the one shared voice state into React for every control surface. */
  const publishVoice = useCallback(() => {
    const controls = voiceControlsRef.current!;
    const manager = voiceRef.current;
    const snapshot = controls.snapshot();
    const status = manager?.status ?? 'off';
    setVoice({
      status,
      range: snapshot.range,
      micMode: snapshot.micMode,
      sensitivity: snapshot.sensitivity,
      transmitting: snapshot.transmitting,
      muted: snapshot.muted,
      suspended: snapshot.suspended,
      indicator: microphoneIndicator(status, {
        range: snapshot.range,
        transmitting: snapshot.transmitting,
        muted: snapshot.muted,
        suspended: snapshot.suspended,
      }),
      devices: manager?.inputDevices ?? [],
      deviceId: manager?.activeDeviceId ?? '',
    });
  }, []);
  publishVoiceRef.current = publishVoice;

  /** Push the shared policy into the media layer, then republish to React. */
  const applyVoice = useCallback(() => {
    const controls = voiceControlsRef.current!;
    const manager = voiceRef.current;
    controls.setMicReady(manager?.status === 'ready');
    const snapshot = controls.snapshot();
    manager?.setRange(snapshot.range);
    manager?.setTransmitting(snapshot.transmitting);
    publishVoice();
  }, [publishVoice]);
  const applyVoiceRef = useRef(applyVoice);
  applyVoiceRef.current = applyVoice;

  /** Device always, account when signed in. Reconnects re-read the account copy. */
  const persistVoicePreferences = useCallback(() => {
    const preferences = voiceControlsRef.current!.preferences() as VoicePreferences;
    const serialized = JSON.stringify(preferences);
    try {
      localStorage.setItem(VOICE_PREFS_KEY, serialized);
    } catch {
      // Storage can be full or blocked; the session still uses the values.
    }
    if (serialized === voicePrefsMirrored.current) return;
    voicePrefsMirrored.current = serialized;
    if (statusRef.current !== 'online') {
      // Kept on the device until the next successful sign-in uploads it.
      voiceLocalDirty.current = true;
      return;
    }
    if (voiceSaveTimer.current) window.clearTimeout(voiceSaveTimer.current);
    voiceSaveTimer.current = window.setTimeout(() => {
      api
        .updateProfile({ voice: preferences })
        .then(() => {
          voiceLocalDirty.current = false;
        })
        .catch(() => {
          voiceLocalDirty.current = true;
        });
    }, 600);
  }, []);
  const saveTimers = useRef<Record<string, number>>({});
  const pendingSaves = useRef<Record<string, () => void>>({});
  const avatarTimer = useRef<number | null>(null);

  const loadSession = useCallback(async () => {
    const payload = await api.me();
    setUser(payload.user);
    setProfile(payload.profile);
    setWallet(payload.wallet);
    setInventory(payload.inventory);
    setSuite(payload.suite);
    // Voice preferences: changes made offline win (they sync up), otherwise the
    // account copy wins. Restoring prefs never enables the microphone and never
    // clears a post-reconnect pause; transmission still waits for the player.
    const controls = voiceControlsRef.current!;
    if (payload.profile.voice && !voiceLocalDirty.current) {
      const prefs = normalizeVoicePreferences(payload.profile.voice);
      const wasSuspended = controls.suspended;
      controls.setRange(prefs.range);
      controls.setMicMode(prefs.micMode);
      controls.setSensitivity(prefs.sensitivity);
      if (wasSuspended) controls.suspended = true;
      voicePrefsMirrored.current = JSON.stringify(prefs);
      try {
        localStorage.setItem(VOICE_PREFS_KEY, voicePrefsMirrored.current);
      } catch {
        // Device storage is a convenience copy, not the source of truth online.
      }
      applyVoiceRef.current();
    } else if (payload.profile.voice && voiceLocalDirty.current) {
      const prefs = controls.preferences() as VoicePreferences;
      voicePrefsMirrored.current = '';
      api
        .updateProfile({ voice: prefs })
        .then(() => {
          voiceLocalDirty.current = false;
          voicePrefsMirrored.current = JSON.stringify(prefs);
        })
        .catch(() => {
          // Still dirty; the next change or sign-in retries.
        });
    }
    // Nothing is pending right after a fetch: the account and the screen agree.
    syncSeq.current += 1;
    setSyncState('synced');
    setSyncError(null);
  }, []);

  // Restore an existing token on boot.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!getToken()) {
        // No account needed to play: the local character is the default.
        if (!cancelled) setStatus('offline');
        return;
      }
      try {
        await loadSession();
        if (!cancelled) setStatus('online');
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          setToken(null);
          setStatus('offline');
        } else {
          setAuthError('Cannot reach the LoftLife server. You can play offline.');
          setStatus('offline');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSession]);

  // Offline play never talks to the account mirror, so the HUD can say so.
  useEffect(() => {
    if (status === 'online') return;
    syncSeq.current += 1;
    setSyncState('local');
    setSyncError(null);
  }, [status]);

  // Realtime connection follows the signed-in state.
  useEffect(() => {
    if (status !== 'online') {
      realtimeRef.current?.close();
      realtimeRef.current = null;
      setRemotePlayers([]);
      setConnection('idle');
      // No server, no voice: stop capturing and pause transmission. Preferences
      // stay on the device and sync on the next sign-in.
      voiceRef.current?.disable();
      voiceControlsRef.current?.suspend();
      applyVoiceRef.current();
      return;
    }
    const token = getToken();
    if (!token) return;

    const client = new RealtimeClient({
      token,
      place: { kind: 'city' },
      onStatus: setConnection,
      onReady: ({ instance: info, you, players }) => {
        selfConnRef.current = you.connId;
        setInstance(info);
        setRemotePlayers(players.filter((player) => player.connId !== you.connId));
        setTransitVehicles([]);
        setRiding(null);
        api
          .party()
          .then((state) => {
            setParty(state.party);
            setPartyInvites(state.invites);
          })
          .catch(() => {
            // Party state simply stays empty until the next action.
          });
      },
      onSnapshot: (players, _instanceId, vehicles) => {
        const self = selfConnRef.current;
        setRemotePlayers(players.filter((player) => player.connId !== self));
        setTransitVehicles(vehicles);
        const me = players.find((player) => player.connId === self);
        if (self && me && !me.riding) {
          setRiding((current) => (current ? null : current));
        }
      },
      onJoin: (player) => {
        if (player.connId === selfConnRef.current) return;
        setRemotePlayers((prev) =>
          prev.some((entry) => entry.connId === player.connId) ? prev : [...prev, player]
        );
        setInstance((prev) => (prev ? { ...prev, count: prev.count + 1 } : prev));
      },
      onLeave: (connId) => {
        setRemotePlayers((prev) => prev.filter((player) => player.connId !== connId));
        setInstance((info) => (info ? { ...info, count: Math.max(1, info.count - 1) } : info));
      },
      onChat: (chat) => {
        setMessages((prev) => [...prev.slice(-119), chat]);
      },
      onParty: (nextParty, invites) => {
        setParty(nextParty);
        setPartyInvites(invites);
      },
      onVoice: (signal) => {
        void voiceRef.current?.handleSignal(signal);
      },
      onTransit: ({ riding: nextRiding, vehicles, exited }) => {
        setTransitVehicles(vehicles);
        setRiding(nextRiding);
        if (exited) setChatError(`You stepped off at ${exited.label ?? 'the stop'}`);
      },
      onError: (code, message) => {
        if (code === 'rate_limited' || code === 'empty_message') setChatError(message);
        else setChatError(message);
      },
    });
    realtimeRef.current = client;
    client.connect();

    return () => {
      client.close();
      realtimeRef.current = null;
    };
  }, [status]);

  // Transit routes are public, server-owned data (also consumed by a future
  // Unity client), so they are fetched once on boot.
  useEffect(() => {
    api
      .transit()
      .then((result) => setTransitLines(result.lines ?? []))
      .catch(() => {
        // Without routes the transit prompt simply never appears.
      });
  }, []);

  useEffect(() => {
    remoteRef.current = remotePlayers;
  }, [remotePlayers]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // A dropped socket stops transmission without changing the selected range or
  // microphone mode. Reconnecting never resumes voice by itself: the next mic
  // action does.
  const connectionRef = useRef<ConnectionStatus>('idle');
  useEffect(() => {
    const previous = connectionRef.current;
    connectionRef.current = connection;
    if (connection === 'reconnecting' || connection === 'offline') {
      if (previous === 'connected') {
        voiceControlsRef.current?.suspend();
        applyVoice();
      }
    }
  }, [connection, applyVoice]);

  // Held microphone states never survive the window losing focus.
  useEffect(() => {
    const release = () => {
      voiceControlsRef.current?.releaseMicrophone();
      applyVoice();
    };
    window.addEventListener('blur', release);
    return () => window.removeEventListener('blur', release);
  }, [applyVoice]);

  // Voice activation: the shared sensitivity threshold decides when speech
  // opens the microphone, for phones and desktops alike.
  useEffect(() => {
    if (voice.status !== 'ready' || voice.micMode !== 'voice-activation') {
      voiceControlsRef.current?.setSpeaking(false);
      applyVoice();
      return;
    }
    const threshold = sensitivityToThreshold(voice.sensitivity);
    const timer = window.setInterval(() => {
      const controls = voiceControlsRef.current!;
      const manager = voiceRef.current;
      if (!manager) return;
      const before = controls.transmission.transmitting;
      controls.setSpeaking(manager.getLevel() >= threshold);
      const after = controls.transmission.transmitting;
      manager.setTransmitting(after);
      if (before !== after) publishVoice();
    }, 100);
    return () => window.clearInterval(timer);
  }, [voice.status, voice.micMode, voice.sensitivity, applyVoice, publishVoice]);

  // Reconcile voice peers with nearby players a few times per second.
  useEffect(() => {
    if (status !== 'online') return;
    const timer = window.setInterval(() => {
      const voice = voiceRef.current;
      if (!voice?.enabled) return;
      voice.sync(remoteRef.current, {
        selfConnId: selfConnRef.current,
        x: voiceAnchorRef.current.x,
        z: voiceAnchorRef.current.z,
        location: voiceAnchorRef.current.location,
      });
    }, 400);
    return () => window.clearInterval(timer);
  }, [status]);

  // Presence counter for the city HUD.
  useEffect(() => {
    if (status !== 'online') return;
    let cancelled = false;
    const poll = async () => {
      try {
        const snapshot = await api.presence();
        if (!cancelled) setPresenceOnline(snapshot.online);
      } catch {
        // Presence is cosmetic; a failed poll is not an error state.
      }
    };
    poll();
    const timer = window.setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [status]);

  // Flush any debounced save when the tab goes away.
  useEffect(() => {
    const flush = () => {
      for (const [key, save] of Object.entries(pendingSaves.current)) {
        if (saveTimers.current[key]) {
          window.clearTimeout(saveTimers.current[key]);
          delete saveTimers.current[key];
        }
        save();
      }
      pendingSaves.current = {};
    };
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const result = await api.login({ identifier, password });
      setToken(result.token);
      await loadSession();
      setStatus('online');
    } catch (error) {
      setAuthError(messageOf(error));
    } finally {
      setAuthBusy(false);
    }
  }, [loadSession]);

  const register = useCallback<SessionValue['register']>(
    async (payload) => {
      setAuthBusy(true);
      setAuthError(null);
      try {
        const result = await api.register({ ...payload, avatar: payload.avatar ?? DEFAULT_AVATAR });
        setToken(result.token);
        await loadSession();
        setJustRegistered(true);
        setStatus('online');
      } catch (error) {
        setAuthError(messageOf(error));
      } finally {
        setAuthBusy(false);
      }
    },
    [loadSession]
  );

  const continueOffline = useCallback(() => {
    setAuthError(null);
    setStatus('offline');
  }, []);

  const clearJustRegistered = useCallback(() => setJustRegistered(false), []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Signing out locally is what matters.
    }
    setToken(null);
    realtimeRef.current?.close();
    realtimeRef.current = null;
    setUser(null);
    setProfile(null);
    setWallet(EMPTY_WALLET);
    setInventory([]);
    setSuite(null);
    setRemotePlayers([]);
    setMessages([]);
    setParty(null);
    setPartyInvites([]);
    setTransitVehicles([]);
    setRiding(null);
    setChatOpenState(false);
    voiceRef.current?.disable();
    voiceControlsRef.current?.suspend();
    applyVoice();
    syncSeq.current += 1;
    setSyncState('local');
    setSyncError(null);
    // Signing out returns to the on-device character instead of a wall.
    setStatus('offline');
  }, []);

  const refresh = useCallback(async () => {
    try {
      await loadSession();
    } catch (error) {
      setChatError(messageOf(error));
    }
  }, [loadSession]);

  const buy = useCallback(async (catalogId: string) => {
    const key = `buy_${catalogId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const result = await api.purchase(catalogId, key);
    setWallet(result.wallet);
    setInventory(result.inventory);
  }, []);

  const claimDaily = useCallback(async () => {
    try {
      const result = await api.claimDaily();
      setWallet(result.wallet);
      return result.wallet;
    } catch (error) {
      setChatError(messageOf(error));
      return null;
    }
  }, []);

  // Every write bumps a sequence so a slow response from an older edit cannot
  // overwrite the status of a newer one.
  const beginSync = useCallback(() => {
    syncSeq.current += 1;
    setSyncState('saving');
    return syncSeq.current;
  }, []);

  const finishSync = useCallback((seq: number, error?: unknown) => {
    if (seq !== syncSeq.current) return;
    if (error) {
      setSyncState('error');
      setSyncError(messageOf(error));
    } else {
      setSyncState('synced');
      setSyncError(null);
    }
  }, []);

  const scheduleSave = useCallback((key: string, run: () => void) => {
    pendingSaves.current[key] = run;
    if (saveTimers.current[key]) window.clearTimeout(saveTimers.current[key]);
    saveTimers.current[key] = window.setTimeout(() => {
      delete saveTimers.current[key];
      const save = pendingSaves.current[key];
      delete pendingSaves.current[key];
      save?.();
    }, 1200);
  }, []);

  const saveRoomState = useCallback(
    (payload: RoomStatePayload) => {
      if (status !== 'online') return;
      const seq = beginSync();
      scheduleSave('suite', () => {
        api
          .saveSuite(payload)
          .then((saved) => {
            setSuite((prev) => (prev ? { ...prev, ...saved } : prev));
            finishSync(seq);
          })
          .catch((error) => {
            setChatError(`Room not saved: ${messageOf(error)}`);
            finishSync(seq, error);
          });
      });
    },
    [status, scheduleSave, beginSync, finishSync]
  );

  const saveWorldState = useCallback(
    (worldId: string, payload: RoomStatePayload) => {
      if (status !== 'online') return;
      const seq = beginSync();
      scheduleSave(`world:${worldId}`, () => {
        api
          .saveWorldState(worldId, payload)
          .then(() => finishSync(seq))
          .catch((error) => {
            setChatError(`World not saved: ${messageOf(error)}`);
            finishSync(seq, error);
          });
      });
    },
    [status, scheduleSave, beginSync, finishSync]
  );

  const saveAvatar = useCallback(
    (avatar: AvatarConfig) => {
      if (status !== 'online') return;
      const seq = beginSync();
      if (avatarTimer.current) window.clearTimeout(avatarTimer.current);
      avatarTimer.current = window.setTimeout(() => {
        api
          .updateProfile({ avatar })
          .then((next) => {
            setProfile(next);
            finishSync(seq);
          })
          .catch((error) => {
            setChatError(`Outfit not saved: ${messageOf(error)}`);
            finishSync(seq, error);
          });
      }, 700);
    },
    [status, beginSync, finishSync]
  );

  const sendChat = useCallback((chat: ChatScope) => {
    setChatError(null);
    return realtimeRef.current?.sendChat(chat) ?? false;
  }, []);

  const setPose = useCallback<SessionValue['setPose']>((pose) => {
    const audible = rangeToAudibleMode(voiceControlsRef.current?.range ?? 'off');
    realtimeRef.current?.setPose({
      ...pose,
      // Range Off stops advertising voice, so nearby players drop the peer.
      voice: (voiceRef.current?.enabled ?? false) && audible !== 'off',
      voiceMode: audible === 'off' ? 'say' : audible,
    });
  }, []);

  const enterCity = useCallback(() => {
    realtimeRef.current?.switchPlace({ kind: 'city' });
  }, []);

  const enterWorld = useCallback(async (worldId: string) => {
    await api.worldEntry(worldId);
    realtimeRef.current?.switchPlace({ kind: 'world', worldId });
  }, []);

  const clearChatError = useCallback(() => setChatError(null), []);

  const partyAction = useCallback<SessionValue['partyAction']>((action, data) => {
    setChatError(null);
    return realtimeRef.current?.partyAction(action, data) ?? false;
  }, []);

  const boardTransit = useCallback((lineId: string, stopId: string) => {
    return realtimeRef.current?.boardTransit(lineId, stopId) ?? false;
  }, []);

  const exitTransit = useCallback(() => {
    return realtimeRef.current?.exitTransit() ?? false;
  }, []);

  const setVoiceAnchor = useCallback((anchor: { x: number; z: number; location: string }) => {
    voiceAnchorRef.current = anchor;
    voiceRef.current?.setAnchor(anchor);
  }, []);

  const enableVoice = useCallback<SessionValue['enableVoice']>(async () => {
    // Turning the microphone on is an explicit action, so it also clears a
    // post-reconnect pause. Voice Range Off still blocks transmission.
    voiceControlsRef.current!.suspended = false;
    await voiceRef.current?.enable();
    applyVoice();
    return voiceRef.current?.status ?? 'off';
  }, [applyVoice]);

  const disableVoice = useCallback(() => {
    voiceRef.current?.disable();
    applyVoice();
  }, [applyVoice]);

  const cycleVoiceRange = useCallback<SessionValue['cycleVoiceRange']>(() => {
    const next = voiceControlsRef.current!.cycleRange();
    applyVoice();
    persistVoicePreferences();
    return next;
  }, [applyVoice, persistVoicePreferences]);

  const setVoiceRange = useCallback(
    (range: VoiceRangeSetting) => {
      voiceControlsRef.current!.setRange(range);
      applyVoice();
      persistVoicePreferences();
    },
    [applyVoice, persistVoicePreferences]
  );

  const setVoiceSensitivity = useCallback(
    (value: number) => {
      voiceControlsRef.current!.setSensitivity(value);
      applyVoice();
      persistVoicePreferences();
    },
    [applyVoice, persistVoicePreferences]
  );

  const setMicMode = useCallback(
    (mode: MicrophoneMode) => {
      voiceControlsRef.current!.setMicMode(mode);
      applyVoice();
      persistVoicePreferences();
    },
    [applyVoice, persistVoicePreferences]
  );

  /**
   * One microphone control press. Requests permission on first use (an explicit
   * player action), then applies the selected mode's semantics.
   */
  const pressMicrophone = useCallback<SessionValue['pressMicrophone']>(async () => {
    const controls = voiceControlsRef.current!;
    // Range Off blocks voice in every mode, so do not even ask for the mic.
    if (controls.range === 'off') {
      publishVoice();
      return;
    }
    controls.pressMicrophone();
    applyVoice();
    if (voiceRef.current?.status !== 'ready') {
      await voiceRef.current?.enable();
      applyVoice();
    }
  }, [applyVoice, publishVoice]);

  const releaseMicrophone = useCallback(() => {
    voiceControlsRef.current?.releaseMicrophone();
    applyVoice();
  }, [applyVoice]);

  const setVoiceInputDevice = useCallback<SessionValue['setVoiceInputDevice']>(
    async (deviceId: string) => {
      const ok = (await voiceRef.current?.setInputDevice(deviceId)) ?? false;
      publishVoice();
      return ok;
    },
    [publishVoice]
  );

  const getVoiceLevel = useCallback(() => voiceRef.current?.getLevel() ?? 0, []);

  const setChatOpen = useCallback((open: boolean) => setChatOpenState(open), []);
  const toggleChat = useCallback(() => setChatOpenState((open) => !open), []);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      user,
      profile,
      wallet,
      inventory,
      suite,
      authError,
      authBusy,
      justRegistered,
      syncState,
      syncError,
      connection,
      instance,
      remotePlayers,
      messages,
      chatError,
      presenceOnline,
      party,
      partyInvites,
      transitLines,
      transitVehicles,
      riding,
      voice,
      chatOpen,
      login,
      register,
      continueOffline,
      clearJustRegistered,
      logout,
      refresh,
      buy,
      claimDaily,
      saveRoomState,
      saveWorldState,
      saveAvatar,
      sendChat,
      setPose,
      enterCity,
      enterWorld,
      clearChatError,
      partyAction,
      boardTransit,
      exitTransit,
      setVoiceAnchor,
      enableVoice,
      disableVoice,
      cycleVoiceRange,
      setVoiceRange,
      setVoiceSensitivity,
      setMicMode,
      pressMicrophone,
      releaseMicrophone,
      setVoiceInputDevice,
      getVoiceLevel,
      setChatOpen,
      toggleChat,
    }),
    [
      status,
      user,
      profile,
      wallet,
      inventory,
      suite,
      authError,
      authBusy,
      justRegistered,
      syncState,
      syncError,
      connection,
      instance,
      remotePlayers,
      messages,
      chatError,
      presenceOnline,
      party,
      partyInvites,
      transitLines,
      transitVehicles,
      riding,
      voice,
      chatOpen,
      login,
      register,
      continueOffline,
      clearJustRegistered,
      logout,
      refresh,
      buy,
      claimDaily,
      saveRoomState,
      saveWorldState,
      saveAvatar,
      sendChat,
      setPose,
      enterCity,
      enterWorld,
      clearChatError,
      partyAction,
      boardTransit,
      exitTransit,
      setVoiceAnchor,
      enableVoice,
      disableVoice,
      cycleVoiceRange,
      setVoiceRange,
      setVoiceSensitivity,
      setMicMode,
      pressMicrophone,
      releaseMicrophone,
      setVoiceInputDevice,
      getVoiceLevel,
      setChatOpen,
      toggleChat,
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
