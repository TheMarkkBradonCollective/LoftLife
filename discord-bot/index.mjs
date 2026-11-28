import express from 'express';
import { Readable } from 'node:stream';
import { Client, GatewayIntentBits, ChannelType, PermissionsBitField } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior, entersState, VoiceConnectionStatus, getVoiceConnection, StreamType } from '@discordjs/voice';
import ffmpegPath from 'ffmpeg-static';

if (ffmpegPath) process.env.FFMPEG_PATH = ffmpegPath;
for (const key of ['DISCORD_BOT_TOKEN', 'GUILD_ID', 'CONTROL_SECRET']) {
  if (!process.env[key]) throw new Error('Missing required environment variable: ' + key);
}
const GUILD_ID = process.env.GUILD_ID;
const CREATE_CHANNEL_NAME = process.env.CREATE_VOICE_CHANNEL_NAME || '➕ Create a Room';
const VOICE_CATEGORY_NAME = process.env.VOICE_CATEGORY_NAME || 'voice-lounges';
const MEMBER_ROLE_NAME = process.env.MEMBER_ROLE_NAME || 'LoftLife Member';
const LOG_CHANNEL_NAME = process.env.MOD_LOG_CHANNEL_NAME || 'integration-logs';
const PORT = Number(process.env.PORT || 8788);
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const roomsByOwner = new Map();
const players = new Map();
const queues = new Map();
const spam = new Map();

async function log(guild, message) {
  const channel = guild.channels.cache.find(c => c.name === LOG_CHANNEL_NAME && c.isTextBased());
  if (channel) await channel.send({ content: message.slice(0, 1900) }).catch(() => {});
}
async function guildFor(id = GUILD_ID) {
  const guild = await client.guilds.fetch(id);
  await guild.channels.fetch();
  return guild;
}
function requireControl(req, res, next) {
  if (req.header('authorization') !== 'Bearer ' + process.env.CONTROL_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
}
function audioPlayer(guildId) {
  if (!players.has(guildId)) {
    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } });
    player.on(AudioPlayerStatus.Idle, () => {
      const q = queues.get(guildId) || [];
      const next = q.shift();
      if (next) fetch(next.url).then(r => { if (r.ok && r.body) player.play(createAudioResource(Readable.fromWeb(r.body), { inputType: StreamType.Arbitrary })); }).catch(e => console.error('Queued audio error:', e.message));
      else queues.set(guildId, []);
    });
    player.on('error', error => console.error('Audio player error:', error.message));
    players.set(guildId, player);
  }
  return players.get(guildId);
}

client.once('ready', async () => {
  console.log('LoftLife Gateway online as ' + client.user.tag);
  const guild = await guildFor();
  console.log('Connected to ' + guild.name + ' (' + guild.id + ')');
});
client.on('guildMemberAdd', async member => {
  if (member.guild.id !== GUILD_ID) return;
  const role = member.guild.roles.cache.find(r => r.name === MEMBER_ROLE_NAME);
  if (role) await member.roles.add(role, 'LoftLife automatic member onboarding').catch(e => log(member.guild, 'Auto-role failed for ' + member.user.tag + ': ' + e.message));
});
client.on('voiceStateUpdate', async (before, after) => {
  if (after.guild.id !== GUILD_ID) return;
  const guild = after.guild;
  if (after.channel?.name === CREATE_CHANNEL_NAME && before.channelId !== after.channelId) {
    try {
      const category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === VOICE_CATEGORY_NAME);
      if (!category) return log(guild, 'Join-to-Create skipped: category "' + VOICE_CATEGORY_NAME + '" was not found.');
      const memberRole = guild.roles.cache.find(r => r.name === MEMBER_ROLE_NAME);
      const permissionOverwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.Connect] },
        { id: after.member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.MoveMembers, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak] }
      ];
      if (memberRole) permissionOverwrites.push({
        id: memberRole.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak]
      });
      const room = await guild.channels.create({
        name: (after.member.displayName + "'s room").slice(0, 95),
        type: ChannelType.GuildVoice,
        parent: category.id,
        permissionOverwrites,
        reason: 'LoftLife Join-to-Create'
      });
      roomsByOwner.set(room.id, after.member.id);
      await after.setChannel(room, 'LoftLife temporary voice room');
      await log(guild, 'Created temporary voice room "' + room.name + '" for ' + after.member.user.tag + '.');
    } catch (error) {
      await log(guild, 'Join-to-Create error: ' + error.message);
    }
  }
  const old = before.channel;
  if (old && roomsByOwner.has(old.id) && old.members.size === 0) {
    roomsByOwner.delete(old.id);
    await old.delete('LoftLife temporary room is empty').catch(() => {});
  }
});
client.on('messageCreate', async message => {
  if (message.guildId !== GUILD_ID || message.author.bot || !message.member) return;
  const now = Date.now();
  const recent = (spam.get(message.author.id) || []).filter(t => now - t < 6000);
  recent.push(now);
  spam.set(message.author.id, recent);
  if (recent.length >= 7 && !message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    await message.delete().catch(() => {});
    await message.member.timeout(60000, 'LoftLife anti-spam: message rate limit').catch(() => {});
    await log(message.guild, 'AutoMod timed out ' + message.author.tag + ' for rapid repeated messaging.');
    spam.delete(message.author.id);
  }
});

