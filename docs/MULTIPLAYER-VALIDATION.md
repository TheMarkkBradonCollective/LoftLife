# Multiplayer and production validation

Status of the online multiplayer system after the validation pass in this branch.
It separates what is verified by an automated check from what still needs a real
Cloudflare/Neon/device run.

## What changed

| Area | Change |
| --- | --- |
| Movement bounds | The sanity box was `±500 m` while TheCity's airport arrival is around `x≈584, z≈410`. Positions were silently clamped and the spawn pose was rejected. Bound is now `±1500 m` in both runtimes. |
| Spawn placement | The client streamed its placeholder origin `(0,0)` before the 3D scene reported a position, and the gateway accepted that as the spawn; every real pose after it looked like an impossible jump, so the avatar stayed at the origin for everyone else. The client now refuses to stream a pose until the scene has a position, and both runtimes accept placement without the speed check for 5 s after joining (covers slow devices and reconnects). |
| Speed limit | Replaced the fixed 40 m-per-message allowance (400 m/s) with an elapsed-time limit of 12 m/s plus 2.5 m of slack, in both the Node gateway and the Durable Object. |
| Reconnect race | `switchPlace()` could let the retiring socket's `close` handler clear the replacement socket and stop its pose loop, leaving one connection sending stale poses and the live one sending none. Socket handlers are now bound to their own socket, and re-entering the place you are already in no longer opens a second connection. |
| Stationary avatars | Remote rigs settle exactly on the last server position once their tracked position stops changing, so the tail of the interpolation no longer reads as sliding. |
| Party invites (production) | The Durable Object broadcast the *actor's* party state to every recipient, so an invitee never saw an invitation. Each recipient now receives their own party view. |
| Party "join leader" (production) | Was treated as "accept invitation". It now resolves the leader's instance and asks the client to reconnect there. |
| Friend joining (production) | `joinFriend` returned "not migrated to the edge yet". It now resolves the friend's instance through the party coordinator and relocates the client. |
| Session expiry (production) | The Durable Object never dropped a socket whose signed session had expired. It now records the token expiry at join, sweeps every 30 s, and closes expired or idle (>90 s) sockets. |
| Presence (production) | `/api/presence` counted only signed-in accounts. It now merges the city Durable Object (which counts guests too) with world instances. |
| Migrations | `0005_control_preferences.sql` did not record its version row. |

## Automated verification (`npm test`, 124 checks)

Node dev runtime (`server/test/multiplayer-acceptance.test.mjs`):

- the airport spawn pose is accepted and relayed to a second client unchanged;
- a stationary player is reported at one position across snapshots and is not disconnected;
- an impossible jump is rejected and repeated attempts close the socket with code `4002`;
- presence reflects join, leave and reconnect, and a guest counts toward city presence;
- party create → invite → accept, party chat across instances, and "join leader" moving a
  member from the city into the leader's world;
- `joinFriend` moving a player to a friend in another instance, and `not_found` for an
  unknown handle.

Shared-city capacity (`server/test/city-capacity.test.mjs`):

- default capacity is 64; 64 guests are admitted and report exactly 64 in presence;
- the 65th is rejected with `instance_full` and close code `1013`.

Cloudflare runtime (`server/test/worker-multiplayer.test.mjs`, shipping
`src/cloudflare/worker.ts` + `LoftLifeRealtime` against an in-memory Neon `/sql` stub and
in-process `WebSocketPair`):

- 64 guests admitted to `city:main`, 65th rejected with `instance_full` / `1013`;
- registered accounts join TheCity, see each other, keep the real spawn, and cannot teleport;
- registered city chat reaches the Neon SQL layer (`INSERT INTO ll_chat_messages`);
- party invite/accept and "join leader" relocation, plus `joinFriend` relocation;
- guest identity `Guest User - [name]`, guest rejection for party / joinFriend / voice, and
  guest city presence;
- an expired session closes a live socket with `1008 session_expired`.

Existing suites continue to cover sign-up, sign-in, sign-out, session persistence, guest
sessions and revocation, DMs/friends/parties permissions, transit seats, and the Worker's
guest city contract.

## Manual / environment checks

- `npx wrangler@4 deploy --dry-run`: Worker bundles for workerd with the `REALTIME` Durable
  Object and `ASSETS` bindings (344 KiB / 87 KiB gzip).
- `npx wrangler@4 dev --local` (workerd, no secrets): SPA served, `/api/health` reports
  `runtime: cloudflare-worker`, `/api/presence` answers from both Durable Objects with
  `cityCapacity: 64`, `/ws` without an upgrade returns 426, guest sessions fail closed with
  `503 unconfigured` when `DATABASE_URL` is missing, and a cross-origin guest POST returns 403.
- Migrations: all seven files were applied in order to a real Postgres engine (PGlite),
  seeded with pre-existing suites, then applied again. Room allocation backfilled to unique
  `501`/`502` on floor 5, all expected tables/columns exist, and the second pass changed
  nothing.
- Two-client device check in a browser: a desktop viewport (1440×900) and an Android
  emulation (Pixel 7, 412×915, touch) both entered TheCity as guests, saw each other's
  `Guest User - …` label, and a city message sent on the desktop appeared on the phone.
- An independent WebSocket client (a second device) observed the browser client's real
  position after it was first placed and after it walked, and saw the position stay byte-stable
  while the browser was idle.

## Not verified here — requires the deployed environment

These need credentials and hardware that this workspace does not have. They are not claimed
as passing.

- **Register/login/logout against the live Neon database.** `scripts/verify-edge-auth.mjs`
  exits before touching the network without `DATABASE_URL`; the Worker returns
  `503 unconfigured` in local workerd. Run `npm run verify:edge` with the project's secrets.
- **Migrations against the deployed Neon database.** Verified against Postgres-compatible
  SQL locally, not against the production branch. Apply `migrations/0002…0007` (and the new
  `0005` version row) and confirm `ll_schema_migrations`.
- **Durable Object state in production.** Exercised in-process with a hibernation stand-in,
  not against a real Cloudflare Durable Object.
- **Real Android hardware and the installed desktop app.** The Android column above is
  Chromium device emulation with touch events; it is not a physical phone, and the installed
  desktop shell was not run.
- **Two physical devices over the public internet.** Verified with two browser contexts and
  with a browser plus an independent socket client on one host; NAT latency, mobile
  backgrounding and carrier behavior were not exercised.
- **Production deployment.** No `CLOUDFLARE_API_TOKEN` or `LOFTLIFE_SESSION_SECRET` is
  available here, so the Worker was not deployed and no live acceptance run was performed.

## Known limitations left in place

- The short post-join placement window means a client can choose its spawn anywhere inside
  the map for 5 s after joining. This is deliberate (the client owns its spawn), but it is
  not a full trusted-spawn design.
- A page reload briefly holds two sockets (the first joins, then closes as the second takes
  over). The orphan sends no pose and is removed when its close is processed, but it can
  appear in presence for a fraction of a second.
- Remote-player interpolation is client-side smoothing; there is no lag compensation or
  server-side re-simulation.
