import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Armchair,
  BedDouble,
  BookOpen,
  Camera,
  ChevronDown,
  ChevronUp,
  Coffee,
  Copy,
  DoorOpen,
  Eraser,
  Eye,
  Flame,
  Frame,
  Gamepad2,
  Hand,
  Home,
  ArrowUp,
  LampDesk,
  LampFloor,
  Layers,
  Map as MapIcon,
  MessageCircle,
  Monitor,
  Move,
  Music,
  Paintbrush,
  PencilRuler,
  RotateCw,
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
  Mic,
  MicOff,
  X,
} from 'lucide-react';
import { AvatarModal } from './components/AvatarModal';
import { CityMapModal } from './components/CityMapModal';
import { ElevatorPanelModal } from './components/ElevatorPanelModal';
import { HotelDoorTerminalModal } from './components/HotelDoorTerminalModal';
import type { CameraPresetRequest } from './components/RoomViewport';
import { SocialHud } from './components/SocialHud';
import { TouchControls } from './components/TouchControls';
import { isTouchDevice } from './game/touchInput';

// Three.js is only needed once the world renders; lazy-loading keeps the
// sign-in wall light.
const RoomViewport = lazy(() =>
  import('./components/RoomViewport').then((module) => ({ default: module.RoomViewport }))
);
import { api } from './net/api';
import { useSession } from './session';
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
const LEGACY_STORAGE_KEY = 'loftline_room_state_v1';

interface SavedState {
  items: PlacedItem[];
  surfaces: RoomSurfaceConfig;
  mood: LightingMood;
  avatar: AvatarConfig;
  roomName: string;
}

