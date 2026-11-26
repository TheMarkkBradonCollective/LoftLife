/**
 * Parties: a lightweight in-memory group object.
 *
 * A party has a leader, up to `MAX_PARTY_MEMBERS` members and pending
 * invitations. Party chat is scoped to the party id and delivered across
 * instances, so a group can walk around the city together and still talk.
 *
 * Parties are intentionally process-local: they are transient by design (like
 * a voice call), so losing them on restart is correct rather than data loss.
 */
import { db } from './db.mjs';
import { badRequest, conflict, forbidden, notFound } from './errors.mjs';
import { isBlockedBetween } from './social.mjs';

export const MAX_PARTY_MEMBERS = 8;

/** @type {Map<string, {id:string, leaderId:string, members:Set<string>, invites:Set<string>, createdAt:number}>} */
const parties = new Map();
/** @type {Map<string, string>} userId -> partyId */
const memberParty = new Map();
let partySeq = 1;

function userCard(userId) {
  const row = db
    .prepare(
      `SELECT u.id, u.handle, p.display_name
       FROM users u JOIN profiles p ON p.user_id = u.id
       WHERE u.id = ?`
    )
    .get(userId);
  return row
    ? { userId: row.id, handle: row.handle, displayName: row.display_name }
    : null;
}

export function partyFor(userId) {
  const id = memberParty.get(userId);
  return id ? parties.get(id) ?? null : null;
}

export function partyById(partyId) {
  return parties.get(partyId) ?? null;
}

export function partyView(party) {
  if (!party) return null;
  return {
    id: party.id,
    leaderId: party.leaderId,
    members: [...party.members].map(userCard).filter(Boolean),
    invites: [...party.invites].map(userCard).filter(Boolean),
    maxMembers: MAX_PARTY_MEMBERS,
    createdAt: party.createdAt,
  };
}

/** Every party that has a pending invitation for this player. */
export function pendingInvitesFor(userId) {
  const result = [];
  for (const party of parties.values()) {
    if (party.invites.has(userId)) result.push(party);
  }
  return result;
}

export function partyMemberIds(partyId) {
  const party = parties.get(partyId);
  return party ? [...party.members] : [];
}

export function createParty(userId) {
  const existing = partyFor(userId);
  if (existing) throw conflict('You are already in a party');
  const party = {
    id: `party_${partySeq++}`,
    leaderId: userId,
    members: new Set([userId]),
    invites: new Set(),
    createdAt: Date.now(),
  };
  parties.set(party.id, party);
  memberParty.set(userId, party.id);
  return party;
}

export function inviteToParty(userId, handle) {
  const party = partyFor(userId);
  if (!party) throw badRequest('Create or join a party first');
  const cleaned = String(handle ?? '')
    .trim()
    .replace(/^@/, '')
    .toLowerCase();
  if (!cleaned) throw badRequest('A player handle is required');
  const row = db.prepare('SELECT id FROM users WHERE handle = ?').get(cleaned);
  if (!row) throw notFound('No player with that handle');
  if (row.id === userId) throw badRequest('You are already in this party');
  if (party.members.has(row.id)) throw conflict('That player is already in your party');
  if (isBlockedBetween(userId, row.id)) throw forbidden('You cannot invite this player');
  if (party.members.size >= MAX_PARTY_MEMBERS) throw conflict('This party is full');
  party.invites.add(row.id);
  return { party, invitedUserId: row.id };
}

/** Accept the most recent pending invitation. */
export function acceptPartyInvite(userId) {
  if (partyFor(userId)) throw conflict('Leave your current party first');
  // Newest invitation first so a fresh invite wins over a stale one.
  const candidates = pendingInvitesFor(userId).sort((a, b) => b.createdAt - a.createdAt);
  if (candidates.length === 0) throw notFound('No pending party invitation');
  const party = candidates[0];
  if (party.members.size >= MAX_PARTY_MEMBERS) throw conflict('That party is full');
  party.invites.delete(userId);
  party.members.add(userId);
  memberParty.set(userId, party.id);
  return party;
}

export function leaveParty(userId) {
  const party = partyFor(userId);
  if (!party) return null;
  party.members.delete(userId);
  party.invites.delete(userId);
  memberParty.delete(userId);
  if (party.members.size === 0) {
    parties.delete(party.id);
    return null;
  }
  if (party.leaderId === userId) {
    party.leaderId = [...party.members][0];
  }
  return party;
}

export function kickFromParty(userId, targetUserId) {
  const party = partyFor(userId);
  if (!party) throw badRequest('You are not in a party');
  if (party.leaderId !== userId) throw forbidden('Only the party leader can remove members');
  if (targetUserId === userId) throw badRequest('Leaders leave the party instead of kicking themselves');
  if (!party.members.has(targetUserId)) throw notFound('That player is not in your party');
  party.members.delete(targetUserId);
  memberParty.delete(targetUserId);
  return party;
}

/** Test/diagnostic helper: forget every party (used by the test suite). */
export function resetParties() {
  parties.clear();
  memberParty.clear();
}
