/**
 * Server-side validation for everything the client sends that gets persisted.
 * Shapes mirror src/game/types.ts. Unknown keys are dropped, and out-of-range
 * values are rejected rather than silently corrected so bugs surface loudly.
 */
import { badRequest } from './errors.mjs';
import { isKnownFurniture } from './economy.mjs';
import { MAX_LEVELS } from '../shared/building.mjs';
import {
  ACCESSORIES,
  BODY_PRESETS,
  BUILDS,
  CARRY,
  DEFAULT_AVATAR,
  EYE_SHAPES,
  EYE_STYLES,
  EYEBROWS,
  FACE_SHAPES,
  FACIAL_DETAILS,
  FACIAL_HAIR,
  HAIR_STYLES,
  HEIGHTS,
  JEWELRY,
  MAKEUP_STYLES,
  TOP_STYLES,
  BOTTOM_STYLES,
} from '../shared/character.mjs';

export {
  ACCESSORIES,
  BODY_PRESETS,
  BOTTOM_STYLES,
  BUILDS,
  CARRY,
  DEFAULT_AVATAR,
  EYE_SHAPES,
  EYE_STYLES,
  EYEBROWS,
  FACE_SHAPES,
  FACIAL_DETAILS,
  FACIAL_HAIR,
  HAIR_STYLES,
  HEIGHTS,
  JEWELRY,
  MAKEUP_STYLES,
  TOP_STYLES,
};
export const FLOOR_STYLES = ['oak_parquet', 'walnut_herringbone', 'terrazzo', 'concrete', 'boucle_carpet'];
export const WALL_STYLES = [
  'warm_chalk',
  'sage_plaster',
  'terracotta',
  'slate_blue',
  'charcoal_loft',
  'soft_blush',
];
export const MOODS = ['morning', 'golden', 'night'];
export const WORLD_ACCESS = ['public', 'private', 'invite', 'friends', 'collab'];
export const WORLD_KINDS = [
  'hangout',
  'house',
  'apartment',
  'club',
  'restaurant',
  'shop',
  'park',
  'venue',
  'neighborhood',
];
export const WORLD_ROLES = ['co_owner', 'moderator', 'builder', 'member'];
export const WORLD_STATUSES = ['live', 'available', 'offline', 'build_mode', 'build_pending', 'maintenance'];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const GRID_SIZE = 14;
// A property may span up to MAX_LEVELS storeys; the cap is per property so a
// four-floor build still has room for a full catalogue in every room.
const MAX_ITEMS = 320;

const str = (value, max) =>
  typeof value === 'string' ? value.slice(0, max) : undefined;

const oneOf = (value, allowed, field) => {
  if (!allowed.includes(value)) {
    throw badRequest(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return value;
};

/** Exported form for modules that validate their own enums. */
export const pickOne = oneOf;

const hex = (value, fallback) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !HEX_RE.test(value)) {
    throw badRequest('Colors must be #rrggbb');
  }
  return value.toLowerCase();
};

export function sanitizeAvatar(input, fallbackName = 'Newcomer') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw badRequest('avatar must be an object');
  }
  return {
    name: str(input.name, 24)?.trim() || fallbackName,
    skinTone: hex(input.skinTone, DEFAULT_AVATAR.skinTone),
    bodyPreset: oneOf(input.bodyPreset ?? DEFAULT_AVATAR.bodyPreset, BODY_PRESETS, 'avatar.bodyPreset'),
    height: oneOf(input.height ?? DEFAULT_AVATAR.height, HEIGHTS, 'avatar.height'),
    build: oneOf(input.build ?? DEFAULT_AVATAR.build, BUILDS, 'avatar.build'),
    faceShape: oneOf(input.faceShape ?? DEFAULT_AVATAR.faceShape, FACE_SHAPES, 'avatar.faceShape'),
    eyeShape: oneOf(input.eyeShape ?? DEFAULT_AVATAR.eyeShape, EYE_SHAPES, 'avatar.eyeShape'),
    facialDetail: oneOf(input.facialDetail ?? DEFAULT_AVATAR.facialDetail, FACIAL_DETAILS, 'avatar.facialDetail'),
    hairStyle: oneOf(input.hairStyle, HAIR_STYLES, 'avatar.hairStyle'),
    hairColor: hex(input.hairColor, DEFAULT_AVATAR.hairColor),
    topStyle: oneOf(input.topStyle, TOP_STYLES, 'avatar.topStyle'),
    topColor: hex(input.topColor, DEFAULT_AVATAR.topColor),
    bottomStyle: oneOf(input.bottomStyle ?? DEFAULT_AVATAR.bottomStyle, BOTTOM_STYLES, 'avatar.bottomStyle'),
    bottomColor: hex(input.bottomColor, DEFAULT_AVATAR.bottomColor),
    shoeColor: hex(input.shoeColor, DEFAULT_AVATAR.shoeColor),
    accessory: oneOf(input.accessory, ACCESSORIES, 'avatar.accessory'),
    jewelry: oneOf(input.jewelry ?? 'none', JEWELRY, 'avatar.jewelry'),
    carry: oneOf(input.carry ?? 'none', CARRY, 'avatar.carry'),
    facialHair: oneOf(input.facialHair ?? DEFAULT_AVATAR.facialHair, FACIAL_HAIR, 'avatar.facialHair'),
    eyebrows: oneOf(input.eyebrows ?? DEFAULT_AVATAR.eyebrows, EYEBROWS, 'avatar.eyebrows'),
    eyeStyle: oneOf(input.eyeStyle ?? DEFAULT_AVATAR.eyeStyle, EYE_STYLES, 'avatar.eyeStyle'),
    makeupStyle: oneOf(input.makeupStyle ?? DEFAULT_AVATAR.makeupStyle, MAKEUP_STYLES, 'avatar.makeupStyle'),
  };
}

