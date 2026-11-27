/**
 * Server-authoritative multiplayer gateway.
 *
 * The Main City is presented to players as one world. Physically it runs as
 * numbered city instances; when one fills, the next opens. Movement is
 * rebroadcast at 10 Hz, chat is attributed server-side, and a client cannot
 * claim another player's identity or edit someone else's world.
 *
 * Position data is trusted only within limits (bounded area, bounded per-tick
 * displacement) — this is movement sanity-checking, not full physics
 * re-simulation, which would require a deterministic shared simulation.
 */
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { userForToken } from './auth.mjs';
import { guestForToken } from './guests.mjs';
import { CITY_INSTANCE, resolveInstance } from '../shared/instance.mjs';
import { db, now } from './db.mjs';
import { canEnterWorld, canEditWorld } from './worlds.mjs';
import { dmScopeId, isBlockedBetween, recordMessage } from './social.mjs';
import { dmAllowed } from './settings.mjs';
import {
  acceptPartyInvite,
  createParty,
  inviteToParty,
  kickFromParty,
  leaveParty,
  partyFor,
  partyMemberIds,
  partyView,
  pendingInvitesFor,
} from './parties.mjs';
import {
  assignTaxiDestination,
  boardRider,
  boardTaxi,
  ensureFleet,
  exitRider,
  releasePlayer,
  stepTransit,
  vehiclesFor,
} from './transit.mjs';
import { advanceJourney, releaseJourney, startJourney } from './travel.mjs';
import { normalizeAnimation } from '../shared/animation.mjs';
import {
  DOORBELL_REASON_TEXT,
  DOORBELL_TIMEOUT_MS,
  doorbellAvailability,
  isDoorbellRoomNumber,
} from '../shared/doorbell-rules.mjs';

const TICK_MS = 100;
const DEFAULT_CITY_CAPACITY = 64;
// The walkable city reaches x≈632 / z≈447 at the airport, so the sanity box has
// to cover the whole layout, not just the hotel plaza.
const MAX_CITY_COORD = 1500;
const MIN_STEP_ALLOWANCE = 2.5; // metres of slack for one pose message
const MAX_SPEED = 12; // m/s; sprint is 10.5, the rest is lag slack
// The client's scene reports its spawn a moment after the socket joins; until
// then it may still be sending the placeholder origin. Placement is accepted
// without the speed check for this window, then movement is validated.
const SPAWN_GRACE_MS = 5_000;
const MAX_POSE_PER_SECOND = 30;
const MAX_CHAT_PER_10S = 8;
const IDLE_TIMEOUT_MS = 60_000;

const ALLOWED_LOCATIONS = new Set([
  'world',
  'lobby',
  'hallway',
  'room',
  'resident_room',
  'airport',
  'clothing_store',
  'transit',
]);
const LOCAL_RANGES = { whisper: 4, say: 14, shout: 35 };

/** @type {Map<string, Instance>} */
const instances = new Map();

export function cityCapacity() {
  const configured = Number(process.env.LOFTLIFE_CITY_CAPACITY ?? process.env.LOFTLIFE_INSTANCE_CAPACITY);
  return Number.isFinite(configured) && configured > 0 ? Math.floor(configured) : DEFAULT_CITY_CAPACITY;
}

// Kept for existing health/presence callers that used the old name.
export const instanceCapacity = cityCapacity;

function makeInstance({ id, kind, worldId = null, capacity }) {
  const instance = { id, kind, worldId, capacity, members: new Map() };
  instances.set(id, instance);
  return instance;
}

function cityInstance() {
  return instances.get(CITY_INSTANCE) ?? makeInstance({
    id: CITY_INSTANCE,
    kind: 'city',
    capacity: cityCapacity(),
  });
}

function worldInstance(instanceId, worldId, capacity) {
  const existing = instances.get(instanceId);
  if (existing) return existing;
  return makeInstance({ id: instanceId, kind: 'world', worldId, capacity });
}

function uniquePlayers(instance) {
  const byUser = new Map();
  for (const player of instance.members.values()) {
    const previous = byUser.get(player.userId);
    if (!previous || Number(player.lastSeen ?? 0) >= Number(previous.lastSeen ?? 0)) byUser.set(player.userId, player);
  }
  return [...byUser.values()];
}
function publicInstance(instance) {
  return {
    id: instance.id,
    kind: instance.kind,
    worldId: instance.worldId,
    capacity: instance.capacity,
    count: uniquePlayers(instance).length,
  };
}

