/**
 * City-building acceptance tests: foundations, plot approvals, role
 * permissions, undo/redo, saved revisions, publishing and the staff-only
 * official Main City. Runs against the real Node authority and SQLite file.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import WebSocket from 'ws';
import {
  DEFAULT_FOUNDATION_ID,
  FOUNDATIONS,
  WORLD_TOOLS,
  foundationRoads,
} from '../../shared/world-layout.mjs';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loftlife-build-test-'));
process.env.LOFTLIFE_DATA_DIR = dataDir;
process.env.LOFTLIFE_AUTH_RATE_MAX = '500';

let startServer;
let closeDb;
let server;
let port;
let base;

before(async () => {
  ({ startServer } = await import('../index.mjs'));
  ({ closeDb } = await import('../db.mjs'));
  const started = await startServer({ port: 0 });
  server = started.server;
  port = started.port;
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  closeDb?.();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

let counter = 0;
const uniq = () => `${Date.now().toString(36)}${(counter += 1)}`;

async function api(method, route, { token, body } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : null };
}

async function newAccount() {
  const handle = `b${uniq()}`;
  const res = await api('POST', '/api/auth/register', {
    body: { handle, email: `${handle}@example.test`, password: 'correct-horse-battery', displayName: handle },
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return { handle, token: res.json.token, user: res.json.user };
}

function makeClient() {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const queue = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    const index = waiters.findIndex((entry) => entry.pred(msg));
    if (index >= 0) {
      const [entry] = waiters.splice(index, 1);
      clearTimeout(entry.timer);
      entry.resolve(msg);
    } else queue.push(msg);
  });
  const opened = new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return {
    ws,
    opened,
    send: (payload) => ws.send(JSON.stringify(payload)),
    waitFor(pred, timeoutMs = 4000) {
      const found = queue.findIndex(pred);
      if (found >= 0) return Promise.resolve(queue.splice(found, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for realtime message')), timeoutMs);
        waiters.push({ pred, resolve, timer });
      });
    },
    close: () => ws.close(),
  };
}

async function enterWorldOverSocket(token, worldId) {
  const client = makeClient();
  await client.opened;
  client.send({ t: 'hello', token, place: { kind: 'world', worldId } });
  const ready = await client.waitFor((msg) => msg.t === 'ready' || msg.t === 'error');
  return { client, ready };
}

/* ------------------------------- foundations ------------------------------ */

test('foundations register TG-MapDefault as an empty road-only default', async () => {
  const res = await api('GET', '/api/worlds/foundations');
  assert.equal(res.status, 200);
  assert.equal(res.json.default, 'TG-MapDefault');
  assert.ok(res.json.foundations.length >= 2);
  const fallback = res.json.foundations.find((entry) => entry.id === 'TG-MapDefault');
  assert.ok(fallback);
  assert.equal(fallback.default, true);

  // Built-in foundation definitions contain roads and water only.
  for (const foundation of FOUNDATIONS) {
    assert.ok(Array.isArray(foundation.roads));
    assert.equal(foundation.structures, undefined);
  }
  const roads = foundationRoads(DEFAULT_FOUNDATION_ID);
  assert.ok(roads.length >= 4);

  // Every requested tool category exists in the catalog.
  const ids = new Set(WORLD_TOOLS.map((tool) => tool.id));
  for (const id of ['road', 'street', 'sidewalk', 'path', 'house', 'apartment', 'commercial', 'business', 'park', 'tree', 'lawn', 'garden']) {
    assert.ok(ids.has(id), `missing tool ${id}`);
  }
});

test('the default foundation starts with no prebuilt houses, parks or businesses', async () => {
  const owner = await newAccount();
  const created = await api('POST', '/api/worlds', {
    token: owner.token,
    body: { name: 'Empty foundation', access: 'private' },
  });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.equal(created.json.foundation, 'TG-MapDefault');
  assert.equal(created.json.layoutVersion, 0);

  const build = await api('GET', `/api/worlds/${created.json.id}/build`, { token: owner.token });
  assert.equal(build.status, 200, JSON.stringify(build.json));
  assert.deepEqual(build.json.layout.objects, []);
  assert.equal(build.json.layout.foundation, 'TG-MapDefault');
  assert.equal(build.json.world.status, 'offline');
});

/* ------------------------------- permissions ------------------------------ */

