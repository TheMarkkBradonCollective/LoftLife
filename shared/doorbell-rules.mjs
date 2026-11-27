/**
 * Hotel doorbell authorisation rules.
 *
 * Shared by the Node gateway and the Cloudflare Durable Object so both
 * runtimes refuse the same requests for the same reasons. The owner is
 * identified from the suite row, never from the request body, and the owner's
 * live location comes from the presence attachment rather than the visitor.
 */

export const DOORBELL_TIMEOUT_MS = 45_000;

/**
 * @param {{
 *   suite: { owner_id?: string } | null | undefined,
 *   requesterId?: string | null,
 *   requesterIsGuest?: boolean,
 *   ownerOnline?: boolean,
 *   ownerLocation?: string | null,
 * }} input
 * @returns {{ ok: boolean, reason: string }}
 */
export function doorbellAvailability({
  suite,
  requesterId,
  requesterIsGuest,
  ownerOnline,
  ownerLocation,
}) {
  if (!requesterId) return { ok: false, reason: 'sign_in' };
  if (requesterIsGuest) return { ok: false, reason: 'guest' };
  if (!suite || !suite.owner_id) return { ok: false, reason: 'not_found' };
  if (suite.owner_id === requesterId) return { ok: false, reason: 'own_room' };
  if (!ownerOnline) return { ok: false, reason: 'offline' };
  if (ownerLocation !== 'room') return { ok: false, reason: 'not_in_room' };
  return { ok: true, reason: 'ok' };
}

/** Human-readable reasons shown to the visitor. */
export const DOORBELL_REASON_TEXT = {
  sign_in: 'Sign in to ring a suite doorbell.',
  guest: 'Guest visits cannot ring resident suites. Create an account to visit.',
  not_found: 'That suite does not belong to a registered resident.',
  own_room: 'That is your own suite — use your keycard.',
  offline: 'Nobody answered: the owner is offline.',
  not_in_room: 'Nobody answered: the owner is not in their suite right now.',
  expired: 'The doorbell timed out. Try again when the owner is home.',
  declined: 'The owner declined the visit.',
  ok: '',
};

/** @param {string} roomNumber */
export function isDoorbellRoomNumber(roomNumber) {
  const value = String(roomNumber ?? '');
  return /^[2-7](0[1-9]|1[01])$/.test(value);
}
