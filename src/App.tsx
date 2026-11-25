import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Armchair,
  BedDouble,
  BookOpen,
  Camera,
  ChevronDown,
  ChevronUp,
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
  Tv,
  Undo2,
  User,
  Volume2,
  VolumeX,
  Footprints,
  X,
} from 'lucide-react';
import { AvatarModal } from './components/AvatarModal';
import { CityMapModal } from './components/CityMapModal';
import { type CameraPresetRequest, RoomViewport } from './components/RoomViewport';
import { sfx } from './game/audio';
import {
  DEFAULT_AVATAR,
  FLOOR_STYLES,
  FURNITURE_CATALOG,
  getCatalogItem,
  ROOM_PRESETS,
  WALL_STYLES,
} from './game/catalog';
import { getEffectiveSize, isValidPlacement } from './game/gridMath';
import type {
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

const STORAGE_KEY = 'loftline_room_state_v1';

interface SavedState {
  items: PlacedItem[];
  surfaces: RoomSurfaceConfig;
  mood: LightingMood;
  avatar: AvatarConfig;
  roomName: string;
}

function loadSavedState(): SavedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
      return <Sofa className="w-4 h-4" />;
    case 'lounge_chair':
    case 'bar_stool':
      return <Armchair className="w-4 h-4" />;
    case 'cozy_bed':
      return <BedDouble className="w-4 h-4" />;
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
    case 'woven_rug':
      return <Layers className="w-4 h-4" />;
    case 'wall_art':
    case 'wall_shelf':
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
  const initial = useMemo(() => loadSavedState(), []);

  const [location, setLocation] = useState<WorldLocation>('room');
  const [viewMode, setViewMode] = useState<ViewMode>('isometric');
  const [mode, setMode] = useState<GameMode>('walk');
  const [items, setItems] = useState<PlacedItem[]>(initial.items);
  const [history, setHistory] = useState<PlacedItem[][]>([]);
  const [surfaces, setSurfaces] = useState<RoomSurfaceConfig>(initial.surfaces);
  const [mood, setMood] = useState<LightingMood>(initial.mood);
  const [roomName, setRoomName] = useState<string>(initial.roomName);
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>(initial.avatar);

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
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [cityMapOpen, setCityMapOpen] = useState(false);
  const [cityStreet, setCityStreet] = useState('M St & 15th St');
  const [muted, setMuted] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPresetRequest | null>(null);
  const [cameraToggle, setCameraToggle] = useState<'overview' | 'closeup'>('overview');
  const playerPoseRef = useRef({ x: 0, z: 0, yaw: 0 });

  // Persist to localStorage
  useEffect(() => {
    try {
      const payload: SavedState = {
        items,
        surfaces,
        mood,
        avatar: avatarConfig,
        roomName,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }, [items, surfaces, mood, avatarConfig, roomName]);

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
      if (next === 'world') {
        setMode('walk');
        setSelectedUid(null);
        setPlacingCatalogId(null);
        setMovingUid(null);
        showHint('Main City · A–Z Diagonal × 1st–30th Streets · Walk through Loft doors to return');
      } else {
        setCityMapOpen(false);
        showHint(`Returned to ${roomName}`);
      }
    },
    [roomName, showHint]
  );

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
      const clampedGx = Math.min(selectedItem.gx, 10 - ew);
      const clampedGz = Math.min(selectedItem.gz, 10 - ed);
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
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    mode,
    location,
    cityMapOpen,
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

  const filteredCatalog = useMemo(() => {
    if (categoryFilter === 'all') return FURNITURE_CATALOG;
    return FURNITURE_CATALOG.filter((item) => item.category === categoryFilter);
  }, [categoryFilter]);

  const placingCatalogItem = useMemo(
    () => (placingCatalogId ? getCatalogItem(placingCatalogId) ?? null : null),
    [placingCatalogId]
  );

  const isDarkSky = mood === 'night';
  const hudPanelClass = isDarkSky
    ? 'bg-[#181b24]/95 text-slate-100 border-white/12 shadow-2xl'
    : 'bg-[#fbfaf7]/95 text-slate-900 border-slate-900/10 shadow-xl';

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none">
      {/* Full-Screen 3D Canvas */}
      <RoomViewport
        location={location}
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
        playerPoseRef={playerPoseRef}
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
      />

      {/* Functional Aiming Reticle when Pointer-Locked in Play View */}
      {viewMode === 'play' && pointerLocked && (
        <div className="fixed inset-0 pointer-events-none z-20 flex items-center justify-center">
          <div className="w-1.5 h-1.5 rounded-full bg-white/85 shadow-sm ring-1 ring-black/40" />
        </div>
      )}

      {/* Top-Left Brand & Room / City Street Summary */}
      <div className="fixed top-4 left-4 z-20 pointer-events-auto">
        <div className={`px-4 py-2.5 rounded-xl border flex items-center gap-3 ${hudPanelClass}`}>
          <span className="font-display text-base font-bold tracking-tight whitespace-nowrap shrink-0">
            Loftline
          </span>
          <span className="text-xs opacity-35" aria-hidden="true">
            |
          </span>
          <div className="flex items-center gap-2 text-xs opacity-80 whitespace-nowrap">
            <span>{location === 'world' ? 'Main City' : roomName}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">
              {location === 'world' ? cityStreet : `${items.length} items`}
            </span>
          </div>
        </div>
      </div>

      {/* Top-Right Compact Mode & Utility Bar */}
      <div className="fixed top-4 right-4 z-20 flex flex-wrap items-center justify-end gap-2 pointer-events-auto">
        {/* Exit to Main World / Return to My Loft Primary Action */}
        <button
          type="button"
          onClick={() => handleChangeLocation(location === 'room' ? 'world' : 'room')}
          className={`px-3.5 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
            location === 'world'
              ? 'bg-emerald-600 text-white border-emerald-500 hover:bg-emerald-700'
              : 'bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-700'
          }`}
        >
          {location === 'room' ? (
            <>
              <DoorOpen className="w-3.5 h-3.5" />
              Exit to Main World
            </>
          ) : (
            <>
              <Home className="w-3.5 h-3.5" />
              Return to My Loft
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
              cityMapOpen ? 'bg-amber-500 text-slate-950 border-amber-400' : hudPanelClass
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
                ? isDarkSky
                  ? 'bg-white text-slate-900'
                  : 'bg-slate-900 text-white'
                : isDarkSky
                ? 'text-slate-300 hover:bg-white/10'
                : 'text-slate-600 hover:bg-slate-200/70'
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
                ? 'bg-amber-500 text-slate-950'
                : isDarkSky
                ? 'text-slate-300 hover:bg-white/10'
                : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            <Gamepad2 className="w-3.5 h-3.5" />
            Play View
          </button>
        </div>

        {/* Walk / Edit Room Mode Segmented Switch (only inside My Loft) */}
        {location === 'room' && (
          <div className={`p-1 rounded-xl border flex items-center gap-1 ${hudPanelClass}`}>
            <button
              type="button"
              onClick={() => handleModeSwitch('walk')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                mode === 'walk'
                  ? 'bg-emerald-600 text-white'
                  : isDarkSky
                  ? 'text-slate-300 hover:bg-white/10'
                  : 'text-slate-600 hover:bg-slate-200/70'
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
                  ? 'bg-slate-900 text-white'
                  : isDarkSky
                  ? 'text-slate-300 hover:bg-white/10'
                  : 'text-slate-600 hover:bg-slate-200/70'
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
                  ? isDarkSky
                    ? 'bg-white text-slate-900'
                    : 'bg-slate-900 text-white'
                  : isDarkSky
                  ? 'text-slate-300 hover:bg-white/10'
                  : 'text-slate-600 hover:bg-slate-200/70'
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
            onClick={() => {
              sfx.playClick();
              setAvatarModalOpen((v) => !v);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              avatarModalOpen
                ? 'bg-slate-900 text-white'
                : isDarkSky
                ? 'text-slate-200 hover:bg-white/10'
                : 'text-slate-700 hover:bg-slate-200/70'
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
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              isDarkSky
                ? 'text-slate-300 hover:bg-white/10'
                : 'text-slate-600 hover:bg-slate-200/70'
            }`}
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
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              isDarkSky
                ? 'text-slate-300 hover:bg-white/10'
                : 'text-slate-600 hover:bg-slate-200/70'
            }`}
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Transient Walk / Action Hint Banner */}
      {walkHint && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className={`px-3.5 py-1.5 rounded-lg border text-xs font-medium ${hudPanelClass}`}>
            {walkHint}
          </div>
        </div>
      )}

      {/* Play View Proximity Action Prompt */}
      {viewMode === 'play' && proximityPrompt && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-semibold text-xs shadow-lg border border-amber-400">
            {proximityPrompt}
          </div>
        </div>
      )}

      {/* NPC Dialogue Toast in Main World */}
      {npcChat && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 w-[min(460px,90vw)] pointer-events-auto">
          <div className={`px-4 py-3 rounded-xl border flex items-start justify-between gap-3 ${hudPanelClass}`}>
            <div className="flex items-start gap-2.5">
              <MessageCircle className="w-4 h-4 mt-0.5 text-emerald-500 shrink-0" />
              <div className="text-xs leading-relaxed">
                <span className="font-semibold mr-1.5">{npcChat.speaker}:</span>
                <span className="opacity-85">{npcChat.message}</span>
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
                          ? 'border-blue-500 scale-115 ring-2 ring-blue-500/30'
                          : 'border-black/20 hover:scale-105'
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
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 text-white hover:bg-slate-800 flex items-center gap-1 whitespace-nowrap"
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
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 whitespace-nowrap ${
                  isDarkSky ? 'bg-white/10 hover:bg-white/20' : 'bg-slate-200/80 hover:bg-slate-300/80'
                }`}
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
                <span className="font-semibold">{selectedCatalog.name}</span>
                <span className="opacity-40" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono-tabular opacity-70">
                  {selectedCatalog.size[0]}×{selectedCatalog.size[1]}m
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Live Recolor Swatches */}
                <div className="flex items-center gap-1 pr-2 border-r border-current/15">
                  {selectedCatalog.colors.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      title={c.label}
                      onClick={() => handleRecolorSelected(c.hex)}
                      className={`w-5 h-5 rounded-full border transition-transform ${
                        selectedItem.color === c.hex
                          ? 'border-blue-500 scale-115 ring-2 ring-blue-500/30'
                          : 'border-black/20 hover:scale-105'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleStartMoveSelected}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 whitespace-nowrap ${
                    isDarkSky ? 'bg-white/10 hover:bg-white/20' : 'bg-slate-100 hover:bg-slate-200'
                  }`}
                >
                  <Move className="w-3.5 h-3.5" />
                  Move
                </button>

                {selectedCatalog.layer !== 'wall' && (
                  <button
                    type="button"
                    onClick={rotateSelectedOrPlacing}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 whitespace-nowrap ${
                      isDarkSky ? 'bg-white/10 hover:bg-white/20' : 'bg-slate-100 hover:bg-slate-200'
                    }`}
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    Rotate
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleDuplicateSelected}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 whitespace-nowrap ${
                    isDarkSky ? 'bg-white/10 hover:bg-white/20' : 'bg-slate-100 hover:bg-slate-200'
                  }`}
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
                      ? 'bg-emerald-600 text-white'
                      : isDarkSky
                      ? 'bg-white/10 hover:bg-white/15 text-slate-100'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
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
                      ? 'bg-emerald-600 text-white'
                      : isDarkSky
                      ? 'bg-white/10 hover:bg-white/15 text-slate-100'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
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
                      ? 'bg-emerald-600 text-white'
                      : isDarkSky
                      ? 'bg-white/10 hover:bg-white/15 text-slate-100'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Cheer
                </button>
                <button
                  type="button"
                  onClick={() => triggerEmote('jump')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    isDarkSky
                      ? 'bg-white/10 hover:bg-white/15 text-slate-100'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                  }`}
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                  Jump
                </button>
                {activeEmote !== 'idle' && activeEmote !== 'walk' && (
                  <button
                    type="button"
                    onClick={() => setActiveEmote('idle')}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                      isDarkSky
                        ? 'text-slate-300 hover:bg-white/10'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Stand Still
                  </button>
                )}
              </div>

              <div className="text-xs opacity-70 flex items-center gap-2 whitespace-nowrap">
                {viewMode === 'play' ? (
                  <>
                    <span>WASD move · Shift sprint · Space jump</span>
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
                    <span>Walk straight through Loft doors to enter</span>
                  </>
                ) : (
                  <>
                    <span>Click floor or WASD</span>
                    <span aria-hidden="true">·</span>
                    <span>Walk straight through West Door to exit</span>
                    <span aria-hidden="true">·</span>
                    <span>Click seats, lamps, or TV</span>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              {/* Top Edit Tab Row */}
              <div
                className={`px-4 py-2 border-b flex items-center justify-between gap-3 ${
                  isDarkSky ? 'border-white/10' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      sfx.playClick();
                      setEditTab('catalog');
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      editTab === 'catalog'
                        ? 'bg-slate-900 text-white'
                        : isDarkSky
                        ? 'text-slate-300 hover:bg-white/10'
                        : 'text-slate-600 hover:bg-slate-200/70'
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
                        ? 'bg-slate-900 text-white'
                        : isDarkSky
                        ? 'text-slate-300 hover:bg-white/10'
                        : 'text-slate-600 hover:bg-slate-200/70'
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
                        ? 'bg-slate-900 text-white'
                        : isDarkSky
                        ? 'text-slate-300 hover:bg-white/10'
                        : 'text-slate-600 hover:bg-slate-200/70'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Room Layouts
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={history.length === 0}
                    onClick={handleUndo}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors whitespace-nowrap disabled:opacity-35 ${
                      isDarkSky ? 'hover:bg-white/10' : 'hover:bg-slate-200/70'
                    }`}
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
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors whitespace-nowrap ${
                      isDarkSky
                        ? 'text-red-300 hover:bg-red-500/20'
                        : 'text-red-600 hover:bg-red-50'
                    }`}
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
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          categoryFilter === cat.id
                            ? isDarkSky
                              ? 'bg-white text-slate-900'
                              : 'bg-slate-900 text-white'
                            : isDarkSky
                            ? 'text-slate-300 hover:bg-white/10'
                            : 'text-slate-600 hover:bg-slate-200/70'
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
                              ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                              : isDarkSky
                              ? 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-100'
                              : 'bg-white border-slate-200 hover:border-slate-400 text-slate-900'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span
                              className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                                isActive
                                  ? 'bg-white/20 text-white'
                                  : isDarkSky
                                  ? 'bg-white/10 text-slate-200'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {getCategoryIcon(item.id)}
                            </span>
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-black/15"
                              style={{ backgroundColor: item.defaultColor }}
                            />
                          </div>
                          <div>
                            <div className="text-xs font-semibold truncate">{item.name}</div>
                            <div
                              className={`text-[11px] font-mono-tabular ${
                                isActive ? 'text-emerald-100' : 'opacity-60'
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
                    <span className="block text-xs font-medium opacity-75">Floor Finish</span>
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
                            className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-2 transition-colors whitespace-nowrap ${
                              active
                                ? 'bg-slate-900 text-white border-slate-900'
                                : isDarkSky
                                ? 'bg-white/5 border-white/10 hover:bg-white/10'
                                : 'bg-white border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-black/20"
                              style={{ backgroundColor: fl.color }}
                            />
                            {fl.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="block text-xs font-medium opacity-75">Wall Paint</span>
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
                            className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-2 transition-colors whitespace-nowrap ${
                              active
                                ? 'bg-slate-900 text-white border-slate-900'
                                : isDarkSky
                                ? 'bg-white/5 border-white/10 hover:bg-white/10'
                                : 'bg-white border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <span
                              className="w-3.5 h-3.5 rounded-full border border-black/20"
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
                          ? 'bg-slate-900 text-white border-slate-900'
                          : isDarkSky
                          ? 'bg-white/5 border-white/10 hover:bg-white/10'
                          : 'bg-white border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <span>{preset.name}</span>
                      <span className="opacity-55 font-mono-tabular">
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

      {/* Avatar Character Studio Modal */}
      <AvatarModal
        open={avatarModalOpen}
        config={avatarConfig}
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
    </div>
  );
}
