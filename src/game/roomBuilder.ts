import * as THREE from 'three';
import { GRID_SIZE, PLAYER_SUITE_NUMBER, WALL_STYLES } from './catalog';
import { createFloorTexture } from './textures';
import type { FloorStyleId, LightingMood, WallStyleId } from './types';

export const SUITE_DOOR_Z = 5.0; // West wall doorway center Z (opening 4.5..5.5)

export interface RoomEnvironmentHandles {
  roomGroup: THREE.Group;
  floorTopMesh: THREE.Mesh;
  floorRaycastPlane: THREE.Mesh;
  northWallRaycastPlane: THREE.Mesh;
  westWallRaycastPlane: THREE.Mesh;
  gridOverlay: THREE.Group;
  exitDoorGroup: THREE.Group;
  doorLeafPivot: THREE.Group;
  windowSkyMat: THREE.MeshBasicMaterial;
  windowSunMat: THREE.MeshBasicMaterial;
  updateSurfaces: (floor: FloorStyleId, wall: WallStyleId, maxAnisotropy: number) => void;
  updateMoodBackdrop: (mood: LightingMood) => void;
  setGridVisible: (visible: boolean) => void;
  setDoorUnlocked: (unlocked: boolean) => void;
  setRoomBadge: (suiteNumber: string, maxAnisotropy: number) => void;
}