function guestAvatarFromMessage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const allowed = [
    'name', 'skinTone', 'bodyPreset', 'height', 'build', 'faceShape', 'eyeShape',
    'facialDetail', 'hairStyle', 'hairColor', 'topStyle', 'topColor', 'bottomStyle',
    'bottomColor', 'shoeColor', 'accessory', 'jewelry', 'carry', 'facialHair',
    'eyebrows', 'eyeStyle', 'makeupStyle',
  ];
  const avatar = {};
  for (const key of allowed) {
    const field = value[key];
    if (typeof field !== 'string' || field.length > 64) continue;
    if (key.toLowerCase().includes('color') || key === 'skinTone') {
      if (!/^#[0-9a-f]{6}$/i.test(field)) continue;
    }
    avatar[key] = field;
  }
  const required = ['skinTone', 'hairStyle', 'hairColor', 'topStyle', 'topColor', 'bottomColor', 'shoeColor', 'accessory'];
  if (!required.every((key) => typeof avatar[key] === 'string')) return null;
  avatar.name = typeof avatar.name === 'string' ? avatar.name.slice(0, 32) : 'Guest';
  return avatar;
}

function playerView(player) {
  const shownName = player.isGuest ? `Guest User - ${player.name}` : player.name;
  return {
    connId: player.connId,
    userId: player.userId,
    handle: player.handle,
    name: shownName,
    displayName: player.name,
    isGuest: Boolean(player.isGuest),
    avatar: player.avatar,
    x: round(player.x, 2),
    y: round(player.y, 2),
    z: round(player.z, 2),
    yaw: round(player.yaw, 2),
    emote: player.emote,
    location: player.location,
    voice: Boolean(player.voice),
    voiceMode: player.voiceMode ?? 'say',
    riding: player.riding ?? null,
  };
}

/** Deliver a payload to every live connection for one account. */
export function sendToUser(userId, payload) {
  for (const instance of instances.values()) {
    for (const player of instance.members.values()) {
      if (player.userId === userId) send(player.ws, payload);
    }
  }
}

function partyPayload(userId) {
  return {
    t: 'party',
    party: partyView(partyFor(userId)),
    invites: pendingInvitesFor(userId).map(partyView),
  };
}

function pushParty(userId) {
  sendToUser(userId, partyPayload(userId));
}

function broadcastParty(party) {
  if (!party) return;
  for (const id of partyMemberIds(party.id)) pushParty(id);
}

function handlePartyError(player, error) {
  if (error && typeof error.code === 'string') {
    return fail(player.ws, error.code, error.message ?? 'Party action failed');
  }
  console.error('[loftlife] party error:', error);
  fail(player.ws, 'error', 'Party action failed');
}

const round = (value, digits) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function fail(ws, code, message) {
  send(ws, { t: 'error', code, message });
}

function broadcast(instance, payload, exceptConnId = null) {
  const data = JSON.stringify(payload);
  for (const [connId, player] of instance.members) {
    if (connId === exceptConnId) continue;
    if (player.ws.readyState === player.ws.OPEN) player.ws.send(data);
  }
}

function joinInstance(player, instance) {
  if (!player.isGuest) for (const currentInstance of [...instances.values()]) {
    for (const existing of [...currentInstance.members.values()]) {
      if (existing.userId === player.userId) {
        send(existing.ws, { t: 'replaced', reason: 'This account connected from another session' });
        leaveInstance(existing);
        existing.ws.close(4003, 'replaced');
      }
    }
  }
  const activePlayers = uniquePlayers(instance);
  if (activePlayers.length >= instance.capacity && !activePlayers.some((entry) => entry.userId === player.userId)) {
    fail(player.ws, 'instance_full', instance.kind === 'city' ? 'TheCity is full' : 'That instance is full');
    player.ws.close(1013, 'instance_full');
    return false;
  }
  player.instanceId = instance.id;
  // Every instance has its own coordinate space (city blocks vs. room grid),
  // so the next pose re-establishes the position instead of being measured
  // against the old instance.
  player.positioned = false;
  player.joinedAt = now();
  player.lastPoseAt = now();
  player.x = 0;
  player.y = 0;
  player.z = 0;
  instance.members.set(player.connId, player);
  send(player.ws, {
    t: 'ready',
    instance: publicInstance(instance),
    you: playerView(player),
    players: uniquePlayers(instance).map(playerView),
    vehicles: vehiclesFor(instance.id),
  });
  broadcast(
    instance,
    { t: 'join', player: playerView(player), instanceId: instance.id },
    player.connId
  );
  return true;
}

function leaveInstance(player) {
  const instance = instances.get(player.instanceId);
  if (!instance) return;
  releasePlayer(player);
  releaseJourney(player);
  instance.members.delete(player.connId);
  broadcast(instance, { t: 'leave', connId: player.connId, userId: player.userId }, player.connId);
  if (instance.members.size === 0 && instance.kind === 'world') {
    // Build Mode starts as soon as the last visitor leaves a queued world.
    if (instance.worldId) {
      const world = db.prepare('SELECT status FROM worlds WHERE id = ?').get(instance.worldId);
      if (world?.status === 'build_pending') {
        db.prepare("UPDATE worlds SET status='build_mode', published=0, updated_at=? WHERE id=?").run(
          now(),
          instance.worldId
        );
        broadcast(instance, { t: 'world_status', status: 'build_mode' });
      }
    }
    // World instances are cheap to keep; city instances stay numbered so
    // friends can rejoin the same shard.
    instances.delete(instance.id);
  }
}

