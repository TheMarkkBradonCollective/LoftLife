# LoftLife Discord Community Integration

_Status: Official Discord server created; integration is not yet connected._

**Community invite:** https://discord.gg/X4nADtJxK

## Goal

Create one official **LoftLife Official** Discord server that acts as the community hub outside the game. Approved player-created cities can receive their own private Discord category inside that server. This is a shared community system, not a separate Discord server for every city.

Discord is optional. LoftLife's in-game chat, DMs, parties, and social features remain available and are not replaced by Discord.

## Product experience

### Official server structure

- **WELCOME & COMMUNITY** — welcome, rules, announcements, introductions, community chat, suggestions, polls.
- **LOFTLIFE UPDATES** — game updates, patch notes, known issues, bug reports, feature requests, sneak peeks.
- **SOCIAL & EVENTS** — screenshots, outfit showcases, world showcases, event listings, find-friends.
- **HELP & SAFETY** — support, account-linking help, report guidance, moderation information.
- **LOFTLIFE STAFF** — private platform staff channels and audit/moderation coordination.

### City category template

When an eligible city owner requests and receives an approved Discord space, the bot creates a category such as `CITY • Los Angeles` with a starter set:

- `#city-announcements` — owner and authorized city staff can post; city members can read.
- `#city-chat` — city members.
- `#events` — city events and notices.
- `#staff-room` — city owner and assigned staff only.
- `#applications` — optional, if the city uses applications.
- `#reports` — optional private intake channel or, preferably, a bot-created private report thread/ticket flow.

The template should be configurable by the city owner within platform limits. Keep the default small and useful; do not create empty channels for every possible use.

## Roles and permission boundaries

### Platform roles

- LoftLife Administration — platform-wide oversight and emergency support.
- LoftLife Moderator — platform-wide community moderation, not automatic ownership of city operations.
- Verified LoftLife Member — linked and verified game account.
- Guest — Discord member who has not linked a LoftLife account.

### Per-city roles

- City Owner
- City Co-Owner / Administrator
- City Moderator / Staff
- City Member

City roles are scoped to one city. A city owner can manage that city's channels and assign city staff, but cannot:
- edit the official server's global roles or channels;
- manage another city's category, members, or roles;
- grant themselves platform administrator privileges;
- override LoftLife account bans or platform-level safety restrictions.

Platform staff access should be narrowly granted, logged, and used for safety/support rather than routine city management. Do not make every platform staff member a Discord server administrator.

## Membership and account linking

1. A player optionally links Discord from LoftLife account settings using Discord OAuth2 authorization-code flow.
2. LoftLife stores the Discord user ID and provider-link metadata securely; never store a Discord password.
3. The bot verifies the linked account and assigns the baseline member role.
4. When a player joins a city in LoftLife, the integration queues a role/channel permission sync for that city's Discord role.
5. When a player leaves, is removed, or loses city membership, the city-specific role and access are revoked.
6. Unlinking Discord removes integration-managed roles and access without deleting the LoftLife account.
7. Discord outages or rate limits must not block game login, city entry, or gameplay. Sync jobs retry safely and expose a pending/error state to admins.

Do not automatically invite every game player to Discord or require Discord to play.

## City lifecycle

- **Eligibility:** only an active, approved player-created city with a valid owner can request a category. Platform moderation can suspend the integration for a city.
- **Creation:** an idempotent bot job creates the category, starter channels, permission overwrites, and city roles; resulting Discord IDs are saved against the LoftLife city ID.
- **Owner transfer:** update owner permissions only after the authoritative LoftLife ownership change succeeds.
- **Rename:** update category display name safely; retain stable internal city ID mapping.
- **Member changes:** event-driven sync with a retry queue; periodic reconciliation repairs missed events.
- **Closure/deletion:** revoke member access immediately, then archive or remove the category according to a documented retention policy. Do not silently delete city history.
- **Category capacity:** Discord categories have channel-count limits. Enforce a template cap and offer controlled channel management rather than allowing unlimited channel creation.

## Technical architecture

Use the existing LoftLife stack and account/city authority:

