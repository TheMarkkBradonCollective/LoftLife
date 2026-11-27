/**
 * LoftLife API server.
 *
 *   npm run server      # API + realtime on :8787 (also serves ./dist if built)
 *
 * The client talks to /api and /ws; Vite proxies both in development so the
 * browser only ever sees one origin.
 */
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { db } from './db.mjs';
import {
  loginUser,
  optionalAuth,
  publicUser,
  rateLimiter,
  registerUser,
  requireAuth,
  revokeSession,
} from './auth.mjs';
import {
  CLOTHING_SHOP,
  FURNITURE_SHOP,
  claimDaily,
  getWallet,
  listInventory,
  purchase,
  transactionHistory,
} from './economy.mjs';
import { ApiError, forbidden, handler, notFound, unauthorized } from './errors.mjs';
import { createGuestSession, guestForToken, revokeGuestSession } from './guests.mjs';
import {
  attachRealtime,
  broadcastWorldEdit,
  presenceSnapshot,
  worldHasPlayer,
  worldPlayerCount,
} from './realtime.mjs';
import { partyFor, partyView, pendingInvitesFor } from './parties.mjs';
import { taxiDestinations, transitHubs, transitLines } from './transit.mjs';
import { travelDestinations } from './travel.mjs';
import {
  acceptFriend,
  applyMakeover,
  blockPlayer,
  chatHistory,
  deleteOutfit,
  dmScopeId,
  fileReport,
  listBlocked,
  listConversations,
  listFriends,
  listOpenReports,
  listOutfits,
  markConversationRead,
  readProfile,
  removeFriend,
  saveOutfit,
  searchPlayers,
  sendFriendRequest,
  suspendAccount,
  unblockPlayer,
  updateProfile,
} from './social.mjs';
import { canViewProfile, readSettings, writeSettings } from './settings.mjs';
import {
  addCollaborator,
  canEnterWorld,
  createWorld,
  deleteWorld,
  getSuite,
  getSuiteFor,
  getWorld,
  inviteToWorld,
  listWorlds,
  removeCollaborator,
  requestWorldBuildMode,
  saveSuite,
  saveWorldState,
  setSuiteVisibility,
  setWorldStatus,
  updateWorld,
} from './worlds.mjs';
import {
  applyBuildOperation,
  buildStateFor,
  ensureOfficialMainCity,
  foundationMeta,
  publishBuild,
  redoBuild,
  restoreBuild,
  undoBuild,
} from './worldBuild.mjs';
import { readControls, saveControls } from './preferences.mjs';

