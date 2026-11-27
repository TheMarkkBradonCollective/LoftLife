import * as THREE from 'three';
import type { FurnitureCatalogItem } from '../types';
import { DEFAULT_KIT_OPTIONS, type KitOptions } from './helpers';
import {
  buildArchway,
  buildBeam,
  buildBlinds,
  buildBuiltInShelf,
  buildCeiling,
  buildCeilingFixture,
  buildColumn,
  buildDoor,
  buildElevator,
  buildEscalator,
  buildFence,
  buildFloorSlab,
  buildGate,
  buildGround,
  buildHalfWall,
  buildPartition,
  buildPlatform,
  buildPorch,
  buildRailing,
  buildRoof,
  buildStairs,
  buildStorefront,
  buildStreetFurniture,
  buildTrim,
  buildWall,
  buildWindow,
  buildCurvedWall,
  buildCornerWall,
} from './structure';
import {
  buildArtPlinth,
  buildBarGlassware,
  buildBoothSeating,
  buildCoatCheck,
  buildCommercialFridge,
  buildCookingLine,
  buildCounter,
  buildDiningTable,
  buildDisplayCase,
  buildDjBooth,
  buildFittingRoom,
  buildGymEquipment,
  buildHookah,
  buildLightingFixtures,
  buildLightTruss,
  buildLuggageCart,
  buildMannequin,
  buildMedicalBed,
  buildMicStand,
  buildOfficeMachine,
  buildPhotoBackdrop,
  buildPodium,
  buildPortablePartition,
  buildRecordingConsole,
  buildSalonChair,
  buildSalonStation,
  buildScreenFixture,
  buildShoeDisplay,
  buildShelvingUnit,
  buildSpeaker,
  buildStageLight,
  buildWaitArea,
  buildWeddingArch,
  buildEventSeating,
} from './venue';
import {
  buildBush,
  buildGazebo,
  buildOutdoorKitchen,
  buildPlanter,
  buildPlayground,
  buildPublicBench,
  buildSculpture,
  buildTree,
  buildUmbrella,
  buildWaterFeature,
} from './outdoor';
import { buildCar, buildTwoWheeler } from './vehicles';
import {
  buildBathroomFixture,
  buildBookStack,
  buildCandleSet,
  buildCloset,
  buildClock,
  buildCurtainSet,
  buildDecoVaseSingle,
  buildDeskAccessories,
  buildDeskLampSet,
  buildFramedArt,
  buildKitchenDetail,
  buildLaundry,
  buildMirror,
  buildNeonSign,
  buildPlantTrio,
  buildRug,
  buildSmallSculpture,
  buildSmartPanel,
  buildSpeakerShelf,
  buildTelevision,
  buildVaseSet,
} from './props';

type Builder = (params: Record<string, any>, opts: KitOptions) => THREE.Group;

/**
 * Every expanded catalog model kind. A catalog item names a kind plus
 * parameters; the preview pipeline and the in-game builder both resolve the
 * model through this one registry, so a preview can never come from a model the
 * game does not build.
 */