/* -------------------------- world building presence ---------------------- */

export function worldPlayerCount(worldId) {
  const instance = instances.get(`world:${worldId}`);
  return instance ? uniquePlayers(instance).length : 0;
}

export function worldHasPlayer(worldId, userId) {
  const instance = instances.get(`world:${worldId}`);
  return Boolean(instance && uniquePlayers(instance).some((player) => player.userId === userId));
}

/** Tell everyone editing a world that another builder changed its layout. */
export function broadcastWorldEdit(worldId, payload) {
  const instance = instances.get(`world:${worldId}`);
  if (!instance) return;
  broadcast(instance, { t: 'world_edit', ...payload });
}

function profileFor(userId) {
  const row = db
    .prepare(
      `SELECT p.display_name, p.avatar_json FROM profiles p WHERE p.user_id = ?`
    )
    .get(userId);
  return {
    name: row?.display_name ?? 'Resident',
    avatar: row ? JSON.parse(row.avatar_json) : null,
  };
}

function handleChat(player, instance, msg) {
  const scope = String(msg.scope ?? 'local');
  const body = String(msg.body ?? '').slice(0, 240).trim();
  if (!body) return fail(player.ws, 'empty_message', 'Message cannot be empty');
  if (now() - player.lastChatAt < 125) {
    return fail(player.ws, 'rate_limited', 'Slow down a moment');
  }
  player.lastChatAt = now();
  player.chatBudget.push(now());
  player.chatBudget = player.chatBudget.filter((t) => now() - t < 10_000);
  if (player.chatBudget.length > MAX_CHAT_PER_10S) {
    return fail(player.ws, 'rate_limited', 'Too many messages, try again shortly');
  }

  if (player.isGuest && !['city', 'local'].includes(scope)) {
    return fail(player.ws, 'forbidden', 'Guest visitors can only use public city and nearby chat');
  }

  const from = {
    userId: player.userId,
    handle: player.handle,
    displayName: player.isGuest ? `Guest User - ${player.name}` : player.name,
    isGuest: Boolean(player.isGuest),
  };

  if (scope === 'local') {
    const mode = Object.hasOwn(LOCAL_RANGES, msg.mode) ? msg.mode : 'say';
    const range = LOCAL_RANGES[mode];
    const payload = {
      t: 'chat',
      scope: 'local',
      mode,
      body,
      from,
      at: now(),
      range,
      origin: { x: player.x, z: player.z },
    };
    for (const other of instance.members.values()) {
      if (isBlockedBetween(player.userId, other.userId) && other.userId !== player.userId) continue;
      const distance = Math.hypot(other.x - player.x, other.z - player.z);
      if (distance <= range) send(other.ws, payload);
    }
    return;
  }

  if (scope === 'city' || scope === 'world') {
    const scopeId = instance.kind === 'world' ? instance.worldId : 'main';
    // Guest messages are ephemeral, matching the Worker: no account row exists
    // to own persisted history.
    const saved = player.isGuest ? { id: crypto.randomUUID(), createdAt: now(), scopeId } : recordMessage({
      scope,
      scopeId,
      userId: player.userId,
      body,
    });
    const payload = {
      t: 'chat',
      scope,
      body,
      from,
      at: saved.createdAt,
      id: saved.id,
      scopeId: saved.scopeId,
    };
    for (const other of instance.members.values()) {
      if (other.userId !== player.userId && isBlockedBetween(player.userId, other.userId)) continue;
      send(other.ws, payload);
    }
    return;
  }

  if (scope === 'dm') {
    const target = db
      .prepare('SELECT id, handle FROM users WHERE handle = ?')
      .get(String(msg.to ?? '').toLowerCase());
    if (!target) return fail(player.ws, 'not_found', 'No player with that handle');
    if (isBlockedBetween(player.userId, target.id)) {
      return fail(player.ws, 'blocked', 'You cannot message this player');
    }
    if (!dmAllowed(player.userId, target.id)) {
      return fail(player.ws, 'forbidden', 'This player only accepts messages from friends');
    }
    const saved = recordMessage({
      scope: 'dm',
      scopeId: dmScopeId(player.userId, target.id),
      userId: player.userId,
      body,
    });
    const payload = {
      t: 'chat',
      scope: 'dm',
      body,
      from,
      at: saved.createdAt,
      id: saved.id,
      scopeId: saved.scopeId,
      to: { userId: target.id, handle: target.handle },
    };
    send(player.ws, payload);
    for (const other of instances.get(player.instanceId)?.members.values() ?? []) {
      if (other.userId === target.id) send(other.ws, payload);
    }
    // Recipients in other instances still receive their DM.
    for (const otherInstance of instances.values()) {
      for (const other of otherInstance.members.values()) {
        if (other.userId === target.id && otherInstance.id !== player.instanceId) {
          send(other.ws, payload);
        }
      }
    }
    return;
  }

  if (scope === 'party') {
    const party = partyFor(player.userId);
    if (!party) return fail(player.ws, 'not_in_party', 'Join or create a party first');
    const payload = {
      t: 'chat',
      scope: 'party',
      body,
      from,
      at: now(),
      scopeId: party.id,
    };
    // Delivered across instances: a party is one conversation, not one shard.
    for (const memberId of party.members) {
      if (memberId !== player.userId && isBlockedBetween(player.userId, memberId)) continue;
      sendToUser(memberId, payload);
    }
    return;
  }

  fail(player.ws, 'bad_scope', 'Unknown chat scope');
}