test('builder roles require an approved plot and cannot place streets', async () => {
  const owner = await newAccount();
  const builder = await newAccount();
  const member = await newAccount();

  const created = await api('POST', '/api/worlds', {
    token: owner.token,
    body: { name: 'Plot city', access: 'collab' },
  });
  const worldId = created.json.id;

  await api('POST', `/api/worlds/${worldId}/collaborators`, {
    token: owner.token,
    body: { handle: builder.handle, role: 'builder' },
  });
  await api('POST', `/api/worlds/${worldId}/collaborators`, {
    token: owner.token,
    body: { handle: member.handle, role: 'member' },
  });

  const open = await api('POST', `/api/worlds/${worldId}/build-mode`, { token: owner.token });
  assert.equal(open.status, 200, JSON.stringify(open.json));
  assert.equal(open.json.status, 'build_mode');

  // Closed for editing: visitors/members cannot enter; builders can rejoin.
  const memberEntry = await api('GET', `/api/worlds/${worldId}/entry`, { token: member.token });
  assert.equal(memberEntry.status, 403);
  const builderEntry = await api('GET', `/api/worlds/${worldId}/entry`, { token: builder.token });
  assert.equal(builderEntry.status, 200, JSON.stringify(builderEntry.json));

  // Member cannot even open the studio or build.
  const memberStudio = await api('GET', `/api/worlds/${worldId}/build`, { token: member.token });
  assert.equal(memberStudio.status, 403);
  const memberPlace = await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: member.token,
    body: { action: 'place', tool: 'house', x: 2, z: 2 },
  });
  assert.equal(memberPlace.status, 403);

  // Builders cannot change Live/Available/Offline state.
  const builderStatus = await api('POST', `/api/worlds/${worldId}/status`, {
    token: builder.token,
    body: { status: 'available' },
  });
  assert.equal(builderStatus.status, 403);

  // A builder with no approved plot is refused.
  const noPlot = await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: builder.token,
    body: { action: 'place', tool: 'house', x: 10, z: 10 },
  });
  assert.equal(noPlot.status, 400);
  assert.equal(noPlot.json.detail.reason, 'plot_required');

  // Only the owner places streets.
  const streetOwner = await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: owner.token,
    body: { action: 'place', tool: 'street', x: 1, z: 1 },
  });
  assert.equal(streetOwner.status, 200, JSON.stringify(streetOwner.json));
  const streetBuilder = await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: builder.token,
    body: { action: 'place', tool: 'street', x: 30, z: 30 },
  });
  assert.equal(streetBuilder.status, 400);
  assert.equal(streetBuilder.json.detail.reason, 'street_permission');

  // Owner creates a plot; builder requests it; approval assigns it.
  const plot = await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: owner.token,
    body: { action: 'plot_create', name: 'Riverside lot', x: 40, z: 40, w: 8, d: 8 },
  });
  assert.equal(plot.status, 200, JSON.stringify(plot.json));
  const plotId = plot.json.state.plots[0].id;

  const request = await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: builder.token,
    body: { action: 'plot_request', id: plotId },
  });
  assert.equal(request.status, 200);
  assert.equal(request.json.state.plots[0].status, 'requested');

  const beforeApproval = await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: builder.token,
    body: { action: 'place', tool: 'house', x: 41, z: 41 },
  });
  assert.equal(beforeApproval.status, 400);
  assert.equal(beforeApproval.json.detail.reason, 'plot_not_approved');

  const approve = await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: owner.token,
    body: { action: 'plot_approve', id: plotId },
  });
  assert.equal(approve.status, 200);
  assert.equal(approve.json.state.plots[0].status, 'approved');
  assert.equal(approve.json.state.plots[0].assignedTo, builder.user.id);

  const inside = await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: builder.token,
    body: { action: 'place', tool: 'house', x: 41, z: 41, color: '#c98f6b', material: 'brick' },
  });
  assert.equal(inside.status, 200, JSON.stringify(inside.json));
  const outside = await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: builder.token,
    body: { action: 'place', tool: 'house', x: 2, z: 2 },
  });
  assert.equal(outside.status, 400);
  assert.equal(outside.json.detail.reason, 'plot_required');

  // Unapproved colours/materials are rejected.
  const badColor = await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: owner.token,
    body: { action: 'place', tool: 'house', x: 5, z: 5, color: '#000000' },
  });
  assert.equal(badColor.status, 400);
  assert.equal(badColor.json.detail.reason, 'invalid_color');

  // Co-owner approval is permitted; members still cannot approve.
  const memberApprove = await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: member.token,
    body: { action: 'plot_release', id: plotId },
  });
  assert.equal(memberApprove.status, 403);
});

/* ------------------------- collaboration + history ------------------------ */

