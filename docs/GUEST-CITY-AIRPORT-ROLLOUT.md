# Guest City, airport arrival, and hotel rollout

This document records the implementation state of issue #8. It distinguishes code present in this PR from deployment and product work that still requires verification.

## Implemented in this PR

### Guest access and public landing
- Signed-out visitors see a simple LoftLife landing page with only **Sign In** and **Visit as Guest** as primary actions.
- Guest visitors choose a display name before entry.
- The Worker issues a separate, signed, 12-hour guest token; its session identifier is hashed at rest, can be revoked, and is checked again when the realtime socket joins. The Node dev server now implements the same `/api/guest/session` contract for local parity.
- Guests enter the same shared `city:main` Durable Object as registered players. The server only accepts guest principals into TheCity. Both runtimes use one logical city at capacity 64; clients request `city`, and the server canonicalizes it to `city:main`. Other `city:*` values are rejected before a Durable Object is allocated.
- Server-authored player and chat identity uses `Guest User - [chosen display name]`; the guest flag is not client-controlled.
- Guests can use city chat and nearby chat. Realtime server handlers reject guest DMs, party actions, private voice signalling, and entry into private worlds. Account-only HTTP APIs still require a registered account session.
- Guest sessions are distinct from account sessions and are not silently converted into accounts. Leaving the airport departure flow revokes the guest session.

### HUD integration
- The gameplay HUD reads guest state from the session instead of duplicating it: the menu hides Friends and Messages, the social sheet hides People, party, DMs, wallet, shop, worlds and daily rewards, and the shop is read-only. Guests keep city and nearby chat under their server-authored guest identity.
- The menu keeps travel physical. It no longer offers city/suite teleports or a leave-city button; suite and hallway doors lead through the hotel, and departure is the airport desk, matching the rules below.
- Registered players see the server-allocated suite number and floor in the HUD, hotel terminal, elevator and game map.

### Guest personal room
- Guests can enter their own isolated local room through the hotel's guest entrance; the room is not allocated a public hotel door and does not appear in the resident directory.
- Guest room furniture, surfaces, mood, and avatar changes are saved in a separate browser-local storage key. They are not sent to account suite APIs or exposed as a visitable room.
- Guest rooms cannot receive visitors or invitations. Clearing browser storage or changing devices can remove the local room.
- Guest rooms include built-in closet and bathroom fixtures. Closet interaction opens owned-clothing selection; bathroom mirror and the in-world salon open hair and makeup choices.
- Saved outfit presets are unlimited and currently stored locally on the device.

### Airport and city travel
- TheCity arrival spawn is at the airport.
- The airport has walk-up clothing and departure counters. The clothing counter opens the clothing shop; guests can browse but cannot purchase.
- Leaving TheCity uses the airport's **Take a flight** interaction. Guest departure ends the guest session; registered departure returns to the platform dashboard.
- The M-menu's direct **Travel to Main City** and **Return to Suite** shortcuts have been removed. Guest-room entry is through the physical hotel entrance, not a menu teleport.

### Hotel and registered suites
- The Grand Hotel has been relocated to the edge of TheCity beside the airport.
- Each hotel floor is laid out with ten doors: five on each side of the hallway.
- A server-side allocation table assigns each registered account a stable, unique room index. Room numbers are derived deterministically at ten rooms per floor, starting on residential floor 5; new accounts continue onto additional floors.
- Existing suite owners are backfilled in a stable order by the migration. The Worker also creates the allocation table idempotently for installations using runtime schema setup.

## Remaining work before production release

- Apply and verify migration `0007_hotel_room_allocations.sql` against the target Neon database before deploying the Worker.
- Run end-to-end checks against the actual Cloudflare Worker, Neon database, and Durable Object binding. CI passing does not prove production secrets, migrations, or bindings are configured.
- Verify airport arrival/departure and hotel paths in the supported desktop, installed-app, and Android runtimes, including reconnect and save recovery.
- Run the live guest flow against the deployed Worker. Local parity is covered by the Node guest test and the in-process Worker/DO two-guest test; neither replaces a check against the production Neon database, Durable Object binding, and deployed assets.
- Foundational facial features use the paid **Character Makeover** (250 yuanzi); hair and makeup stay free at the bathroom mirror and salon.
- Saved outfits are account rows and sync across devices; the starter wardrobe is free and unowned pieces cannot be worn.
- Replace the existing sample hotel resident/intercom directory with live account-backed resident availability and invitation permissions.
- Confirm the hotel allocation backfill on a production-like database with existing accounts and verify no duplicate room numbers.

## Verification

The GitHub Actions `verify` workflow runs the repository's test, lint, build, and Cloudflare bundle-validation steps. Local verification for this slice: `npx tsc --noEmit`, `npm test` (including the Node guest test and the in-process Worker/DO two-guest test), `npm run build`, and `npx wrangler deploy --dry-run`. The Worker test uses an in-memory Neon `/sql` stub and WebSocketPair shim, so it exercises the shipping fetch handler and DO code but not workerd or a real database. Do not treat this document as a substitute for testing the deployed environment.
