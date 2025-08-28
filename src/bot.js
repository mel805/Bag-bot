const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField, Events } = require('discord.js');
const { setGuildStaffRoleIds, getGuildStaffRoleIds, ensureStorageExists, getAutoKickConfig, updateAutoKickConfig, addPendingJoiner, removePendingJoiner, getLevelsConfig, updateLevelsConfig, getUserStats, setUserStats, getEconomyConfig, updateEconomyConfig, getEconomyUser, setEconomyUser } = require('./storage/jsonStore');
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
      { label: 'Économie', value: 'economy', description: "Configurer l'économie" },
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
  const femaleRoles = new RoleSelectMenuBuilder().setCustomId('levels_cards_female_roles').setPlaceholder('Rôles "femme"... (multi)').setMinValues(0).setMaxValues(25);
  const certifiedRoles = new RoleSelectMenuBuilder().setCustomId('levels_cards_certified_roles').setPlaceholder('Rôles "certifié"... (multi)').setMinValues(0).setMaxValues(25);
  const rowFemale = new ActionRowBuilder().addComponents(femaleRoles);
  const rowCert = new ActionRowBuilder().addComponents(certifiedRoles);
  const bgDefaultBtn = new ButtonBuilder().setCustomId('levels_cards_bg_default').setLabel('BG par défaut').setStyle(ButtonStyle.Primary);
  const bgFemaleBtn = new ButtonBuilder().setCustomId('levels_cards_bg_female').setLabel('BG femme').setStyle(ButtonStyle.Primary);
  const bgCertifiedBtn = new ButtonBuilder().setCustomId('levels_cards_bg_certified').setLabel('BG certifié').setStyle(ButtonStyle.Primary);
  const rowButtons = new ActionRowBuilder().addComponents(bgDefaultBtn, bgFemaleBtn, bgCertifiedBtn);
  return [nav, rowFemale, rowCert, rowButtons];
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
  const perMap = levels.cards?.perRoleBackgrounds || {};
  // If we have a member with roles, try per-role mapping first
  if (memberOrMention && memberOrMention.roles) {
    for (const [rid, url] of Object.entries(perMap)) {
      if (memberOrMention.roles.cache?.has(rid) && url) return url;
    }
  }
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

