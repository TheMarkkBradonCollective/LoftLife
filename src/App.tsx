import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AuthGate } from './components/AuthGate';
import { AvatarModal } from './components/AvatarModal';
import { CityMapModal } from './components/CityMapModal';
import { ElevatorPanelModal } from './components/ElevatorPanelModal';
import { HotelDoorTerminalModal } from './components/HotelDoorTerminalModal';
import { HotelDoorbellModal, type DoorbellRequest } from './components/HotelDoorbellModal';
import { TravelModal } from './components/TravelModal';
import { TaxiDestinationModal } from './components/TaxiDestinationModal';
import { TravelTransition, type TransitionMode } from './components/TravelTransition';
import { HOTEL_FLOOR_COUNT, roomRangeLabel } from '../shared/hotel-layout.mjs';
import { RoomSettingsModal } from './components/RoomSettingsModal';
import { SyncConflictModal } from './components/SyncConflictModal';
import { ShopModal } from './components/ShopModal';
import { BankModal } from './components/BankModal';
import { WorldsModal } from './components/WorldsModal';
import { WorldStudio } from './components/WorldStudio';
import { GameInterface } from './hud/GameInterface';
import { GameMenu } from './hud/GameMenu';
import { SocialPanel } from './hud/SocialPanel';
import type { BuildController, SocialIntent } from './hud/types';
import { PlatformNotice } from './components/PlatformNotice';
import { WorldMenu } from './components/WorldMenu';
import { useDeviceEnvironment } from './game/platform';
import { touchInput } from './game/touchInput';
import { resolveHudPresentation } from '../shared/hud-presentation.mjs';
import { MOBILE_GAMEPLAY_MESSAGE } from '../shared/device-platform.mjs';

// Three.js is only needed once the world renders; lazy-loading keeps the
// sign-in wall light.
const RoomViewport = lazy(() =>
  import('./components/RoomViewport').then((module) => ({ default: module.RoomViewport }))
);
import { api, type SavedOutfit, type TravelDestination, type WorldSummary } from './net/api';
import { VOICE_RANGE_INFO } from '../shared/voice-controls.mjs';
import { isEditableElement } from '../shared/desktop-shortcuts.mjs';
import { bindingMatchesEvent } from '../shared/keybindings.mjs';
import { useKeybindings } from './game/keybindings';
import { wallAxis } from '../shared/room-walls.mjs';
import { useSession } from './session';
import { useSettings } from './platform/settings';
import type { GameEntry } from './platform/types';
import { sfx } from './game/audio';
import {
  DEFAULT_AVATAR,
  getCatalogItem,
  GRID_SIZE,
  HOTEL_RESIDENTS,
  PLAYER_SUITE_FLOOR,
  PLAYER_SUITE_NUMBER,
  ROOM_PRESETS,
} from './game/catalog';
import { getEffectiveSize, isValidPlacement, SNAP_STEP, snapGrid } from './game/gridMath';
import type {
  ActiveResident,
  AvatarConfig,
  EmoteType,
  FurnitureCategory,
  GameMode,
  LightingMood,
  PlacedItem,
  RoomSurfaceConfig,
  ViewMode,
  WorldLocation,
} from './game/types';

const STORAGE_KEY = 'loftlife_room_state_v1';
const GUEST_STORAGE_KEY = 'loftlife_guest_room_state_v1';
const LEGACY_STORAGE_KEY = 'loftline_room_state_v1';
// Copies kept when a device/account conflict is settled, so the losing side is
// never destroyed. Local only; never uploaded.
const ACCOUNT_BACKUP_KEY = 'loftlife_account_suite_backup_v1';
const DEVICE_BACKUP_KEY = 'loftlife_device_suite_backup_v1';
// Voice range and microphone mode both live in the session (see
// shared/voice-controls.mjs), so desktop keys and phone controls share one
// state. These are only presentation labels.

interface SavedState {
  items: PlacedItem[];
  surfaces: RoomSurfaceConfig;
  mood: LightingMood;
  avatar: AvatarConfig;
  roomName: string;
}

function loadSavedState(storageKey = STORAGE_KEY): SavedState {
  try {
    const raw =
      localStorage.getItem(storageKey) ?? (storageKey === STORAGE_KEY ? localStorage.getItem(LEGACY_STORAGE_KEY) : null);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedState>;
      if (Array.isArray(parsed.items) && parsed.surfaces && parsed.avatar) {
        return {
          items: parsed.items,
          surfaces: parsed.surfaces,
          mood: parsed.mood ?? 'morning',
          avatar: { ...DEFAULT_AVATAR, ...parsed.avatar },
          roomName: parsed.roomName || 'Sunlit Loft',
        };
      }
    }
  } catch {
    // Fallback to default preset
  }
  const preset = ROOM_PRESETS[0];
  return {
    items: preset.items,
    surfaces: preset.surfaces,
    mood: preset.mood,
    avatar: DEFAULT_AVATAR,
    roomName: preset.name,
  };
}

interface SuiteSnapshot {
  items: PlacedItem[];
  surfaces: RoomSurfaceConfig;
  mood: LightingMood;
  roomName: string;
  avatar: AvatarConfig;
}

const avatarFingerprint = (avatar: AvatarConfig) =>
  [
    avatar.name,
    avatar.skinTone,
    avatar.hairStyle,
    avatar.hairColor,
    avatar.topStyle,
    avatar.topColor,
    avatar.bottomColor,
    avatar.shoeColor,
    avatar.accessory,
    avatar.bottomStyle ?? '',
    avatar.jewelry ?? '',
    avatar.carry ?? '',
    avatar.facialHair ?? '',
    avatar.eyebrows ?? '',
    avatar.eyeStyle ?? '',
    avatar.makeupStyle ?? '',
  ].join(':');

/** Identity of a suite + character, ignoring server/local id churn. */
function suiteFingerprint(state: SuiteSnapshot): string {
  const items = state.items
    .map((item) =>
      [
        item.catalogId,
        item.gx,
        item.gz,
        item.rot,
        item.wall ?? '',
        item.color,
        item.active === false ? 'off' : 'on',
      ].join(':')
    )
    .sort()
    .join('|');
  return [
    state.roomName.trim(),
    state.mood,
    state.surfaces.floor,
    state.surfaces.wall,
    avatarFingerprint(state.avatar),
    items,
  ].join('::');
}

function defaultSnapshot(): SuiteSnapshot {
  const preset = ROOM_PRESETS[0];
  return {
    items: preset.items,
    surfaces: preset.surfaces,
    mood: preset.mood,
    roomName: preset.name,
    avatar: DEFAULT_AVATAR,
  };
}

/** A save that still matches the starting loft is not progress worth a prompt. */
function hasDeviceProgress(saved: SavedState): boolean {
  try {
    return suiteFingerprint(saved) !== suiteFingerprint(defaultSnapshot());
  } catch {
    return true;
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return isEditableElement(el);
}

function keepBackup(key: string, payload: Record<string, unknown>) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: new Date().toISOString(), ...payload }));
  } catch {
    // A full quota must not block the choice; the main save still applies.
  }
}

function readPortraitOrientation(): boolean {
  if (typeof window === 'undefined') return true;
  const query = window.matchMedia?.('(orientation: portrait)');
  if (query) return query.matches;
  return window.innerHeight >= window.innerWidth;
}

interface AppProps {
  /** Which destination the platform opened; the dashboard is never rendered here. */
  entry?: GameEntry;
  /** Return to the LoftLife platform without destroying the account session. */
  onExitPlatform?: () => void;
}