- **Game backend:** existing Node/Express API and database remain the source of truth for accounts, city ownership, membership, and platform roles.
- **Cloudflare Worker:** may authenticate account-link callbacks and relay approved integration requests, but must not expose bot credentials.
- **Neon/Postgres:** production persistence for Discord link records, city-to-Discord mappings, sync jobs, and audit events. Keep local SQLite development behavior compatible where practical.
- **Discord bot service:** a separately deployed, long-running bot worker/service using the official Discord API. It receives only authenticated, signed jobs from LoftLife. Never put the bot token in browser code, Vite variables, the repository, or client-visible Worker responses.
- **Queue/outbox:** write membership/ownership changes and sync events transactionally (outbox pattern); process idempotently with retries and backoff.
- **Reconciliation:** scheduled job compares desired LoftLife state with bot-managed Discord roles/overwrites and repairs drift.
- **Observability:** structured logs, job status, retry counts, Discord API error handling, and an admin-visible integration health state.

### Suggested data records

- `discord_account_links`: LoftLife user ID, Discord user ID, linked timestamp, status, OAuth scopes/metadata (no access token unless required; encrypt any refresh token).
- `discord_guild_config`: official guild ID and configured global role/channel IDs.
- `discord_city_spaces`: LoftLife city ID, Discord category ID, channel IDs, role IDs, lifecycle status, created/updated timestamps.
- `discord_sync_jobs`: event type, target user/city, idempotency key, attempts, status, next retry, sanitized error.
- `discord_audit_events`: actor, action, city/user reference, timestamp, outcome; avoid storing message content.

## Security, privacy, and safety requirements

- Enforce city membership and role authorization from LoftLife's database, never from client-supplied role names or Discord display names.
- Use least-privilege Discord bot permissions. The bot needs only the permissions required to manage its designated roles, categories, channels, and member role assignments.
- Keep bot-managed roles below platform staff roles in Discord's role hierarchy.
- Validate and normalize city names; prevent mentions, impersonation, mass-pings, and malformed channel names.
- Prevent cross-city visibility by default-denying @everyone on private city categories and explicitly granting only the intended roles.
- Test permission overwrites for owner, staff, member, non-member, guest, banned player, and platform moderator cases.
- Rate-limit owner channel/role operations and enforce category/channel quotas.
- Log permission and ownership changes. Never log OAuth secrets, bot tokens, or private message content.
- Provide reporting and moderation escalation paths. Discord moderation does not replace in-game reporting or platform enforcement.

## Delivery phases

### Phase 0 — Prerequisites
- Create the official Discord server.
- Create a Discord Developer Portal application and bot.
- Configure OAuth redirect URI and bot invite permissions.
- Store Discord client secret and bot token in deployment secrets.
- Confirm the server owner/admin has authorized the bot and configured its role hierarchy.

### Phase 1 — Official community foundation
- Publish the official channel and role structure.
- Implement Discord OAuth account linking and unlinking.
- Add a basic bot health check and safe server configuration.
- Add tests for token secrecy, callback validation, and account-link uniqueness.

### Phase 2 — City spaces
- Add city-space schema and idempotent category/channel/role provisioning.
- Add the starter category template and private permission overwrites.
- Add owner transfer, rename, suspend, archive, and delete lifecycle handling.
- Add city owner controls in LoftLife for requesting and managing the space.

### Phase 3 — Membership synchronization
- Sync city membership and staff roles through the outbox/retry queue.
- Add reconciliation and admin-visible job status.
- Test join/leave/kick/ban/unlink/owner-transfer and Discord outage scenarios.

### Phase 4 — Community enhancements
- Publish game status, patch notes, and event announcements.
- Add optional event reminders and city discovery links.
- Consider a safe support-ticket/report workflow after core permissions are proven.

## Acceptance criteria

- One official Discord server supports many independently permissioned city categories.
- A member of City A cannot view City B's private channels unless separately authorized.
- City owners can manage only their own city's permitted resources.
- Membership changes in LoftLife reliably grant/revoke Discord access, including after retries and reconciliation.
- Discord downtime never blocks game authentication or gameplay.
- No bot token or OAuth secret is shipped to the client or committed to Git.
- Account unlinking, city closure, owner transfer, and platform moderation have tested, auditable outcomes.
- The feature can be disabled safely without affecting core LoftLife social systems.

## Current implementation status

No live Discord server, bot application, OAuth credentials, or Discord integration is configured in the repository yet. This document records the intended product and technical design. Actual provisioning and end-to-end testing require the official server and credentials to be created and authorized by the LoftLife owner.
