const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, RoleSelectMenuBuilder, PermissionsBitField, Events } = require('discord.js');
const { setGuildStaffRoleIds, getGuildStaffRoleIds, ensureStorageExists } = require('./storage/jsonStore');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;

if (!token || !guildId) {
  console.error('Missing DISCORD_TOKEN or GUILD_ID in environment');
  process.exit(2);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.GuildMember],
});

const THEME_COLOR_PRIMARY = 0x1e88e5; // blue
const THEME_COLOR_ACCENT = 0xec407a; // pink
const THEME_IMAGE = 'https://cdn.discordapp.com/attachments/1408458115283812484/1408497858256179400/file_00000000d78861f4993dddd515f84845.png?ex=68b08cda&is=68af3b5a&hm=2e68cb9d7dfc7a60465aa74447b310348fc2d7236e74fa7c08f9434c110d7959&';

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
      // Permission check: show only to those with ManageGuild; ensure enforcement too
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const hasManageGuild = member.permissions.has(PermissionsBitField.Flags.ManageGuild);
      if (!hasManageGuild) {
        return interaction.reply({ content: '⛔ Cette commande est réservée à l\'équipe de modération.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setColor(THEME_COLOR_PRIMARY)
        .setTitle('BAG · Configuration Staff')
        .setDescription(
          [
            'Bienvenue dans l\'assistant de configuration de l\'équipe de modération.',
            'Sélectionnez les rôles qui composent votre **Staff**.\n',
            '• Le choix est multiple (jusqu\'à 25 rôles).',
            '• Vous pouvez réouvrir ce menu à tout moment.',
          ].join('\n')
        )
        .setThumbnail(THEME_IMAGE)
        .setImage(THEME_IMAGE)
        .setFooter({ text: 'Boy and Girls (BAG) • Setup', iconURL: interaction.client.user.displayAvatarURL() });

      const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId('setup_staff_roles')
        .setPlaceholder('Sélectionner les rôles du Staff…')
        .setMinValues(1)
        .setMaxValues(25);

      const row = new ActionRowBuilder().addComponents(roleSelect);

      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      return;
    }

    if (interaction.isRoleSelectMenu() && interaction.customId === 'setup_staff_roles') {
      const roles = interaction.values.map((roleId) => interaction.guild.roles.cache.get(roleId)).filter(Boolean);
      const roleList = roles.length ? roles.map((r) => `• ${r}`).join('\n') : 'Aucun rôle sélectionné';

      // Persist selection
      await ensureStorageExists();
      await setGuildStaffRoleIds(interaction.guild.id, interaction.values);

      const savedIds = await getGuildStaffRoleIds(interaction.guild.id);
      const confirmEmbed = new EmbedBuilder()
        .setColor(THEME_COLOR_ACCENT)
        .setTitle('BAG · Staff configuré')
        .setDescription('Les rôles suivants sont désormais considérés comme membres du Staff :')
        .addFields({ name: 'Rôles', value: roleList }, { name: 'IDs sauvegardés', value: savedIds.map((id) => `${id}`).join('\n') || '—' })
        .setThumbnail(THEME_IMAGE);

      // Persisting selection would usually involve a database; for now, just confirm
      await interaction.update({ embeds: [confirmEmbed], components: [] });
      return;
    }
  } catch (err) {
    console.error('Interaction handler error:', err);
    if (interaction.isRepliable()) {
      try { await interaction.reply({ content: 'Une erreur est survenue.', ephemeral: true }); } catch (_) {}
    }
  }
});

client.login(token);

