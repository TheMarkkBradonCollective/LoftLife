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
  type Profile,
  type SessionUser,
  type SuiteState,
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
import { VoiceManager, type VoiceMode, type VoiceStatus } from './net/voice';

export type SessionStatus = 'loading' | 'anonymous' | 'online' | 'offline';

export interface RidingState {
  vehicleId: string;
  lineId: string;
  seat: number;
  label?: string;
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
  voiceStatus: VoiceStatus;
  voiceMode: VoiceMode;
  voicePushToTalk: boolean;
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
  setVoiceMode: (mode: VoiceMode) => void;
  setPushToTalk: (on: boolean) => void;
}

const EMPTY_WALLET: Wallet = { yuanzi: 0, tongbao: 0 };
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
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('off');
  const [voiceMode, setVoiceModeState] = useState<VoiceMode>('say');
  const [voicePushToTalk, setVoicePushToTalkState] = useState(false);

  const realtimeRef = useRef<RealtimeClient | null>(null);
  const selfConnRef = useRef<string | null>(null);
  const remoteRef = useRef<RemotePlayer[]>([]);
  const voiceAnchorRef = useRef({ x: 0, z: 0, location: 'world' });
  const voiceRef = useRef<VoiceManager | null>(null);
  if (!voiceRef.current) {
    voiceRef.current = new VoiceManager({
      sendSignal: (to, kind, data) =>
        realtimeRef.current?.sendVoiceSignal(to, kind, data) ?? false,
      onChange: () => setVoiceStatus(voiceRef.current?.status ?? 'off'),
    });
  }
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

  // Realtime connection follows the signed-in state.
  useEffect(() => {
    if (status !== 'online') {
      realtimeRef.current?.close();
      realtimeRef.current = null;
      setRemotePlayers([]);
      setConnection('idle');
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
    voiceRef.current?.disable();
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
      scheduleSave('suite', () => {
        api
          .saveSuite(payload)
          .then((saved) => setSuite((prev) => (prev ? { ...prev, ...saved } : prev)))
          .catch((error) => setChatError(`Room not saved: ${messageOf(error)}`));
      });
    },
    [status, scheduleSave]
  );

  const saveWorldState = useCallback(
    (worldId: string, payload: RoomStatePayload) => {
      if (status !== 'online') return;
      scheduleSave(`world:${worldId}`, () => {
        api
          .saveWorldState(worldId, payload)
          .catch((error) => setChatError(`World not saved: ${messageOf(error)}`));
      });
    },
    [status, scheduleSave]
  );

  const saveAvatar = useCallback(
    (avatar: AvatarConfig) => {
      if (status !== 'online') return;
      if (avatarTimer.current) window.clearTimeout(avatarTimer.current);
      avatarTimer.current = window.setTimeout(() => {
        api
          .updateProfile({ avatar })
          .then((next) => setProfile(next))
          .catch((error) => setChatError(`Outfit not saved: ${messageOf(error)}`));
      }, 700);
    },
    [status]
  );

  const sendChat = useCallback((chat: ChatScope) => {
    setChatError(null);
    return realtimeRef.current?.sendChat(chat) ?? false;
  }, []);

  const setPose = useCallback<SessionValue['setPose']>((pose) => {
    realtimeRef.current?.setPose({
      ...pose,
      voice: voiceRef.current?.enabled ?? false,
      voiceMode: voiceRef.current?.voiceMode ?? 'say',
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
    await voiceRef.current?.enable();
    const next = voiceRef.current?.status ?? 'off';
    setVoiceStatus(next);
    return next;
  }, []);

  const disableVoice = useCallback(() => {
    voiceRef.current?.disable();
    setVoiceStatus('off');
  }, []);

  const setVoiceMode = useCallback((mode: VoiceMode) => {
    setVoiceModeState(mode);
    voiceRef.current?.setVoiceMode(mode);
  }, []);

  const setPushToTalk = useCallback((on: boolean) => {
    setVoicePushToTalkState(on);
    voiceRef.current?.setPushToTalk(on);
  }, []);

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
      voiceStatus,
      voiceMode,
      voicePushToTalk,
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
      setVoiceMode,
      setPushToTalk,
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
      voiceStatus,
      voiceMode,
      voicePushToTalk,
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
      setVoiceMode,
      setPushToTalk,
    ]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
