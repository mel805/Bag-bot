const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField, Events } = require('discord.js');
const { setGuildStaffRoleIds, getGuildStaffRoleIds, ensureStorageExists, getAutoKickConfig, updateAutoKickConfig, addPendingJoiner, removePendingJoiner, getLevelsConfig, updateLevelsConfig, getUserStats, setUserStats } = require('./storage/jsonStore');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
// Simple in-memory image cache
const imageCache = new Map(); // url -> { img, width, height, ts }
async function getCachedImage(url) {
  if (!url) return null;
  const cached = imageCache.get(url);
  if (cached) return cached;
  try {
    const img = await loadImage(url);
    const entry = { img, width: img.width || 1024, height: img.height || 512, ts: Date.now() };
    imageCache.set(url, entry);
    return entry;
  } catch (_) {
    return null;
  }
}
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;

if (!token || !guildId) {
  console.error('Missing DISCORD_TOKEN or GUILD_ID in environment');
  process.exit(2);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
  ],
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

function xpRequiredForNext(level, curve) {
  const required = Math.round(curve.base * Math.pow(curve.factor, Math.max(0, level)));
  return Math.max(1, required);
}

function totalXpAtLevel(level, curve) {
  const base = Number(curve?.base) || 100;
  const factor = Number(curve?.factor) || 1.2;
  if (factor === 1) return Math.max(0, Math.round(base * Math.max(0, level)));
  const l = Math.max(0, level);
  const sum = base * (Math.pow(factor, l) - 1) / (factor - 1);
  return Math.max(0, Math.round(sum));
}

function xpToLevel(xp, curve) {
  const base = Number(curve?.base) || 100;
  const factor = Number(curve?.factor) || 1.2;
  let remaining = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 0;
  // Fast path: approximate level from geometric series, then adjust
  if (factor !== 1 && base > 0) {
    const approx = Math.floor(Math.log((remaining * (factor - 1)) / base + 1) / Math.log(factor));
    if (Number.isFinite(approx) && approx > 0) {
      const approxSum = totalXpAtLevel(approx, { base, factor });
      if (approxSum <= remaining) {
        level = approx;
        remaining -= approxSum;
      }
    }
  }
  for (let guard = 0; guard < 100000; guard++) {
    const req = Math.max(1, Math.round(base * Math.pow(factor, level)));
    if (remaining < req) break;
    remaining -= req;
    level += 1;
  }
  return { level, xpSinceLevel: remaining };
}

async function buildConfigEmbed(guild) {
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
  const levels = await getLevelsConfig(guild.id);
  const rewardsEntries = Object.entries(levels.rewards || {}).sort((a,b)=>Number(a[0])-Number(b[0]));
  const rewardsText = rewardsEntries.length ? rewardsEntries.map(([lvl, rid]) => {
    const role = guild.roles.cache.get(rid);
    return `• Niveau ${lvl} → ${role ? role : `<@&${rid}>`}`;
  }).join('\n') : '—';

  const embed = new EmbedBuilder()
    .setColor(THEME_COLOR_PRIMARY)
    .setTitle('BAG · Configuration')
    .setDescription("Choisissez une section puis ajustez les paramètres.")
    .addFields(
      { name: 'Rôles Staff', value: staffList },
      { name: 'AutoKick', value: `État: ${ak.enabled ? 'Activé ✅' : 'Désactivé ⛔'}\nRôle requis: ${roleDisplay}\nDélai: ${formatDuration(ak.delayMs)}` },
      { name: 'Levels', value: `État: ${levels.enabled ? 'Activé ✅' : 'Désactivé ⛔'}\nXP texte: ${levels.xpPerMessage}\nXP vocal/min: ${levels.xpPerVoiceMinute}\nCourbe: base=${levels.levelCurve.base}, facteur=${levels.levelCurve.factor}` },
      { name: 'Récompenses (niveau → rôle)', value: rewardsText }
    )
    .setThumbnail(THEME_IMAGE)
    .setImage(THEME_IMAGE);

  const avatar = client.user && client.user.displayAvatarURL ? client.user.displayAvatarURL() : null;
  if (avatar) embed.setFooter({ text: 'Boy and Girls (BAG) • Config', iconURL: avatar });
  else embed.setFooter({ text: 'Boy and Girls (BAG) • Config' });

  return embed;
}

function buildTopSectionRow() {
  const select = new StringSelectMenuBuilder()
    .setCustomId('config_section')
    .setPlaceholder('Choisir une section…')
    .addOptions(
      { label: 'Staff', value: 'staff', description: 'Gérer les rôles Staff' },
      { label: 'AutoKick', value: 'autokick', description: "Configurer l'auto-kick" },
      { label: 'Levels', value: 'levels', description: 'Configurer XP & niveaux' },
    );
  return new ActionRowBuilder().addComponents(select);
}

function buildStaffActionRow() {
  const select = new StringSelectMenuBuilder()
    .setCustomId('config_staff_action')
    .setPlaceholder('Choisir une action Staff…')
    .addOptions(
      { label: 'Ajouter des rôles Staff', value: 'add' },
      { label: 'Retirer des rôles Staff', value: 'remove' },
    );
  return new ActionRowBuilder().addComponents(select);
}

function buildStaffAddRows() {
  const addSelect = new RoleSelectMenuBuilder()
    .setCustomId('staff_add_roles')
    .setPlaceholder('Sélectionner les rôles à AJOUTER au Staff…')
    .setMinValues(1)
    .setMaxValues(25);
  return [new ActionRowBuilder().addComponents(addSelect)];
}

async function buildStaffRemoveRows(guild) {
  const removeSelect = new RoleSelectMenuBuilder()
    .setCustomId('staff_remove_roles')
    .setPlaceholder('Sélectionner les rôles à RETIRER du Staff…')
    .setMinValues(1)
    .setMaxValues(25);
  return [new ActionRowBuilder().addComponents(removeSelect)];
}

