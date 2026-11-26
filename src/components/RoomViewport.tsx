import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createAvatarRig, type AvatarRig } from '../game/avatar';
import { sfx } from '../game/audio';
import {
  getCatalogItem,
  GRID_SIZE,
  HOTEL_RESIDENTS,
  PLAYER_SUITE_NUMBER,
} from '../game/catalog';
import { buildFurnitureGroup, updateFurnitureAnimations } from '../game/furniture';
import {
  findPath,
  getEffectiveSize,
  getItemWorldTransform,
  getSeatWorldInfo,
  isValidPlacement,
  isWorldPosWalkable,
  snapGrid,
} from '../game/gridMath';
import {
  CITY_LAYOUT,
  getCityLocationLabel,
  uzToWorldX,
  worldToU,
} from '../game/cityLayout';
import { buildHotelHallway, buildHotelLobby } from '../game/hotelBuilder';
import { buildRoomArchitecture, SUITE_DOOR_Z } from '../game/roomBuilder';
import {
  buildMainWorld,
  getCityGroundY,
  isMainWorldPosWalkable,
  resolveCityCameraScale,
} from '../game/worldBuilder';
import { createTransitBusMesh, createTransitStopMarker } from '../game/transitBuilder';
import { touchInput } from '../game/touchInput';
import { AVATAR_ZOOM_MIN_DISTANCE, dampValue, zoomTowardAvatar } from '../../shared/camera-zoom.mjs';
import type {
  ActiveResident,
  AvatarConfig,
  EmoteType,
  GameMode,
  LightingMood,
  PlacedItem,
  RoomSurfaceConfig,
  ViewMode,
  WorldLocation,
} from '../game/types';
import type { RemotePlayer, TransitLine, TransitVehicle } from '../net/realtime';

/** One live avatar for another connected player. */
interface RemoteRigEntry {
  rig: AvatarRig;
  signature: string;
  target: { x: number; y: number; z: number; yaw: number };
  emote: EmoteType;
  moving: boolean;
  phase: number;
}

const EMOTE_SET = new Set<string>(['idle', 'walk', 'sit', 'wave', 'dance', 'cheer', 'jump']);

/** Floating name label above a remote player. */
function createNameTag(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = 'bold 30px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = text.slice(0, 18);
    const width = Math.min(248, ctx.measureText(label).width + 30);
    ctx.fillStyle = 'rgba(5, 12, 7, 0.72)';
    ctx.beginPath();
    ctx.roundRect((256 - width) / 2, 10, width, 44, 14);
    ctx.fill();
    ctx.fillStyle = '#8eff78';
    ctx.fillText(label, 128, 34);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
  );
  sprite.scale.set(1.5, 0.375, 1);
  sprite.position.y = 2.05;
  return sprite;
}

interface RoomViewportProps {
  location: WorldLocation;
  hallwayFloor: number;
  unlockedRooms: string[];
  mainDoorUnlocked: boolean;
  roomDoorUnlocked: boolean;
  activeResident: ActiveResident | null;
  viewMode: ViewMode;
  mode: GameMode;
  items: PlacedItem[];
  surfaces: RoomSurfaceConfig;
  mood: LightingMood;
  avatarConfig: AvatarConfig;
  activeEmote: EmoteType;
  emoteTriggerId: number;
  selectedUid: string | null;
  placingCatalogId: string | null;
  placingRotation: 0 | 1 | 2 | 3;
  placingColor: string;
  movingUid: string | null;
  avatarZoom?: boolean;
  modalOpen?: boolean;
  isTouch?: boolean;
  remotePlayers?: RemotePlayer[];
  playerPoseRef?: React.MutableRefObject<{ x: number; z: number; yaw: number }>;
  transitLines?: TransitLine[];
  transitVehicles?: TransitVehicle[];
  ridingVehicle?: { x: number; y?: number; z: number; heading: number } | null;
  ridingLabel?: string | null;
  onBoardTransit?: (lineId: string, stopId: string) => void;
  onExitTransit?: () => void;
  onChangeLocation: (next: WorldLocation) => void;
  onSelectItem: (uid: string | null) => void;
  onPlaceItem: (candidate: Omit<PlacedItem, 'uid'>) => void;
  onFinishMove: (
    uid: string,
    gx: number,
    gz: number,
    rot: 0 | 1 | 2 | 3,
    wall?: 'north' | 'west'
  ) => void;
  onToggleInteractive: (uid: string) => void;
  onEmoteChange: (emote: EmoteType) => void;
  onWalkHint?: (text: string | null) => void;
  onNpcChat?: (speaker: string, message: string) => void;
  onPointerLockChange?: (locked: boolean) => void;
  onProximityPrompt?: (label: string | null) => void;
  onCityStreetChange?: (label: string) => void;
  onOpenDoorTerminal: () => void;
  onOpenElevator: () => void;
  onUnlockRoomDoor: () => void;
  onUnlockHallwayDoor: (roomNumber: string) => void;
  onEnterSuiteFromHallway: (roomNumber: string) => void;
}

const _vec3 = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();
const RESIDENT_NPC_POS = { x: 1.2, z: -1.6 };

