import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createAvatarRig, type AvatarRig } from '../game/avatar';
import { sfx } from '../game/audio';
import { getCatalogItem, GRID_SIZE } from '../game/catalog';
import { buildFurnitureGroup, updateFurnitureAnimations } from '../game/furniture';
import {
  findPath,
  getEffectiveSize,
  getItemWorldTransform,
  getSeatWorldInfo,
  isValidPlacement,
  isWorldPosWalkable,
} from '../game/gridMath';
import {
  CITY_LAYOUT,
  getCityLocationLabel,
  uzToWorldX,
  worldToU,
} from '../game/cityLayout';
import { buildRoomArchitecture } from '../game/roomBuilder';
import {
  buildMainWorld,
  getCityGroundY,
  isMainWorldPosWalkable,
} from '../game/worldBuilder';
import type {
  AvatarConfig,
  EmoteType,
  GameMode,
  LightingMood,
  PlacedItem,
  RoomSurfaceConfig,
  ViewMode,
  WorldLocation,
} from '../game/types';

export interface CameraPresetRequest {
  id: number;
  type: 'overview' | 'closeup' | 'isometric';
}

interface RoomViewportProps {
  location: WorldLocation;
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
  cameraPreset: CameraPresetRequest | null;
  playerPoseRef?: React.MutableRefObject<{ x: number; z: number; yaw: number }>;
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
}