async function buildAutokickRows(guild) {
  const ak = await getAutoKickConfig(guild.id);
  const requiredRoleSelect = new RoleSelectMenuBuilder()
    .setCustomId('autokick_required_role')
    .setPlaceholder("Rôle requis pour éviter l'auto-kick…")
    .setMinValues(1)
    .setMaxValues(1);
  const delaySelect = new StringSelectMenuBuilder()
    .setCustomId('autokick_delay')
    .setPlaceholder('Choisir un délai avant auto-kick…')
    .addOptions(
      ...DELAY_OPTIONS.map((o) => ({ label: o.label, value: String(o.ms) })),
      { label: 'Personnalisé (minutes)…', value: 'custom' },
    );
  const enableBtn = new ButtonBuilder().setCustomId('autokick_enable').setLabel('Activer AutoKick').setStyle(ButtonStyle.Success).setDisabled(ak.enabled);
  const disableBtn = new ButtonBuilder().setCustomId('autokick_disable').setLabel('Désactiver AutoKick').setStyle(ButtonStyle.Danger).setDisabled(!ak.enabled);
  return [
    new ActionRowBuilder().addComponents(requiredRoleSelect),
    new ActionRowBuilder().addComponents(delaySelect),
    new ActionRowBuilder().addComponents(enableBtn, disableBtn),
  ];
}

function buildLevelsActionRow() {
  const select = new StringSelectMenuBuilder()
    .setCustomId('levels_action')
    .setPlaceholder('Choisir une action Levels…')
    .addOptions(
      { label: 'Paramètres (XP/texte, XP/vocal, courbe)', value: 'settings' },
      { label: 'Récompenses (niveau → rôle)', value: 'rewards' },
    );
  return new ActionRowBuilder().addComponents(select);
}

async function buildLevelsGeneralRows(guild) {
  const levels = await getLevelsConfig(guild.id);
  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('levels_page:general').setLabel('Réglages').setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId('levels_page:cards').setLabel('Cartes').setStyle(ButtonStyle.Secondary)
  );
  const enableBtn = new ButtonBuilder().setCustomId('levels_enable').setLabel('Activer Levels').setStyle(ButtonStyle.Success).setDisabled(levels.enabled);
  const disableBtn = new ButtonBuilder().setCustomId('levels_disable').setLabel('Désactiver Levels').setStyle(ButtonStyle.Danger).setDisabled(!levels.enabled);
  const xpTextBtn = new ButtonBuilder().setCustomId('levels_set_xp_text').setLabel('XP Texte').setStyle(ButtonStyle.Primary);
  const xpVoiceBtn = new ButtonBuilder().setCustomId('levels_set_xp_voice').setLabel('XP Vocal/min').setStyle(ButtonStyle.Primary);
  const curveBtn = new ButtonBuilder().setCustomId('levels_set_curve').setLabel('Courbe').setStyle(ButtonStyle.Secondary);
  const rowActions = new ActionRowBuilder().addComponents(enableBtn, disableBtn, xpTextBtn, xpVoiceBtn, curveBtn);
  const levelUpToggle = new ButtonBuilder().setCustomId('levels_announce_level_toggle').setLabel(levels.announce?.levelUp?.enabled ? 'Annonces Niveau: ON' : 'Annonces Niveau: OFF').setStyle(levels.announce?.levelUp?.enabled ? ButtonStyle.Success : ButtonStyle.Secondary);
  const roleAwardToggle = new ButtonBuilder().setCustomId('levels_announce_role_toggle').setLabel(levels.announce?.roleAward?.enabled ? 'Annonces Rôle: ON' : 'Annonces Rôle: OFF').setStyle(levels.announce?.roleAward?.enabled ? ButtonStyle.Success : ButtonStyle.Secondary);
  const rowToggles = new ActionRowBuilder().addComponents(levelUpToggle, roleAwardToggle);
  const levelUpChannel = new ChannelSelectMenuBuilder().setCustomId('levels_announce_level_channel').setPlaceholder('Salon annonces de niveau…').setMinValues(1).setMaxValues(1).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  const roleAwardChannel = new ChannelSelectMenuBuilder().setCustomId('levels_announce_role_channel').setPlaceholder('Salon annonces de rôle…').setMinValues(1).setMaxValues(1).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  const rowLevelUp = new ActionRowBuilder().addComponents(levelUpChannel);
  const rowRoleAward = new ActionRowBuilder().addComponents(roleAwardChannel);
  return [nav, rowActions, rowToggles, rowLevelUp, rowRoleAward];
}

async function buildLevelsCardsRows(guild) {
  const levels = await getLevelsConfig(guild.id);
  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('levels_page:general').setLabel('Réglages').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('levels_page:cards').setLabel('Cartes').setStyle(ButtonStyle.Primary).setDisabled(true)
  );
  const femaleRoles = new RoleSelectMenuBuilder().setCustomId('levels_cards_female_roles').setPlaceholder('Rôles “femme”… (multi)').setMinValues(0).setMaxValues(25);
  const certifiedRoles = new RoleSelectMenuBuilder().setCustomId('levels_cards_certified_roles').setPlaceholder('Rôles “certifié”… (multi)').setMinValues(0).setMaxValues(25);
  const rowFemale = new ActionRowBuilder().addComponents(femaleRoles);
  const rowCert = new ActionRowBuilder().addComponents(certifiedRoles);
  const bgDefaultBtn = new ButtonBuilder().setCustomId('levels_cards_bg_default').setLabel('BG par défaut').setStyle(ButtonStyle.Primary);
  const bgFemaleBtn = new ButtonBuilder().setCustomId('levels_cards_bg_female').setLabel('BG femme').setStyle(ButtonStyle.Primary);
  const bgCertifiedBtn = new ButtonBuilder().setCustomId('levels_cards_bg_certified').setLabel('BG certifié').setStyle(ButtonStyle.Primary);
  const rowBgs = new ActionRowBuilder().addComponents(bgDefaultBtn, bgFemaleBtn, bgCertifiedBtn);
  return [nav, rowFemale, rowCert, rowBgs];
}

