const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField, Events } = require('discord.js');
const { setGuildStaffRoleIds, getGuildStaffRoleIds, ensureStorageExists, getAutoKickConfig, updateAutoKickConfig, addPendingJoiner, removePendingJoiner } = require('./storage/jsonStore');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;

if (!token || !guildId) {
  console.error('Missing DISCORD_TOKEN or GUILD_ID in environment');
  process.exit(2);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember],
});

const THEME_COLOR_PRIMARY = 0x1e88e5; // blue
const THEME_COLOR_ACCENT = 0xec407a; // pink
const THEME_IMAGE = 'https://cdn.discordapp.com/attachments/1408458115283812484/1408497858256179400/file_00000000d78861f4993dddd515f84845.png?ex=68b08cda&is=68af3b5a&hm=2e68cb9d7dfc7a60465aa74447b310348fc2d7236e74fa7c08f9434c110d7959&';

const DELAY_OPTIONS = [
  { label: '15 minutes', ms: 15 * 60 * 1000 },
  { label: '1 heure', ms: 60 * 60 * 1000 },
  { label: '6 heures', ms: 6 * 60 * 60 * 1000 },
  { label: '24 heures', ms: 24 * 60 * 60 * 1000 },
  { label: '3 jours', ms: 3 * 24 * 60 * 60 * 1000 },
  { label: '7 jours', ms: 7 * 24 * 60 * 60 * 1000 },
];

function formatDuration(ms) {
  const sec = Math.round(ms / 1000);
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  if (sec < 86400) return `${Math.round(sec / 3600)} h`;
  return `${Math.round(sec / 86400)} j`;
}

async function buildSetupEmbed(guild) {
  const staffIds = await getGuildStaffRoleIds(guild.id);
  const staffList = staffIds.length
    ? staffIds
        .map((id) => guild.roles.cache.get(id))
        .filter(Boolean)
        .map((r) => `• ${r}`)
        .join('\n')
    : '—';
  const ak = await getAutoKickConfig(guild.id);
  const roleDisplay = ak.roleId ? (guild.roles.cache.get(ak.roleId) || `<@&${ak.roleId}>`) : '—';

  return new EmbedBuilder()
    .setColor(THEME_COLOR_PRIMARY)
    .setTitle('BAG · Configuration')
    .setDescription("Paramétrez le Staff et l'auto-kick pour votre serveur.")
    .addFields(
      { name: 'Rôles Staff', value: staffList },
      { name: 'AutoKick', value: `État: ${ak.enabled ? 'Activé ✅' : 'Désactivé ⛔'}\nRôle requis: ${roleDisplay}\nDélai: ${formatDuration(ak.delayMs)}` }
    )
    .setThumbnail(THEME_IMAGE)
    .setImage(THEME_IMAGE)
    .setFooter({ text: 'Boy and Girls (BAG) • Setup', iconURL: client.user?.displayAvatarURL() });
}

