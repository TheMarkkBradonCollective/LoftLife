# Guest City, airport arrival, and hotel rollout

This document breaks issue #8 into implementation gates. It is deliberately a planning artifact, not a claim that guest play or airport travel is implemented.

## Current constraints found on main

- PlatformApp routes guests only to the signed-in dashboard flow; GameHost requires an account session for TheCity.
- AuthGate offers account sign-in/registration and local offline play, not a shared guest identity.
- The session provider has only anonymous/online/offline account states.
- The realtime gateway authenticates WebSocket connections through account tokens and uses account IDs for chat, presence, blocking, and party operations.
- City chat is currently part of the authenticated realtime protocol. A browser-only guest flag would therefore be insecure and would not create a true shared visitor.
- Hotel placement and room allocation are part of the Three.js city builder; room persistence/permissions are account-backed.

## Required implementation sequence

### 1. Server-authoritative guest identity (blocking foundation)
- Add short-lived guest sessions with cryptographically random opaque tokens, hashed at rest, expiry, revocation, and rate limits.
- Validate and normalize the guest-selected display name on the server.
- Expose a distinct guest principal (kind: guest) that can join only the public TheCity instance.
- Include guest identity and immutable guest status in realtime player/presence/chat payloads.
- Permit public city chat only. Reject DMs, party/group messaging, friend operations, profile/account APIs, private worlds, suite APIs, purchases, and room invitations at the server boundary.
- Ensure guest tokens cannot be interpreted as account tokens and cannot be upgraded into accounts.

### 2. Client session and public landing
- Add a signed-out landing screen with only Sign In and Visit as Guest.
- Sign In opens the existing account auth flow.
- Visit as Guest asks for a display name, obtains a server guest token, and enters TheCity using the same shared city realtime instance as registered players.
- Render names as [chosen name] · Guest above avatars and in public chat.
- Keep account-only dashboard navigation and actions unavailable to guests.

### 3. Guest-local room persistence
- Separate guest-local room/character keys from account suite keys.
- Persist only in local browser/device storage; never call suite/world save APIs for guests.
- Do not allocate a public hotel door or permit room visits/invites for guest rooms.
- Keep local room fixtures (closet/bathroom) while retaining existing customization rules.
- Explain that clearing browser data or changing devices can remove a guest room.

### 4. Airport travel and city layout
- Add airport arrival and departure interaction points; entering TheCity starts at arrivals and leaving uses airport departure.
- Remove M-menu and shortcut exits that bypass departure, while retaining disconnect/recovery handling.
- Remove suite/main-city jump-spawn buttons and teleport shortcuts.
- Move the hotel near the airport and connect it to walkable streets/map navigation.
- Add an in-world airport clothing shop.
- Ensure arrival/departure save and reconnect paths are safe.

### 5. Registered resident hotel allocation
- Add a deterministic account-to-room allocation model: 10 rooms per floor, five on each side, unique and stable per account.
- Add floors as required.
- Enforce room ownership and visitor permissions on the backend.
- Preserve current account suite save and invite behavior.

## Acceptance tests before merge
- Guest token expiry/revocation, malformed names, rate limits, and token/role spoofing.
- Guest and account players appear together in one live city instance.
- Guest public chat is attributed to the chosen name plus server-owned Guest status.
- Guest DM, party, friend, profile, private-world, suite, purchase, and invite attempts are denied server-side.
- Guest room save survives refresh on the same browser and never reaches account APIs or public hotel listings.
- Account room allocation is stable, unique, and correctly rolls over to new floors.
- Arrival/departure flow handles reconnects without silently teleporting or losing saved state.
- Existing account auth, world permissions, camera/movement, four-wall rooms, voice, offline-first behavior, and all supported runtimes remain intact, including mobile-browser gameplay.
- Full test, lint, typecheck (if configured), build, and Cloudflare validation pass; document which checks were run.

## PR boundary
This PR is a planning/scaffolding change only. It does not implement guest authentication, guest gameplay, the landing page, airport interactions, or hotel relocation. Those changes must be delivered in code with tests in follow-up implementation commits/PRs.