function shortestAngleDiff(a: number, b: number): number {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

function buildPlazaPath(
  sx: number,
  sz: number,
  gx: number,
  gz: number
): { x: number; z: number }[] {
  const { bounds, loftCenter } = CITY_LAYOUT;
  const tz = Math.max(bounds.zMin + 0.5, Math.min(bounds.zMax - 0.5, gz));
  const rawU = worldToU(gx, tz);
  const clampedU = Math.max(bounds.uMin + 0.5, Math.min(bounds.uMax - 0.5, rawU));
  const tx = uzToWorldX(clampedU, tz);

  // Dodge central fountain around loftCenter + (0.6, 1.6)
  const fX = loftCenter.x + 0.6;
  const fZ = loftCenter.z + 1.6;
  const rsx = sx - fX;
  const rsz = sz - fZ;
  const rtx = tx - fX;
  const rtz = tz - fZ;
  const dx = rtx - rsx;
  const dz = rtz - rsz;
  const lenSq = dx * dx + dz * dz;
  if (lenSq > 0.01) {
    const t = Math.max(0, Math.min(1, -(rsx * dx + rsz * dz) / lenSq));
    const closestX = rsx + t * dx;
    const closestZ = rsz + t * dz;
    const dist = Math.hypot(closestX, closestZ);
    if (dist < 2.45) {
      const cross = rsx * rtz - rsz * rtx;
      const side = cross >= 0 ? 1 : -1;
      const len = Math.sqrt(lenSq);
      const perpX = (-dz / len) * side;
      const perpZ = (dx / len) * side;
      return [
        { x: fX + perpX * 2.9, z: fZ + perpZ * 2.9 },
        { x: tx, z: tz },
      ];
    }
  }
  return [{ x: tx, z: tz }];
}

export const RoomViewport: React.FC<RoomViewportProps> = ({
  location,
  hallwayFloor,
  unlockedRooms,
  mainDoorUnlocked,
  roomDoorUnlocked,
  activeResident,
  viewMode,
  mode,
  items,
  surfaces,
  mood,
  avatarConfig,
  activeEmote,
  emoteTriggerId,
  selectedUid,
  placingCatalogId,
  placingRotation,
  placingColor,
  movingUid,
  avatarZoom = false,
  modalOpen = false,
  isTouch = false,
  remotePlayers = [],
  playerPoseRef,
  transitLines = [],
  transitVehicles = [],
  ridingVehicle = null,
  ridingLabel = null,
  onBoardTransit,
  onExitTransit,
  onChangeLocation,
  onSelectItem,
  onPlaceItem,
  onFinishMove,
  onToggleInteractive,
  onEmoteChange,
  onWalkHint,
  onNpcChat,
  onPointerLockChange,
  onProximityPrompt,
  onCityStreetChange,
  onOpenDoorTerminal,
  onOpenElevator,
  onUnlockRoomDoor,
  onUnlockHallwayDoor,
  onEnterSuiteFromHallway,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webglError, setWebglError] = useState(false);
  // Camera distance/position captured the first time Z zoomed in, so the second
  // press returns to the exact previous view instead of a default.
  const zoomStateRef = useRef<{
    isometric?: {
      position: { x: number; y: number; z: number };
      target: { x: number; y: number; z: number };
    };
    playDist?: number;
  }>({});

  const activeItems =
    location === 'resident_room' && activeResident ? activeResident.items : items;
  const activeSurfaces =
    location === 'resident_room' && activeResident ? activeResident.surfaces : surfaces;
  const activeMood =
    location === 'resident_room' && activeResident ? activeResident.mood : mood;

  const propsRef = useRef({
    location,
    hallwayFloor,
    unlockedRooms,
    mainDoorUnlocked,
    roomDoorUnlocked,
    activeResident,
    viewMode,
    mode,
    items: activeItems,
    surfaces: activeSurfaces,
    mood: activeMood,
    avatarConfig,
    activeEmote,
    selectedUid,
    placingCatalogId,
    placingRotation,
    placingColor,
    movingUid,
    avatarZoom,
    modalOpen,
    isTouch,
    remotePlayers,
    playerPoseRef,
    transitLines,
    transitVehicles,
    ridingVehicle,
    ridingLabel,
    onBoardTransit,
    onExitTransit,
    onChangeLocation,
    onSelectItem,
    onPlaceItem,
    onFinishMove,
    onToggleInteractive,
    onEmoteChange,
    onWalkHint,
    onNpcChat,
    onPointerLockChange,
    onProximityPrompt,
    onCityStreetChange,
    onOpenDoorTerminal,
    onOpenElevator,
    onUnlockRoomDoor,
    onUnlockHallwayDoor,
    onEnterSuiteFromHallway,
  });
  propsRef.current = {
    location,
    hallwayFloor,
    unlockedRooms,
    mainDoorUnlocked,
    roomDoorUnlocked,
    activeResident,
    viewMode,
    mode,
    items: activeItems,
    surfaces: activeSurfaces,
    mood: activeMood,
    avatarConfig,
    activeEmote,
    selectedUid,
    placingCatalogId,
    placingRotation,
    placingColor,
    movingUid,
    avatarZoom,
    modalOpen,
    isTouch,
    remotePlayers,
    playerPoseRef,
    transitLines,
    transitVehicles,
    ridingVehicle,
    ridingLabel,
    onBoardTransit,
    onExitTransit,
    onChangeLocation,
    onSelectItem,
    onPlaceItem,
    onFinishMove,
    onToggleInteractive,
    onEmoteChange,
    onWalkHint,
    onNpcChat,
    onPointerLockChange,
    onProximityPrompt,
    onCityStreetChange,
    onOpenDoorTerminal,
    onOpenElevator,
    onUnlockRoomDoor,
    onUnlockHallwayDoor,
    onEnterSuiteFromHallway,
  };

  const prevLocationRef = useRef<{ loc: WorldLocation; roomNumber: string | null }>({
    loc: location,
    roomNumber: activeResident?.roomNumber ?? null,
  });

  const sceneHandlesRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    renderer: THREE.WebGLRenderer;
    maxAnisotropy: number;
    isSoftwareGl: boolean;
    roomContainer: THREE.Group;
    lobbyContainer: THREE.Group;
    hallwayContainer: THREE.Group;
    worldContainer: THREE.Group;
    furnitureRoot: THREE.Group;
    furnitureMap: Map<string, THREE.Group>;
    popAnimations: Map<string, number>;
    avatarRig: AvatarRig;
    residentNpcRig: AvatarRig;
    remoteRigs: Map<string, RemoteRigEntry>;
    roomHandles: ReturnType<typeof buildRoomArchitecture>;
    lobbyHandles: ReturnType<typeof buildHotelLobby>;
    hallwayHandles: ReturnType<typeof buildHotelHallway>;
    mainWorld: ReturnType<typeof buildMainWorld>;
    keyLight: THREE.DirectionalLight;
    hemiLight: THREE.HemisphereLight;
    fillLight: THREE.DirectionalLight;
    selectionBox: THREE.LineSegments;
    ghostGroup: THREE.Group | null;
    ghostKey: string;
    ghostState: {
      valid: boolean;
      gx: number;
      gz: number;
      wall?: 'north' | 'west';
    };
    wallCut: { north: boolean; west: boolean };
    cameraAnim: {
      active: boolean;
      pos: THREE.Vector3;
      target: THREE.Vector3;
    };
    playCam: {
      yaw: number;
      pitch: number;
      dist: number;
      /** Where the distance is easing to; Z changes only this. */
      targetDist: number;
      currentScale: number;
      lastManualLookTime: number;
    };
    avatarState: {
      x: number;
      z: number;
      y: number;
      yaw: number;
      path: { x: number; z: number }[];
      pendingSeat: {
        uid: string;
        seatPos: { x: number; y: number; z: number };
        facingYaw: number;
        exitPos?: { x: number; z: number };
      } | null;
      pendingPortal:
        | 'toWorld'
        | 'toLobby'
        | 'toHallway'
        | 'openDoorTerminal'
        | 'openElevator'
        | null;
      pendingHallDoor: string | null;
      pendingNpcId: string | null;
      seatedUid: string | null;
      seatExitPos: { x: number; z: number } | null;
      jumpVel: number;
      jumpY: number;
      stepTimer: number;
      doorSwingTimer: number;
      portalCooldown: number;
      residentGreetTimer: number;
    };
    standUp: () => void;
    ensureUnstuck: () => void;
  } | null>(null);

  // Initialize WebGL Scene once
  useEffect(() => {
    const mount = containerRef.current;
    if (!mount) return;

    const isSoftwareGl = (() => {
      try {
        const c = document.createElement('canvas');
        const gl = c.getContext('webgl2') || c.getContext('webgl');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      } catch {
        return true;
      }
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    // Without this a phone pan is claimed by the browser (scroll/zoom) and the
    // drag-look pointer events are cancelled mid-gesture.
    renderer.domElement.style.touchAction = 'none';
    mount.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglError(true);
    };
    const onContextRestored = () => setWebglError(false);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#dfe8f2');
    scene.fog = new THREE.Fog('#dfe8f2', 32, 72);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      36,
      mount.clientWidth / mount.clientHeight,
      0.1,
      900
    );
    camera.position.set(14.5, 12.0, 14.5);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 0.85, 0);
    controls.minDistance = 5.0;
    controls.maxDistance = 30;
    controls.minPolarAngle = 0.25;
    controls.maxPolarAngle = Math.PI / 2 - 0.1;
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;
    controls.update();

    const hemiLight = new THREE.HemisphereLight(0xdceeff, 0x9c826b, 0.78);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.9);
    keyLight.position.set(-12, 16, 8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 70;
    const d = 16;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);
    scene.add(keyLight.target);

    const fillLight = new THREE.DirectionalLight(0xbcd6ff, 0.52);
    fillLight.position.set(10, 8, -9);
    scene.add(fillLight);

    // 1. Hotel Suite Container (14x14m room + furniture + resident NPC)
    const roomContainer = new THREE.Group();
    scene.add(roomContainer);

    const roomHandles = buildRoomArchitecture(
      propsRef.current.surfaces.floor,
      propsRef.current.surfaces.wall,
      maxAnisotropy
    );
    roomContainer.add(roomHandles.roomGroup);

    const furnitureRoot = new THREE.Group();
    roomContainer.add(furnitureRoot);

    const residentNpcRig = createAvatarRig(HOTEL_RESIDENTS[0].avatar);
    residentNpcRig.root.position.set(RESIDENT_NPC_POS.x, 0, RESIDENT_NPC_POS.z);
    residentNpcRig.root.userData.isResidentNpc = true;
    residentNpcRig.root.visible = false;
    roomContainer.add(residentNpcRig.root);

    const boxEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.08, 1));
    const selectionBox = new THREE.LineSegments(
      boxEdges,
      new THREE.LineBasicMaterial({ color: 0x39ff14 })
    );
    selectionBox.visible = false;
    roomContainer.add(selectionBox);

    // 2. Hotel Main Lobby Container
    const lobbyContainer = new THREE.Group();
    const lobbyHandles = buildHotelLobby(maxAnisotropy);
    lobbyContainer.add(lobbyHandles.lobbyGroup);
    scene.add(lobbyContainer);

    // 3. Hotel Upper Floor Hallway Container
    const hallwayContainer = new THREE.Group();
    const hallwayHandles = buildHotelHallway(maxAnisotropy);
    hallwayHandles.setFloorState(
      propsRef.current.hallwayFloor,
      new Set(propsRef.current.unlockedRooms),
      HOTEL_RESIDENTS,
      propsRef.current.avatarConfig.name,
      maxAnisotropy
    );
    hallwayContainer.add(hallwayHandles.hallwayGroup);
    scene.add(hallwayContainer);

    // 4. Main City Outdoor Container
    const worldContainer = new THREE.Group();
    const mainWorld = buildMainWorld(maxAnisotropy, isSoftwareGl);
    worldContainer.add(mainWorld.worldGroup);
    scene.add(worldContainer);

    // Rideable LoftLine vehicles + stop markers (server-owned positions).
    const transitGroup = new THREE.Group();
    transitGroup.name = 'loftline';
    scene.add(transitGroup);
    const transitMeshes = new Map<string, THREE.Group>();
    const stopMarkers = new Map<string, THREE.Group>();

    // Visibility sync on boot
    roomContainer.visible =
      propsRef.current.location === 'room' || propsRef.current.location === 'resident_room';
    lobbyContainer.visible = propsRef.current.location === 'lobby';
    hallwayContainer.visible = propsRef.current.location === 'hallway';
    worldContainer.visible = propsRef.current.location === 'world';

    // 5. Player Avatar
    const avatarRig = createAvatarRig(propsRef.current.avatarConfig);
    avatarRig.root.position.set(0.5, 0, 1.8);
    scene.add(avatarRig.root);

    const rippleMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.27, 28),
      new THREE.MeshBasicMaterial({
        color: 0x39ff14,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    rippleMesh.rotation.x = -Math.PI / 2;
    rippleMesh.position.y = 0.03;
    scene.add(rippleMesh);
    let rippleLife = 0;

    const handles = {
      scene,
      camera,
      controls,
      renderer,
      maxAnisotropy,
      isSoftwareGl,
      roomContainer,
      lobbyContainer,
      hallwayContainer,
      worldContainer,
      furnitureRoot,
      furnitureMap: new Map<string, THREE.Group>(),
      popAnimations: new Map<string, number>(),
      avatarRig,
      residentNpcRig,
      remoteRigs: new Map<string, RemoteRigEntry>(),
      roomHandles,
      lobbyHandles,
      hallwayHandles,
      mainWorld,
      keyLight,
      hemiLight,
      fillLight,
      selectionBox,
      ghostGroup: null as THREE.Group | null,
      ghostKey: '',
      ghostState: { valid: false, gx: 0, gz: 0, wall: undefined as 'north' | 'west' | undefined },
      wallCut: { north: false, west: false },
      cameraAnim: {
        active: false,
        pos: new THREE.Vector3(),
        target: new THREE.Vector3(),
      },
      playCam: {
        yaw: 0,
        pitch: 0.26,
        dist: 3.7,
        targetDist: 3.7,
        currentScale: 1.0,
        lastManualLookTime: 0,
      },
      avatarState: {
        x: 0.5,
        z: 1.8,
        y: 0,
        yaw: 0,
        path: [] as { x: number; z: number }[],
        pendingSeat: null as {
          uid: string;
          seatPos: { x: number; y: number; z: number };
          facingYaw: number;
          exitPos?: { x: number; z: number };
        } | null,
        pendingPortal: null as
          | 'toWorld'
          | 'toLobby'
          | 'toHallway'
          | 'openDoorTerminal'
          | 'openElevator'
          | null,
        pendingHallDoor: null as string | null,
        pendingNpcId: null as string | null,
        seatedUid: null as string | null,
        seatExitPos: null as { x: number; z: number } | null,
        jumpVel: 0,
        jumpY: 0,
        stepTimer: 0,
        doorSwingTimer: 0,
        portalCooldown: 0,
        residentGreetTimer: 0,
      },
      standUp: () => {},
      ensureUnstuck: () => {},
    };
    sceneHandlesRef.current = handles;

    // Development-only probe for the browser smoke tests. Read-only, and gone
    // from production builds.
    if ((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV) {
      (window as unknown as Record<string, unknown>).__loftlife = {
        camera: () => camera.position.toArray(),
        cutaway: () => ({ ...handles.wallCut }),
        view: () => propsRef.current.viewMode,
        mode: () => propsRef.current.mode,
        location: () => propsRef.current.location,
        avatar: () => ({ x: handles.avatarState.x, z: handles.avatarState.z }),
        wallItems: () =>
          propsRef.current.items
            .filter((item) => item.wall === 'north' || item.wall === 'west')
            .map((item) => ({
              wall: item.wall,
              visible: handles.furnitureMap.get(item.uid)?.visible ?? null,
            })),
      };
    }

    controls.addEventListener('start', () => {
      handles.cameraAnim.active = false;
    });

    const releaseCursorForModal = () => {
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock?.();
      }
      for (const k of Object.keys(keys)) keys[k] = false;
    };

    function checkWalkableForLoc(x: number, z: number, loc: WorldLocation, list: PlacedItem[]) {
      if (loc === 'world') {
        return isMainWorldPosWalkable(
          x,
          z,
          mainWorld.obstacles,
          0.28,
          propsRef.current.mainDoorUnlocked
        );
      }
      if (loc === 'lobby') return lobbyHandles.isWalkable(x, z);
      if (loc === 'hallway') return hallwayHandles.isWalkable(x, z);
      const suiteOpen = loc === 'resident_room' || propsRef.current.roomDoorUnlocked;
      return isWorldPosWalkable(x, z, list, 0.25, suiteOpen);
    }

    function findNearestWalkable(
      fromX: number,
      fromZ: number,
      prefX: number,
      prefZ: number,
      loc: WorldLocation,
      list: PlacedItem[]
    ): { x: number; z: number } {
      if (checkWalkableForLoc(prefX, prefZ, loc, list)) {
        return { x: prefX, z: prefZ };
      }
      if (checkWalkableForLoc(fromX, fromZ, loc, list)) {
        return { x: fromX, z: fromZ };
      }
      for (let r = 0.2; r <= 3.6; r += 0.2) {
        let best: { x: number; z: number } | null = null;
        let bestScore = Infinity;
        for (let i = 0; i < 16; i++) {
          const ang = (i / 16) * Math.PI * 2;
          const cx = fromX + Math.cos(ang) * r;
          const cz = fromZ + Math.sin(ang) * r;
          if (checkWalkableForLoc(cx, cz, loc, list)) {
            const score = Math.hypot(cx - prefX, cz - prefZ);
            if (score < bestScore) {
              bestScore = score;
              best = { x: cx, z: cz };
            }
          }
        }
        if (best) return best;
      }
      return { x: fromX, z: fromZ };
    }

    function standUpFromSeat() {
      const av = handles.avatarState;
      const curLoc = propsRef.current.location;
      const curList = propsRef.current.items;
      if (av.seatedUid) {
        const pref = av.seatExitPos ?? { x: av.x, z: av.z };
        const safe = findNearestWalkable(av.x, av.z, pref.x, pref.z, curLoc, curList);
        av.x = safe.x;
        av.z = safe.z;
        av.seatedUid = null;
        av.seatExitPos = null;
      }
      av.y = curLoc === 'world' ? getCityGroundY(av.x, av.z) : 0;
    }

    function sitOnSeat(
      uid: string,
      seatPos: { x: number; y: number; z: number },
      facingYaw: number,
      approachPos?: { x: number; z: number }
    ) {
      const av = handles.avatarState;
      const curLoc = propsRef.current.location;
      const curList = propsRef.current.items;
      const pref =
        approachPos && checkWalkableForLoc(approachPos.x, approachPos.z, curLoc, curList)
          ? approachPos
          : { x: av.x, z: av.z };
      av.seatExitPos = findNearestWalkable(
        seatPos.x,
        seatPos.z,
        pref.x,
        pref.z,
        curLoc,
        curList
      );
      av.path = [];
      av.x = seatPos.x;
      av.y = seatPos.y - 0.35;
      av.z = seatPos.z;
      av.yaw = facingYaw;
      av.seatedUid = uid;
    }

    handles.standUp = standUpFromSeat;
    handles.ensureUnstuck = () => {
      const av = handles.avatarState;
      const curLoc = propsRef.current.location;
      const curList = propsRef.current.items;
      if (!av.seatedUid && !checkWalkableForLoc(av.x, av.z, curLoc, curList)) {
        const safe = findNearestWalkable(av.x, av.z, av.x, av.z, curLoc, curList);
        av.x = safe.x;
        av.z = safe.z;
      }
    };

    // Unified proximity action evaluation (runs in Isometric Walk & Play View!)
    let lastPrompt: string | null = null;
    // Phones have no E key, so contextual actions are tapped and the prompt says so.
    const actionLabel = (text: string) =>
      propsRef.current.isTouch ? `Tap · ${text}` : `Press E · ${text}`;
    function getNearbyAction(): { label: string; execute: () => void } | null {
      const {
        location: loc,
        mode: curMode,
        items: list,
        roomDoorUnlocked: suiteUnlocked,
        mainDoorUnlocked: hotelDoorUnlocked,
        activeResident: resident,
      } = propsRef.current;

      if (propsRef.current.modalOpen) return null;
      if (loc === 'room' && curMode === 'edit') return null;

      const av = handles.avatarState;

      // Riding: the only contextual action is stepping off at the next stop.
      if (propsRef.current.ridingVehicle) {
        return {
          label: actionLabel(`Step off ${propsRef.current.ridingLabel ?? 'the LoftLine'}`),
          execute: () => {
            sfx.playClick();
            propsRef.current.onExitTransit?.();
          },
        };
      }

      if (av.seatedUid) {
        return {
          label: actionLabel('Stand Up'),
          execute: () => {
            standUpFromSeat();
            propsRef.current.onEmoteChange('idle');
            sfx.playClick();
          },
        };
      }

      // 1. Inside Player Suite (402) or Resident Suite
      if (loc === 'room' || loc === 'resident_room') {
        if (Math.hypot(av.x - -6.4, av.z - SUITE_DOOR_Z) < 1.75) {
          if (loc === 'room' && !suiteUnlocked) {
            return {
              label: actionLabel(`Enter Keycard (Suite ${PLAYER_SUITE_NUMBER})`),
              execute: () => {
                sfx.playKeycardBeep();
                av.doorSwingTimer = 2.0;
                propsRef.current.onUnlockRoomDoor();
                propsRef.current.onWalkHint?.(
                  `Keycard accepted · Suite ${PLAYER_SUITE_NUMBER} door unlocked! Walk out to Hallway`
                );
              },
            };
          }
          return {
            label: actionLabel('Exit to Floor Hallway'),
            execute: () => {
              sfx.playToggle(true);
              propsRef.current.onChangeLocation('hallway');
            },
          };
        }

        if (
          loc === 'resident_room' &&
          resident &&
          Math.hypot(av.x - RESIDENT_NPC_POS.x, av.z - RESIDENT_NPC_POS.z) < 2.2
        ) {
          return {
            label: actionLabel(`Talk to ${resident.name}`),
            execute: () => {
              av.residentGreetTimer = 4.0;
              propsRef.current.onEmoteChange('wave');
              propsRef.current.onNpcChat?.(resident.name, resident.greeting);
              sfx.playEmote();
            },
          };
        }

        let bestDist = 1.25;
        let bestItem: PlacedItem | null = null;
        for (const it of list) {
          const cat = getCatalogItem(it.catalogId);
          if (!cat || (!cat.interactive && !cat.sittable)) continue;
          const [ew, ed] = getEffectiveSize(it.catalogId, it.rot);
          const minX = -GRID_SIZE / 2 + it.gx;
          const maxX = -GRID_SIZE / 2 + it.gx + ew;
          const minZ = -GRID_SIZE / 2 + it.gz;
          const maxZ = -GRID_SIZE / 2 + it.gz + ed;
          const cx = Math.max(minX, Math.min(av.x, maxX));
          const cz = Math.max(minZ, Math.min(av.z, maxZ));
          const dist = Math.hypot(av.x - cx, av.z - cz);
          if (dist < bestDist) {
            bestDist = dist;
            bestItem = it;
          }
        }
        if (bestItem) {
          const cat = getCatalogItem(bestItem.catalogId)!;
          if (cat.interactive) {
            return {
              label: actionLabel(`${bestItem.active ? 'Turn Off' : 'Turn On'} ${cat.name}`),
              execute: () => {
                if (loc === 'room') {
                  sfx.playToggle(!bestItem!.active);
                  propsRef.current.onToggleInteractive(bestItem!.uid);
                  propsRef.current.onWalkHint?.(
                    `${cat.name} turned ${!bestItem!.active ? 'on' : 'off'}`
                  );
                } else {
                  propsRef.current.onWalkHint?.(`${resident?.name || 'Resident'}'s ${cat.name}`);
                }
              },
            };
          }
          if (cat.sittable) {
            const seatInfo = getSeatWorldInfo(bestItem);
            if (seatInfo) {
              return {
                label: actionLabel(`Sit on ${cat.name}`),
                execute: () => {
                  sitOnSeat(
                    bestItem!.uid,
                    seatInfo.seatPos,
                    seatInfo.facingYaw,
                    seatInfo.approachPos
                  );
                  propsRef.current.onEmoteChange('sit');
                  sfx.playClick();
                },
              };
            }
          }
        }
        return null;
      }

      // 2. Inside Hotel Hallway (Floors 2, 3, 4)
      if (loc === 'hallway') {
        if (
          Math.hypot(av.x - hallwayHandles.elevatorPos.x, av.z - hallwayHandles.elevatorPos.z) <
          1.95
        ) {
          return {
            label: actionLabel('Ride Elevator'),
            execute: () => {
              releaseCursorForModal();
              sfx.playElevatorDing();
              propsRef.current.onOpenElevator();
            },
          };
        }

        for (const d of hallwayHandles.doors) {
          if (Math.hypot(av.x - d.x, av.z - d.z) < 1.7) {
            if (d.unlocked) {
              const ownerLabel = d.isPlayerSuite
                ? `Your Suite ${d.roomNumber}`
                : `${d.resident?.name}'s Suite ${d.roomNumber}`;
              return {
                label: actionLabel(`Enter ${ownerLabel}`),
                execute: () => {
                  sfx.playToggle(true);
                  propsRef.current.onEnterSuiteFromHallway(d.roomNumber);
                },
              };
            }
            if (d.isPlayerSuite) {
              return {
                label: actionLabel(`Enter Keycard (Suite ${d.roomNumber})`),
                execute: () => {
                  sfx.playKeycardBeep();
                  propsRef.current.onUnlockHallwayDoor(d.roomNumber);
                  propsRef.current.onWalkHint?.(
                    `Keycard accepted · Walk through to enter Suite ${d.roomNumber}`
                  );
                },
              };
            }
            if (d.resident) {
              const targetRes = d.resident;
              return {
                label: actionLabel(`Ring ${targetRes.name} (Suite ${d.roomNumber})`),
                execute: () => {
                  sfx.playIntercomRing();
                  propsRef.current.onWalkHint?.(
                    `Ringing ${targetRes.name} in Suite ${d.roomNumber}...`
                  );
                  window.setTimeout(() => {
                    sfx.playKeycardBeep();
                    propsRef.current.onUnlockHallwayDoor(d.roomNumber);
                    propsRef.current.onNpcChat?.(
                      targetRes.name,
                      `Come on in! Suite ${d.roomNumber} is unlocked now.`
                    );
                  }, 550);
                },
              };
            }
            return {
              label: `Suite ${d.roomNumber} · Vacant Room`,
              execute: () => {
                sfx.playRemove();
                propsRef.current.onWalkHint?.(`Suite ${d.roomNumber} is currently vacant`);
              },
            };
          }
        }
        return null;
      }

      // 3. Inside Main Hotel Lobby
      if (loc === 'lobby') {
        if (
          Math.hypot(av.x - lobbyHandles.elevatorPos.x, av.z - lobbyHandles.elevatorPos.z) < 2.05
        ) {
          return {
            label: actionLabel('Ride Elevator'),
            execute: () => {
              releaseCursorForModal();
              sfx.playElevatorDing();
              propsRef.current.onOpenElevator();
            },
          };
        }
        if (
          Math.hypot(av.x - lobbyHandles.streetDoorPos.x, av.z - lobbyHandles.streetDoorPos.z) <
          1.95
        ) {
          return {
            label: actionLabel('Exit to Main City'),
            execute: () => {
              sfx.playToggle(true);
              propsRef.current.onChangeLocation('world');
            },
          };
        }
        for (const npc of lobbyHandles.npcs) {
          if (Math.hypot(av.x - (npc.x + 2.0), av.z - npc.z) < 2.15) {
            return {
              label: actionLabel(`Talk to ${npc.name}`),
              execute: () => {
                npc.greetTimer = 4.0;
                av.yaw = Math.atan2(npc.x - av.x, npc.z - av.z);
                propsRef.current.onEmoteChange('wave');
                propsRef.current.onNpcChat?.(npc.name, npc.greeting);
                sfx.playEmote();
              },
            };
          }
        }
        for (const s of lobbyHandles.seats) {
          if (Math.hypot(av.x - s.seatPos.x, av.z - s.seatPos.z) < 1.95) {
            return {
              label: actionLabel(`Sit on ${s.label}`),
              execute: () => {
                sitOnSeat(s.id, s.seatPos, s.facingYaw, s.approachPos);
                propsRef.current.onEmoteChange('sit');
                sfx.playClick();
              },
            };
          }
        }
        return null;
      }

      // 4. Outdoor Main City ('world')
      if (
        Math.hypot(av.x - mainWorld.loftDoorEntryPos.x, av.z - mainWorld.loftDoorEntryPos.z) <
        2.5
      ) {
        return {
          label: hotelDoorUnlocked
            ? actionLabel('Enter Main Lobby')
            : actionLabel('Enter Keycard or Ring Active User'),
          execute: () => {
            releaseCursorForModal();
            sfx.playClick();
            propsRef.current.onOpenDoorTerminal();
          },
        };
      }
      if (
        Math.hypot(
          av.x - mainWorld.djDeckGroup.position.x,
          av.z - mainWorld.djDeckGroup.position.z
        ) < 2.1
      ) {
        return {
          label: actionLabel('Toggle Dance Lights'),
          execute: () => {
            const isOn = mainWorld.togglePartyMode();
            sfx.playToggle(isOn);
            propsRef.current.onWalkHint?.(
              isOn ? 'Plaza Dance Floor lights ON' : 'Plaza Dance Floor lights dimmed'
            );
          },
        };
      }
      for (const npc of mainWorld.npcs) {
        if (Math.hypot(av.x - npc.x, av.z - npc.z) < 2.1) {
          return {
            label: actionLabel(`Talk to ${npc.name}`),
            execute: () => {
              npc.greetTimer = 4.0;
              av.yaw = Math.atan2(npc.x - av.x, npc.z - av.z);
              propsRef.current.onEmoteChange('wave');
              propsRef.current.onNpcChat?.(npc.name, npc.greeting);
              sfx.playEmote();
            },
          };
        }
      }
      for (const s of mainWorld.seats) {
        if (Math.hypot(av.x - s.seatPos.x, av.z - s.seatPos.z) < 1.75) {
          return {
            label: actionLabel(`Sit on ${s.label}`),
            execute: () => {
              sitOnSeat(s.id, s.seatPos, s.facingYaw, s.approachPos);
              propsRef.current.onEmoteChange('sit');
              sfx.playClick();
            },
          };
        }
      }
      // LoftLine stops: board the server-driven bus.
      for (const line of propsRef.current.transitLines ?? []) {
        for (const stop of line.stops) {
          if (Math.hypot(av.x - stop.x, av.z - stop.z) < 6) {
            return {
              label: actionLabel(`Board ${line.label} at ${stop.name}`),
              execute: () => {
                sfx.playClick();
                propsRef.current.onBoardTransit?.(line.id, stop.id);
              },
            };
          }
        }
      }
      return null;
    }

    const keys: Record<string, boolean> = {};
    const onKeyDown = (e: KeyboardEvent) => {
      if (propsRef.current.modalOpen) return;
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)
      ) {
        return;
      }
      keys[e.code] = true;

      if (e.code === 'KeyE') {
        const action = getNearbyAction();
        if (action) {
          e.preventDefault();
          action.execute();
        }
      }

      if (
        e.code === 'Space' &&
        (propsRef.current.mode === 'walk' || propsRef.current.location !== 'room')
      ) {
        e.preventDefault();
        const av = handles.avatarState;
        if (av.seatedUid) {
          standUpFromSeat();
          propsRef.current.onEmoteChange('idle');
        }
        if (av.jumpY <= 0.001) {
          av.jumpVel = 4.4;
          sfx.playClick();
        }
      }
      if (e.code === 'KeyR' && dragCandidate?.active) {
        const cat = getCatalogItem(dragCandidate.catalogId);
        if (cat && cat.layer !== 'wall') {
          e.preventDefault();
          e.stopImmediatePropagation();
          dragCandidate.rot = ((dragCandidate.rot + 1) % 4) as 0 | 1 | 2 | 3;
          sfx.playClick();
          updateGhostAtPointer(lastLookX, lastLookY);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };
    const onWindowBlur = () => {
      for (const k of Object.keys(keys)) keys[k] = false;
      draggingLook = false;
      if (dragCandidate) {
        clearDragGhost();
        if (propsRef.current.viewMode !== 'play') controls.enabled = true;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);

    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === renderer.domElement;
      propsRef.current.onPointerLockChange?.(locked);
    };
    document.addEventListener('pointerlockchange', onPointerLockChange);

    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2();
    let downX = 0;
    let downY = 0;
    let lastLookX = 0;
    let lastLookY = 0;
    let draggingLook = false;
    let lastMoveRaycast = 0;
    let dragCandidate: {
      uid: string;
      catalogId: string;
      rot: 0 | 1 | 2 | 3;
      color: string;
      startX: number;
      startY: number;
      active: boolean;
    } | null = null;
    let dragGhostGroup: THREE.Group | null = null;

    function clearDragGhost() {
      if (dragGhostGroup) {
        scene.remove(dragGhostGroup);
        dragGhostGroup = null;
      }
      if (dragCandidate) {
        const orig = handles.furnitureMap.get(dragCandidate.uid);
        if (orig) orig.visible = true;
        dragCandidate = null;
      }
    }

    function updateNDC(clientX: number, clientY: number) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    }

    function updateGhostAtPointer(clientX: number, clientY: number) {
      const {
        location: loc,
        mode: m,
        placingCatalogId: pId,
        movingUid: mUid,
        placingRotation: pRot,
        items: list,
      } = propsRef.current;

      const isDirectDrag = Boolean(dragCandidate && dragCandidate.active);
      const targetGhost = isDirectDrag ? dragGhostGroup : handles.ghostGroup;

      if (loc !== 'room' || m !== 'edit' || (!pId && !mUid && !isDirectDrag)) {
        if (handles.ghostGroup) handles.ghostGroup.visible = false;
        if (dragGhostGroup) dragGhostGroup.visible = false;
        return;
      }

      const activeUid = isDirectDrag ? dragCandidate!.uid : mUid ?? undefined;
      const rot = isDirectDrag ? dragCandidate!.rot : pRot;
      const activeCatalogId = isDirectDrag
        ? dragCandidate!.catalogId
        : pId || list.find((it) => it.uid === mUid)?.catalogId || null;
      if (!activeCatalogId) return;
      const cat = getCatalogItem(activeCatalogId);
      if (!cat) return;

      updateNDC(clientX, clientY);
      raycaster.setFromCamera(pointerNDC, camera);

      let gx = 0;
      let gz = 0;
      let wall: 'north' | 'west' | undefined;
      let foundHit = false;

      if (cat.layer === 'wall') {
        const wallHits = raycaster.intersectObjects([
          roomHandles.northWallRaycastPlane,
          roomHandles.westWallRaycastPlane,
        ]);
        if (wallHits.length > 0) {
          const hit = wallHits[0];
          foundHit = true;
          if (hit.object === roomHandles.westWallRaycastPlane) {
            wall = 'west';
            gx = 0;
            gz = snapGrid(hit.point.z + GRID_SIZE / 2 - cat.size[0] / 2);
            gz = Math.max(0, Math.min(GRID_SIZE - cat.size[0], gz));
          } else {
            wall = 'north';
            gz = 0;
            gx = snapGrid(hit.point.x + GRID_SIZE / 2 - cat.size[0] / 2);
            gx = Math.max(0, Math.min(GRID_SIZE - cat.size[0], gx));
          }
        }
      } else {
        const floorHits = raycaster.intersectObject(roomHandles.floorRaycastPlane);
        if (floorHits.length > 0) {
          foundHit = true;
          const pt = floorHits[0].point;
          const [ew, ed] = getEffectiveSize(activeCatalogId, rot);
          gx = snapGrid(pt.x + GRID_SIZE / 2 - ew / 2);
          gz = snapGrid(pt.z + GRID_SIZE / 2 - ed / 2);
          gx = Math.max(0, Math.min(GRID_SIZE - ew, gx));
          gz = Math.max(0, Math.min(GRID_SIZE - ed, gz));
        }
      }

      if (!foundHit || !targetGhost) {
        if (targetGhost) targetGhost.visible = false;
        return;
      }

      const valid = isValidPlacement(
        {
          uid: activeUid,
          catalogId: activeCatalogId,
          gx,
          gz,
          rot: cat.layer === 'wall' ? (wall === 'west' ? 1 : 0) : rot,
          wall,
          color: '#ffffff',
        },
        list
      );

      handles.ghostState = { valid, gx, gz, wall };
      const t = getItemWorldTransform({
        uid: 'ghost',
        catalogId: activeCatalogId,
        gx,
        gz,
        rot: cat.layer === 'wall' ? (wall === 'west' ? 1 : 0) : rot,
        wall,
        color: '#ffffff',
      });
      targetGhost.visible = true;
      targetGhost.position.set(t.x, t.y + 0.01, t.z);
      targetGhost.rotation.y = t.rotY;

      const tint = valid ? 0x39ff14 : 0xf87171;
      targetGhost.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mat = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial;
          mat.color.setHex(tint);
        }
      });
    }

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
      lastLookX = e.clientX;
      lastLookY = e.clientY;
      if (propsRef.current.viewMode === 'play') {
        draggingLook = true;
        return;
      }
      if (
        e.button === 0 &&
        !propsRef.current.modalOpen &&
        propsRef.current.location === 'room' &&
        propsRef.current.mode === 'edit' &&
        !propsRef.current.placingCatalogId &&
        !propsRef.current.movingUid
      ) {
        updateNDC(e.clientX, e.clientY);
        raycaster.setFromCamera(pointerNDC, camera);
        const furHits = raycaster.intersectObjects(furnitureRoot.children, true);
        if (furHits.length > 0) {
          let obj: THREE.Object3D | null = furHits[0].object;
          while (obj && !obj.userData.uid) obj = obj.parent;
          const uid = obj?.userData.uid as string | undefined;
          const item = uid ? propsRef.current.items.find((it) => it.uid === uid) : undefined;
          if (item) {
            dragCandidate = {
              uid: item.uid,
              catalogId: item.catalogId,
              rot: item.rot,
              color: item.color,
              startX: e.clientX,
              startY: e.clientY,
              active: false,
            };
            controls.enabled = false;
          }
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (propsRef.current.modalOpen) return;
      if (propsRef.current.viewMode === 'play') {
        const isLocked = document.pointerLockElement === renderer.domElement;
        if (isLocked || draggingLook) {
          const mx = isLocked ? e.movementX : e.clientX - lastLookX;
          const my = isLocked ? e.movementY : e.clientY - lastLookY;
          lastLookX = e.clientX;
          lastLookY = e.clientY;
          handles.playCam.lastManualLookTime = performance.now();
          // A finger needs a little more travel per pixel than a mouse; a
          // full-width swipe still turns roughly half a circle.
          const lookScale = propsRef.current.isTouch ? 1.35 : 1;
          handles.playCam.yaw -= mx * 0.0042 * lookScale;
          handles.playCam.pitch = THREE.MathUtils.clamp(
            handles.playCam.pitch + my * 0.0036 * lookScale,
            -0.22,
            1.02
          );
        }
        return;
      }

      lastLookX = e.clientX;
      lastLookY = e.clientY;

      if (dragCandidate && !dragCandidate.active) {
        if (Math.hypot(e.clientX - dragCandidate.startX, e.clientY - dragCandidate.startY) > 5) {
          dragCandidate.active = true;
          const orig = handles.furnitureMap.get(dragCandidate.uid);
          if (orig) orig.visible = false;
          handles.selectionBox.visible = false;
          dragGhostGroup = buildFurnitureGroup(
            {
              uid: 'ghost',
              catalogId: dragCandidate.catalogId,
              gx: 0,
              gz: 0,
              rot: dragCandidate.rot,
              color: dragCandidate.color,
            },
            { maxAnisotropy: handles.maxAnisotropy, isGhost: true, isSoftwareGl: handles.isSoftwareGl }
          );
          dragGhostGroup.visible = false;
          scene.add(dragGhostGroup);
          updateGhostAtPointer(e.clientX, e.clientY);
          return;
        }
      }

      const now = performance.now();
      if (now - lastMoveRaycast < 24) return;
      lastMoveRaycast = now;

      if (propsRef.current.location === 'room' && propsRef.current.mode === 'edit') {
        updateGhostAtPointer(e.clientX, e.clientY);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      draggingLook = false;
      if (propsRef.current.viewMode !== 'play') {
        controls.enabled = true;
      }
      if (dragCandidate) {
        const cand = dragCandidate;
        if (cand.active) {
          updateGhostAtPointer(e.clientX, e.clientY);
          const { valid, gx, gz, wall } = handles.ghostState;
          clearDragGhost();
          if (valid && !propsRef.current.modalOpen) {
            const cat = getCatalogItem(cand.catalogId);
            sfx.playPlace();
            propsRef.current.onFinishMove(
              cand.uid,
              gx,
              gz,
              cat?.layer === 'wall' ? (wall === 'west' ? 1 : 0) : cand.rot,
              wall
            );
          } else {
            sfx.playRemove();
          }
          return;
        }
        clearDragGhost();
      }
      if (propsRef.current.modalOpen) return;
      const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (dist > 6) return;

      // In Play View: clicking canvas requests Pointer Lock for free mouse-look.
      // Phones skip this: a tap is an interaction, not a cursor grab.
      if (propsRef.current.viewMode === 'play' && !propsRef.current.isTouch) {
        if (document.pointerLockElement !== renderer.domElement) {
          try {
            const maybePromise = renderer.domElement.requestPointerLock?.() as unknown as Promise<void> | undefined;
            if (maybePromise && typeof maybePromise.catch === 'function') {
              maybePromise.catch(() => {});
            }
          } catch {
            // Pointer lock may be blocked in some iframes; drag-look remains active
          }
        }
        return;
      }

      const {
        location: loc,
        mode: m,
        items: list,
        placingCatalogId: pId,
        placingRotation: rot,
        placingColor: pColor,
        movingUid: mUid,
      } = propsRef.current;

      updateNDC(e.clientX, e.clientY);
      raycaster.setFromCamera(pointerNDC, camera);
      const av = handles.avatarState;

      // ---------------- 1. MAIN WORLD INTERACTIONS ----------------
      if (loc === 'world') {
        // Tapping a LoftLine stop or the bus itself boards / steps off it.
        if (propsRef.current.isTouch) {
          const transitHits = raycaster.intersectObject(transitGroup, true);
          if (transitHits.length > 0) {
            const transitAction = getNearbyAction();
            if (transitAction) {
              transitAction.execute();
              return;
            }
          }
        }

        const portalHits = raycaster.intersectObject(mainWorld.loftPortalGroup, true);
        if (portalHits.length > 0) {
          standUpFromSeat();
          av.pendingSeat = null;
          av.pendingNpcId = null;
          av.pendingHallDoor = null;

          const unlocked = propsRef.current.mainDoorUnlocked;
          const nearDoor =
            Math.hypot(av.x - mainWorld.loftDoorEntryPos.x, av.z - mainWorld.loftDoorEntryPos.z) <
            2.6;

          if (!unlocked && nearDoor) {
            releaseCursorForModal();
            sfx.playClick();
            propsRef.current.onOpenDoorTerminal();
            return;
          }

          if (unlocked) {
            av.path = buildPlazaPath(
              av.x,
              av.z,
              mainWorld.loftDoorThresholdPos.x,
              mainWorld.loftDoorThresholdPos.z
            );
            av.pendingPortal = 'toLobby';
            propsRef.current.onWalkHint?.('Walking through Hotel Main Doors...');
          } else {
            av.path = buildPlazaPath(
              av.x,
              av.z,
              mainWorld.loftDoorEntryPos.x,
              mainWorld.loftDoorEntryPos.z
            );
            av.pendingPortal = 'openDoorTerminal';
            propsRef.current.onWalkHint?.('Walking to Hotel Main Entrance Intercom...');
          }
          propsRef.current.onEmoteChange('walk');
          sfx.playClick();
          return;
        }

        const npcRoots = mainWorld.npcs.map((n) => n.rig.root);
        const npcHits = raycaster.intersectObjects(npcRoots, true);
        if (npcHits.length > 0) {
          let obj: THREE.Object3D | null = npcHits[0].object;
          while (obj && !obj.userData.npcId) obj = obj.parent;
          const npc = mainWorld.npcs.find((n) => n.id === obj?.userData.npcId);
          if (npc) {
            standUpFromSeat();
            av.pendingSeat = null;
            av.pendingPortal = null;
            const ang = Math.atan2(av.x - npc.x, av.z - npc.z);
            const stopX = npc.x + Math.sin(ang) * 1.15;
            const stopZ = npc.z + Math.cos(ang) * 1.15;
            av.path = buildPlazaPath(av.x, av.z, stopX, stopZ);
            av.pendingNpcId = npc.id;
            npc.greetTimer = 4.0;
            propsRef.current.onEmoteChange('walk');
            propsRef.current.onNpcChat?.(npc.name, npc.greeting);
            sfx.playEmote();
            return;
          }
        }

        const djHits = raycaster.intersectObject(mainWorld.djDeckGroup, true);
        if (djHits.length > 0) {
          const isOn = mainWorld.togglePartyMode();
          sfx.playToggle(isOn);
          propsRef.current.onWalkHint?.(
            isOn ? 'Plaza Dance Floor lights ON' : 'Plaza Dance Floor lights dimmed'
          );
          return;
        }

        const seatMeshes = mainWorld.seats.map((s) => s.mesh);
        const seatHits = raycaster.intersectObjects(seatMeshes, true);
        if (seatHits.length > 0) {
          let obj: THREE.Object3D | null = seatHits[0].object;
          while (obj && !obj.userData.worldSeatId) obj = obj.parent;
          const targetSeat = mainWorld.seats.find((s) => s.id === obj?.userData.worldSeatId);
          if (targetSeat) {
            standUpFromSeat();
            av.pendingPortal = null;
            av.pendingNpcId = null;
            av.path = buildPlazaPath(
              av.x,
              av.z,
              targetSeat.approachPos.x,
              targetSeat.approachPos.z
            );
            av.pendingSeat = {
              uid: targetSeat.id,
              seatPos: targetSeat.seatPos,
              facingYaw: targetSeat.facingYaw,
              exitPos: targetSeat.approachPos,
            };
            propsRef.current.onEmoteChange('walk');
            propsRef.current.onWalkHint?.(`Walking to ${targetSeat.label}`);
            sfx.playClick();
            return;
          }
        }

        const groundHits = raycaster.intersectObject(mainWorld.groundRaycastPlane);
        if (groundHits.length > 0) {
          const pt = groundHits[0].point;
          standUpFromSeat();
          av.pendingSeat = null;
          av.pendingPortal = null;
          av.pendingNpcId = null;
          av.path = buildPlazaPath(av.x, av.z, pt.x, pt.z);
          propsRef.current.onEmoteChange('walk');
          const dest = av.path[av.path.length - 1];
          rippleMesh.position.set(dest.x, getCityGroundY(dest.x, dest.z) + 0.03, dest.z);
          rippleLife = 1.0;
          sfx.playClick();
        }
        return;
      }

      // ---------------- 2. HOTEL LOBBY INTERACTIONS ----------------
      if (loc === 'lobby') {
        const elevHits = raycaster.intersectObject(lobbyHandles.elevatorGroup, true);
        if (elevHits.length > 0) {
          standUpFromSeat();
          av.pendingSeat = null;
          if (Math.hypot(av.x - 0, av.z - -6.7) < 1.35) {
            releaseCursorForModal();
            sfx.playElevatorDing();
            propsRef.current.onOpenElevator();
          } else {
            av.path = [{ x: 0, z: -6.7 }];
            av.pendingPortal = 'openElevator';
            propsRef.current.onEmoteChange('walk');
            propsRef.current.onWalkHint?.('Walking to Lobby Elevator...');
            sfx.playClick();
          }
          return;
        }

        const streetDoorHits = raycaster.intersectObject(lobbyHandles.streetDoorGroup, true);
        if (streetDoorHits.length > 0) {
          standUpFromSeat();
          av.pendingSeat = null;
          av.path = [
            { x: 0, z: 6.9 },
            { x: 0, z: 7.7 },
          ];
          av.pendingPortal = 'toWorld';
          propsRef.current.onEmoteChange('walk');
          propsRef.current.onWalkHint?.('Walking out to M St & 15th St...');
          sfx.playClick();
          return;
        }

        const npcHits = raycaster.intersectObjects(
          lobbyHandles.npcs.map((n) => n.rig.root),
          true
        );
        if (npcHits.length > 0) {
          const morgan = lobbyHandles.npcs[0];
          standUpFromSeat();
          av.pendingSeat = null;
          av.pendingPortal = null;
          av.path = [{ x: -4.15, z: -1.2 }];
          morgan.greetTimer = 4.0;
          propsRef.current.onEmoteChange('walk');
          propsRef.current.onNpcChat?.(morgan.name, morgan.greeting);
          sfx.playEmote();
          return;
        }

        const seatHits = raycaster.intersectObjects(
          lobbyHandles.seats.map((s) => s.mesh),
          true
        );
        if (seatHits.length > 0) {
          const s = lobbyHandles.seats[0];
          standUpFromSeat();
          av.pendingPortal = null;
          av.path = [{ x: s.approachPos.x, z: s.approachPos.z }];
          av.pendingSeat = {
            uid: s.id,
            seatPos: s.seatPos,
            facingYaw: s.facingYaw,
            exitPos: s.approachPos,
          };
          propsRef.current.onEmoteChange('walk');
          sfx.playClick();
          return;
        }

        const floorHits = raycaster.intersectObject(lobbyHandles.groundRaycastPlane);
        if (floorHits.length > 0) {
          const pt = floorHits[0].point;
          if (lobbyHandles.isWalkable(pt.x, pt.z)) {
            standUpFromSeat();
            av.pendingSeat = null;
            av.pendingPortal = null;
            av.path = [{ x: pt.x, z: pt.z }];
            propsRef.current.onEmoteChange('walk');
            rippleMesh.position.set(pt.x, 0.03, pt.z);
            rippleLife = 1.0;
            sfx.playClick();
          }
        }
        return;
      }

      // ---------------- 3. HOTEL HALLWAY INTERACTIONS ----------------
      if (loc === 'hallway') {
        const elevHits = raycaster.intersectObject(hallwayHandles.elevatorGroup, true);
        if (elevHits.length > 0) {
          av.seatedUid = null;
          av.pendingHallDoor = null;
          av.y = 0;
          if (Math.hypot(av.x - -10.7, av.z - 0) < 1.35) {
            releaseCursorForModal();
            sfx.playElevatorDing();
            propsRef.current.onOpenElevator();
          } else {
            av.path = [{ x: -10.7, z: 0 }];
            av.pendingPortal = 'openElevator';
            propsRef.current.onEmoteChange('walk');
            propsRef.current.onWalkHint?.('Walking to Elevator...');
            sfx.playClick();
          }
          return;
        }

        const doorHits = raycaster.intersectObjects(
          hallwayHandles.doors.map((d) => d.doorGroup),
          true
        );
        if (doorHits.length > 0) {
          let obj: THREE.Object3D | null = doorHits[0].object;
          while (obj && obj.userData.hallDoorIndex === undefined) obj = obj.parent;
          const idx = obj?.userData.hallDoorIndex as number | undefined;
          const slot = idx !== undefined ? hallwayHandles.doors[idx] : undefined;
          if (slot) {
            av.seatedUid = null;
            av.pendingPortal = null;
            av.y = 0;
            av.path = [{ x: slot.x, z: -2.2 }];
            av.pendingHallDoor = slot.roomNumber;
            propsRef.current.onEmoteChange('walk');
            propsRef.current.onWalkHint?.(`Walking to Suite ${slot.roomNumber}...`);
            sfx.playClick();
            return;
          }
        }

        const floorHits = raycaster.intersectObject(hallwayHandles.groundRaycastPlane);
        if (floorHits.length > 0) {
          const pt = floorHits[0].point;
          if (hallwayHandles.isWalkable(pt.x, pt.z)) {
            av.seatedUid = null;
            av.pendingPortal = null;
            av.pendingHallDoor = null;
            av.y = 0;
            av.path = [{ x: pt.x, z: pt.z }];
            propsRef.current.onEmoteChange('walk');
            rippleMesh.position.set(pt.x, 0.03, pt.z);
            rippleLife = 1.0;
            sfx.playClick();
          }
        }
        return;
      }

      // ---------------- 4. HOTEL SUITE EDIT MODE ----------------
      if (loc === 'room' && m === 'edit') {
        if (pId) {
          updateGhostAtPointer(e.clientX, e.clientY);
          const { valid, gx, gz, wall } = handles.ghostState;
          if (valid) {
            const cat = getCatalogItem(pId);
            sfx.playPlace();
            propsRef.current.onPlaceItem({
              catalogId: pId,
              gx,
              gz,
              rot: cat?.layer === 'wall' ? (wall === 'west' ? 1 : 0) : rot,
              wall,
              color: pColor,
              active: cat?.interactive ? true : undefined,
            });
          } else {
            sfx.playRemove();
          }
          return;
        }

        if (mUid) {
          updateGhostAtPointer(e.clientX, e.clientY);
          const { valid, gx, gz, wall } = handles.ghostState;
          if (valid) {
            const existing = list.find((it) => it.uid === mUid);
            const cat = existing ? getCatalogItem(existing.catalogId) : undefined;
            sfx.playPlace();
            propsRef.current.onFinishMove(
              mUid,
              gx,
              gz,
              cat?.layer === 'wall' ? (wall === 'west' ? 1 : 0) : rot,
              wall
            );
          } else {
            sfx.playRemove();
          }
          return;
        }

        const furHits = raycaster.intersectObjects(furnitureRoot.children, true);
        if (furHits.length > 0) {
          let obj: THREE.Object3D | null = furHits[0].object;
          while (obj && !obj.userData.uid) {
            obj = obj.parent;
          }
          if (obj?.userData.uid) {
            sfx.playClick();
            propsRef.current.onSelectItem(obj.userData.uid);
            return;
          }
        }
        propsRef.current.onSelectItem(null);
        return;
      }

      // ---------------- 5. HOTEL SUITE WALK MODE (OWN OR RESIDENT) ----------------
      if (loc === 'resident_room' && propsRef.current.activeResident) {
        const resHits = raycaster.intersectObject(residentNpcRig.root, true);
        if (resHits.length > 0) {
          av.residentGreetTimer = 4.0;
          propsRef.current.onEmoteChange('wave');
          propsRef.current.onNpcChat?.(
            propsRef.current.activeResident.name,
            propsRef.current.activeResident.greeting
          );
          sfx.playEmote();
          return;
        }
      }

      const doorHits = raycaster.intersectObject(roomHandles.exitDoorGroup, true);
      if (doorHits.length > 0) {
        standUpFromSeat();
        av.pendingSeat = null;
        av.pendingNpcId = null;

        const nearSuiteDoor = Math.hypot(av.x - -6.4, av.z - SUITE_DOOR_Z) < 1.85;
        if (loc === 'room' && !propsRef.current.roomDoorUnlocked && nearSuiteDoor) {
          sfx.playKeycardBeep();
          av.doorSwingTimer = 1.8;
          propsRef.current.onUnlockRoomDoor();
          propsRef.current.onWalkHint?.(
            `Keycard entered · Suite ${PLAYER_SUITE_NUMBER} unlocked!`
          );
          return;
        }

        if (loc === 'room' && !propsRef.current.roomDoorUnlocked) {
          const path = findPath(av.x, av.z, -6.15, SUITE_DOOR_Z, list);
          av.path = path.length > 0 ? path : [{ x: -6.15, z: SUITE_DOOR_Z }];
          av.pendingPortal = 'toHallway';
          propsRef.current.onEmoteChange('walk');
          propsRef.current.onWalkHint?.('Walking to Suite Door to tap Keycard...');
          sfx.playClick();
          return;
        }

        const path = findPath(av.x, av.z, -6.15, SUITE_DOOR_Z, list);
        av.path =
          path.length > 0
            ? [...path, { x: -7.05, z: SUITE_DOOR_Z }]
            : [
                { x: -6.15, z: SUITE_DOOR_Z },
                { x: -7.05, z: SUITE_DOOR_Z },
              ];
        av.pendingPortal = 'toHallway';
        av.doorSwingTimer = 1.4;
        propsRef.current.onEmoteChange('walk');
        propsRef.current.onWalkHint?.(`Stepping out to Floor Hallway...`);
        sfx.playToggle(true);
        return;
      }

      const furHits = raycaster.intersectObjects(furnitureRoot.children, true);
      if (furHits.length > 0) {
        let obj: THREE.Object3D | null = furHits[0].object;
        while (obj && !obj.userData.uid) {
          obj = obj.parent;
        }
        if (obj?.userData.uid) {
          const item = list.find((it) => it.uid === obj!.userData.uid);
          const cat = item ? getCatalogItem(item.catalogId) : undefined;
          if (item && cat) {
            if (cat.interactive) {
              if (loc === 'room') {
                sfx.playToggle(!item.active);
                propsRef.current.onToggleInteractive(item.uid);
                propsRef.current.onWalkHint?.(
                  `${cat.name} turned ${!item.active ? 'on' : 'off'}`
                );
              }
              return;
            }
            if (cat.sittable) {
              const seatInfo = getSeatWorldInfo(item);
              if (seatInfo) {
                standUpFromSeat();
                av.pendingPortal = null;
                const safeApproach = findNearestWalkable(
                  seatInfo.seatPos.x,
                  seatInfo.seatPos.z,
                  seatInfo.approachPos.x,
                  seatInfo.approachPos.z,
                  loc,
                  list
                );
                const path = findPath(av.x, av.z, safeApproach.x, safeApproach.z, list);
                av.path = path.length > 0 ? path : [safeApproach];
                av.pendingSeat = {
                  uid: item.uid,
                  seatPos: seatInfo.seatPos,
                  facingYaw: seatInfo.facingYaw,
                  exitPos: safeApproach,
                };
                propsRef.current.onEmoteChange('walk');
                propsRef.current.onWalkHint?.(`Walking to sit on ${cat.name}`);
                sfx.playClick();
                return;
              }
            }
          }
        }
      }

      const floorHits = raycaster.intersectObject(roomHandles.floorRaycastPlane);
      if (floorHits.length > 0) {
        const pt = floorHits[0].point;
        standUpFromSeat();
        av.pendingSeat = null;
        av.pendingPortal = null;
        const path = findPath(av.x, av.z, pt.x, pt.z, list);
        if (path.length > 0) {
          av.path = path;
          propsRef.current.onEmoteChange('walk');
          const dest = path[path.length - 1];
          rippleMesh.position.set(dest.x, 0.03, dest.z);
          rippleLife = 1.0;
          sfx.playClick();
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (propsRef.current.viewMode === 'play') {
        handles.playCam.lastManualLookTime = performance.now();
        handles.playCam.targetDist = THREE.MathUtils.clamp(
          handles.playCam.targetDist + e.deltaY * 0.0025,
          2.1,
          6.5
        );
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: true });

    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    let lastStreetLabel = '';

    /** Keep rendered buses/stops in sync with the latest server state. */
    function syncTransit() {
      const inCity = propsRef.current.location === 'world';
      const vehicles = inCity ? propsRef.current.transitVehicles ?? [] : [];
      const seen = new Set<string>();
      for (const vehicle of vehicles) {
        seen.add(vehicle.id);
        let mesh = transitMeshes.get(vehicle.id);
        if (!mesh) {
          mesh = createTransitBusMesh();
          transitGroup.add(mesh);
          transitMeshes.set(vehicle.id, mesh);
        }
        mesh.position.set(vehicle.x, 0.02, vehicle.z);
        mesh.rotation.y = vehicle.heading;
      }
      for (const [id, mesh] of [...transitMeshes]) {
        if (seen.has(id)) continue;
        transitGroup.remove(mesh);
        transitMeshes.delete(id);
      }

      const wantedStops = new Set<string>();
      if (inCity) {
        for (const line of propsRef.current.transitLines ?? []) {
          for (const stop of line.stops) {
            const key = `${line.id}:${stop.id}`;
            wantedStops.add(key);
            let marker = stopMarkers.get(key);
            if (!marker) {
              marker = createTransitStopMarker();
              transitGroup.add(marker);
              stopMarkers.set(key, marker);
            }
            marker.position.set(stop.x, 0, stop.z);
          }
        }
      }
      for (const [key, marker] of [...stopMarkers]) {
        if (wantedStops.has(key)) continue;
        transitGroup.remove(marker);
        stopMarkers.delete(key);
      }
      transitGroup.visible = inCity;
    }

    function tick() {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.08);
      const elapsed = clock.getElapsedTime();

      const av = handles.avatarState;
      av.portalCooldown = Math.max(0, av.portalCooldown - delta);
      const currentLoc = propsRef.current.location;
      const currentView = propsRef.current.viewMode;
      const currentMode = propsRef.current.mode;
      const currentItems = propsRef.current.items;
      const canWalk =
        !propsRef.current.modalOpen && (currentLoc !== 'room' || currentMode === 'walk');
      let isMoving = false;
      const sprinting = Boolean(keys['ShiftLeft'] || keys['ShiftRight'] || touchInput.sprint);
      const prevAvX = av.x;
      const prevAvZ = av.z;
      const ride = propsRef.current.ridingVehicle;

      // Touch input shares the keyboard code path.
      if (touchInput.interact) {
        touchInput.interact = false;
        if (!propsRef.current.modalOpen) getNearbyAction()?.execute();
      }
      if (touchInput.jump) {
        touchInput.jump = false;
        if (canWalk && av.jumpY <= 0.001) {
          if (av.seatedUid) standUpFromSeat();
          av.jumpVel = 4.4;
          sfx.playClick();
        }
      }
      if (touchInput.lookDx !== 0 || touchInput.lookDy !== 0) {
        if (currentView === 'play') {
          handles.playCam.lastManualLookTime = performance.now();
          handles.playCam.yaw -= touchInput.lookDx;
          handles.playCam.pitch = THREE.MathUtils.clamp(
            handles.playCam.pitch + touchInput.lookDy,
            -0.22,
            1.02
          );
        }
        touchInput.lookDx = 0;
        touchInput.lookDy = 0;
      }

      // The server owns the bus; ease the avatar onto its seat.
      if (ride) {
        const follow = 1 - Math.exp(-14 * delta);
        av.x += (ride.x - av.x) * follow;
        av.y += ((ride.y ?? 0.34) - av.y) * follow;
        av.z += (ride.z - av.z) * follow;
        av.yaw += shortestAngleDiff(av.yaw, ride.heading) * (1 - Math.exp(-10 * delta));
        av.path = [];
        av.pendingSeat = null;
        av.pendingPortal = null;
        av.pendingHallDoor = null;
        av.pendingNpcId = null;
      }

      // Auto-unstuck if avatar overlaps any couch/furniture/obstacle while standing
      if (canWalk && !av.seatedUid && !checkWalkableForLoc(av.x, av.z, currentLoc, currentItems)) {
        const safe = findNearestWalkable(av.x, av.z, av.x, av.z, currentLoc, currentItems);
        av.x = safe.x;
        av.z = safe.z;
      }

      // 1. Movement (WASD + touch stick + Click Path)
      if (canWalk && !ride) {
        let moveX = 0;
        let moveZ = 0;
        if (keys['KeyW'] || keys['ArrowUp']) moveZ -= 1;
        if (keys['KeyS'] || keys['ArrowDown']) moveZ += 1;
        if (keys['KeyA'] || keys['ArrowLeft']) moveX -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) moveX += 1;
        moveX += touchInput.moveX;
        moveZ += touchInput.moveZ;

        if (moveX !== 0 || moveZ !== 0) {
          av.path = [];
          av.pendingSeat = null;
          av.pendingPortal = null;
          av.pendingHallDoor = null;
          av.pendingNpcId = null;
          if (av.seatedUid) {
            standUpFromSeat();
          }

          let dirX = 0;
          let dirZ = 0;
          if (currentView === 'play') {
            const fwdX = -Math.sin(handles.playCam.yaw);
            const fwdZ = -Math.cos(handles.playCam.yaw);
            const rightX = Math.cos(handles.playCam.yaw);
            const rightZ = -Math.sin(handles.playCam.yaw);
            dirX = rightX * moveX - fwdX * moveZ;
            dirZ = rightZ * moveX - fwdZ * moveZ;
          } else {
            camera.getWorldDirection(_vec3);
            _vec3.y = 0;
            _vec3.normalize();
            _vec3B.set(-_vec3.z, 0, _vec3.x);
            dirX = _vec3B.x * moveX - _vec3.x * moveZ;
            dirZ = _vec3B.z * moveX - _vec3.z * moveZ;
          }

          const len = Math.hypot(dirX, dirZ) || 1;
          const nx = dirX / len;
          const nz = dirZ / len;
          const baseSpeed = currentLoc === 'world' ? 4.4 : 2.85;
          const speed = sprinting ? (currentLoc === 'world' ? 10.5 : 4.4) : baseSpeed;
          // Analogue stick: a half-deflected stick walks at half speed. Keys
          // and click-to-walk leave the magnitude at 1.
          const touchMagnitude = Math.min(1, Math.hypot(touchInput.moveX, touchInput.moveZ));
          const analog = touchMagnitude > 0 ? touchMagnitude : 1;
          const step = speed * analog * delta;

          const nextX = av.x + nx * step;
          const nextZ = av.z + nz * step;

          if (checkWalkableForLoc(nextX, av.z, currentLoc, currentItems)) av.x = nextX;
          if (checkWalkableForLoc(av.x, nextZ, currentLoc, currentItems)) av.z = nextZ;

          const targetYaw = Math.atan2(nx, nz);
          av.yaw += shortestAngleDiff(av.yaw, targetYaw) * (1 - Math.exp(-15 * delta));
          isMoving = true;

          // Auto-follow camera behind player facing when walking in Play View
          if (
            currentView === 'play' &&
            moveZ <= 0 &&
            performance.now() - handles.playCam.lastManualLookTime > 550
          ) {
            const targetCamYaw = av.yaw + Math.PI;
            handles.playCam.yaw +=
              shortestAngleDiff(handles.playCam.yaw, targetCamYaw) *
              (1 - Math.exp(-3.2 * delta));
          }
        } else if (av.path.length > 0 && currentView === 'isometric') {
          const target = av.path[0];
          const dx = target.x - av.x;
          const dz = target.z - av.z;
          const dist = Math.hypot(dx, dz);
          const speed = currentLoc === 'world' ? 4.2 : 2.8;

          if (dist <= speed * delta + 0.04) {
            if (
              currentLoc === 'world' &&
              !isMainWorldPosWalkable(
                target.x,
                target.z,
                mainWorld.obstacles,
                0.28,
                propsRef.current.mainDoorUnlocked
              )
            ) {
              av.path = [];
              propsRef.current.onEmoteChange('idle');
            } else {
              av.x = target.x;
              av.z = target.z;
              av.path.shift();
              if (av.path.length === 0) {
                if (av.pendingPortal === 'toWorld') {
                  av.pendingPortal = null;
                  av.portalCooldown = 1.0;
                  propsRef.current.onChangeLocation('world');
                } else if (av.pendingPortal === 'toLobby') {
                  av.pendingPortal = null;
                  av.portalCooldown = 1.0;
                  propsRef.current.onChangeLocation('lobby');
                } else if (av.pendingPortal === 'toHallway') {
                  av.pendingPortal = null;
                  if (currentLoc === 'room' && !propsRef.current.roomDoorUnlocked) {
                    sfx.playKeycardBeep();
                    av.doorSwingTimer = 1.6;
                    propsRef.current.onUnlockRoomDoor();
                    propsRef.current.onWalkHint?.(
                      `Keycard tapped · Walk through Suite ${PLAYER_SUITE_NUMBER} door to Hallway`
                    );
                    propsRef.current.onEmoteChange('idle');
                  } else {
                    av.portalCooldown = 1.0;
                    propsRef.current.onChangeLocation('hallway');
                  }
                } else if (av.pendingPortal === 'openDoorTerminal') {
                  av.pendingPortal = null;
                  releaseCursorForModal();
                  sfx.playClick();
                  propsRef.current.onOpenDoorTerminal();
                  propsRef.current.onEmoteChange('idle');
                } else if (av.pendingPortal === 'openElevator') {
                  av.pendingPortal = null;
                  av.portalCooldown = 1.4;
                  releaseCursorForModal();
                  sfx.playElevatorDing();
                  propsRef.current.onOpenElevator();
                  propsRef.current.onEmoteChange('idle');
                } else if (av.pendingHallDoor) {
                  const roomNum = av.pendingHallDoor;
                  av.pendingHallDoor = null;
                  const slot = hallwayHandles.doors.find((d) => d.roomNumber === roomNum);
                  if (slot) {
                    if (slot.unlocked) {
                      av.portalCooldown = 1.0;
                      propsRef.current.onEnterSuiteFromHallway(roomNum);
                    } else if (slot.isPlayerSuite) {
                      sfx.playKeycardBeep();
                      propsRef.current.onUnlockHallwayDoor(roomNum);
                      propsRef.current.onWalkHint?.(
                        `Keycard accepted · Walk through to enter Suite ${roomNum}`
                      );
                    } else if (slot.resident) {
                      const res = slot.resident;
                      sfx.playIntercomRing();
                      propsRef.current.onWalkHint?.(`Ringing ${res.name} (Suite ${roomNum})...`);
                      window.setTimeout(() => {
                        sfx.playKeycardBeep();
                        propsRef.current.onUnlockHallwayDoor(roomNum);
                        propsRef.current.onNpcChat?.(
                          res.name,
                          `Door is unlocked — come on into Suite ${roomNum}!`
                        );
                      }, 550);
                    } else {
                      sfx.playRemove();
                      propsRef.current.onWalkHint?.(`Suite ${roomNum} is vacant`);
                    }
                  }
                  propsRef.current.onEmoteChange('idle');
                } else if (av.pendingSeat) {
                  const ps = av.pendingSeat;
                  av.pendingSeat = null;
                  sitOnSeat(ps.uid, ps.seatPos, ps.facingYaw, ps.exitPos);
                  propsRef.current.onEmoteChange('sit');
                } else if (av.pendingNpcId) {
                  const npc = mainWorld.npcs.find((n) => n.id === av.pendingNpcId);
                  av.pendingNpcId = null;
                  if (npc) {
                    av.yaw = Math.atan2(npc.x - av.x, npc.z - av.z);
                  }
                  propsRef.current.onEmoteChange('wave');
                } else {
                  propsRef.current.onEmoteChange('idle');
                }
              }
            }
          } else {
            const stepX = av.x + (dx / dist) * speed * delta;
            const stepZ = av.z + (dz / dist) * speed * delta;
            if (currentLoc === 'world') {
              let movedAny = false;
              if (
                isMainWorldPosWalkable(
                  stepX,
                  av.z,
                  mainWorld.obstacles,
                  0.28,
                  propsRef.current.mainDoorUnlocked
                )
              ) {
                av.x = stepX;
                movedAny = true;
              }
              if (
                isMainWorldPosWalkable(
                  av.x,
                  stepZ,
                  mainWorld.obstacles,
                  0.28,
                  propsRef.current.mainDoorUnlocked
                )
              ) {
                av.z = stepZ;
                movedAny = true;
              }
              if (!movedAny) {
                av.path = [];
                propsRef.current.onEmoteChange('idle');
              } else {
                isMoving = true;
              }
            } else {
              av.x = stepX;
              av.z = stepZ;
              isMoving = true;
            }
            const targetYaw = Math.atan2(dx, dz);
            av.yaw += shortestAngleDiff(av.yaw, targetYaw) * (1 - Math.exp(-14 * delta));
          }
        }
      }

      // Smoothly match ground elevation in Main City (street vs sidewalk/plaza)
      if (currentLoc === 'world' && !av.seatedUid && !ride) {
        const groundY = getCityGroundY(av.x, av.z);
        av.y = THREE.MathUtils.lerp(av.y, groundY, 1 - Math.exp(-18 * delta));
      }

      // Follow player horizontally in Isometric Main City & Long Hallway
      if (
        (currentLoc === 'world' || currentLoc === 'hallway') &&
        currentView === 'isometric' &&
        !handles.cameraAnim.active
      ) {
        const dpx = av.x - prevAvX;
        const dpz = currentLoc === 'world' ? av.z - prevAvZ : 0;
        if (Math.abs(dpx) > 1e-5 || Math.abs(dpz) > 1e-5) {
          controls.target.x += dpx;
          controls.target.z += dpz;
          camera.position.x += dpx;
          camera.position.z += dpz;
        }
      }

      // Walk-through door & elevator triggers across all hotel spaces
      if (av.portalCooldown <= 0 && !propsRef.current.modalOpen) {
        const suiteDoorOpenable =
          currentLoc === 'resident_room' || propsRef.current.roomDoorUnlocked;

        if (
          (currentLoc === 'room' || currentLoc === 'resident_room') &&
          (currentLoc === 'resident_room' || currentMode === 'walk') &&
          suiteDoorOpenable &&
          av.x < -6.72 &&
          Math.abs(av.z - SUITE_DOOR_Z) < 0.56
        ) {
          av.portalCooldown = 1.0;
          av.path = [];
          av.pendingPortal = null;
          sfx.playToggle(true);
          propsRef.current.onChangeLocation('hallway');
        } else if (
          currentLoc === 'world' &&
          propsRef.current.mainDoorUnlocked &&
          Math.hypot(av.x - CITY_LAYOUT.loftDoorPos.x, av.z - CITY_LAYOUT.loftDoorPos.z) < 0.92
        ) {
          av.portalCooldown = 1.0;
          av.path = [];
          av.pendingPortal = null;
          sfx.playToggle(true);
          propsRef.current.onChangeLocation('lobby');
        } else if (currentLoc === 'lobby' && av.z > 7.42 && Math.abs(av.x) < 0.85) {
          av.portalCooldown = 1.0;
          av.path = [];
          av.pendingPortal = null;
          sfx.playToggle(true);
          propsRef.current.onChangeLocation('world');
        } else if (currentLoc === 'lobby' && av.z < -7.45 && Math.abs(av.x) < 0.85) {
          av.portalCooldown = 1.6;
          av.path = [];
          av.pendingPortal = null;
          av.z = -7.05;
          releaseCursorForModal();
          sfx.playElevatorDing();
          propsRef.current.onOpenElevator();
        } else if (currentLoc === 'hallway' && av.x < -11.45 && Math.abs(av.z) < 0.78) {
          av.portalCooldown = 1.6;
          av.path = [];
          av.pendingPortal = null;
          av.x = -11.0;
          releaseCursorForModal();
          sfx.playElevatorDing();
          propsRef.current.onOpenElevator();
        } else if (currentLoc === 'hallway') {
          for (const d of hallwayHandles.doors) {
            if (d.unlocked && av.z < -2.74 && Math.abs(av.x - d.x) < 0.52) {
              av.portalCooldown = 1.0;
              av.path = [];
              av.pendingHallDoor = null;
              sfx.playToggle(true);
              propsRef.current.onEnterSuiteFromHallway(d.roomNumber);
              break;
            }
          }
        }
      }

      // Share player coords for live City Map & Street HUD
      if (propsRef.current.playerPoseRef) {
        propsRef.current.playerPoseRef.current.x = av.x;
        propsRef.current.playerPoseRef.current.z = av.z;
        propsRef.current.playerPoseRef.current.yaw = av.yaw;
      }
      if (currentLoc === 'world') {
        const label = getCityLocationLabel(av.x, av.z);
        if (label !== lastStreetLabel) {
          lastStreetLabel = label;
          propsRef.current.onCityStreetChange?.(label);
        }
      }

      if (av.jumpVel !== 0 || av.jumpY > 0) {
        av.jumpY += av.jumpVel * delta;
        av.jumpVel -= 14.5 * delta;
        if (av.jumpY <= 0) {
          av.jumpY = 0;
          av.jumpVel = 0;
        }
      }

      if (isMoving && av.jumpY <= 0.01) {
        av.stepTimer -= delta;
        if (av.stepTimer <= 0) {
          sfx.playStep();
          av.stepTimer = sprinting ? 0.22 : 0.32;
        }
      } else {
        av.stepTimer = 0.05;
      }

      // 2. Camera Update (Play View Third-Person GTA Chase vs Isometric Orbit)
      if (currentView === 'play') {
        const fwdX = -Math.sin(handles.playCam.yaw);
        const fwdZ = -Math.cos(handles.playCam.yaw);
        const rightX = Math.cos(handles.playCam.yaw);
        const rightZ = -Math.sin(handles.playCam.yaw);

        const targetX = av.x + rightX * 0.34;
        const targetY = av.y + 1.32 + av.jumpY * 0.45;
        const targetZ = av.z + rightZ * 0.34;

        // The distance eases so Z is a smooth zoom, never a cut.
        handles.playCam.dist = dampValue(
          handles.playCam.dist,
          handles.playCam.targetDist,
          10,
          delta
        );
        const horizDist = handles.playCam.dist * Math.cos(handles.playCam.pitch);
        const vertOffset = handles.playCam.dist * Math.sin(handles.playCam.pitch);

        let desiredX = targetX - fwdX * horizDist;
        let desiredY = Math.max(0.45, targetY + vertOffset);
        let desiredZ = targetZ - fwdZ * horizDist;

        // Spring-arm camera occlusion avoidance (outdoor skyscrapers & viaduct + indoor walls)
        let hitScale = 1.0;
        if (currentLoc === 'world') {
          hitScale = resolveCityCameraScale(
            targetX,
            targetY,
            targetZ,
            desiredX,
            desiredY,
            desiredZ,
            mainWorld.cameraOccluders
          );
        } else if (currentLoc === 'room' || currentLoc === 'resident_room') {
          const minWall = -GRID_SIZE / 2 + 0.35;
          if (desiredX < minWall && targetX > minWall) {
            hitScale = Math.min(hitScale, (targetX - minWall) / (targetX - desiredX));
          }
          if (desiredZ < minWall && targetZ > minWall) {
            hitScale = Math.min(hitScale, (targetZ - minWall) / (targetZ - desiredZ));
          }
          hitScale = Math.max(0.28, hitScale);
        } else if (currentLoc === 'hallway') {
          if (desiredX < -11.6 && targetX > -11.6) {
            hitScale = Math.min(hitScale, (targetX - -11.6) / (targetX - desiredX));
          }
          if (desiredX > 11.6 && targetX < 11.6) {
            hitScale = Math.min(hitScale, (11.6 - targetX) / (desiredX - targetX));
          }
          if (desiredZ < -2.9 && targetZ > -2.9) {
            hitScale = Math.min(hitScale, (targetZ - -2.9) / (targetZ - desiredZ));
          }
          hitScale = Math.max(0.32, hitScale);
        } else if (currentLoc === 'lobby') {
          if (desiredX < -8.6 && targetX > -8.6) {
            hitScale = Math.min(hitScale, (targetX - -8.6) / (targetX - desiredX));
          }
          if (desiredZ < -7.6 && targetZ > -7.6) {
            hitScale = Math.min(hitScale, (targetZ - -7.6) / (targetZ - desiredZ));
          }
          hitScale = Math.max(0.32, hitScale);
        }

        // Fast pull-in when occluded, smooth release when clear
        const scaleRate = hitScale < handles.playCam.currentScale ? 22 : 6;
        handles.playCam.currentScale = THREE.MathUtils.lerp(
          handles.playCam.currentScale,
          hitScale,
          1 - Math.exp(-scaleRate * delta)
        );
        desiredX = targetX + (desiredX - targetX) * handles.playCam.currentScale;
        desiredY = targetY + (desiredY - targetY) * handles.playCam.currentScale;
        desiredZ = targetZ + (desiredZ - targetZ) * handles.playCam.currentScale;
        if (currentLoc === 'world') {
          desiredY = Math.max(getCityGroundY(desiredX, desiredZ) + 0.45, desiredY);
        }

        const camK = 14;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredX, camK, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredY, camK, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, desiredZ, camK, delta);
        _lookTarget.set(targetX, targetY, targetZ);
        camera.lookAt(_lookTarget);
      } else {
        if (handles.cameraAnim.active) {
          camera.position.x = THREE.MathUtils.damp(
            camera.position.x,
            handles.cameraAnim.pos.x,
            6,
            delta
          );
          camera.position.y = THREE.MathUtils.damp(
            camera.position.y,
            handles.cameraAnim.pos.y,
            6,
            delta
          );
          camera.position.z = THREE.MathUtils.damp(
            camera.position.z,
            handles.cameraAnim.pos.z,
            6,
            delta
          );
          controls.target.x = THREE.MathUtils.damp(
            controls.target.x,
            handles.cameraAnim.target.x,
            6,
            delta
          );
          controls.target.y = THREE.MathUtils.damp(
            controls.target.y,
            handles.cameraAnim.target.y,
            6,
            delta
          );
          controls.target.z = THREE.MathUtils.damp(
            controls.target.z,
            handles.cameraAnim.target.z,
            6,
            delta
          );
          if (
            camera.position.distanceTo(handles.cameraAnim.pos) < 0.03 &&
            controls.target.distanceTo(handles.cameraAnim.target) < 0.03
          ) {
            handles.cameraAnim.active = false;
          }
        }
        // The zoom lets the orbit come closer than its normal limit; once the
        // camera is back home, restore the regular range.
        if (!handles.cameraAnim.active && !propsRef.current.avatarZoom && controls.minDistance !== 5.0) {
          controls.minDistance = 5.0;
        }
        controls.update();

        // Rotating cutaway: keep the suite orbitable through a full 360° by
        // hiding whichever solid wall sits between the camera and the room.
        const inSuite = currentLoc === 'room' || currentLoc === 'resident_room';
        const wallEdge = -GRID_SIZE / 2 + 0.35;
        const cutNorth = inSuite && camera.position.z < wallEdge;
        const cutWest = inSuite && camera.position.x < wallEdge;
        if (cutNorth !== handles.wallCut.north || cutWest !== handles.wallCut.west) {
          handles.wallCut.north = cutNorth;
          handles.wallCut.west = cutWest;
          handles.roomHandles.setWallCutaway(cutNorth, cutWest);
        }
        // Wall-mounted decor follows its wall every frame, so art placed or
        // recoloured while a wall is hidden cannot pop back into view.
        for (const item of currentItems) {
          if (item.wall !== 'north' && item.wall !== 'west') continue;
          const group = handles.furnitureMap.get(item.uid);
          if (!group) continue;
          const wanted = item.wall === 'north' ? !cutNorth : !cutWest;
          if (group.visible !== wanted) group.visible = wanted;
        }
      }

      // Proximity prompt check in BOTH Play View and Isometric Walk!
      const nearby = getNearbyAction();
      const nextLabel = nearby ? nearby.label : null;
      if (nextLabel !== lastPrompt) {
        lastPrompt = nextLabel;
        propsRef.current.onProximityPrompt?.(nextLabel);
      }

      // Suite door hinge swing animation (only swings when unlocked!)
      const isRoomUnlocked = currentLoc === 'resident_room' || propsRef.current.roomDoorUnlocked;
      const nearRoomDoor =
        isRoomUnlocked &&
        (currentLoc === 'room' || currentLoc === 'resident_room') &&
        av.x < -5.1 &&
        Math.abs(av.z - SUITE_DOOR_Z) < 1.5;

      if (isRoomUnlocked && (av.doorSwingTimer > 0 || nearRoomDoor)) {
        av.doorSwingTimer = Math.max(0, av.doorSwingTimer - delta * 0.8);
        roomHandles.doorLeafPivot.rotation.y = THREE.MathUtils.lerp(
          roomHandles.doorLeafPivot.rotation.y,
          -1.28,
          1 - Math.exp(-9 * delta)
        );
      } else {
        roomHandles.doorLeafPivot.rotation.y = THREE.MathUtils.lerp(
          roomHandles.doorLeafPivot.rotation.y,
          0,
          1 - Math.exp(-8 * delta)
        );
      }

      if (av.seatedUid && (currentLoc === 'room' || currentLoc === 'resident_room')) {
        const seatItem = currentItems.find((it) => it.uid === av.seatedUid);
        if (!seatItem) {
          standUpFromSeat();
          propsRef.current.onEmoteChange('idle');
        }
      }

      avatarRig.root.position.set(av.x, av.y, av.z);
      avatarRig.root.rotation.y = av.yaw;
      avatarRig.shadowPlane.visible = !av.seatedUid;

      const effectiveEmote: EmoteType = isMoving
        ? 'walk'
        : av.seatedUid
        ? 'sit'
        : propsRef.current.activeEmote;

      const animElapsed = isMoving && sprinting ? elapsed * 1.35 : elapsed;
      avatarRig.updateAnimation(effectiveEmote, isMoving, animElapsed, delta, av.jumpY);

      // Remote players: interpolate toward their last server position.
      for (const entry of handles.remoteRigs.values()) {
        _vec3.set(entry.target.x, entry.target.y, entry.target.z);
        entry.rig.root.position.lerp(_vec3, 1 - Math.exp(-12 * delta));
        entry.rig.root.rotation.y +=
          shortestAngleDiff(entry.rig.root.rotation.y, entry.target.yaw) *
          (1 - Math.exp(-10 * delta));
        entry.rig.updateAnimation(entry.emote, entry.moving, elapsed + entry.phase, delta, 0);
      }

      if (rippleLife > 0) {
        rippleLife = Math.max(0, rippleLife - delta * 1.9);
        const s = 1 + (1 - rippleLife) * 1.4;
        rippleMesh.scale.set(s, s, 1);
        (rippleMesh.material as THREE.MeshBasicMaterial).opacity = rippleLife * 0.75;
      }

      // Per-location animations
      if (currentLoc === 'room' || currentLoc === 'resident_room') {
        for (const item of currentItems) {
          const grp = handles.furnitureMap.get(item.uid);
          if (!grp) continue;
          const popT = handles.popAnimations.get(item.uid);
          if (popT !== undefined) {
            const nextT = Math.min(1, popT + delta * 4.5);
            handles.popAnimations.set(item.uid, nextT);
            const ease =
              nextT < 1
                ? 1 - Math.pow(1 - nextT, 3) + Math.sin(nextT * Math.PI) * 0.14
                : 1;
            grp.scale.setScalar(ease);
            if (nextT >= 1) handles.popAnimations.delete(item.uid);
          }
          updateFurnitureAnimations(grp, item, elapsed, delta);
        }

        if (currentLoc === 'resident_room' && residentNpcRig.root.visible) {
          const targetYaw = Math.atan2(av.x - RESIDENT_NPC_POS.x, av.z - RESIDENT_NPC_POS.z);
          residentNpcRig.root.rotation.y +=
            shortestAngleDiff(residentNpcRig.root.rotation.y, targetYaw) *
            (1 - Math.exp(-7 * delta));
          let resEmote: EmoteType = 'idle';
          if (av.residentGreetTimer > 0) {
            av.residentGreetTimer -= delta;
            resEmote = 'wave';
          }
          residentNpcRig.updateAnimation(resEmote, false, elapsed + 1.5, delta, 0);
        }

        if (selectionBox.visible) {
          const pulse = 1 + Math.sin(elapsed * 5) * 0.025;
          selectionBox.scale.set(
            selectionBox.userData.baseW * pulse,
            1,
            selectionBox.userData.baseD * pulse
          );
        }
      } else if (currentLoc === 'lobby') {
        lobbyHandles.updateLobby(elapsed, delta, av.x, av.z);
      } else if (currentLoc === 'hallway') {
        hallwayHandles.updateHallway(elapsed, delta, av.x, av.z);
      } else {
        keyLight.target.position.set(av.x, 0, av.z);
        keyLight.position.set(av.x - 12, 18, av.z + 8);
        mainWorld.updateWorld(elapsed, delta, av.x, av.z, propsRef.current.mood);
      }

      syncTransit();
      renderer.render(scene, camera);
      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    if (isSoftwareGl) {
      renderer.render(scene, camera);
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      delete (window as unknown as Record<string, unknown>).__loftlife;
      clearDragGhost();
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Sync ViewMode ('isometric' <-> 'play')
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;
    const loc = propsRef.current.location;

    if (viewMode === 'play') {
      h.wallCut.north = false;
      h.wallCut.west = false;
      h.roomHandles.setWallCutaway(false, false);
      // The isometric cutaway hides wall decor; restore it for the chase view.
      for (const item of propsRef.current.items) {
        if (item.wall !== 'north' && item.wall !== 'west') continue;
        const group = h.furnitureMap.get(item.uid);
        if (group) group.visible = true;
      }
      h.controls.enabled = false;
      h.cameraAnim.active = false;
      h.camera.fov = 52;
      h.camera.updateProjectionMatrix();
      h.playCam.yaw = h.avatarState.yaw + Math.PI;
      h.playCam.pitch = 0.24;
      h.avatarState.path = [];
      h.avatarState.pendingSeat = null;
      h.avatarState.pendingPortal = null;
    } else {
      if (document.pointerLockElement === h.renderer.domElement) {
        document.exitPointerLock?.();
      }
      h.controls.enabled = true;
      h.camera.fov = 36;
      h.camera.updateProjectionMatrix();
      const av = h.avatarState;
      if (loc === 'world') {
        h.cameraAnim.pos.set(av.x + 12.5, 11.5, av.z + 14.5);
        h.cameraAnim.target.set(av.x, 0.8, av.z);
      } else if (loc === 'lobby') {
        h.cameraAnim.pos.set(11.0, 11.2, 13.8);
        h.cameraAnim.target.set(0, 0.8, 0);
      } else if (loc === 'hallway') {
        h.cameraAnim.pos.set(av.x + 2.5, 9.6, 12.5);
        h.cameraAnim.target.set(av.x, 0.9, -0.6);
      } else {
        h.cameraAnim.pos.set(14.5, 12.0, 14.5);
        h.cameraAnim.target.set(0, 0.85, 0);
      }
      h.cameraAnim.active = true;
    }
  }, [viewMode]);

  // Sync Location Switching & Floor/Resident Entry Spawns
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;
    const vm = propsRef.current.viewMode;
    const prev = prevLocationRef.current;

    h.avatarState.path = [];
    h.avatarState.pendingSeat = null;
    h.avatarState.pendingPortal = null;
    h.avatarState.pendingHallDoor = null;
    h.avatarState.pendingNpcId = null;
    h.avatarState.seatedUid = null;
    h.avatarState.seatExitPos = null;
    h.avatarState.doorSwingTimer = 0;
    h.avatarState.portalCooldown = 0.95;

    h.roomContainer.visible = location === 'room' || location === 'resident_room';
    h.lobbyContainer.visible = location === 'lobby';
    h.hallwayContainer.visible = location === 'hallway';
    h.worldContainer.visible = location === 'world';

    const fog = h.scene.fog as THREE.Fog;

    if (location === 'world') {
      const entry = h.mainWorld.loftDoorEntryPos;
      h.avatarState.x = entry.x;
      h.avatarState.z = entry.z;
      h.avatarState.y = getCityGroundY(entry.x, entry.z);
      h.avatarState.yaw = 0;
      h.playCam.yaw = Math.PI;
      h.controls.minAzimuthAngle = -Infinity;
      h.controls.maxAzimuthAngle = Infinity;
      h.controls.maxDistance = 48;
      fog.near = 90;
      fog.far = 300;
      const d = 24;
      h.keyLight.shadow.camera.left = -d;
      h.keyLight.shadow.camera.right = d;
      h.keyLight.shadow.camera.top = d;
      h.keyLight.shadow.camera.bottom = -d;
      h.keyLight.shadow.camera.updateProjectionMatrix();
      if (vm === 'isometric') {
        h.cameraAnim.pos.set(entry.x + 12.5, 11.5, entry.z + 14.5);
        h.cameraAnim.target.set(entry.x, 0.8, entry.z);
        h.cameraAnim.active = true;
      }
      propsRef.current.onCityStreetChange?.(getCityLocationLabel(entry.x, entry.z));
      propsRef.current.onEmoteChange('idle');
    } else if (location === 'lobby') {
      if (prev.loc === 'hallway') {
        // Came down from Elevator
        h.avatarState.x = 0;
        h.avatarState.z = -6.0;
        h.avatarState.yaw = 0;
        h.playCam.yaw = Math.PI;
      } else {
        // Entered from Main City South Doors
        h.avatarState.x = 0;
        h.avatarState.z = 6.2;
        h.avatarState.yaw = Math.PI;
        h.playCam.yaw = 0;
      }
      h.avatarState.y = 0;
      h.controls.minAzimuthAngle = -0.85;
      h.controls.maxAzimuthAngle = Math.PI / 2 + 0.2;
      h.controls.maxDistance = 28;
      fog.near = 35;
      fog.far = 90;
      const d = 16;
      h.keyLight.shadow.camera.left = -d;
      h.keyLight.shadow.camera.right = d;
      h.keyLight.shadow.camera.top = d;
      h.keyLight.shadow.camera.bottom = -d;
      h.keyLight.shadow.camera.updateProjectionMatrix();
      h.keyLight.target.position.set(0, 0, 0);
      h.keyLight.position.set(-10, 15, 8);
      if (vm === 'isometric') {
        h.cameraAnim.pos.set(11.0, 11.2, 13.8);
        h.cameraAnim.target.set(0, 0.8, 0);
        h.cameraAnim.active = true;
      }
      propsRef.current.onEmoteChange('idle');
    } else if (location === 'hallway') {
      if (prev.loc === 'room') {
        // Stepped out of Suite 402
        const slot = h.hallwayHandles.doors.find((d) => d.roomNumber === PLAYER_SUITE_NUMBER);
        h.avatarState.x = slot ? slot.x : -2.0;
        h.avatarState.z = -2.0;
        h.avatarState.yaw = 0;
        h.playCam.yaw = Math.PI;
      } else if (prev.loc === 'resident_room' && prev.roomNumber) {
        const slot = h.hallwayHandles.doors.find((d) => d.roomNumber === prev.roomNumber);
        h.avatarState.x = slot ? slot.x : -2.0;
        h.avatarState.z = -2.0;
        h.avatarState.yaw = 0;
        h.playCam.yaw = Math.PI;
      } else {
        // Arrived via Elevator on West end
        h.avatarState.x = -10.1;
        h.avatarState.z = 0;
        h.avatarState.yaw = Math.PI / 2;
        h.playCam.yaw = -Math.PI / 2;
      }
      h.avatarState.y = 0;
      h.controls.minAzimuthAngle = -0.65;
      h.controls.maxAzimuthAngle = 0.75;
      h.controls.maxDistance = 26;
      fog.near = 35;
      fog.far = 90;
      const d = 18;
      h.keyLight.shadow.camera.left = -d;
      h.keyLight.shadow.camera.right = d;
      h.keyLight.shadow.camera.top = d;
      h.keyLight.shadow.camera.bottom = -d;
      h.keyLight.shadow.camera.updateProjectionMatrix();
      h.keyLight.target.position.set(0, 0, 0);
      h.keyLight.position.set(-6, 14, 10);
      if (vm === 'isometric') {
        h.cameraAnim.pos.set(h.avatarState.x + 2.5, 9.6, 12.5);
        h.cameraAnim.target.set(h.avatarState.x, 0.9, -0.6);
        h.cameraAnim.active = true;
      }
      propsRef.current.onEmoteChange('idle');
    } else {
      // 'room' or 'resident_room'
      if (prev.loc === 'hallway' || prev.loc === 'world' || prev.loc === 'lobby') {
        h.avatarState.x = -5.85;
        h.avatarState.z = SUITE_DOOR_Z;
        h.avatarState.yaw = Math.PI / 2;
        h.playCam.yaw = -Math.PI / 2;
      }
      h.avatarState.y = 0;
      // Full orbit: the rotating cutaway hides whichever wall blocks the view.
      h.controls.minAzimuthAngle = -Infinity;
      h.controls.maxAzimuthAngle = Infinity;
      h.controls.maxDistance = 30;
      fog.near = 32;
      fog.far = 72;
      const d = 16;
      h.keyLight.shadow.camera.left = -d;
      h.keyLight.shadow.camera.right = d;
      h.keyLight.shadow.camera.top = d;
      h.keyLight.shadow.camera.bottom = -d;
      h.keyLight.shadow.camera.updateProjectionMatrix();
      h.keyLight.target.position.set(0, 0, 0);
      h.keyLight.position.set(-12, 16, 8);
      if (vm === 'isometric') {
        h.cameraAnim.pos.set(14.5, 12.0, 14.5);
        h.cameraAnim.target.set(0, 0.85, 0);
        h.cameraAnim.active = true;
      }
      propsRef.current.onEmoteChange('idle');
    }

    prevLocationRef.current = {
      loc: location,
      roomNumber: activeResident?.roomNumber ?? null,
    };
  }, [location, hallwayFloor, activeResident]);

  // Sync Hallway Floor Plaques & Lock Status
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;
    h.hallwayHandles.setFloorState(
      hallwayFloor,
      new Set(unlockedRooms),
      HOTEL_RESIDENTS,
      avatarConfig.name,
      h.maxAnisotropy
    );
  }, [hallwayFloor, unlockedRooms, avatarConfig.name]);

  // Sync Main Hotel Door Lock & Suite Door Lock
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;
    h.mainWorld.setMainDoorUnlocked(mainDoorUnlocked);
  }, [mainDoorUnlocked]);

  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;
    const suiteBadge =
      location === 'resident_room' && activeResident
        ? activeResident.roomNumber
        : PLAYER_SUITE_NUMBER;
    h.roomHandles.setRoomBadge(suiteBadge, h.maxAnisotropy);
    h.roomHandles.setDoorUnlocked(location === 'resident_room' ? true : roomDoorUnlocked);
  }, [location, activeResident, roomDoorUnlocked]);

  // Sync Resident NPC inside resident_room
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;
    if (location === 'resident_room' && activeResident) {
      h.residentNpcRig.rebuildAppearance(activeResident.avatar);
      h.residentNpcRig.root.position.set(RESIDENT_NPC_POS.x, 0, RESIDENT_NPC_POS.z);
      h.residentNpcRig.root.visible = true;
      h.avatarState.residentGreetTimer = 2.5;
    } else {
      h.residentNpcRig.root.visible = false;
    }
  }, [location, activeResident]);

  // Sync Room Mode
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;
    h.roomHandles.setGridVisible(location === 'room' && mode === 'edit');
    if (mode === 'walk' || location !== 'room') {
      h.selectionBox.visible = false;
      if (h.ghostGroup) h.ghostGroup.visible = false;
      h.ensureUnstuck();
    }
  }, [mode, location]);

  // Sync Surfaces (own suite vs visited resident suite)
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;
    h.roomHandles.updateSurfaces(activeSurfaces.floor, activeSurfaces.wall, h.maxAnisotropy);
  }, [activeSurfaces.floor, activeSurfaces.wall]);

  // Sync Lighting Mood
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;
    h.roomHandles.updateMoodBackdrop(activeMood);
    if (activeMood === 'morning') {
      h.scene.background = new THREE.Color('#dfe8f2');
      (h.scene.fog as THREE.Fog).color.set('#dfe8f2');
      h.keyLight.color.set(0xfff4e0);
      h.keyLight.intensity = 1.9;
      h.hemiLight.color.set(0xdceeff);
      h.hemiLight.groundColor.set(0x9c826b);
      h.hemiLight.intensity = 0.78;
      h.fillLight.intensity = 0.55;
    } else if (activeMood === 'golden') {
      h.scene.background = new THREE.Color('#e8d5c8');
      (h.scene.fog as THREE.Fog).color.set('#e8d5c8');
      h.keyLight.color.set(0xffb878);
      h.keyLight.intensity = 2.05;
      h.hemiLight.color.set(0xffdfc4);
      h.hemiLight.groundColor.set(0x7c5a46);
      h.hemiLight.intensity = 0.65;
      h.fillLight.intensity = 0.45;
    } else {
      h.scene.background = new THREE.Color('#161b29');
      (h.scene.fog as THREE.Fog).color.set('#161b29');
      h.keyLight.color.set(0x8aa8e6);
      h.keyLight.intensity = 0.65;
      h.hemiLight.color.set(0x3a4a70);
      h.hemiLight.groundColor.set(0x1f222d);
      h.hemiLight.intensity = 0.42;
      h.fillLight.intensity = 0.25;
    }
  }, [activeMood]);

  // Sync remote multiplayer avatars against the latest presence snapshot.
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;
    const incoming = new Map((remotePlayers ?? []).map((player) => [player.connId, player]));

    for (const [connId, entry] of [...h.remoteRigs]) {
      if (incoming.has(connId)) continue;
      h.scene.remove(entry.rig.root);
      entry.rig.root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      h.remoteRigs.delete(connId);
    }

    for (const [connId, player] of incoming) {
      const signature = JSON.stringify(player.avatar ?? null);
      let entry = h.remoteRigs.get(connId);
      if (!entry) {
        const rig = createAvatarRig(player.avatar ?? propsRef.current.avatarConfig);
        rig.root.add(createNameTag(player.name || player.handle));
        rig.root.position.set(player.x, player.y, player.z);
        h.scene.add(rig.root);
        entry = {
          rig,
          signature,
          target: { x: player.x, y: player.y, z: player.z, yaw: player.yaw },
          emote: 'idle',
          moving: false,
          phase: Math.random() * 6,
        };
        h.remoteRigs.set(connId, entry);
      } else if (entry.signature !== signature) {
        if (player.avatar) entry.rig.rebuildAppearance(player.avatar);
        entry.signature = signature;
      }

      const moved = Math.hypot(player.x - entry.target.x, player.z - entry.target.z) > 0.03;
      entry.target = { x: player.x, y: player.y, z: player.z, yaw: player.yaw };
      entry.moving = moved || player.emote === 'walk';
      entry.emote = (EMOTE_SET.has(player.emote)
        ? player.emote
        : entry.moving
        ? 'walk'
        : 'idle') as EmoteType;
    }
  }, [remotePlayers]);

  // Sync Avatar Appearance
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;
    h.avatarRig.rebuildAppearance(avatarConfig);
  }, [avatarConfig]);

  // Emote & Jump trigger
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h || emoteTriggerId === 0) return;
    if (activeEmote === 'jump') {
      h.avatarState.jumpVel = 4.4;
    }
    if (activeEmote !== 'sit' && h.avatarState.seatedUid) {
      h.standUp();
    }
    if (activeEmote !== 'walk') {
      h.avatarState.path = [];
      h.avatarState.pendingSeat = null;
      h.avatarState.pendingPortal = null;
    }
  }, [emoteTriggerId, activeEmote]);

  // Sync Furniture Items diffing (uses activeItems: player suite OR visited resident's suite)
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;

    const existingKeys = new Set(h.furnitureMap.keys());
    const nextIds = new Set(activeItems.map((it) => it.uid));

    for (const uid of existingKeys) {
      if (!nextIds.has(uid)) {
        const grp = h.furnitureMap.get(uid);
        if (grp) h.furnitureRoot.remove(grp);
        h.furnitureMap.delete(uid);
      }
    }

    for (const item of activeItems) {
      const prevGrp = h.furnitureMap.get(item.uid);
      const sig = `${item.catalogId}|${item.color}|${item.active ? 1 : 0}`;
      const needsRebuild = !prevGrp || prevGrp.userData.sig !== sig;

      if (needsRebuild) {
        if (prevGrp) h.furnitureRoot.remove(prevGrp);
        const newGrp = buildFurnitureGroup(item, {
          maxAnisotropy: h.maxAnisotropy,
          isSoftwareGl: h.isSoftwareGl,
        });
        newGrp.userData.sig = sig;
        const t = getItemWorldTransform(item);
        newGrp.position.set(t.x, t.y, t.z);
        newGrp.rotation.y = t.rotY;
        newGrp.visible = !(location === 'room' && item.uid === movingUid);
        h.furnitureRoot.add(newGrp);
        h.furnitureMap.set(item.uid, newGrp);
        if (!prevGrp) h.popAnimations.set(item.uid, 0.05);
      } else if (prevGrp) {
        const t = getItemWorldTransform(item);
        prevGrp.position.set(t.x, t.y, t.z);
        prevGrp.rotation.y = t.rotY;
        prevGrp.visible = !(location === 'room' && item.uid === movingUid);
      }
    }
  }, [activeItems, movingUid, location]);

  // Sync Placement Ghost
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;

    const activeCatalogId =
      placingCatalogId || activeItems.find((it) => it.uid === movingUid)?.catalogId || null;

    if (location !== 'room' || mode !== 'edit' || !activeCatalogId) {
      if (h.ghostGroup) {
        h.scene.remove(h.ghostGroup);
        h.ghostGroup = null;
        h.ghostKey = '';
      }
      return;
    }

    if (h.ghostKey !== activeCatalogId) {
      if (h.ghostGroup) h.scene.remove(h.ghostGroup);
      const g = buildFurnitureGroup(
        {
          uid: 'ghost',
          catalogId: activeCatalogId,
          gx: 0,
          gz: 0,
          rot: placingRotation,
          color: placingColor,
        },
        { maxAnisotropy: h.maxAnisotropy, isGhost: true, isSoftwareGl: h.isSoftwareGl }
      );
      g.visible = false;
      h.scene.add(g);
      h.ghostGroup = g;
      h.ghostKey = activeCatalogId;
    } else if (h.ghostGroup) {
      h.ghostGroup.rotation.y = (placingRotation * Math.PI) / 2;
    }
  }, [location, mode, placingCatalogId, movingUid, placingRotation, placingColor, activeItems]);

  // Sync Selection Outline Box
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;
    if (location !== 'room' || mode !== 'edit' || !selectedUid || movingUid === selectedUid) {
      h.selectionBox.visible = false;
      return;
    }
    const item = items.find((it) => it.uid === selectedUid);
    const cat = item ? getCatalogItem(item.catalogId) : undefined;
    if (!item || !cat) {
      h.selectionBox.visible = false;
      return;
    }

    const t = getItemWorldTransform(item);
    if (cat.layer === 'wall') {
      h.selectionBox.visible = true;
      h.selectionBox.position.set(t.x, t.y, t.z);
      h.selectionBox.rotation.y = t.rotY;
      h.selectionBox.userData.baseW = cat.size[0];
      h.selectionBox.userData.baseD = 0.35;
      h.selectionBox.scale.set(cat.size[0], 1.2, 0.35);
    } else {
      const [ew, ed] = getEffectiveSize(item.catalogId, item.rot);
      h.selectionBox.visible = true;
      h.selectionBox.position.set(t.x, 0.05, t.z);
      h.selectionBox.rotation.y = 0;
      h.selectionBox.userData.baseW = ew;
      h.selectionBox.userData.baseD = ed;
      h.selectionBox.scale.set(ew, 1, ed);
    }
  }, [location, mode, selectedUid, movingUid, items]);

  // Avatar zoom (Z): shorten the camera distance toward the avatar while
  // keeping the exact viewing direction. Nothing else about the camera changes.
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;
    const zoom = zoomStateRef.current;

    if (viewMode === 'play') {
      // A stale isometric capture must never be reused after a view switch.
      zoom.isometric = undefined;
      if (avatarZoom) {
        if (zoom.playDist === undefined) zoom.playDist = h.playCam.targetDist;
        h.playCam.targetDist = Math.max(1.5, zoom.playDist * 0.45);
      } else if (zoom.playDist !== undefined) {
        h.playCam.targetDist = zoom.playDist;
        zoom.playDist = undefined;
      }
      return;
    }

    if (avatarZoom) {
      if (!zoom.isometric) {
        zoom.isometric = {
          position: {
            x: h.camera.position.x,
            y: h.camera.position.y,
            z: h.camera.position.z,
          },
          target: { x: h.controls.target.x, y: h.controls.target.y, z: h.controls.target.z },
        };
      }
      // OrbitControls would clamp the close-up back to its normal minimum.
      h.controls.minDistance = Math.min(h.controls.minDistance, AVATAR_ZOOM_MIN_DISTANCE);
      const result = zoomTowardAvatar({
        position: zoom.isometric.position,
        target: zoom.isometric.target,
        avatar: { x: h.avatarState.x, y: 1.0, z: h.avatarState.z },
        minDistance: AVATAR_ZOOM_MIN_DISTANCE,
      });
      h.cameraAnim.pos.set(result.position.x, result.position.y, result.position.z);
      h.cameraAnim.target.set(result.target.x, result.target.y, result.target.z);
      h.cameraAnim.active = true;
    } else if (zoom.isometric) {
      h.cameraAnim.pos.set(
        zoom.isometric.position.x,
        zoom.isometric.position.y,
        zoom.isometric.position.z
      );
      h.cameraAnim.target.set(
        zoom.isometric.target.x,
        zoom.isometric.target.y,
        zoom.isometric.target.z
      );
      h.cameraAnim.active = true;
      zoom.isometric = undefined;
    }
  }, [avatarZoom, viewMode]);

  if (webglError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#181a20] text-white p-8">
        <div className="max-w-md text-center space-y-3 bg-[#22252e] border border-white/10 rounded-2xl p-6">
          <h2 className="font-display text-xl font-semibold">3D Viewport Unavailable</h2>
          <p className="text-sm text-slate-300">
            WebGL hardware or software rendering could not initialize in this browser context.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`w-full h-full relative ${
        viewMode === 'play'
          ? 'cursor-crosshair'
          : 'cursor-grab active:cursor-grabbing'
      }`}
    />
  );
};
