import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import {
  DEFAULT_AVATAR,
  FLOOR_STYLES,
  getCatalogItem,
  GRID_SIZE,
  PLAYER_SUITE_FLOOR,
  PLAYER_SUITE_NUMBER,
  ROOM_PRESETS,
  WALL_STYLES,
} from '../game/catalog.ts';
import { isValidPlacement, snapGrid } from '../game/gridMath.ts';
import type {
  AccessoryId,
  AvatarConfig,
  FloorStyleId,
  HairStyleId,
  LightingMood,
  PlacedItem,
  RoomAccessMode,
  RoomSurfaceConfig,
  TopStyleId,
  WallStyleId,
} from '../game/types.ts';

export const SESSION_COOKIE_NAME = 'loftlife_session';
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

const VALID_HAIR_STYLES: HairStyleId[] = ['bob', 'afro', 'ponytail', 'sidepart', 'buns', 'spiky'];
const VALID_TOP_STYLES: TopStyleId[] = ['hoodie', 'blazer', 'tee', 'turtleneck'];
const VALID_ACCESSORIES: AccessoryId[] = ['none', 'glasses', 'headphones', 'beanie'];
const VALID_MOODS: LightingMood[] = ['morning', 'golden', 'night'];
const VALID_ACCESS_MODES: RoomAccessMode[] = ['public', 'friends', 'invite', 'private'];
const VALID_FLOORS = new Set<FloorStyleId>(FLOOR_STYLES.map((f) => f.id));
const VALID_WALLS = new Set<WallStyleId>(WALL_STYLES.map((w) => w.id));
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const USERNAME_RE = /^[a-z0-9_]{3,24}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function createOpaqueSessionToken(): string {
  return `ll_${crypto.randomBytes(32).toString('hex')}`;
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

export function extractSessionTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.startsWith('ll_') && token.length <= 128) return token;
  }
  const cookies = parseCookies(req.headers.cookie);
  const cookieToken = cookies[SESSION_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.startsWith('ll_') && cookieToken.length <= 128) {
    return cookieToken;
  }
  return null;
}