function createSuitePlaqueTexture(suiteNumber: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0c120f';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#39ff14';
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 244, 116);
  ctx.fillStyle = '#39ff14';
  ctx.font = 'bold 26px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SUITE', 128, 44);
  ctx.fillStyle = '#f2fff5';
  ctx.font = 'bold 54px sans-serif';
  ctx.fillText(suiteNumber, 128, 102);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildRoomArchitecture(
  initialFloor: FloorStyleId,
  initialWall: WallStyleId,
  maxAnisotropy: number
): RoomEnvironmentHandles {
  const roomGroup = new THREE.Group();
  const half = GRID_SIZE / 2; // 7m

  // Architectural outer hotel penthouse slab
  const slabGeo = new THREE.BoxGeometry(GRID_SIZE + 0.54, 0.42, GRID_SIZE + 0.54);
  const slabMat = new THREE.MeshStandardMaterial({
    color: 0x22252e,
    roughness: 0.72,
    metalness: 0.08,
  });
  const slab = new THREE.Mesh(slabGeo, slabMat);
  slab.position.set(-0.12, -0.215, -0.12);
  slab.receiveShadow = true;
  roomGroup.add(slab);

  // Subtle floor top surface (14 x 14 at y = 0)
  const floorTopMat = new THREE.MeshStandardMaterial({
    map: createFloorTexture(initialFloor, maxAnisotropy),
    roughness: initialFloor === 'boucle_carpet' ? 0.92 : 0.48,
    metalness: 0.04,
  });
  const floorTopMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE),
    floorTopMat
  );
  floorTopMesh.rotation.x = -Math.PI / 2;
  floorTopMesh.position.y = 0.0;
  floorTopMesh.receiveShadow = true;
  roomGroup.add(floorTopMesh);

  // Invisible raycast planes for floor & walls
  const floorRaycastPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  floorRaycastPlane.rotation.x = -Math.PI / 2;
  floorRaycastPlane.position.y = 0.005;
  roomGroup.add(floorRaycastPlane);

  const wallMat = new THREE.MeshStandardMaterial({
    color: WALL_STYLES.find((w) => w.id === initialWall)?.color ?? '#f1ece2',
    roughness: 0.88,
    metalness: 0.02,
  });

  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xe6e0d5,
    roughness: 0.55,
    metalness: 0.04,
  });

  const windowFrameMat = new THREE.MeshStandardMaterial({
    color: 0x23262e,
    roughness: 0.35,
    metalness: 0.65,
  });

  const wallHeight = 3.45;
  const wallThick = 0.24;

  // --- North Wall (z = -7.12) ---
  const northWall = new THREE.Mesh(
    new THREE.BoxGeometry(GRID_SIZE + wallThick, wallHeight, wallThick),
    wallMat
  );
  northWall.position.set(-wallThick / 2, wallHeight / 2, -half - wallThick / 2);
  northWall.castShadow = true;
  northWall.receiveShadow = true;
  roomGroup.add(northWall);

  const northBaseboard = new THREE.Mesh(
    new THREE.BoxGeometry(GRID_SIZE, 0.16, 0.03),
    trimMat
  );
  northBaseboard.position.set(0, 0.08, -half + 0.015);
  northBaseboard.receiveShadow = true;
  roomGroup.add(northBaseboard);

  const northWallRaycastPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID_SIZE, wallHeight),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  northWallRaycastPlane.position.set(0, wallHeight / 2, -half + 0.01);
  roomGroup.add(northWallRaycastPlane);

  // --- West Wall (x = -7.12) with Grand Hotel Panoramic Window (z: -4..+3) & Suite Door (z: 4.5..5.5) ---
  // 1. North solid pier (z: -7 to -4, length 3.0)
  const westPierNorth = new THREE.Mesh(
    new THREE.BoxGeometry(wallThick, wallHeight, 3.0),
    wallMat
  );
  westPierNorth.position.set(-half - wallThick / 2, wallHeight / 2, -5.5);
  westPierNorth.castShadow = true;
  westPierNorth.receiveShadow = true;
  roomGroup.add(westPierNorth);

  // 2. Pier between window & suite door (z: 3.0 to 4.5, length 1.5)
  const westPierDoorNorth = new THREE.Mesh(
    new THREE.BoxGeometry(wallThick, wallHeight, 1.5),
    wallMat
  );
  westPierDoorNorth.position.set(-half - wallThick / 2, wallHeight / 2, 3.75);
  westPierDoorNorth.castShadow = true;
  westPierDoorNorth.receiveShadow = true;
  roomGroup.add(westPierDoorNorth);

  // 3. South pier beside suite door (z: 5.5 to 7.0, length 1.5)
  const westPierDoorSouth = new THREE.Mesh(
    new THREE.BoxGeometry(wallThick, wallHeight, 1.5),
    wallMat
  );
  westPierDoorSouth.position.set(-half - wallThick / 2, wallHeight / 2, 6.25);
  westPierDoorSouth.castShadow = true;
  westPierDoorSouth.receiveShadow = true;
  roomGroup.add(westPierDoorSouth);

  // 4. Header above suite door (y: 2.28..3.45, z: 4.5..5.5)
  const westDoorHeader = new THREE.Mesh(
    new THREE.BoxGeometry(wallThick, wallHeight - 2.28, 1.0),
    wallMat
  );
  westDoorHeader.position.set(
    -half - wallThick / 2,
    2.28 + (wallHeight - 2.28) / 2,
    SUITE_DOOR_Z
  );
  westDoorHeader.castShadow = true;
  westDoorHeader.receiveShadow = true;
  roomGroup.add(westDoorHeader);

  // 5. Under-window sill wall (z: -4 to +3, length 7.0, height 0.7)
  const westBottom = new THREE.Mesh(
    new THREE.BoxGeometry(wallThick, 0.7, 7.0),
    wallMat
  );
  westBottom.position.set(-half - wallThick / 2, 0.35, -0.5);
  westBottom.castShadow = true;
  westBottom.receiveShadow = true;
  roomGroup.add(westBottom);

  // 6. Above-window header (z: -4 to +3, length 7.0, y: 2.85..3.45)
  const westTop = new THREE.Mesh(
    new THREE.BoxGeometry(wallThick, 0.6, 7.0),
    wallMat
  );
  westTop.position.set(-half - wallThick / 2, 3.15, -0.5);
  westTop.castShadow = true;
  westTop.receiveShadow = true;
  roomGroup.add(westTop);

  // West baseboard (split cleanly around door opening)
  const westBaseboardNorth = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.16, 11.5),
    trimMat
  );
  westBaseboardNorth.position.set(-half + 0.015, 0.08, -1.25);
  roomGroup.add(westBaseboardNorth);

  const westBaseboardSouth = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.16, 1.5),
    trimMat
  );
  westBaseboardSouth.position.set(-half + 0.015, 0.08, 6.25);
  roomGroup.add(westBaseboardSouth);

  // Panoramic Window Sill & Mullions
  const sill = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.05, 7.08), trimMat);
  sill.position.set(-half - 0.06, 0.71, -0.5);
  sill.receiveShadow = true;
  roomGroup.add(sill);

  for (const mz of [-4.0, -2.25, -0.5, 1.25, 3.0]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.15, 0.06), windowFrameMat);
    post.position.set(-half - 0.1, 1.78, mz);
    roomGroup.add(post);
  }
  for (const my of [0.74, 2.83]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 7.06), windowFrameMat);
    rail.position.set(-half - 0.1, my, -0.5);
    roomGroup.add(rail);
  }

  const glassPane = new THREE.Mesh(
    new THREE.PlaneGeometry(7.0, 2.1),
    new THREE.MeshPhysicalMaterial({
      color: 0xdff2ff,
      roughness: 0.08,
      metalness: 0.05,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  glassPane.rotation.y = Math.PI / 2;
  glassPane.position.set(-half - 0.1, 1.78, -0.5);
  roomGroup.add(glassPane);

  // Exterior Sky & City Horizon outside hotel window
  const windowSkyMat = new THREE.MeshBasicMaterial({ color: 0xbfe2ff });
  const skyPanel = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 2.4), windowSkyMat);
  skyPanel.rotation.y = Math.PI / 2;
  skyPanel.position.set(-half - 0.42, 1.78, -0.5);
  roomGroup.add(skyPanel);

  const windowSunMat = new THREE.MeshBasicMaterial({ color: 0xfff5d6 });
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), windowSunMat);
  sunDisc.rotation.y = Math.PI / 2;
  sunDisc.position.set(-half - 0.39, 2.24, -2.2);
  roomGroup.add(sunDisc);

  const cityMat = new THREE.MeshBasicMaterial({ color: 0x8ea7c2 });
  for (let b = 0; b < 8; b++) {
    const bh = 0.42 + ((b * 37) % 5) * 0.16;
    const bldg = new THREE.Mesh(new THREE.PlaneGeometry(0.82, bh), cityMat);
    bldg.rotation.y = Math.PI / 2;
    bldg.position.set(-half - 0.37, 0.72 + bh / 2, -3.4 + b * 0.85);
    roomGroup.add(bldg);
  }

  const westWallRaycastPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID_SIZE, wallHeight),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  westWallRaycastPlane.rotation.y = Math.PI / 2;
  westWallRaycastPlane.position.set(-half + 0.01, wallHeight / 2, 0);
  roomGroup.add(westWallRaycastPlane);

  // --- Hotel Suite Entry Door & Keycard Lock (West wall at z = 5.0) ---
  const exitDoorGroup = new THREE.Group();
  exitDoorGroup.position.set(-half + 0.02, 0, SUITE_DOOR_Z);
  exitDoorGroup.userData.isExitDoor = true;

  const doorFrameMat = new THREE.MeshStandardMaterial({
    color: 0x262932,
    roughness: 0.4,
    metalness: 0.45,
  });
  const doorWoodMat = new THREE.MeshStandardMaterial({
    color: 0x5c3a24,
    roughness: 0.42,
    metalness: 0.06,
  });
  const doorBrassMat = new THREE.MeshStandardMaterial({
    color: 0xd8b45a,
    roughness: 0.25,
    metalness: 0.88,
  });

  for (const dz of [-0.52, 0.52]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.28, 0.08), doorFrameMat);
    jamb.position.set(0, 1.14, dz);
    jamb.castShadow = true;
    exitDoorGroup.add(jamb);
  }
  const doorHeader = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 1.12), doorFrameMat);
  doorHeader.position.set(0, 2.28, 0);
  exitDoorGroup.add(doorHeader);

  // Hinged Suite Door Leaf
  const doorLeafPivot = new THREE.Group();
  doorLeafPivot.position.set(0.01, 0, -0.46);

  const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.22, 0.92), doorWoodMat);
  doorPanel.position.set(0, 1.11, 0.46);
  doorPanel.castShadow = true;
  doorLeafPivot.add(doorPanel);

  // Brass inlay trim on luxury hotel door
  const trimBar = new THREE.Mesh(new THREE.BoxGeometry(0.065, 1.75, 0.04), doorBrassMat);
  trimBar.position.set(0, 1.12, 0.22);
  doorLeafPivot.add(trimBar);

  // Brass lever handle
  const escutcheon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.05), doorBrassMat);
  escutcheon.position.set(0.01, 1.02, 0.82);
  doorLeafPivot.add(escutcheon);

  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.022, 0.14), doorBrassMat);
  lever.position.set(0.045, 1.03, 0.77);
  doorLeafPivot.add(lever);

  exitDoorGroup.add(doorLeafPivot);

  // Suite Number Brass Plaque beside Door
  let plaqueTex = createSuitePlaqueTexture(PLAYER_SUITE_NUMBER);
  plaqueTex.anisotropy = maxAnisotropy;
  const plaqueMat = new THREE.MeshStandardMaterial({
    map: plaqueTex,
    roughness: 0.35,
    metalness: 0.35,
  });
  const plaqueMesh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.22, 0.44), plaqueMat);
  plaqueMesh.position.set(0.03, 1.65, -0.78);
  exitDoorGroup.add(plaqueMesh);

  // Wall-mounted Keycard Pad & Status LED next to handle (z = +0.68)
  const readerBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.2, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.3, metalness: 0.75 })
  );
  readerBody.position.set(0.03, 1.15, 0.68);
  exitDoorGroup.add(readerBody);

  const keycardLedMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });
  const readerLed = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.035, 0.075), keycardLedMat);
  readerLed.position.set(0.035, 1.21, 0.68);
  exitDoorGroup.add(readerLed);

  // Subtle Hotel Entry Runner Mat inside door
  const doormat = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 0.02, 1.1),
    new THREE.MeshStandardMaterial({
      color: 0x7c2d2d,
      roughness: 0.92,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  doormat.position.set(0.48, 0.012, 0);
  doormat.receiveShadow = true;
  exitDoorGroup.add(doormat);

  roomGroup.add(exitDoorGroup);

  // Top Coping Cap along cutaway walls
  const capMat = new THREE.MeshStandardMaterial({ color: 0x22252e, roughness: 0.65 });
  const northCap = new THREE.Mesh(
    new THREE.BoxGeometry(GRID_SIZE + wallThick + 0.04, 0.06, wallThick + 0.04),
    capMat
  );
  northCap.position.set(-wallThick / 2, wallHeight + 0.03, -half - wallThick / 2);
  roomGroup.add(northCap);

  const westCap = new THREE.Mesh(
    new THREE.BoxGeometry(wallThick + 0.04, 0.06, GRID_SIZE + wallThick + 0.04),
    capMat
  );
  westCap.position.set(-half - wallThick / 2, wallHeight + 0.03, -wallThick / 2);
  roomGroup.add(westCap);

  // --- Edit Mode Architectural Floor Grid ---
  const gridOverlay = new THREE.Group();
  gridOverlay.visible = false;

  const lineMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
  });
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= GRID_SIZE; i++) {
    const p = -half + i;
    pts.push(new THREE.Vector3(p, 0.014, -half));
    pts.push(new THREE.Vector3(p, 0.014, half));
    pts.push(new THREE.Vector3(-half, 0.014, p));
    pts.push(new THREE.Vector3(half, 0.014, p));
  }
  const gridGeo = new THREE.BufferGeometry().setFromPoints(pts);
  const gridLines = new THREE.LineSegments(gridGeo, lineMat);
  gridOverlay.add(gridLines);
  roomGroup.add(gridOverlay);

  let currentFloorTex: THREE.CanvasTexture | null = floorTopMat.map as THREE.CanvasTexture;

  function updateSurfaces(floor: FloorStyleId, wall: WallStyleId, anisotropy: number) {
    const nextTex = createFloorTexture(floor, anisotropy);
    floorTopMat.map = nextTex;
    floorTopMat.roughness = floor === 'boucle_carpet' ? 0.94 : floor === 'concrete' ? 0.35 : 0.48;
    floorTopMat.needsUpdate = true;
    if (currentFloorTex) currentFloorTex.dispose();
    currentFloorTex = nextTex;

    const wallEntry = WALL_STYLES.find((w) => w.id === wall);
    if (wallEntry) {
      wallMat.color.set(wallEntry.color);
    }
  }

  function updateMoodBackdrop(mood: LightingMood) {
    if (mood === 'morning') {
      windowSkyMat.color.set(0xbfe2ff);
      windowSunMat.color.set(0xfff5d6);
      cityMat.color.set(0x8ea7c2);
    } else if (mood === 'golden') {
      windowSkyMat.color.set(0xf5a67e);
      windowSunMat.color.set(0xffdf85);
      cityMat.color.set(0x7c5d75);
    } else {
      windowSkyMat.color.set(0x161c33);
      windowSunMat.color.set(0xe2e8f0);
      cityMat.color.set(0x28314d);
    }
  }

  function setGridVisible(visible: boolean) {
    gridOverlay.visible = visible;
  }

  function setDoorUnlocked(unlocked: boolean) {
    const hex = unlocked ? 0x39ff14 : 0xf59e0b;
    keycardLedMat.color.setHex(hex);
    keycardLedMat.emissive.setHex(hex);
  }

  function setRoomBadge(suiteNumber: string, anisotropy: number) {
    const nextTex = createSuitePlaqueTexture(suiteNumber);
    nextTex.anisotropy = anisotropy;
    plaqueMat.map = nextTex;
    plaqueMat.needsUpdate = true;
    if (plaqueTex) plaqueTex.dispose();
    plaqueTex = nextTex;
  }

  return {
    roomGroup,
    floorTopMesh,
    floorRaycastPlane,
    northWallRaycastPlane,
    westWallRaycastPlane,
    gridOverlay,
    exitDoorGroup,
    doorLeafPivot,
    windowSkyMat,
    windowSunMat,
    updateSurfaces,
    updateMoodBackdrop,
    setGridVisible,
    setDoorUnlocked,
    setRoomBadge,
  };
}