async function drawCard(backgroundUrl, title, lines, progressRatio, progressText, avatarUrl, centerText) {
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
    // optional avatar (top-right, larger)
    if (avatarUrl) {
      const av = await getCachedImage(avatarUrl);
      if (av) {
        const size = 160;
        const x = width - 48 - size;
        const y = 48;
        const cx = x + size / 2;
        const cy = y + size / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(av.img, x, y, size, size);
        ctx.restore();
        // ring
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // title (slightly bigger)
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 2;
    ctx.font = '600 32px Georgia, "Times New Roman", Serif';
    ctx.textBaseline = 'top';
    ctx.strokeText(title, 48, 48);
    ctx.fillText(title, 48, 48);
    // content (slightly bigger)
    ctx.font = '18px Georgia, "Times New Roman", Serif';
    let y = 100;
    for (const line of lines) {
      const isEmphasis = line.startsWith('Niveau:') || line.startsWith('Dernière récompense:');
      ctx.font = isEmphasis ? '600 22px Georgia, "Times New Roman", Serif' : '18px Georgia, "Times New Roman", Serif';
      ctx.lineWidth = 2;
      ctx.strokeText(line, 48, y);
      ctx.fillText(line, 48, y);
      y += isEmphasis ? 30 : 28;
    }
    // centered celebration text
    if (centerText) {
      // Try to render 🎉 as image (Twemoji) above the text
      let emojiDrawn = false;
      if (centerText.includes('🎉')) {
        const twemojiUrl = 'https://twemoji.maxcdn.com/v/latest/72x72/1f389.png';
        const em = await getCachedImage(twemojiUrl);
        if (em) {
          const esize = 72;
          const ex = (width / 2) - (esize / 2);
          const ey = (height / 2) - esize - 6;
          ctx.drawImage(em.img, ex, ey, esize, esize);
          emojiDrawn = true;
        }
      }
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 40px Georgia, "Times New Roman", Serif';
      const ty = emojiDrawn ? (height / 2) + 28 : (height / 2);
      ctx.strokeText(centerText, width / 2, ty);
      ctx.fillText(centerText, width / 2, ty);
      ctx.restore();
    }
    // progress bar (optional)
    if (typeof progressRatio === 'number') {
      const ratio = Math.max(0, Math.min(1, progressRatio));
      const barX = 48;
      const barW = width - 96;
      const barH = 22;
      const barY = height - 48 - barH - 10;
      // label
      if (progressText) {
        ctx.font = '600 16px Georgia, "Times New Roman", Serif';
        ctx.strokeText(progressText, 48, barY - 22);
        ctx.fillText(progressText, 48, barY - 22);
      }
      // bg
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(barX, barY, barW, barH);
      // fill
      ctx.fillStyle = '#1e88e5';
      ctx.fillRect(barX, barY, Math.round(barW * ratio), barH);
      // border
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.strokeRect(barX, barY, barW, barH);
    }
    return canvas.toBuffer('image/png');
  } catch (_) {
    return null;
  }
}

function memberDisplayName(guild, memberOrMention, userIdFallback) {
  if (memberOrMention && memberOrMention.user) {
    return memberOrMention.nickname || memberOrMention.user.username;
  }
  if (userIdFallback) {
    const m = guild.members.cache.get(userIdFallback);
    if (m) return m.nickname || m.user.username;
  }
  return userIdFallback ? `Membre ${userIdFallback}` : 'Membre';
}

function maybeAnnounceLevelUp(guild, memberOrMention, levels, newLevel) {
  const ann = levels.announce?.levelUp || {};
  if (!ann.enabled || !ann.channelId) return;
  const channel = guild.channels.cache.get(ann.channelId);
  if (!channel || !channel.isTextBased?.()) return;
  const bg = chooseCardBackgroundForMember(memberOrMention, levels);
  const lastReward = getLastRewardForLevel(levels, newLevel);
  const roleName = lastReward ? (guild.roles.cache.get(lastReward.roleId)?.name || `Rôle ${lastReward.roleId}`) : null;
  const name = memberDisplayName(guild, memberOrMention, memberOrMention?.id);
  const avatarUrl = memberOrMention?.user?.displayAvatarURL?.({ extension: 'png', size: 256 }) || null;
  const lines = [
    `Niveau: ${newLevel}`,
    lastReward ? `Dernière récompense: ${roleName} (niv ${lastReward.level})` : 'Dernière récompense: —',
  ];
  drawCard(bg, `${name} monte de niveau !`, lines, undefined, undefined, avatarUrl, '🎉 Félicitations !').then((img) => {
    if (img) channel.send({ files: [{ attachment: img, name: 'levelup.png' }] }).catch(() => {});
    else channel.send({ content: `🎉 ${name} passe niveau ${newLevel} !` }).catch(() => {});
  });
}

function maybeAnnounceRoleAward(guild, memberOrMention, levels, roleId) {
  const ann = levels.announce?.roleAward || {};
  if (!ann.enabled || !ann.channelId || !roleId) return;
  const channel = guild.channels.cache.get(ann.channelId);
  if (!channel || !channel.isTextBased?.()) return;
  const bg = chooseCardBackgroundForMember(memberOrMention, levels);
  const roleName = guild.roles.cache.get(roleId)?.name || `Rôle ${roleId}`;
  const name = memberDisplayName(guild, memberOrMention, memberOrMention?.id);
  const avatarUrl = memberOrMention?.user?.displayAvatarURL?.({ extension: 'png', size: 128 }) || null;
  drawCard(bg, `${name} reçoit un rôle !`, [`Rôle: ${roleName}`], undefined, undefined, avatarUrl).then((img) => {
    if (img) channel.send({ files: [{ attachment: img, name: 'role.png' }] }).catch(() => {});
    else channel.send({ content: `🏅 ${name} reçoit le rôle ${roleName} !` }).catch(() => {});
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
    const msgs = st.messages || 0;
    const vmin = Math.floor((st.voiceMsAccum||0)/60000);
    return `${medalFor(rank)} **${display}** • Lvl ${lvl} • ${xp} XP • Msg ${msgs} • Voc ${vmin}m`;
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

// Add Economy config UI (basic Settings page)
async function buildEconomySettingsRows(guild) {
  const eco = await getEconomyConfig(guild.id);
  const curBtn = new ButtonBuilder().setCustomId('economy_set_currency').setLabel(`Devise: ${eco.currency?.symbol || '🪙'} ${eco.currency?.name || 'BAG$'}`).setStyle(ButtonStyle.Secondary);
  const baseBtn = new ButtonBuilder().setCustomId('economy_set_base').setLabel(`Gains: work ${eco.settings?.baseWorkReward || 50} / fish ${eco.settings?.baseFishReward || 30}`).setStyle(ButtonStyle.Secondary);
  const cdBtn = new ButtonBuilder().setCustomId('economy_set_cooldowns').setLabel('Cooldowns des actions (rapide)').setStyle(ButtonStyle.Secondary);
  const row = new ActionRowBuilder().addComponents(curBtn, baseBtn, cdBtn);
  return [row];
}

function actionKeyToLabel(key) {
  const map = { steal: 'voler', kiss: 'embrasser', flirt: 'flirter', seduce: 'séduire', fuck: 'fuck', massage: 'masser', dance: 'danser', crime: 'crime' };
  return map[key] || key;
}

async function buildEconomyActionsRows(guild) {
  const eco = await getEconomyConfig(guild.id);
  const enabled = Array.isArray(eco.actions?.enabled) ? eco.actions.enabled : Object.keys(eco.actions?.config || {});
  const options = enabled.map((k) => {
    const c = (eco.actions?.config || {})[k] || {};
    const karma = c.karma === 'perversion' ? '😈' : '🫦';
    return { label: `${actionKeyToLabel(k)} • ${karma} • ${c.moneyMin||0}-${c.moneyMax||0} • ${c.cooldown||0}s`, value: k };
  });
  if (options.length === 0) options.push({ label: 'Aucune action', value: 'none' });
  const select = new StringSelectMenuBuilder().setCustomId('economy_actions_pick').setPlaceholder('Choisir une action à modifier…').addOptions(...options);
  const row = new ActionRowBuilder().addComponents(select);
  return [row];
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
  // Suites cleanup every 5 minutes
  setInterval(async () => {
    try {
      const guild = readyClient.guilds.cache.get(guildId) || await readyClient.guilds.fetch(guildId).catch(()=>null);
      if (!guild) return;
      const eco = await getEconomyConfig(guild.id);
      const active = eco.suites?.active || {};
      const now = Date.now();
      let modified = false;
      for (const [uid, info] of Object.entries(active)) {
        if (!info || typeof info.expiresAt !== 'number') continue;
        if (now >= info.expiresAt) {
          // delete channels
          for (const cid of [info.textId, info.voiceId]) {
            if (!cid) continue;
            const ch = guild.channels.cache.get(cid) || await guild.channels.fetch(cid).catch(()=>null);
            if (ch) await ch.delete().catch(()=>{});
          }
          delete active[uid];
          modified = true;
        }
      }
      if (modified) {
        eco.suites = { ...(eco.suites||{}), active };
        await updateEconomyConfig(guild.id, eco);
      }
    } catch (_) {}
  }, 5 * 60 * 1000);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'config') {
      const hasManageGuild = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild) || interaction.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild);
      if (!hasManageGuild) {
        return interaction.reply({ content: '⛔ Cette commande est réservée à l\'équipe de modération.', ephemeral: true });
      }
      const embed = await buildConfigEmbed(interaction.guild);
      const sectionSelect = new StringSelectMenuBuilder()
        .setCustomId('config_section')
        .setPlaceholder('Choisir une section…')
        .addOptions(
          { label: 'Staff', value: 'staff', description: 'Gérer les rôles Staff' },
          { label: 'AutoKick', value: 'autokick', description: 'Configurer l\'auto-kick' },
          { label: 'Levels', value: 'levels', description: 'Configurer XP & niveaux' },
          { label: 'Économie', value: 'economy', description: 'Configurer l\'économie' }
        );
      const row = new ActionRowBuilder().addComponents(sectionSelect);
      await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'config_section') {
      const section = interaction.values[0];
      const embed = await buildConfigEmbed(interaction.guild);
      if (section === 'staff') {
        const staffAction = buildStaffActionRow();
        await interaction.update({ embeds: [embed], components: [buildBackRow(), staffAction] });
      } else if (section === 'autokick') {
        const akRows = await buildAutokickRows(interaction.guild);
        await interaction.update({ embeds: [embed], components: [buildBackRow(), ...akRows] });
      } else if (section === 'levels') {
        const rows = await buildLevelsGeneralRows(interaction.guild);
        await interaction.update({ embeds: [embed], components: [...rows] });
      } else if (section === 'economy') {
        const rows = await buildEconomyMenuRows(interaction.guild, 'settings');
        await interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
      } else {
        await interaction.update({ embeds: [embed], components: [buildBackRow()] });
      }
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'economy_menu') {
      const page = interaction.values[0];
      const embed = await buildConfigEmbed(interaction.guild);
      const top = buildTopSectionRow();
      let rows;
      if (page === 'suites') {
        rows = [buildEconomyMenuSelect(page), ...(await buildSuitesRows(interaction.guild))];
      } else if (page === 'shop') {
        rows = [buildEconomyMenuSelect(page), ...(await buildShopRows(interaction.guild))];
      } else {
        rows = await buildEconomyMenuRows(interaction.guild, page);
      }
      return interaction.update({ embeds: [embed], components: [top, ...rows] });
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
      } else if (sub === 'economie') {
        const limit = Math.max(1, Math.min(25, interaction.options.getInteger('limite') || 10));
        const eco = await getEconomyConfig(interaction.guild.id);
        const entries = Object.entries(eco.balances || {});
        const sorted = entries.sort((a,b) => (b[1]?.amount||0) - (a[1]?.amount||0)).slice(0, limit);
        const lines = [];
        for (let i=0; i<sorted.length; i++) {
          const [uid, state] = sorted[i];
          let tag = `<@${uid}>`;
          try { const m = await interaction.guild.members.fetch(uid); tag = m.user ? `${m.user.username}` : tag; } catch (_) {}
          const charm = state?.charm || 0;
          const perv = state?.perversion || 0;
          lines.push(`${i+1}. ${tag} — ${state?.amount||0} ${eco.currency?.name || 'BAG$'} • 🫦 ${charm} • 😈 ${perv}`);
        }
        const embed = buildEcoEmbed({
          title: 'Classement Économie',
          description: lines.join('\n') || '—',
          fields: [ { name: 'Devise', value: `${eco.currency?.symbol || '🪙'} ${eco.currency?.name || 'BAG$'}`, inline: true }, { name: 'Entrées', value: String(sorted.length), inline: true } ],
        });
        return interaction.reply({ embeds: [embed] });
      } else {
        return interaction.reply({ content: 'Action inconnue.', ephemeral: true });
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

    if (interaction.isButton() && interaction.customId === 'economy_set_currency') {
      const modal = new ModalBuilder().setCustomId('economy_currency_modal').setTitle('Devise');
      const symbol = new TextInputBuilder().setCustomId('symbol').setLabel('Symbole').setStyle(TextInputStyle.Short).setPlaceholder('🪙').setRequired(true).setMaxLength(4);
      const name = new TextInputBuilder().setCustomId('name').setLabel('Nom').setStyle(TextInputStyle.Short).setPlaceholder('BAG$').setRequired(true).setMaxLength(16);
      modal.addComponents(new ActionRowBuilder().addComponents(symbol), new ActionRowBuilder().addComponents(name));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'economy_currency_modal') {
      await interaction.deferReply({ ephemeral: true });
      const symbol = interaction.fields.getTextInputValue('symbol');
      const name = interaction.fields.getTextInputValue('name');
      const eco = await updateEconomyConfig(interaction.guild.id, { currency: { symbol, name } });
      return interaction.editReply({ content: `✅ Devise mise à jour: ${eco.currency.symbol} ${eco.currency.name}` });
    }

    if (interaction.isButton() && interaction.customId === 'economy_set_base') {
      const modal = new ModalBuilder().setCustomId('economy_base_modal').setTitle('Gains de base');
      const work = new TextInputBuilder().setCustomId('work').setLabel('work').setStyle(TextInputStyle.Short).setPlaceholder('50').setRequired(true);
      const fish = new TextInputBuilder().setCustomId('fish').setLabel('fish').setStyle(TextInputStyle.Short).setPlaceholder('30').setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(work), new ActionRowBuilder().addComponents(fish));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'economy_base_modal') {
      await interaction.deferReply({ ephemeral: true });
      const work = Number(interaction.fields.getTextInputValue('work')) || 0;
      const fish = Number(interaction.fields.getTextInputValue('fish')) || 0;
      const eco = await getEconomyConfig(interaction.guild.id);
      eco.settings = { ...(eco.settings || {}), baseWorkReward: work, baseFishReward: fish };
      await updateEconomyConfig(interaction.guild.id, eco);
      return interaction.editReply({ content: `✅ Gains: work ${work} / fish ${fish}` });
    }

    if (interaction.isButton() && interaction.customId === 'economy_set_cooldowns') {
      const modal = new ModalBuilder().setCustomId('economy_cd_modal').setTitle('Cooldowns (secondes)');
      const fields = ['work','fish','give','steal','kiss','flirt','seduce','fuck','massage','dance'];
      const rows = fields.map((f) => new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(f).setLabel(f).setStyle(TextInputStyle.Short).setPlaceholder('0/60/300...').setRequired(false)));
      modal.addComponents(...rows.slice(0,5)); // Discord modal max 5 components
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'economy_cd_modal') {
      await interaction.deferReply({ ephemeral: true });
      const eco = await getEconomyConfig(interaction.guild.id);
      const cds = { ...(eco.settings?.cooldowns || {}) };
      for (const f of ['work','fish','give','steal','kiss','flirt','seduce','fuck','massage','dance']) {
        const v = interaction.fields.getTextInputValue(f);
        if (v !== null && v !== undefined && v !== '') cds[f] = Math.max(0, Number(v) || 0);
      }
      eco.settings = { ...(eco.settings || {}), cooldowns: cds };
      await updateEconomyConfig(interaction.guild.id, eco);
      return interaction.editReply({ content: '✅ Cooldowns mis à jour.' });
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'eco') {
      const sub = interaction.options.getSubcommand();
      const eco = await getEconomyConfig(interaction.guild.id);
      const curr = `${eco.currency?.symbol || '🪙'} ${eco.currency?.name || 'BAG$'}`;
      // Load user state
      const userId = interaction.user.id;
      const u = await getEconomyUser(interaction.guild.id, userId);
      const now = Date.now();
      const cd = (k)=>Math.max(0, (u.cooldowns?.[k]||0)-now);
      const setCd=(k,sec)=>{ if(!u.cooldowns) u.cooldowns={}; u.cooldowns[k]=now+sec*1000; };
      if (sub === 'solde') {
        return interaction.reply({ content: `Votre solde: ${u.amount || 0} ${eco.currency?.name || 'BAG$'}` });
      }
      if (sub === 'travailler') {
        if (cd('work')>0) return interaction.reply({ content: `Veuillez patienter ${Math.ceil(cd('work')/1000)}s avant de retravailler.`, ephemeral: true });
        const gain = Math.max(0, eco.settings?.baseWorkReward || 50);
        u.amount = (u.amount||0) + gain;
        setCd('work', Math.max(0, eco.settings?.cooldowns?.work || 600));
        await setEconomyUser(interaction.guild.id, userId, u);
        return interaction.reply({ content: `Vous avez travaillé et gagné ${gain} ${eco.currency?.name || 'BAG$'}. Solde: ${u.amount}` });
      }
      if (sub === 'pecher') {
        if (cd('fish')>0) return interaction.reply({ content: `Veuillez patienter ${Math.ceil(cd('fish')/1000)}s avant de repêcher.`, ephemeral: true });
        const gain = Math.max(0, eco.settings?.baseFishReward || 30);
        u.amount = (u.amount||0) + gain;
        setCd('fish', Math.max(0, eco.settings?.cooldowns?.fish || 300));
        await setEconomyUser(interaction.guild.id, userId, u);
        return interaction.reply({ content: `Vous avez pêché et gagné ${gain} ${eco.currency?.name || 'BAG$'}. Solde: ${u.amount}` });
      }
      if (sub === 'donner') {
        const cible = interaction.options.getUser('membre', true);
        const montant = interaction.options.getInteger('montant', true);
        if ((u.amount||0) < montant) return interaction.reply({ content: `Solde insuffisant.`, ephemeral: true });
        u.amount = (u.amount||0) - montant;
        await setEconomyUser(interaction.guild.id, userId, u);
        const tu = await getEconomyUser(interaction.guild.id, cible.id);
        tu.amount = (tu.amount||0) + montant;
        await setEconomyUser(interaction.guild.id, cible.id, tu);
        return interaction.reply({ content: `Vous avez donné ${montant} ${eco.currency?.name || 'BAG$'} à ${cible}. Votre solde: ${u.amount}` });
      }
      return interaction.reply({ content: 'Action non implémentée pour le moment.', ephemeral: true });
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'boutique') {
      const embed = new EmbedBuilder().setColor(THEME_COLOR_PRIMARY).setTitle('Boutique BAG').setDescription('Sélectionnez un article à acheter.').setThumbnail(THEME_IMAGE);
      const rows = await buildBoutiqueRows(interaction.guild);
      return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'boutique_select') {
      const eco = await getEconomyConfig(interaction.guild.id);
      const u = await getEconomyUser(interaction.guild.id, interaction.user.id);
      const choice = interaction.values[0];
      if (choice === 'none') return interaction.deferUpdate();
      if (choice.startsWith('item:')) {
        const id = choice.split(':')[1];
        const it = (eco.shop?.items || []).find(x => String(x.id) === String(id));
        if (!it) return interaction.reply({ content: 'Article indisponible.', ephemeral: true });
        const price = Number(it.price||0);
        if ((u.amount||0) < price) return interaction.reply({ content: 'Solde insuffisant.', ephemeral: true });
        u.amount = (u.amount||0) - price;
        await setEconomyUser(interaction.guild.id, interaction.user.id, u);
        const embed = buildEcoEmbed({ title: 'Achat réussi', description: `Vous avez acheté: ${it.name||it.id} pour ${price} ${eco.currency?.name || 'BAG$'}`, fields: [ { name: 'Solde', value: String(u.amount), inline: true } ] });
        return interaction.update({ embeds: [embed], components: [] });
      }
      if (choice.startsWith('role:')) {
        const [, roleId, durStr] = choice.split(':');
        const entry = (eco.shop?.roles || []).find(r => String(r.roleId) === String(roleId) && String(r.durationDays||0) === String(Number(durStr)||0));
        if (!entry) return interaction.reply({ content: 'Rôle indisponible.', ephemeral: true });
        const price = Number(entry.price||0);
        if ((u.amount||0) < price) return interaction.reply({ content: 'Solde insuffisant.', ephemeral: true });
        u.amount = (u.amount||0) - price;
        await setEconomyUser(interaction.guild.id, interaction.user.id, u);
        try {
          const member = await interaction.guild.members.fetch(interaction.user.id);
          await member.roles.add(roleId);
        } catch (_) {}
        const label = entry.name || (interaction.guild.roles.cache.get(roleId)?.name) || roleId;
        const embed = buildEcoEmbed({ title: 'Achat réussi', description: `Rôle attribué: ${label} (${entry.durationDays?`${entry.durationDays}j`:'permanent'}) pour ${price} ${eco.currency?.name || 'BAG$'}`, fields: [ { name: 'Solde', value: String(u.amount), inline: true } ] });
        return interaction.update({ embeds: [embed], components: [] });
      }
      if (choice.startsWith('suite:')) {
        const key = choice.split(':')[1];
        const prices = eco.suites?.prices || { day:0, week:0, month:0 };
        const daysMap = { day: eco.suites?.durations?.day || 1, week: eco.suites?.durations?.week || 7, month: eco.suites?.durations?.month || 30 };
        const price = Number(prices[key]||0);
        if ((u.amount||0) < price) return interaction.reply({ content: 'Solde insuffisant.', ephemeral: true });
        const categoryId = eco.suites?.categoryId || '';
        if (!categoryId) return interaction.reply({ content: 'Catégorie des suites non définie. Configurez-la dans /config → Économie → Suites.', ephemeral: true });
        u.amount = (u.amount||0) - price;
        await setEconomyUser(interaction.guild.id, interaction.user.id, u);
        // Create private channels
        const parent = interaction.guild.channels.cache.get(categoryId);
        if (!parent) return interaction.reply({ content: 'Catégorie introuvable. Reconfigurez-la.', ephemeral: true });
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const overwrites = [
          { id: interaction.guild.roles.everyone.id, deny: ['ViewChannel'] },
          { id: member.id, allow: ['ViewChannel','SendMessages','Connect','Speak'] },
        ];
        const nameBase = `suite-${member.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,20);
        const text = await interaction.guild.channels.create({ name: `${nameBase}-txt`, type: ChannelType.GuildText, parent: parent.id, permissionOverwrites: overwrites });
        const voice = await interaction.guild.channels.create({ name: `${nameBase}-vc`, type: ChannelType.GuildVoice, parent: parent.id, permissionOverwrites: overwrites });
        const now = Date.now();
        const ms = (daysMap[key] || 1) * 24 * 60 * 60 * 1000;
        const until = now + ms;
        const cfg = await getEconomyConfig(interaction.guild.id);
        cfg.suites = { ...(cfg.suites||{}), active: { ...(cfg.suites?.active||{}), [member.id]: { textId: text.id, voiceId: voice.id, expiresAt: until } } };
        await updateEconomyConfig(interaction.guild.id, cfg);
        const embed = buildEcoEmbed({ title: 'Suite privée créée', description: `Vos salons privés ont été créés pour ${daysMap[key]} jour(s).`, fields: [ { name: 'Texte', value: `<#${text.id}>`, inline: true }, { name: 'Vocal', value: `<#${voice.id}>`, inline: true }, { name: 'Expiration', value: `<t:${Math.floor(until/1000)}:R>`, inline: true } ] });
        return interaction.update({ embeds: [embed], components: [] });
      }
      return interaction.reply({ content: 'Choix invalide.', ephemeral: true });
    }

    // French economy top-level commands
    if (interaction.isChatInputCommand() && interaction.commandName === 'solde') {
      const eco = await getEconomyConfig(interaction.guild.id);
      const u = await getEconomyUser(interaction.guild.id, interaction.user.id);
      const embed = buildEcoEmbed({
        title: 'Votre solde',
        description: `
**Montant**: ${u.amount || 0} ${eco.currency?.name || 'BAG$'}
**Karma charme**: ${u.charm || 0} • **Karma perversion**: ${u.perversion || 0}
        `.trim(),
        fields: [ { name: 'Devise', value: `${eco.currency?.symbol || '🪙'} ${eco.currency?.name || 'BAG$'}`, inline: true } ],
      });
      return interaction.reply({ embeds: [embed] });
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'travailler') {
      return runEcoAction(interaction, 'work');
    }
    if (interaction.isChatInputCommand() && (interaction.commandName === 'pêcher' || interaction.commandName === 'pecher')) {
      return runEcoAction(interaction, 'fish');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'donner') {
      const eco = await getEconomyConfig(interaction.guild.id);
      const userId = interaction.user.id;
      const u = await getEconomyUser(interaction.guild.id, userId);
      const cible = interaction.options.getUser('membre', true);
      const montant = Math.max(1, interaction.options.getInteger('montant', true));
      if ((u.amount||0) < montant) return interaction.reply({ content: 'Solde insuffisant.', ephemeral: true });
      u.amount = (u.amount||0) - montant;
      await setEconomyUser(interaction.guild.id, interaction.user.id, u);
      const tu = await getEconomyUser(interaction.guild.id, cible.id);
      tu.amount = (tu.amount||0) + montant;
      await setEconomyUser(interaction.guild.id, cible.id, tu);
      const embed = buildEcoEmbed({
        title: 'Donner',
        description: `Vous avez donné ${montant} ${eco.currency?.name || 'BAG$'} à ${cible}.`,
        fields: [ { name: 'Votre solde', value: String(u.amount), inline: true } ],
      });
      return interaction.reply({ embeds: [embed] });
    }

    // Economy action executor (hoisted)
    async function runEcoAction(interaction, key, targetUserOptional) {
      try { console.log('[action]', key, 'start'); } catch (_) {}
      const eco = await getEconomyConfig(interaction.guild.id);
      const userId = interaction.user.id;
      const u = await getEconomyUser(interaction.guild.id, userId);
      const now = Date.now();
      const conf = eco.actions?.config?.[key] || { moneyMin: 5, moneyMax: 15, karma: 'charm', karmaDelta: 1, cooldown: 60 };
      const remain = Math.max(0, (u.cooldowns?.[key]||0)-now);
      if (remain>0) return interaction.reply({ content: `Veuillez patienter ${Math.ceil(remain/1000)}s avant de refaire cette action.` });

      // Defer first, then edit with final result
      try { await interaction.deferReply(); } catch (_) {}

      const successRate = typeof conf.successRate === 'number' ? conf.successRate : (key === 'fish' ? 0.65 : 0.8);
      const isSuccess = Math.random() < successRate;

      const next = { amount: u.amount||0, charm: u.charm||0, perversion: u.perversion||0, cooldowns: { ...(u.cooldowns||{}) } };
      next.cooldowns[key] = now + (Math.max(0, conf.cooldown || 60))*1000;

      let title;
      let descLine;
      let targetField = null;
      const hasTarget = targetUserOptional && targetUserOptional.id !== userId;
      let targetEconNext = null;
      let targetXpDelta = 0;
      let targetMoneyDelta = 0;
      let targetKarmaDelta = 0;
      if (!isSuccess) {
        const lose = Math.floor((conf.failMoneyMin ?? 0) + Math.random() * Math.max(0, (conf.failMoneyMax ?? 0) - (conf.failMoneyMin ?? 0)));
        next.amount = Math.max(0, next.amount - lose);
        if (conf.karma === 'charm') next.charm = Math.max(0, next.charm - Math.max(0, conf.failKarmaDelta || 0));
        else if (conf.karma === 'perversion') next.perversion = Math.max(0, next.perversion - Math.max(0, conf.failKarmaDelta || 0));
        if (hasTarget) {
          const tgt = await getEconomyUser(interaction.guild.id, targetUserOptional.id);
          targetEconNext = { amount: tgt.amount||0, charm: tgt.charm||0, perversion: tgt.perversion||0, cooldowns: { ...(tgt.cooldowns||{}) } };
          const tLose = Math.floor(lose / 2);
          targetEconNext.amount = Math.max(0, targetEconNext.amount - tLose);
          targetMoneyDelta = -tLose;
          const tK = Math.max(1, Math.ceil((conf.failKarmaDelta || conf.karmaDelta || 1)/2));
          if (conf.karma === 'charm') { targetEconNext.charm = Math.max(0, targetEconNext.charm - tK); targetKarmaDelta = -tK; }
          else if (conf.karma === 'perversion') { targetEconNext.perversion = Math.max(0, targetEconNext.perversion - tK); targetKarmaDelta = -tK; }
          targetField = `Cible ${targetUserOptional}: ${tLose>0?`-${tLose} ${eco.currency?.name || 'BAG$'}`:'—'} • Karma ${conf.karma === 'perversion' ? '😈' : (conf.karma === 'none' ? '—' : '🫦')} ${targetKarmaDelta}`;
        }
        let failText = 'Action manquée… Réessayez plus tard.';
        if (key === 'fish') failText = pickRandom(FISH_FAIL);
        else if (key === 'work') failText = pickRandom(WORK_FAIL);
        else if (key === 'kiss') failText = pickRandom(KISS_FAIL);
        else if (key === 'flirt') failText = pickRandom(FLIRT_FAIL);
        else if (key === 'seduce') failText = pickRandom(SEDUCE_FAIL);
        else if (key === 'fuck') failText = pickRandom(FUCK_FAIL);
        else if (key === 'massage') failText = pickRandom(MASSAGE_FAIL);
        else if (key === 'dance') failText = pickRandom(DANCE_FAIL);
        else if (key === 'crime') failText = pickRandom(CRIME_FAIL);
        title = `❌ ${actionKeyToLabel(key)}${targetUserOptional ? ` avec ${targetUserOptional}` : ''}`;
        descLine = `${failText}${(lose>0)?`\n-${lose} ${eco.currency?.name || 'BAG$'}`:''}`;
      } else {
        const gain = Math.floor(conf.moneyMin + Math.random() * Math.max(0, conf.moneyMax - conf.moneyMin));
        next.amount = next.amount + gain;
        if (conf.karma === 'charm') next.charm = next.charm + (conf.karmaDelta||0);
        else if (conf.karma === 'perversion') next.perversion = next.perversion + (conf.karmaDelta||0);
        if (hasTarget) {
          const tgt = await getEconomyUser(interaction.guild.id, targetUserOptional.id);
          targetEconNext = { amount: tgt.amount||0, charm: tgt.charm||0, perversion: tgt.perversion||0, cooldowns: { ...(tgt.cooldowns||{}) } };
          const tK = Math.max(1, Math.ceil((conf.karmaDelta || 1)/2));
          if (conf.karma === 'charm') { targetEconNext.charm = (targetEconNext.charm||0) + tK; targetKarmaDelta = tK; }
          else if (conf.karma === 'perversion') { targetEconNext.perversion = (targetEconNext.perversion||0) + tK; targetKarmaDelta = tK; }
          // Levels XP for target (small bonus)
          const levels = await getLevelsConfig(interaction.guild.id);
          if (levels?.enabled) {
            const xpAdd = Math.max(1, Math.round((levels.xpPerMessage || 10) / 2));
            const tStats = await getUserStats(interaction.guild.id, targetUserOptional.id);
            const prevLevel = tStats.level || 0;
            tStats.xp = (tStats.xp||0) + xpAdd;
            const norm = xpToLevel(tStats.xp, levels.levelCurve || { base: 100, factor: 1.2 });
            tStats.level = norm.level;
            tStats.xpSinceLevel = norm.xpSinceLevel;
            await setUserStats(interaction.guild.id, targetUserOptional.id, tStats);
            targetXpDelta = xpAdd;
            if (tStats.level > prevLevel) {
              const mem = await fetchMember(interaction.guild, targetUserOptional.id);
              if (mem) {
                maybeAnnounceLevelUp(interaction.guild, mem, levels, tStats.level);
                const rid = (levels.rewards || {})[String(tStats.level)];
                if (rid) {
                  try { await mem.roles.add(rid); } catch (_) {}
                  maybeAnnounceRoleAward(interaction.guild, mem, levels, rid);
                }
              }
            }
          }
          targetField = `Cible ${targetUserOptional}: XP ${targetXpDelta||0} • Karma ${conf.karma === 'perversion' ? '😈' : (conf.karma === 'none' ? '—' : '🫦')} ${targetKarmaDelta}`;
        }
        const icon = conf.karma === 'perversion' ? '😈' : '🫦';
        title = `${icon} ${actionKeyToLabel(key)}${targetUserOptional ? ` avec ${targetUserOptional}` : ''}`;
        let line;
        if (key === 'fish') line = pickRandom(FISH_SUCCESS);
        else if (key === 'work') line = pickRandom(WORK_SUCCESS);
        else if (key === 'kiss') line = pickRandom(KISS_SUCCESS);
        else if (key === 'flirt') line = pickRandom(FLIRT_SUCCESS);
        else if (key === 'seduce') line = pickRandom(SEDUCE_SUCCESS);
        else if (key === 'fuck') line = pickRandom(FUCK_SUCCESS);
        else if (key === 'massage') line = pickRandom(MASSAGE_SUCCESS);
        else if (key === 'dance') line = pickRandom(DANCE_SUCCESS);
        else if (key === 'crime') line = pickRandom(CRIME_SUCCESS);
        else line = 'Action réussie.';
        descLine = `${line}\n+${Math.max(0, next.amount - (u.amount||0))} ${eco.currency?.name || 'BAG$'}`;
      }

      const embed = buildEcoEmbed({
        title,
        description: descLine,
        fields: [
          { name: 'Karma', value: `${conf.karma === 'perversion' ? 'perversion 😈' : (conf.karma === 'none' ? '—' : 'charme 🫦')} ${conf.karma === 'none' ? '' : `${isSuccess?'+':'-'}${Math.max(0, isSuccess?(conf.karmaDelta||0):(conf.failKarmaDelta||0))}`}`.trim(), inline: true },
          { name: 'Solde', value: String(next.amount), inline: true },
          { name: 'Cooldown', value: `${Math.max(0, conf.cooldown || 60)}s`, inline: true },
          ...(targetField ? [{ name: 'Effet cible', value: targetField, inline: false }] : []),
        ],
      });

      // Persist state, then edit reply
      try { await setEconomyUser(interaction.guild.id, userId, { amount: next.amount, charm: next.charm, perversion: next.perversion, cooldowns: next.cooldowns }); } catch (_) {}
      if (targetEconNext) { setEconomyUser(interaction.guild.id, targetUserOptional.id, targetEconNext).catch(()=>{}); }
      try { return await interaction.editReply({ embeds: [embed], content: '' }); } catch (e) {
        console.error('[action] editReply failed', e);
        return await interaction.editReply({ content: `${title}\n${descLine}\nSolde: ${next.amount}\nCooldown: ${Math.max(0, conf.cooldown || 60)}s${targetField?`\n${targetField}`:''}` });
      }
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'voler') {
      const cible = interaction.options.getUser('membre', true);
      if (cible.id === interaction.user.id) return interaction.reply({ content: 'Impossible de vous voler vous-même.', ephemeral: true });
      if (Math.random() < 0.5) {
        return runEcoAction(interaction, 'steal', cible);
      } else {
        try { await interaction.deferReply({ ephemeral: true }); } catch (_) {}
        const eco = await getEconomyConfig(interaction.guild.id);
        const u = await getEconomyUser(interaction.guild.id, interaction.user.id);
        const penalty = Math.min(u.amount||0, 10);
        u.amount = (u.amount||0) - penalty;
        if (!u.cooldowns) u.cooldowns={};
        const conf = eco.actions?.config?.steal || { cooldown: 1800 };
        u.cooldowns.steal = Date.now() + (Math.max(0, conf.cooldown || 1800))*1000;
        setEconomyUser(interaction.guild.id, interaction.user.id, u).catch(()=>{});
        const msg = `😵 Échec du vol\n${pickRandom(STEAL_FAIL)}\nAmende ${penalty} ${eco.currency?.name || 'BAG$'}\nSolde: ${u.amount}`;
        try { return await interaction.editReply({ content: msg }); } catch (_) { return; }
      }
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'embrasser') {
      const cible = interaction.options.getUser('cible');
      return runEcoAction(interaction, 'kiss', cible);
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'flirter') {
      const cible = interaction.options.getUser('cible');
      return runEcoAction(interaction, 'flirt', cible);
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'séduire') {
      const cible = interaction.options.getUser('cible');
      return runEcoAction(interaction, 'seduce', cible);
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'fuck') {
      const cible = interaction.options.getUser('cible');
      return runEcoAction(interaction, 'fuck', cible);
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'masser') {
      const cible = interaction.options.getUser('cible');
      return runEcoAction(interaction, 'massage', cible);
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'danser') {
      const cible = interaction.options.getUser('cible');
      return runEcoAction(interaction, 'dance', cible);
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'crime') {
      const cible = interaction.options.getUser('complice');
      return runEcoAction(interaction, 'crime', cible);
    }

    if (interaction.isButton() && interaction.customId.startsWith('economy_page:')) {
      const page = interaction.customId.split(':')[1];
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = page === 'actions' ? await buildEconomyActionsRows(interaction.guild) : await buildEconomySettingsRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'economy_actions_pick') {
      const key = interaction.values[0];
      if (key === 'none') return interaction.deferUpdate();
      const eco = await getEconomyConfig(interaction.guild.id);
      const c = eco.actions?.config?.[key] || {};
      const modal = new ModalBuilder().setCustomId(`economy_actions_modal:${key}`).setTitle(`Modifier: ${actionKeyToLabel(key)}`);
      const moneyMin = new TextInputBuilder().setCustomId('moneyMin').setLabel('Argent min').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('5').setValue(String(c.moneyMin ?? ''));
      const moneyMax = new TextInputBuilder().setCustomId('moneyMax').setLabel('Argent max').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('15').setValue(String(c.moneyMax ?? ''));
      const karma = new TextInputBuilder().setCustomId('karma').setLabel('Karma (charme/perversion)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('charme').setValue(c.karma === 'perversion' ? 'perversion' : 'charme');
      const karmaDelta = new TextInputBuilder().setCustomId('karmaDelta').setLabel('Variation karma').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('1').setValue(String(c.karmaDelta ?? ''));
      const cooldown = new TextInputBuilder().setCustomId('cooldown').setLabel('Cooldown (s)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('60').setValue(String(c.cooldown ?? ''));
      modal.addComponents(
        new ActionRowBuilder().addComponents(moneyMin),
        new ActionRowBuilder().addComponents(moneyMax),
        new ActionRowBuilder().addComponents(karma),
        new ActionRowBuilder().addComponents(karmaDelta),
        new ActionRowBuilder().addComponents(cooldown)
      );
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('economy_actions_modal:')) {
      await interaction.deferReply({ ephemeral: true });
      const key = interaction.customId.split(':')[1];
      const moneyMin = Number(interaction.fields.getTextInputValue('moneyMin')) || 0;
      const moneyMax = Number(interaction.fields.getTextInputValue('moneyMax')) || 0;
      const karmaTxt = (interaction.fields.getTextInputValue('karma')||'').toLowerCase().includes('per') ? 'perversion' : 'charm';
      const karmaDelta = Number(interaction.fields.getTextInputValue('karmaDelta')) || 0;
      const cooldown = Number(interaction.fields.getTextInputValue('cooldown')) || 0;
      const eco = await getEconomyConfig(interaction.guild.id);
      const conf = { ...(eco.actions?.config || {}) };
      conf[key] = { moneyMin, moneyMax, karma: karmaTxt, karmaDelta, cooldown };
      await updateEconomyConfig(interaction.guild.id, { actions: { ...(eco.actions||{}), config: conf } });
      return interaction.editReply({ content: `✅ Action "${actionKeyToLabel(key)}" mise à jour.` });
    }

    if (interaction.isButton() && interaction.customId === 'config_back_home') {
      const embed = await buildConfigEmbed(interaction.guild);
      const sectionSelect = new StringSelectMenuBuilder()
        .setCustomId('config_section')
        .setPlaceholder('Choisir une section…')
        .addOptions(
          { label: 'Staff', value: 'staff', description: 'Gérer les rôles Staff' },
          { label: 'AutoKick', value: 'autokick', description: 'Configurer l\'auto-kick' },
          { label: 'Levels', value: 'levels', description: 'Configurer XP & niveaux' },
          { label: 'Économie', value: 'economy', description: 'Configurer l\'économie' }
        );
      const row = new ActionRowBuilder().addComponents(sectionSelect);
      return interaction.update({ embeds: [embed], components: [row] });
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'economie') {
      try {
        try { await interaction.deferReply({ ephemeral: true }); console.log('/economie: deferred'); } catch (eDef) { console.error('/economie: defer failed', eDef); }
        const eco = await getEconomyConfig(interaction.guild?.id || '');
        const u = await getEconomyUser(interaction.guild?.id || '', interaction.user.id);
        const embed = buildEcoEmbed({
          title: `Économie de ${interaction.user.username}`,
          fields: [
            { name: 'Argent', value: String(u.amount || 0), inline: true },
            { name: 'Charme 🫦', value: String(u.charm || 0), inline: true },
            { name: 'Perversion 😈', value: String(u.perversion || 0), inline: true },
          ],
        });
        try {
          console.log('/economie: editing reply with embed');
          return await interaction.editReply({ embeds: [embed] });
        } catch (eEdit) {
          console.error('/economie: editReply failed', eEdit);
          const text = `Économie de ${interaction.user.username}\nArgent: ${u.amount||0} ${eco.currency?.name || 'BAG$'}\nCharme 🫦: ${u.charm||0}\nPerversion 😈: ${u.perversion||0}`;
          try {
            console.log('/economie: editing reply with text');
            return await interaction.editReply({ content: text, allowedMentions: { parse: [] } });
          } catch (eEdit2) {
            console.error('/economie: editReply (text) failed', eEdit2);
            try {
              console.log('/economie: replying fresh with text');
              return await interaction.reply({ content: text, ephemeral: true, allowedMentions: { parse: [] } });
            } catch (eReply) {
              console.error('/economie: reply failed', eReply);
              try {
                console.log('/economie: channel.send fallback');
                await interaction.channel?.send({ content: text, allowedMentions: { parse: [] } });
                return;
              } catch (eSend) {
                console.error('/economie: channel.send failed', eSend);
                return;
              }
            }
          }
        }
      } catch (e1) {
        console.error('/economie failed (defer/edit):', e1);
        try { return await interaction.editReply({ content: 'Erreur lors de l\'affichage de votre économie.', ephemeral: true }); } catch (_) {}
        try { return await interaction.reply({ content: 'Erreur lors de l\'affichage de votre économie.', ephemeral: true }); } catch (_) { return; }
      }
    }

    // Suites UI rows
    async function buildSuitesRows(guild) {
      const eco = await getEconomyConfig(guild.id);
      const catSelect = new StringSelectMenuBuilder()
        .setCustomId('suites_category_select')
        .setPlaceholder('Choisir la catégorie parent des suites privées…')
        .addOptions(
          ...(guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).map(c => ({ label: c.name, value: c.id }))?.toJSON?.() || [])
        );
      const pricesBtn = new ButtonBuilder().setCustomId('suites_set_prices').setLabel(`Prix: 1j ${eco.suites?.prices?.day||0} • 1sem ${eco.suites?.prices?.week||0} • 1mois ${eco.suites?.prices?.month||0}`).setStyle(ButtonStyle.Secondary);
      return [new ActionRowBuilder().addComponents(catSelect), new ActionRowBuilder().addComponents(pricesBtn)];
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'suites_category_select') {
      const catId = interaction.values[0];
      const eco = await getEconomyConfig(interaction.guild.id);
      eco.suites = { ...(eco.suites||{}), categoryId: catId };
      await updateEconomyConfig(interaction.guild.id, eco);
      const embed = await buildConfigEmbed(interaction.guild);
      const top = buildTopSectionRow();
      const rows = [buildEconomyMenuSelect('suites'), ...(await buildSuitesRows(interaction.guild))];
      return interaction.update({ embeds: [embed], components: [top, ...rows] });
    }

    if (interaction.isButton() && interaction.customId === 'suites_set_prices') {
      const eco = await getEconomyConfig(interaction.guild.id);
      const modal = new ModalBuilder().setCustomId('suites_prices_modal').setTitle('Prix suites privées');
      const day = new TextInputBuilder().setCustomId('day').setLabel('1 jour').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(eco.suites?.prices?.day||0));
      const week = new TextInputBuilder().setCustomId('week').setLabel('1 semaine').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(eco.suites?.prices?.week||0));
      const month = new TextInputBuilder().setCustomId('month').setLabel('1 mois').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(eco.suites?.prices?.month||0));
      modal.addComponents(new ActionRowBuilder().addComponents(day), new ActionRowBuilder().addComponents(week), new ActionRowBuilder().addComponents(month));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'suites_prices_modal') {
      await interaction.deferReply({ ephemeral: true });
      const day = Math.max(0, Number(interaction.fields.getTextInputValue('day'))||0);
      const week = Math.max(0, Number(interaction.fields.getTextInputValue('week'))||0);
      const month = Math.max(0, Number(interaction.fields.getTextInputValue('month'))||0);
      const eco = await getEconomyConfig(interaction.guild.id);
      eco.suites = { ...(eco.suites||{}), prices: { day, week, month } };
      await updateEconomyConfig(interaction.guild.id, eco);
      return interaction.editReply({ content: '✅ Prix des suites mis à jour.' });
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'niveau') {
      try {
        await interaction.reply({ content: '⏳ Génération de la carte…' });
      } catch (_) {}
      try {
        const target = interaction.options.getUser('membre') || interaction.user;
        const member = await interaction.guild.members.fetch(target.id).catch(()=>null);
        const levels = await getLevelsConfig(interaction.guild.id);
        const stats = await getUserStats(interaction.guild.id, target.id);
        const name = memberDisplayName(interaction.guild, member, target.id);
        const avatarUrl = member?.user?.displayAvatarURL?.({ extension: 'png', size: 256 }) || target.displayAvatarURL?.({ extension: 'png', size: 256 }) || null;
        const curve = levels.levelCurve || { base: 100, factor: 1.2 };
        const lvl = stats.level || 0;
        const required = Math.max(1, xpRequiredForNext(lvl, curve));
        const progress = Math.min(1, Math.max(0, (stats.xpSinceLevel || 0) / required));
        const lastReward = getLastRewardForLevel(levels, lvl);
        const roleName = lastReward ? (interaction.guild.roles.cache.get(lastReward.roleId)?.name || `Rôle ${lastReward.roleId}`) : '—';
        const lines = [
          `Niveau: ${lvl} (${stats.xpSinceLevel||0}/${required})`,
          `Dernière récompense: ${roleName}`,
          `Messages: ${stats.messages||0} • Vocal: ${Math.floor((stats.voiceMsAccum||0)/60000)} min`,
        ];
        const bg = chooseCardBackgroundForMember(member, levels);
        const img = await drawCard(bg, `${name}`, lines, progress, `${Math.round(progress*100)}%`, avatarUrl);
        if (img) {
          try { return await interaction.editReply({ content: '', files: [{ attachment: img, name: 'niveau.png' }] }); } catch (_) {}
        }
        return await interaction.editReply({ content: `${name} — Niveau ${lvl} (${stats.xpSinceLevel||0}/${required}) • Dernière récompense: ${roleName} • Messages: ${stats.messages||0} • Vocal: ${Math.floor((stats.voiceMsAccum||0)/60000)} min` });
      } catch (e) {
        console.error('/niveau failed:', e);
        try { return await interaction.editReply({ content: 'Erreur lors de l\'affichage du niveau.' }); } catch (_) {}
        try { return await interaction.reply({ content: 'Erreur lors de l\'affichage du niveau.', ephemeral: true }); } catch (_) { return; }
      }
    }

    if (interaction.isButton() && interaction.customId === 'shop_add_item') {
      const modal = new ModalBuilder().setCustomId('shop_add_item_modal').setTitle('Ajouter un objet');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nom').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Prix').setStyle(TextInputStyle.Short).setRequired(true))
      );
      await interaction.showModal(modal);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === 'shop_add_item_modal') {
      await interaction.deferReply({ ephemeral: true });
      const name = interaction.fields.getTextInputValue('name');
      const price = Math.max(0, Number(interaction.fields.getTextInputValue('price'))||0);
      const eco = await getEconomyConfig(interaction.guild.id);
      // generate a simple id
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
      eco.shop = { ...(eco.shop||{}), items: [...(eco.shop?.items||[]), { id, name, price }] };
      await updateEconomyConfig(interaction.guild.id, eco);
      return interaction.editReply({ content: '✅ Objet ajouté.' });
    }

    if (interaction.isButton() && interaction.customId === 'shop_add_role') {
      // Step 1: type select
      const typeSelect = new StringSelectMenuBuilder()
        .setCustomId('shop_add_role_type')
        .setPlaceholder('Type de rôle…')
        .addOptions(
          { label: 'Permanent', value: 'permanent' },
          { label: 'Temporaire', value: 'temporaire' }
        );
      const row = new ActionRowBuilder().addComponents(typeSelect);
      return interaction.reply({ content: 'Choisissez le type de rôle à ajouter:', components: [row], ephemeral: true });
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'shop_add_role_type') {
      const type = interaction.values[0];
      const rolePicker = new RoleSelectMenuBuilder().setCustomId(`shop_add_role_pick:${type}`).setPlaceholder('Sélectionner le rôle…').setMinValues(1).setMaxValues(1);
      const row = new ActionRowBuilder().addComponents(rolePicker);
      return interaction.update({ content: 'Sélectionnez le rôle:', components: [row] });
    }
    if (interaction.isRoleSelectMenu() && interaction.customId.startsWith('shop_add_role_pick:')) {
      const type = interaction.customId.split(':')[1];
      const roleId = interaction.values[0];
      const modal = new ModalBuilder().setCustomId(`shop_add_role_price:${type}:${roleId}`).setTitle('Prix du rôle');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Prix').setStyle(TextInputStyle.Short).setRequired(true)));
      await interaction.showModal(modal);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('shop_add_role_price:')) {
      await interaction.deferReply({ ephemeral: true });
      const [, type, roleId] = interaction.customId.split(':');
      const price = Math.max(0, Number(interaction.fields.getTextInputValue('price'))||0);
      const eco = await getEconomyConfig(interaction.guild.id);
      const durationDays = type === 'temporaire' ? 30 : 0; // default 30j for temporary; can extend to another select later
      eco.shop = { ...(eco.shop||{}), roles: [...(eco.shop?.roles||[]), { roleId, price, durationDays }] };
      await updateEconomyConfig(interaction.guild.id, eco);
      return interaction.editReply({ content: '✅ Rôle ajouté.' });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'shop_remove_select') {
      const values = interaction.values;
      const eco = await getEconomyConfig(interaction.guild.id);
      const keepItems = (eco.shop?.items||[]).filter(it => !values.includes(`item:${it.id}`));
      const keepRoles = (eco.shop?.roles||[]).filter(r => !values.includes(`role:${r.roleId}:${r.durationDays||0}`));
      eco.shop = { items: keepItems, roles: keepRoles };
      await updateEconomyConfig(interaction.guild.id, eco);
      const embed = await buildConfigEmbed(interaction.guild);
      const top = buildTopSectionRow();
      const rows = [buildEconomyMenuSelect('shop'), ...(await buildShopRows(interaction.guild))];
      return interaction.update({ embeds: [embed], components: [top, ...rows] });
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

function buildEconomyMenuSelect(current) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('economy_menu')
    .setPlaceholder('Économie • Choisir une page…')
    .addOptions(
      { label: 'Réglages', value: 'settings', default: current === 'settings' },
      { label: 'Actions', value: 'actions', default: current === 'actions' },
      { label: 'Boutique', value: 'shop', default: current === 'shop' },
      { label: 'Suites privées', value: 'suites', default: current === 'suites' },
    );
  return new ActionRowBuilder().addComponents(select);
}