function loadSavedState(): SavedState {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
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

export default function App() {
  const session = useSession();

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
    return loadSavedState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [location, setLocation] = useState<WorldLocation>('room');
  const [hallwayFloor, setHallwayFloor] = useState<number>(PLAYER_SUITE_FLOOR);
  const [unlockedRooms, setUnlockedRooms] = useState<string[]>([]);
  const [mainDoorUnlocked, setMainDoorUnlocked] = useState<boolean>(false);
  const [roomDoorUnlocked, setRoomDoorUnlocked] = useState<boolean>(false);
  const [activeResident, setActiveResident] = useState<ActiveResident | null>(null);
  const [targetVisitResident, setTargetVisitResident] = useState<ActiveResident | null>(null);
  const [doorTerminalOpen, setDoorTerminalOpen] = useState(false);
  const [elevatorModalOpen, setElevatorModalOpen] = useState(false);

  const touchDevice = useMemo(() => isTouchDevice(), []);
  const [viewMode, setViewMode] = useState<ViewMode>(() => (isTouchDevice() ? 'play' : 'isometric'));
  const [mode, setMode] = useState<GameMode>('walk');
  const [items, setItems] = useState<PlacedItem[]>(initial.items);
  const [history, setHistory] = useState<PlacedItem[][]>([]);
  const [surfaces, setSurfaces] = useState<RoomSurfaceConfig>(initial.surfaces);
  const [mood, setMood] = useState<LightingMood>(initial.mood);
  const [roomName, setRoomName] = useState<string>(initial.roomName);
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>(initial.avatar);
  const [activeWorld, setActiveWorld] = useState<{
    id: string;
    name: string;
    canEdit: boolean;
  } | null>(null);

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
  const [dockCollapsed, setDockCollapsed] = useState(() => isTouchDevice());
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [cityMapOpen, setCityMapOpen] = useState(false);
  const [cityStreet, setCityStreet] = useState('M St & 15th St');
  const [muted, setMuted] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPresetRequest | null>(null);
  const [cameraToggle, setCameraToggle] = useState<'overview' | 'closeup'>('overview');
  const playerPoseRef = useRef({ x: 0, z: 0, yaw: 0 });

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
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      }
    } catch {
      // Ignore storage quota errors
    }

    if (session.status !== 'online') return;
    const state = { name: roomName, items, surfaces, mood };
    if (activeWorld) {
      if (activeWorld.canEdit) session.saveWorldState(activeWorld.id, state);
    } else {
      session.saveRoomState(state);
    }
  }, [items, surfaces, mood, avatarConfig, roomName, activeWorld, session.status]);

  // Character appearance is part of the persistent account. Skip the write when
  // the local outfit already matches the account (e.g. just after sign-in).
  useEffect(() => {
    if (session.status !== 'online' || !session.profile) return;
    if (JSON.stringify(session.profile.avatar) === JSON.stringify(avatarConfig)) return;
    session.saveAvatar(avatarConfig);
  }, [avatarConfig, session.status, session.profile]);

  // Stream position/emote to the realtime gateway while online.
  useEffect(() => {
    if (session.status !== 'online') return;
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

  // Push-to-talk: hold T while voice is enabled.
  useEffect(() => {
    if (session.voiceStatus !== 'ready') return;
    const onDown = (event: KeyboardEvent) => {
      if (event.code !== 'KeyT' || event.repeat) return;
      const active = document.activeElement;
      if (active && ['INPUT', 'TEXTAREA'].includes(active.tagName)) return;
      session.setPushToTalk(true);
    };
    const onUp = (event: KeyboardEvent) => {
      if (event.code === 'KeyT') session.setPushToTalk(false);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      session.setPushToTalk(false);
    };
  }, [session.voiceStatus, session.setPushToTalk]);

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

  const handleChangeLocation = useCallback(
    (next: WorldLocation) => {
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
        showHint('Main City · Walk to Hotel Main Entrance & press E for Keycard / Guest Intercom');
      } else if (next === 'lobby') {
        showHint('Main Lobby · Walk into the North brass elevator to ride to Floors 2–4');
      } else if (next === 'hallway') {
        setActiveResident(null);
        showHint(`Floor ${hallwayFloor} Hallway · Find a numbered suite door or ride the elevator`);
      } else if (next === 'room') {
        setActiveResident(null);
        setHallwayFloor(PLAYER_SUITE_FLOOR);
        showHint(`${roomName} (Suite ${PLAYER_SUITE_NUMBER}) · Walk to West door & press E for Keycard`);
      }
    },
    [hallwayFloor, roomName, showHint]
  );

  const handleUnlockRoomDoor = useCallback(() => {
    setRoomDoorUnlocked(true);
    setUnlockedRooms((prev) =>
      prev.includes(PLAYER_SUITE_NUMBER) ? prev : [...prev, PLAYER_SUITE_NUMBER]
    );
  }, []);

  const handleUnlockHallwayDoor = useCallback((roomNumber: string) => {
    setUnlockedRooms((prev) => (prev.includes(roomNumber) ? prev : [...prev, roomNumber]));
    if (roomNumber === PLAYER_SUITE_NUMBER) {
      setRoomDoorUnlocked(true);
    }
  }, []);

  const handleEnterSuiteFromHallway = useCallback(
    (roomNumber: string) => {
      if (roomNumber === PLAYER_SUITE_NUMBER) {
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
        showHint(`Entered ${res.name}'s Suite ${res.roomNumber} · Press E near ${res.name} to chat`);
        showNpcChat(res.name, res.greeting);
      }
    },
    [handleChangeLocation, showHint, showNpcChat]
  );

  const handleUnlockMainWithKeycard = useCallback(() => {
    setMainDoorUnlocked(true);
    setRoomDoorUnlocked(true);
    setUnlockedRooms((prev) =>
      prev.includes(PLAYER_SUITE_NUMBER) ? prev : [...prev, PLAYER_SUITE_NUMBER]
    );
    setDoorTerminalOpen(false);
    showHint(`Keycard accepted! Walk into Main Lobby & ride elevator to Floor ${PLAYER_SUITE_FLOOR}`);
  }, [showHint]);

  const handleUnlockMainFromResident = useCallback(
    (resident: ActiveResident) => {
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
    (floor: 'L' | 2 | 3 | 4) => {
      setElevatorModalOpen(false);
      if (floor === 'L') {
        handleChangeLocation('lobby');
      } else {
        setHallwayFloor(floor);
        setLocation('hallway');
        setActiveResident(null);
        setMode('walk');
        showHint(`Arrived on Floor ${floor} · Walk down the hallway to Suites ${floor}01–${floor}04`);
      }
    },
    [handleChangeLocation, showHint]
  );

  /** Load a player-created world into the room builder. */
  const handleEnterWorld = useCallback(
    async (worldId: string) => {
      try {
        const world = await api.world(worldId);
        if (!world.canEnter || !world.items) {
          showHint('You do not have access to that world');
          return;
        }
        setActiveWorld({ id: world.id, name: world.name, canEdit: world.canEdit });
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
    [session, showHint]
  );

  /** Return from a player world to the hotel suite. */
  const handleLeaveWorld = useCallback(() => {
    setActiveWorld(null);
    const suite = session.suite;
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
  }, [session, showHint]);

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
    sfx.playClick();
    setViewMode((prev) => {
      const next = prev === 'play' ? 'isometric' : 'play';
      if (next === 'play') {
        setMode('walk');
        setSelectedUid(null);
        setPlacingCatalogId(null);
        setMovingUid(null);
        setAvatarModalOpen(false);
        showHint('Play View · WASD move · Click or drag mouse to look · Esc unlocks cursor');
      } else {
        showHint('Isometric View');
      }
      return next;
    });
  }, [showHint]);

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
    (uid: string, gx: number, gz: number, rot: 0 | 1 | 2 | 3, wall?: 'north' | 'west') => {
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
      } else if (e.key === 'v' || e.key === 'V') {
        handleTogglePlayView();
      } else if ((e.key === 'm' || e.key === 'M') && location === 'world') {
        sfx.playClick();
        setCityMapOpen((o) => !o);
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
            if (selectedItem.wall === 'west') {
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
      setViewMode('play');
      setMode('walk');
      const sent = session.boardTransit(lineId, stopId);
      if (!sent) showHint('Connecting… try boarding again in a moment');
    },
    [session, showHint]
  );

  const handleExitTransit = useCallback(() => {
    session.exitTransit();
  }, [session]);

  const toggleVoice = useCallback(async () => {
    if (session.voiceStatus === 'ready') {
      session.disableVoice();
      showHint('Voice off');
      return;
    }
    const next = await session.enableVoice();
    if (next === 'denied') {
      showHint('Microphone permission denied — text chat still works');
    } else if (next === 'unsupported') {
      showHint('This browser does not support voice chat');
    } else if (next === 'ready') {
      showHint('Voice on · hold T (or the mic button) to talk');
    }
  }, [session, showHint]);

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

  const anyModalOpen = avatarModalOpen || cityMapOpen || doorTerminalOpen || elevatorModalOpen;

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
    : `Suite ${PLAYER_SUITE_NUMBER} · ${roomName}`;

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
    : `Floor ${PLAYER_SUITE_FLOOR} · ${items.length} items`;

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
        hallwayFloor={hallwayFloor}
        unlockedRooms={unlockedRooms}
        mainDoorUnlocked={mainDoorUnlocked}
        roomDoorUnlocked={roomDoorUnlocked}
        activeResident={activeResident}
        viewMode={viewMode}
        mode={mode}
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
        cameraPreset={cameraPreset}
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
        onOpenElevator={() => setElevatorModalOpen(true)}
        onUnlockRoomDoor={handleUnlockRoomDoor}
        onUnlockHallwayDoor={handleUnlockHallwayDoor}
        onEnterSuiteFromHallway={handleEnterSuiteFromHallway}
      />
      </Suspense>

      {/* Functional Aiming Reticle when Pointer-Locked in Play View */}
      {viewMode === 'play' && pointerLocked && (
        <div className="fixed inset-0 pointer-events-none z-20 flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-[#39ff14] shadow-sm ring-2 ring-black/60" />
        </div>
      )}

      {/* Top-Left Brand & Hotel / City Summary */}
      <div className="fixed top-4 left-4 z-20 pointer-events-auto">
        <div className={`px-4 py-2.5 rounded-xl border flex items-center gap-3 ${hudPanelClass}`}>
          <span className="font-display text-base font-bold tracking-tight text-[#39ff14] whitespace-nowrap shrink-0">
            LoftLife
          </span>
          <span className="text-xs text-[#39ff14]/45" aria-hidden="true">
            |
          </span>
          <div className="flex items-center gap-2 text-xs text-slate-200 whitespace-nowrap">
            <span className="font-medium text-white">{locationTitle}</span>
            <span className="text-[#39ff14]/60" aria-hidden="true">
              ·
            </span>
            <span className="font-mono-tabular text-slate-300">{locationSub}</span>
          </div>
        </div>
      </div>

      {/* Top-Right Compact Mode & Utility Bar */}
      <div className="fixed top-4 right-4 z-20 max-w-[calc(100vw-27rem)] flex flex-wrap items-center justify-end gap-2 pointer-events-auto">
        {/* Leave a player-created world and restore the hotel suite */}
        {activeWorld && (
          <button
            type="button"
            onClick={handleLeaveWorld}
            className="px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 bg-[#ffb878] text-[#1a1005] border-[#ffb878] hover:bg-[#ffc894]"
          >
            <Home className="w-3.5 h-3.5" />
            Leave {activeWorld.name}
          </button>
        )}
        {/* Exit to Main World / Return to My Suite Quick Travel */}
        <button
          type="button"
          onClick={() => {
            if (activeWorld) {
              handleLeaveWorld();
              setLocation('world');
              session.enterCity();
              return;
            }
            handleChangeLocation(location === 'world' ? 'room' : 'world');
          }}
          className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            location === 'world'
              ? 'bg-[#39ff14] text-[#051205] border-[#39ff14] hover:bg-[#5bff3b] neon-btn-glow'
              : 'bg-[#111914] text-[#39ff14] border-[#39ff14]/45 hover:bg-[#19261d]'
          }`}
        >
          {location === 'world' ? (
            <>
              <Home className="w-3.5 h-3.5" />
              Return to Suite {PLAYER_SUITE_NUMBER}
            </>
          ) : (
            <>
              <DoorOpen className="w-3.5 h-3.5" />
              Main City
            </>
          )}
        </button>

        {/* City Grid Map Toggle (when in Main City) */}
        {location === 'world' && (
          <button
            type="button"
            onClick={() => {
              sfx.playClick();
              setCityMapOpen((v) => !v);
            }}
            className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              cityMapOpen
                ? 'bg-[#39ff14] text-[#051205] border-[#39ff14] neon-btn-glow'
                : hudPanelClass
            }`}
          >
            <MapIcon className="w-3.5 h-3.5" />
            City Map (M)
          </button>
        )}

        {/* Isometric vs Third-Person GTA Play View Switcher */}
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

        {/* Walk / Edit Room Mode Segmented Switch (only inside My Suite) */}
        {location === 'room' && (!activeWorld || activeWorld.canEdit) && (
          <div className={`p-1 rounded-xl border flex items-center gap-1 ${hudPanelClass}`}>
            <button
              type="button"
              onClick={() => handleModeSwitch('walk')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                mode === 'walk'
                  ? 'bg-[#39ff14] text-[#051205]'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <Footprints className="w-3.5 h-3.5" />
              Walk
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('edit')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                mode === 'edit'
                  ? 'bg-[#39ff14] text-[#051205]'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <PencilRuler className="w-3.5 h-3.5" />
              Edit Room
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

        {/* Camera & Avatar & Sound */}
        <div className={`p-1 rounded-xl border flex items-center gap-1 ${hudPanelClass}`}>
          <button
            type="button"
            title={
              session.voiceStatus === 'ready'
                ? 'Voice on · hold T to talk · click to turn off'
                : session.voiceStatus === 'denied'
                ? 'Microphone blocked in this browser'
                : 'Turn on proximity voice'
            }
            aria-label={session.voiceStatus === 'ready' ? 'Turn voice off' : 'Turn voice on'}
            onClick={() => {
              sfx.playClick();
              void toggleVoice();
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              session.voiceStatus === 'ready'
                ? 'bg-sky-500 text-white'
                : session.voiceStatus === 'denied'
                ? 'bg-red-500/20 text-red-200'
                : 'text-slate-200 hover:bg-white/10'
            }`}
          >
            {session.voiceStatus === 'ready' ? (
              <Mic className="w-3.5 h-3.5" />
            ) : (
              <MicOff className="w-3.5 h-3.5" />
            )}
            {session.voiceStatus === 'requesting'
              ? 'Mic…'
              : session.voiceStatus === 'ready'
              ? session.voicePushToTalk
                ? 'Talking'
                : 'Voice'
              : 'Voice'}
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
            Avatar
          </button>

          <button
            type="button"
            title={cameraToggle === 'overview' ? 'Zoom to Avatar' : 'Room Overview'}
            aria-label="Toggle camera zoom"
            onClick={() => {
              sfx.playClick();
              const next = cameraToggle === 'overview' ? 'closeup' : 'overview';
              setCameraToggle(next);
              setCameraPreset({ id: Date.now(), type: next });
            }}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors text-slate-300 hover:bg-white/10 hover:text-[#39ff14]"
          >
            <Camera className="w-3.5 h-3.5" />
          </button>

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
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className={`px-3.5 py-1.5 rounded-lg border text-xs font-medium text-[#d8ffd0] ${hudPanelClass}`}>
            {walkHint}
          </div>
        </div>
      )}

      {/* Proximity Action Prompt (Isometric Walk & Play View) */}
      {proximityPrompt && !anyModalOpen && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div className="px-4 py-2 rounded-xl bg-[#39ff14] text-[#051205] font-bold text-xs border border-[#8eff78] neon-btn-glow">
            {proximityPrompt}
          </div>
        </div>
      )}

      {/* NPC Dialogue Toast */}
      {npcChat && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 w-[min(460px,90vw)] pointer-events-auto">
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
                  ? 'Click North or West wall'
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
                {viewMode === 'play' ? (
                  <>
                    <span>WASD move (camera auto-follows) · Shift sprint · Space jump</span>
                    <span aria-hidden="true">·</span>
                    <span>Mouse look (click to lock)</span>
                    <span aria-hidden="true">·</span>
                    <span>E interact · V Isometric</span>
                  </>
                ) : location === 'world' ? (
                  <>
                    <span>Click street or WASD + Shift sprint</span>
                    <span aria-hidden="true">·</span>
                    <span>M City Map</span>
                    <span aria-hidden="true">·</span>
                    <span>At Hotel Door: press E for Keycard or Ring Active User</span>
                  </>
                ) : location === 'lobby' ? (
                  <>
                    <span>Click floor or WASD</span>
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
                    <span>Click floor or WASD</span>
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
        active={touchDevice && !anyModalOpen && session.status === 'online'}
        lookEnabled={viewMode === 'play'}
        voiceEnabled={session.voiceStatus === 'ready'}
        onEmote={() => triggerEmote(activeEmote === 'dance' ? 'wave' : 'dance')}
        onTalkStart={() => session.setPushToTalk(true)}
        onTalkEnd={() => session.setPushToTalk(false)}
      />

      {/* Community: chat, presence, friends, shop and worlds */}
      <SocialHud onEnterWorld={handleEnterWorld} />

      {/* Avatar Character Studio Modal */}
      <AvatarModal
        open={avatarModalOpen}
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

      {/* Hotel Main Door Keycard & Up/Down Active Resident Ring Terminal */}
      <HotelDoorTerminalModal
        open={doorTerminalOpen}
        playerName={avatarConfig.name}
        mainDoorUnlocked={mainDoorUnlocked}
        onUnlockWithKeycard={handleUnlockMainWithKeycard}
        onUnlockFromResident={handleUnlockMainFromResident}
        onClose={() => setDoorTerminalOpen(false)}
      />

      {/* Hotel Brass Elevator Floor Selector */}
      <ElevatorPanelModal
        open={elevatorModalOpen}
        currentLocation={location}
        currentFloor={hallwayFloor}
        playerName={avatarConfig.name}
        targetVisitResident={targetVisitResident}
        onArriveFloor={handleArriveFloor}
        onClose={() => setElevatorModalOpen(false)}
      />
    </div>
  );
}