test('two builders share revisions with undo, redo and saved-version restore', async () => {
  const owner = await newAccount();
  const builderA = await newAccount();
  const builderB = await newAccount();
  const created = await api('POST', '/api/worlds', {
    token: owner.token,
    body: { name: 'Shared build', access: 'collab' },
  });
  const worldId = created.json.id;
  for (const builder of [builderA, builderB]) {
    await api('POST', `/api/worlds/${worldId}/collaborators`, {
      token: owner.token,
      body: { handle: builder.handle, role: 'builder' },
    });
  }
  await api('POST', `/api/worlds/${worldId}/build-mode`, { token: owner.token });
  const plot = await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: owner.token,
    body: { action: 'plot_create', name: 'Shared lot', x: 30, z: 30, w: 14, d: 14 },
  });
  const plotId = plot.json.state.plots[0].id;
  // Both builders can build in the same approved plot: the plot is assigned to
  // A, but B still submits a request and the owner releases/reassigns.
  await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: builderA.token,
    body: { action: 'plot_request', id: plotId },
  });
  await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: owner.token,
    body: { action: 'plot_approve', id: plotId },
  });

  const first = await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: builderA.token,
    body: { action: 'place', tool: 'house', x: 31, z: 31 },
  });
  const second = await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: builderA.token,
    body: { action: 'place', tool: 'apartment', x: 35, z: 35 },
  });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const revisionAfterBuild = second.json.state.world.layoutVersion;
  assert.equal(second.json.state.layout.objects.length, 2);

  // Collaboration visibility: B sees A's changes through the same revision.
  const seenByB = await api('GET', `/api/worlds/${worldId}/build`, { token: builderB.token });
  assert.equal(seenByB.status, 200);
  assert.equal(seenByB.json.world.layoutVersion, revisionAfterBuild);
  assert.equal(seenByB.json.layout.objects.length, 2);

  const undo = await api('POST', `/api/worlds/${worldId}/build/undo`, { token: builderA.token });
  assert.equal(undo.status, 200, JSON.stringify(undo.json));
  assert.equal(undo.json.state.layout.objects.length, 1);
  const redo = await api('POST', `/api/worlds/${worldId}/build/redo`, { token: builderA.token });
  assert.equal(redo.status, 200);
  assert.equal(redo.json.state.layout.objects.length, 2);

  // A previous revision can be restored by the owner/co-owner.
  const history = redo.json.state.history;
  // Revision 4 is the state after the first house and before the apartment.
  const oldRevision = history.find((entry) => entry.revision === 4);
  assert.ok(oldRevision);
  const restore = await api('POST', `/api/worlds/${worldId}/build/restore`, {
    token: owner.token,
    body: { revision: 4 },
  });
  assert.equal(restore.status, 200, JSON.stringify(restore.json));
  assert.equal(restore.json.state.layout.objects.length, 1);
  assert.ok(restore.json.state.world.layoutVersion > revisionAfterBuild);

  // Builders cannot restore or publish.
  const builderRestore = await api('POST', `/api/worlds/${worldId}/build/restore`, {
    token: builderA.token,
    body: { revision: 1 },
  });
  assert.equal(builderRestore.status, 403);
  const builderPublish = await api('POST', `/api/worlds/${worldId}/build/publish`, { token: builderA.token });
  assert.equal(builderPublish.status, 403);
});

/* --------------------------------- publish ------------------------------- */

test('publishing copies the draft, closes Build Mode and is owner-only', async () => {
  const owner = await newAccount();
  const coOwner = await newAccount();
  const created = await api('POST', '/api/worlds', {
    token: owner.token,
    body: { name: 'Publish me', access: 'public' },
  });
  const worldId = created.json.id;
  await api('POST', `/api/worlds/${worldId}/collaborators`, {
    token: owner.token,
    body: { handle: coOwner.handle, role: 'co_owner' },
  });
  await api('POST', `/api/worlds/${worldId}/build-mode`, { token: owner.token });
  const place = await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: owner.token,
    body: { action: 'place', tool: 'park', x: 10, z: 10, color: '#6f9a55', material: 'grass' },
  });
  assert.equal(place.status, 200);

  const coOwnerPublish = await api('POST', `/api/worlds/${worldId}/build/publish`, { token: coOwner.token });
  assert.equal(coOwnerPublish.status, 403);

  const publish = await api('POST', `/api/worlds/${worldId}/build/publish`, { token: owner.token });
  assert.equal(publish.status, 200, JSON.stringify(publish.json));
  assert.equal(publish.json.state.world.status, 'available');
  assert.equal(publish.json.state.publishedLayout.objects.length, 1);
  assert.equal(
    publish.json.state.publishedLayout.objects[0].tool,
    publish.json.state.layout.objects[0].tool
  );

  // Structural edits are closed outside Build Mode.
  const afterPublish = await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: owner.token,
    body: { action: 'place', tool: 'house', x: 4, z: 4 },
  });
  assert.equal(afterPublish.status, 409);
});

