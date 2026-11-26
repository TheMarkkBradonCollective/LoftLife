# Guest City, airport arrival, and hotel rollout

This document records the implementation state of issue #8. It distinguishes code present in this PR from deployment and product work that still requires verification.

## Implemented in this PR

### Guest access and public landing
- Signed-out visitors see a simple LoftLife landing page with only **Sign In** and **Visit as Guest** as primary actions.
- Guest visitors choose a display name before entry.
- The Worker issues a separate, signed, 12-hour guest token; its session identifier is hashed at rest, can be revoked, and is checked again when the realtime socket joins.
- Guests enter the same shared `city:main` Durable Object as registered players. The server only accepts guest principals into TheCity.
- Server-authored player and chat identity uses `Guest · [chosen display name]`; the guest flag is not client-controlled.
- Guests can use city chat and nearby chat. Realtime server handlers reject guest DMs, party actions, private voice signalling, and entry into private worlds. Account-only HTTP APIs still require a registered account session.
- Guest sessions are distinct from account sessions and are not silently converted into accounts. Leaving the airport departure flow revokes the guest session.

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
- Implement the paid foundational facial-feature makeover service; those features are not exposed in the free bathroom/salon editor.
- Saved outfit presets are device-local today. Account-synced outfits across devices are not implemented yet.
- Replace the existing sample hotel resident/intercom directory with live account-backed resident availability and invitation permissions.
- Confirm the hotel allocation backfill on a production-like database with existing accounts and verify no duplicate room numbers.

## Verification

The GitHub Actions `verify` workflow runs the repository's test, lint, build, and Cloudflare bundle-validation steps. The latest result is shown on PR #9; do not treat this document as a substitute for testing the deployed environment.
