# LoftLife — Roadmap

Status legend: **Done** (implemented and verified) · **Partial** (real functionality, notable gaps) ·
**Not started**.

## Where we are

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Repository audit, architecture, roadmap | **Done** — [AUDIT.md](AUDIT.md), [ARCHITECTURE.md](ARCHITECTURE.md) |
| 2 | Accounts, identity, persistence, multiplayer readiness | **Done** |
| 3 | Character creation, wardrobe, saved outfits, persistence | **Done** — studio locks unowned clothing and shows its server price |
| 4 | Hotel navigation, personal room, furniture, guest access | **Partial** — navigation/decoration/visibility done; suite guest visits go through worlds, not the hotel door |
| 5 | Social: friends, messaging, presence, synchronised interaction | **Done** — friends, DMs, city/world/party chat, proximity text, proximity voice, presence, movement sync |
| 6 | Building, ownership, permissions, collaboration, publishing | **Partial** — create/decorate/publish/5 access modes/collaborators. Advanced piece-level construction and custom assets not started |
| 7 | Main City, transportation, vehicles, interactive locations | **Done** — city, ambient traffic, two rideable LoftLine routes with server-assigned seats |
| 8 | Economy: Yuanzi, Tongbao, wallets, transactions, shops | **Partial** — wallets, ledger, purchases, daily reward. No earned income loop from activities, no player trading |
| 9 | Cross-platform (browser / Windows / Android, Unity 6) | **Partial** — the web client is responsive with dedicated touch controls; the protocol is documented for a Unity client, which is not started |
| 10 | Testing and launch preparation | **Partial** — 112 tests, CI checks and Cloudflare deployment workflow are active; commit `262e285` is deployed. Live two-client guest validation against Neon/Durable Objects, migration verification and load testing remain open |

## Deliberately not done, because it needs a decision

These affect money or player trust, so they are proposed rather than implemented:

1. **Earning rates and prices.** The current 元500 starting balance and prices (元35–340) are
   placeholders chosen for a sensible first session. Real balance tuning needs playtesting data.
2. **Any exchange rate between Yuanzi and Tongbao.** None exists. Do not invent one casually — a
   wrong rate either trivialises the premium currency or gates progress.
3. **Real-money purchase or monetisation rules.** Not implemented, not designed. This needs an
   explicit product decision plus regional legal review before any code is written.
4. **Custom asset support.** Uploaded models/materials need a validation pipeline (poly budget,
   texture limits, licence attestation), moderation, and a storage cost model before the feature can
   be honest.

## Recommended next sequence

Ordered by launch risk first, then player-visible value.

1. **Live production acceptance test** (Phase 10). Verify guest session create/revoke, two separate
   clients joining the same `city:main`, mutual presence, city/nearby chat, private-world and
   account-feature rejection, and the 65th join receiving `instance_full`. Verify guest expiry and
   reconnect behavior against the deployed Worker, real Neon database and Durable Object.
2. **Choose the full-city experience** (Phase 2/10). The current limit is 64 in one shared city.
   Recommended direction: a waiting lobby/queue that admits players when a slot opens, rather than
   silently splitting TheCity into numbered shards. This is a product/architecture decision; no
   queue is implemented yet.
3. **Guest identity presentation** (HUD). The server identity is `Guest User - [display name]`.
   The HUD was intentionally left untouched during the parity slice; align its remaining guest
   display in a separate UI change after reviewing the visible locations.
4. **Server-side collision** (Phase 7/10). Move walkability to the server using the existing
   `cityLayout` data exported as a shared manifest, then reject blocked moves. This also enables
   anti-cheat for vehicles.
5. **Suite guest visits through the hotel door** (Phase 4). Owned suites are account-scoped; the
   door should open the owner's suite for a visitor instead of routing through the worlds system.
6. **Earned income loop** (Phase 8). Shifts at city businesses, deliveries, or activity rewards —
   design the earning rates and rewards before implementation.
7. **TURN relay for voice** (Phase 5). The mesh currently relies on a public STUN server; symmetric
   NATs need a TURN service, which requires an operating-cost decision.
8. **Unity 6 client spike** (Phase 9). Prove the existing REST + realtime protocol from a Unity
   scene with one avatar, one chat channel, one party and one tram ride before building content.
9. **Load testing** (Phase 10). Add a repeatable 200-client socket scenario after the live
   two-client acceptance test; measure the real Durable Object ceiling and tune capacity from data.
10. **Custom assets** (Phase 6). Only after validation, moderation and storage-cost design is agreed.

