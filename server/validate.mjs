/**
 * Server-side validation for everything the client sends that gets persisted.
 * Shapes mirror src/game/types.ts. Unknown keys are dropped, and out-of-range
 * values are rejected rather than silently corrected so bugs surface loudly.
 */
import { badRequest } from './errors.mjs';
import { isKnownFurniture } from './economy.mjs';

export const HAIR_STYLES = [
  'bob',
  'afro',
  'ponytail',
  'sidepart',
  'buns',
  'spiky',
  'long_waves',
  'buzz',
  'curls',
  'locs',
  'pixie',
  'middle_part',
  'top_knot',
  'shoulder_waves',
  'braids',
  'undercut',
  'fade',
  'curtain',
];
export const TOP_STYLES = [
  'hoodie',
  'blazer',
  'tee',
  'turtleneck',
  'button_shirt',
  'sweater',
  'jacket',
  'tank',
  'varsity',
  'raincoat',
  'suit',
  'dress',
  'crop_hoodie',
  'cardigan',
];
export const BOTTOM_STYLES = [
  'jeans',
  'chinos',
  'shorts',
  'skirt',
  'joggers',
  'dress_pants',
  'cargo',
];
export const ACCESSORIES = [
  'none',
  'glasses',
  'headphones',
  'beanie',
  'cap',
  'bucket_hat',
  'sunglasses',
  'scarf',
];
export const JEWELRY = ['none', 'chain', 'watch', 'earrings', 'bracelet'];
export const CARRY = ['none', 'backpack', 'purse', 'tote'];
export const FACIAL_HAIR = ['none', 'stubble', 'beard', 'goatee', 'mustache'];
export const EYEBROWS = ['natural', 'bold', 'thin', 'arched'];
export const EYE_STYLES = ['warm_brown', 'deep_brown', 'hazel', 'green', 'blue', 'gray'];
export const MAKEUP_STYLES = ['none', 'natural', 'soft', 'bold'];

/** Neutral starting look, shared by registration, edge accounts and tests. */
export const DEFAULT_AVATAR = {
  name: 'Newcomer',
  skinTone: '#e8b48f',
  hairStyle: 'bob',
  hairColor: '#2f2119',
  topStyle: 'tee',
  topColor: '#e6dfd3',
  bottomStyle: 'jeans',
  bottomColor: '#2b3a2a',
  shoeColor: '#1b1b1b',
  accessory: 'none',
  jewelry: 'none',
  carry: 'none',
  facialHair: 'none',
  eyebrows: 'natural',
  eyeStyle: 'warm_brown',
  makeupStyle: 'none',
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

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const GRID_SIZE = 14;
const MAX_ITEMS = 200;

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
    skinTone: hex(input.skinTone, '#e8b48f'),
    hairStyle: oneOf(input.hairStyle, HAIR_STYLES, 'avatar.hairStyle'),
    hairColor: hex(input.hairColor, '#2f2119'),
    topStyle: oneOf(input.topStyle, TOP_STYLES, 'avatar.topStyle'),
    topColor: hex(input.topColor, '#e6dfd3'),
    bottomStyle: oneOf(input.bottomStyle ?? 'jeans', BOTTOM_STYLES, 'avatar.bottomStyle'),
    bottomColor: hex(input.bottomColor, '#2b3a2a'),
    shoeColor: hex(input.shoeColor, '#1b1b1b'),
    accessory: oneOf(input.accessory, ACCESSORIES, 'avatar.accessory'),
    jewelry: oneOf(input.jewelry ?? 'none', JEWELRY, 'avatar.jewelry'),
    carry: oneOf(input.carry ?? 'none', CARRY, 'avatar.carry'),
    facialHair: oneOf(input.facialHair ?? 'none', FACIAL_HAIR, 'avatar.facialHair'),
    eyebrows: oneOf(input.eyebrows ?? 'natural', EYEBROWS, 'avatar.eyebrows'),
    eyeStyle: oneOf(input.eyeStyle ?? 'warm_brown', EYE_STYLES, 'avatar.eyeStyle'),
    makeupStyle: oneOf(input.makeupStyle ?? 'none', MAKEUP_STYLES, 'avatar.makeupStyle'),
  };
}

export function sanitizeSurfaces(input) {
  if (input === undefined) return { floor: 'oak_parquet', wall: 'warm_chalk' };
  if (!input || typeof input !== 'object') throw badRequest('surfaces must be an object');
  return {
    floor: oneOf(input.floor, FLOOR_STYLES, 'surfaces.floor'),
    wall: oneOf(input.wall, WALL_STYLES, 'surfaces.wall'),
  };
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