async function buildLevelsRewardsRows(guild) {
  const levels = await getLevelsConfig(guild.id);
  const addRole = new RoleSelectMenuBuilder()
    .setCustomId('levels_reward_add_role')
    .setPlaceholder('Choisir le rôle à associer à un niveau…')
    .setMinValues(1)
    .setMaxValues(1);
  const options = Object.entries(levels.rewards || {})
    .map(([lvl, rid]) => {
      const role = guild.roles.cache.get(rid);
      return { label: `Niveau ${lvl} → ${role ? role.name : rid}`, value: String(lvl) };
    });
  const removeSelect = new StringSelectMenuBuilder()
    .setCustomId('levels_reward_remove')
    .setPlaceholder('Supprimer des récompenses (niveau)…')
    .setMinValues(1)
    .setMaxValues(Math.min(25, Math.max(1, options.length)));
  if (options.length > 0) {
    removeSelect.addOptions(...options);
  } else {
    removeSelect.addOptions({ label: 'Aucune récompense', value: 'none' }).setDisabled(true);
  }
  return [new ActionRowBuilder().addComponents(addRole), new ActionRowBuilder().addComponents(removeSelect)];
}

function chooseCardBackgroundForMember(memberOrMention, levels) {
  const bgs = levels.cards?.backgrounds || {};
  if (!memberOrMention || !memberOrMention.roles) return bgs.default || THEME_IMAGE;
  const femaleIds = new Set(levels.cards?.femaleRoleIds || []);
  const certIds = new Set(levels.cards?.certifiedRoleIds || []);
  const hasFemale = memberOrMention.roles.cache?.some(r => femaleIds.has(r.id));
  const hasCert = memberOrMention.roles.cache?.some(r => certIds.has(r.id));
  if (hasFemale && hasCert) return bgs.certified || bgs.female || bgs.default || THEME_IMAGE;
  if (hasFemale) return bgs.female || bgs.default || THEME_IMAGE;
  if (hasCert) return bgs.certified || bgs.default || THEME_IMAGE;
  return bgs.default || THEME_IMAGE;
}

function getLastRewardForLevel(levels, currentLevel) {
  const entries = Object.entries(levels.rewards || {});
  let best = null;
  for (const [lvlStr, rid] of entries) {
    const ln = Number(lvlStr);
    if (Number.isFinite(ln) && ln <= (currentLevel || 0)) {
      if (!best || ln > best.level) best = { level: ln, roleId: rid };
    }
  }
  return best;
}

async function drawCard(backgroundUrl, title, lines, progressRatio, progressText) {
  try {
    const entry = await getCachedImage(backgroundUrl);
    if (!entry) return null;
    const maxW = 1024;
    const scale = entry.width > maxW ? maxW / entry.width : 1;
    const width = Math.max(640, Math.round(entry.width * scale));
    const height = Math.max(360, Math.round(entry.height * scale));
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(entry.img, 0, 0, width, height);
    // overlay panel
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(24, 24, width - 48, height - 48);
    // title
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 4;
    ctx.font = 'bold 72px Sans-Serif';
    ctx.textBaseline = 'top';
    ctx.strokeText(title, 48, 48);
    ctx.fillText(title, 48, 48);
    // content
    ctx.font = '42px Sans-Serif';
    let y = 140;
    for (const line of lines) {
      ctx.strokeText(line, 48, y);
      ctx.fillText(line, 48, y);
      y += 52;
    }
    // progress bar (optional)
    if (typeof progressRatio === 'number') {
      const ratio = Math.max(0, Math.min(1, progressRatio));
      const barX = 48;
      const barW = width - 96;
      const barH = 36;
      const barY = height - 48 - barH - 12; // above bottom overlay margin
      // label
      if (progressText) {
        ctx.font = 'bold 32px Sans-Serif';
        ctx.strokeText(progressText, 48, barY - 40);
        ctx.fillText(progressText, 48, barY - 40);
      }
      // bg
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(barX, barY, barW, barH);
      // fill
      ctx.fillStyle = '#1e88e5';
      ctx.fillRect(barX, barY, Math.round(barW * ratio), barH);
      // border
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.strokeRect(barX, barY, barW, barH);
    }
    return canvas.toBuffer('image/png');
  } catch (_) {
    return null;
  }
}

function maybeAnnounceLevelUp(guild, memberOrMention, levels, newLevel) {
  const ann = levels.announce?.levelUp || {};
  if (!ann.enabled || !ann.channelId) return;
  const channel = guild.channels.cache.get(ann.channelId);
  if (!channel || !channel.isTextBased?.()) return;
  const bg = chooseCardBackgroundForMember(memberOrMention, levels);
  const lines = [
    `Niveau: ${newLevel}`,
  ];
  drawCard(bg, `${memberOrMention} monte de niveau !`, lines).then((img) => {
    if (img) channel.send({ files: [{ attachment: img, name: 'levelup.png' }] }).catch(() => {});
    else channel.send({ content: `🎉 ${memberOrMention} passe niveau ${newLevel} !` }).catch(() => {});
  });
}

function maybeAnnounceRoleAward(guild, memberOrMention, levels, roleId) {
  const ann = levels.announce?.roleAward || {};
  if (!ann.enabled || !ann.channelId || !roleId) return;
  const channel = guild.channels.cache.get(ann.channelId);
  if (!channel || !channel.isTextBased?.()) return;
  const bg = chooseCardBackgroundForMember(memberOrMention, levels);
  drawCard(bg, `${memberOrMention} reçoit un rôle !`, [`Rôle: <@&${roleId}>`]).then((img) => {
    if (img) channel.send({ files: [{ attachment: img, name: 'role.png' }] }).catch(() => {});
    else channel.send({ content: `🏅 ${memberOrMention} reçoit le rôle <@&${roleId}> !` }).catch(() => {});
  });
}

