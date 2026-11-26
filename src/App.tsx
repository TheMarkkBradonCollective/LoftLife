import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Armchair,
  BedDouble,
  BookOpen,
  Camera,
  ChevronDown,
  ChevronUp,
  Cloud,
  CloudOff,
  Coffee,
  Copy,
  DoorOpen,
  Eraser,
  Eye,
  Flame,
  Frame,
  Gamepad2,
  Hand,
  HardDrive,
  Home,
  ArrowUp,
  LampDesk,
  LampFloor,
  Layers,
  Loader2,
  LogIn,
  LogOut,
  Map as MapIcon,
  MessageCircle,
  Monitor,
  Move,
  Music,
  Paintbrush,
  PencilRuler,
  RotateCw,
  Settings,
  Sofa,
  Sparkles,
  Sprout,
  Sun,
  Sunset,
  Moon,
  Trash2,
  Trees,
  Tv,
  Undo2,
  User,
  Utensils,
  Volume2,
  VolumeX,
  Footprints,
  X,
} from 'lucide-react';
import { AuthGate } from './components/AuthGate';
import { AvatarModal } from './components/AvatarModal';
import { CityMapModal } from './components/CityMapModal';
import { ElevatorPanelModal } from './components/ElevatorPanelModal';
import { HotelDoorTerminalModal } from './components/HotelDoorTerminalModal';
import { AirportTravelModal } from './components/AirportTravelModal';
import { ShopModal } from './components/ShopModal';
import { RoomSettingsModal } from './components/RoomSettingsModal';
import { SyncConflictModal } from './components/SyncConflictModal';
import { SocialHud } from './components/SocialHud';
import { PlatformNotice } from './components/PlatformNotice';
import { WorldMenu } from './components/WorldMenu';
import { TouchControls } from './components/TouchControls';
import { useDeviceEnvironment } from './game/platform';
import { MOBILE_GAMEPLAY_MESSAGE } from '../shared/device-platform.mjs';