export default function App({ entry, onExitPlatform }: AppProps = {}) {
  const session = useSession();
  const playerSuiteNumber = session.suite?.number ?? PLAYER_SUITE_NUMBER;
  const playerSuiteFloor = session.suite?.floor ?? PLAYER_SUITE_FLOOR;
  const { settings } = useSettings();

  // Server-owned state wins when signed in; localStorage stays the offline path.
  // Read once on mount — later edits flow through state and the save effects below.
  const initial = useMemo(() => {
    if (session.suite && session.profile) {
      return {
        items: session.suite.items,
        surfaces: session.suite.surfaces,
        mood: session.suite.mood,
        avatar: session.profile.avatar,
        roomName: session.suite.name,
      };
    }
    const saved = session.status === 'guest' ? loadSavedState(GUEST_STORAGE_KEY) : loadSavedState();
    if (session.status === 'guest' && session.guestName) {
      return { ...saved, avatar: { ...saved.avatar, name: `Guest User - ${session.guestName}` } };
    }
    return saved;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [location, setLocation] = useState<WorldLocation>(
    entry?.kind === 'city' ? 'world' : 'room'
  );
  const [hallwayFloor, setHallwayFloor] = useState<number>(playerSuiteFloor);
  useEffect(() => { if (session.suite) setHallwayFloor(session.suite.floor); }, [session.suite?.floor]);
  const [unlockedRooms, setUnlockedRooms] = useState<string[]>([]);
  const [mainDoorUnlocked, setMainDoorUnlocked] = useState<boolean>(false);
  const [roomDoorUnlocked, setRoomDoorUnlocked] = useState<boolean>(false);
  const [activeResident, setActiveResident] = useState<ActiveResident | null>(null);
  const [targetVisitResident, setTargetVisitResident] = useState<ActiveResident | null>(null);
  const [doorTerminalOpen, setDoorTerminalOpen] = useState(false);
  // Real hotel doorbell: an incoming ring from a visitor at this suite's door,
  // and the visitor's own outgoing ring while waiting for an answer.
  const [doorbellRequest, setDoorbellRequest] = useState<DoorbellRequest | null>(null);
  const [doorbellOutgoing, setDoorbellOutgoing] = useState<{
    requestId: string;
    roomNumber: string;
  } | null>(null);
  const [elevatorModalOpen, setElevatorModalOpen] = useState(false);
  const [travelMode, setTravelMode] = useState<'rail' | 'air' | null>(null);
  const [travelDestinations, setTravelDestinations] = useState<{
    city: TravelDestination[];
    worlds: TravelDestination[];
  }>({ city: [], worlds: [] });
  const [travelLoading, setTravelLoading] = useState(false);
  const [travelError, setTravelError] = useState<string | null>(null);
  const [elevatorTransition, setElevatorTransition] = useState<{
    label: string;
    detail: string;
    startedAt: number;
    arriveAt: number;
  } | null>(null);
  const [sceneTransition, setSceneTransition] = useState<{
    mode: TransitionMode;
    label: string;
    detail: string;
    startedAt: number;
    arriveAt: number;
  } | null>(null);
  const [clothingStoreOpen, setClothingStoreOpen] = useState(false);
  const [furnitureShopOpen, setFurnitureShopOpen] = useState(false);
  // City directory: one-shot walk-in request handed to the viewport.
  const [travelRequest, setTravelRequest] = useState<{
    x: number;
    z: number;
    label: string;
    yaw: number;
    at: number;
  } | null>(null);
  const [avatarStudioMode, setAvatarStudioMode] = useState<'mirror' | 'salon' | 'closet' | 'studio'>('studio');
  const [localOutfits, setLocalOutfits] = useState<SavedOutfit[]>(() => {
    try {
      const raw = localStorage.getItem('loftlife_outfits_local_v2');
      return raw ? (JSON.parse(raw) as SavedOutfit[]) : [];
    } catch {
      return [];
    }
  });

  // Runtime environment decides controls and gameplay access. Width is never
  // used: a narrow desktop window stays a desktop, and a mobile PWA is still a
  // mobile browser rather than the Android APK.
  const device = useDeviceEnvironment();
  const gameplayAllowed = device.gameplayAllowed;
  const touchDevice = device.controls === 'touch';
  // Only phones and tablets derive the camera from orientation. A hybrid
  // desktop that briefly uses its touchscreen must keep the view the player
  // already chose.
  const mobileRuntime = device.deviceClass === 'mobile' || device.deviceClass === 'tablet';
  const [isPortrait, setIsPortrait] = useState<boolean>(() => readPortraitOrientation());
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (!mobileRuntime) return 'isometric';
    const preference = settings.camera.mobileMode;
    if (preference === 'isometric') return 'isometric';
    if (preference === 'third-person') return 'play';
    return readPortraitOrientation() ? 'isometric' : 'play';
  });
  const [mode, setMode] = useState<GameMode>(() =>
    entry?.kind === 'suite' && entry.edit ? 'edit' : gameplayAllowed ? 'walk' : 'edit'
  );
  const [items, setItems] = useState<PlacedItem[]>(initial.items);
  const [history, setHistory] = useState<PlacedItem[][]>([]);
  const [surfaces, setSurfaces] = useState<RoomSurfaceConfig>(initial.surfaces);
  const [mood, setMood] = useState<LightingMood>(initial.mood);
  const [roomName, setRoomName] = useState<string>(initial.roomName);
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>(initial.avatar);
  const [activeWorld, setActiveWorld] = useState<WorldSummary | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // The world/controls sheet is a detail view opened from the central menu.
  const [worldMenuOpen, setWorldMenuOpen] = useState(false);
  const [worldMenuTab, setWorldMenuTab] = useState<'map' | 'world' | 'manage' | 'controls'>('map');
  const [socialIntent, setSocialIntent] = useState<SocialIntent>('chat');
  const [shopOpen, setShopOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [bankAtm, setBankAtm] = useState<string | undefined>(undefined);
  const [worldsOpen, setWorldsOpen] = useState(false);
  const [studioWorldId, setStudioWorldId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const controls = useKeybindings({
    online: session.status === 'online',
    userId: session.user?.id ?? null,
  });

  // Walk & Emote state
  const [activeEmote, setActiveEmote] = useState<EmoteType>('idle');
  const [emoteTriggerId, setEmoteTriggerId] = useState(0);
  const [walkHint, setWalkHint] = useState<string | null>(null);
  const [npcChat, setNpcChat] = useState<{ speaker: string; message: string } | null>(null);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [proximityPrompt, setProximityPrompt] = useState<string | null>(null);
  const hintTimerRef = useRef<number | null>(null);
  const npcChatTimerRef = useRef<number | null>(null);

  // Edit mode state
  const [editTab, setEditTab] = useState<'catalog' | 'surfaces' | 'presets'>('catalog');
  const [categoryFilter, setCategoryFilter] = useState<'all' | FurnitureCategory>('all');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [placingCatalogId, setPlacingCatalogId] = useState<string | null>(null);
  const [placingRotation, setPlacingRotation] = useState<0 | 1 | 2 | 3>(0);
  const [placingColor, setPlacingColor] = useState<string>('#e6dfd3');
  const [movingUid, setMovingUid] = useState<string | null>(null);

  // UI Chrome state
  const [dockCollapsed, setDockCollapsed] = useState(() => device.controls === 'touch');
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [roomSettingsOpen, setRoomSettingsOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  // Signed in, but the device suite and the account suite disagree. Writes to
  // the account are paused until the player picks one.
  const [conflict, setConflict] = useState<{ device: SavedState; account: SuiteSnapshot } | null>(
    null
  );
  const [conflictOpen, setConflictOpen] = useState(false);
  const [syncPaused, setSyncPaused] = useState(false);
  // Account writes stay blocked until the screen has adopted the account copy,
  // so a stale device mirror can never be pushed over it on boot.
  const onlineReadyRef = useRef(false);
  const [cityMapOpen, setCityMapOpen] = useState(false);
  const [cityStreet, setCityStreet] = useState('M St & 15th St');
  // Z toggles the camera distance only: close avatar view vs wide room view.
  const [closeZoom, setCloseZoom] = useState(false);
  // F toggles Follow Character in Isometric Mode; Third-Person always follows.
  const [followCharacter, setFollowCharacter] = useState(true);
  // `known` stays false until the 3D scene has reported a real position, so the
  // gateway never receives the placeholder origin as a spawn claim.
  const playerPoseRef = useRef({ x: 0, z: 0, yaw: 0, known: false });

  // Dev-only probe so each runtime can be exercised without guessing from CSS.
  useEffect(() => {
    if (!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) return;
    (window as unknown as Record<string, unknown>).__loftlife_env = device;
    // Live pose probe for the dev preview (?hudDebug=1); the ref is mutated by
    // the render loop, so reading it in the console stays current.
    (window as unknown as Record<string, unknown>).__loftlife_pose = playerPoseRef.current;
  }, [device]);

  useEffect(() => {
    const update = () => setIsPortrait(readPortraitOrientation());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    const query = window.matchMedia?.('(orientation: portrait)');
    query?.addEventListener?.('change', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      query?.removeEventListener?.('change', update);
    };
  }, []);

  // Mobile camera mode follows orientation by default. Players can lock either
  // view in Settings; editing temporarily pins the isometric build camera.
  // Desktop retains manual switching with V.
  useEffect(() => {
    if (!mobileRuntime || mode === 'edit') return;
    const preference = settings.camera.mobileMode;
    const next = preference === 'isometric'
      ? 'isometric'
      : preference === 'third-person'
      ? 'play'
      : isPortrait ? 'isometric' : 'play';
    setViewMode(next);
  }, [mobileRuntime, isPortrait, mode, settings.camera.mobileMode]);

  // Mobile browsers and unsupported runtimes get the loft manager only: no
  // walking, no worlds, no second camera. This is enforced in app state, not
  // just by hiding the entry buttons.
  useEffect(() => {
    if (gameplayAllowed) return;
    setActiveWorld(null);
    setActiveResident(null);
    setLocation('room');
    setMode('edit');
    setViewMode('isometric');
    setSelectedUid(null);
    setPlacingCatalogId(null);
    setMovingUid(null);
  }, [gameplayAllowed]);

  // Persist locally always; mirror to the account when signed in.
  useEffect(() => {
    try {
      if (!activeWorld) {
        const payload: SavedState = {
          items,
          surfaces,
          mood,
          avatar: avatarConfig,
          roomName,
        };
        localStorage.setItem(session.status === 'guest' ? GUEST_STORAGE_KEY : STORAGE_KEY, JSON.stringify(payload));
      }
    } catch {
      // Ignore storage quota errors
    }

    if (session.status !== 'online' || syncPaused || !onlineReadyRef.current) return;
    const state = { name: roomName, items, surfaces, mood };
    if (activeWorld) {
      if (activeWorld.canEdit) session.saveWorldState(activeWorld.id, state);
    } else {
      session.saveRoomState(state);
    }
  }, [items, surfaces, mood, avatarConfig, roomName, activeWorld, session.status, syncPaused]);

  // Character appearance is part of the persistent account. Skip the write when
  // the local outfit already matches the account (e.g. just after sign-in).
  useEffect(() => {
    if (session.status !== 'online' || !session.profile || syncPaused || !onlineReadyRef.current)
      return;
    if (JSON.stringify(session.profile.avatar) === JSON.stringify(avatarConfig)) return;
    session.saveAvatar(avatarConfig);
  }, [avatarConfig, session.status, session.profile, syncPaused]);

  // The character lives on this device until the player chooses to go online.
  // Signing up adopts that local character. Signing in to an existing account
  // must never replace device progress silently: a difference opens the sync
  // dialog and pauses account writes until it is settled.
  const previousStatusRef = useRef(session.status);
  useEffect(() => {
    const previous = previousStatusRef.current;
    previousStatusRef.current = session.status;
    if (session.status !== 'online' || previous === 'online') return;

    if (session.justRegistered) {
      const saved = loadSavedState();
      setAvatarConfig(saved.avatar);
      setItems(saved.items);
      setSurfaces(saved.surfaces);
      setMood(saved.mood);
      setRoomName(saved.roomName);
      session.clearJustRegistered();
      setConflict(null);
      setConflictOpen(false);
      setSyncPaused(false);
      onlineReadyRef.current = true;
      showHint('Offline character brought online');
      return;
    }

    if (!session.suite || !session.profile) {
      onlineReadyRef.current = true;
      return;
    }
    const account: SuiteSnapshot = {
      items: session.suite.items,
      surfaces: session.suite.surfaces,
      mood: session.suite.mood,
      roomName: session.suite.name,
      avatar: session.profile.avatar,
    };

    // Only an explicit sign-in (offline -> online) can collide with progress
    // made on this device; restoring a token on boot is the account's own copy.
    if (previous === 'offline') {
      const device = loadSavedState();
      if (hasDeviceProgress(device) && suiteFingerprint(device) !== suiteFingerprint(account)) {
        setConflict({ device, account });
        setConflictOpen(true);
        setSyncPaused(true);
        onlineReadyRef.current = true;
        showHint('This device has a different suite than your account');
        return;
      }
    }

    setItems(account.items);
    setSurfaces(account.surfaces);
    setMood(account.mood);
    setRoomName(account.roomName);
    setAvatarConfig(account.avatar);
    setConflict(null);
    setConflictOpen(false);
    setSyncPaused(false);
    onlineReadyRef.current = true;
    showHint('Signed in · online character loaded');
  }, [
    session.status,
    session.justRegistered,
    session.suite,
    session.profile,
    session.clearJustRegistered,
    // showHint only touches timer refs, so it is stable enough to leave out here.
  ]);

  // Leaving the account behind also drops any pending choice.
  useEffect(() => {
    if (session.status === 'online') return;
    onlineReadyRef.current = false;
    setConflict(null);
    setConflictOpen(false);
    setSyncPaused(false);
  }, [session.status]);

  // Stream position/emote to the realtime gateway while online.
  useEffect(() => {
    if (session.status !== 'online' && session.status !== 'guest') return;
    const timer = window.setInterval(() => {
      const pose = playerPoseRef.current;
      if (!pose.known) return;
      session.setPose({
        x: pose.x,
        y: 0,
        z: pose.z,
        yaw: pose.yaw,
        location,
        emote: activeEmote,
      });
      session.setVoiceAnchor({ x: pose.x, z: pose.z, location });
    }, 100);
    return () => window.clearInterval(timer);
  }, [session.status, session.setPose, session.setVoiceAnchor, location, activeEmote]);

  const showHint = useCallback((text: string | null) => {
    setWalkHint(text);
    if (hintTimerRef.current) window.clearTimeout(hintTimerRef.current);
    if (text) {
      hintTimerRef.current = window.setTimeout(() => setWalkHint(null), 2400);
    }
  }, []);

  const showNpcChat = useCallback((speaker: string, message: string) => {
    setNpcChat({ speaker, message });
    if (npcChatTimerRef.current) window.clearTimeout(npcChatTimerRef.current);
    npcChatTimerRef.current = window.setTimeout(() => setNpcChat(null), 5500);
  }, []);

  /** Keep the on-device suite and upload it, after the player confirms. */
  const keepDeviceSuite = useCallback(() => {
    if (!conflict) return;
    // Upload what is on screen now, not the snapshot taken when the dialog
    // opened: the player may have kept editing while it was dismissed.
    keepBackup(ACCOUNT_BACKUP_KEY, { suite: conflict.account });
    setConflict(null);
    setConflictOpen(false);
    setSyncPaused(false);
    session.saveRoomState({ name: roomName, items, surfaces, mood });
    session.saveAvatar(avatarConfig);
    showHint('Device suite kept · syncing to your account');
  }, [conflict, session, showHint, roomName, items, surfaces, mood, avatarConfig]);

  /** Load the account suite, after copying the device one aside. */
  const useAccountSuite = useCallback(() => {
    if (!conflict) return;
    const { device, account } = conflict;
    keepBackup(DEVICE_BACKUP_KEY, { suite: device });
    setItems(account.items);
    setSurfaces(account.surfaces);
    setMood(account.mood);
    setRoomName(account.roomName);
    setAvatarConfig(account.avatar);
    setConflict(null);
    setConflictOpen(false);
    setSyncPaused(false);
    showHint('Account suite loaded · device copy saved locally');
  }, [conflict, showHint]);

  const retryOnlineSave = useCallback(() => {
    if (session.status !== 'online' || syncPaused) return;
    session.saveRoomState({ name: roomName, items, surfaces, mood });
    session.saveAvatar(avatarConfig);
    showHint('Trying to save again…');
  }, [session, syncPaused, roomName, items, surfaces, mood, avatarConfig, showHint]);

  const handleChangeLocation = useCallback(
    (next: WorldLocation) => {
      if (!gameplayAllowed && next !== 'room') {
        showHint(MOBILE_GAMEPLAY_MESSAGE);
        return;
      }
      sfx.playToggle(next === 'world');
      setLocation(next);
      setNpcChat(null);
      if (next !== 'room') {
        setMode('walk');
        setSelectedUid(null);
        setPlacingCatalogId(null);
        setMovingUid(null);
      }
      if (next !== 'world') {
        setCityMapOpen(false);
      }
      if (next === 'world') {
        showHint(
          touchDevice
            ? 'Main City · Tap the street to walk · Tap the Hotel doors for Keycard / Intercom'
            : 'Main City · Walk to Hotel Main Entrance & press E for Keycard / Guest Intercom'
        );
      } else if (next === 'lobby') {
        showHint('Main Lobby · Walk into the North brass elevator to ride to your residential floor');
      } else if (next === 'airport') {
        showHint('TheCity International Airport · Check in at a counter, clear security, then find your gate');
      } else if (next === 'clothing_store') {
        showHint('LoftLife Threads · Browse racks and mannequins, then purchase at the checkout counter');
      } else if (next === 'hallway') {
        setActiveResident(null);
        showHint(`Floor ${hallwayFloor} Hallway · Find a numbered suite door or ride the elevator`);
      } else if (next === 'room') {
        setActiveResident(null);
        setHallwayFloor(playerSuiteFloor);
        showHint(
          touchDevice
            ? `${roomName} (Suite ${playerSuiteNumber}) · Tap the West door for your Keycard`
            : `${roomName} (Suite ${playerSuiteNumber}) · Walk to West door & press E for Keycard`
        );
      }
    },
    [gameplayAllowed, hallwayFloor, playerSuiteFloor, playerSuiteNumber, roomName, showHint, touchDevice]
  );

  const handleEnterGuestRoom = useCallback(() => {
    if (session.status !== 'guest') return;
    setRoomName('Guest Room'); setRoomDoorUnlocked(true); setActiveResident(null); setMode('walk'); setLocation('room');
    showHint('Your Guest Room is private and saved only on this device.');
  }, [session.status, showHint]);

  const handleUnlockRoomDoor = useCallback(() => {
    if (session.status === 'guest') { showHint('Guest visits cannot enter shared resident suites.'); return; }
    setRoomDoorUnlocked(true);
    setUnlockedRooms((prev) =>
      prev.includes(playerSuiteNumber) ? prev : [...prev, playerSuiteNumber]
    );
  }, [playerSuiteNumber]);

  const handleUnlockHallwayDoor = useCallback((roomNumber: string) => {
    if (session.status === 'guest') { showHint('Guest visits cannot enter shared resident suites.'); return; }
    setUnlockedRooms((prev) => (prev.includes(roomNumber) ? prev : [...prev, roomNumber]));
    if (roomNumber === playerSuiteNumber) {
      setRoomDoorUnlocked(true);
    }
  }, [playerSuiteNumber]);

  const handleEnterSuiteFromHallway = useCallback(
    (roomNumber: string) => {
      if (session.status === 'guest') { showHint('Guest visits do not include shared hotel rooms.'); return; }
      if (!gameplayAllowed) {
        showHint(MOBILE_GAMEPLAY_MESSAGE);
        return;
      }
      if (roomNumber === playerSuiteNumber) {
        setActiveResident(null);
        handleChangeLocation('room');
        return;
      }
      const res = HOTEL_RESIDENTS.find((r) => r.roomNumber === roomNumber);
      if (res) {
        setActiveResident(res);
        setTargetVisitResident(null);
        setLocation('resident_room');
        setMode('walk');
        showHint(
          touchDevice
            ? `Entered ${res.name}'s Suite ${res.roomNumber} · Tap ${res.name} to chat`
            : `Entered ${res.name}'s Suite ${res.roomNumber} · Press E near ${res.name} to chat`
        );
        showNpcChat(res.name, res.greeting);
      }
    },
    [gameplayAllowed, handleChangeLocation, playerSuiteNumber, showHint, showNpcChat, touchDevice]
  );

  const handleUnlockMainWithKeycard = useCallback(() => {
    if (session.status === 'guest') { showHint('Guest visits do not include shared hotel rooms.'); return; }
    setMainDoorUnlocked(true);
    setRoomDoorUnlocked(true);
    setUnlockedRooms((prev) =>
      prev.includes(playerSuiteNumber) ? prev : [...prev, playerSuiteNumber]
    );
    setDoorTerminalOpen(false);
    showHint(`Keycard accepted! Walk into Main Lobby & ride elevator to Floor ${playerSuiteFloor}`);
  }, [playerSuiteFloor, playerSuiteNumber, showHint]);

  /** Ring a suite doorbell. The gateway only forwards the ring when the owner
   * is online and standing inside that suite; there is no offline summon. */
  const handleRingDoorbell = useCallback(
    (roomNumber: string) => {
      if (session.status === 'guest') {
        showHint('Guest visits cannot ring resident suites. Create an account to visit players.');
        return;
      }
      if (!gameplayAllowed) {
        showHint(MOBILE_GAMEPLAY_MESSAGE);
        return;
      }
      if (roomNumber === playerSuiteNumber) {
        showHint('That is your own suite — use your keycard at the door.');
        return;
      }
      sfx.playIntercomRing();
      if (!session.ringDoorbell(roomNumber)) {
        showHint('Connect to TheCity to ring a suite doorbell.');
        return;
      }
      setDoorbellOutgoing({ requestId: '', roomNumber });
      showHint(`Ringing Suite ${roomNumber}… the owner must be inside to answer.`);
    },
    [gameplayAllowed, playerSuiteNumber, session, showHint]
  );

  const handleAnswerDoorbell = useCallback(
    (accept: boolean) => {
      const request = doorbellRequest;
      if (!request) return;
      session.answerDoorbell(request.requestId, accept);
      setDoorbellRequest(null);
      showHint(
        accept
          ? `Visit approved · ${request.from.name} is entering your suite as a guest.`
          : 'Visit declined. Your door stays locked.'
      );
    },
    [doorbellRequest, session, showHint]
  );

  // Doorbell traffic from the gateway: owner requests, visitor grants and
  // outcomes. A grant carries a read-only snapshot of the owner's suite.
  useEffect(() => {
    const event = session.hotelEvent;
    if (!event) return;
    if (event.action === 'ring' && event.requestId && event.from) {
      setDoorbellRequest({
        requestId: event.requestId,
        roomNumber: event.roomNumber ?? playerSuiteNumber,
        from: event.from,
      });
      session.clearHotelEvent();
      return;
    }
    if (event.action === 'ringing' && event.requestId && event.roomNumber) {
      setDoorbellOutgoing({ requestId: event.requestId, roomNumber: event.roomNumber });
      showHint(`Ringing Suite ${event.roomNumber}…`);
      session.clearHotelEvent();
      return;
    }
    if (event.action === 'granted' && event.room) {
      const room = event.room;
      const resident: ActiveResident = {
        id: room.userId,
        name: room.name,
        roomNumber: room.roomNumber,
        floor: room.floor,
        status: 'Visitor access',
        greeting: `Welcome to Suite ${room.roomNumber}. You can look around, but only ${room.name} can edit this room.`,
        avatar: room.avatar ?? avatarConfig,
        surfaces: room.surfaces,
        mood: room.mood,
        items: room.items,
      };
      setActiveResident(resident);
      setTargetVisitResident(null);
      setUnlockedRooms((prev) =>
        prev.includes(room.roomNumber) ? prev : [...prev, room.roomNumber]
      );
      setDoorbellOutgoing(null);
      setLocation('resident_room');
      setMode('walk');
      sfx.playKeycardBeep();
      showHint(
        `${room.name}'s Suite ${room.roomNumber} · Visitor access — furniture is read-only`
      );
      session.clearHotelEvent();
      return;
    }
    if (
      event.action === 'declined' ||
      event.action === 'expired' ||
      event.action === 'unavailable' ||
      event.action === 'cancelled' ||
      event.action === 'resolved'
    ) {
      if (event.action === 'resolved') {
        setDoorbellRequest(null);
        session.clearHotelEvent();
        return;
      }
      setDoorbellOutgoing(null);
      setDoorbellRequest(null);
      const message =
        event.message ??
        (event.action === 'declined'
          ? 'The owner declined the visit.'
          : event.action === 'expired'
          ? 'The doorbell timed out. Try again when the owner is home.'
          : event.action === 'cancelled'
          ? 'Doorbell cancelled.'
          : 'Nobody answered the doorbell.');
      showHint(message);
      session.clearHotelEvent();
    }
  }, [session, avatarConfig, playerSuiteNumber, showHint]);

  const handleArriveFloor = useCallback(
    (floor: 'L' | number) => {
      if (!gameplayAllowed) {
        setElevatorModalOpen(false);
        showHint(MOBILE_GAMEPLAY_MESSAGE);
        return;
      }
      setElevatorModalOpen(false);
      const startedAt = Date.now();
      setElevatorTransition({
        label: floor === 'L' ? 'Grand Hotel Lobby' : `Floor ${floor}`,
        detail:
          floor === 'L'
            ? 'Lobby · Reception & Concierge'
            : `Suites ${roomRangeLabel(floor)} · Elevator Lobby`,
        startedAt,
        arriveAt: startedAt + 850,
      });
      if (floor === 'L') {
        handleChangeLocation('lobby');
      } else {
        setHallwayFloor(floor);
        setLocation('hallway');
        setActiveResident(null);
        setMode('walk');
        showHint(`Arrived on Floor ${floor} · Walk down the hallway to Suites ${roomRangeLabel(floor)}`);
      }
    },
    [gameplayAllowed, handleChangeLocation, showHint]
  );

  /** Load a player-created world into the room builder. */
  const handleEnterWorld = useCallback(
    async (worldId: string) => {
      if (!gameplayAllowed) {
        showHint(MOBILE_GAMEPLAY_MESSAGE);
        return;
      }
      try {
        const world = await api.world(worldId);
        if (!world.canEnter || !world.items) {
          showHint('You do not have access to that world');
          return;
        }
        setActiveWorld(world);
        setItems(world.items);
        if (world.surfaces) setSurfaces(world.surfaces);
        setMood(world.mood ?? 'morning');
        setRoomName(world.name);
        setLocation('room');
        setMode(world.canEdit ? 'edit' : 'walk');
        setSelectedUid(null);
        setPlacingCatalogId(null);
        setMovingUid(null);
        await session.enterWorld(worldId);
        showHint(
          world.canEdit
            ? `${world.name} · you can build here — use Edit Room to place furniture`
            : `${world.name} · visiting only`
        );
      } catch (error) {
        showHint(error instanceof Error ? error.message : 'Could not enter that world');
      }
    },
    [gameplayAllowed, session, showHint]
  );

  // Boarding closes the destination dialog; the cutscene takes over from the
  // server's timestamps. A cancelled journey clears it immediately.
  useEffect(() => {
    const event = session.travel;
    if (!event) return;
    if (event.action === 'boarding' || event.action === 'departed') {
      setTravelMode(null);
      setTravelError(null);
    } else if (event.action === 'cancelled') {
      setTravelMode(null);
      setSceneTransition(null);
      session.clearTravel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.travel]);

  // The server owns arrival. Only after the `arrived` event may the client load
  // the destination, and a world entry is validated again through the world API.
  const handledArrivalRef = useRef<string | null>(null);
  useEffect(() => {
    const event = session.travel;
    if (event?.action !== 'arrived' || !event.journey) return;
    if (handledArrivalRef.current === event.journey.id) return;
    handledArrivalRef.current = event.journey.id;
    const destination = event.journey.destination;
    const timer = window.setTimeout(() => {
      if (destination.kind === 'world' && destination.worldId) {
        void handleEnterWorld(destination.worldId).finally(() => {
          session.clearTravel();
          setSceneTransition(null);
        });
        return;
      }
      const location = destination.location as WorldLocation | undefined;
      if (location === 'world' && destination.spawn) {
        handleChangeLocation('world');
        setTravelRequest({
          x: destination.spawn.x,
          z: destination.spawn.z,
          yaw: destination.spawn.yaw ?? 0,
          label: destination.label,
          at: Date.now(),
        });
      } else if (location) {
        handleChangeLocation(location);
      }
      session.clearTravel();
      setSceneTransition(null);
    }, 850);
    return () => window.clearTimeout(timer);
    // Handlers are stable enough for one arrival; including the whole session
    // object would clear the timer on every presence tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.travel]);

  // Buses and taxis drop riders through a server-authored position. Apply it to
  // the local avatar so a passenger does not reappear at the boarding stop.
  useEffect(() => {
    const exit = session.transitExit;
    if (!exit) return;
    if (location !== 'world') handleChangeLocation('world');
    setTravelRequest({
      x: exit.x,
      z: exit.z,
      yaw: 0,
      label: exit.label ?? 'Transit stop',
      at: Date.now(),
    });
    if (exit.label?.startsWith('Taxi')) {
      const startedAt = Date.now();
      setSceneTransition({
        mode: 'taxi',
        label: exit.label.replace(/^Taxi · /, ''),
        detail: 'Autonomous taxi drop-off',
        startedAt,
        arriveAt: startedAt + 900,
      });
    }
    session.clearTransitExit();
  }, [session.transitExit, session, location, handleChangeLocation]);

  // Boarding a bus, train or taxi gets a short mode-specific cut-in so the
  // passenger sees the vehicle transition instead of a silent snap.
  const boardedVehicleRef = useRef<string | null>(null);
  useEffect(() => {
    const vehicleId = session.riding?.vehicleId ?? null;
    if (!vehicleId || boardedVehicleRef.current === vehicleId) return;
    boardedVehicleRef.current = vehicleId;
    const kind = session.riding?.kind;
    const label =
      session.transitVehicles.find((vehicle) => vehicle.id === vehicleId)?.label ??
      session.riding?.label ??
      'LoftLine';
    const startedAt = Date.now();
    setSceneTransition({
      mode: kind === 'taxi' ? 'taxi' : kind === 'rail' ? 'rail' : 'bus',
      label,
      detail: kind === 'taxi' ? 'Autonomous taxi · boarding' : 'Server-dispatched vehicle · boarding',
      startedAt,
      arriveAt: startedAt + 1100,
    });
  }, [session.riding, session.transitVehicles]);

  useEffect(() => {
    if (!elevatorTransition) return;
    const timer = window.setTimeout(
      () => setElevatorTransition(null),
      Math.max(500, elevatorTransition.arriveAt - Date.now() + 250)
    );
    return () => window.clearTimeout(timer);
  }, [elevatorTransition]);

  useEffect(() => {
    if (!sceneTransition) return;
    const timer = window.setTimeout(
      () => setSceneTransition(null),
      Math.max(500, sceneTransition.arriveAt - Date.now() + 250)
    );
    return () => window.clearTimeout(timer);
  }, [sceneTransition]);

  // Apply the destination the platform asked for, once per mount. A world entry
  // still validates access through the API; a failure leaves the player in the suite.
  const entryAppliedRef = useRef(false);
  useEffect(() => {
    if (!entry || entryAppliedRef.current) return;
    entryAppliedRef.current = true;
    if (entry.kind === 'city') {
      setLocation('world');
      session.enterCity();
      showHint('TheCity · walk to the Grand Hotel entrance and press E for the keycard');
    } else if (entry.kind === 'suite') {
      setLocation('room');
      if (entry.edit) setMode('edit');
      session.enterCity();
      showHint(entry.edit ? 'Edit Room · place furniture, then walk to explore' : 'Welcome to your suite');
    } else if (entry.kind === 'world') {
      void handleEnterWorld(entry.worldId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Return from a player world to the hotel suite. */
  const handleLeaveWorld = useCallback(() => {
    setActiveWorld(null);
    // While a conflict is unresolved the device suite is the truth on screen.
    const suite = conflict ? null : session.suite;
    if (suite) {
      setItems(suite.items);
      setSurfaces(suite.surfaces);
      setMood(suite.mood);
      setRoomName(suite.name);
    }
    setLocation('room');
    setMode('walk');
    setSelectedUid(null);
    setPlacingCatalogId(null);
    setMovingUid(null);
    session.enterCity();
    showHint('Back in your suite');
  }, [session, showHint, conflict]);

  // A server-requested move (join friend / join party leader) goes through the
  // normal world-entry checks instead of a raw socket swap.
  useEffect(() => {
    session.setRelocateHandler((worldId) => {
      if (worldId) void handleEnterWorld(worldId);
      else handleLeaveWorld();
    });
    return () => session.setRelocateHandler(null);
  }, [session.setRelocateHandler, handleEnterWorld, handleLeaveWorld]);

  const handleWorldUpdated = useCallback((updated: WorldSummary) => {
    setActiveWorld((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
    if (updated.name) setRoomName(updated.name);
  }, []);

  /** Confirm-leave path: flush the latest build state, then restore the suite. */
  const handleLeaveWorldConfirmed = useCallback(async () => {
    if (!activeWorld) return;
    if (activeWorld.canEdit && session.status === 'online') {
      try {
        await api.saveWorldState(activeWorld.id, { items, surfaces, mood });
      } catch {
        showHint('World could not sync before leaving · the saved copy is unchanged');
      }
    }
    handleLeaveWorld();
  }, [activeWorld, session.status, items, surfaces, mood, showHint, handleLeaveWorld]);

  const pushHistory = useCallback((prevItems: PlacedItem[]) => {
    setHistory((h) => [...h.slice(-19), prevItems]);
  }, []);

  const handleUndo = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      setItems(last);
      setSelectedUid(null);
      setMovingUid(null);
      sfx.playClick();
      return h.slice(0, -1);
    });
  }, []);

  const handleModeSwitch = (next: GameMode) => {
    if (next === 'walk' && !gameplayAllowed) {
      showHint(MOBILE_GAMEPLAY_MESSAGE);
      return;
    }
    // Another player's suite is visitor-only: walking is fine, building is not.
    if (next === 'edit' && location === 'resident_room') {
      showHint('Only the owner can decorate and edit this room.');
      return;
    }
    sfx.playClick();
    setMode(next);
    if (next === 'walk') {
      setSelectedUid(null);
      setPlacingCatalogId(null);
      setMovingUid(null);
    } else {
      setViewMode('isometric');
      setActiveEmote('idle');
    }
  };

  const handleTogglePlayView = useCallback(() => {
    if (!gameplayAllowed) {
      showHint(MOBILE_GAMEPLAY_MESSAGE);
      return;
    }
    sfx.playClick();
    setViewMode((prev) => {
      const next = prev === 'play' ? 'isometric' : 'play';
      if (next === 'play') {
        setMode('walk');
        setSelectedUid(null);
        setPlacingCatalogId(null);
        setMovingUid(null);
        setAvatarModalOpen(false);
        showHint('Third-Person · WASD move · mouse to look · Z close/wide');
      } else {
        showHint('Isometric · WASD move · drag to orbit · click to walk · F follow · Z zoom');
      }
      return next;
    });
  }, [gameplayAllowed, showHint]);

  const handlePlaceItem = useCallback(
    (candidate: Omit<PlacedItem, 'uid'>) => {
      pushHistory(items);
      const uid = `it_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const created: PlacedItem = { ...candidate, uid };
      setItems((prev) => [...prev, created]);
      setSelectedUid(uid);
      setPlacingCatalogId(null);
    },
    [items, pushHistory]
  );

  const handleFinishMove = useCallback(
    (uid: string, gx: number, gz: number, rot: 0 | 1 | 2 | 3, wall?: PlacedItem['wall']) => {
      pushHistory(items);
      setItems((prev) =>
        prev.map((it) => (it.uid === uid ? { ...it, gx, gz, rot, wall } : it))
      );
      setMovingUid(null);
      setSelectedUid(uid);
    },
    [items, pushHistory]
  );

  const handleToggleInteractive = useCallback((uid: string) => {
    setItems((prev) =>
      prev.map((it) => (it.uid === uid ? { ...it, active: !it.active } : it))
    );
  }, []);

  const selectedItem = useMemo(
    () => items.find((it) => it.uid === selectedUid) ?? null,
    [items, selectedUid]
  );

  const selectedCatalog = useMemo(
    () => (selectedItem ? getCatalogItem(selectedItem.catalogId) ?? null : null),
    [selectedItem]
  );

  const rotateSelectedOrPlacing = useCallback(() => {
    if (placingCatalogId || movingUid) {
      sfx.playClick();
      setPlacingRotation((r) => ((r + 1) % 4) as 0 | 1 | 2 | 3);
      return;
    }
    if (selectedItem && selectedCatalog && selectedCatalog.layer !== 'wall') {
      const nextRot = ((selectedItem.rot + 1) % 4) as 0 | 1 | 2 | 3;
      const [ew, ed] = getEffectiveSize(selectedItem.catalogId, nextRot);
      // Adjust position slightly if near wall boundary when rotating rectangular item
      const clampedGx = snapGrid(Math.max(0, Math.min(selectedItem.gx, GRID_SIZE - ew)));
      const clampedGz = snapGrid(Math.max(0, Math.min(selectedItem.gz, GRID_SIZE - ed)));
      const candidate = { ...selectedItem, gx: clampedGx, gz: clampedGz, rot: nextRot };
      if (isValidPlacement(candidate, items)) {
        sfx.playClick();
        pushHistory(items);
        setItems((prev) => prev.map((it) => (it.uid === selectedItem.uid ? candidate : it)));
      } else {
        sfx.playRemove();
        showHint('Not enough space to rotate here');
      }
    }
  }, [placingCatalogId, movingUid, selectedItem, selectedCatalog, items, pushHistory, showHint]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedItem) return;
    sfx.playRemove();
    pushHistory(items);
    setItems((prev) => prev.filter((it) => it.uid !== selectedItem.uid));
    setSelectedUid(null);
  }, [selectedItem, items, pushHistory]);

  const handleDuplicateSelected = useCallback(() => {
    if (!selectedItem) return;
    sfx.playClick();
    setPlacingCatalogId(selectedItem.catalogId);
    setPlacingColor(selectedItem.color);
    setPlacingRotation(selectedItem.rot);
    setSelectedUid(null);
    setMovingUid(null);
  }, [selectedItem]);

  const handleStartMoveSelected = useCallback(() => {
    if (!selectedItem) return;
    sfx.playClick();
    setMovingUid(selectedItem.uid);
    setPlacingRotation(selectedItem.rot);
    setPlacingCatalogId(null);
  }, [selectedItem]);

  const handleRecolorSelected = useCallback(
    (hex: string) => {
      if (!selectedItem) return;
      sfx.playClick();
      pushHistory(items);
      setItems((prev) =>
        prev.map((it) => (it.uid === selectedItem.uid ? { ...it, color: hex } : it))
      );
    },
    [selectedItem, items, pushHistory]
  );

  // Keyboard shortcuts (R to rotate, Esc to cancel, Delete to remove, H to toggle dock, V Third-Person, M City Map)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)
      ) {
        return;
      }
      if (doorTerminalOpen || elevatorModalOpen) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((c) => !c);
      } else if ((e.key === 'v' || e.key === 'V') && gameplayAllowed) {
        handleTogglePlayView();
      } else if (e.key === 'Escape' && cityMapOpen) {
        setCityMapOpen(false);
      } else if (mode === 'edit') {
        if (e.key === 'r' || e.key === 'R') {
          rotateSelectedOrPlacing();
        } else if (e.key === 'Escape') {
          setPlacingCatalogId(null);
          setMovingUid(null);
          setSelectedUid(null);
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedUid) {
          handleDeleteSelected();
        } else if (
          !placingCatalogId &&
          !movingUid &&
          selectedItem &&
          selectedCatalog &&
          ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
        ) {
          e.preventDefault();
          let dx = 0;
          let dz = 0;
          if (e.key === 'ArrowLeft') dx = -SNAP_STEP;
          if (e.key === 'ArrowRight') dx = SNAP_STEP;
          if (e.key === 'ArrowUp') dz = -SNAP_STEP;
          if (e.key === 'ArrowDown') dz = SNAP_STEP;

          let nextGx = selectedItem.gx;
          let nextGz = selectedItem.gz;
          if (selectedCatalog.layer === 'wall') {
            // Wall items slide along their own wall: X on north/south, Z on east/west.
            if (wallAxis(selectedItem.wall ?? 'north') === 'z') {
              nextGz = snapGrid(
                Math.max(0, Math.min(GRID_SIZE - selectedCatalog.size[0], selectedItem.gz + dz))
              );
            } else {
              nextGx = snapGrid(
                Math.max(0, Math.min(GRID_SIZE - selectedCatalog.size[0], selectedItem.gx + dx))
              );
            }
          } else {
            const [ew, ed] = getEffectiveSize(selectedItem.catalogId, selectedItem.rot);
            nextGx = snapGrid(Math.max(0, Math.min(GRID_SIZE - ew, selectedItem.gx + dx)));
            nextGz = snapGrid(Math.max(0, Math.min(GRID_SIZE - ed, selectedItem.gz + dz)));
          }

          if (nextGx !== selectedItem.gx || nextGz !== selectedItem.gz) {
            const candidate = { ...selectedItem, gx: nextGx, gz: nextGz };
            if (isValidPlacement(candidate, items)) {
              sfx.playClick();
              pushHistory(items);
              setItems((prev) =>
                prev.map((it) => (it.uid === selectedItem.uid ? candidate : it))
              );
            } else {
              sfx.playRemove();
            }
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    mode,
    location,
    cityMapOpen,
    doorTerminalOpen,
    elevatorModalOpen,
    placingCatalogId,
    movingUid,
    selectedItem,
    selectedCatalog,
    items,
    pushHistory,
    rotateSelectedOrPlacing,
    selectedUid,
    handleDeleteSelected,
    handleTogglePlayView,
  ]);

  const triggerEmote = (emote: EmoteType) => {
    sfx.playEmote();
    setActiveEmote(emote);
    setEmoteTriggerId((id) => id + 1);
  };

  /** Seat position on the server-owned bus, so the local avatar rides along. */
  const ridingVehiclePose = useMemo(() => {
    if (!session.riding) return null;
    const vehicle = session.transitVehicles.find((entry) => entry.id === session.riding!.vehicleId);
    if (!vehicle) return null;
    const seat = session.riding.seat ?? 0;
    const kind = session.riding.kind ?? vehicle.kind;
    let lateral = seat % 2 === 0 ? -0.62 : 0.62;
    let along = 1.35 - Math.floor(seat / 2) * 1.25;
    if (kind === 'taxi') {
      const spots = [
        { lateral: 0, along: 1.25 },
        { lateral: -0.68, along: -0.35 },
        { lateral: 0.68, along: -0.35 },
      ];
      ({ lateral, along } = spots[seat % spots.length]);
    } else if (kind === 'rail') {
      lateral = seat % 2 === 0 ? -0.72 : 0.72;
      along = 4.6 - Math.floor(seat / 2) * 1.35;
    }
    const forwardX = Math.sin(vehicle.heading);
    const forwardZ = Math.cos(vehicle.heading);
    const rightX = Math.cos(vehicle.heading);
    const rightZ = -Math.sin(vehicle.heading);
    return {
      x: vehicle.x + rightX * lateral + forwardX * along,
      y: 0.34,
      z: vehicle.z + rightZ * lateral + forwardZ * along,
      heading: vehicle.heading,
    };
  }, [session.riding, session.transitVehicles]);

  const ridingState = session.riding;
  const ridingLabel = ridingState
    ? session.transitVehicles.find((vehicle) => vehicle.id === ridingState.vehicleId)?.label
    : undefined;
  const activeJourney = session.travel?.journey ?? null;

  const handleBoardTransit = useCallback(
    (lineId: string, stopId: string) => {
      if (!gameplayAllowed) {
        showHint(MOBILE_GAMEPLAY_MESSAGE);
        return;
      }
      // Riding needs the chase camera, except in portrait where isometric is pinned.
      if (!(touchDevice && isPortrait)) setViewMode('play');
      setMode('walk');
      const sent = session.boardTransit(lineId, stopId);
      if (!sent) showHint('Connecting… try boarding again in a moment');
    },
    [gameplayAllowed, session, showHint, touchDevice, isPortrait]
  );

  const handleHailTaxi = useCallback(
    (vehicleId: string) => {
      if (!gameplayAllowed) {
        showHint(MOBILE_GAMEPLAY_MESSAGE);
        return;
      }
      setViewMode('play');
      setMode('walk');
      if (!session.hailTaxi(vehicleId)) showHint('Connecting… try hailing again');
    },
    [gameplayAllowed, session, showHint]
  );

  const handleExitTransit = useCallback(() => {
    session.exitTransit();
  }, [session]);

  /** Open the departure board for intercity rail or a flight. */
  const openTravel = useCallback(
    async (mode: 'rail' | 'air') => {
      if (!gameplayAllowed) {
        showHint(MOBILE_GAMEPLAY_MESSAGE);
        return;
      }
      setTravelMode(mode);
      setTravelLoading(true);
      setTravelError(null);
      try {
        const result = await api.travelDestinations();
        setTravelDestinations({ city: result.city ?? [], worlds: result.worlds ?? [] });
      } catch (error) {
        setTravelError(error instanceof Error ? error.message : 'Could not load destinations');
      } finally {
        setTravelLoading(false);
      }
    },
    [gameplayAllowed, showHint]
  );

  const handleStartJourney = useCallback(
    (mode: 'rail' | 'air', destinationId: string) => {
      setTravelError(null);
      if (!session.startJourney(mode, destinationId)) {
        setTravelError('Not connected to the travel server. Try again in a moment.');
      }
    },
    [session]
  );

  /** R (and the mobile range button) cycle Off → Whisper → Talk → Shout → Off. */
  const cycleRange = useCallback(() => {
    const next = session.cycleVoiceRange();
    sfx.playClick();
    const info = VOICE_RANGE_INFO[next];
    showHint(`Voice range · ${info.label}${info.meters ? ` (${info.meters} m)` : ''}`);
  }, [session, showHint]);

  /** Z toggles a distance change only; angle, target and follow are untouched. */
  const toggleCloseZoom = useCallback(() => {
    sfx.playClick();
    const next = !closeZoom;
    setCloseZoom(next);
    showHint(
      next ? 'Close view · Z returns to the wide room view' : 'Wide room view · Z zooms in close'
    );
  }, [closeZoom, showHint]);

  /** F changes only Follow Character, and only in Isometric Mode. */
  const toggleFollowCharacter = useCallback(() => {
    if (viewMode === 'play') {
      showHint('Third-Person always follows · V switches to Isometric');
      return;
    }
    sfx.playClick();
    const next = !followCharacter;
    setFollowCharacter(next);
    showHint(
      next
        ? 'Following your avatar · F stops following'
        : 'Camera free · WASD still moves your avatar, F follows again'
    );
  }, [followCharacter, showHint, viewMode]);

  const placingCatalogItem = useMemo(
    () => (placingCatalogId ? getCatalogItem(placingCatalogId) ?? null : null),
    [placingCatalogId]
  );

  /** Open the central menu. Chat closes so gameplay input is fully suppressed. */
  const openGameMenu = useCallback(() => {
    sfx.playClick();
    session.setChatOpen(false);
    setMenuOpen(true);
  }, [session.setChatOpen]);

  const openSocial = useCallback(
    (intent: SocialIntent) => {
      sfx.playClick();
      setSocialIntent(intent);
      session.setChatOpen(true);
    },
    [session.setChatOpen]
  );

  const handleToggleChat = useCallback(() => {
    sfx.playClick();
    if (session.chatOpen) {
      session.setChatOpen(false);
      return;
    }
    setSocialIntent('chat');
    session.setChatOpen(true);
  }, [session.chatOpen, session.setChatOpen]);

  const openWorldControls = useCallback(() => {
    sfx.playClick();
    setMenuOpen(false);
    setWorldMenuTab('controls');
    setWorldMenuOpen(true);
  }, []);

  const openWorldManage = useCallback(() => {
    sfx.playClick();
    setMenuOpen(false);
    setWorldMenuTab('map');
    setWorldMenuOpen(true);
  }, []);

  /** The menu asks for a specific camera; the existing toggle preserves state. */
  const handleSetView = useCallback(
    (next: ViewMode) => {
      if (!device.desktop || !gameplayAllowed || next === viewMode) return;
      handleTogglePlayView();
    },
    [device.desktop, gameplayAllowed, viewMode, handleTogglePlayView]
  );

  const toggleFullscreen = useCallback(() => {
    if (typeof document === 'undefined') return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
      return;
    }
    void document.documentElement.requestFullscreen?.().catch(() => {
      showHint('Fullscreen is not available in this window');
    });
  }, [showHint]);

  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement));
    update();
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  const hudDebug = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('hudDebug')) return null;
    return {
      presentation: resolveHudPresentation({
        deviceClass: device.deviceClass,
        touch: device.controls === 'touch',
        installed: device.installed,
        portrait: isPortrait,
      }) as string,
      platform: device.platform,
      input: device.inputMode,
    };
  }, [device.deviceClass, device.controls, device.installed, device.platform, device.inputMode, isPortrait]);

  const handlePickCatalog = useCallback(
    (catalogId: string) => {
      const catalog = getCatalogItem(catalogId);
      if (!catalog) return;
      sfx.playClick();
      if (placingCatalogId === catalogId) {
        setPlacingCatalogId(null);
        return;
      }
      setMovingUid(null);
      setSelectedUid(null);
      setPlacingCatalogId(catalogId);
      setPlacingColor(catalog.defaultColor);
      setPlacingRotation(0);
    },
    [placingCatalogId]
  );

  const handleBuildRecolor = useCallback(
    (hex: string) => {
      if (placingCatalogId || movingUid) {
        sfx.playClick();
        setPlacingColor(hex);
        return;
      }
      handleRecolorSelected(hex);
    },
    [placingCatalogId, movingUid, handleRecolorSelected]
  );

  const handleClearSuite = useCallback(() => {
    sfx.playRemove();
    pushHistory(items);
    setItems([]);
    setSelectedUid(null);
    setPlacingCatalogId(null);
    setMovingUid(null);
  }, [items, pushHistory]);

  const handleApplyPreset = useCallback(
    (presetId: string) => {
      const preset = ROOM_PRESETS.find((entry) => entry.id === presetId);
      if (!preset) return;
      sfx.playPlace();
      pushHistory(items);
      setItems(preset.items.map((item) => ({ ...item })));
      setSurfaces({ ...preset.surfaces });
      setMood(preset.mood);
      setRoomName(preset.name);
      setSelectedUid(null);
      setPlacingCatalogId(null);
      setMovingUid(null);
    },
    [items, pushHistory]
  );


  const canEditRoom = location === 'room' && (!activeWorld || activeWorld.canEdit);

  // Presentation-only controller for the build overlay. Every entry maps to the
  // existing builder state/handler; no furniture rule is re-implemented here.
  const buildController: BuildController = {
    tab: editTab,
    setTab: setEditTab,
    categoryFilter,
    setCategoryFilter,
    itemCount: items.length,
    historyLength: history.length,
    canEdit: canEditRoom,
    collapsed: dockCollapsed,
    onToggleCollapsed: () => setDockCollapsed((value) => !value),
    placing: placingCatalogItem
      ? {
          id: placingCatalogItem.id,
          name: placingCatalogItem.name,
          colors: placingCatalogItem.colors,
          color: placingColor,
          isWall: placingCatalogItem.layer === 'wall',
        }
      : null,
    movingName: movingUid
      ? getCatalogItem(items.find((item) => item.uid === movingUid)?.catalogId ?? '')?.name ?? 'item'
      : null,
    selected:
      selectedItem && selectedCatalog
        ? {
            name: selectedCatalog.name,
            size: selectedCatalog.size,
            colors: selectedCatalog.colors,
            color: selectedItem.color,
            isWall: selectedCatalog.layer === 'wall',
          }
        : null,
    onPickCatalog: handlePickCatalog,
    onCancelPlacement: () => {
      setPlacingCatalogId(null);
      setMovingUid(null);
    },
    onRotate: rotateSelectedOrPlacing,
    onRecolor: handleBuildRecolor,
    onStartMove: handleStartMoveSelected,
    onDuplicate: handleDuplicateSelected,
    onDelete: handleDeleteSelected,
    onUndo: handleUndo,
    onClear: handleClearSuite,
    onDone: () => handleModeSwitch('walk'),
    surfaces,
    onFloorChange: (floor) => setSurfaces((current) => ({ ...current, floor })),
    onWallChange: (wall) => setSurfaces((current) => ({ ...current, wall })),
    presets: ROOM_PRESETS.map((preset) => ({
      id: preset.id,
      name: preset.name,
      count: preset.items.length,
      active: roomName === preset.name,
    })),
    onPreset: handleApplyPreset,
  };

  const anyModalOpen =
    avatarModalOpen ||
    cityMapOpen ||
    doorTerminalOpen ||
    doorbellRequest !== null ||
    elevatorModalOpen ||
    travelMode !== null ||
    session.taxiTrip?.state === 'waiting' ||
    Boolean(session.travel) ||
    elevatorTransition !== null ||
    sceneTransition !== null ||
    clothingStoreOpen ||
    furnitureShopOpen ||
    roomSettingsOpen ||
    authOpen ||
    studioWorldId !== null ||
    menuOpen ||
    worldMenuOpen ||
    conflictOpen;

  // Android back closes the top layer first, then minimizes the app. The
  // wrapper dispatches `loftlife:native-back`; Cordova WebViews use the
  // standard `backbutton` event. Browsers are left alone.
  useEffect(() => {
    if (!device.androidApp) return;
    const bridge = (window as unknown as {
      LoftLifeAndroid?: { minimizeApp?: () => void };
      LoftLifeAndroidApp?: { minimizeApp?: () => void };
    });
    const closeTopLayer = (): boolean => {
      if (conflictOpen) {
        setConflictOpen(false);
        return true;
      }
      if (authOpen) {
        setAuthOpen(false);
        return true;
      }
      if (worldMenuOpen) {
        setWorldMenuOpen(false);
        return true;
      }
      if (menuOpen) {
        setMenuOpen(false);
        return true;
      }
      if (roomSettingsOpen) {
        setRoomSettingsOpen(false);
        return true;
      }
      if (avatarModalOpen) {
        setAvatarModalOpen(false);
        return true;
      }
      if (cityMapOpen) {
        setCityMapOpen(false);
        return true;
      }
      if (doorTerminalOpen) {
        setDoorTerminalOpen(false);
        return true;
      }
      if (elevatorModalOpen) {
        setElevatorModalOpen(false);
        return true;
      }
      return false;
    };
    const onBack = (event: Event) => {
      if (closeTopLayer()) {
        event.preventDefault();
        return;
      }
      const native = bridge.LoftLifeAndroid ?? bridge.LoftLifeAndroidApp;
      if (native?.minimizeApp) {
        event.preventDefault();
        native.minimizeApp();
      }
    };
    window.addEventListener('loftlife:native-back', onBack);
    document.addEventListener('backbutton', onBack);
    return () => {
      window.removeEventListener('loftlife:native-back', onBack);
      document.removeEventListener('backbutton', onBack);
    };
  }, [
    device.androidApp,
    conflictOpen,
    authOpen,
    menuOpen,
    worldMenuOpen,
    roomSettingsOpen,
    avatarModalOpen,
    cityMapOpen,
    doorTerminalOpen,
    elevatorModalOpen,
  ]);

  // Desktop shortcuts. T drives whichever microphone mode is selected, R
  // cycles the voice range, C toggles the shared chat panel, Z toggles the
  // close/wide camera distance and F toggles Isometric follow. Shared
  // resolver: nothing fires while typing or in a dialog, and the furniture
  // builder keeps R for rotating.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (isTypingTarget(document.activeElement)) return;
      // M is handled before the dialog gate so it can close its own menu.
      if (bindingMatchesEvent(controls.bindings.menu, event)) {
        if (anyModalOpen && !menuOpen) return;
        event.preventDefault();
        sfx.playClick();
        setMenuOpen((open) => !open);
        return;
      }
      if (anyModalOpen) return;
      if (bindingMatchesEvent(controls.bindings.zoom, event)) {
        event.preventDefault();
        toggleCloseZoom();
      } else if (bindingMatchesEvent(controls.bindings.playToggle, event)) {
        if (!gameplayAllowed) return;
        event.preventDefault();
        handleTogglePlayView();
      } else if (bindingMatchesEvent(controls.bindings.follow, event)) {
        event.preventDefault();
        toggleFollowCharacter();
      } else if (bindingMatchesEvent(controls.bindings.voice, event)) {
        event.preventDefault();
        sfx.playClick();
        if (session.voice.range === 'off') {
          showHint(`Voice range is Off — press ${controls.bindings.voiceRange ? 'the range key' : 'the range key'} to pick Whisper, Talk or Shout`);
          return;
        }
        void session.pressMicrophone();
      } else if (mode !== 'edit' && bindingMatchesEvent(controls.bindings.voiceRange, event)) {
        event.preventDefault();
        cycleRange();
      } else if (bindingMatchesEvent(controls.bindings.chat, event)) {
        event.preventDefault();
        sfx.playClick();
        session.toggleChat();
      }
    };
    // Key-up is deliberately not gated by focus or dialogs, so a held talk key
    // can never stay latched after the composer steals focus.
    const onKeyUp = (event: KeyboardEvent) => {
      if (bindingMatchesEvent(controls.bindings.voice, event)) session.releaseMicrophone();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      session.releaseMicrophone();
    };
  }, [
    anyModalOpen,
    menuOpen,
    gameplayAllowed,
    controls.bindings,
    cycleRange,
    handleTogglePlayView,
    toggleCloseZoom,
    toggleFollowCharacter,
    showHint,
    session.voice.range,
    session.pressMicrophone,
    session.releaseMicrophone,
    session.toggleChat,
  ]);

  // Switching camera mode or leaving the scene never carries a zoom across.
  // Follow Character is a player preference, so it survives both.
  useEffect(() => {
    setCloseZoom(false);
  }, [viewMode, location]);

  const locationTitle = activeWorld
    ? `${activeWorld.name}${activeWorld.canEdit ? ' · Building' : ' · Visiting'}`
    : location === 'world'
    ? 'Main City'
    : location === 'airport'
    ? 'TheCity International Airport'
    : location === 'clothing_store'
    ? 'LoftLife Threads'
    : location === 'lobby'
    ? `Grand Hotel Lobby · ${HOTEL_FLOOR_COUNT} Floors`
    : location === 'hallway'
    ? `Floor ${hallwayFloor} Hallway`
    : location === 'resident_room' && activeResident
    ? `${activeResident.name}'s Suite ${activeResident.roomNumber}`
    : `Suite ${playerSuiteNumber} · ${roomName}`;

  const locationSub = activeWorld
    ? `Player world · ${items.length} items · ${session.presenceOnline} online`
    : location === 'world'
    ? cityStreet
    : location === 'airport'
    ? 'Concourse A · Check-in · Security · Gates'
    : location === 'clothing_store'
    ? 'City retail · Clothing & accessories'
    : location === 'lobby'
    ? 'Floor 1 · Concierge & Elevator'
    : location === 'hallway'
    ? `Suites ${roomRangeLabel(hallwayFloor)}`
    : location === 'resident_room' && activeResident
    ? `Floor ${activeResident.floor} · Guest Visit`
    : `Floor ${playerSuiteFloor} · ${items.length} items`;

  // Only show players who are actually in this scene (and, for player worlds,
  // in the same world instance).
  const remoteInThisScene = useMemo(() => {
    if (session.status !== 'online' && session.status !== 'guest') return [];
    if (activeWorld) {
      if (session.instance?.worldId !== activeWorld.id) return [];
    } else if (session.instance?.kind === 'world') {
      return [];
    }
    return session.remotePlayers.filter(
      (player) =>
        player.location === location ||
        // Riders on the bus are still in the city scene.
        (location === 'world' && player.location === 'transit')
    );
  }, [session.status, session.remotePlayers, session.instance, activeWorld, location]);

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none">
      {/* Full-Screen 3D Canvas (lazy-loaded: the sign-in wall ships no Three.js) */}
      <Suspense
        fallback={
          <div className="fixed inset-0 bg-[#070b08] flex items-center justify-center">
            <span className="text-sm text-[#39ff14] tracking-wide">Loading LoftLife…</span>
          </div>
        }
      >
      <RoomViewport
        location={location}
        guestMode={session.status === 'guest'}
        hallwayFloor={hallwayFloor}
        playerSuiteNumber={playerSuiteNumber}
        playerSuiteFloor={playerSuiteFloor}
        unlockedRooms={unlockedRooms}
        mainDoorUnlocked={mainDoorUnlocked}
        roomDoorUnlocked={roomDoorUnlocked}
        activeResident={activeResident}
        viewMode={viewMode}
        mode={mode}
        isTouch={touchDevice}
        lowPowerGraphics={device.lowPowerGraphics}
        items={items}
        surfaces={surfaces}
        mood={mood}
        avatarConfig={avatarConfig}
        activeEmote={activeEmote}
        emoteTriggerId={emoteTriggerId}
        selectedUid={selectedUid}
        placingCatalogId={placingCatalogId}
        placingRotation={placingRotation}
        placingColor={placingColor}
        movingUid={movingUid}
        closeZoom={closeZoom}
        followCharacter={followCharacter}
        modalOpen={anyModalOpen || session.chatOpen}
        remotePlayers={remoteInThisScene}
        playerPoseRef={playerPoseRef}
        transitLines={session.transitLines}
        transitVehicles={session.transitVehicles}
        ridingVehicle={ridingVehiclePose}
        ridingLabel={ridingLabel ?? null}
        onBoardTransit={handleBoardTransit}
        onExitTransit={handleExitTransit}
        onChangeLocation={handleChangeLocation}
        onSelectItem={setSelectedUid}
        onPlaceItem={handlePlaceItem}
        onFinishMove={handleFinishMove}
        onToggleInteractive={handleToggleInteractive}
        onEmoteChange={setActiveEmote}
        onWalkHint={showHint}
        onNpcChat={showNpcChat}
        onPointerLockChange={setPointerLocked}
        onProximityPrompt={setProximityPrompt}
        onCityStreetChange={setCityStreet}
        onOpenDoorTerminal={() => setDoorTerminalOpen(true)}
        onOpenAirportDeparture={() => void openTravel('air')}
        onOpenRailStation={() => void openTravel('rail')}
        transitHubs={session.transitHubs}
        onHailTaxi={handleHailTaxi}
        onOpenClothingStore={() => setClothingStoreOpen(true)}
        onOpenFurnitureShop={() => setFurnitureShopOpen(true)}
        onOpenBank={(atmId) => { setBankAtm(atmId); setBankOpen(true); }}
        travelRequest={travelRequest}
        onEnterGuestRoom={handleEnterGuestRoom}
        onOpenCloset={() => { setAvatarStudioMode('closet'); setAvatarModalOpen(true); }}
        onOpenBathroomMirror={() => { setAvatarStudioMode('mirror'); setAvatarModalOpen(true); }}
        onOpenSalon={() => { setAvatarStudioMode('salon'); setAvatarModalOpen(true); }}
        onOpenElevator={() => setElevatorModalOpen(true)}
        onUnlockRoomDoor={handleUnlockRoomDoor}
        onUnlockHallwayDoor={handleUnlockHallwayDoor}
        onEnterSuiteFromHallway={handleEnterSuiteFromHallway}
        onRingDoorbell={handleRingDoorbell}
        graphicsQuality={settings.graphics.quality}
      />
      </Suspense>

      {/* Functional aiming reticle when pointer-locked in Third-Person */}
      {viewMode === 'play' && pointerLocked && (
        <div className="fixed inset-0 pointer-events-none z-20 flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-[#39ff14] shadow-sm ring-2 ring-black/60" />
        </div>
      )}

      {/* Unified gameplay interface: minimal top HUD, thumb controls,
          contextual actions and build tools. */}
      <GameInterface
        device={device}
        viewMode={viewMode}
        portrait={isPortrait}
        menuOpen={menuOpen}
        chatOpen={session.chatOpen}
        editing={mode === 'edit'}
        riding={Boolean(session.riding)}
        nearbyLabel={proximityPrompt}
        locationTitle={locationTitle}
        locationSub={locationSub}
        presence={session.instance?.count ?? session.presenceOnline}
        connection={session.connection}
        online={session.status === 'online' || session.status === 'guest'}
        syncState={session.syncState}
        syncError={session.syncError}
        conflict={Boolean(conflict)}
        partyInvite={session.partyInvites.length > 0}
        voice={session.voice}
        layout={controls.touch}
        camera={{
          viewMode,
          closeZoom,
          followCharacter,
          canChangeView: device.desktop,
          onSetView: handleSetView,
          onToggleZoom: toggleCloseZoom,
          onToggleFollow: toggleFollowCharacter,
        }}
        emote={{ active: activeEmote, onEmote: triggerEmote }}
        build={mode === 'edit' ? buildController : null}
        hint={walkHint}
        npcChat={npcChat}
        onDismissNpc={() => setNpcChat(null)}
        onOpenMenu={openGameMenu}
        onOpenChat={handleToggleChat}
        onOpenPeople={() => openSocial('people')}
        onRetrySync={retryOnlineSave}
        onCycleRange={cycleRange}
        onRangeChange={session.setVoiceRange}
        onMicPress={() => {
          void session.pressMicrophone();
        }}
        onMicRelease={session.releaseMicrophone}
        onOpenVoiceSettings={() => {
          sfx.playClick();
          setRoomSettingsOpen(true);
        }}
        onInteract={() => {
          touchInput.interact = true;
        }}
        onJump={() => {
          touchInput.jump = true;
        }}
        fullscreen={fullscreen}
        onToggleFullscreen={toggleFullscreen}
      />

      {/* One consistent game menu: map, world, inventory, character, social,
          emotes, settings, controls and leaving the session. */}
      <GameMenu
        open={menuOpen}
        canChangeView={device.desktop}
        onClose={() => setMenuOpen(false)}
        location={location}
        world={activeWorld}
        suite={session.suite}
        roomName={roomName}
        items={items}
        avatar={avatarConfig}
        playerPoseRef={playerPoseRef}
        instance={
          session.instance
            ? {
                id: session.instance.id,
                kind: session.instance.kind,
                worldId: (session.instance as { worldId?: string | null }).worldId ?? null,
                count: session.instance.count,
                capacity: session.instance.capacity,
              }
            : null
        }
        players={remoteInThisScene.map((player) => ({
          handle: player.handle,
          displayName: '',
        }))}
        mode={mode}
        canEditRoom={canEditRoom}
        viewMode={viewMode}
        closeZoom={closeZoom}
        followCharacter={followCharacter}
        mood={mood}
        touch={controls.touch}
        syncing={controls.syncing}
        syncError={controls.syncError}
        conflict={Boolean(conflict)}
        deviceLabel={device.label}
        installed={device.installed}
        online={session.status === 'online'}
        guest={session.status === 'guest'}
        activeEmote={activeEmote}
        fullscreen={fullscreen}
        debug={hudDebug}
        onSetTouch={controls.setTouch}
        onResetTouch={controls.resetTouch}
        onSetMood={setMood}
        onSetView={handleSetView}
        onToggleZoom={toggleCloseZoom}
        onToggleFollow={toggleFollowCharacter}
        onLeaveWorld={handleLeaveWorldConfirmed}
        onEditRoom={() => handleModeSwitch('edit')}
        onOpenCityMap={() => setCityMapOpen(true)}
        onOpenRoomSettings={() => setRoomSettingsOpen(true)}
        onOpenAvatar={() => { setAvatarStudioMode('studio'); setAvatarModalOpen(true); }}
        onOpenShop={() => setShopOpen(true)}
        onOpenBank={() => { setBankAtm(undefined); setBankOpen(true); }}
        onOpenWorlds={() => setWorldsOpen(true)}
        onOpenAuth={() => setAuthOpen(true)}
        onOpenControls={openWorldControls}
        onOpenWorldManage={openWorldManage}
        onOpenSocial={openSocial}
        onEmote={triggerEmote}
        onExitPlatform={
          onExitPlatform
            ? () => {
                if (activeWorld) {
                  void handleLeaveWorldConfirmed().then(() => onExitPlatform());
                } else {
                  onExitPlatform();
                }
              }
            : undefined
        }
        onRequestFullscreen={toggleFullscreen}
        onRetrySync={retryOnlineSave}
      />

      {/* Social sheet: chat, people, friends, party, shop and worlds. */}
      <SocialPanel
        open={session.chatOpen && !menuOpen}
        onClose={() => session.setChatOpen(false)}
        onEnterWorld={handleEnterWorld}
        gameplayAllowed={gameplayAllowed}
        intent={socialIntent}
      />

      <ShopModal
        open={shopOpen}
        onClose={() => setShopOpen(false)}
        readOnly={session.status === 'guest'}
      />
      <BankModal
        open={bankOpen && session.status !== 'guest'}
        onClose={() => setBankOpen(false)}
        atmId={bankAtm}
      />
      <WorldsModal
        open={worldsOpen && session.status !== 'guest'}
        onClose={() => setWorldsOpen(false)}
        onEnter={(worldId) => {
          setWorldsOpen(false);
          void handleEnterWorld(worldId);
        }}
        onOpenStudio={(worldId) => {
          setWorldsOpen(false);
          setStudioWorldId(worldId);
        }}
        gameplayAllowed={gameplayAllowed}
      />

      {studioWorldId && (
        <WorldStudio
          worldId={studioWorldId}
          onClose={() => setStudioWorldId(null)}
          onWorldChanged={() => {
            if (activeWorld?.id === studioWorldId) {
              void api.world(studioWorldId).then(handleWorldUpdated).catch(() => undefined);
            }
          }}
        />
      )}

      {/* Unsupported runtimes see the dashboard + loft manager only. */}
      {!gameplayAllowed && <PlatformNotice platformLabel={device.label} />}

      {/* Device vs account suite: nothing moves until the player chooses */}
      {conflict && (
        <SyncConflictModal
          open={conflictOpen}
          device={{
            roomName: conflict.device.roomName,
            itemCount: conflict.device.items.length,
            avatarName: conflict.device.avatar.name,
            moodLabel: conflict.device.mood,
          }}
          account={{
            roomName: conflict.account.roomName,
            itemCount: conflict.account.items.length,
            avatarName: conflict.account.avatar.name,
            moodLabel: conflict.account.mood,
          }}
          onKeepDevice={keepDeviceSuite}
          onUseAccount={useAccountSuite}
          onDecideLater={() => setConflictOpen(false)}
        />
      )}

      {/* Sign in / create the account that turns the local character online */}
      {authOpen && <AuthGate onClose={() => setAuthOpen(false)} />}

      {/* Room Settings: Walk / Edit live in its Controls section */}
      <RoomSettingsModal
        open={roomSettingsOpen}
        roomName={roomName}
        itemCount={items.length}
        mode={mode}
        canEdit={canEditRoom}
        touchDevice={touchDevice}
        gameplayAllowed={gameplayAllowed}
        platformLabel={device.label}
        voice={session.voice}
        onEnableVoice={session.enableVoice}
        onDisableVoice={session.disableVoice}
        onCycleVoiceRange={cycleRange}
        onVoiceRangeChange={session.setVoiceRange}
        onMicModeChange={session.setMicMode}
        onVoiceSensitivityChange={session.setVoiceSensitivity}
        onVoiceInputDeviceChange={session.setVoiceInputDevice}
        getVoiceLevel={session.getVoiceLevel}
        onVoicePermissionHint={showHint}
        onEnterEdit={() => {
          setRoomSettingsOpen(false);
          handleModeSwitch('edit');
        }}
        onExitEdit={() => {
          setRoomSettingsOpen(false);
          handleModeSwitch('walk');
        }}
        onClose={() => setRoomSettingsOpen(false)}
      />

      {/* Avatar Character Studio Modal */}
      <AvatarModal
        open={avatarModalOpen}
        mode={avatarStudioMode}
        config={avatarConfig}
        wallet={session.wallet}
        ownedClothing={session.inventory
          .filter((entry) => entry.kind === 'clothing')
          .map((entry) => entry.catalogId)}
        outfits={session.status === 'online' ? session.outfits : localOutfits}
        onApply={(next) => setAvatarConfig(next)}
        onMakeover={async (next) => {
          const result = await session.makeover(next);
          setAvatarConfig(result.profile.avatar);
          showHint(
            result.charged > 0
              ? `Character Makeover complete · 元 ${result.charged} spent`
              : 'Character appearance is already up to date'
          );
        }}
        onSaveOutfit={async (name, avatar) => {
          const config = {
            topStyle: avatar.topStyle,
            topColor: avatar.topColor,
            bottomStyle: avatar.bottomStyle ?? 'jeans',
            bottomColor: avatar.bottomColor,
            shoeColor: avatar.shoeColor,
            accessory: avatar.accessory,
            jewelry: avatar.jewelry ?? 'none',
            carry: avatar.carry ?? 'none',
          } as const;
          if (session.status === 'online') {
            await session.saveOutfit(name, config);
            return;
          }
          const saved: SavedOutfit = {
            id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name,
            config,
            createdAt: Date.now(),
          };
          setLocalOutfits((current) => {
            const next = [saved, ...current];
            try { localStorage.setItem('loftlife_outfits_local_v2', JSON.stringify(next)); } catch { /* device storage is optional */ }
            return next;
          });
        }}
        onDeleteOutfit={async (id) => {
          if (session.status === 'online') {
            await session.deleteOutfit(id);
            return;
          }
          setLocalOutfits((current) => {
            const next = current.filter((outfit) => outfit.id !== id);
            try { localStorage.setItem('loftlife_outfits_local_v2', JSON.stringify(next)); } catch { /* device storage is optional */ }
            return next;
          });
        }}
        onClose={() => setAvatarModalOpen(false)}
      />

      {/* A-Z Diagonal x 1st-30th Horizontal City Grid Map */}
      <CityMapModal
        open={cityMapOpen}
        currentStreet={cityStreet}
        location={location}
        playerPoseRef={playerPoseRef}
        onTravel={(target) => {
          setTravelRequest({ ...target, at: Date.now() });
          setCityMapOpen(false);
        }}
        onClose={() => setCityMapOpen(false)}
      />

      {/* Central M menu: map, world info, management, leave and controls. */}
      <WorldMenu
        open={worldMenuOpen}
        onClose={() => setWorldMenuOpen(false)}
        initialTab={worldMenuTab}
        location={location}
        guestMode={session.status === 'guest'}
        world={activeWorld}
        suite={session.suite}
        roomName={roomName}
        items={items}
        userHandle={session.profile?.handle ?? session.user?.handle ?? avatarConfig.name}
        userRole={session.user?.role ?? 'player'}
        viewMode={viewMode}
        closeZoom={closeZoom}
        followCharacter={followCharacter}
        playerPoseRef={playerPoseRef}
        instance={
          session.instance
            ? {
                id: session.instance.id,
                kind: session.instance.kind,
                worldId: (session.instance as { worldId?: string | null }).worldId ?? null,
                count: session.instance.count,
                capacity: session.instance.capacity,
              }
            : null
        }
        players={remoteInThisScene.map((player) => ({
          handle: player.handle,
          displayName: '',
        }))}
        bindings={controls.bindings}
        touch={controls.touch}
        syncing={controls.syncing}
        syncError={controls.syncError}
        onSetBinding={controls.setBinding}
        onResetBinding={controls.resetOne}
        onResetAllBindings={controls.resetAll}
        onSetTouch={controls.setTouch}
        onResetTouch={controls.resetTouch}
        onWorldUpdated={handleWorldUpdated}
        onLeaveWorld={handleLeaveWorldConfirmed}
        onOpenCityMap={() => setCityMapOpen(true)}
        onEditRoom={() => handleModeSwitch('edit')}
      />

      {/* Hotel Main Door Keycard & Up/Down Active Resident Ring Terminal */}
      {doorbellOutgoing && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-40 pointer-events-auto rounded-xl bg-[#0b100d]/95 border border-[#39ff14]/45 px-4 py-2.5 flex items-center gap-3 text-xs text-slate-100 shadow-lg">
          <span className="w-2 h-2 rounded-full bg-[#39ff14] animate-pulse" />
          <span>Ringing Suite {doorbellOutgoing.roomNumber}… waiting for the owner</span>
          <button
            type="button"
            onClick={() => {
              if (doorbellOutgoing.requestId) session.cancelDoorbell(doorbellOutgoing.requestId);
              setDoorbellOutgoing(null);
              showHint('Doorbell cancelled.');
            }}
            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 font-semibold"
          >
            Cancel
          </button>
        </div>
      )}

      <HotelDoorbellModal request={doorbellRequest} onAnswer={handleAnswerDoorbell} />

      <HotelDoorTerminalModal
        open={doorTerminalOpen}
        playerName={avatarConfig.name}
        playerSuiteNumber={playerSuiteNumber}
        playerSuiteFloor={playerSuiteFloor}
        mainDoorUnlocked={mainDoorUnlocked}
        onUnlockWithKeycard={handleUnlockMainWithKeycard}
        onClose={() => setDoorTerminalOpen(false)}
      />

      <TravelModal
        open={travelMode !== null}
        mode={travelMode ?? 'air'}
        destinations={travelDestinations}
        loading={travelLoading}
        error={travelError}
        guest={session.status === 'guest'}
        onStart={handleStartJourney}
        onClose={() => setTravelMode(null)}
      />

      <TaxiDestinationModal
        open={session.taxiTrip?.state === 'waiting'}
        destinations={session.taxiTrip?.destinations ?? []}
        onChoose={session.chooseTaxiDestination}
        onCancelRide={handleExitTransit}
      />
      <ShopModal open={clothingStoreOpen} onClose={() => setClothingStoreOpen(false)} initialTab="clothing" readOnly={session.status === 'guest'} />
      <ShopModal open={furnitureShopOpen} onClose={() => setFurnitureShopOpen(false)} initialTab="furniture" readOnly={session.status === 'guest'} />

      {/* Hotel Brass Elevator Floor Selector */}
      <ElevatorPanelModal
        open={elevatorModalOpen}
        currentLocation={location}
        currentFloor={hallwayFloor}
        playerSuiteFloor={playerSuiteFloor}
        playerSuiteNumber={playerSuiteNumber}
        playerName={avatarConfig.name}
        targetVisitResident={targetVisitResident}
        onArriveFloor={handleArriveFloor}
        onClose={() => setElevatorModalOpen(false)}
      />

      {activeJourney && (
        <TravelTransition
          open
          mode={activeJourney.mode}
          label={activeJourney.destination.label}
          detail={
            activeJourney.mode === 'rail'
              ? 'Platform 1 · Intercity departure'
              : 'Gate boarding · Cabin secured'
          }
          phase={activeJourney.phase}
          startedAt={activeJourney.startedAt}
          arriveAt={activeJourney.arriveAt}
          onCancel={activeJourney.phase === 'boarding' ? session.cancelJourney : undefined}
        />
      )}

      {elevatorTransition && (
        <TravelTransition
          open
          mode="elevator"
          label={elevatorTransition.label}
          detail={elevatorTransition.detail}
          phase="enroute"
          startedAt={elevatorTransition.startedAt}
          arriveAt={elevatorTransition.arriveAt}
        />
      )}

      {sceneTransition && (
        <TravelTransition
          open
          mode={sceneTransition.mode}
          label={sceneTransition.label}
          detail={sceneTransition.detail}
          phase="arrived"
          startedAt={sceneTransition.startedAt}
          arriveAt={sceneTransition.arriveAt}
        />
      )}
    </div>
  );
}
