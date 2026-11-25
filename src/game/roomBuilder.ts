import * as THREE from 'three';
import { GRID_SIZE, WALL_STYLES } from './catalog';
import { createFloorTexture } from './textures';
import type { FloorStyleId, LightingMood, WallStyleId } from './types';

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
}

export function buildRoomArchitecture(
  initialFloor: FloorStyleId,
  initialWall: WallStyleId,
  maxAnisotropy: number
): RoomEnvironmentHandles {
  const roomGroup = new THREE.Group();

  // Architectural outer slab
  const slabGeo = new THREE.BoxGeometry(GRID_SIZE + 0.44, 0.36, GRID_SIZE + 0.44);
  const slabMat = new THREE.MeshStandardMaterial({
    color: 0x262932,
    roughness: 0.72,
    metalness: 0.08,
  });
  const slab = new THREE.Mesh(slabGeo, slabMat);
  slab.position.set(-0.1, -0.185, -0.1);
  slab.receiveShadow = true;
  roomGroup.add(slab);

  // Subtle floor top surface (10 x 10 at y = 0)
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

  const wallHeight = 3.2;
  const wallThick = 0.22;

  // --- North Wall (z = -5.11) ---
  const northWall = new THREE.Mesh(
    new THREE.BoxGeometry(GRID_SIZE + wallThick, wallHeight, wallThick),
    wallMat
  );
  northWall.position.set(-wallThick / 2, wallHeight / 2, -GRID_SIZE / 2 - wallThick / 2);
  northWall.castShadow = true;
  northWall.receiveShadow = true;
  roomGroup.add(northWall);

  // North baseboard
  const northBaseboard = new THREE.Mesh(
    new THREE.BoxGeometry(GRID_SIZE, 0.14, 0.03),
    trimMat
  );
  northBaseboard.position.set(0, 0.07, -GRID_SIZE / 2 + 0.015);
  northBaseboard.receiveShadow = true;
  roomGroup.add(northBaseboard);

  const northWallRaycastPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID_SIZE, wallHeight),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  northWallRaycastPlane.position.set(0, wallHeight / 2, -GRID_SIZE / 2 + 0.01);
  roomGroup.add(northWallRaycastPlane);

  // --- West Wall (x = -5.11) with Panoramic Window ---
  // Window opening spans z in [-3.0, +2.0] (tiles 2..7), y in [0.7, 2.65]
  // 1. Left solid pier (z: -5 to -3, length 2)
  const westPierNorth = new THREE.Mesh(
    new THREE.BoxGeometry(wallThick, wallHeight, 2.0),
    wallMat
  );
  westPierNorth.position.set(-GRID_SIZE / 2 - wallThick / 2, wallHeight / 2, -4.0);
  westPierNorth.castShadow = true;
  westPierNorth.receiveShadow = true;
  roomGroup.add(westPierNorth);

  // 2. Right solid piers split around Walk-Through Exit Door (opening z: 3.0..4.0, y: 0..2.28)
  const westPierDoorNorth = new THREE.Mesh(
    new THREE.BoxGeometry(wallThick, wallHeight, 1.0),
    wallMat
  );
  westPierDoorNorth.position.set(-GRID_SIZE / 2 - wallThick / 2, wallHeight / 2, 2.5);
  westPierDoorNorth.castShadow = true;
  westPierDoorNorth.receiveShadow = true;
  roomGroup.add(westPierDoorNorth);

  const westPierDoorSouth = new THREE.Mesh(
    new THREE.BoxGeometry(wallThick, wallHeight, 1.0),
    wallMat
  );
  westPierDoorSouth.position.set(-GRID_SIZE / 2 - wallThick / 2, wallHeight / 2, 4.5);
  westPierDoorSouth.castShadow = true;
  westPierDoorSouth.receiveShadow = true;
  roomGroup.add(westPierDoorSouth);

  const westDoorHeader = new THREE.Mesh(
    new THREE.BoxGeometry(wallThick, wallHeight - 2.28, 1.0),
    wallMat
  );
  westDoorHeader.position.set(-GRID_SIZE / 2 - wallThick / 2, 2.28 + (wallHeight - 2.28) / 2, 3.5);
  westDoorHeader.castShadow = true;
  westDoorHeader.receiveShadow = true;
  roomGroup.add(westDoorHeader);

  // 3. Under-window sill wall (z: -3 to +2, length 5, height 0.7)
  const westBottom = new THREE.Mesh(
    new THREE.BoxGeometry(wallThick, 0.7, 5.0),
    wallMat
  );
  westBottom.position.set(-GRID_SIZE / 2 - wallThick / 2, 0.35, -0.5);
  westBottom.castShadow = true;
  westBottom.receiveShadow = true;
  roomGroup.add(westBottom);

  // 4. Above-window header (z: -3 to +2, length 5, y: 2.65..3.2, height 0.55)
  const westTop = new THREE.Mesh(
    new THREE.BoxGeometry(wallThick, 0.55, 5.0),
    wallMat
  );
  westTop.position.set(-GRID_SIZE / 2 - wallThick / 2, 2.925, -0.5);
  westTop.castShadow = true;
  westTop.receiveShadow = true;
  roomGroup.add(westTop);

  // West baseboard
  const westBaseboard = new THREE.Mesh(
    new THREE.BoxGeometry(0.03, 0.14, GRID_SIZE),
    trimMat
  );
  westBaseboard.position.set(-GRID_SIZE / 2 + 0.015, 0.07, 0);
  westBaseboard.receiveShadow = true;
  roomGroup.add(westBaseboard);

  // Window Sill & Sleek Industrial Mullions
  const sill = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.05, 5.08),
    trimMat
  );
  sill.position.set(-GRID_SIZE / 2 - 0.06, 0.71, -0.5);
  sill.receiveShadow = true;
  roomGroup.add(sill);

  // Mullions around & across window
  for (const mz of [-3.0, -1.35, 0.35, 2.0]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.95, 0.06), windowFrameMat);
    post.position.set(-GRID_SIZE / 2 - 0.1, 1.68, mz);
    roomGroup.add(post);
  }
  for (const my of [0.74, 2.63]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 5.06), windowFrameMat);
    rail.position.set(-GRID_SIZE / 2 - 0.1, my, -0.5);
    roomGroup.add(rail);
  }

  // Subtle glass pane
  const glassPane = new THREE.Mesh(
    new THREE.PlaneGeometry(5.0, 1.9),
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
  glassPane.position.set(-GRID_SIZE / 2 - 0.1, 1.68, -0.5);
  roomGroup.add(glassPane);

  // Exterior Sky & Horizon Glow behind Window
  const windowSkyMat = new THREE.MeshBasicMaterial({ color: 0xbfe2ff });
  const skyPanel = new THREE.Mesh(new THREE.PlaneGeometry(5.3, 2.2), windowSkyMat);
  skyPanel.rotation.y = Math.PI / 2;
  skyPanel.position.set(-GRID_SIZE / 2 - 0.38, 1.68, -0.5);
  roomGroup.add(skyPanel);

  const windowSunMat = new THREE.MeshBasicMaterial({ color: 0xfff5d6 });
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(0.36, 24), windowSunMat);
  sunDisc.rotation.y = Math.PI / 2;
  sunDisc.position.set(-GRID_SIZE / 2 - 0.35, 2.08, -1.8);
  roomGroup.add(sunDisc);

  // Distant soft city silhouettes outside window
  const cityMat = new THREE.MeshBasicMaterial({ color: 0x8ea7c2 });
  for (let b = 0; b < 6; b++) {
    const bh = 0.35 + ((b * 37) % 5) * 0.14;
    const bldg = new THREE.Mesh(new THREE.PlaneGeometry(0.75, bh), cityMat);
    bldg.rotation.y = Math.PI / 2;
    bldg.position.set(-GRID_SIZE / 2 - 0.34, 0.72 + bh / 2, -2.5 + b * 0.82);
    roomGroup.add(bldg);
  }

  const westWallRaycastPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID_SIZE, wallHeight),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  westWallRaycastPlane.rotation.y = Math.PI / 2;
  westWallRaycastPlane.position.set(-GRID_SIZE / 2 + 0.01, wallHeight / 2, 0);
  roomGroup.add(westWallRaycastPlane);

  // --- Interactive Loft Exit Door (West wall at z = 3.5, tile gz = 8) ---
  const exitDoorGroup = new THREE.Group();
  exitDoorGroup.position.set(-GRID_SIZE / 2 + 0.02, 0, 3.5);
  exitDoorGroup.userData.isExitDoor = true;

  const doorFrameMat = new THREE.MeshStandardMaterial({
    color: 0x2b2d36,
    roughness: 0.42,
    metalness: 0.35,
  });
  const doorWoodMat = new THREE.MeshStandardMaterial({
    color: 0x8a5a38,
    roughness: 0.45,
    metalness: 0.05,
  });
  const doorBrassMat = new THREE.MeshStandardMaterial({
    color: 0xd8b45a,
    roughness: 0.25,
    metalness: 0.88,
  });

  // Door outer jambs & header
  for (const dz of [-0.52, 0.52]) {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.28, 0.08), doorFrameMat);
    jamb.position.set(0, 1.14, dz);
    jamb.castShadow = true;
    exitDoorGroup.add(jamb);
  }
  const doorHeader = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 1.12), doorFrameMat);
  doorHeader.position.set(0, 2.28, 0);
  exitDoorGroup.add(doorHeader);

  // Hinged Door Leaf Pivot (hinged at z = -0.46)
  const doorLeafPivot = new THREE.Group();
  doorLeafPivot.position.set(0.01, 0, -0.46);

  const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.055, 2.22, 0.92), doorWoodMat);
  doorPanel.position.set(0, 1.11, 0.46);
  doorPanel.castShadow = true;
  doorLeafPivot.add(doorPanel);

  // Upper frosted glass transom window on door
  const doorGlass = new THREE.Mesh(
    new THREE.BoxGeometry(0.065, 0.42, 0.62),
    new THREE.MeshStandardMaterial({
      color: 0xe6f4ff,
      emissive: 0x99c8ff,
      emissiveIntensity: 0.28,
      roughness: 0.2,
    })
  );
  doorGlass.position.set(0, 1.72, 0.46);
  doorLeafPivot.add(doorGlass);

  // Brass lever handle
  const escutcheon = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.045), doorBrassMat);
  escutcheon.position.set(0.01, 1.02, 0.82);
  doorLeafPivot.add(escutcheon);

  const lever = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.022, 0.13), doorBrassMat);
  lever.position.set(0.045, 1.03, 0.77);
  doorLeafPivot.add(lever);

  exitDoorGroup.add(doorLeafPivot);

  // Warm threshold light & subtle welcome mat inside doorway
  const doormat = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.02, 0.92),
    new THREE.MeshStandardMaterial({
      color: 0xc48b5a,
      roughness: 0.95,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
  );
  doormat.position.set(0.42, 0.012, 0);
  doormat.receiveShadow = true;
  exitDoorGroup.add(doormat);

  // Glowing exit sign bar above frame
  const exitBeacon = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.06, 0.34),
    new THREE.MeshStandardMaterial({
      color: 0x34d399,
      emissive: 0x10b981,
      emissiveIntensity: 1.1,
      roughness: 0.3,
    })
  );
  exitBeacon.position.set(0.05, 2.38, 0);
  exitDoorGroup.add(exitBeacon);

  roomGroup.add(exitDoorGroup);

  // Top Coping Cap along cutaway walls
  const capMat = new THREE.MeshStandardMaterial({ color: 0x262932, roughness: 0.65 });
  const northCap = new THREE.Mesh(
    new THREE.BoxGeometry(GRID_SIZE + wallThick + 0.04, 0.06, wallThick + 0.04),
    capMat
  );
  northCap.position.set(-wallThick / 2, wallHeight + 0.03, -GRID_SIZE / 2 - wallThick / 2);
  roomGroup.add(northCap);

  const westCap = new THREE.Mesh(
    new THREE.BoxGeometry(wallThick + 0.04, 0.06, GRID_SIZE + wallThick + 0.04),
    capMat
  );
  westCap.position.set(-GRID_SIZE / 2 - wallThick / 2, wallHeight + 0.03, -wallThick / 2);
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
    const p = -GRID_SIZE / 2 + i;
    pts.push(new THREE.Vector3(p, 0.014, -GRID_SIZE / 2));
    pts.push(new THREE.Vector3(p, 0.014, GRID_SIZE / 2));
    pts.push(new THREE.Vector3(-GRID_SIZE / 2, 0.014, p));
    pts.push(new THREE.Vector3(GRID_SIZE / 2, 0.014, p));
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
  };
}