function memberMention(userId) {
  return `<@${userId}>`;
}
async function fetchMember(guild, userId) {
  return guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
}

function pickThemeColorForGuild(guild) {
  const palette = [0x1e88e5, 0xec407a, 0x26a69a, 0x8e24aa, 0xff7043];
  const id = String(guild?.id || '0');
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 33 + id.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

async function buildTopNiveauEmbed(guild, entriesSorted, offset, limit) {
  const slice = entriesSorted.slice(offset, offset + limit);
  const formatNum = (n) => (Number(n) || 0).toLocaleString('fr-FR');
  const medalFor = (i) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`);
  const lines = await Promise.all(slice.map(async ([uid, st], idx) => {
    const rank = offset + idx;
    const mem = guild.members.cache.get(uid) || await guild.members.fetch(uid).catch(() => null);
    const display = mem ? (mem.nickname || mem.user.username) : `<@${uid}>`;
    const lvl = st.level || 0;
    const xp = formatNum(st.xp || 0);
    return `${medalFor(rank)} **${display}** • Lvl ${lvl} • ${xp} XP`;
  }));
  const color = pickThemeColorForGuild(guild);
  const total = entriesSorted.length;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: `${guild.name} • Classement des niveaux`, iconURL: guild.iconURL?.() || undefined })
    .setDescription(lines.join('\n') || '—')
    .setThumbnail(THEME_IMAGE)
    .setFooter({ text: `Boy and Girls (BAG) • ${offset + 1}-${Math.min(total, offset + limit)} sur ${total}` })
    .setTimestamp(new Date());

  const components = [];
  const row = new ActionRowBuilder();
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;
  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;
  const prevBtn = new ButtonBuilder().setCustomId(`top_niveau_page:${prevOffset}:${limit}`).setLabel('⟨ Précédent').setStyle(ButtonStyle.Secondary).setDisabled(!hasPrev);
  const nextBtn = new ButtonBuilder().setCustomId(`top_niveau_page:${nextOffset}:${limit}`).setLabel('Suivant ⟩').setStyle(ButtonStyle.Primary).setDisabled(!hasNext);
  row.addComponents(prevBtn, nextBtn);
  components.push(row);

  return { embed, components };
}

process.on('unhandledRejection', (reason) => {
  console.error('UnhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('UncaughtException:', err);
});

client.on('shardError', (error) => {
  console.error('WebSocket shard error:', error);
});
client.on('error', (error) => {
  console.error('Client error:', error);
});
client.on('warn', (info) => {
  console.warn('Client warn:', info);
});

client.login(token).then(() => {
  console.log('Login succeeded');
}).catch((err) => {
  console.error('Login failed:', err?.message || err);
  process.exit(1);
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  ensureStorageExists().catch(() => {});
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'config') {
      const hasManageGuild = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild) || interaction.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild);
      if (!hasManageGuild) {
        return interaction.reply({ content: '⛔ Cette commande est réservée à l\'équipe de modération.', ephemeral: true });
      }
      const embed = await buildConfigEmbed(interaction.guild);
      const top = buildTopSectionRow();
      await interaction.reply({ embeds: [embed], components: [top], ephemeral: true });
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'niveau') {
      const targetUser = interaction.options.getUser('membre') || interaction.user;
      const levels = await getLevelsConfig(interaction.guild.id);
      const stats = await getUserStats(interaction.guild.id, targetUser.id);
      const curve = levels.levelCurve;
      const needed = xpRequiredForNext(stats.level, curve);
      const progress = Math.min(1, Math.max(0, stats.xpSinceLevel / needed));
      const barLen = 20;
      const filled = Math.round(progress * barLen);
      const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
      const targetMember = interaction.guild.members.cache.get(targetUser.id) || await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      const bg = chooseCardBackgroundForMember(targetMember, levels);
      const lastReward = getLastRewardForLevel(levels, stats.level);
      const rewardText = lastReward ? `Dernière récompense: <@&${lastReward.roleId}> (niv ${lastReward.level})` : 'Dernière récompense: —';
      const img = await drawCard(bg, `Niveau de ${targetUser.username}`, [
        `Niveau: ${stats.level}`,
        `XP total: ${stats.xp}`,
        rewardText,
      ], progress, `${Math.round(progress * 100)}% (${stats.xpSinceLevel}/${needed}) vers ${stats.level + 1}`);
      if (img) {
        return interaction.reply({ files: [{ attachment: img, name: 'niveau.png' }] });
      }
      const embed = new EmbedBuilder()
        .setColor(pickThemeColorForGuild(interaction.guild))
        .setTitle(`Niveau de ${targetUser.username}`)
        .addFields(
          { name: 'Niveau', value: String(stats.level), inline: true },
          { name: 'XP total', value: String(stats.xp), inline: true },
          { name: 'Progression', value: `${bar} ${Math.round(progress * 100)}%\n${stats.xpSinceLevel}/${needed} XP vers le niveau ${stats.level + 1}` },
          { name: 'Dernière récompense', value: lastReward ? `<@&${lastReward.roleId}> (niv ${lastReward.level})` : '—' }
        )
        .setImage(bg)
        .setTimestamp(new Date());
      const avatar = targetUser.displayAvatarURL?.() || null;
      if (avatar) embed.setThumbnail(avatar);
      return interaction.reply({ embeds: [embed], ephemeral: false });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'config_section') {
      const section = interaction.values[0];
      const embed = await buildConfigEmbed(interaction.guild);
      if (section === 'staff') {
        const staffAction = buildStaffActionRow();
        await interaction.update({ embeds: [embed], components: [staffAction] });
      } else if (section === 'autokick') {
        const akRows = await buildAutokickRows(interaction.guild);
        await interaction.update({ embeds: [embed], components: [...akRows] });
      } else if (section === 'levels') {
        const rows = await buildLevelsGeneralRows(interaction.guild);
        await interaction.update({ embeds: [embed], components: [...rows] });
      } else {
        await interaction.update({ embeds: [embed], components: [] });
      }
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('levels_page:')) {
      const page = interaction.customId.split(':')[1];
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = page === 'cards' ? await buildLevelsCardsRows(interaction.guild) : await buildLevelsGeneralRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'config_staff_action') {
      const action = interaction.values[0];
      const embed = await buildConfigEmbed(interaction.guild);
      const top = buildTopSectionRow();
      const staffAction = buildStaffActionRow();
      if (action === 'add') {
        const addRows = buildStaffAddRows();
        await interaction.update({ embeds: [embed], components: [top, staffAction, ...addRows] });
      } else if (action === 'remove') {
        const removeRows = await buildStaffRemoveRows(interaction.guild);
        await interaction.update({ embeds: [embed], components: [top, staffAction, ...removeRows] });
      } else {
        await interaction.update({ embeds: [embed], components: [top, staffAction] });
      }
      return;
    }

    if (interaction.isRoleSelectMenu() && interaction.customId === 'staff_add_roles') {
      await ensureStorageExists();
      const current = await getGuildStaffRoleIds(interaction.guild.id);
      const next = Array.from(new Set([...current, ...interaction.values]));
      await setGuildStaffRoleIds(interaction.guild.id, next);
      const embed = await buildConfigEmbed(interaction.guild);
      const top = buildTopSectionRow();
      const staffAction = buildStaffActionRow();
      await interaction.update({ embeds: [embed], components: [top, staffAction] });
      return;
    }

    if (interaction.isRoleSelectMenu() && interaction.customId === 'staff_remove_roles') {
      const selected = new Set(interaction.values);
      const current = await getGuildStaffRoleIds(interaction.guild.id);
      const next = current.filter((id) => !selected.has(id));
      await setGuildStaffRoleIds(interaction.guild.id, next);
      const embed = await buildConfigEmbed(interaction.guild);
      const top = buildTopSectionRow();
      const staffAction = buildStaffActionRow();
      await interaction.update({ embeds: [embed], components: [top, staffAction] });
      return;
    }

    if (interaction.isRoleSelectMenu() && interaction.customId === 'autokick_required_role') {
      const selected = interaction.values[0];
      await updateAutoKickConfig(interaction.guild.id, { roleId: selected });
      const embed = await buildConfigEmbed(interaction.guild);
      const top = buildTopSectionRow();
      const akRows = await buildAutokickRows(interaction.guild);
      await interaction.update({ embeds: [embed], components: [top, ...akRows] });
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
        const embed = await buildConfigEmbed(interaction.guild);
        const top = buildTopSectionRow();
        const akRows = await buildAutokickRows(interaction.guild);
        await interaction.update({ embeds: [embed], components: [top, ...akRows] });
        return;
      }
    }

    if (interaction.isButton() && (interaction.customId === 'autokick_enable' || interaction.customId === 'autokick_disable')) {
      const enable = interaction.customId === 'autokick_enable';
      await updateAutoKickConfig(interaction.guild.id, { enabled: enable });
      const embed = await buildConfigEmbed(interaction.guild);
      const top = buildTopSectionRow();
      const akRows = await buildAutokickRows(interaction.guild);
      await interaction.update({ embeds: [embed], components: [top, ...akRows] });
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
      try { await interaction.deferUpdate(); } catch (_) {}
      const embed = await buildConfigEmbed(interaction.guild);
      const top = buildTopSectionRow();
      const akRows = await buildAutokickRows(interaction.guild);
      try { await interaction.editReply({ embeds: [embed], components: [top, ...akRows] }); } catch (_) {}
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'levels_action') {
      const action = interaction.values[0];
      const embed = await buildConfigEmbed(interaction.guild);
      if (action === 'settings') {
        const levelsGeneralRows = await buildLevelsGeneralRows(interaction.guild);
        await interaction.update({ embeds: [embed], components: [...levelsGeneralRows] });
      } else if (action === 'rewards') {
        const rows = await buildLevelsRewardsRows(interaction.guild);
        await interaction.update({ embeds: [embed], components: [...rows] });
      } else {
        const levelsGeneralRows = await buildLevelsGeneralRows(interaction.guild);
        await interaction.update({ embeds: [embed], components: [...levelsGeneralRows] });
      }
      return;
    }

    if (interaction.isButton() && (interaction.customId === 'levels_enable' || interaction.customId === 'levels_disable')) {
      const enable = interaction.customId === 'levels_enable';
      await updateLevelsConfig(interaction.guild.id, { enabled: enable });
      const embed = await buildConfigEmbed(interaction.guild);
      const levelsGeneralRows = await buildLevelsGeneralRows(interaction.guild);
      await interaction.update({ embeds: [embed], components: [...levelsGeneralRows] });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'levels_announce_level_toggle') {
      const cfg = await getLevelsConfig(interaction.guild.id);
      const enabled = !cfg.announce?.levelUp?.enabled;
      await updateLevelsConfig(interaction.guild.id, { announce: { ...(cfg.announce || {}), levelUp: { ...(cfg.announce?.levelUp || {}), enabled } } });
      const embed = await buildConfigEmbed(interaction.guild);
      const levelsGeneralRows = await buildLevelsGeneralRows(interaction.guild);
      await interaction.update({ embeds: [embed], components: [...levelsGeneralRows] });
      return;
    }

    if (interaction.isChannelSelectMenu() && interaction.customId === 'levels_announce_level_channel') {
      const value = interaction.values[0];
      if (value === 'none') return interaction.deferUpdate();
      const cfg = await getLevelsConfig(interaction.guild.id);
      await updateLevelsConfig(interaction.guild.id, { announce: { ...(cfg.announce || {}), levelUp: { ...(cfg.announce?.levelUp || {}), channelId: value } } });
      const embed = await buildConfigEmbed(interaction.guild);
      const levelsGeneralRows = await buildLevelsGeneralRows(interaction.guild);
      await interaction.update({ embeds: [embed], components: [...levelsGeneralRows] });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'levels_announce_role_toggle') {
      const cfg = await getLevelsConfig(interaction.guild.id);
      const enabled = !cfg.announce?.roleAward?.enabled;
      await updateLevelsConfig(interaction.guild.id, { announce: { ...(cfg.announce || {}), roleAward: { ...(cfg.announce?.roleAward || {}), enabled } } });
      const embed = await buildConfigEmbed(interaction.guild);
      const levelsGeneralRows = await buildLevelsGeneralRows(interaction.guild);
      await interaction.update({ embeds: [embed], components: [...levelsGeneralRows] });
      return;
    }

    if (interaction.isChannelSelectMenu() && interaction.customId === 'levels_announce_role_channel') {
      const value = interaction.values[0];
      if (value === 'none') return interaction.deferUpdate();
      const cfg = await getLevelsConfig(interaction.guild.id);
      await updateLevelsConfig(interaction.guild.id, { announce: { ...(cfg.announce || {}), roleAward: { ...(cfg.announce?.roleAward || {}), channelId: value } } });
      const embed = await buildConfigEmbed(interaction.guild);
      const levelsGeneralRows = await buildLevelsGeneralRows(interaction.guild);
      await interaction.update({ embeds: [embed], components: [...levelsGeneralRows] });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'levels_set_xp_text') {
      const modal = new ModalBuilder().setCustomId('levels_xp_text_modal').setTitle('XP par message (texte)');
      const input = new TextInputBuilder().setCustomId('amount').setLabel('XP/message').setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(6).setPlaceholder('Ex: 10').setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isButton() && interaction.customId === 'levels_set_xp_voice') {
      const modal = new ModalBuilder().setCustomId('levels_xp_voice_modal').setTitle('XP vocal par minute');
      const input = new TextInputBuilder().setCustomId('amount').setLabel('XP/minute en vocal').setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(6).setPlaceholder('Ex: 5').setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isButton() && interaction.customId === 'levels_set_curve') {
      const modal = new ModalBuilder().setCustomId('levels_curve_modal').setTitle('Courbe d\'XP (base & facteur)');
      const baseInput = new TextInputBuilder().setCustomId('base').setLabel('Base (ex: 100)').setStyle(TextInputStyle.Short).setPlaceholder('100').setRequired(true);
      const factorInput = new TextInputBuilder().setCustomId('factor').setLabel('Facteur (ex: 1.2)').setStyle(TextInputStyle.Short).setPlaceholder('1.2').setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(baseInput), new ActionRowBuilder().addComponents(factorInput));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'levels_xp_text_modal') {
      const v = Number(interaction.fields.getTextInputValue('amount'));
      if (!Number.isFinite(v) || v < 0) return interaction.reply({ content: 'Valeur invalide.', ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      await updateLevelsConfig(interaction.guild.id, { xpPerMessage: Math.round(v) });
      return interaction.editReply({ content: `✅ XP texte mis à jour: ${Math.round(v)} XP/message.` });
    }

    if (interaction.isModalSubmit() && interaction.customId === 'levels_xp_voice_modal') {
      const v = Number(interaction.fields.getTextInputValue('amount'));
      if (!Number.isFinite(v) || v < 0) return interaction.reply({ content: 'Valeur invalide.', ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      await updateLevelsConfig(interaction.guild.id, { xpPerVoiceMinute: Math.round(v) });
      return interaction.editReply({ content: `✅ XP vocal mis à jour: ${Math.round(v)} XP/min.` });
    }

    if (interaction.isModalSubmit() && interaction.customId === 'levels_curve_modal') {
      const base = Number(interaction.fields.getTextInputValue('base'));
      const factor = Number(interaction.fields.getTextInputValue('factor'));
      if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(factor) || factor <= 0) {
        return interaction.reply({ content: 'Valeurs invalides.', ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      const prevCfg = await getLevelsConfig(interaction.guild.id);
      const prevUsers = { ...(prevCfg.users || {}) };
      await updateLevelsConfig(interaction.guild.id, { levelCurve: { base: Math.round(base), factor } });
      const newCfg = await getLevelsConfig(interaction.guild.id);
      const users = Object.keys(prevUsers);
      for (const uid of users) {
        const stPrev = prevUsers[uid] || { level: 0, xp: 0, xpSinceLevel: 0 };
        const newFloor = totalXpAtLevel(stPrev.level || 0, newCfg.levelCurve);
        const newReq = Math.max(1, xpRequiredForNext(stPrev.level || 0, newCfg.levelCurve));
        const cappedSince = Math.max(0, Math.min(stPrev.xpSinceLevel || 0, newReq - 1));
        const st = await getUserStats(interaction.guild.id, uid);
        st.level = Math.max(0, stPrev.level || 0);
        st.xpSinceLevel = cappedSince;
        st.xp = newFloor + cappedSince;
        await setUserStats(interaction.guild.id, uid, st);
        const member = interaction.guild.members.cache.get(uid) || await interaction.guild.members.fetch(uid).catch(() => null);
        if (member) {
          const entries = Object.entries(newCfg.rewards || {});
          for (const [lvlStr, rid] of entries) {
            const ln = Number(lvlStr);
            if (Number.isFinite(ln) && st.level >= ln) {
              try { await member.roles.add(rid); } catch (_) {}
            }
          }
        }
      }
      return interaction.editReply({ content: `✅ Courbe mise à jour (base=${Math.round(base)}, facteur=${factor}). Utilisateurs resynchronisés: ${users.length}.` });
    }

    if (interaction.isRoleSelectMenu() && interaction.customId === 'levels_reward_add_role') {
      const roleId = interaction.values[0];
      const modal = new ModalBuilder().setCustomId(`levels_reward_add_modal:${roleId}`).setTitle('Associer un niveau à ce rôle');
      const levelInput = new TextInputBuilder().setCustomId('level').setLabel('Niveau (ex: 5)').setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(levelInput));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('levels_reward_add_modal:')) {
      const roleId = interaction.customId.split(':')[1];
      const lvl = Number(interaction.fields.getTextInputValue('level'));
      if (!Number.isFinite(lvl) || lvl < 1) return interaction.reply({ content: 'Niveau invalide (>=1).', ephemeral: true });
      const cfg = await getLevelsConfig(interaction.guild.id);
      const rewards = { ...(cfg.rewards || {}) };
      rewards[String(Math.round(lvl))] = roleId;
      await updateLevelsConfig(interaction.guild.id, { rewards });
      try { await interaction.deferUpdate(); } catch (_) {}
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildLevelsRewardsRows(interaction.guild);
      try { await interaction.editReply({ embeds: [embed], components: [...rows] }); } catch (_) {}
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'levels_reward_remove') {
      const removeLvls = new Set(interaction.values.map((v) => String(v)));
      if (removeLvls.has('none')) return interaction.deferUpdate();
      const cfg = await getLevelsConfig(interaction.guild.id);
      const rewards = { ...(cfg.rewards || {}) };
      for (const k of removeLvls) delete rewards[k];
      await updateLevelsConfig(interaction.guild.id, { rewards });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildLevelsRewardsRows(interaction.guild);
      await interaction.update({ embeds: [embed], components: [...rows] });
      return;
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'adminxp') {
      const hasManageGuild = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild) || interaction.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild);
      if (!hasManageGuild) return interaction.reply({ content: '⛔ Permission requise.', ephemeral: true });
      const action = interaction.options.getString('action', true);
      const target = interaction.options.getUser('membre', true);
      const targetMember = interaction.guild.members.cache.get(target.id);
      const levels = await getLevelsConfig(interaction.guild.id);
      let stats = await getUserStats(interaction.guild.id, target.id);

      const applyRewardsUpTo = async (newLevel) => {
        const tm = await fetchMember(interaction.guild, target.id);
        if (!tm) return;
        const entries = Object.entries(levels.rewards || {});
        for (const [lvlStr, rid] of entries) {
          const lvlNum = Number(lvlStr);
          if (Number.isFinite(lvlNum) && newLevel >= lvlNum) {
            try { await tm.roles.add(rid); } catch (_) {}
          }
        }
      };

      if (action === 'addxp') {
        const amount = interaction.options.getInteger('valeur', true);
        stats.xp += amount;
        stats.xpSinceLevel += amount;
        let required = xpRequiredForNext(stats.level, levels.levelCurve);
        let leveled = false;
        while (stats.xpSinceLevel >= required) {
          stats.xpSinceLevel -= required;
          stats.level += 1;
          leveled = true;
          required = xpRequiredForNext(stats.level, levels.levelCurve);
        }
        await setUserStats(interaction.guild.id, target.id, stats);
        // Final normalization to ensure xpSinceLevel < required
        const norm = xpToLevel(stats.xp, levels.levelCurve);
        if (norm.level !== stats.level || norm.xpSinceLevel !== stats.xpSinceLevel) {
          stats.level = norm.level;
          stats.xpSinceLevel = norm.xpSinceLevel;
          await setUserStats(interaction.guild.id, target.id, stats);
        }
        await applyRewardsUpTo(stats.level);
        const mem = await fetchMember(interaction.guild, target.id);
        if (leveled) {
          maybeAnnounceLevelUp(interaction.guild, mem || memberMention(target.id), levels, stats.level);
          const rid = (levels.rewards || {})[String(stats.level)];
          if (rid) maybeAnnounceRoleAward(interaction.guild, mem || memberMention(target.id), levels, rid);
        }
        return interaction.reply({ content: `Ajouté ${amount} XP à ${target}. Niveau: ${stats.level}`, ephemeral: true });
      }

      if (action === 'removexp') {
        const amount = interaction.options.getInteger('valeur', true);
        const newTotal = Math.max(0, (stats.xp || 0) - amount);
        const norm = xpToLevel(newTotal, levels.levelCurve);
        stats.xp = newTotal;
        stats.level = norm.level;
        stats.xpSinceLevel = norm.xpSinceLevel;
        await setUserStats(interaction.guild.id, target.id, stats);
        return interaction.reply({ content: `Retiré ${amount} XP à ${target}. Niveau: ${stats.level}`, ephemeral: true });
      }

      if (action === 'addlevel') {
        const n = interaction.options.getInteger('valeur', true);
        stats.level = Math.max(0, stats.level + n);
        stats.xpSinceLevel = 0;
        await setUserStats(interaction.guild.id, target.id, stats);
        await applyRewardsUpTo(stats.level);
        const mem = await fetchMember(interaction.guild, target.id);
        if (mem) {
          maybeAnnounceLevelUp(interaction.guild, mem, levels, stats.level);
          const rid = (levels.rewards || {})[String(stats.level)];
          if (rid) maybeAnnounceRoleAward(interaction.guild, mem, levels, rid);
        }
        return interaction.reply({ content: `Ajouté ${n} niveaux à ${target}. Niveau: ${stats.level}`, ephemeral: true });
      }

      if (action === 'removelevel') {
        const n = interaction.options.getInteger('valeur', true);
        stats.level = Math.max(0, stats.level - n);
        stats.xpSinceLevel = 0;
        await setUserStats(interaction.guild.id, target.id, stats);
        return interaction.reply({ content: `Retiré ${n} niveaux à ${target}. Niveau: ${stats.level}`, ephemeral: true });
      }

      if (action === 'setlevel') {
        const lvl = interaction.options.getInteger('valeur', true);
        const norm = xpToLevel(stats.xp, levels.levelCurve);
        stats.level = Math.max(0, lvl);
        stats.xpSinceLevel = 0;
        // Keep total XP consistent with new level floor
        const floor = totalXpAtLevel(stats.level, levels.levelCurve);
        if ((stats.xp || 0) < floor) stats.xp = floor;
        await setUserStats(interaction.guild.id, target.id, stats);
        await applyRewardsUpTo(stats.level);
        const mem = await fetchMember(interaction.guild, target.id);
        if (mem) {
          maybeAnnounceLevelUp(interaction.guild, mem, levels, stats.level);
          const rid = (levels.rewards || {})[String(stats.level)];
          if (rid) maybeAnnounceRoleAward(interaction.guild, mem, levels, rid);
        }
        return interaction.reply({ content: `Niveau de ${target} défini à ${stats.level}`, ephemeral: true });
      }

      return interaction.reply({ content: 'Action inconnue.', ephemeral: true });
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'top') {
      const sub = interaction.options.getSubcommand();
      if (sub === 'niveau') {
        const limit = interaction.options.getInteger('limite') || 10;
        const levels = await getLevelsConfig(interaction.guild.id);
        const entries = Object.entries(levels.users || {});
        if (!entries.length) return interaction.reply({ content: 'Aucune donnée de niveau pour le moment.', ephemeral: true });
        entries.sort((a, b) => {
          const ua = a[1], ub = b[1];
          if ((ub.level || 0) !== (ua.level || 0)) return (ub.level || 0) - (ua.level || 0);
          return (ub.xp || 0) - (ua.xp || 0);
        });
        const { embed, components } = await buildTopNiveauEmbed(interaction.guild, entries, 0, Math.min(25, Math.max(1, limit)));
        return interaction.reply({ embeds: [embed], components });
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith('top_niveau_more:')) {
      const parts = interaction.customId.split(':');
      const offset = Number(parts[1]) || 0;
      const limit = Number(parts[2]) || 10;
      const levels = await getLevelsConfig(interaction.guild.id);
      const entries = Object.entries(levels.users || {});
      entries.sort((a, b) => {
        const ua = a[1], ub = b[1];
        if ((ub.level || 0) !== (ua.level || 0)) return (ub.level || 0) - (ua.level || 0);
        return (ub.xp || 0) - (ua.xp || 0);
      });
      const { embed, components } = await buildTopNiveauEmbed(interaction.guild, entries, offset, Math.min(25, Math.max(1, limit)));
      return interaction.update({ embeds: [embed], components });
    }

    if (interaction.isButton() && interaction.customId.startsWith('top_niveau_page:')) {
      const parts = interaction.customId.split(':');
      const offset = Number(parts[1]) || 0;
      const limit = Number(parts[2]) || 10;
      const levels = await getLevelsConfig(interaction.guild.id);
      const entries = Object.entries(levels.users || {});
      entries.sort((a, b) => {
        const ua = a[1], ub = b[1];
        if ((ub.level || 0) !== (ua.level || 0)) return (ub.level || 0) - (ua.level || 0);
        return (ub.xp || 0) - (ua.xp || 0);
      });
      const { embed, components } = await buildTopNiveauEmbed(interaction.guild, entries, offset, Math.min(25, Math.max(1, limit)));
      return interaction.update({ embeds: [embed], components });
    }

    if (interaction.isRoleSelectMenu() && interaction.customId === 'levels_cards_female_roles') {
      const cfg = await getLevelsConfig(interaction.guild.id);
      await updateLevelsConfig(interaction.guild.id, { cards: { ...(cfg.cards || {}), femaleRoleIds: interaction.values } });
      return interaction.deferUpdate();
    }

    if (interaction.isRoleSelectMenu() && interaction.customId === 'levels_cards_certified_roles') {
      const cfg = await getLevelsConfig(interaction.guild.id);
      await updateLevelsConfig(interaction.guild.id, { cards: { ...(cfg.cards || {}), certifiedRoleIds: interaction.values } });
      return interaction.deferUpdate();
    }

    if (interaction.isButton() && interaction.customId === 'levels_cards_bg_default') {
      const modal = new ModalBuilder().setCustomId('levels_cards_bg_modal:default').setTitle('URL BG par défaut');
      const input = new TextInputBuilder().setCustomId('url').setLabel('URL de l\'image').setStyle(TextInputStyle.Short).setPlaceholder('https://...').setRequired(true).setMaxLength(512);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isButton() && interaction.customId === 'levels_cards_bg_female') {
      const modal = new ModalBuilder().setCustomId('levels_cards_bg_modal:female').setTitle('URL BG femme');
      const input = new TextInputBuilder().setCustomId('url').setLabel('URL de l\'image').setStyle(TextInputStyle.Short).setPlaceholder('https://...').setRequired(true).setMaxLength(512);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isButton() && interaction.customId === 'levels_cards_bg_certified') {
      const modal = new ModalBuilder().setCustomId('levels_cards_bg_modal:certified').setTitle('URL BG certifié');
      const input = new TextInputBuilder().setCustomId('url').setLabel('URL de l\'image').setStyle(TextInputStyle.Short).setPlaceholder('https://...').setRequired(true).setMaxLength(512);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('levels_cards_bg_modal:')) {
      const key = interaction.customId.split(':')[1];
      const url = interaction.fields.getTextInputValue('url');
      await interaction.deferReply({ ephemeral: true });
      const cfg = await getLevelsConfig(interaction.guild.id);
      await updateLevelsConfig(interaction.guild.id, { cards: { ...(cfg.cards || {}), backgrounds: { ...(cfg.cards?.backgrounds || {}), [key]: url } } });
      // Preload to speed up first render
      getCachedImage(url).catch(() => {});
      return interaction.editReply({ content: `✅ Fond ${key} mis à jour.` });
    }
  } catch (err) {
    console.error('Interaction handler error:', err);
    const errorText = typeof err === 'string' ? err : (err && err.message ? err.message : 'Erreur inconnue');
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: `Une erreur est survenue: ${errorText}`, ephemeral: true });
      } else {
        await interaction.reply({ content: `Une erreur est survenue: ${errorText}`, ephemeral: true });
      }
    } catch (_) {}
  }
});