async function buildSetupComponents(guild) {
  const ak = await getAutoKickConfig(guild.id);

  const staffSelect = new RoleSelectMenuBuilder()
    .setCustomId('setup_staff_roles')
    .setPlaceholder('Sélectionner les rôles du Staff…')
    .setMinValues(1)
    .setMaxValues(25);

  const requiredRoleSelect = new RoleSelectMenuBuilder()
    .setCustomId('autokick_required_role')
    .setPlaceholder("Rôle requis pour éviter l'auto-kick…")
    .setMinValues(1)
    .setMaxValues(1);

  const delaySelect = new StringSelectMenuBuilder()
    .setCustomId('autokick_delay')
    .setPlaceholder('Choisir un délai avant auto-kick…')
    .addOptions(
      ...DELAY_OPTIONS.map((o) => ({ label: o.label, value: String(o.ms), default: o.ms === ak.delayMs })),
      { label: 'Personnalisé (minutes)…', value: 'custom' },
    );

  const enableBtn = new ButtonBuilder().setCustomId('autokick_enable').setLabel('Activer AutoKick').setStyle(ButtonStyle.Success).setDisabled(ak.enabled);
  const disableBtn = new ButtonBuilder().setCustomId('autokick_disable').setLabel('Désactiver AutoKick').setStyle(ButtonStyle.Danger).setDisabled(!ak.enabled);

  return [
    new ActionRowBuilder().addComponents(staffSelect),
    new ActionRowBuilder().addComponents(requiredRoleSelect),
    new ActionRowBuilder().addComponents(delaySelect),
    new ActionRowBuilder().addComponents(enableBtn, disableBtn),
  ];
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  ensureStorageExists().catch(() => {});
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'config') {
      // Permission check: show only to those with ManageGuild; ensure enforcement too
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const hasManageGuild = member.permissions.has(PermissionsBitField.Flags.ManageGuild);
      if (!hasManageGuild) {
        return interaction.reply({ content: '⛔ Cette commande est réservée à l\'équipe de modération.', ephemeral: true });
      }
      const embed = await buildSetupEmbed(interaction.guild);
      const components = await buildSetupComponents(interaction.guild);
      await interaction.reply({ embeds: [embed], components, ephemeral: true });
      return;
    }

    if (interaction.isRoleSelectMenu() && interaction.customId === 'setup_staff_roles') {
      await ensureStorageExists();
      await setGuildStaffRoleIds(interaction.guild.id, interaction.values);
      const embed = await buildSetupEmbed(interaction.guild);
      const components = await buildSetupComponents(interaction.guild);
      await interaction.update({ embeds: [embed], components });
      return;
    }

    if (interaction.isRoleSelectMenu() && interaction.customId === 'autokick_required_role') {
      const selected = interaction.values[0];
      await updateAutoKickConfig(interaction.guild.id, { roleId: selected });
      const embed = await buildSetupEmbed(interaction.guild);
      const components = await buildSetupComponents(interaction.guild);
      await interaction.update({ embeds: [embed], components });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'autokick_delay') {
      const value = interaction.values[0];
      if (value === 'custom') {
        const modal = new ModalBuilder()
          .setCustomId('autokick_delay_custom_modal')
          .setTitle('Délai AutoKick personnalisé');
        const input = new TextInputBuilder()
          .setCustomId('minutes')
          .setLabel('Durée en minutes')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(6)
          .setPlaceholder('Ex: 90')
          .setRequired(true);
        const row = new ActionRowBuilder().addComponents(input);
        modal.addComponents(row);
        await interaction.showModal(modal);
        return;
      } else {
        const delayMs = Number(value);
        if (!Number.isFinite(delayMs) || delayMs <= 0) {
          return interaction.reply({ content: 'Valeur de délai invalide.', ephemeral: true });
        }
        await updateAutoKickConfig(interaction.guild.id, { delayMs });
        const embed = await buildSetupEmbed(interaction.guild);
        const components = await buildSetupComponents(interaction.guild);
        await interaction.update({ embeds: [embed], components });
        return;
      }
    }

    if (interaction.isButton() && (interaction.customId === 'autokick_enable' || interaction.customId === 'autokick_disable')) {
      const enable = interaction.customId === 'autokick_enable';
      await updateAutoKickConfig(interaction.guild.id, { enabled: enable });
      const embed = await buildSetupEmbed(interaction.guild);
      const components = await buildSetupComponents(interaction.guild);
      await interaction.update({ embeds: [embed], components });
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'autokick_delay_custom_modal') {
      const text = interaction.fields.getTextInputValue('minutes');
      const minutes = Number(text);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        return interaction.reply({ content: 'Veuillez entrer un nombre de minutes valide (> 0).', ephemeral: true });
      }
      const delayMs = Math.round(minutes * 60 * 1000);
      await updateAutoKickConfig(interaction.guild.id, { delayMs });
      const embed = await buildSetupEmbed(interaction.guild);
      const components = await buildSetupComponents(interaction.guild);
      // Send a fresh ephemeral response reflecting the updated config
      return interaction.reply({ embeds: [embed], components, ephemeral: true });
    }
  } catch (err) {
    console.error('Interaction handler error:', err);
    if (interaction.isRepliable()) {
      try { await interaction.reply({ content: 'Une erreur est survenue.', ephemeral: true }); } catch (_) {}
    }
  }
});

// Track new joiners and role updates for autokick
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const ak = await getAutoKickConfig(member.guild.id);
    if (!ak.enabled || !ak.roleId) return;
    if (member.roles.cache.has(ak.roleId)) return;
    await addPendingJoiner(member.guild.id, member.id, Date.now());
  } catch (e) {
    console.error('GuildMemberAdd handler error:', e);
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  try {
    await removePendingJoiner(member.guild.id, member.id);
  } catch (_) {}
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  try {
    const ak = await getAutoKickConfig(newMember.guild.id);
    if (!ak.enabled || !ak.roleId) return;
    if (newMember.roles.cache.has(ak.roleId)) {
      await removePendingJoiner(newMember.guild.id, newMember.id);
    }
  } catch (e) {
    console.error('GuildMemberUpdate handler error:', e);
  }
});

// Periodic checker to enforce autokick
const CHECK_INTERVAL_MS = 60 * 1000;
setInterval(async () => {
  try {
    for (const [guildIdKey, guild] of client.guilds.cache) {
      const ak = await getAutoKickConfig(guildIdKey);
      if (!ak.enabled || !ak.roleId) continue;
      const now = Date.now();
      const entries = Object.entries(ak.pendingJoiners || {});
      if (!entries.length) continue;

      for (const [userId, joinedAtMs] of entries) {
        const joined = Number(joinedAtMs);
        if (!Number.isFinite(joined)) continue;
        let member;
        try {
          member = await guild.members.fetch(userId);
        } catch (_) {
          await removePendingJoiner(guild.id, userId);
          continue;
        }
        if (member.roles.cache.has(ak.roleId)) {
          await removePendingJoiner(guild.id, userId);
          continue;
        }
        if (now - joined >= ak.delayMs) {
          try {
            await member.kick('AutoKick: rôle requis non pris à temps');
            await removePendingJoiner(guild.id, userId);
          } catch (e) {
            // likely missing permissions; keep pending to retry later
            console.warn(`Échec du kick de ${member.user.tag}:`, e?.message || e);
          }
        }
      }
    }
  } catch (e) {
    console.error('AutoKick checker error:', e);
  }
}, CHECK_INTERVAL_MS);

client.login(token);