const app = express();
app.use(express.json({ limit: '16kb' }));
app.get('/health', (_req, res) => res.json({ ok: client.isReady(), bot: client.user?.tag || null, guildId: GUILD_ID }));
app.use('/control', requireControl);
app.post('/control/music/:action', async (req, res) => {
  const action = req.params.action;
  const body = req.body || {};
  const guildId = body.guildId || GUILD_ID;
  try {
    const guild = await guildFor(guildId);
    const player = audioPlayer(guildId);
    if (action === 'play') {
      if (!body.voiceChannelId || !body.url) return res.status(400).json({ error: 'voiceChannelId and a direct audio-stream URL are required' });
      const parsed = new URL(body.url);
      if (parsed.protocol !== 'https:') return res.status(400).json({ error: 'Only HTTPS audio URLs are accepted' });
      const channel = await guild.channels.fetch(body.voiceChannelId);
      if (!channel?.isVoiceBased()) return res.status(400).json({ error: 'Voice channel not found' });
      const connection = joinVoiceChannel({ channelId: channel.id, guildId, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true });
      await entersState(connection, VoiceConnectionStatus.Ready, 15000);
      const queue = queues.get(guildId) || [];
      if (player.state.status !== AudioPlayerStatus.Idle) {
        queue.push({ url: body.url });
        queues.set(guildId, queue);
        return res.json({ ok: true, queued: queue.length });
      }
      const audioResponse = await fetch(body.url);
      if (!audioResponse.ok || !audioResponse.body) return res.status(502).json({ error: 'Audio stream could not be opened' });
      const audioType = audioResponse.headers.get('content-type') || '';
      if (!audioType.startsWith('audio/') && !audioType.includes('ogg')) return res.status(415).json({ error: 'URL must return a direct audio stream' });
      player.play(createAudioResource(Readable.fromWeb(audioResponse.body), { inputType: StreamType.Arbitrary }));
      connection.subscribe(player);
      return res.json({ ok: true, playing: true });
    }
    if (action === 'pause') return res.json({ ok: player.pause() });
    if (action === 'resume') return res.json({ ok: player.unpause() });
    if (action === 'skip') { player.stop(true); return res.json({ ok: true }); }
    if (action === 'stop') {
      player.stop(true);
      queues.set(guildId, []);
      getVoiceConnection(guildId)?.destroy();
      return res.json({ ok: true });
    }
    return res.status(404).json({ error: 'Unknown music action' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
app.post('/control/voice/rename', async (req, res) => {
  try {
    const guild = await guildFor(req.body?.guildId || GUILD_ID);
    const channel = await guild.channels.fetch(req.body?.channelId);
    if (!channel?.isVoiceBased() || !roomsByOwner.has(channel.id)) return res.status(404).json({ error: 'LoftLife temporary room not found' });
    if (roomsByOwner.get(channel.id) !== req.body?.ownerUserId) return res.status(403).json({ error: 'Only the room owner can rename this room' });
    await channel.setName(String(req.body?.name || '').slice(0, 95));
    return res.json({ ok: true, name: channel.name });
  } catch (error) { return res.status(500).json({ error: error.message }); }
});
app.listen(PORT, () => console.log('LoftLife control API listening on ' + PORT));
client.login(process.env.DISCORD_BOT_TOKEN);