const _vec3 = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _lookTarget = new THREE.Vector3();

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
  cameraPreset,
  playerPoseRef,
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webglError, setWebglError] = useState(false);

  const propsRef = useRef({
    location,
    viewMode,
    mode,
    items,
    surfaces,
    mood,
    avatarConfig,
    activeEmote,
    selectedUid,
    placingCatalogId,
    placingRotation,
    placingColor,
    movingUid,
    playerPoseRef,
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
  });
  propsRef.current = {
    location,
    viewMode,
    mode,
    items,
    surfaces,
    mood,
    avatarConfig,
    activeEmote,
    selectedUid,
    placingCatalogId,
    placingRotation,
    placingColor,
    movingUid,
    playerPoseRef,
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
  };

  const sceneHandlesRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    renderer: THREE.WebGLRenderer;
    maxAnisotropy: number;
    isSoftwareGl: boolean;
    roomContainer: THREE.Group;
    worldContainer: THREE.Group;
    furnitureRoot: THREE.Group;
    furnitureMap: Map<string, THREE.Group>;
    popAnimations: Map<string, number>;
    avatarRig: AvatarRig;
    roomHandles: ReturnType<typeof buildRoomArchitecture>;
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
    cameraAnim: {
      active: boolean;
      pos: THREE.Vector3;
      target: THREE.Vector3;
    };
    playCam: {
      yaw: number;
      pitch: number;
      dist: number;
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
      } | null;
      pendingPortal: 'toWorld' | 'toRoom' | null;
      pendingNpcId: string | null;
      seatedUid: string | null;
      jumpVel: number;
      jumpY: number;
      stepTimer: number;
      doorSwingTimer: number;
      portalCooldown: number;
    };
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
    scene.fog = new THREE.Fog('#dfe8f2', 26, 62);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      36,
      mount.clientWidth / mount.clientHeight,
      0.1,
      450
    );
    camera.position.set(11.2, 9.6, 11.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 0.75, 0);
    controls.minDistance = 5.0;
    controls.maxDistance = 24;
    controls.minPolarAngle = 0.28;
    controls.maxPolarAngle = Math.PI / 2 - 0.1;
    controls.minAzimuthAngle = -0.18;
    controls.maxAzimuthAngle = Math.PI / 2 + 0.18;
    controls.update();

    const hemiLight = new THREE.HemisphereLight(0xdceeff, 0x9c826b, 0.78);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e0, 1.9);
    keyLight.position.set(-10, 14, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 65;
    const d = 14;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);
    scene.add(keyLight.target);

    const fillLight = new THREE.DirectionalLight(0xbcd6ff, 0.52);
    fillLight.position.set(9, 7, -8);
    scene.add(fillLight);

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

    const boxEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 0.08, 1));
    const selectionBox = new THREE.LineSegments(
      boxEdges,
      new THREE.LineBasicMaterial({ color: 0x3b82f6 })
    );
    selectionBox.visible = false;
    roomContainer.add(selectionBox);

    const worldContainer = new THREE.Group();
    worldContainer.visible = propsRef.current.location === 'world';
    roomContainer.visible = propsRef.current.location === 'room';
    scene.add(worldContainer);

    const mainWorld = buildMainWorld(maxAnisotropy, isSoftwareGl);
    worldContainer.add(mainWorld.worldGroup);

    const avatarRig = createAvatarRig(propsRef.current.avatarConfig);
    avatarRig.root.position.set(0.5, 0, 1.8);
    scene.add(avatarRig.root);

    const rippleMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.27, 28),
      new THREE.MeshBasicMaterial({
        color: 0x10b981,
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
      worldContainer,
      furnitureRoot,
      furnitureMap: new Map<string, THREE.Group>(),
      popAnimations: new Map<string, number>(),
      avatarRig,
      roomHandles,
      mainWorld,
      keyLight,
      hemiLight,
      fillLight,
      selectionBox,
      ghostGroup: null as THREE.Group | null,
      ghostKey: '',
      ghostState: { valid: false, gx: 0, gz: 0, wall: undefined as 'north' | 'west' | undefined },
      cameraAnim: {
        active: false,
        pos: new THREE.Vector3(),
        target: new THREE.Vector3(),
      },
      playCam: {
        yaw: 0,
        pitch: 0.26,
        dist: 3.7,
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
        } | null,
        pendingPortal: null as 'toWorld' | 'toRoom' | null,
        pendingNpcId: null as string | null,
        seatedUid: null as string | null,
        jumpVel: 0,
        jumpY: 0,
        stepTimer: 0,
        doorSwingTimer: 0,
        portalCooldown: 0,
      },
    };
    sceneHandlesRef.current = handles;

    controls.addEventListener('start', () => {
      handles.cameraAnim.active = false;
    });

    // Proximity evaluation for Play View 'E' interaction
    let lastPrompt: string | null = null;
    function getNearbyAction(): { label: string; execute: () => void } | null {
      const { location: loc, viewMode: vm, items: list } = propsRef.current;
      if (vm !== 'play') return null;
      const av = handles.avatarState;

      if (av.seatedUid) {
        return {
          label: 'Press E · Stand Up',
          execute: () => {
            av.seatedUid = null;
            av.y = 0;
            propsRef.current.onEmoteChange('idle');
            sfx.playClick();
          },
        };
      }

      if (loc === 'room') {
        if (Math.hypot(av.x - -4.35, av.z - 3.5) < 1.55) {
          return {
            label: 'Press E · Exit to Main World',
            execute: () => {
              sfx.playToggle(true);
              propsRef.current.onChangeLocation('world');
            },
          };
        }
        let bestDist = 1.65;
        let bestItem: PlacedItem | null = null;
        for (const it of list) {
          const cat = getCatalogItem(it.catalogId);
          if (!cat || (!cat.interactive && !cat.sittable)) continue;
          const t = getItemWorldTransform(it);
          const dist = Math.hypot(av.x - t.x, av.z - t.z);
          if (dist < bestDist) {
            bestDist = dist;
            bestItem = it;
          }
        }
        if (bestItem) {
          const cat = getCatalogItem(bestItem.catalogId)!;
          if (cat.interactive) {
            return {
              label: `Press E · ${bestItem.active ? 'Turn Off' : 'Turn On'} ${cat.name}`,
              execute: () => {
                sfx.playToggle(!bestItem!.active);
                propsRef.current.onToggleInteractive(bestItem!.uid);
                propsRef.current.onWalkHint?.(
                  `${cat.name} turned ${!bestItem!.active ? 'on' : 'off'}`
                );
              },
            };
          }
          if (cat.sittable) {
            const seatInfo = getSeatWorldInfo(bestItem);
            if (seatInfo) {
              return {
                label: `Press E · Sit on ${cat.name}`,
                execute: () => {
                  av.path = [];
                  av.x = seatInfo.seatPos.x;
                  av.y = seatInfo.seatPos.y - 0.35;
                  av.z = seatInfo.seatPos.z;
                  av.yaw = seatInfo.facingYaw;
                  av.seatedUid = bestItem!.uid;
                  propsRef.current.onEmoteChange('sit');
                  sfx.playClick();
                },
              };
            }
          }
        }
        return null;
      }

      // Main World proximity actions
      if (
        Math.hypot(
          av.x - mainWorld.loftDoorEntryPos.x,
          av.z - mainWorld.loftDoorEntryPos.z
        ) < 2.2
      ) {
        return {
          label: 'Press E or Walk Through · Enter My Loft',
          execute: () => {
            sfx.playToggle(true);
            propsRef.current.onChangeLocation('room');
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
          label: 'Press E · Toggle Dance Lights',
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
            label: `Press E · Talk to ${npc.name}`,
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
            label: `Press E · Sit on ${s.label}`,
            execute: () => {
              av.path = [];
              av.x = s.seatPos.x;
              av.y = s.seatPos.y - 0.35;
              av.z = s.seatPos.z;
              av.yaw = s.facingYaw;
              av.seatedUid = s.id;
              propsRef.current.onEmoteChange('sit');
              sfx.playClick();
            },
          };
        }
      }
      return null;
    }

    const keys: Record<string, boolean> = {};
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)
      ) {
        return;
      }
      keys[e.code] = true;

      if (e.code === 'KeyE' && propsRef.current.viewMode === 'play') {
        const action = getNearbyAction();
        if (action) {
          e.preventDefault();
          action.execute();
        }
      }

      if (
        e.code === 'Space' &&
        (propsRef.current.mode === 'walk' || propsRef.current.location === 'world')
      ) {
        e.preventDefault();
        const av = handles.avatarState;
        if (av.seatedUid) {
          av.seatedUid = null;
          av.y = 0;
          propsRef.current.onEmoteChange('idle');
        }
        if (av.jumpY <= 0.001) {
          av.jumpVel = 4.4;
          sfx.playClick();
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

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
        placingRotation: rot,
        items: list,
      } = propsRef.current;

      if (loc !== 'room' || m !== 'edit' || (!pId && !mUid)) {
        if (handles.ghostGroup) handles.ghostGroup.visible = false;
        return;
      }

      const activeCatalogId =
        pId || list.find((it) => it.uid === mUid)?.catalogId || null;
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
            gz = Math.round(hit.point.z + GRID_SIZE / 2 - cat.size[0] / 2);
            gz = Math.max(0, Math.min(GRID_SIZE - cat.size[0], gz));
          } else {
            wall = 'north';
            gz = 0;
            gx = Math.round(hit.point.x + GRID_SIZE / 2 - cat.size[0] / 2);
            gx = Math.max(0, Math.min(GRID_SIZE - cat.size[0], gx));
          }
        }
      } else {
        const floorHits = raycaster.intersectObject(roomHandles.floorRaycastPlane);
        if (floorHits.length > 0) {
          foundHit = true;
          const pt = floorHits[0].point;
          const [ew, ed] = getEffectiveSize(activeCatalogId, rot);
          gx = Math.round(pt.x + GRID_SIZE / 2 - ew / 2);
          gz = Math.round(pt.z + GRID_SIZE / 2 - ed / 2);
          gx = Math.max(0, Math.min(GRID_SIZE - ew, gx));
          gz = Math.max(0, Math.min(GRID_SIZE - ed, gz));
        }
      }

      if (!foundHit || !handles.ghostGroup) {
        if (handles.ghostGroup) handles.ghostGroup.visible = false;
        return;
      }

      const valid = isValidPlacement(
        {
          uid: mUid ?? undefined,
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
      handles.ghostGroup.visible = true;
      handles.ghostGroup.position.set(t.x, t.y + 0.01, t.z);
      handles.ghostGroup.rotation.y = t.rotY;

      const tint = valid ? 0x34d399 : 0xf87171;
      handles.ghostGroup.traverse((obj) => {
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
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (propsRef.current.viewMode === 'play') {
        const isLocked = document.pointerLockElement === renderer.domElement;
        if (isLocked || draggingLook) {
          const mx = isLocked ? e.movementX : e.clientX - lastLookX;
          const my = isLocked ? e.movementY : e.clientY - lastLookY;
          lastLookX = e.clientX;
          lastLookY = e.clientY;
          handles.playCam.yaw -= mx * 0.0042;
          handles.playCam.pitch = THREE.MathUtils.clamp(
            handles.playCam.pitch + my * 0.0036,
            -0.22,
            1.02
          );
        }
        return;
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
      const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (dist > 6) return;

      // In Play View: clicking canvas requests Pointer Lock for free mouse-look
      if (propsRef.current.viewMode === 'play') {
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

      // ---------------- MAIN WORLD INTERACTIONS ----------------
      if (loc === 'world') {
        const av = handles.avatarState;

        const portalHits = raycaster.intersectObject(mainWorld.loftPortalGroup, true);
        if (portalHits.length > 0) {
          av.seatedUid = null;
          av.pendingSeat = null;
          av.pendingNpcId = null;
          av.path = buildPlazaPath(
            av.x,
            av.z,
            mainWorld.loftDoorThresholdPos.x,
            mainWorld.loftDoorThresholdPos.z
          );
          av.pendingPortal = 'toRoom';
          propsRef.current.onEmoteChange('walk');
          propsRef.current.onWalkHint?.('Walking through Loft doors...');
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
            av.seatedUid = null;
            av.pendingSeat = null;
            av.pendingPortal = null;
            av.y = 0;
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
            av.seatedUid = null;
            av.pendingPortal = null;
            av.pendingNpcId = null;
            av.y = 0;
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
          av.seatedUid = null;
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

      // ---------------- MY LOFT (ROOM) EDIT MODE ----------------
      if (m === 'edit') {
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

      // ---------------- MY LOFT (ROOM) WALK MODE ----------------
      const doorHits = raycaster.intersectObject(roomHandles.exitDoorGroup, true);
      if (doorHits.length > 0) {
        const av = handles.avatarState;
        av.seatedUid = null;
        av.pendingSeat = null;
        av.pendingNpcId = null;
        av.y = 0;
        const path = findPath(av.x, av.z, -4.25, 3.5, list);
        av.path =
          path.length > 0
            ? [...path, { x: -4.9, z: 3.5 }]
            : [
                { x: -4.25, z: 3.5 },
                { x: -4.9, z: 3.5 },
              ];
        av.pendingPortal = 'toWorld';
        av.doorSwingTimer = 1.2;
        propsRef.current.onEmoteChange('walk');
        propsRef.current.onWalkHint?.('Walking out to Main City...');
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
              sfx.playToggle(!item.active);
              propsRef.current.onToggleInteractive(item.uid);
              propsRef.current.onWalkHint?.(
                `${cat.name} turned ${!item.active ? 'on' : 'off'}`
              );
              return;
            }
            if (cat.sittable) {
              const seatInfo = getSeatWorldInfo(item);
              if (seatInfo) {
                const av = handles.avatarState;
                av.seatedUid = null;
                av.pendingPortal = null;
                av.y = 0;
                const path = findPath(
                  av.x,
                  av.z,
                  seatInfo.approachPos.x,
                  seatInfo.approachPos.z,
                  list
                );
                av.path =
                  path.length > 0
                    ? path
                    : [{ x: seatInfo.approachPos.x, z: seatInfo.approachPos.z }];
                av.pendingSeat = {
                  uid: item.uid,
                  seatPos: seatInfo.seatPos,
                  facingYaw: seatInfo.facingYaw,
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
        const av = handles.avatarState;
        av.seatedUid = null;
        av.pendingSeat = null;
        av.pendingPortal = null;
        av.y = 0;
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
        handles.playCam.dist = THREE.MathUtils.clamp(
          handles.playCam.dist + e.deltaY * 0.0025,
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
      const canWalk = currentLoc === 'world' || currentMode === 'walk';
      let isMoving = false;
      const sprinting = Boolean(keys['ShiftLeft'] || keys['ShiftRight']);
      const prevAvX = av.x;
      const prevAvZ = av.z;

      // 1. Movement (WASD + Click Path)
      if (canWalk) {
        let moveX = 0;
        let moveZ = 0;
        if (keys['KeyW'] || keys['ArrowUp']) moveZ -= 1;
        if (keys['KeyS'] || keys['ArrowDown']) moveZ += 1;
        if (keys['KeyA'] || keys['ArrowLeft']) moveX -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) moveX += 1;

        if (moveX !== 0 || moveZ !== 0) {
          av.path = [];
          av.pendingSeat = null;
          av.pendingPortal = null;
          av.pendingNpcId = null;
          if (av.seatedUid) {
            av.seatedUid = null;
            av.y = currentLoc === 'world' ? getCityGroundY(av.x, av.z) : 0;
          }

          let dirX = 0;
          let dirZ = 0;
          if (currentView === 'play') {
            // GTA-style camera-yaw forward & strafe
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
          const baseSpeed = currentLoc === 'world' ? 4.4 : 2.75;
          const speed = sprinting ? (currentLoc === 'world' ? 10.5 : 4.25) : baseSpeed;

          const nextX = av.x + nx * speed * delta;
          const nextZ = av.z + nz * speed * delta;

          if (currentLoc === 'world') {
            if (isMainWorldPosWalkable(nextX, av.z, mainWorld.obstacles)) av.x = nextX;
            if (isMainWorldPosWalkable(av.x, nextZ, mainWorld.obstacles)) av.z = nextZ;
          } else {
            if (isWorldPosWalkable(nextX, av.z, currentItems)) av.x = nextX;
            if (isWorldPosWalkable(av.x, nextZ, currentItems)) av.z = nextZ;
          }

          const targetYaw = Math.atan2(nx, nz);
          av.yaw += shortestAngleDiff(av.yaw, targetYaw) * (1 - Math.exp(-15 * delta));
          isMoving = true;
        } else if (av.path.length > 0 && currentView === 'isometric') {
          const target = av.path[0];
          const dx = target.x - av.x;
          const dz = target.z - av.z;
          const dist = Math.hypot(dx, dz);
          const speed = currentLoc === 'world' ? 4.2 : 2.6;

          if (dist <= speed * delta + 0.04) {
            if (
              currentLoc === 'world' &&
              !isMainWorldPosWalkable(target.x, target.z, mainWorld.obstacles)
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
                } else if (av.pendingPortal === 'toRoom') {
                  av.pendingPortal = null;
                  av.portalCooldown = 1.0;
                  propsRef.current.onChangeLocation('room');
                } else if (av.pendingSeat) {
                  av.x = av.pendingSeat.seatPos.x;
                  av.y = av.pendingSeat.seatPos.y - 0.35;
                  av.z = av.pendingSeat.seatPos.z;
                  av.yaw = av.pendingSeat.facingYaw;
                  av.seatedUid = av.pendingSeat.uid;
                  av.pendingSeat = null;
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
              if (isMainWorldPosWalkable(stepX, av.z, mainWorld.obstacles)) {
                av.x = stepX;
                movedAny = true;
              }
              if (isMainWorldPosWalkable(av.x, stepZ, mainWorld.obstacles)) {
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
      if (currentLoc === 'world' && !av.seatedUid) {
        const groundY = getCityGroundY(av.x, av.z);
        av.y = THREE.MathUtils.lerp(av.y, groundY, 1 - Math.exp(-18 * delta));
      }

      // Follow player horizontally in Isometric Main City mode so you can roam A-Z & 1st-30th streets
      if (currentLoc === 'world' && currentView === 'isometric' && !handles.cameraAnim.active) {
        const dpx = av.x - prevAvX;
        const dpz = av.z - prevAvZ;
        if (Math.abs(dpx) > 1e-5 || Math.abs(dpz) > 1e-5) {
          controls.target.x += dpx;
          controls.target.z += dpz;
          camera.position.x += dpx;
          camera.position.z += dpz;
        }
      }

      // Walk-through door triggers in BOTH locations
      if (av.portalCooldown <= 0) {
        if (
          currentLoc === 'room' &&
          currentMode === 'walk' &&
          av.x < -4.72 &&
          av.z >= 3.02 &&
          av.z <= 3.98
        ) {
          av.portalCooldown = 1.0;
          av.path = [];
          av.pendingPortal = null;
          sfx.playToggle(true);
          propsRef.current.onChangeLocation('world');
        } else if (
          currentLoc === 'world' &&
          Math.hypot(
            av.x - CITY_LAYOUT.loftDoorPos.x,
            av.z - CITY_LAYOUT.loftDoorPos.z
          ) < 0.92
        ) {
          av.portalCooldown = 1.0;
          av.path = [];
          av.pendingPortal = null;
          sfx.playToggle(true);
          propsRef.current.onChangeLocation('room');
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

        const horizDist = handles.playCam.dist * Math.cos(handles.playCam.pitch);
        const vertOffset = handles.playCam.dist * Math.sin(handles.playCam.pitch);

        let desiredX = targetX - fwdX * horizDist;
        let desiredY = Math.max(0.45, targetY + vertOffset);
        let desiredZ = targetZ - fwdZ * horizDist;

        // Keep chase camera inside North/West room walls when indoors
        if (currentLoc === 'room') {
          let scale = 1.0;
          const minWall = -4.65;
          if (desiredX < minWall && targetX > minWall) {
            scale = Math.min(scale, (targetX - minWall) / (targetX - desiredX));
          }
          if (desiredZ < minWall && targetZ > minWall) {
            scale = Math.min(scale, (targetZ - minWall) / (targetZ - desiredZ));
          }
          scale = Math.max(0.28, scale);
          desiredX = targetX + (desiredX - targetX) * scale;
          desiredY = targetY + (desiredY - targetY) * scale;
          desiredZ = targetZ + (desiredZ - targetZ) * scale;
        }

        const camK = 14;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, desiredX, camK, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, desiredY, camK, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, desiredZ, camK, delta);
        _lookTarget.set(targetX, targetY, targetZ);
        camera.lookAt(_lookTarget);

        // Proximity prompt check
        const nearby = getNearbyAction();
        const nextLabel = nearby ? nearby.label : null;
        if (nextLabel !== lastPrompt) {
          lastPrompt = nextLabel;
          propsRef.current.onProximityPrompt?.(nextLabel);
        }
      } else {
        if (lastPrompt !== null) {
          lastPrompt = null;
          propsRef.current.onProximityPrompt?.(null);
        }
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
        controls.update();
      }

      const nearRoomDoor = currentLoc === 'room' && av.x < -3.3 && Math.abs(av.z - 3.5) < 1.3;
      if (av.doorSwingTimer > 0 || nearRoomDoor) {
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

      if (av.seatedUid && currentLoc === 'room') {
        const seatItem = currentItems.find((it) => it.uid === av.seatedUid);
        if (!seatItem) {
          av.seatedUid = null;
          av.y = 0;
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

      // Speed up walk animation slightly when sprinting
      const animElapsed = isMoving && sprinting ? elapsed * 1.35 : elapsed;
      avatarRig.updateAnimation(effectiveEmote, isMoving, animElapsed, delta, av.jumpY);

      if (rippleLife > 0) {
        rippleLife = Math.max(0, rippleLife - delta * 1.9);
        const s = 1 + (1 - rippleLife) * 1.4;
        rippleMesh.scale.set(s, s, 1);
        (rippleMesh.material as THREE.MeshBasicMaterial).opacity = rippleLife * 0.75;
      }

      if (currentLoc === 'room') {
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

        if (selectionBox.visible) {
          const pulse = 1 + Math.sin(elapsed * 5) * 0.025;
          selectionBox.scale.set(
            selectionBox.userData.baseW * pulse,
            1,
            selectionBox.userData.baseD * pulse
          );
        }
      } else {
        keyLight.target.position.set(av.x, 0, av.z);
        keyLight.position.set(av.x - 12, 18, av.z + 8);
        mainWorld.updateWorld(elapsed, delta, av.x, av.z, propsRef.current.mood);
      }

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
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
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
      h.controls.enabled = false;
      h.cameraAnim.active = false;
      h.camera.fov = 52;
      h.camera.updateProjectionMatrix();
      // Align playCam behind the avatar's current facing yaw
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
      if (loc === 'world') {
        const av = h.avatarState;
        h.cameraAnim.pos.set(av.x + 12.5, 11.5, av.z + 14.5);
        h.cameraAnim.target.set(av.x, 0.8, av.z);
      } else {
        h.cameraAnim.pos.set(11.2, 9.6, 11.2);
        h.cameraAnim.target.set(0, 0.75, 0);
      }
      h.cameraAnim.active = true;
    }
  }, [viewMode]);

  // Sync Location Switching ('room' <-> 'world')
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;
    const vm = propsRef.current.viewMode;

    h.avatarState.path = [];
    h.avatarState.pendingSeat = null;
    h.avatarState.pendingPortal = null;
    h.avatarState.pendingNpcId = null;
    h.avatarState.seatedUid = null;
    h.avatarState.doorSwingTimer = 0;
    h.avatarState.portalCooldown = 0.85;

    const fog = h.scene.fog as THREE.Fog;

    if (location === 'world') {
      h.roomContainer.visible = false;
      h.worldContainer.visible = true;
      const entry = h.mainWorld.loftDoorEntryPos;
      h.avatarState.x = entry.x;
      h.avatarState.z = entry.z;
      h.avatarState.y = getCityGroundY(entry.x, entry.z);
      h.avatarState.yaw = 0;
      h.playCam.yaw = Math.PI; // Look south down M St plaza
      h.controls.minAzimuthAngle = -Infinity;
      h.controls.maxAzimuthAngle = Infinity;
      h.controls.maxDistance = 38;
      fog.near = 65;
      fog.far = 220;
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
    } else {
      h.roomContainer.visible = true;
      h.worldContainer.visible = false;
      h.avatarState.x = -3.55;
      h.avatarState.z = 3.5;
      h.avatarState.y = 0;
      h.avatarState.yaw = Math.PI / 2;
      h.playCam.yaw = -Math.PI / 2; // Look east into the loft
      h.controls.minAzimuthAngle = -0.18;
      h.controls.maxAzimuthAngle = Math.PI / 2 + 0.18;
      h.controls.maxDistance = 24;
      fog.near = 26;
      fog.far = 62;
      const d = 14;
      h.keyLight.shadow.camera.left = -d;
      h.keyLight.shadow.camera.right = d;
      h.keyLight.shadow.camera.top = d;
      h.keyLight.shadow.camera.bottom = -d;
      h.keyLight.shadow.camera.updateProjectionMatrix();
      h.keyLight.target.position.set(0, 0, 0);
      h.keyLight.position.set(-10, 14, 6);
      if (vm === 'isometric') {
        h.cameraAnim.pos.set(11.2, 9.6, 11.2);
        h.cameraAnim.target.set(0, 0.75, 0);
        h.cameraAnim.active = true;
      }
      propsRef.current.onEmoteChange('idle');
    }
  }, [location]);

  // Sync Room Mode
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;
    h.roomHandles.setGridVisible(location === 'room' && mode === 'edit');
    if (mode === 'walk' || location === 'world') {
      h.selectionBox.visible = false;
      if (h.ghostGroup) h.ghostGroup.visible = false;
    }
  }, [mode, location]);

  // Sync Surfaces
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;
    h.roomHandles.updateSurfaces(surfaces.floor, surfaces.wall, h.maxAnisotropy);
  }, [surfaces.floor, surfaces.wall]);

  // Sync Lighting Mood
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;
    h.roomHandles.updateMoodBackdrop(mood);
    if (mood === 'morning') {
      h.scene.background = new THREE.Color('#dfe8f2');
      (h.scene.fog as THREE.Fog).color.set('#dfe8f2');
      h.keyLight.color.set(0xfff4e0);
      h.keyLight.intensity = 1.9;
      h.hemiLight.color.set(0xdceeff);
      h.hemiLight.groundColor.set(0x9c826b);
      h.hemiLight.intensity = 0.78;
      h.fillLight.intensity = 0.55;
    } else if (mood === 'golden') {
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
  }, [mood]);

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
      h.avatarState.seatedUid = null;
      h.avatarState.y = 0;
    }
    if (activeEmote !== 'walk') {
      h.avatarState.path = [];
      h.avatarState.pendingSeat = null;
      h.avatarState.pendingPortal = null;
    }
  }, [emoteTriggerId, activeEmote]);

  // Sync Furniture Items diffing
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;

    const existingKeys = new Set(h.furnitureMap.keys());
    const nextIds = new Set(items.map((it) => it.uid));

    for (const uid of existingKeys) {
      if (!nextIds.has(uid)) {
        const grp = h.furnitureMap.get(uid);
        if (grp) h.furnitureRoot.remove(grp);
        h.furnitureMap.delete(uid);
      }
    }

    for (const item of items) {
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
        newGrp.visible = item.uid !== movingUid;
        h.furnitureRoot.add(newGrp);
        h.furnitureMap.set(item.uid, newGrp);
        if (!prevGrp) h.popAnimations.set(item.uid, 0.05);
      } else if (prevGrp) {
        const t = getItemWorldTransform(item);
        prevGrp.position.set(t.x, t.y, t.z);
        prevGrp.rotation.y = t.rotY;
        prevGrp.visible = item.uid !== movingUid;
      }
    }
  }, [items, movingUid]);

  // Sync Placement Ghost
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h) return;

    const activeCatalogId =
      placingCatalogId || items.find((it) => it.uid === movingUid)?.catalogId || null;

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
  }, [location, mode, placingCatalogId, movingUid, placingRotation, placingColor, items]);

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

  // Sync Camera Presets
  useEffect(() => {
    const h = sceneHandlesRef.current;
    if (!h || !cameraPreset || viewMode === 'play') return;

    if (cameraPreset.type === 'overview') {
      if (location === 'world') {
        const av = h.avatarState;
        h.cameraAnim.pos.set(av.x + 12.5, 11.5, av.z + 14.5);
        h.cameraAnim.target.set(av.x, 0.8, av.z);
      } else {
        h.cameraAnim.pos.set(11.2, 9.6, 11.2);
        h.cameraAnim.target.set(0, 0.75, 0);
      }
      h.cameraAnim.active = true;
    } else if (cameraPreset.type === 'isometric') {
      h.cameraAnim.pos.set(0.2, 13.5, 11.8);
      h.cameraAnim.target.set(0, 0.5, 0);
      h.cameraAnim.active = true;
    } else if (cameraPreset.type === 'closeup') {
      const av = h.avatarState;
      h.cameraAnim.pos.set(av.x + 4.4, 3.6, av.z + 4.4);
      h.cameraAnim.target.set(av.x, 1.0, av.z);
      h.cameraAnim.active = true;
    }
  }, [cameraPreset, location, viewMode]);

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