async function buildEconomyMenuRows(guild, page) {
  const menu = buildEconomyMenuSelect(page);
  if (page === 'actions') {
    const actions = await buildEconomyActionsRows(guild);
    const actionsRow = actions[0];
    return [menu, actionsRow];
  }
  if (page === 'settings') {
    const settings = await buildEconomySettingsRows(guild);
    const settingsRow = settings[0];
    return [menu, settingsRow];
  }
  if (page === 'shop') {
    return [menu];
  }
  if (page === 'suites') {
    return [menu];
  }
  return [menu];
}

function buildBackRow() {
  const back = new ButtonBuilder().setCustomId('config_back_home').setLabel('Retour').setStyle(ButtonStyle.Secondary);
  return new ActionRowBuilder().addComponents(back);
}

function buildEcoEmbed({ title, description, fields, color }) {
  const avatar = client.user && client.user.displayAvatarURL ? client.user.displayAvatarURL() : undefined;
  const embed = new EmbedBuilder()
    .setColor(color || THEME_COLOR_ACCENT)
    .setAuthor({ name: 'Économie • Boy and Girls (BAG)', iconURL: avatar })
    .setTitle(title || 'Économie')
    .setThumbnail(THEME_IMAGE)
    .setFooter({ text: 'BAG • Économie' })
    .setTimestamp(new Date());
  if (typeof description === 'string' && description.length > 0) embed.setDescription(description);
  if (Array.isArray(fields)) embed.addFields(fields);
  return embed;
}

