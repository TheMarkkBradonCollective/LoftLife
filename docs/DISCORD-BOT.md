# LoftLife Discord — One-Bot Architecture

The official LoftLife Discord bot is intended to replace separate utility bots with one integrated system. The Cloudflare Worker remains the signed Discord interactions endpoint and performs Discord REST operations. A companion Node.js Gateway service is required for persistent Discord Gateway events and voice connections; Cloudflare Workers cannot maintain a Discord voice session.

## Components
- **Cloudflare Worker (`loftlife-discord`)**: slash-command interactions, role/channel provisioning and Discord REST operations.
- **Gateway service (`discord-bot/`)**: member join events, voice-state events, temporary voice channels, anti-spam events and Discord voice playback.
- **Shared bot application**: both components use the same Discord application/bot identity. The bot token is stored only as a deployment secret and must never be committed.

## Gateway foundation in this branch
- Automatically grants `LoftLife Member` when a new member joins (when that role exists).
- Join-to-Create: joining `➕ Create a Room` in `voice-lounges` creates a temporary voice room and moves the member into it.
- Empty temporary rooms are deleted.
- Basic rapid-message anti-spam deletes the triggering message, applies a short timeout and logs the action.
- Authenticated control API for music play/pause/resume/skip/stop and temporary-room rename.
- Music accepts HTTPS direct audio-stream URLs only. It does not download or rip copyrighted tracks from video platforms. Use licensed streams or audio you have permission to play.

## Railway deployment path

The Gateway can be deployed as a persistent Railway service from this feature branch:

1. In Railway, create a project and choose **Deploy from GitHub Repo**.
2. Select `TheMarkkBradonCollective/LoftLife` and branch `feature/loftlife-discord-all-in-one`.
3. Set the service Root Directory to `/discord-bot`. Railway will detect the Dockerfile in that directory.
4. Add the required variables in Railway's Variables tab: `DISCORD_BOT_TOKEN`, `GUILD_ID`, and `CONTROL_SECRET`. Use the existing bot token only in Railway's secret field; never paste it into chat or commit it. Generate a separate long random value for `CONTROL_SECRET`.
5. Deploy the service and wait for the deployment to become healthy. Check `/health` on its generated Railway domain.
6. Copy the service's HTTPS domain into the Cloudflare Worker variable `BOT_CONTROL_URL`, and set `BOT_CONTROL_SECRET` to the same value as the Gateway's `CONTROL_SECRET`. Keep both values private.
7. Test Join-to-Create and music in a private test voice channel before announcing them.

**Voice-network check:** Railway supports persistent services and Dockerfile deployments, but successful Discord voice playback also depends on outbound UDP connectivity to Discord's voice servers. The first deployment must be tested for a complete voice connection; a healthy HTTP `/health` response alone does not prove voice works. If UDP voice setup fails, stop and reassess the host rather than claiming music is operational.

## Deployment requirements
Run this service on an always-on Node.js host that supports outbound WebSocket connections. It is not deployed as a Cloudflare Worker. Configure variables from `discord-bot/.env.example`; set `CONTROL_SECRET` to a long random value and keep it private. Enable the Server Members, Guild Voice States and Message Content intents in the Discord Developer Portal. Grant only required permissions: View Channels, Manage Channels, Move Members, Connect, Speak, Send Messages, Manage Messages and Moderate Members.

The Cloudflare Worker needs `BOT_CONTROL_URL` and `BOT_CONTROL_SECRET` before its interaction handlers can call this service. Never expose either value in client code or Discord messages.

## Planned modules
1. Moderation: warning history, configurable AutoMod rules, timeouts, bans, message cleanup, audit log and appeals.
2. Community onboarding: welcome messages, verified/member roles, self-assignable interest roles, account linking and onboarding checks.
3. Support: private tickets, report intake, staff assignment, close/reopen and transcript retention controls.
4. Voice: Join-to-Create, owner controls, temporary room cleanup, voice activity and music lounges.
5. Music: queue, pause/resume/skip/stop, now-playing state and permitted audio sources.
6. LoftLife integration: account linking, player/city membership synchronization, per-city Discord categories and event/status announcements.

## Current boundaries
This is source code on a feature branch, not a live deployment. The Gateway service is not yet connected to the live Worker. Do not advertise music playback, automatic join roles or Join-to-Create as live until the service is deployed, secrets are configured, intents are enabled and the features are tested. Existing Worker role-button onboarding and `/update` remain separate and active.
