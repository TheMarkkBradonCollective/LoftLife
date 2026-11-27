import {
  ChannelType,
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";

const { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;
if (!DISCORD_BOT_TOKEN || !DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) {
  throw new Error("Missing DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, or DISCORD_GUILD_ID.");
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const commands = [
  new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Create the official LoftLife community channel structure.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName("city-create")
    .setDescription("Create a private starter space for an approved player city.")
    .addStringOption(option => option.setName("name").setDescription("City display name").setRequired(true).setMaxLength(60))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(command => command.toJSON());

const rest = new REST({ version: "10" }).setToken(DISCORD_BOT_TOKEN);
await rest.put(Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID), { body: commands });

const clientRolePerms = {
  ViewChannel: PermissionFlagsBits.ViewChannel,
  SendMessages: PermissionFlagsBits.SendMessages,
  ReadMessageHistory: PermissionFlagsBits.ReadMessageHistory,
};

async function ensureRole(guild, name, permissions = []) {
  return guild.roles.cache.find(role => role.name === name)
    ?? guild.roles.create({ name, permissions, reason: "LoftLife community setup" });
}

async function ensureCategory(guild, name, overwrites = []) {
  return guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && channel.name === name)
    ?? guild.channels.create({ name, type: ChannelType.GuildCategory, permissionOverwrites: overwrites, reason: "LoftLife community setup" });
}

async function ensureText(guild, category, name, overwrites = []) {
  return guild.channels.cache.find(channel => channel.parentId === category.id && channel.name === name)
    ?? guild.channels.create({ name, type: ChannelType.GuildText, parent: category.id, permissionOverwrites: overwrites, reason: "LoftLife community setup" });
}

async function setupOfficialGuild(guild) {
  const memberRole = await ensureRole(guild, "Verified LoftLife Member");
  await ensureRole(guild, "LoftLife Moderator");
  await ensureRole(guild, "LoftLife Administration");

  const everyone = guild.roles.everyone.id;
  const memberView = [{ id: everyone, deny: [PermissionFlagsBits.SendMessages] }, { id: memberRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }];
  const staff = await ensureCategory(guild, "LOFTLIFE STAFF", [
    { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
    { id: guild.roles.cache.find(r => r.name === "LoftLife Administration").id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ]);

  const welcome = await ensureCategory(guild, "START HERE");
  await ensureText(guild, welcome, "welcome");
  await ensureText(guild, welcome, "rules");
  await ensureText(guild, welcome, "announcements");
  const community = await ensureCategory(guild, "LOFTLIFE COMMUNITY");
  await ensureText(guild, community, "general-chat");
  await ensureText(guild, community, "introductions");
  await ensureText(guild, community, "suggestions");
  const events = await ensureCategory(guild, "EVENTS & ACTIVITIES");
  await ensureText(guild, events, "community-events");
  await ensureText(guild, events, "screenshots-and-showcases");
  const help = await ensureCategory(guild, "HELP & SUPPORT");
  await ensureText(guild, help, "help-desk");
  await ensureText(guild, help, "report-guidance");
  await ensureText(guild, staff, "staff-room");
  return { memberRole, categories: [welcome, community, events, help, staff] };
}

function safeSlug(value) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 -]/g, "").trim().replace(/\s+/g, "-").slice(0, 90) || "new-city";
}

async function createCitySpace(guild, rawName) {
  const name = rawName.trim().replace(/@/g, "").replace(/[\r\n]/g, " ").slice(0, 60);
  if (!name) throw new Error("Enter a valid city name.");
  const slug = safeSlug(name);
  const ownerRole = await ensureRole(guild, `City Owner • ${slug}`);
  const staffRole = await ensureRole(guild, `City Staff • ${slug}`);
  const memberRole = await ensureRole(guild, `City Member • ${slug}`);
  const everyone = guild.roles.everyone.id;
  const privateOverwrites = [
    { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
    { id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
    { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: memberRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ];
  const category = await guild.channels.create({
    name: `CITY • ${name}`,
    type: ChannelType.GuildCategory,
    permissionOverwrites: privateOverwrites,
    reason: "Approved LoftLife city space",
  });
  await guild.channels.create({ name: "city-announcements", type: ChannelType.GuildText, parent: category.id, permissionOverwrites: [
    ...privateOverwrites,
    { id: memberRole.id, deny: [PermissionFlagsBits.SendMessages] },
  ]});
  await guild.channels.create({ name: "city-chat", type: ChannelType.GuildText, parent: category.id, permissionOverwrites: privateOverwrites });
  await guild.channels.create({ name: "events", type: ChannelType.GuildText, parent: category.id, permissionOverwrites: privateOverwrites });
  await guild.channels.create({ name: "staff-room", type: ChannelType.GuildText, parent: category.id, permissionOverwrites: [
    { id: everyone, deny: [PermissionFlagsBits.ViewChannel] },
    { id: ownerRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ]});
  return { category, ownerRole, staffRole, memberRole };
}

client.once("ready", () => {
  console.log(`LoftLife bot online as ${client.user.tag}`);
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand() || interaction.guildId !== DISCORD_GUILD_ID) return;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: "Only server administrators can run this setup command.", ephemeral: true });
    return;
  }
  await interaction.deferReply({ ephemeral: true });
  try {
    if (interaction.commandName === "setup") {
      const result = await setupOfficialGuild(interaction.guild);
      await interaction.editReply(`LoftLife structure ready. Checked/created ${result.categories.length} categories and the member role. Review channel permissions before inviting members.`);
    } else if (interaction.commandName === "city-create") {
      const result = await createCitySpace(interaction.guild, interaction.options.getString("name", true));
      await interaction.editReply(`Created private ${result.category.name} with separate owner, staff, and member roles. Assign those roles only after confirming the city's approved owner and membership in LoftLife.`);
    }
  } catch (error) {
    console.error("Discord command failed:", error);
    await interaction.editReply("Setup did not finish. Check the bot logs and verify its role position and Manage Channels/Manage Roles permissions.");
  }
});

client.login(DISCORD_BOT_TOKEN);