async function buildBoutiqueRows(guild) {
  const eco = await getEconomyConfig(guild.id);
  const items = Array.isArray(eco.shop?.items) ? eco.shop.items : [];
  const roles = Array.isArray(eco.shop?.roles) ? eco.shop.roles : [];
  const options = [];
  for (const it of items) {
    options.push({ label: it.name || it.id, value: `item:${it.id}`, description: `${it.price||0} ${eco.currency?.name || 'BAG$'}` });
  }
  for (const r of roles) {
    const label = r.name || (guild.roles.cache.get(r.roleId)?.name) || r.roleId;
    const dur = r.durationDays ? `${r.durationDays}j` : 'permanent';
    options.push({ label: `Rôle: ${label}`, value: `role:${r.roleId}:${r.durationDays||0}`, description: `${r.price||0} ${eco.currency?.name || 'BAG$'} • ${dur}` });
  }
  // Suite private offers
  const prices = eco.suites?.prices || { day: 0, week: 0, month: 0 };
  options.push({ label: 'Suite privée • 1 jour', value: 'suite:day', description: `${prices.day||0} ${eco.currency?.name || 'BAG$'}` });
  options.push({ label: 'Suite privée • 1 semaine', value: 'suite:week', description: `${prices.week||0} ${eco.currency?.name || 'BAG$'}` });
  options.push({ label: 'Suite privée • 1 mois', value: 'suite:month', description: `${prices.month||0} ${eco.currency?.name || 'BAG$'}` });
  if (options.length === 0) options.push({ label: 'Aucun article disponible', value: 'none', description: 'Revenez plus tard' });
  const select = new StringSelectMenuBuilder().setCustomId('boutique_select').setPlaceholder('Choisissez un article à acheter…').addOptions(...options);
  return [new ActionRowBuilder().addComponents(select)];
}

