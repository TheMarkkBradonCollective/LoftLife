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
| 10 | Testing and launch preparation | **Partial** — 19 integration tests, code splitting; no CI, no load testing |

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

Ordered by player-visible value per unit of risk.

1. **Server-side collision** (Phase 7/10). Move walkability to the server using the existing
   `cityLayout` data exported as a shared manifest, then reject blocked moves. This is the honest
   fix for movement cheating, and it also enables anti-cheat for vehicles.
2. **Earned income loop** (Phase 8). Shifts at city businesses, deliveries, or activity rewards —
   designed with the economy owner before implementation, because it sets the pace of the game.
3. **Suite guest visits through the hotel door** (Phase 4). Owned suites are account-scoped; the
   door should open the owner's suite for a visitor instead of routing through the worlds system.
4. **TURN relay for voice** (Phase 5). The mesh currently relies on a public STUN server; symmetric
   NATs need a TURN service, which costs money and needs an ops decision.
5. **Unity 6 client spike** (Phase 9). Prove the existing REST + WS protocol from a Unity scene with
   one avatar, one chat channel, one party and one tram ride before building content. Do not fork the
   data model.
6. **CI + load testing** (Phase 10). `npm test` + `tsc` + build on every PR; a k6/artillery scenario
   for 200 concurrent sockets to find the real instance ceiling.
7. **Custom assets** (Phase 6). Only after the validation/moderation/storage design above.

## Definition of done for the final acceptance goal

The fifteen-step acceptance list in the project directive requires all of: accounts, character,
persistent city, hotel, owned room, meeting players, messaging **and voice**, exploration, transit,
shopping, two currencies, world creation, invitations and collaboration, visiting others' worlds, and
cross-platform progress. Today the build satisfies accounts, character persistence, city and hotel
exploration, owned and decorated suites, meeting other players in real time, messaging, proximity
voice, rideable transit, shopping, both currencies, world creation/permissions/visiting,
collaboration, party chat and mobile controls.

Still genuinely open: **cross-platform Unity clients**, **custom uploaded assets**, **server-side
collision** and **an earned-income economy loop**. None of those are claimed as working.