function clamp(value, limit) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-limit, Math.min(limit, value));
}

function handlePose(player, msg) {
  // While riding transit or travelling the server owns the position; client
  // poses are ignored so a modified client cannot steer a vehicle.
  if (player.riding || player.journey) return;
  const nextX = clamp(Number(msg.x), MAX_CITY_COORD);
  const nextZ = clamp(Number(msg.z), MAX_CITY_COORD);
  if (!player.positioned || now() - player.joinedAt < SPAWN_GRACE_MS) {
    // The client owns its spawn point (TheCity arrival is at the airport, far
    // from the origin), so placement only has to be inside the map.
    player.positioned = true;
    player.lastPoseAt = now();
  } else {
    const elapsed = Math.max(1, Math.min(2_000, now() - player.lastPoseAt));
    const allowed = Math.max(MIN_STEP_ALLOWANCE, (MAX_SPEED * elapsed) / 1_000 + 0.75);
    const jump = Math.hypot(nextX - player.x, nextZ - player.z);
    if (jump > allowed) {
      player.teleportStrikes += 1;
      player.lastPoseAt = now();
      // Repeated impossible movement gets the connection dropped.
      if (player.teleportStrikes > 12) {
        fail(player.ws, 'kicked', 'Movement rejected by the server');
        player.ws.close(4002, 'movement');
      }
      return;
    }
  }
  player.teleportStrikes = Math.max(0, player.teleportStrikes - 1);
  player.lastPoseAt = now();
  player.x = nextX;
  player.z = nextZ;
  player.y = clamp(Number(msg.y), 3);
  player.yaw = Number.isFinite(Number(msg.yaw)) ? Number(msg.yaw) : player.yaw;
  if (ALLOWED_LOCATIONS.has(msg.location)) player.location = msg.location;
  // Only the shared animation vocabulary is accepted. A modified client cannot
  // inject arbitrary labels that other players would then try to render.
  const emote = normalizeAnimation(msg.emote);
  if (emote) player.emote = emote;
  if (typeof msg.voice === 'boolean') player.voice = msg.voice;
  if (msg.voiceMode === 'whisper' || msg.voiceMode === 'say' || msg.voiceMode === 'shout') {
    player.voiceMode = msg.voiceMode;
  }
  player.lastSeen = now();
}

function movePlayerToUser(player, targetUserId) {
  for (const instance of instances.values()) {
    const target = [...instance.members.values()].find((m) => m.userId === targetUserId);
    if (!target) continue;
    if (instance.id === player.instanceId) {
      send(player.ws, { t: 'instance', instance: publicInstance(instance) });
      return true;
    }
    if (instance.members.size >= instance.capacity) {
      fail(player.ws, 'instance_full', 'That instance is full');
      return false;
    }
    leaveInstance(player);
    joinInstance(player, instance);
    return true;
  }
  fail(player.ws, 'offline', 'That player is not online right now');
  return false;
}

function handleJoinFriend(player, msg) {
  if (player.isGuest) return fail(player.ws, 'forbidden', 'Guest visitors cannot join friends');
  const handle = String(msg.handle ?? '').toLowerCase();
  const row = db.prepare('SELECT id FROM users WHERE handle = ?').get(handle);
  if (!row) return fail(player.ws, 'not_found', 'No player with that handle');
  movePlayerToUser(player, row.id);
}