function pickRandom(array) { return array[Math.floor(Math.random() * array.length)] }
const WORK_SUCCESS = ['Belle journée de travail, mission accomplie !','Vous avez brillamment terminé votre tâche.','Prime méritée pour votre efficacité.','Vos efforts paient, bien joué !']
const WORK_FAIL = ['Contretemps au bureau…','Le projet a été reporté, pas de gain aujourd\'hui.','Panne système, impossible de travailler.']
const KISS_SUCCESS = ['Un doux moment partagé 💋','Baiser accepté 🫦','Tendresse réciproque.']
const KISS_FAIL = ['Baiser esquivé…','Mauvais timing, désolé.','Refus poli.']
const FLIRT_SUCCESS = ['Le charme opère ✨','Clin d\'œil réussi 😉','Conversation enflammée.']
const FLIRT_FAIL = ['Le courant ne passe pas…','Tentative maladroite.','Message vu… ignoré.']
const SEDUCE_SUCCESS = ['Séduction réussie 🔥','Alchimie évidente.','Étincelles dans l\'air.']
const SEDUCE_FAIL = ['Pas aujourd\'hui…','Ça n\'a pas pris.','Tentation sans suite.']
const FUCK_SUCCESS = ['Moment intense 😈','Passion déchaînée.','Nuit mémorable.']
const FUCK_FAIL = ['Pas d\'humeur…','Fatigue, une autre fois.','Ambiance retombée.']
const MASSAGE_SUCCESS = ['Détente absolue 💆','Tensions envolées.','Relaxation profonde.']
const MASSAGE_FAIL = ['Crampes… raté.','Huile renversée, oups.','Nœud récalcitrant.']
const DANCE_SUCCESS = ['Choré synchro 💃','Pas de danse parfaits.','Ambiance de folie.']
const DANCE_FAIL = ['Deux pieds gauches…','Musique coupée !','Glissade imprévue.']
const CRIME_SUCCESS = ['Coup monté réussi 🕶️','Plan sans faute.','Aucune trace laissée.']
const CRIME_FAIL = ['Sirènes au loin… fuyez !','Plan compromis.','Informateur douteux.']
const FISH_SUCCESS = ['Félicitations, vous avez pêché un thon !','Bravo, vous avez pêché un magnifique saumon !','Incroyable, une carpe dorée mord à l\'hameçon !','Quel talent ! Un brochet impressionnant !','Un bar splendide pour le dîner !']
const FISH_FAIL = ['Aïe… la ligne s\'est emmêlée, rien attrapé.','Juste une vieille botte… pas de chance !','Le poisson s\'est échappé au dernier moment !','Silence radio sous l\'eau… aucun poisson aujourd\'hui.']