/** A saved outfit is wardrobe-only; foundational appearance is never copied. */
export function sanitizeOutfit(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw badRequest('outfit must be an object');
  }
  return {
    topStyle: oneOf(input.topStyle, TOP_STYLES, 'outfit.topStyle'),
    topColor: hex(input.topColor, DEFAULT_AVATAR.topColor),
    bottomStyle: oneOf(input.bottomStyle ?? DEFAULT_AVATAR.bottomStyle, BOTTOM_STYLES, 'outfit.bottomStyle'),
    bottomColor: hex(input.bottomColor, DEFAULT_AVATAR.bottomColor),
    shoeColor: hex(input.shoeColor, DEFAULT_AVATAR.shoeColor),
    accessory: oneOf(input.accessory, ACCESSORIES, 'outfit.accessory'),
    jewelry: oneOf(input.jewelry ?? 'none', JEWELRY, 'outfit.jewelry'),
    carry: oneOf(input.carry ?? 'none', CARRY, 'outfit.carry'),
  };
}

export function sanitizeSurfaces(input) {
  if (input === undefined) {
    const ground = { floor: 'oak_parquet', wall: 'warm_chalk' };
    return { ...ground, floors: [ground] };
  }
  if (!input || typeof input !== 'object') throw badRequest('surfaces must be an object');
  const floor = oneOf(input.floor, FLOOR_STYLES, 'surfaces.floor');
  const wall = oneOf(input.wall, WALL_STYLES, 'surfaces.wall');
  const rawFloors = input.floors;
  if (rawFloors === undefined) return { floor, wall, floors: [{ floor, wall }] };
  if (!Array.isArray(rawFloors) || rawFloors.length === 0 || rawFloors.length > MAX_LEVELS) {
    throw badRequest(`surfaces.floors must be an array of 1..${MAX_LEVELS} levels`);
  }
  const floors = rawFloors.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw badRequest(`surfaces.floors[${index}] must be an object`);
    return {
      floor: oneOf(entry.floor, FLOOR_STYLES, `surfaces.floors[${index}].floor`),
      wall: oneOf(entry.wall, WALL_STYLES, `surfaces.floors[${index}].wall`),
    };
  });
  // The legacy single-floor fields always describe the ground storey.
  floors[0] = { floor, wall };
  return { floor, wall, floors };
}

const intInRange = (value, min, max, field) => {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw badRequest(`${field} must be an integer between ${min} and ${max}`);
  }
  return value;
};

export function sanitizeItems(input) {
  if (!Array.isArray(input)) throw badRequest('items must be an array');
  if (input.length > MAX_ITEMS) {
    throw badRequest(`A room may hold at most ${MAX_ITEMS} items`);
  }
  const seenUids = new Set();

  return input.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw badRequest(`items[${index}] must be an object`);
    const catalogId = String(raw.catalogId ?? '');
    if (!isKnownFurniture(catalogId)) {
      throw badRequest(`items[${index}].catalogId is not a known furniture item`);
    }
    const uid = str(raw.uid, 64)?.trim() || `it_${index}`;
    if (seenUids.has(uid)) throw badRequest(`Duplicate item uid: ${uid}`);
    seenUids.add(uid);

    const item = {
      uid,
      catalogId,
      gx: intInRange(raw.gx, 0, GRID_SIZE, `items[${index}].gx`),
      gz: intInRange(raw.gz, 0, GRID_SIZE, `items[${index}].gz`),
      rot: intInRange(raw.rot, 0, 3, `items[${index}].rot`),
      color: hex(raw.color, '#e6dfd3'),
      level: intInRange(raw.level ?? 0, 0, MAX_LEVELS - 1, `items[${index}].level`),
    };
    if (raw.wall === 'north' || raw.wall === 'south' || raw.wall === 'east' || raw.wall === 'west') {
      item.wall = raw.wall;
    }
    if (typeof raw.active === 'boolean') item.active = raw.active;
    return item;
  });
}

export function sanitizeRoomState(body) {
  if (!body || typeof body !== 'object') throw badRequest('A room state object is required');
  return {
    items: sanitizeItems(body.items ?? []),
    surfaces: sanitizeSurfaces(body.surfaces),
    mood: oneOf(body.mood ?? 'morning', MOODS, 'mood'),
  };
}

/** Public profile text: trimmed, length-capped, no control characters. */
export function sanitizeText(value, { max = 500, field = 'text' } = {}) {
  if (typeof value !== 'string') throw badRequest(`${field} must be a string`);
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (!cleaned) throw badRequest(`${field} cannot be empty`);
  if (cleaned.length > max) throw badRequest(`${field} must be at most ${max} characters`);
  return cleaned;
}