export const MODEL_BUILDERS: Record<string, Builder> = {
  // Construction
  wall: buildWall,
  curved_wall: buildCurvedWall,
  corner_wall: buildCornerWall,
  half_wall: buildHalfWall,
  partition: buildPartition,
  storefront: buildStorefront,
  column: buildColumn,
  beam: buildBeam,
  archway: buildArchway,
  trim: buildTrim,
  built_in_shelf: buildBuiltInShelf,
  floor_slab: buildFloorSlab,
  ceiling: buildCeiling,
  ceiling_fixture: buildCeilingFixture,
  stairs: buildStairs,
  railing: buildRailing,
  platform: buildPlatform,
  escalator: buildEscalator,
  elevator: buildElevator,
  door: buildDoor,
  window: buildWindow,
  blinds: buildBlinds,
  roof: buildRoof,
  fence: buildFence,
  gate: buildGate,
  porch: buildPorch,
  ground: buildGround,
  street_furniture: buildStreetFurniture,

  // Commercial and hospitality
  counter: buildCounter,
  shelving_unit: buildShelvingUnit,
  commercial_fridge: buildCommercialFridge,
  cooking_line: buildCookingLine,
  dining_table: buildDiningTable,
  booth_seating: buildBoothSeating,
  wait_area: buildWaitArea,
  bar_glassware: buildBarGlassware,
  coat_check: buildCoatCheck,
  luggage_cart: buildLuggageCart,
  fitting_room: buildFittingRoom,
  mannequin: buildMannequin,
  shoe_display: buildShoeDisplay,
  display_case: buildDisplayCase,
  salon_station: buildSalonStation,
  salon_chair: buildSalonChair,
  gym_equipment: buildGymEquipment,
  office_machine: buildOfficeMachine,
  medical_bed: buildMedicalBed,
  recording_console: buildRecordingConsole,
  art_plinth: buildArtPlinth,
  portable_partition: buildPortablePartition,

  // Nightlife and events
  dj_booth: buildDjBooth,
  speaker: buildSpeaker,
  mic_stand: buildMicStand,
  stage_light: buildStageLight,
  light_truss: buildLightTruss,
  screen_fixture: buildScreenFixture,
  lighting_fixture: buildLightingFixtures,
  hookah: buildHookah,
  wedding_arch: buildWeddingArch,
  event_seating: buildEventSeating,
  photo_backdrop: buildPhotoBackdrop,
  podium: buildPodium,

  // Outdoor
  tree: buildTree,
  bush: buildBush,
  planter: buildPlanter,
  water_feature: buildWaterFeature,
  gazebo: buildGazebo,
  outdoor_kitchen: buildOutdoorKitchen,
  playground: buildPlayground,
  public_bench: buildPublicBench,
  sculpture: buildSculpture,
  umbrella: buildUmbrella,

  // Vehicles
  car: buildCar,
  two_wheeler: buildTwoWheeler,

  // Interior props
  rug: buildRug,
  vase_set: buildVaseSet,
  deco_vase: buildDecoVaseSingle,
  book_stack: buildBookStack,
  framed_art: buildFramedArt,
  mirror: buildMirror,
  clock: buildClock,
  plant_trio: buildPlantTrio,
  television: buildTelevision,
  speaker_shelf: buildSpeakerShelf,
  neon_sign: buildNeonSign,
  smart_panel: buildSmartPanel,
  curtain_set: buildCurtainSet,
  candle_set: buildCandleSet,
  small_sculpture: buildSmallSculpture,
  kitchen_detail: buildKitchenDetail,
  bathroom_fixture: buildBathroomFixture,
  laundry: buildLaundry,
  closet: buildCloset,
  desk_lamp_set: buildDeskLampSet,
  desk_accessories: buildDeskAccessories,
};

/** Bump when a builder's geometry changes so previews are marked for review. */
export const MODEL_KIT_VERSION = 1;

export function hasModelKind(kind: string): boolean {
  return Object.hasOwn(MODEL_BUILDERS, kind);
}

/**
 * Build the actual 3D model for a catalog entry. Returns null when the entry
 * has no model, which the catalog treats as "incomplete" rather than showing a
 * stand-in image.
 */
export function buildCatalogModel(
  item: Pick<FurnitureCatalogItem, 'model' | 'defaultColor' | 'mount'>,
  opts: Partial<KitOptions> = {}
): THREE.Group | null {
  const kind = item.model?.kind;
  if (!kind || !hasModelKind(kind)) return null;
  const group = MODEL_BUILDERS[kind](item.model?.params ?? {}, {
    ...DEFAULT_KIT_OPTIONS,
    color: opts.color ?? item.defaultColor,
    active: opts.active ?? false,
    isGhost: opts.isGhost ?? false,
    isSoftwareGl: opts.isSoftwareGl ?? false,
  });
  group.userData.catalogId = (item as { id?: string }).id;
  group.userData.modelKind = kind;
  return group;
}

/** Camera framing per category so flat pieces read clearly and walls stand up. */
export function previewAngleFor(item: Pick<FurnitureCatalogItem, 'category' | 'model' | 'layer'>) {
  const kind = item.model?.kind ?? '';
  if (kind === 'rug' || kind === 'floor_slab' || kind === 'ground' || kind === 'ceiling' || kind === 'dance_floor') {
    return { yaw: -18, pitch: 58 };
  }
  if (
    kind === 'wall' ||
    kind === 'door' ||
    kind === 'window' ||
    kind === 'blinds' ||
    kind === 'framed_art' ||
    kind === 'mirror' ||
    kind === 'neon_sign' ||
    kind === 'curtain_set' ||
    kind === 'storefront' ||
    kind === 'trim' ||
    kind === 'built_in_shelf'
  ) {
    return { yaw: -24, pitch: 12 };
  }
  if (kind === 'ceiling_fixture' || kind === 'lighting_fixture') {
    return { yaw: -28, pitch: 26 };
  }
  if (
    kind === 'car' ||
    kind === 'two_wheeler' ||
    kind === 'stairs' ||
    kind === 'escalator' ||
    item.category === 'vehicles'
  ) {
    // These models run along Z, so the default 3/4 angle would look at the nose.
    return { yaw: -122, pitch: 22 };
  }
  return { yaw: -32, pitch: 18 };
}