function handleParty(player, msg) {
  if (player.isGuest) return fail(player.ws, 'forbidden', 'Guest visitors cannot use parties');
  const action = String(msg.action ?? '');
  if (action === 'create') {
    try {
      createParty(player.userId);
      pushParty(player.userId);
    } catch (error) {
      handlePartyError(player, error);
    }
    return;
  }
  if (action === 'invite') {
    try {
      const { party, invitedUserId } = inviteToParty(player.userId, msg.handle);
      broadcastParty(party);
      pushParty(invitedUserId);
    } catch (error) {
      handlePartyError(player, error);
    }
    return;
  }
  if (action === 'accept') {
    try {
      const party = acceptPartyInvite(player.userId);
      broadcastParty(party);
      pushParty(player.userId);
    } catch (error) {
      handlePartyError(player, error);
    }
    return;
  }
  if (action === 'leave') {
    const before = partyFor(player.userId);
    const formerMembers = before ? partyMemberIds(before.id) : [player.userId];
    try {
      leaveParty(player.userId);
    } catch (error) {
      return handlePartyError(player, error);
    }
    for (const memberId of formerMembers) pushParty(memberId);
    pushParty(player.userId);
    return;
  }
  if (action === 'kick') {
    const targetUserId = String(msg.userId ?? '');
    try {
      const party = kickFromParty(player.userId, targetUserId);
      broadcastParty(party);
      pushParty(targetUserId);
    } catch (error) {
      handlePartyError(player, error);
    }
    return;
  }
  if (action === 'join') {
    const party = partyFor(player.userId);
    if (!party) return fail(player.ws, 'not_in_party', 'Join or create a party first');
    const leaderId = party.leaderId === player.userId ? player.userId : party.leaderId;
    if (leaderId === player.userId) {
      return fail(player.ws, 'party_leader', 'You are the leader — your party joins you');
    }
    movePlayerToUser(player, leaderId);
    return;
  }
  fail(player.ws, 'bad_request', `Unknown party action: ${action}`);
}

function handleVoice(player, instance, msg) {
  if (player.isGuest) return fail(player.ws, 'forbidden', 'Guest visitors cannot use private voice signalling');
  if (!instance) return;
  if (!['offer', 'answer', 'ice'].includes(String(msg.kind))) {
    return fail(player.ws, 'bad_request', 'Unknown voice signal');
  }
  player.voiceBudget.push(now());
  player.voiceBudget = player.voiceBudget.filter((at) => now() - at < 10_000);
  if (player.voiceBudget.length > 250) {
    return fail(player.ws, 'rate_limited', 'Voice signalling rate limited');
  }
  const target = instance.members.get(String(msg.to ?? ''));
  if (!target || target.userId === player.userId) return;
  if (isBlockedBetween(player.userId, target.userId)) return;
  send(target.ws, {
    t: 'voice',
    from: { connId: player.connId, userId: player.userId, handle: player.handle, name: player.name },
    kind: String(msg.kind),
    data: msg.data ?? null,
  });
}

/**
 * Hotel room doorbells.
 *
 * A visitor can only reach a suite whose owner is online *and* standing in
 * their own room; the owner answers from inside the room and the visitor is
 * handed a read-only copy of the suite. Pending requests never outlive the
 * timeout, so a request cannot summon an owner who is offline.
 */
const doorbellRequests = new Map();

function findOnlinePlayer(userId) {
  for (const instance of instances.values()) {
    for (const candidate of instance.members.values()) {
      if (candidate.userId === userId) return candidate;
    }
  }
  return null;
}

function suiteForHotelRoom(roomNumber) {
  return db
    .prepare(
      `SELECT s.owner_id, s.number, s.floor, s.name, s.items_json, s.surfaces_json, s.mood,
              p.display_name, p.avatar_json
         FROM suites s
         LEFT JOIN profiles p ON p.user_id = s.owner_id
        WHERE s.number = ?
        LIMIT 1`
    )
    .get(String(roomNumber));
}

function suiteVisitPayload(suite) {
  return {
    userId: suite.owner_id,
    name: suite.display_name ?? 'Resident',
    roomNumber: suite.number,
    floor: Number(suite.floor),
    avatar: suite.avatar_json ? JSON.parse(suite.avatar_json) : null,
    items: JSON.parse(suite.items_json ?? '[]'),
    surfaces: JSON.parse(suite.surfaces_json ?? '{}'),
    mood: suite.mood ?? 'morning',
  };
}

function closeDoorbell(requestId, payload) {
  const request = doorbellRequests.get(requestId);
  if (!request) return;
  doorbellRequests.delete(requestId);
  if (request.timer) clearTimeout(request.timer);
  const visitor = findOnlinePlayer(request.visitorId);
  const owner = findOnlinePlayer(request.ownerId);
  if (visitor) send(visitor.ws, payload.visitor);
  if (owner) send(owner.ws, payload.owner);
}

