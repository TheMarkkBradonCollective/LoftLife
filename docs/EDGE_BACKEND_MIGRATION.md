# LoftLife edge backend migration

## Production topology

- Cloudflare Worker serves the built client and all HTTP API routes.
- Neon Postgres is the persistent source of truth for accounts, profiles, wallets, ledger entries, inventory, suites, worlds, social graph, reports and chat history.
- Cloudflare Durable Objects own city/world realtime instances, WebSocket sessions, movement snapshots, proximity chat, voice signalling, transit vehicles and global party coordination.
- R2 remains the asset store; static client output is served through the Worker assets binding.

The Worker no longer has a localhost GAME_ORIGIN configured. An unported route must not silently forward traffic to a developer machine.

## Edge routes

The Worker now handles:
- Registration, login, logout, session verification and account suspension checks.
- Account bootstrap: profile, starter suite, starter wardrobe, wallet and welcome ledger grants.
- Profile read/update, public profile lookup and suite viewing.
- Shop catalog, inventory, wallet, ledger history, server-priced purchases and daily rewards.
- Suite save/visibility and world create/list/read/update/delete/state/collaborator/invite/entry routes.
- Friends, requests, blocks, player search, direct-message history and reports.
- Admin report review and account suspension.
- Party state, party actions and cross-instance party notifications.
- Presence aggregation, transit line metadata and realtime transit boarding/exit.
- WebSocket authentication, player poses, snapshots, city/world/local/DM/party chat, voice signalling, party state and transit.

## Durable Object model

The Worker routes city:main to the city object and world instance IDs to their own objects. A separate party:global object coordinates party state and relays party updates/chat across active instances. WebSocket attachments retain authenticated player state across hibernation.

## Neon migrations

- 0002_game_domain.sql creates the game-domain tables.
- 0003_account_moderation.sql adds ll_accounts.suspended_until.

Both migrations have been applied to the LoftLife Neon main branch. Existing local SQLite data is not automatically copied; Neon is the active persistent backend for new edge registrations and requests.

## Required production secrets

Set these as Worker secrets (never commit values):
- DATABASE_URL: Neon connection string for the loftlife database and loftlife_app role.
- LOFTLIFE_SESSION_SECRET: random signing secret with at least 32 characters.

## Build and verification

The repository CI runs npm ci, npm test, npm run lint, npm run build, and npx wrangler@4 deploy --dry-run --outdir .wrangler-out.

A dry run validates the Worker bundle; it does not publish a Worker. Production deployment is still a separate operation and must happen only after the two Worker secrets are set and the Worker is published with its Durable Object migration.