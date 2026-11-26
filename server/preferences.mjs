/**
 * Account-synced control preferences: bindings and touch layout.
 *
 * The payload is normalized through the shared module so an account can never
 * store an unknown action or a reserved browser shortcut. `updatedAt` lets a
 * client with offline edits win safely over an older server copy.
 */
import { db, now } from './db.mjs';
import {
  DEFAULT_BINDINGS,
  DEFAULT_TOUCH_LAYOUT,
  normalizeControlsPayload,
} from '../shared/keybindings.mjs';

function readRow(userId) {
  return db
    .prepare('SELECT controls_json, controls_updated_at FROM profiles WHERE user_id = ?')
    .get(userId);
}

export function readControls(userId) {
  const row = readRow(userId);
  let parsed = {};
  try {
    parsed = row?.controls_json ? JSON.parse(row.controls_json) : {};
  } catch {
    parsed = {};
  }
  const normalized = normalizeControlsPayload({
    ...parsed,
    updatedAt: Number(row?.controls_updated_at) || 0,
  });
  return normalized;
}

export function saveControls(userId, body = {}) {
  const normalized = normalizeControlsPayload(body);
  const updatedAt = now();
  db.prepare(
    `UPDATE profiles SET controls_json = ?, controls_updated_at = ? WHERE user_id = ?`
  ).run(
    JSON.stringify({ bindings: normalized.bindings, touch: normalized.touch }),
    updatedAt,
    userId
  );
  return { ...normalized, updatedAt };
}

/** Local/offline defaults have no timestamp and never beat an account copy. */
export function emptyControls() {
  return {
    bindings: { ...DEFAULT_BINDINGS },
    touch: { ...DEFAULT_TOUCH_LAYOUT },
    updatedAt: 0,
  };
}