function handleHotel(player, msg) {
  const action = String(msg.action ?? '');
  if (action === 'respond') {
    const requestId = String(msg.requestId ?? '');
    const request = doorbellRequests.get(requestId);
    if (!request) return;
    if (request.ownerId !== player.userId) {
      return fail(player.ws, 'forbidden', 'Only the suite owner can answer that doorbell');
    }
    const accept = msg.accept === true;
    doorbellRequests.delete(requestId);
    if (request.timer) clearTimeout(request.timer);
    const visitor = findOnlinePlayer(request.visitorId);
    if (!visitor) return;
    if (!accept) {
      send(visitor.ws, {
        t: 'hotel',
        action: 'declined',
        requestId,
        roomNumber: request.roomNumber,
      });
      send(player.ws, { t: 'hotel', action: 'resolved', requestId, accepted: false });
      return;
    }
    const suite = suiteForHotelRoom(request.roomNumber);
    if (!suite) {
      send(visitor.ws, {
        t: 'hotel',
        action: 'unavailable',
        roomNumber: request.roomNumber,
        reason: 'not_found',
      });
      return;
    }
    send(visitor.ws, {
      t: 'hotel',
      action: 'granted',
      requestId,
      room: suiteVisitPayload(suite),
    });
    send(player.ws, { t: 'hotel', action: 'resolved', requestId, accepted: true });
    return;
  }

  if (action === 'cancel') {
    const requestId = String(msg.requestId ?? '');
    const request = doorbellRequests.get(requestId);
    if (!request || request.visitorId !== player.userId) return;
    closeDoorbell(requestId, {
      visitor: { t: 'hotel', action: 'cancelled', requestId },
      owner: { t: 'hotel', action: 'cancelled', requestId },
    });
    return;
  }

  if (action !== 'ring') return fail(player.ws, 'bad_request', 'Unknown doorbell action');
  const roomNumber = String(msg.roomNumber ?? '');
  if (!isDoorbellRoomNumber(roomNumber)) {
    return fail(player.ws, 'bad_request', 'That is not a hotel suite number');
  }
  if (player.isGuest) {
    return send(player.ws, {
      t: 'hotel',
      action: 'unavailable',
      roomNumber,
      reason: 'guest',
    });
  }
  const suite = suiteForHotelRoom(roomNumber);
  const owner = suite ? findOnlinePlayer(suite.owner_id) : null;
  const availability = doorbellAvailability({
    suite,
    requesterId: player.userId,
    requesterIsGuest: player.isGuest,
    ownerOnline: Boolean(owner),
    ownerLocation: owner?.location ?? null,
  });
  if (!availability.ok) {
    return send(player.ws, {
      t: 'hotel',
      action: 'unavailable',
      roomNumber,
      reason: availability.reason,
      message: DOORBELL_REASON_TEXT[availability.reason] ?? '',
    });
  }
  if (!owner) {
    return send(player.ws, {
      t: 'hotel',
      action: 'unavailable',
      roomNumber,
      reason: 'offline',
      message: DOORBELL_REASON_TEXT.offline,
    });
  }
  // One pending request per visitor, so a player cannot spam every suite.
  for (const [id, existing] of doorbellRequests) {
    if (existing.visitorId === player.userId) {
      closeDoorbell(id, {
        visitor: { t: 'hotel', action: 'cancelled', requestId: id },
        owner: { t: 'hotel', action: 'cancelled', requestId: id },
      });
    }
  }
  const requestId = crypto.randomUUID();
  const expiresAt = now() + DOORBELL_TIMEOUT_MS;
  const timer = setTimeout(() => {
    closeDoorbell(requestId, {
      visitor: { t: 'hotel', action: 'expired', requestId, roomNumber },
      owner: { t: 'hotel', action: 'expired', requestId, roomNumber },
    });
  }, DOORBELL_TIMEOUT_MS);
  timer.unref?.();
  doorbellRequests.set(requestId, {
    id: requestId,
    ownerId: suite.owner_id,
    visitorId: player.userId,
    roomNumber,
    expiresAt,
    timer,
  });
  send(player.ws, { t: 'hotel', action: 'ringing', requestId, roomNumber, expiresAt });
  send(owner.ws, {
    t: 'hotel',
    action: 'ring',
    requestId,
    roomNumber,
    expiresAt,
    from: {
      userId: player.userId,
      handle: player.handle,
      name: player.isGuest ? `Guest User - ${player.name}` : player.name,
    },
  });
}

function handleTransit(player, msg) {
  if (msg.action === 'board') {
    try {
      const result = boardRider(player, player.instanceId, {
        lineId: msg.lineId,
        stopId: msg.stopId,
      });
      ensureFleet(player.instanceId);
      send(player.ws, {
        t: 'transit',
        riding: {
          vehicleId: result.vehicle.id,
          lineId: result.line.id,
          seat: result.seat,
          label: result.line.label,
          kind: result.line.kind,
        },
        vehicles: vehiclesFor(player.instanceId),
      });
    } catch (error) {
      handlePartyError(player, error);
    }
    return;
  }
  if (msg.action === 'hailTaxi') {
    try {
      const result = boardTaxi(player, player.instanceId, msg.vehicleId);
      send(player.ws, {
        t: 'transit',
        riding: {
          vehicleId: result.vehicle.id,
          lineId: 'taxi',
          seat: result.seat,
          label: result.line.label,
          kind: 'taxi',
        },
        taxi: result.taxi,
        vehicles: vehiclesFor(player.instanceId),
      });
    } catch (error) {
      handlePartyError(player, error);
    }
    return;
  }
  if (msg.action === 'taxiDestination') {
    try {
      const result = assignTaxiDestination(player, msg.destinationId);
      send(player.ws, {
        t: 'transit',
        taxi: {
          state: result.taxi.state,
          destinationId: result.taxi.destinationId,
          destinationLabel: result.taxi.destinationLabel,
          destinations: [],
          etaSeconds: result.etaSeconds,
        },
        vehicles: vehiclesFor(player.instanceId),
      });
    } catch (error) {
      handlePartyError(player, error);
    }
    return;
  }
  if (msg.action === 'exit') {
    if (!player.riding) return;
    const exited = exitRider(player);
    send(player.ws, {
      t: 'transit',
      riding: null,
      exited,
      vehicles: vehiclesFor(player.instanceId),
    });
    return;
  }
  fail(player.ws, 'bad_request', 'Unknown transit action');
}