const PORT = Number(process.env.PORT || process.env.LOFTLIFE_PORT || 8787);
const ROOT = process.cwd();

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '512kb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  const authLimiter = rateLimiter({
    windowMs: 60_000,
    max: Number(process.env.LOFTLIFE_AUTH_RATE_MAX ?? 12),
  });
  const writeLimiter = rateLimiter({ windowMs: 60_000, max: 120 });

  /* ------------------------------- health ------------------------------- */

  app.get('/api/health', (req, res) => {
    const row = db.prepare('SELECT COUNT(*) AS n FROM users').get();
    res.json({ ok: true, accounts: row.n, realtime: presenceSnapshot() });
  });

  /* -------------------------------- auth -------------------------------- */

  app.post(
    '/api/auth/register',
    authLimiter,
    handler((req, res) => {
      const result = registerUser(req.body ?? {});
      res.status(201).json(result);
    })
  );

  app.post(
    '/api/auth/login',
    authLimiter,
    handler((req, res) => {
      res.json(loginUser(req.body ?? {}));
    })
  );

  /** Guest access matches the Worker: city-only, 12-hour opaque session. */
  app.post(
    '/api/guest/session',
    authLimiter,
    handler((req, res) => {
      res.status(201).json(createGuestSession(req.body?.displayName));
    })
  );

  app.delete(
    '/api/guest/session',
    handler((req, res) => {
      const header = req.get('authorization') ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
      if (!guestForToken(token)) throw unauthorized('Guest session is invalid or expired.');
      revokeGuestSession(token);
      res.json({ ok: true });
    })
  );

  app.get(
    '/api/settings',
    requireAuth,
    handler((req, res) => res.json({ settings: readSettings(req.user.id) }))
  );

  app.put(
    '/api/settings',
    requireAuth,
    writeLimiter,
    handler((req, res) => res.json({ settings: writeSettings(req.user.id, req.body ?? {}) }))
  );

  app.post(
    '/api/auth/logout',
    requireAuth,
    handler((req, res) => {
      revokeSession(req.token);
      res.json({ ok: true });
    })
  );

  app.get(
    '/api/auth/me',
    requireAuth,
    handler((req, res) => {
      res.json({
        user: publicUser(req.user),
        profile: readProfile(req.user.id),
        wallet: getWallet(req.user.id),
        inventory: listInventory(req.user.id),
        outfits: listOutfits(req.user.id),
        suite: getSuite(req.user.id),
      });
    })
  );

  /* ------------------------------ profiles ------------------------------ */

  app.get(
    '/api/profile',
    requireAuth,
    handler((req, res) => res.json(readProfile(req.user.id)))
  );

  app.patch(
    '/api/profile',
    requireAuth,
    writeLimiter,
    handler((req, res) => res.json(updateProfile(req.user.id, req.body ?? {})))
  );

  // Foundational appearance changes are paid, idempotent, and separate from
  // free hair/makeup/outfit saves.
  app.post(
    '/api/character/makeover',
    requireAuth,
    writeLimiter,
    handler((req, res) => res.json(applyMakeover(req.user.id, req.body ?? {})))
  );

  app.get(
    '/api/outfits',
    requireAuth,
    handler((req, res) => res.json(listOutfits(req.user.id)))
  );

  app.post(
    '/api/outfits',
    requireAuth,
    writeLimiter,
    handler((req, res) => res.json(saveOutfit(req.user.id, req.body ?? {})))
  );

  app.delete(
    '/api/outfits/:id',
    requireAuth,
    writeLimiter,
    handler((req, res) => res.json(deleteOutfit(req.user.id, req.params.id)))
  );

  // Keybindings + touch layout: local-first on the client, account-synced here.
  app.get(
    '/api/preferences/controls',
    requireAuth,
    handler((req, res) => res.json(readControls(req.user.id)))
  );

  app.put(
    '/api/preferences/controls',
    requireAuth,
    writeLimiter,
    handler((req, res) => res.json(saveControls(req.user.id, req.body ?? {})))
  );

  app.get(
    '/api/players',
    requireAuth,
    handler((req, res) => res.json(searchPlayers(req.user.id, req.query.q)))
  );

  app.get(
    '/api/profiles/:handle',
    optionalAuth,
    handler((req, res) => {
      const row = db
        .prepare('SELECT id FROM users WHERE handle = ?')
        .get(String(req.params.handle).toLowerCase());
      if (!row) throw notFound('No player with that handle');
      if (!canViewProfile(req.user?.id ?? null, row.id)) {
        throw forbidden('This profile is private');
      }
      const profile = readProfile(row.id);
      res.json({
        userId: profile.userId,
        handle: profile.handle,
        displayName: profile.displayName,
        bio: profile.bio,
        avatar: profile.avatar,
      });
    })
  );

  /* -------------------------------- shop -------------------------------- */

  app.get('/api/shop', (_req, res) => {
    res.json({ furniture: FURNITURE_SHOP, clothing: CLOTHING_SHOP });
  });

  app.get(
    '/api/inventory',
    requireAuth,
    handler((req, res) => res.json(listInventory(req.user.id)))
  );

  app.get(
    '/api/economy/wallet',
    requireAuth,
    handler((req, res) => res.json(getWallet(req.user.id)))
  );

  app.get(
    '/api/economy/history',
    requireAuth,
    handler((req, res) => res.json(transactionHistory(req.user.id, req.query.limit)))
  );

  app.post(
    '/api/economy/purchase',
    requireAuth,
    writeLimiter,
    handler((req, res) => {
      const { catalogId, idempotencyKey } = req.body ?? {};
      res.json(purchase(req.user.id, { catalogId, idempotencyKey }));
    })
  );

  app.post(
    '/api/economy/daily',
    requireAuth,
    handler((req, res) => res.json(claimDaily(req.user.id)))
  );

  /* -------------------------------- suite ------------------------------- */

  app.get(
    '/api/suite',
    requireAuth,
    handler((req, res) => res.json(getSuite(req.user.id)))
  );

  app.put(
    '/api/suite',
    requireAuth,
    writeLimiter,
    handler((req, res) => res.json(saveSuite(req.user.id, req.body ?? {})))
  );

  app.post(
    '/api/suite/visibility',
    requireAuth,
    handler((req, res) => res.json(setSuiteVisibility(req.user.id, Boolean(req.body?.isPublic))))
  );

  app.get(
    '/api/suites/:handle',
    requireAuth,
    handler((req, res) => {
      const row = db
        .prepare('SELECT id FROM users WHERE handle = ?')
        .get(String(req.params.handle).toLowerCase());
      if (!row) throw notFound('No player with that handle');
      res.json(getSuiteFor(req.user.id, row.id));
    })
  );

  /* -------------------------------- worlds ------------------------------ */

  app.get(
    '/api/worlds',
    optionalAuth,
    handler((req, res) =>
      res.json(
        listWorlds(req.user?.id ?? null, {
          mine: req.query.mine === '1',
          search: req.query.q ?? '',
          kind: req.query.kind ?? '',
        })
      )
    )
  );

  app.get(
    '/api/worlds/foundations',
    handler((_req, res) => res.json({ default: 'TG-MapDefault', foundations: foundationMeta() }))
  );

  app.get(
    '/api/official/main-city',
    requireAuth,
    handler((req, res) => res.json(ensureOfficialMainCity(req.user.id)))
  );

  app.post(
    '/api/worlds',
    requireAuth,
    writeLimiter,
    handler((req, res) => res.status(201).json(createWorld(req.user.id, req.body ?? {})))
  );

  app.get(
    '/api/worlds/:id',
    optionalAuth,
    handler((req, res) => res.json(getWorld(req.user?.id ?? null, req.params.id)))
  );

  app.patch(
    '/api/worlds/:id',
    requireAuth,
    writeLimiter,
    handler((req, res) => res.json(updateWorld(req.user.id, req.params.id, req.body ?? {})))
  );

  app.put(
    '/api/worlds/:id/state',
    requireAuth,
    writeLimiter,
    handler((req, res) => res.json(saveWorldState(req.user.id, req.params.id, req.body ?? {})))
  );

  app.post(
    '/api/worlds/:id/status',
    requireAuth,
    writeLimiter,
    handler((req, res) =>
      res.json(
        setWorldStatus(req.user.id, req.params.id, req.body?.status, {
          activeCount: worldPlayerCount(req.params.id),
          viewerPresent: worldHasPlayer(req.params.id, req.user.id),
        })
      )
    )
  );

  app.post(
    '/api/worlds/:id/build-mode',
    requireAuth,
    writeLimiter,
    handler((req, res) =>
      res.json(requestWorldBuildMode(req.user.id, req.params.id, worldPlayerCount(req.params.id)))
    )
  );

  /* --------------------------- city building --------------------------- */

  app.get(
    '/api/worlds/:id/build',
    requireAuth,
    handler((req, res) => res.json(buildStateFor(req.user.id, req.params.id)))
  );

  app.post(
    '/api/worlds/:id/build/op',
    requireAuth,
    writeLimiter,
    handler((req, res) => {
      const result = applyBuildOperation(req.user.id, req.params.id, req.body ?? {});
      broadcastWorldEdit(req.params.id, {
        revision: result.state.world.layoutVersion,
        actorId: req.user.id,
      });
      res.json(result);
    })
  );

  app.post(
    '/api/worlds/:id/build/undo',
    requireAuth,
    writeLimiter,
    handler((req, res) => {
      const result = undoBuild(req.user.id, req.params.id);
      broadcastWorldEdit(req.params.id, { revision: result.state.world.layoutVersion, actorId: req.user.id });
      res.json(result);
    })
  );

  app.post(
    '/api/worlds/:id/build/redo',
    requireAuth,
    writeLimiter,
    handler((req, res) => {
      const result = redoBuild(req.user.id, req.params.id);
      broadcastWorldEdit(req.params.id, { revision: result.state.world.layoutVersion, actorId: req.user.id });
      res.json(result);
    })
  );

  app.post(
    '/api/worlds/:id/build/restore',
    requireAuth,
    writeLimiter,
    handler((req, res) => {
      const result = restoreBuild(req.user.id, req.params.id, req.body?.revision);
      broadcastWorldEdit(req.params.id, { revision: result.state.world.layoutVersion, actorId: req.user.id });
      res.json(result);
    })
  );

  app.post(
    '/api/worlds/:id/build/publish',
    requireAuth,
    writeLimiter,
    handler((req, res) => {
      const worldId = req.params.id;
      const active = worldPlayerCount(worldId) - (worldHasPlayer(worldId, req.user.id) ? 1 : 0);
      res.json(publishBuild(req.user.id, worldId, Math.max(0, active)));
    })
  );

  app.delete(
    '/api/worlds/:id',
    requireAuth,
    handler((req, res) => res.json(deleteWorld(req.user.id, req.params.id)))
  );

  app.post(
    '/api/worlds/:id/collaborators',
    requireAuth,
    writeLimiter,
    handler((req, res) =>
      res.json(addCollaborator(req.user.id, req.params.id, req.body?.handle, req.body?.role))
    )
  );

  app.delete(
    '/api/worlds/:id/collaborators/:userId',
    requireAuth,
    handler((req, res) =>
      res.json(removeCollaborator(req.user.id, req.params.id, req.params.userId))
    )
  );

  app.post(
    '/api/worlds/:id/invite',
    requireAuth,
    writeLimiter,
    handler((req, res) => res.json(inviteToWorld(req.user.id, req.params.id, req.body?.handle)))
  );

  /** Authorize entering a world's live instance before the socket connects. */
  app.get(
    '/api/worlds/:id/entry',
    requireAuth,
    handler((req, res) => {
      const world = db.prepare('SELECT * FROM worlds WHERE id = ?').get(req.params.id);
      if (!world) throw notFound('World not found');
      if (!canEnterWorld(world, req.user.id)) throw forbidden('You do not have access to this world');
      res.json({
        instanceId: `world:${world.id}`,
        capacity: world.max_visitors,
        name: world.name,
      });
    })
  );

  /* -------------------------------- social ------------------------------ */

  app.get(
    '/api/friends',
    requireAuth,
    handler((req, res) => res.json(listFriends(req.user.id)))
  );

  app.post(
    '/api/friends/request',
    requireAuth,
    writeLimiter,
    handler((req, res) => res.json(sendFriendRequest(req.user.id, req.body?.handle)))
  );

  app.post(
    '/api/friends/accept',
    requireAuth,
    handler((req, res) => res.json(acceptFriend(req.user.id, String(req.body?.userId ?? ''))))
  );

  app.delete(
    '/api/friends/:userId',
    requireAuth,
    handler((req, res) => res.json(removeFriend(req.user.id, req.params.userId)))
  );

  app.get(
    '/api/blocks',
    requireAuth,
    handler((req, res) => res.json(listBlocked(req.user.id)))
  );

  app.post(
    '/api/blocks',
    requireAuth,
    handler((req, res) => res.json(blockPlayer(req.user.id, req.body?.handle)))
  );

  app.delete(
    '/api/blocks/:handle',
    requireAuth,
    handler((req, res) => res.json(unblockPlayer(req.user.id, req.params.handle)))
  );

  app.get(
    '/api/chat/history',
    requireAuth,
    handler((req, res) => {
      const scope = String(req.query.scope ?? 'city');
      const withHandle = req.query.with;
      let scopeId = String(req.query.scopeId ?? '');
      if (scope === 'dm') {
        if (!withHandle) throw new ApiError(400, 'bad_request', 'A "with" handle is required for DMs');
        const row = db
          .prepare('SELECT id FROM users WHERE handle = ?')
          .get(String(withHandle).toLowerCase());
        if (!row) throw notFound('No player with that handle');
        scopeId = dmScopeId(req.user.id, row.id);
      }
      res.json(chatHistory({ scope, scopeId, viewerId: req.user.id, limit: req.query.limit }));
    })
  );

  app.get(
    '/api/messages/conversations',
    requireAuth,
    handler((req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.json({ conversations: listConversations(req.user.id, req.query.limit) });
    })
  );

  app.post(
    '/api/messages/read',
    requireAuth,
    handler((req, res) => res.json(markConversationRead(req.user.id, req.body?.handle)))
  );

  /* ------------------------------ moderation ---------------------------- */

  app.post(
    '/api/reports',
    requireAuth,
    handler((req, res) => res.status(201).json(fileReport(req.user.id, req.body ?? {})))
  );

  const requireAdmin = (req, _res, next) => {
    if (req.user?.role !== 'admin') return next(forbidden('Administrator access required'));
    next();
  };

  app.get(
    '/api/mod/reports',
    requireAuth,
    requireAdmin,
    handler((_req, res) => res.json(listOpenReports()))
  );

  app.post(
    '/api/mod/suspend',
    requireAuth,
    requireAdmin,
    handler((req, res) =>
      res.json(suspendAccount(req.user.id, req.body?.handle, Number(req.body?.hours ?? 0)))
    )
  );

  /* ------------------------------ presence ------------------------------ */

  app.get('/api/presence', (_req, res) => res.json(presenceSnapshot()));

  /* ------------------------- party + transit ---------------------------- */

  app.get(
    '/api/party',
    requireAuth,
    handler((req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        party: partyView(partyFor(req.user.id)),
        invites: pendingInvitesFor(req.user.id).map(partyView),
      });
    })
  );

  /** Route data is server-owned so a Unity client can render the same lines. */
  app.get('/api/transit', (_req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({
      lines: transitLines(),
      taxis: taxiDestinations(),
      hubs: transitHubs(),
    });
  });

  /**
   * Eligible long-distance destinations. Private worlds are filtered through
   * the same access rules as entering them, so this list is the only source the
   * departure UI can offer.
   */
  app.get(
    '/api/travel/destinations',
    optionalAuth,
    handler((req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      const player = req.user
        ? { userId: req.user.id, isGuest: false }
        : { userId: null, isGuest: true };
      res.json(travelDestinations(player));
    })
  );

  /* ------------------------------- static ------------------------------- */

  const distDir = path.join(ROOT, 'dist');
  if (fs.existsSync(path.join(distDir, 'index.html'))) {
    app.use(express.static(distDir, { index: false, maxAge: '1h' }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found', code: 'not_found' }));

  app.use((error, _req, res, _next) => {
    if (error instanceof ApiError) {
      return res.status(error.status).json({
        error: error.message,
        code: error.code,
        detail: error.detail,
      });
    }
    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed JSON body', code: 'bad_json' });
    }
    console.error('[loftlife] unhandled error:', error);
    return res.status(500).json({ error: 'Internal server error', code: 'internal' });
  });

  return app;
}

export function startServer({ port = PORT } = {}) {
  const app = createApp();
  const server = http.createServer(app);
  attachRealtime(server);
  return new Promise((resolve) => {
    server.listen(port, '0.0.0.0', () => {
      const address = server.address();
      console.log(`[loftlife] api + realtime listening on http://0.0.0.0:${address.port}`);
      resolve({ server, port: address.port });
    });
  });
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  startServer().catch((error) => {
    console.error('[loftlife] failed to start:', error);
    process.exitCode = 1;
  });
}