client.on(Events.MessageCreate, async (message) => {
  try {
    if (!message.guild || message.author.bot) return;
    const levels = await getLevelsConfig(message.guild.id);
    if (!levels?.enabled) return;
    const stats = await getUserStats(message.guild.id, message.author.id);
    stats.messages = (stats.messages||0) + 1;
    // XP for text
    stats.xp = (stats.xp||0) + (levels.xpPerMessage || 10);
    const norm = xpToLevel(stats.xp, levels.levelCurve || { base: 100, factor: 1.2 });
    const prevLevel = stats.level || 0;
    stats.level = norm.level;
    stats.xpSinceLevel = norm.xpSinceLevel;
    await setUserStats(message.guild.id, message.author.id, stats);
    if (stats.level > prevLevel) {
      const mem = await fetchMember(message.guild, message.author.id);
      if (mem) {
        maybeAnnounceLevelUp(message.guild, mem, levels, stats.level);
        const rid = (levels.rewards || {})[String(stats.level)];
        if (rid) {
          try { await mem.roles.add(rid); } catch (_) {}
          maybeAnnounceRoleAward(message.guild, mem, levels, rid);
        }
      }
    }
  } catch (_) {}
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    const guild = newState.guild || oldState.guild;
    if (!guild) return;
    const userId = newState.id || oldState.id;
    const levels = await getLevelsConfig(guild.id);
    if (!levels?.enabled) return;
    const stats = await getUserStats(guild.id, userId);
    const now = Date.now();
    // on join
    if (!oldState.channelId && newState.channelId) {
      stats.voiceJoinedAt = now;
      await setUserStats(guild.id, userId, stats);
      return;
    }
    // on leave
    if (oldState.channelId && !newState.channelId) {
      if (stats.voiceJoinedAt && stats.voiceJoinedAt > 0) {
        const delta = Math.max(0, now - stats.voiceJoinedAt);
        stats.voiceMsAccum = (stats.voiceMsAccum||0) + delta;
        stats.voiceJoinedAt = 0;
        // XP for voice
        const minutes = Math.floor(delta / 60000);
        const xpAdd = minutes * (levels.xpPerVoiceMinute || 5);
        if (xpAdd > 0) {
          stats.xp = (stats.xp||0) + xpAdd;
          const norm = xpToLevel(stats.xp, levels.levelCurve || { base: 100, factor: 1.2 });
          const prevLevel = stats.level || 0;
          stats.level = norm.level;
          stats.xpSinceLevel = norm.xpSinceLevel;
          await setUserStats(guild.id, userId, stats);
          if (stats.level > prevLevel) {
            const mem = await fetchMember(guild, userId);
            if (mem) {
              maybeAnnounceLevelUp(guild, mem, levels, stats.level);
              const rid = (levels.rewards || {})[String(stats.level)];
              if (rid) {
                try { await mem.roles.add(rid); } catch (_) {}
                maybeAnnounceRoleAward(guild, mem, levels, rid);
              }
            }
          }
          return;
        }
        await setUserStats(guild.id, userId, stats);
      }
    }
  } catch (_) {}
});