function handleTravel(player, msg) {
  if (msg.action === 'start') {
    try {
      const journey = startJourney(player, {
        mode: msg.mode,
        destinationId: msg.destinationId,
      });
      send(player.ws, { t: 'travel', action: 'boarding', journey });
    } catch (error) {
      handlePartyError(player, error);
    }
    return;
  }
  if (msg.action === 'cancel') {
    if (!player.journey) return;
    const mode = player.journey.mode;
    releaseJourney(player);
    player.location = mode === 'air' ? 'airport' : 'world';
    send(player.ws, { t: 'travel', action: 'cancelled', mode });
    return;
  }
  fail(player.ws, 'bad_request', 'Unknown travel action');
}

export function attachRealtime(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 16 * 1024 });

  wss.on('connection', (ws, req) => {
    /** @type {any} */
    const player = {
      ws,
      connId: `c_${Math.random().toString(36).slice(2, 10)}`,
      userId: null,
      handle: null,
      name: 'Resident',
      avatar: null,
      instanceId: null,
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      emote: 'idle',
      location: 'world',
      lastSeen: now(),
      lastPoseAt: now(),
      joinedAt: now(),
      positioned: false,
      lastChatAt: 0,
      chatBudget: [],
      poseCount: 0,
      poseWindowStart: now(),
      teleportStrikes: 0,
      voice: false,
      voiceMode: 'say',
      voiceBudget: [],
      riding: null,
      transitLineId: null,
      transitSeat: null,
      journey: null,
      ip: req.socket.remoteAddress,
      isGuest: false,
      requestedInstance: null,
    };

    const requestUrl = new URL(req.url ?? '/ws', 'http://loftlife.local');
    const rawInstance = requestUrl.searchParams.get('instance');
    const requestedInstance = rawInstance === null ? null : resolveInstance(rawInstance);
    if (rawInstance !== null && !requestedInstance) {
      fail(ws, 'invalid_instance', 'Unknown realtime instance');
      ws.close(1008, 'invalid_instance');
      return;
    }
    player.requestedInstance = requestedInstance;

    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
      player.lastSeen = now();
    });

    const helloTimer = setTimeout(() => {
      if (!player.userId) ws.close(4001, 'hello required');
    }, 10_000);
    helloTimer.unref?.();

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return fail(ws, 'bad_json', 'Malformed message');
      }
      if (!msg || typeof msg !== 'object') return fail(ws, 'bad_message', 'Malformed message');

      if (msg.t === 'hello') {
        if (player.userId) return;
        const token = String(msg.token ?? '');
        let user = null;
        let guest = null;
        try {
          user = userForToken(token);
        } catch (error) {
          return fail(ws, error.code ?? 'suspended', error.message ?? 'Account unavailable');
        }
        if (!user) guest = guestForToken(token);
        if (!user && !guest) return fail(ws, 'unauthorized', 'Sign in to play online');

        const place = msg.place && typeof msg.place === 'object' ? msg.place : { kind: 'city' };
        const requested = player.requestedInstance;
        if (guest) {
          if ((requested && requested !== CITY_INSTANCE) || place.kind === 'world') {
            fail(ws, 'forbidden', 'Guest sessions can only enter TheCity');
            ws.close(1008, 'guest_city_only');
            return;
          }
          player.isGuest = true;
          player.userId = guest.id;
          player.handle = 'guest';
          player.name = guest.displayName;
          // Guest avatars are client-local (not account profiles); accept only
          // the known visual fields so every viewer receives the same outfit.
          player.avatar = guestAvatarFromMessage(msg.avatar);
        } else {
          const profile = profileFor(user.id);
          player.userId = user.id;
          player.handle = user.handle;
          player.name = profile.name;
          player.avatar = profile.avatar;
        }
        clearTimeout(helloTimer);

        if (requested && requested !== CITY_INSTANCE) {
          const worldId = requested.slice('world:'.length);
          if (place.kind !== 'world' || String(place.worldId ?? '') !== worldId) {
            return fail(ws, 'forbidden', 'That instance does not match this place');
          }
          const world = db.prepare('SELECT * FROM worlds WHERE id = ?').get(worldId);
          if (!world) return fail(ws, 'not_found', 'That world no longer exists');
          if (!canEnterWorld(world, user.id)) {
            return fail(ws, 'forbidden', 'You do not have access to that world');
          }
          const instance = worldInstance(`world:${world.id}`, world.id, world.max_visitors);
          joinInstance(player, instance);
        } else if (requested === CITY_INSTANCE) {
          if (place.kind === 'world') {
            return fail(ws, 'forbidden', 'That instance does not match this place');
          }
          joinInstance(player, cityInstance());
        } else if (place.kind === 'world') {
          // Legacy sockets without an instance query keep the old behaviour.
          const world = db.prepare('SELECT * FROM worlds WHERE id = ?').get(String(place.worldId ?? ''));
          if (!world) return fail(ws, 'not_found', 'That world no longer exists');
          if (!canEnterWorld(world, user.id)) {
            return fail(ws, 'forbidden', 'You do not have access to that world');
          }
          joinInstance(player, worldInstance(`world:${world.id}`, world.id, world.max_visitors));
        } else {
          joinInstance(player, cityInstance());
        }
        player.lastSeen = now();
        return;
      }

      if (!player.userId) return fail(ws, 'unauthorized', 'Send hello first');
      player.lastSeen = now();

      switch (msg.t) {
        case 'pose': {
          player.poseCount += 1;
          if (now() - player.poseWindowStart > 1000) {
            player.poseWindowStart = now();
            player.poseCount = 1;
          }
          if (player.poseCount > MAX_POSE_PER_SECOND) return;
          handlePose(player, msg);
          return;
        }
        case 'chat':
          return handleChat(player, instances.get(player.instanceId), msg);
        case 'joinFriend':
          return handleJoinFriend(player, msg);
        case 'party':
          return handleParty(player, msg);
        case 'hotel':
          return handleHotel(player, msg);
        case 'voice':
          return handleVoice(player, instances.get(player.instanceId), msg);
        case 'transit':
          return handleTransit(player, msg);
        case 'travel':
          return handleTravel(player, msg);
        case 'leave': {
          leaveInstance(player);
          player.userId = null;
          return ws.close(4000, 'left');
        }
        case 'ping':
          return send(ws, { t: 'pong', at: now() });
        default:
          return fail(ws, 'unknown_type', `Unknown message type: ${msg.t}`);
      }
    });

    ws.on('close', () => {
      clearTimeout(helloTimer);
      if (player.userId) leaveInstance(player);
    });
    ws.on('error', () => {
      // Socket errors are followed by close; nothing else to clean up.
    });
  });

  let lastTick = now();
  const tick = setInterval(() => {
    const timestamp = now();
    const byInstance = new Map();
    for (const instance of instances.values()) {
      byInstance.set(instance.id, uniquePlayers(instance));
    }
    stepTransit(timestamp, lastTick, (instanceId) => byInstance.get(instanceId) ?? []);
    lastTick = timestamp;
    for (const instance of instances.values()) {
      const players = byInstance.get(instance.id) ?? [];
      for (const player of players) {
        const event = advanceJourney(player, timestamp);
        if (event) send(player.ws, event);
      }
      const vehicles = vehiclesFor(instance.id, timestamp);
      // Ambient buses, trains and taxis always exist, so even a solo player
      // receives the moving fleet.
      const views = players.map(playerView);
      broadcast(instance, {
        t: 'snapshot',
        instanceId: instance.id,
        at: timestamp,
        players: views,
        vehicles,
      });
    }
  }, TICK_MS);
  tick.unref?.();

  const heartbeat = setInterval(() => {
    for (const instance of instances.values()) {
      for (const player of [...instance.members.values()]) {
        if (player.ws.readyState !== player.ws.OPEN) {
          leaveInstance(player);
          continue;
        }
        if (timestamp() - player.lastSeen > IDLE_TIMEOUT_MS) {
          player.ws.terminate();
          leaveInstance(player);
        }
      }
    }
  }, 20_000);
  heartbeat.unref?.();

  function timestamp() {
    return now();
  }

  wss.on('close', () => {
    clearInterval(tick);
    clearInterval(heartbeat);
  });

  return wss;
}

export function presenceSnapshot() {
  const perInstance = [...instances.values()].map(publicInstance);
  return {
    online: perInstance.reduce((total, instance) => total + instance.count, 0),
    instances: perInstance,
    cityCapacity: cityCapacity(),
  };
}

export function isEditableWorld(instanceId, userId) {
  const instance = instances.get(instanceId);
  if (!instance || instance.kind !== 'world') return false;
  const world = db.prepare('SELECT * FROM worlds WHERE id = ?').get(instance.worldId);
  return canEditWorld(world, userId);
}
