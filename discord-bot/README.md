# LoftLife Discord Bot (starter)

This is the first deployable bot slice for the official LoftLife Discord server.

## What it does

- Registers `/setup` and `/city-create` as server-scoped slash commands.
- `/setup` is idempotent for the official categories/channels and baseline roles.
- `/city-create name:` creates a private city category with city-scoped owner/staff/member roles and a small channel template.
- Both commands are restricted to Discord server administrators. This is intentionally an owner-operated bootstrap, not yet connected to LoftLife's city database.

## Required setup

1. Use Node.js 20 or newer.
2. In Discord Developer Portal, enable the bot and invite it with scopes `bot` and `applications.commands`.
3. Grant only the permissions needed for this first slice: View Channels, Send Messages, Read Message History, Manage Channels, and Manage Roles. Never grant Administrator.
4. Put the bot role above the city roles it must create/manage, but below human platform staff roles.
5. Copy `.env.example` values into your host's secret manager:
   - `DISCORD_BOT_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `DISCORD_GUILD_ID`
6. Install dependencies with `npm install` inside this folder and run `npm start`.

Do not put real tokens in this repository, chat, screenshots, or client-side environment variables.

## First use

Run `/setup` in the official server as the server owner/admin. Inspect the created channels and permission overwrites before opening invitations broadly. Then use `/city-create name:` only for test cities whose owners and members you have already approved.

## Important limitations

- This bootstrap does not yet sync LoftLife accounts, city ownership, or membership. Do not assign city roles based on a Discord nickname or an unverified claim.
- The city command is deliberately administrator-only until the authenticated LoftLife API, approval flow, audit log, and role assignment checks are implemented.
- The bot does not read message content and does not require the Message Content intent.
- Discord is optional and must never block game login or gameplay.