function isHttpsRequest(req: Request): boolean {
  if (req.secure) return true;
  const proto = req.headers['x-forwarded-proto'];
  if (typeof proto === 'string' && proto.split(',')[0].trim() === 'https') return true;
  return false;
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
  const attrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSec}`,
  ];
  if (isHttpsRequest(req)) {
    attrs.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    attrs.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', attrs.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const attrs = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
  ];
  if (isHttpsRequest(req)) {
    attrs.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    attrs.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', attrs.join('; '));
}

export function verifySameOriginOrClientHeader(req: Request): boolean {
  if (req.headers['x-loftlife-client'] === '1') return true;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const originHost = new URL(origin).host;
    const forwardedHost = req.headers['x-forwarded-host'];
    const targetHost =
      (typeof forwardedHost === 'string' ? forwardedHost.split(',')[0].trim() : '') ||
      req.headers.host ||
      '';
    return Boolean(targetHost) && originHost === targetHost;
  } catch {
    return false;
  }
}

export function validateUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  return USERNAME_RE.test(normalized) ? normalized : null;
}

export function validateEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized.length > 160) return null;
  return EMAIL_RE.test(normalized) ? normalized : null;
}

export function validateDisplayName(raw: unknown, fallback = 'Resident'): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.replace(/\s+/g, ' ').trim().slice(0, 24);
  return cleaned.length >= 2 ? cleaned : fallback;
}

export function validatePassword(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length < 8 || raw.length > 128) return null;
  return raw;
}

function safeHex(val: unknown, fallback: string): string {
  return typeof val === 'string' && HEX_COLOR_RE.test(val) ? val : fallback;
}

export function sanitizeAvatarConfig(raw: unknown, fallbackName?: string): AvatarConfig {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const name = validateDisplayName(obj.name, fallbackName || DEFAULT_AVATAR.name).slice(0, 18);
  const hairStyle = VALID_HAIR_STYLES.includes(obj.hairStyle as HairStyleId)
    ? (obj.hairStyle as HairStyleId)
    : DEFAULT_AVATAR.hairStyle;
  const topStyle = VALID_TOP_STYLES.includes(obj.topStyle as TopStyleId)
    ? (obj.topStyle as TopStyleId)
    : DEFAULT_AVATAR.topStyle;
  const accessory = VALID_ACCESSORIES.includes(obj.accessory as AccessoryId)
    ? (obj.accessory as AccessoryId)
    : DEFAULT_AVATAR.accessory;

  return {
    name,
    skinTone: safeHex(obj.skinTone, DEFAULT_AVATAR.skinTone),
    hairStyle,
    hairColor: safeHex(obj.hairColor, DEFAULT_AVATAR.hairColor),
    topStyle,
    topColor: safeHex(obj.topColor, DEFAULT_AVATAR.topColor),
    bottomColor: safeHex(obj.bottomColor, DEFAULT_AVATAR.bottomColor),
    shoeColor: safeHex(obj.shoeColor, DEFAULT_AVATAR.shoeColor),
    accessory,
  };
}

export function sanitizeSurfaces(raw: unknown): RoomSurfaceConfig {
  const preset = ROOM_PRESETS[0].surfaces;
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const floor = VALID_FLOORS.has(obj.floor as FloorStyleId)
    ? (obj.floor as FloorStyleId)
    : preset.floor;
  const wall = VALID_WALLS.has(obj.wall as WallStyleId)
    ? (obj.wall as WallStyleId)
    : preset.wall;
  return { floor, wall };
}

export function sanitizeMood(raw: unknown): LightingMood {
  return VALID_MOODS.includes(raw as LightingMood) ? (raw as LightingMood) : 'morning';
}

export function sanitizeAccessMode(raw: unknown): RoomAccessMode {
  return VALID_ACCESS_MODES.includes(raw as RoomAccessMode) ? (raw as RoomAccessMode) : 'friends';
}

export function sanitizeRoomName(raw: unknown): string {
  if (typeof raw !== 'string') return ROOM_PRESETS[0].name;
  const cleaned = raw.replace(/\s+/g, ' ').trim().slice(0, 36);
  return cleaned.length >= 2 ? cleaned : ROOM_PRESETS[0].name;
}

export function sanitizePlacedItems(raw: unknown): PlacedItem[] {
  if (!Array.isArray(raw)) return ROOM_PRESETS[0].items.map((it) => ({ ...it }));
  const accepted: PlacedItem[] = [];
  const limit = Math.min(raw.length, 90);
  const seenUids = new Set<string>();

  for (let i = 0; i < limit; i++) {
    const entry = raw[i];
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;
    const catalogId = typeof obj.catalogId === 'string' ? obj.catalogId : '';
    const cat = getCatalogItem(catalogId);
    if (!cat) continue;

    const uidRaw = typeof obj.uid === 'string' ? obj.uid.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) : '';
    const uid = uidRaw && !seenUids.has(uidRaw) ? uidRaw : `it_${i}_${crypto.randomBytes(3).toString('hex')}`;
    seenUids.add(uid);

    const rotNum = typeof obj.rot === 'number' ? Math.trunc(obj.rot) : 0;
    const rot = (rotNum === 0 || rotNum === 1 || rotNum === 2 || rotNum === 3 ? rotNum : 0) as
      | 0
      | 1
      | 2
      | 3;

    const gxRaw = typeof obj.gx === 'number' && Number.isFinite(obj.gx) ? obj.gx : 0;
    const gzRaw = typeof obj.gz === 'number' && Number.isFinite(obj.gz) ? obj.gz : 0;
    const gx = snapGrid(Math.max(0, Math.min(GRID_SIZE, gxRaw)));
    const gz = snapGrid(Math.max(0, Math.min(GRID_SIZE, gzRaw)));
    const wall =
      cat.layer === 'wall' ? (obj.wall === 'west' ? 'west' : 'north') : undefined;

    const candidate: PlacedItem = {
      uid,
      catalogId,
      gx,
      gz,
      rot,
      ...(wall ? { wall } : {}),
      color: safeHex(obj.color, cat.defaultColor),
      ...(typeof obj.active === 'boolean' ? { active: obj.active } : {}),
    };

    if (isValidPlacement(candidate, accepted)) {
      accepted.push(candidate);
    }
  }
  return accepted;
}

export function defaultInitialRoomState(displayName: string) {
  const preset = ROOM_PRESETS[0];
  return {
    avatar: sanitizeAvatarConfig({ ...DEFAULT_AVATAR, name: displayName }, displayName),
    suiteNumber: PLAYER_SUITE_NUMBER,
    floor: PLAYER_SUITE_FLOOR,
    roomName: `${displayName}'s Loft`,
    accessMode: 'friends' as RoomAccessMode,
    surfaces: { ...preset.surfaces },
    mood: preset.mood,
    items: preset.items.map((it) => ({ ...it })),
  };
}