async function buildShopRows(guild) {
  const eco = await getEconomyConfig(guild.id);
  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('shop_add_role').setLabel('Ajouter un rôle').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('shop_add_item').setLabel('Ajouter un objet').setStyle(ButtonStyle.Secondary)
  );
  const options = [];
  for (const it of (eco.shop?.items || [])) {
    options.push({ label: `Objet: ${it.name || it.id} — ${it.price||0}`, value: `item:${it.id}` });
  }
  for (const r of (eco.shop?.roles || [])) {
    const roleName = guild.roles.cache.get(r.roleId)?.name || r.name || r.roleId;
    const dur = r.durationDays ? `${r.durationDays}j` : 'permanent';
    options.push({ label: `Rôle: ${roleName} — ${r.price||0} (${dur})`, value: `role:${r.roleId}:${r.durationDays||0}` });
  }
  const remove = new StringSelectMenuBuilder().setCustomId('shop_remove_select').setPlaceholder('Supprimer des articles…').setMinValues(0).setMaxValues(Math.min(25, Math.max(1, options.length || 1)));
  if (options.length) remove.addOptions(...options); else remove.addOptions({ label: 'Aucun article', value: 'none' }).setDisabled(true);
  const removeRow = new ActionRowBuilder().addComponents(remove);
  return [controls, removeRow];
}