/**
 * Realtime instance names accepted from clients.
 *
 * TheCity is one logical place, so clients ask for `city`; the canonical
 * instance id stays `city:main` for presence, history and existing sockets.
 * Numbered city shards are not client-addressable.
 */
export const CITY_REQUEST = 'city';
export const CITY_INSTANCE = 'city:main';

const WORLD_RE = /^world:[a-zA-Z0-9_-]{1,80}$/;

/** @param {unknown} value */
export function resolveInstance(value) {
  // Missing/default requests mean TheCity; an explicitly empty value does not.
  if (value === null || value === undefined) return CITY_INSTANCE;
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  if (raw === CITY_REQUEST || raw === CITY_INSTANCE) return CITY_INSTANCE;
  if (WORLD_RE.test(raw)) return raw;
  return null;
}

/** @param {unknown} value */
export function isCityInstance(value) {
  return resolveInstance(value) === CITY_INSTANCE;
}