// Three.js is only needed once the world renders; lazy-loading keeps the
// sign-in wall light.
const RoomViewport = lazy(() =>
  import('./components/RoomViewport').then((module) => ({ default: module.RoomViewport }))
);
import { api, type WorldSummary } from './net/api';
import { MIC_MODE_INFO, VOICE_RANGE_INFO } from '../shared/voice-controls.mjs';
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
  FLOOR_STYLES,
  FURNITURE_CATALOG,
  getCatalogItem,
  GRID_SIZE,
  HOTEL_RESIDENTS,
  PLAYER_SUITE_FLOOR,
  PLAYER_SUITE_NUMBER,
  ROOM_PRESETS,
  WALL_STYLES,
} from './game/catalog';
import { getEffectiveSize, isValidPlacement, SNAP_STEP, snapGrid } from './game/gridMath';
import type {
  ActiveResident,
  AvatarConfig,
  EmoteType,
  FloorStyleId,
  FurnitureCategory,
  GameMode,
  LightingMood,
  PlacedItem,
  RoomSurfaceConfig,
  ViewMode,
  WallStyleId,
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

function getCategoryIcon(catalogId: string) {
  switch (catalogId) {
    case 'plush_sofa':
    case 'sectional_sofa':
      return <Sofa className="w-4 h-4" />;
    case 'lounge_chair':
    case 'bar_stool':
      return <Armchair className="w-4 h-4" />;
    case 'cozy_bed':
      return <BedDouble className="w-4 h-4" />;
    case 'dining_set':
      return <Utensils className="w-4 h-4" />;
    case 'espresso_bar':
      return <Coffee className="w-4 h-4" />;
    case 'dual_desk':
      return <Monitor className="w-4 h-4" />;
    case 'coffee_table':
    case 'side_desk':
      return <Layers className="w-4 h-4" />;
    case 'record_console':
      return <Music className="w-4 h-4" />;
    case 'media_tv':
      return <Tv className="w-4 h-4" />;
    case 'fireplace':
      return <Flame className="w-4 h-4" />;
    case 'bookshelf':
      return <BookOpen className="w-4 h-4" />;
    case 'arc_lamp':
      return <LampFloor className="w-4 h-4" />;
    case 'table_lamp':
      return <LampDesk className="w-4 h-4" />;
    case 'monstera_plant':
      return <Sprout className="w-4 h-4" />;
    case 'olive_tree':
      return <Trees className="w-4 h-4" />;
    case 'woven_rug':
      return <Layers className="w-4 h-4" />;
    case 'neon_sign':
      return <Sparkles className="w-4 h-4" />;
    case 'wall_art':
    case 'wall_shelf':
    case 'floor_mirror':
      return <Frame className="w-4 h-4" />;
    default:
      return <Sofa className="w-4 h-4" />;
  }
}

const CATEGORY_TABS: { id: 'all' | FurnitureCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'seating', label: 'Seating' },
  { id: 'tables', label: 'Tables' },
  { id: 'living', label: 'Living' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'plants_rugs', label: 'Plants & Rugs' },
  { id: 'wall', label: 'Wall' },
];

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
      return { ...saved, avatar: { ...saved.avatar, name: `Guest · ${session.guestName}` } };
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
  const [elevatorModalOpen, setElevatorModalOpen] = useState(false);
  const [airportDepartureOpen, setAirportDepartureOpen] = useState(false);
  const [airportShopOpen, setAirportShopOpen] = useState(false);
  const [avatarStudioMode, setAvatarStudioMode] = useState<'hair' | 'closet'>('hair');

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
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    mobileRuntime ? (readPortraitOrientation() ? 'isometric' : 'play') : 'isometric'
  );
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
  const [muted, setMuted] = useState(false);
  // Z toggles the camera distance only: close avatar view vs wide room view.
  const [closeZoom, setCloseZoom] = useState(false);
  // F toggles Follow Character in Isometric Mode; Play View always follows.
  const [followCharacter, setFollowCharacter] = useState(true);
  const playerPoseRef = useRef({ x: 0, z: 0, yaw: 0 });

  // Dev-only probe so each runtime can be exercised without guessing from CSS.
  useEffect(() => {
    if (!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) return;
    (window as unknown as Record<string, unknown>).__loftlife_env = device;
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

  // Phones and tablets derive the camera from orientation. Editing pins
  // isometric so taps land on the grid, and rotating back restores the
  // orientation view. A desktop touchscreen keeps its chosen camera mode.
  useEffect(() => {
    if (!mobileRuntime || mode === 'edit') return;
    setViewMode(isPortrait ? 'isometric' : 'play');
  }, [mobileRuntime, isPortrait, mode]);

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

  const handleUnlockMainFromResident = useCallback(
    (resident: ActiveResident) => {
      if (session.status === 'guest') { showHint('Guest visits do not include shared hotel rooms.'); return; }
      setMainDoorUnlocked(true);
      setTargetVisitResident(resident);
      setUnlockedRooms((prev) =>
        prev.includes(resident.roomNumber) ? prev : [...prev, resident.roomNumber]
      );
      window.setTimeout(() => {
        setDoorTerminalOpen(false);
        showHint(
          `Approved by ${resident.name}! Walk into Main Lobby → Elevator → Floor ${resident.floor} → Suite ${resident.roomNumber}`
        );
        showNpcChat(
          resident.name,
          `I buzzed the lobby door open! Come up the elevator to Floor ${resident.floor}, Suite ${resident.roomNumber}.`
        );
      }, 650);
    },
    [showHint, showNpcChat]
  );

  const handleArriveFloor = useCallback(
    (floor: 'L' | number) => {
      if (!gameplayAllowed) {
        setElevatorModalOpen(false);
        showHint(MOBILE_GAMEPLAY_MESSAGE);
        return;
      }
      setElevatorModalOpen(false);
      if (floor === 'L') {
        handleChangeLocation('lobby');
      } else {
        setHallwayFloor(floor);
        setLocation('hallway');
        setActiveResident(null);
        setMode('walk');
        showHint(`Arrived on Floor ${floor} · Walk down the hallway to Suites ${floor}01–${floor}10`);
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
        showHint('Play View · WASD move · drag to look · Z close/wide');
      } else {
        showHint('Isometric View · click to walk · WASD pans · F follow · Z zoom');
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

  // Keyboard shortcuts (R to rotate, Esc to cancel, Delete to remove, H to toggle dock, V Play View, M City Map)
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
    const lateral = seat % 2 === 0 ? -0.62 : 0.62;
    const along = 1.35 - Math.floor(seat / 2) * 1.25;
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

  const handleExitTransit = useCallback(() => {
    session.exitTransit();
  }, [session]);

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
      showHint('Play View always follows · V switches to Isometric for camera-free mode');
      return;
    }
    sfx.playClick();
    const next = !followCharacter;
    setFollowCharacter(next);
    showHint(
      next
        ? 'Following your avatar · WASD pans temporarily, F stops following'
        : 'Camera free · WASD pans freely, F follows your avatar again'
    );
  }, [followCharacter, showHint, viewMode]);

  const filteredCatalog = useMemo(() => {
    if (categoryFilter === 'all') return FURNITURE_CATALOG;
    return FURNITURE_CATALOG.filter((item) => item.category === categoryFilter);
  }, [categoryFilter]);

  const placingCatalogItem = useMemo(
    () => (placingCatalogId ? getCatalogItem(placingCatalogId) ?? null : null),
    [placingCatalogId]
  );

  const hudPanelClass =
    'bg-[#0b100d]/95 text-slate-100 border-[#39ff14]/30 neon-panel-glow';

  const canEditRoom = location === 'room' && (!activeWorld || activeWorld.canEdit);

  const anyModalOpen =
    avatarModalOpen ||
    cityMapOpen ||
    doorTerminalOpen ||
    elevatorModalOpen ||
    airportDepartureOpen ||
    airportShopOpen ||
    roomSettingsOpen ||
    authOpen ||
    menuOpen ||
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
    : location === 'lobby'
    ? 'Hotel Lobby'
    : location === 'hallway'
    ? `Floor ${hallwayFloor} Hallway`
    : location === 'resident_room' && activeResident
    ? `${activeResident.name}'s Suite ${activeResident.roomNumber}`
    : `Suite ${playerSuiteNumber} · ${roomName}`;

  const locationSub = activeWorld
    ? `Player world · ${items.length} items · ${session.presenceOnline} online`
    : location === 'world'
    ? cityStreet
    : location === 'lobby'
    ? 'Floor 1 · Concierge & Elevator'
    : location === 'hallway'
    ? `Suites ${hallwayFloor}01–${hallwayFloor}04`
    : location === 'resident_room' && activeResident
    ? `Floor ${activeResident.floor} · Guest Visit`
    : `Floor ${playerSuiteFloor} · ${items.length} items`;

  // Only show players who are actually in this scene (and, for player worlds,
  // in the same world instance).
  const remoteInThisScene = useMemo(() => {
    if (session.status !== 'online') return [];
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
        modalOpen={anyModalOpen}
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
        onOpenAirportDeparture={() => setAirportDepartureOpen(true)}
        onOpenAirportShop={() => setAirportShopOpen(true)}
        onEnterGuestRoom={handleEnterGuestRoom}
        onOpenCloset={() => { setAvatarStudioMode('closet'); setAvatarModalOpen(true); }}
        onOpenBathroomMirror={() => { setAvatarStudioMode('hair'); setAvatarModalOpen(true); }}
        onOpenElevator={() => setElevatorModalOpen(true)}
        onUnlockRoomDoor={handleUnlockRoomDoor}
        onUnlockHallwayDoor={handleUnlockHallwayDoor}
        onEnterSuiteFromHallway={handleEnterSuiteFromHallway}
        graphicsQuality={settings.graphics.quality}
      />
      </Suspense>

      {/* Functional Aiming Reticle when Pointer-Locked in Play View */}
      {viewMode === 'play' && pointerLocked && (
        <div className="fixed inset-0 pointer-events-none z-20 flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-[#39ff14] shadow-sm ring-2 ring-black/60" />
        </div>
      )}

      {/* Top-Left Brand & Hotel / City Summary */}
      <div className="fixed top-4 left-4 z-20 pointer-events-auto max-w-[calc(100vw-2rem)]">
        <div
          className={`px-4 py-2.5 rounded-xl border flex items-center gap-3 min-w-0 ${hudPanelClass}`}
        >
          <span className="font-display text-base font-bold tracking-tight text-[#39ff14] whitespace-nowrap shrink-0">
            LoftLife
          </span>
          <span className="text-xs text-[#39ff14]/45" aria-hidden="true">
            |
          </span>
          <div className="flex items-center gap-2 text-xs text-slate-200 min-w-0 whitespace-nowrap">
            <span className="font-medium text-white truncate max-w-[42vw] sm:max-w-none">
              {locationTitle}
            </span>
            <span className="hidden lg:inline text-[#39ff14]/60" aria-hidden="true">
              ·
            </span>
            <span className="hidden lg:inline font-mono-tabular text-slate-300 truncate">
              {locationSub}
            </span>
          </div>
        </div>
      </div>

      {/* Top-Right Compact Mode & Utility Bar */}
      <div
        className={`fixed top-[4.5rem] sm:top-4 right-3 sm:right-4 z-20 max-w-[calc(100vw-1.5rem)] sm:max-w-[calc(100vw-27rem)] flex items-center gap-2 pointer-events-auto ${
          touchDevice
            ? 'flex-nowrap justify-start overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_button]:min-h-10 [&_button]:min-w-10'
            : 'flex-wrap justify-end'
        }`}
      >
        {onExitPlatform && (
          <button
            type="button"
            onClick={() => {
              // A player-built world has its own save-confirm path; finish it
              // before the platform takes over so edits are not discarded.
              if (activeWorld) {
                void handleLeaveWorldConfirmed().then(() => onExitPlatform?.());
              } else {
                onExitPlatform?.();
              }
            }}
            title="Leave this destination and return to the LoftLife platform"
            aria-label="Exit to LoftLife"
            className="px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 bg-[#0b100d]/95 text-slate-200 border-white/15 hover:bg-[#131d17]"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Exit to LoftLife</span>
          </button>
        )}

        {/* Offline is the default; this is the door to the shared world. */}
        {session.status !== 'online' && (
          <button
            type="button"
            onClick={() => {
              sfx.playClick();
              setAuthOpen(true);
            }}
            className="px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 bg-[#111914] text-[#39ff14] border-[#39ff14]/45 hover:bg-[#19261d]"
          >
            <LogIn className="w-3.5 h-3.5" />
            Play online
          </button>
        )}

        {/* Persistence status: local-only, uploading, synced, or waiting on a choice. */}
        {conflict ? (
          <button
            type="button"
            onClick={() => setConflictOpen(true)}
            title="Your device suite differs from your account"
            className="px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 bg-amber-400/15 text-amber-300 border-amber-400/45 hover:bg-amber-400/25"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Sync paused
          </button>
        ) : session.status !== 'online' ? (
          <span
            title="Character and suite are saved in this browser"
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 ${hudPanelClass}`}
          >
            <HardDrive className="w-3.5 h-3.5 text-[#39ff14]" />
            Local
          </span>
        ) : session.syncState === 'error' ? (
          <button
            type="button"
            onClick={retryOnlineSave}
            title={session.syncError ?? 'Saving to your account failed'}
            className="px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 bg-red-500/15 text-red-200 border-red-500/40 hover:bg-red-500/25"
          >
            <CloudOff className="w-3.5 h-3.5" />
            Not saved
          </button>
        ) : (
          <span
            title="Character and suite are saved to your account"
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 ${hudPanelClass}`}
          >
            {session.syncState === 'saving' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#39ff14]" />
            ) : (
              <Cloud className="w-3.5 h-3.5 text-[#39ff14]" />
            )}
            {session.syncState === 'saving'
              ? 'Saving…'
              : session.syncState === 'synced'
              ? 'Synced'
              : 'Connected'}
          </span>
        )}

        {/* Desktop entry point; the APK uses its touch Map button. */}
        {gameplayAllowed && device.desktop && !touchDevice && (
          <button
            type="button"
            onClick={() => {
              sfx.playClick();
              setMenuOpen(true);
            }}
            aria-label="Map and world menu"
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${hudPanelClass}`}
          >
            <MapIcon className="w-3.5 h-3.5 text-[#39ff14]" />
            Map &amp; World <span className="text-[10px] text-slate-400">(M)</span>
          </button>
        )}

        {/* Camera switcher is desktop-only: phones derive the view from orientation. */}
        {device.desktop && !touchDevice && (
          <div className={`p-1 rounded-xl border flex items-center gap-1 ${hudPanelClass}`}>
            <button
              type="button"
              onClick={() => {
                if (viewMode !== 'isometric') handleTogglePlayView();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'isometric'
                  ? 'bg-[#39ff14] text-[#051205]'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Isometric
            </button>
            <button
              type="button"
              onClick={() => {
                if (viewMode !== 'play') handleTogglePlayView();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                viewMode === 'play'
                  ? 'bg-[#39ff14] text-[#051205]'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <Gamepad2 className="w-3.5 h-3.5" />
              Play View
            </button>
          </div>
        )}

        {/* Lighting Mood Selector */}
        <div className={`p-1 rounded-xl border flex items-center gap-0.5 ${hudPanelClass}`}>
          {(
            [
              { id: 'morning', label: 'Morning', icon: <Sun className="w-3.5 h-3.5" /> },
              { id: 'golden', label: 'Golden Hour', icon: <Sunset className="w-3.5 h-3.5" /> },
              { id: 'night', label: 'Night', icon: <Moon className="w-3.5 h-3.5" /> },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              title={m.label}
              aria-label={`Set lighting to ${m.label}`}
              onClick={() => {
                sfx.playClick();
                setMood(m.id);
              }}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                mood === m.id
                  ? 'bg-[#39ff14] text-[#051205]'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              {m.icon}
            </button>
          ))}
        </div>

        {/* Owners get one tap into furnishing; visitors never see this. */}
        {canEditRoom && mode === 'walk' && (
          <button
            type="button"
            onClick={() => {
              sfx.playClick();
              handleModeSwitch('edit');
            }}
            aria-label="Edit suite"
            title="Edit this suite's furniture and finishes"
            className="px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 bg-[#39ff14] text-[#051205] border-[#39ff14] hover:bg-[#5bff3b] neon-btn-glow"
          >
            <PencilRuler className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Edit suite</span>
          </button>
        )}

        {/* Camera & Avatar & Sound */}
        <div className={`p-1 rounded-xl border flex items-center gap-1 ${hudPanelClass}`}>
          <button
            type="button"
            title="Room settings · Walk, Edit and controls"
            aria-label="Room settings"
            aria-expanded={roomSettingsOpen}
            onClick={() => {
              sfx.playClick();
              setRoomSettingsOpen((v) => !v);
            }}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              roomSettingsOpen
                ? 'bg-[#39ff14] text-[#051205]'
                : 'text-slate-300 hover:bg-white/10 hover:text-[#39ff14]'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              sfx.playClick();
              setAvatarModalOpen((v) => !v);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              avatarModalOpen
                ? 'bg-[#39ff14] text-[#051205]'
                : 'text-slate-200 hover:bg-white/10'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Avatar</span>
          </button>

          {!touchDevice && (
            <button
              type="button"
              title={closeZoom ? 'Wide room view (Z)' : 'Close avatar view (Z)'}
              aria-label={closeZoom ? 'Wide room view' : 'Close avatar view'}
              aria-pressed={closeZoom}
              onClick={toggleCloseZoom}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                closeZoom
                  ? 'bg-[#39ff14] text-[#051205]'
                  : 'text-slate-300 hover:bg-white/10 hover:text-[#39ff14]'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            title={muted ? 'Unmute Sound' : 'Mute Sound'}
            aria-label={muted ? 'Unmute Sound' : 'Mute Sound'}
            onClick={() => {
              const next = !muted;
              sfx.muted = next;
              setMuted(next);
              if (!next) sfx.playClick();
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-slate-300 hover:bg-white/10 hover:text-[#39ff14]"
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Transient Walk / Action Hint Banner */}
      {walkHint && (
        <div className="fixed top-[11.75rem] sm:top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none max-w-[92vw]">
          <div className={`px-3.5 py-1.5 rounded-lg border text-xs font-medium text-[#d8ffd0] ${hudPanelClass}`}>
            {walkHint}
          </div>
        </div>
      )}

      {/* Proximity Action Prompt (Isometric Walk & Play View) */}
      {proximityPrompt && !anyModalOpen && (
        <div className="fixed bottom-52 sm:bottom-28 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div className="px-4 py-2 rounded-xl bg-[#39ff14] text-[#051205] font-bold text-xs border border-[#8eff78] neon-btn-glow">
            {proximityPrompt}
          </div>
        </div>
      )}

      {/* NPC Dialogue Toast */}
      {npcChat && (
        <div className="fixed bottom-52 sm:bottom-24 left-1/2 -translate-x-1/2 z-30 w-[min(460px,90vw)] pointer-events-auto">
          <div className={`px-4 py-3 rounded-xl border flex items-start justify-between gap-3 ${hudPanelClass}`}>
            <div className="flex items-start gap-2.5">
              <MessageCircle className="w-4 h-4 mt-0.5 text-[#39ff14] shrink-0" />
              <div className="text-xs leading-relaxed">
                <span className="font-semibold text-[#39ff14] mr-1.5">{npcChat.speaker}:</span>
                <span className="text-slate-200">{npcChat.message}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setNpcChat(null)}
              aria-label="Dismiss dialogue"
              className="p-1 rounded-md opacity-60 hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Collapsible Unified Bottom Control Dock */}
      <div
        className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-30 w-[min(940px,95vw)] flex flex-col items-center transition-transform duration-200 ease-out ${
          dockCollapsed ? 'translate-y-[calc(100%-34px)]' : 'translate-y-0'
        }`}
      >
        {/* Contextual Selected-Item / Active-Placement Bar in Edit Mode */}
        {!dockCollapsed && mode === 'edit' && (placingCatalogItem || movingUid) && (
          <div
            className={`mb-2 w-full max-w-2xl px-4 py-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${hudPanelClass}`}
          >
            <div className="flex items-center gap-2.5 text-xs">
              <span className="font-semibold">
                {movingUid
                  ? `Moving ${getCatalogItem(items.find((i) => i.uid === movingUid)?.catalogId || '')?.name}`
                  : `Placing ${placingCatalogItem?.name}`}
              </span>
              <span className="opacity-45" aria-hidden="true">
                ·
              </span>
              <span className="opacity-75">
                {placingCatalogItem?.layer === 'wall'
                  ? 'Click any wall (N, S, E or W)'
                  : 'Click floor tile to place'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {placingCatalogItem && placingCatalogItem.colors.length > 0 && (
                <div className="flex items-center gap-1 pr-2 border-r border-current/15">
                  {placingCatalogItem.colors.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      title={c.label}
                      onClick={() => {
                        sfx.playClick();
                        setPlacingColor(c.hex);
                      }}
                      className={`w-5 h-5 rounded-full border transition-transform ${
                        placingColor === c.hex
                          ? 'border-[#39ff14] scale-115 ring-2 ring-[#39ff14]/40'
                          : 'border-white/20 hover:scale-105'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
              )}

              {(placingCatalogItem?.layer !== 'wall' || movingUid) && (
                <button
                  type="button"
                  onClick={rotateSelectedOrPlacing}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#39ff14] text-[#051205] hover:bg-[#5bff3b] flex items-center gap-1 whitespace-nowrap"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  Rotate (R)
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  sfx.playClick();
                  setPlacingCatalogId(null);
                  setMovingUid(null);
                }}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 whitespace-nowrap bg-white/10 hover:bg-white/20 text-slate-200"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            </div>
          </div>
        )}

        {!dockCollapsed &&
          mode === 'edit' &&
          !placingCatalogItem &&
          !movingUid &&
          selectedItem &&
          selectedCatalog && (
            <div
              className={`mb-2 w-full max-w-3xl px-4 py-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${hudPanelClass}`}
            >
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-white">{selectedCatalog.name}</span>
                <span className="opacity-40" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono-tabular text-[#39ff14]">
                  {selectedCatalog.size[0]}×{selectedCatalog.size[1]}m
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Live Recolor Swatches */}
                <div className="flex items-center gap-1 pr-2 border-r border-white/15">
                  {selectedCatalog.colors.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      title={c.label}
                      onClick={() => handleRecolorSelected(c.hex)}
                      className={`w-5 h-5 rounded-full border transition-transform ${
                        selectedItem.color === c.hex
                          ? 'border-[#39ff14] scale-115 ring-2 ring-[#39ff14]/40'
                          : 'border-white/20 hover:scale-105'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleStartMoveSelected}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 whitespace-nowrap bg-white/10 hover:bg-white/20 text-slate-100"
                >
                  <Move className="w-3.5 h-3.5" />
                  Move
                </button>

                {selectedCatalog.layer !== 'wall' && (
                  <button
                    type="button"
                    onClick={rotateSelectedOrPlacing}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 whitespace-nowrap bg-white/10 hover:bg-white/20 text-slate-100"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    Rotate
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleDuplicateSelected}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 whitespace-nowrap bg-white/10 hover:bg-white/20 text-slate-100"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Duplicate
                </button>

                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-600 text-white hover:bg-red-700 flex items-center gap-1 whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            </div>
          )}

        {/* Collapse / Expand Handle */}
        <button
          type="button"
          onClick={() => setDockCollapsed((c) => !c)}
          className={`mb-1 px-3 py-1 rounded-lg border text-[11px] font-medium flex items-center gap-1 transition-colors ${hudPanelClass}`}
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              Show Controls
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              Hide Controls
            </>
          )}
        </button>

        {/* Main Dock Panel */}
        <div className={`w-full rounded-2xl border overflow-hidden ${hudPanelClass}`}>
          {mode === 'walk' ? (
            <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => triggerEmote('wave')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    activeEmote === 'wave'
                      ? 'bg-[#39ff14] text-[#051205]'
                      : 'bg-white/8 hover:bg-white/15 text-slate-100'
                  }`}
                >
                  <Hand className="w-3.5 h-3.5" />
                  Wave
                </button>
                <button
                  type="button"
                  onClick={() => triggerEmote('dance')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    activeEmote === 'dance'
                      ? 'bg-[#39ff14] text-[#051205]'
                      : 'bg-white/8 hover:bg-white/15 text-slate-100'
                  }`}
                >
                  <Music className="w-3.5 h-3.5" />
                  Dance
                </button>
                <button
                  type="button"
                  onClick={() => triggerEmote('cheer')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    activeEmote === 'cheer'
                      ? 'bg-[#39ff14] text-[#051205]'
                      : 'bg-white/8 hover:bg-white/15 text-slate-100'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Cheer
                </button>
                <button
                  type="button"
                  onClick={() => triggerEmote('jump')}
                  className="px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap bg-white/8 hover:bg-white/15 text-slate-100"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                  Jump
                </button>
                {activeEmote !== 'idle' && activeEmote !== 'walk' && (
                  <button
                    type="button"
                    onClick={() => setActiveEmote('idle')}
                    className="px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap text-slate-300 hover:bg-white/10"
                  >
                    Stand Still
                  </button>
                )}
              </div>

              <div className="text-xs opacity-70 flex items-center gap-2 whitespace-nowrap">
                {!gameplayAllowed ? (
                  <span>
                    Loft manager · this runtime is not supported for walking; manage your suite here
                  </span>
                ) : touchDevice ? (
                  <span>
                    {location === 'world'
                      ? 'Tap street to walk · Tap a LoftLine stop to board · Tap Hotel doors for Keycard'
                      : location === 'lobby'
                      ? 'Tap floor to walk · Tap the brass elevator'
                      : location === 'hallway'
                      ? 'Tap a numbered door for Keycard / Ring · Tap the elevator'
                      : location === 'resident_room'
                      ? `Visiting Suite ${activeResident?.roomNumber} · Tap ${activeResident?.name} to chat`
                      : 'Tap floor to walk · Tap furniture to use it · Tap the West door for Keycard'}
                  </span>
                ) : viewMode === 'play' ? (
                  <>
                    <span>WASD move (camera auto-follows) · Shift sprint · Space jump</span>
                    <span aria-hidden="true">·</span>
                    <span>Mouse look (click to lock)</span>
                    <span aria-hidden="true">·</span>
                    <span>E interact · V Isometric</span>
                  </>
                ) : location === 'world' ? (
                  <>
                    <span>Click street to walk · WASD pans · Shift sprint</span>
                    <span aria-hidden="true">·</span>
                    <span>M Map &amp; World</span>
                    <span aria-hidden="true">·</span>
                    <span>At Hotel Door: press E for Keycard or Ring Active User</span>
                  </>
                ) : location === 'lobby' ? (
                  <>
                    <span>Click floor to walk · WASD pans</span>
                    <span aria-hidden="true">·</span>
                    <span>North Elevator → Floors 2–4</span>
                    <span aria-hidden="true">·</span>
                    <span>South Doors → Main City</span>
                  </>
                ) : location === 'hallway' ? (
                  <>
                    <span>Walk corridor to numbered doors</span>
                    <span aria-hidden="true">·</span>
                    <span>Press E at door for Keycard / Ring</span>
                    <span aria-hidden="true">·</span>
                    <span>West Elevator → Change Floor</span>
                  </>
                ) : location === 'resident_room' ? (
                  <>
                    <span>Visiting Suite {activeResident?.roomNumber}</span>
                    <span aria-hidden="true">·</span>
                    <span>Press E near {activeResident?.name} to chat</span>
                    <span aria-hidden="true">·</span>
                    <span>West Door → Floor Hallway</span>
                  </>
                ) : (
                  <>
                    <span>Click floor to walk · WASD pans · F follow · Z zoom · M menu</span>
                    <span aria-hidden="true">·</span>
                    <span>West Door: press E to enter Keycard → Lobby &amp; Elevator</span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              {/* Top Edit Tab Row */}
              <div className="px-4 py-2 border-b border-[#39ff14]/15 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      sfx.playClick();
                      setEditTab('catalog');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      editTab === 'catalog'
                        ? 'bg-[#39ff14] text-[#051205]'
                        : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <Sofa className="w-3.5 h-3.5" />
                    Furniture
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      sfx.playClick();
                      setEditTab('surfaces');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      editTab === 'surfaces'
                        ? 'bg-[#39ff14] text-[#051205]'
                        : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <Paintbrush className="w-3.5 h-3.5" />
                    Walls & Floors
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      sfx.playClick();
                      setEditTab('presets');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      editTab === 'presets'
                        ? 'bg-[#39ff14] text-[#051205]'
                        : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Room Layouts
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="hidden md:inline text-[11px] text-slate-400 mr-2">
                    Drag items to move · Arrows nudge 0.5m · R rotate
                  </span>
                  <button
                    type="button"
                    disabled={history.length === 0}
                    onClick={handleUndo}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors whitespace-nowrap disabled:opacity-35 text-slate-200 hover:bg-white/10"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      sfx.playRemove();
                      pushHistory(items);
                      setItems([]);
                      setSelectedUid(null);
                      setPlacingCatalogId(null);
                      setMovingUid(null);
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors whitespace-nowrap text-red-300 hover:bg-red-500/20"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    Clear Floor
                  </button>
                  <button
                    type="button"
                    onClick={() => handleModeSwitch('walk')}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors whitespace-nowrap bg-[#39ff14] text-[#051205] hover:bg-[#5bff3b] neon-btn-glow"
                  >
                    <Footprints className="w-3.5 h-3.5" />
                    Done
                  </button>
                </div>
              </div>

              {/* Edit Tab Content */}
              {editTab === 'catalog' && (
                <div className="px-4 py-2.5 space-y-2.5">
                  {/* Category Filter Strip */}
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                    {CATEGORY_TABS.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          sfx.playClick();
                          setCategoryFilter(cat.id);
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                          categoryFilter === cat.id
                            ? 'bg-[#39ff14] text-[#051205]'
                            : 'text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  {/* Horizontal Scrollable Furniture Cards */}
                  <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
                    {filteredCatalog.map((item) => {
                      const isActive = placingCatalogId === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            sfx.playClick();
                            if (isActive) {
                              setPlacingCatalogId(null);
                            } else {
                              setMovingUid(null);
                              setSelectedUid(null);
                              setPlacingCatalogId(item.id);
                              setPlacingColor(item.defaultColor);
                              setPlacingRotation(0);
                            }
                          }}
                          className={`min-w-[126px] px-3 py-2 rounded-xl border text-left transition-all shrink-0 flex flex-col gap-1.5 ${
                            isActive
                              ? 'bg-[#39ff14] text-[#051205] border-[#39ff14] neon-btn-glow'
                              : 'bg-[#101713] border-white/12 hover:border-[#39ff14]/50 text-slate-100'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span
                              className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                                isActive
                                  ? 'bg-black/15 text-[#051205]'
                                  : 'bg-white/8 text-[#39ff14]'
                              }`}
                            >
                              {getCategoryIcon(item.id)}
                            </span>
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-black/25"
                              style={{ backgroundColor: item.defaultColor }}
                            />
                          </div>
                          <div>
                            <div className="text-xs font-semibold truncate">{item.name}</div>
                            <div
                              className={`text-[11px] font-mono-tabular ${
                                isActive ? 'text-[#0a230a]' : 'text-slate-400'
                              }`}
                            >
                              {item.size[0]}×{item.size[1]}m
                              {item.sittable ? ' · Sit' : item.interactive ? ' · Use' : ''}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {editTab === 'surfaces' && (
                <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <span className="block text-xs font-medium text-slate-300">Floor Finish</span>
                    <div className="flex flex-wrap gap-1.5">
                      {FLOOR_STYLES.map((fl) => {
                        const active = surfaces.floor === fl.id;
                        return (
                          <button
                            key={fl.id}
                            type="button"
                            onClick={() => {
                              sfx.playClick();
                              setSurfaces((s) => ({ ...s, floor: fl.id as FloorStyleId }));
                            }}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
                              active
                                ? 'bg-[#39ff14] text-[#051205] border-[#39ff14]'
                                : 'bg-[#101713] border-white/12 text-slate-200 hover:border-[#39ff14]/45'
                            }`}
                          >
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-black/25"
                              style={{ backgroundColor: fl.color }}
                            />
                            {fl.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="block text-xs font-medium text-slate-300">Wall Paint</span>
                    <div className="flex flex-wrap gap-1.5">
                      {WALL_STYLES.map((wl) => {
                        const active = surfaces.wall === wl.id;
                        return (
                          <button
                            key={wl.id}
                            type="button"
                            onClick={() => {
                              sfx.playClick();
                              setSurfaces((s) => ({ ...s, wall: wl.id as WallStyleId }));
                            }}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
                              active
                                ? 'bg-[#39ff14] text-[#051205] border-[#39ff14]'
                                : 'bg-[#101713] border-white/12 text-slate-200 hover:border-[#39ff14]/45'
                            }`}
                          >
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-black/25"
                              style={{ backgroundColor: wl.color }}
                            />
                            {wl.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {editTab === 'presets' && (
                <div className="px-4 py-3 flex flex-wrap items-center gap-2">
                  {ROOM_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        sfx.playPlace();
                        pushHistory(items);
                        setItems(preset.items.map((it) => ({ ...it })));
                        setSurfaces({ ...preset.surfaces });
                        setMood(preset.mood);
                        setRoomName(preset.name);
                        setSelectedUid(null);
                        setPlacingCatalogId(null);
                        setMovingUid(null);
                      }}
                      className={`px-4 py-2 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap ${
                        roomName === preset.name
                          ? 'bg-[#39ff14] text-[#051205] border-[#39ff14]'
                          : 'bg-[#101713] border-white/12 text-slate-200 hover:border-[#39ff14]/45'
                      }`}
                    >
                      <span>{preset.name}</span>
                      <span
                        className={`font-mono-tabular ${
                          roomName === preset.name ? 'text-[#0a230a]' : 'text-slate-400'
                        }`}
                      >
                        {preset.items.length} items
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile virtual stick, drag-look and contextual buttons */}
      <TouchControls
        active={device.controls === 'touch' && !anyModalOpen && session.status !== 'loading'}
        voice={session.voice}
        chatOpen={session.chatOpen}
        onCycleRange={cycleRange}
        onMicPress={() => {
          void session.pressMicrophone();
        }}
        onMicRelease={session.releaseMicrophone}
        onToggleChat={() => {
          sfx.playClick();
          session.toggleChat();
        }}
        onOpenVoiceSettings={() => {
          sfx.playClick();
          setRoomSettingsOpen(true);
        }}
        onEmote={() => triggerEmote(activeEmote === 'dance' ? 'wave' : 'dance')}
        viewMode={viewMode}
        closeZoom={closeZoom}
        followCharacter={followCharacter}
        onToggleZoom={toggleCloseZoom}
        onToggleFollow={toggleFollowCharacter}
        onOpenMenu={() => {
          sfx.playClick();
          setMenuOpen(true);
        }}
        actionLabel={proximityPrompt}
        lookEnabled={viewMode === 'play' && touchDevice}
        layout={controls.touch}
      />

      {/* Community: chat, presence, friends, shop and worlds */}
      <SocialHud onEnterWorld={handleEnterWorld} gameplayAllowed={gameplayAllowed} />

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
        isPortrait={isPortrait}
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
        outfitStorageKey={session.status === 'online' ? (session.user?.id ?? 'account') : `guest_${session.guestName ?? 'visitor'}`}
        config={avatarConfig}
        ownedClothing={session.inventory
          .filter((entry) => entry.kind === 'clothing')
          .map((entry) => entry.catalogId)}
        onChange={setAvatarConfig}
        onClose={() => setAvatarModalOpen(false)}
      />

      {/* A-Z Diagonal x 1st-30th Horizontal City Grid Map */}
      <CityMapModal
        open={cityMapOpen}
        currentStreet={cityStreet}
        playerPoseRef={playerPoseRef}
        onClose={() => setCityMapOpen(false)}
      />

      {/* Central M menu: map, world info, management, leave and controls. */}
      <WorldMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        location={location}
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
      <HotelDoorTerminalModal
        open={doorTerminalOpen}
        playerName={avatarConfig.name}
        playerSuiteNumber={playerSuiteNumber}
        playerSuiteFloor={playerSuiteFloor}
        mainDoorUnlocked={mainDoorUnlocked}
        onUnlockWithKeycard={handleUnlockMainWithKeycard}
        onUnlockFromResident={handleUnlockMainFromResident}
        onClose={() => setDoorTerminalOpen(false)}
      />

      <AirportTravelModal open={airportDepartureOpen} guest={session.status === 'guest'} onClose={() => setAirportDepartureOpen(false)} onTakeFlight={() => {
        setAirportDepartureOpen(false);
        if (onExitPlatform) onExitPlatform();
        else if (session.status === 'guest') void session.endGuest();
        else if (session.status === 'online') session.exitCity();
      }} />
      <ShopModal open={airportShopOpen} onClose={() => setAirportShopOpen(false)} initialTab="clothing" readOnly={session.status === 'guest'} />

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
    </div>
  );
}