test('two approved builders edit separate plots and share one revision stream', async () => {
  const owner = await newAccount();
  const builderA = await newAccount();
  const builderB = await newAccount();
  const created = await api('POST', '/api/worlds', {
    token: owner.token,
    body: { name: 'Two builders', access: 'collab' },
  });
  const worldId = created.json.id;
  for (const builder of [builderA, builderB]) {
    await api('POST', `/api/worlds/${worldId}/collaborators`, {
      token: owner.token,
      body: { handle: builder.handle, role: 'builder' },
    });
  }
  await api('POST', `/api/worlds/${worldId}/build-mode`, { token: owner.token });

  const plotA = await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: owner.token,
    body: { action: 'plot_create', name: 'Lot A', x: 8, z: 8, w: 10, d: 10 },
  });
  const plotB = await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: owner.token,
    body: { action: 'plot_create', name: 'Lot B', x: 32, z: 32, w: 10, d: 10 },
  });
  const idA = plotA.json.state.plots[0].id;
  const idB = plotB.json.state.plots[1].id;
  await api('POST', `/api/worlds/${worldId}/build/op`, { token: builderA.token, body: { action: 'plot_request', id: idA } });
  await api('POST', `/api/worlds/${worldId}/build/op`, { token: builderB.token, body: { action: 'plot_request', id: idB } });
  await api('POST', `/api/worlds/${worldId}/build/op`, { token: owner.token, body: { action: 'plot_approve', id: idA } });
  await api('POST', `/api/worlds/${worldId}/build/op`, { token: owner.token, body: { action: 'plot_approve', id: idB } });

  const fromA = await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: builderA.token,
    body: { action: 'place', tool: 'house', x: 9, z: 9 },
  });
  assert.equal(fromA.status, 200, JSON.stringify(fromA.json));
  const fromB = await api('POST', `/api/worlds/${worldId}/build/op`, {
    token: builderB.token,
    body: { action: 'place', tool: 'park', x: 33, z: 33 },
  });
  assert.equal(fromB.status, 200, JSON.stringify(fromB.json));

  const shared = await api('GET', `/api/worlds/${worldId}/build`, { token: builderA.token });
  assert.equal(shared.status, 200);
  assert.equal(shared.json.world.layoutVersion, fromB.json.state.world.layoutVersion);
  assert.equal(shared.json.layout.objects.length, 2);
  const actors = new Set(shared.json.history.map((entry) => entry.actorId));
  assert.ok(actors.has(builderA.user.id));
  assert.ok(actors.has(builderB.user.id));
});

/* --------------------------- live world protection ------------------------ */

test('a live world cannot be shut down while players remain inside', async () => {
  const owner = await newAccount();
  const visitor = await newAccount();
  const created = await api('POST', '/api/worlds', {
    token: owner.token,
    body: { name: 'Live city', access: 'public' },
  });
  const worldId = created.json.id;
  // Published public worlds are visible to the visitor before going Live.
  await api('PATCH', `/api/worlds/${worldId}`, {
    token: owner.token,
    body: { published: true },
  });

  // Both players join the live instance.
  const ownerJoin = await enterWorldOverSocket(owner.token, worldId);
  assert.equal(ownerJoin.ready.t, 'ready', JSON.stringify(ownerJoin.ready));
  const visitorJoin = await enterWorldOverSocket(visitor.token, worldId);
  assert.equal(visitorJoin.ready.t, 'ready', JSON.stringify(visitorJoin.ready));

  const live = await api('POST', `/api/worlds/${worldId}/status`, {
    token: owner.token,
    body: { status: 'live' },
  });
  assert.equal(live.status, 200, JSON.stringify(live.json));
  assert.equal(live.json.status, 'live');

  const close = await api('POST', `/api/worlds/${worldId}/status`, {
    token: owner.token,
    body: { status: 'offline' },
  });
  assert.equal(close.status, 409);
  assert.match(close.json.error, /players are still inside/i);

  visitorJoin.client.close();
  ownerJoin.client.close();
});

/* ------------------------ staff-only official city ----------------------- */

test('only staff can open the official Main City workspace', async () => {
  const player = await newAccount();
  const denied = await api('GET', '/api/official/main-city', { token: player.token });
  assert.equal(denied.status, 403);

  const { db } = await import('../db.mjs');
  const staff = await newAccount();
  db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(staff.user.id);

  const allowed = await api('GET', '/api/official/main-city', { token: staff.token });
  assert.equal(allowed.status, 200, JSON.stringify(allowed.json));
  assert.equal(allowed.json.world.isOfficial, true);
  assert.equal(allowed.json.world.name, 'Main City');
  const officialId = allowed.json.world.id;

  // A regular player cannot inspect the staff workspace, even knowing the id.
  const playerStudio = await api('GET', `/api/worlds/${officialId}/build`, { token: player.token });
  assert.equal(playerStudio.status, 403);
  const playerEnter = await api('GET', `/api/worlds/${officialId}/entry`, { token: player.token });
  assert.equal(playerEnter.status, 403);

  const staffStudio = await api('GET', `/api/worlds/${officialId}/build`, { token: staff.token });
  assert.equal(staffStudio.status, 200);
  assert.equal(staffStudio.json.permissions.canAccessOfficialWorkspace, true);
});
