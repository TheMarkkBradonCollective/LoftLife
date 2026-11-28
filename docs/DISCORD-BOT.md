# LoftLife Discord — One-Bot Architecture

The official LoftLife Discord bot combines community automation, temporary voice rooms, moderation foundations and music playback under one Discord application.

## Components

- **Existing Cloudflare Worker (`loftlife-discord`)**: signed Discord interactions, slash commands, role/channel provisioning and Discord REST operations.
- **Cloudflare Container Worker (`loftlife-discord-gateway`)**: persistent Node.js Discord Gateway connection, Join-to-Create events, temporary-room cleanup, moderation events and voice playback.
- **Container image (`discord-bot/`)**: the Node.js process packaged as a Docker image and run by Cloudflare Containers.
- **Secrets**: `DISCORD_BOT_TOKEN` and `CONTROL_SECRET` are Cloudflare Worker secrets. They are passed into the container at startup and never committed.

The game Worker named `loftlife` is separate and must not be overwritten.

## Features implemented in this branch

- Automatically grants `LoftLife Member` when a new member joins (when that role exists).
- Join-to-Create: joining `➕ Create a Room` in `voice-lounges` creates a temporary voice room and moves the member into it.
- Empty temporary rooms are deleted.
- Basic rapid-message anti-spam deletes the triggering message, applies a short timeout and logs the action.
- Music playback joins the voice channel of the member who runs `/music play`; users no longer have to select a channel.
- Music controls: `/music play`, `pause`, `resume`, `skip`, and `stop`. Tracks queue while one is playing.
- `/voice rename` lets the temporary room owner rename their room.

## Music source and playback boundary

`/music play` currently accepts a direct HTTPS audio-stream URL that responds with an audio content type. The bot does not extract or rip audio from video/music platform pages, and a normal webpage or track-page URL will not play. Use an audio stream you own or are authorized to play. Search-by-song-name and commercial streaming-service integrations are not implemented in this version.

## Cloudflare Containers deployment

Cloudflare Containers runs the Gateway's existing Docker image. The separate Worker in `discord-bot/cloudflare/worker.ts` routes authenticated control requests to one Durable Object-backed container.

### Configure secrets

From the `discord-bot` directory, set the two secrets on the new Worker (never commit or paste them into chat):

```sh
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put CONTROL_SECRET
```

Use the existing Discord bot token only in the secret prompt. Generate a separate long random value for `CONTROL_SECRET`. The `GUILD_ID` is already configured in `wrangler.jsonc`.

### Deploy

Prerequisites: Docker must be running locally and Wrangler must be available.

```sh
cd discord-bot
npx wrangler deploy
```

Wrangler builds and pushes the Docker image with the Worker. The first container may take several minutes to provision. Check its health at the deployed Worker URL plus `/health`.

The Worker uses a six-hour inactivity timeout and a five-minute scheduled health request to keep the Gateway process available. The container starts as `basic` (1 GiB memory) to give the Node.js Discord client and audio processing more headroom. The Durable Object scheduling policy does not support `max_instances`; concurrency is controlled by the single named Durable Object instance in this design. Cloudflare can still stop active containers for host maintenance or other platform events; the bot must reconnect when the container restarts. Cloudflare does not guarantee uninterrupted container uptime.

### Connect the existing interaction Worker

After the Gateway Worker deploys:

1. Set `BOT_CONTROL_URL` on the existing `loftlife-discord` Worker to the new Gateway Worker URL.
2. Set `BOT_CONTROL_SECRET` on `loftlife-discord` to exactly the same private value used for the Gateway Worker's `CONTROL_SECRET`.
3. Keep both values in Cloudflare secret/variable storage; never put them in frontend code or Discord messages.
4. Register the updated slash commands by running the existing `/update` command as a server administrator.
5. Test Join-to-Create and permitted audio playback in a private test voice channel.

The Gateway container needs outbound internet access for Discord Gateway WebSockets and voice UDP. A successful `/health` response only proves the HTTP process is ready; it does not prove Discord voice networking works. Complete an actual voice-channel test before treating music as live.

## Discord permissions and intents

Enable Server Members, Guild Voice States and Message Content privileged intents in the Discord Developer Portal. Grant the bot only the permissions required for the enabled features: View Channels, Manage Channels, Move Members, Connect, Speak, Send Messages, Manage Messages and Moderate Members.

## Current boundaries

This is source code on a feature branch, not a live deployment. The Gateway Container has not been deployed or connected to the live interaction Worker. Do not advertise Join-to-Create or music as live until deployment, secret configuration, command registration and live voice testing are complete.

## Planned modules

1. Moderation: warning history, configurable AutoMod rules, timeouts, bans, message cleanup, audit log and appeals.
2. Community onboarding: welcome messages, verified/member roles, self-assignable interest roles, account linking and onboarding checks.
3. Support: private tickets, report intake, staff assignment, close/reopen and transcript retention controls.
4. Voice: Join-to-Create, owner controls, temporary room cleanup and music lounges.
5. Music: queue, pause/resume/skip/stop and permitted audio sources.
6. LoftLife integration: account linking, player/city membership synchronization, per-city Discord categories and event/status announcements.
