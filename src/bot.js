const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, RoleSelectMenuBuilder, UserSelectMenuBuilder, StringSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField, Events } = require('discord.js');
let ErelaManager;
try { ({ Manager: ErelaManager } = require('erela.js')); } catch (_) { ErelaManager = null; }
const { setGuildStaffRoleIds, getGuildStaffRoleIds, ensureStorageExists, getAutoKickConfig, updateAutoKickConfig, addPendingJoiner, removePendingJoiner, getLevelsConfig, updateLevelsConfig, getUserStats, setUserStats, getEconomyConfig, updateEconomyConfig, getEconomyUser, setEconomyUser, getTruthDareConfig, updateTruthDareConfig, addTdChannels, removeTdChannels, addTdPrompts, deleteTdPrompts, getConfessConfig, updateConfessConfig, addConfessChannels, removeConfessChannels, incrementConfessCounter, getGeoConfig, setUserLocation, getUserLocation, getAllLocations, getAutoThreadConfig, updateAutoThreadConfig, getCountingConfig, updateCountingConfig, setCountingState, getDisboardConfig, updateDisboardConfig, getLogsConfig, updateLogsConfig } = require('./storage/jsonStore');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
let ytDlp;
try { ytDlp = require('yt-dlp-exec'); } catch (_) { ytDlp = null; }

const fs2 = require('fs');
const YTDLP_BIN = process.env.YTDLP_BIN || '/workspace/bin/yt-dlp';
async function getLocalYtDlpAudioUrl(urlOrId) {
  const target = /^https?:\/\//.test(urlOrId) ? urlOrId : `https://www.youtube.com/watch?v=${urlOrId}`;
  try {
    const { spawn } = require('node:child_process');
    const args = [
      '-f', 'bestaudio[ext=m4a]/bestaudio/best',
      '--no-warnings', '--no-check-certificates', '--dump-single-json', target
    ];
    const child = spawn(YTDLP_BIN, args, { stdio: ['ignore','pipe','pipe'] });
    let out = '';
    await new Promise((resolve) => {
      child.stdout.on('data', d => { out += d.toString('utf8'); });
      child.on('close', () => resolve());
      child.on('error', () => resolve());
    });
    try {
      const j = JSON.parse(out);
      const fmts = Array.isArray(j?.formats) ? j.formats : [];
      const cand = fmts.filter(f => (!f.vcodec || f.vcodec === 'none') && f.acodec && f.url).sort((a,b)=> (b.tbr||0)-(a.tbr||0))[0];
      return cand?.url || j?.url || null;
    } catch (_) { return null; }
  } catch (_) { return null; }
}

async function getPipedAudioUrl(videoId) {
  const hosts = [
    'https://piped.video',
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.mha.fi',
  ];
  for (const host of hosts) {
    try {
      const r = await fetch(`${host}/streams/${videoId}`);
      if (!r.ok) continue;
      const j = await r.json();
      const streams = Array.isArray(j?.audioStreams) ? j.audioStreams : (Array.isArray(j?.audio) ? j.audio : []);
      if (!Array.isArray(streams) || !streams.length) continue;
      const best = streams.sort((a,b)=> (b.bitrate||0)-(a.bitrate||0))[0];
      if (best && typeof best.url === 'string' && best.url) return best.url;
    } catch (_) { /* try next host */ }
  }
  return null;
}
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
const CERTIFIED_LOGO_URL = process.env.CERTIFIED_LOGO_URL || '';
const CERTIFIED_ROSEGOLD = String(process.env.CERTIFIED_ROSEGOLD || 'false').toLowerCase() === 'true';

if (!token || !guildId) {
  console.error('Missing DISCORD_TOKEN or GUILD_ID in environment');
  process.exit(2);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.GuildMember, Partials.Message, Partials.Channel],
});

// Keepalive HTTP server for Render Web Services (bind PORT)
function startKeepAliveServer() {
  const port = Number(process.env.PORT || 0);
  if (!port) return;
  try {
    const http = require('http');
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      if (req.url === '/health') return res.end('OK');
      return res.end('BAG bot running');
    });
    server.listen(port, '0.0.0.0', () => {
      try { console.log(`[KeepAlive] listening on ${port}`); } catch (_) {}
    });
  } catch (e) {
    try { console.error('[KeepAlive] failed:', e?.message || e); } catch (_) {}
  }
}
startKeepAliveServer();

// Local YT audio proxy for Lavalink (streams bestaudio via yt-dlp)
let ytProxyStarted = false;
function shouldStartYtProxy() {
  if (String(process.env.ENABLE_YTDLP_PROXY || 'true').toLowerCase() === 'false') return false;
  try { return fs2.existsSync(YTDLP_BIN); } catch (_) { return false; }
}
function startYtProxyServer() {
  if (ytProxyStarted) return;
  if (!shouldStartYtProxy()) return;
  try {
    const http = require('http');
    const { spawn } = require('node:child_process');
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, 'http://localhost');
        if (!url.pathname.startsWith('/yt/')) { res.statusCode = 404; return res.end('Not found'); }
        const vid = url.pathname.split('/')[2] || '';
        if (!vid || !/^[A-Za-z0-9_-]{8,}$/.test(vid)) { res.statusCode = 400; return res.end('Bad id'); }
        const target = `https://www.youtube.com/watch?v=${vid}`;
        const args = ['-f','bestaudio[ext=m4a]/bestaudio/best','--no-warnings','--no-check-certificates','--dump-single-json', target];
        const child = spawn(YTDLP_BIN, args, { stdio: ['ignore','pipe','pipe'] });
        let out = '';
        child.stdout.on('data', d => { out += d.toString('utf8'); });
        child.on('close', () => {
          try {
            const j = JSON.parse(out);
            const fmts = Array.isArray(j?.formats) ? j.formats : [];
            const cand = fmts.filter(f => (!f.vcodec || f.vcodec === 'none') && f.acodec && f.url).sort((a,b)=> (b.tbr||0)-(a.tbr||0))[0];
            if (cand?.url) {
              res.writeHead(302, { Location: cand.url });
              return res.end();
            }
          } catch (_) {}
          res.statusCode = 502; res.end('No audio');
        });
      } catch (_) {
        res.statusCode = 500; res.end('ERR');
      }
    });
    server.listen(8765, '127.0.0.1', () => { try { console.log('[YTProxy] listening on 127.0.0.1:8765'); } catch (_) {} });
    ytProxyStarted = true;
  } catch (_) { /* ignore */ }
}

// Enhanced color palette for better Discord rendering
const THEME_COLORS = {
  PRIMARY: 0x1e88e5,     // Blue
  ACCENT: 0xec407a,      // Pink
  SUCCESS: 0x4caf50,     // Green
  WARNING: 0xff9800,     // Orange
  ERROR: 0xf44336,       // Red
  INFO: 0x2196f3,        // Light Blue
  PURPLE: 0x9c27b0,      // Purple
  TEAL: 0x009688,        // Teal
  GOLD: 0xffd700,        // Gold
  ROSE_GOLD: 0xe6a2b8,   // Rose Gold
  DARK: 0x2c2f33,        // Dark Gray
  LIGHT: 0xeceff4        // Light Gray
};

const THEME_COLOR_PRIMARY = THEME_COLORS.PRIMARY;
const THEME_COLOR_ACCENT = THEME_COLORS.ACCENT;
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

async function isStaffMember(guild, member) {
  try {
    const { getGuildStaffRoleIds } = require('./storage/jsonStore');
    const staffRoleIds = await getGuildStaffRoleIds(guild.id);
    if (Array.isArray(staffRoleIds) && staffRoleIds.length) {
      return Boolean(member?.roles?.cache?.some(r => staffRoleIds.includes(r.id)));
    }
  } catch (_) {}
  // Fallback: use Discord permissions for moderation
  return member?.permissions?.has?.(PermissionsBitField.Flags.ModerateMembers) || false;
}

function buildModEmbed(title, description, extras, options = {}) {
  // Determine color based on action type
  let color = THEME_COLOR_ACCENT;
  if (title.includes('Arrivée') || title.includes('créé')) color = THEME_COLORS.SUCCESS;
  else if (title.includes('Départ') || title.includes('supprimé')) color = THEME_COLORS.WARNING;
  else if (title.includes('Erreur') || title.includes('Échec')) color = THEME_COLORS.ERROR;
  else if (title.includes('Sauvegarde') || title.includes('Info')) color = THEME_COLORS.INFO;
  else if (options.color) color = options.color;

  // Enhanced title with emoji context
  let enhancedTitle = title;
  if (!title.includes('•') && !title.includes('🎉') && !title.includes('💋')) {
    if (title.includes('Arrivée')) enhancedTitle = `🎉 ${title}`;
    else if (title.includes('Départ')) enhancedTitle = `👋 ${title}`;
    else if (title.includes('Message supprimé')) enhancedTitle = `🗑️ ${title}`;
    else if (title.includes('Message modifié')) enhancedTitle = `✏️ ${title}`;
    else if (title.includes('Thread')) enhancedTitle = `🧵 ${title}`;
    else if (title.includes('Sauvegarde')) enhancedTitle = `💾 ${title}`;
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(enhancedTitle)
    .setDescription(description || null)
    .setThumbnail(THEME_IMAGE)
    .setTimestamp(new Date())
    .setFooter({ text: 'BAG • Modération', iconURL: options.footerIcon });
  
  if (Array.isArray(extras) && extras.length) {
    embed.addFields(extras.map(field => ({
      ...field,
      inline: field.inline !== false // Default to inline for better layout
    })));
  }
  
  return embed;
}

async function sendLog(guild, categoryKey, embed) {
  try {
    const cfg = await getLogsConfig(guild.id);
    if (!cfg?.categories?.[categoryKey]) return;
    const channelId = (cfg.channels && cfg.channels[categoryKey]) || cfg.channelId;
    if (!channelId) return;
    let ch = guild.channels.cache.get(channelId);
    if (!ch) { try { ch = await guild.channels.fetch(channelId).catch(()=>null); } catch (_) { ch = null; } }
    try { console.log('[Logs] sendLog', { guild: guild.id, categoryKey, channelId, ch_ok: Boolean(ch) }); } catch (_) {}
    if (!ch || typeof ch.send !== 'function') { try { console.log('[Logs] channel invalid or cannot send'); } catch (_) {} return; }
    await ch.send({ embeds: [embed] }).then(() => { try { console.log('[Logs] sent OK'); } catch (_) {} }).catch((e) => { try { console.error('[Logs] send failed', e?.message||e); } catch (_) {} });
  } catch (_) {}
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

  const avatar = client.user && client.user.displayAvatarURL ? client.user.displayAvatarURL() : null;
  
  const embed = createEnhancedEmbed({
    title: '⚙️ BAG · Configuration',
    description: '**Panneau de configuration avancé** 🎛️\n\n> Choisissez une section puis ajustez les paramètres\n\n*Personnalisez votre serveur selon vos besoins* ✨',
    color: pickThemeColorForGuild(guild),
    thumbnail: THEME_IMAGE,
    image: THEME_IMAGE,
    footerText: 'Boy and Girls (BAG) • Config',
    footerIcon: avatar,
    fields: [
      { 
        name: '👥 Rôles Staff', 
        value: staffList || '*Aucun rôle configuré*', 
        inline: true 
      },
      { 
        name: '🚪 AutoKick', 
        value: `**État:** ${ak.enabled ? 'Activé ✅' : 'Désactivé ⛔'}\n**Rôle requis:** ${roleDisplay}\n**Délai:** ${formatDuration(ak.delayMs)}`, 
        inline: true 
      },
      { 
        name: '📊 Système de Niveaux', 
        value: `**État:** ${levels.enabled ? 'Activé ✅' : 'Désactivé ⛔'}\n**XP texte:** ${levels.xpPerMessage}\n**XP vocal/min:** ${levels.xpPerVoiceMinute}\n**Courbe:** base=${levels.levelCurve.base}, facteur=${levels.levelCurve.factor}`, 
        inline: true 
      },
      { 
        name: '🏆 Récompenses (niveau → rôle)', 
        value: rewardsText || '*Aucune récompense configurée*', 
        inline: false 
      }
    ]
  });

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
      { label: 'Booster', value: 'booster', description: 'Récompenses boosters de serveur' },
      { label: 'Action/Vérité', value: 'truthdare', description: 'Configurer le jeu' },
      { label: 'Confessions', value: 'confess', description: 'Configurer les confessions anonymes' },
      { label: 'AutoThread', value: 'autothread', description: 'Créer des fils automatiquement' },
      { label: 'Comptage', value: 'counting', description: 'Configurer le salon de comptage' },
      { label: 'Logs', value: 'logs', description: "Configurer les journaux d'activité" },
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

// Add subtle particle effects to enhance visual appeal
function drawParticleEffects(ctx, width, height) {
  ctx.save();
  // Create subtle sparkle effects
  const particleCount = 12;
  for (let i = 0; i < particleCount; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const size = Math.random() * 3 + 1;
    const opacity = Math.random() * 0.4 + 0.1;
    
    ctx.globalAlpha = opacity;
    ctx.fillStyle = `rgba(30, 136, 229, ${opacity})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    
    // Add a subtle glow
    ctx.shadowColor = 'rgba(30, 136, 229, 0.3)';
    ctx.shadowBlur = size * 2;
    ctx.fill();
  }
  ctx.restore();
}

// Enhanced card drawing with visual effects
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
    
    // Add subtle particle effects
    drawParticleEffects(ctx, width, height);
    // Enhanced overlay panel with gradient
    const overlayGradient = ctx.createLinearGradient(24, 24, 24, height - 24);
    overlayGradient.addColorStop(0, 'rgba(0,0,0,0.3)');
    overlayGradient.addColorStop(0.5, 'rgba(0,0,0,0.6)');
    overlayGradient.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = overlayGradient;
    ctx.fillRect(24, 24, width - 48, height - 48);
    
    // Add subtle border glow
    ctx.strokeStyle = 'rgba(30, 136, 229, 0.3)';
    ctx.lineWidth = 3;
    ctx.strokeRect(24, 24, width - 48, height - 48);
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
        // Enhanced ring with glow effect
        ctx.save();
        // Outer glow
        ctx.shadowColor = 'rgba(30, 136, 229, 0.8)';
        ctx.shadowBlur = 15;
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
        ctx.stroke();
        
        // Inner highlight ring
        ctx.shadowBlur = 0;
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(30, 136, 229, 0.6)';
        ctx.beginPath();
        ctx.arc(cx, cy, size / 2 - 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    // Enhanced title with gradient and glow
    ctx.save();
    ctx.font = '600 32px Georgia, "Times New Roman", Serif';
    ctx.textBaseline = 'top';
    
    // Create gradient for title text
    const titleGradient = ctx.createLinearGradient(48, 48, 48, 80);
    titleGradient.addColorStop(0, '#ffffff');
    titleGradient.addColorStop(1, '#e3f2fd');
    
    // Outer glow
    ctx.shadowColor = 'rgba(30, 136, 229, 0.6)';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 3;
    ctx.strokeText(title, 48, 48);
    
    // Reset shadow and apply gradient fill
    ctx.shadowBlur = 0;
    ctx.fillStyle = titleGradient;
    ctx.fillText(title, 48, 48);
    ctx.restore();
    // Enhanced content with better styling
    let y = 100;
    for (const line of lines) {
      const isEmphasis = line.startsWith('Niveau:') || line.startsWith('Dernière récompense:');
      ctx.save();
      ctx.font = isEmphasis ? '600 22px Georgia, "Times New Roman", Serif' : '18px Georgia, "Times New Roman", Serif';
      
      if (isEmphasis) {
        // Gradient for emphasis lines
        const emphasisGradient = ctx.createLinearGradient(48, y, 48, y + 22);
        emphasisGradient.addColorStop(0, '#ffd700');
        emphasisGradient.addColorStop(1, '#ffb300');
        ctx.fillStyle = emphasisGradient;
        
        // Subtle glow for emphasis
        ctx.shadowColor = 'rgba(255, 215, 0, 0.4)';
        ctx.shadowBlur = 4;
      } else {
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 2;
      }
      
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = isEmphasis ? 2 : 1;
      ctx.strokeText(line, 48, y);
      ctx.fillText(line, 48, y);
      ctx.restore();
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
      // Enhanced progress bar with gradients and glow
      ctx.save();
      
      // Background with subtle gradient
      const bgGradient = ctx.createLinearGradient(barX, barY, barX, barY + barH);
      bgGradient.addColorStop(0, 'rgba(255,255,255,0.1)');
      bgGradient.addColorStop(1, 'rgba(255,255,255,0.2)');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(barX, barY, barW, barH);
      
      // Progress fill with animated gradient
      if (ratio > 0) {
        const progressGradient = ctx.createLinearGradient(barX, barY, barX, barY + barH);
        progressGradient.addColorStop(0, '#42a5f5');
        progressGradient.addColorStop(0.5, '#1e88e5');
        progressGradient.addColorStop(1, '#1565c0');
        ctx.fillStyle = progressGradient;
        
        // Add glow to progress bar
        ctx.shadowColor = 'rgba(30, 136, 229, 0.5)';
        ctx.shadowBlur = 6;
        ctx.fillRect(barX, barY, Math.round(barW * ratio), barH);
        ctx.shadowBlur = 0;
      }
      
      // Enhanced border
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeRect(barX, barY, barW, barH);
      
      // Inner border highlight
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(30, 136, 229, 0.4)';
      ctx.strokeRect(barX + 1, barY + 1, barW - 2, barH - 2);
      ctx.restore();
    }
    return canvas.toBuffer('image/png');
  } catch (_) {
    return null;
  }
}

function memberHasCertifiedRole(memberOrMention, levels) {
  try {
    const certIds = new Set(Array.isArray(levels?.cards?.certifiedRoleIds) ? levels.cards.certifiedRoleIds : []);
    return Boolean(memberOrMention?.roles?.cache?.some(r => certIds.has(r.id)));
  } catch (_) { return false; }
}

function fitText(ctx, text, maxWidth, baseSize, fontFamily) {
  let size = baseSize;
  for (; size >= 12; size -= 2) {
    ctx.font = `700 ${size}px ${fontFamily}`;
    if (ctx.measureText(text).width <= maxWidth) break;
  }
  return size;
}

function applyGoldStyles(ctx, x, y, text, maxWidth, size, variant = 'gold') {
  const gold = variant === 'rosegold'
    ? { light: '#F6C2D2', mid: '#E6A2B8', dark: '#B76E79' }
    : { light: '#FFEEC7', mid: '#FFD700', dark: '#B8860B' };
  const grad = ctx.createLinearGradient(x, y - size, x, y + size);
  grad.addColorStop(0, gold.light);
  grad.addColorStop(0.5, gold.mid);
  grad.addColorStop(1, gold.dark);
  ctx.lineJoin = 'round';
  // Outer shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = Math.max(6, Math.round(size * 0.12));
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = Math.max(4, Math.round(size * 0.12));
  ctx.strokeText(text, x, y);
  ctx.restore();
  // Inner highlight
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(2, Math.round(size * 0.06));
  ctx.strokeText(text, x, y - 1);
  ctx.restore();
  // Fill
  ctx.fillStyle = grad;
  ctx.fillText(text, x, y);
}
async function drawCertifiedCard(options) {
  const { backgroundUrl, name, sublines, footerLines, logoUrl, useRoseGold } = options;
  try {
    const entry = await getCachedImage(backgroundUrl);
    const fallbackW = 1280, fallbackH = 720;
    const maxW = 1280;
    const width = entry ? Math.max(640, Math.round((entry.width > maxW ? maxW / entry.width : 1) * entry.width)) : fallbackW;
    const height = entry ? Math.max(360, Math.round((entry.width > maxW ? maxW / entry.width : 1) * entry.height)) : fallbackH;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    if (entry) ctx.drawImage(entry.img, 0, 0, width, height);
    else {
      // Enhanced fallback background with sophisticated gradient
      const bg = ctx.createRadialGradient(width/2, height/2, 0, width/2, height/2, Math.max(width, height)/2);
      bg.addColorStop(0, '#2a2a2a');
      bg.addColorStop(0.3, '#1e1e1e');
      bg.addColorStop(0.7, '#141414');
      bg.addColorStop(1, '#0a0a0a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);
      
      // Add subtle texture overlay
      const textureGradient = ctx.createLinearGradient(0, 0, width, height);
      textureGradient.addColorStop(0, 'rgba(30, 136, 229, 0.05)');
      textureGradient.addColorStop(0.5, 'rgba(236, 64, 122, 0.03)');
      textureGradient.addColorStop(1, 'rgba(30, 136, 229, 0.05)');
      ctx.fillStyle = textureGradient;
      ctx.fillRect(0, 0, width, height);
    }
    // Soft vignette
    const grd = ctx.createRadialGradient(width/2, height/2, Math.min(width,height)/6, width/2, height/2, Math.max(width,height)/1.1);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, width, height);
    // Center logo (optional)
    if (logoUrl) {
      const lg = await getCachedImage(logoUrl);
      if (lg) {
        const s = Math.floor(Math.min(width, height) * 0.25);
        const x = Math.floor((width - s)/2);
        const y = Math.floor((height - s)/2) - 10;
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.drawImage(lg.img, x, y, s, s);
        ctx.restore();
      }
    }
    const serif = '"Times New Roman", Garamond, Georgia, Serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Main title
    const mainTitle = 'PROMOTION DE PRESTIGE';
    let size = fitText(ctx, mainTitle, Math.floor(width*0.9), Math.floor(height*0.12), serif);
    ctx.font = `700 ${size}px ${serif}`;
    applyGoldStyles(ctx, Math.floor(width/2), Math.floor(height*0.18), mainTitle, Math.floor(width*0.9), size, useRoseGold?'rosegold':'gold');
    // Sublines (user and message)
    const baseY = Math.floor(height*0.35);
    const userLine = String(name||'').toUpperCase();
    size = fitText(ctx, userLine, Math.floor(width*0.85), Math.floor(height*0.07), serif);
    ctx.font = `700 ${size}px ${serif}`;
    applyGoldStyles(ctx, Math.floor(width/2), baseY, userLine, Math.floor(width*0.85), size, useRoseGold?'rosegold':'gold');
    let y = baseY + Math.floor(size*1.1);
    const lines = Array.isArray(sublines)?sublines:[];
    for (const l of lines.slice(0,2)) {
      const txt = String(l||'');
      const s2 = fitText(ctx, txt, Math.floor(width*0.85), Math.floor(height*0.045), serif);
      ctx.font = `600 ${s2}px ${serif}`;
      applyGoldStyles(ctx, Math.floor(width/2), y, txt, Math.floor(width*0.85), s2, useRoseGold?'rosegold':'gold');
      y += Math.floor(s2*1.2);
    }
    // Footer block
    const footer = Array.isArray(footerLines) && footerLines.length ? footerLines : [
      'Félicitations !',
      `Tu rejoins l'élite de Boys and Girls. De nouveaux privilèges t'attendent… 🔥`,
      'CONTINUE TON ASCENSION VERS LES RÉCOMPENSES ULTIMES'
    ];
    let fy = Math.floor(height*0.75);
    const fSizes = [Math.floor(height*0.09), Math.floor(height*0.05), Math.floor(height*0.055)];
    for (let i=0;i<Math.min(footer.length,3);i++) {
      const txt = String(footer[i]||'');
      const fsz = fitText(ctx, txt, Math.floor(width*0.9), fSizes[i], serif);
      ctx.font = `${i===0?'700':'600'} ${fsz}px ${serif}`;
      applyGoldStyles(ctx, Math.floor(width/2), fy, txt, Math.floor(width*0.9), fsz, useRoseGold?'rosegold':'gold');
      fy += Math.floor(fsz*1.15);
    }
    return canvas.toBuffer('image/png');
  } catch (_) { return null; }
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
  const isCert = memberHasCertifiedRole(memberOrMention, levels);
  const name = memberDisplayName(guild, memberOrMention, memberOrMention?.id);
  const mention = memberOrMention?.id ? `<@${memberOrMention.id}>` : '';
  const lastReward = getLastRewardForLevel(levels, newLevel);
  const roleName = lastReward ? (guild.roles.cache.get(lastReward.roleId)?.name || `Rôle ${lastReward.roleId}`) : null;
  if (isCert) {
    const bg = levels.cards?.backgrounds?.certified || THEME_IMAGE;
    const sub = [
      `${name.toUpperCase()} VIENT DE FRANCHIR UN NOUVEAU CAP !`,
      `NIVEAU ATTEINT : ${String(newLevel)}`,
      roleName ? `(Dernier rôle obtenu : ${roleName})` : ''
    ].filter(Boolean);
    const footer = [
      'Félicitations !',
      `Tu rejoins l'élite de Boys and Girls. De nouveaux privilèges t'attendent… 🔥`,
      'CONTINUE TON ASCENSION VERS LES RÉCOMPENSES ULTIMES'
    ];
    drawCertifiedCard({ backgroundUrl: bg, name, sublines: sub, footerLines: footer, logoUrl: CERTIFIED_LOGO_URL, useRoseGold: CERTIFIED_ROSEGOLD }).then((img) => {
      if (img) channel.send({ content: `${mention}`, files: [{ attachment: img, name: 'levelup.png' }] }).catch(() => {});
      else channel.send({ content: `🎉 ${mention || name} passe niveau ${newLevel} !` }).catch(() => {});
    });
  } else {
    const bg = chooseCardBackgroundForMember(memberOrMention, levels);
    const avatarUrl = memberOrMention?.user?.displayAvatarURL?.({ extension: 'png', size: 256 }) || null;
    const lines = [
      `Niveau: ${newLevel}`,
      lastReward ? `Dernière récompense: ${roleName} (niv ${lastReward.level})` : 'Dernière récompense: —',
    ];
    drawCard(bg, `${name} monte de niveau !`, lines, undefined, undefined, avatarUrl, '🎉 Félicitations !').then((img) => {
      if (img) channel.send({ content: `${mention}`, files: [{ attachment: img, name: 'levelup.png' }] }).catch(() => {});
      else channel.send({ content: `🎉 ${mention || name} passe niveau ${newLevel} !` }).catch(() => {});
    });
  }
}

function maybeAnnounceRoleAward(guild, memberOrMention, levels, roleId) {
  const ann = levels.announce?.roleAward || {};
  if (!ann.enabled || !ann.channelId || !roleId) return;
  const channel = guild.channels.cache.get(ann.channelId);
  if (!channel || !channel.isTextBased?.()) return;
  const isCert = memberHasCertifiedRole(memberOrMention, levels);
  const roleName = guild.roles.cache.get(roleId)?.name || `Rôle ${roleId}`;
  const name = memberDisplayName(guild, memberOrMention, memberOrMention?.id);
  const mention = memberOrMention?.id ? `<@${memberOrMention.id}>` : '';
  if (isCert) {
    const bg = chooseCardBackgroundForMember(memberOrMention, levels);
    const logo = CERTIFIED_LOGO_URL || undefined;
    drawCertifiedCard({ backgroundUrl: bg, name, sublines: [`Rôle: ${roleName}`], logoUrl: logo }).then((img) => {
      if (img) channel.send({ content: `${mention}`, files: [{ attachment: img, name: 'role.png' }] }).catch(() => {});
      else channel.send({ content: `🏅 ${mention || name} reçoit le rôle ${roleName} !` }).catch(() => {});
    });
  } else {
    const bg = chooseCardBackgroundForMember(memberOrMention, levels);
    const avatarUrl = memberOrMention?.user?.displayAvatarURL?.({ extension: 'png', size: 128 }) || null;
    drawCard(bg, `${name} reçoit un rôle !`, [`Rôle: ${roleName}`], undefined, undefined, avatarUrl).then((img) => {
      if (img) channel.send({ content: `${mention}`, files: [{ attachment: img, name: 'role.png' }] }).catch(() => {});
      else channel.send({ content: `🏅 ${mention || name} reçoit le rôle ${roleName} !` }).catch(() => {});
    });
  }
}

function memberMention(userId) {
  return `<@${userId}>`;
}
async function fetchMember(guild, userId) {
  return guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
}

function pickThemeColorForGuild(guild) {
  const palette = [
    THEME_COLORS.PRIMARY,   // Blue
    THEME_COLORS.ACCENT,    // Pink
    THEME_COLORS.TEAL,      // Teal
    THEME_COLORS.PURPLE,    // Purple
    THEME_COLORS.WARNING,   // Orange
    THEME_COLORS.INFO,      // Light Blue
    THEME_COLORS.GOLD       // Gold
  ];
  const id = String(guild?.id || '0');
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 33 + id.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

// Enhanced embed builder with rich visual effects
function createEnhancedEmbed(options = {}) {
  const {
    title,
    description,
    color = THEME_COLOR_PRIMARY,
    thumbnail = THEME_IMAGE,
    footerText = 'Boy and Girls (BAG)',
    footerIcon,
    fields = [],
    author,
    image,
    url,
    timestamp = true
  } = options;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description);

  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  if (url) embed.setURL(url);
  if (timestamp) embed.setTimestamp(new Date());
  if (footerText) embed.setFooter({ text: footerText, iconURL: footerIcon });
  if (author) embed.setAuthor(author);
  if (fields.length) embed.addFields(fields);

  return embed;
}

// Enhanced status embed with visual indicators
function createStatusEmbed(title, status, details = {}) {
  const {
    isEnabled = false,
    description,
    fields = [],
    color,
    icon = '⚙️'
  } = details;

  const statusColor = color || (isEnabled ? THEME_COLORS.SUCCESS : THEME_COLORS.WARNING);
  const statusText = isEnabled ? '✅ Activé' : '⛔ Désactivé';
  const statusIcon = isEnabled ? '🟢' : '🔴';

  return createEnhancedEmbed({
    title: `${icon} ${title}`,
    description: `**Statut:** ${statusIcon} ${statusText}\n\n${description || '*Configuration du module*'}\n\n> ${isEnabled ? 'Module opérationnel' : 'Module désactivé'}`,
    color: statusColor,
    fields: [
      { name: '📊 État', value: statusText, inline: true },
      { name: '🔧 Module', value: title.replace(/[⚙️🎵🏆🛡️💰🎮🔒📝🧵💾]/g, '').trim(), inline: true },
      { name: '⏰ Mis à jour', value: '<t:' + Math.floor(Date.now()/1000) + ':R>', inline: true },
      ...fields
    ],
    footerText: 'BAG • Configuration'
  });
}

// Specialized embed creators for different contexts
function createSuccessEmbed(title, description, fields = []) {
  return createEnhancedEmbed({
    title: `✅ ${title}`,
    description: `**Opération réussie !** 🎉\n\n${description}`,
    color: THEME_COLORS.SUCCESS,
    fields: fields
  });
}

function createErrorEmbed(title, description, fields = []) {
  return createEnhancedEmbed({
    title: `❌ ${title}`,
    description: `**Une erreur s'est produite** ⚠️\n\n${description}`,
    color: THEME_COLORS.ERROR,
    fields: fields
  });
}

function createInfoEmbed(title, description, fields = []) {
  return createEnhancedEmbed({
    title: `ℹ️ ${title}`,
    description: `**Information** 📋\n\n${description}`,
    color: THEME_COLORS.INFO,
    fields: fields
  });
}

function createWarningEmbed(title, description, fields = []) {
  return createEnhancedEmbed({
    title: `⚠️ ${title}`,
    description: `**Attention** 🚨\n\n${description}`,
    color: THEME_COLORS.WARNING,
    fields: fields
  });
}

// Enhanced level-up embed with celebration effects
function createLevelUpEmbed(memberName, level, guildName, options = {}) {
  const {
    xp = 0,
    nextLevelXp = 0,
    reward = null,
    isFirstLevel = false
  } = options;

  const celebrationTitle = isFirstLevel 
    ? '🎊 Premier Niveau Atteint !' 
    : `🎉 Niveau ${level} Débloqué !`;
    
  const description = isFirstLevel
    ? `**${memberName}** vient de débuter son aventure sur **${guildName}** ! 🚀\n\n> Bienvenue dans la communauté BAG !\n\n*C'est le début d'une grande aventure* ✨`
    : `**${memberName}** continue son ascension ! 🌟\n\n> Niveau **${level}** atteint avec brio\n\n*L'excellence récompensée* 🏆`;

  const fields = [
    { name: '📊 Niveau', value: `**${level}**`, inline: true },
    { name: '⭐ XP Total', value: xp.toLocaleString('fr-FR'), inline: true }
  ];

  if (reward) {
    fields.push({ name: '🎁 Récompense', value: reward, inline: true });
  }

  if (nextLevelXp > 0) {
    fields.push({ name: '🎯 Prochain Niveau', value: `${nextLevelXp.toLocaleString('fr-FR')} XP`, inline: true });
  }

  return createEnhancedEmbed({
    title: celebrationTitle,
    description: description,
    color: isFirstLevel ? THEME_COLORS.SUCCESS : THEME_COLORS.GOLD,
    thumbnail: THEME_IMAGE,
    fields: fields,
    footerText: 'BAG • Système de Niveaux'
  });
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
  const embed = createEnhancedEmbed({
    title: '🏆 Classement des Niveaux',
    description: `**Voici le top des membres les plus actifs !** 🌟\n\n${lines.join('\n') || '—'}\n\n*Continuez à être actifs pour grimper dans le classement !* 📈`,
    color: color,
    author: { name: `${guild.name} • Hall of Fame`, iconURL: guild.iconURL?.() || undefined },
    thumbnail: THEME_IMAGE,
    footerText: `Boy and Girls (BAG) • ${offset + 1}-${Math.min(total, offset + limit)} sur ${total}`,
    fields: [
      { name: '📊 Statistiques', value: `**Total:** ${total} membres\n**Page:** ${Math.floor(offset/limit)+1}/${Math.ceil(total/limit)}`, inline: true },
      { name: '🎯 Légende', value: '🥇 Top 1\n🥈 Top 2\n🥉 Top 3', inline: true },
      { name: '📈 Activité', value: 'Messages + Vocal', inline: true }
    ]
  });

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
  const gifsBtn = new ButtonBuilder().setCustomId('economy_gifs').setLabel('GIF actions').setStyle(ButtonStyle.Primary);
  const row = new ActionRowBuilder().addComponents(curBtn, gifsBtn);
  return [row];
}

async function buildBoosterRows(guild) {
  const eco = await getEconomyConfig(guild.id);
  const b = eco.booster || { enabled: true, textXpMult: 2, voiceXpMult: 2, actionCooldownMult: 0.5, shopPriceMult: 0.5 };
  const toggle = new ButtonBuilder().setCustomId('booster_toggle').setLabel(b.enabled ? 'Boosters: ON' : 'Boosters: OFF').setStyle(b.enabled ? ButtonStyle.Success : ButtonStyle.Secondary);
  const textXp = new ButtonBuilder().setCustomId('booster_textxp').setLabel(`XP texte x${b.textXpMult}`).setStyle(ButtonStyle.Primary);
  const voiceXp = new ButtonBuilder().setCustomId('booster_voicexp').setLabel(`XP vocal x${b.voiceXpMult}`).setStyle(ButtonStyle.Primary);
  const cdMult = new ButtonBuilder().setCustomId('booster_cd').setLabel(`Cooldown x${b.actionCooldownMult}`).setStyle(ButtonStyle.Secondary);
  const priceMult = new ButtonBuilder().setCustomId('booster_shop').setLabel(`Prix boutique x${b.shopPriceMult}`).setStyle(ButtonStyle.Secondary);
  const back = new ButtonBuilder().setCustomId('config_back_home').setLabel('Retour').setStyle(ButtonStyle.Secondary);
  const row1 = new ActionRowBuilder().addComponents(toggle, back);
  const row2 = new ActionRowBuilder().addComponents(textXp, voiceXp, cdMult, priceMult);
  return [row1, row2];
}

// Build rows to manage karma-based discounts/penalties
async function buildEconomyKarmaRows(guild) {
  const eco = await getEconomyConfig(guild.id);
  // Selected type
  const type = client._ecoKarmaType?.get?.(guild.id) || 'shop';
  const typeSelect = new StringSelectMenuBuilder()
    .setCustomId('eco_karma_type')
    .setPlaceholder('Type de règles…')
    .addOptions(
      { label: `Boutique (${eco.karmaModifiers?.shop?.length||0})`, value: 'shop', default: type === 'shop' },
      { label: `Actions (${eco.karmaModifiers?.actions?.length||0})`, value: 'actions', default: type === 'actions' },
      { label: `Grants (${eco.karmaModifiers?.grants?.length||0})`, value: 'grants', default: type === 'grants' },
    );
  const rowType = new ActionRowBuilder().addComponents(typeSelect);
  const list = Array.isArray(eco.karmaModifiers?.[type]) ? eco.karmaModifiers[type] : [];
  const options = list.length ? list.map((r, idx) => {
    const label = type === 'grants' ? `if ${r.condition} -> money ${r.money}` : `if ${r.condition} -> ${r.percent}%`;
    return { label: label.slice(0, 100), value: String(idx) };
  }) : [{ label: 'Aucune règle', value: 'none' }];
  const rulesSelect = new StringSelectMenuBuilder()
    .setCustomId(`eco_karma_rules:${type}`)
    .setPlaceholder('Sélectionner des règles à supprimer…')
    .setMinValues(0)
    .setMaxValues(Math.min(25, Math.max(1, options.length)))
    .addOptions(...options);
  if (options.length === 1 && options[0].value === 'none') rulesSelect.setDisabled(true);
  const rowRules = new ActionRowBuilder().addComponents(rulesSelect);
  const addShop = new ButtonBuilder().setCustomId('eco_karma_add_shop').setLabel('Ajouter règle boutique').setStyle(ButtonStyle.Primary);
  const addAct = new ButtonBuilder().setCustomId('eco_karma_add_action').setLabel('Ajouter règle actions').setStyle(ButtonStyle.Primary);
  const addGrant = new ButtonBuilder().setCustomId('eco_karma_add_grant').setLabel('Ajouter grant').setStyle(ButtonStyle.Secondary);
  const delBtn = new ButtonBuilder().setCustomId('eco_karma_delete').setLabel('Supprimer').setStyle(ButtonStyle.Danger);
  const editBtn = new ButtonBuilder().setCustomId('eco_karma_edit').setLabel('Modifier').setStyle(ButtonStyle.Secondary);
  const rowActions = new ActionRowBuilder().addComponents(addShop, addAct, addGrant, editBtn, delBtn);
  return [rowType, rowRules, rowActions];
}

async function buildAutoThreadRows(guild) {
  const cfg = await getAutoThreadConfig(guild.id);
  const channelsAdd = new ChannelSelectMenuBuilder().setCustomId('autothread_channels_add').setPlaceholder('Ajouter des salons…').setMinValues(1).setMaxValues(5).addChannelTypes(ChannelType.GuildText);
  const channelsRemove = new StringSelectMenuBuilder().setCustomId('autothread_channels_remove').setPlaceholder('Retirer des salons…').setMinValues(1).setMaxValues(Math.max(1, Math.min(25, (cfg.channels||[]).length || 1)));
  const opts = (cfg.channels||[]).map(id => ({ label: guild.channels.cache.get(id)?.name || id, value: id }));
  if (opts.length) channelsRemove.addOptions(...opts); else channelsRemove.addOptions({ label: 'Aucun', value: 'none' }).setDisabled(true);
  const naming = new StringSelectMenuBuilder().setCustomId('autothread_naming').setPlaceholder('Nom du fil…').addOptions(
    { label: 'Membre + numéro', value: 'member_num', default: cfg.naming?.mode === 'member_num' },
    { label: 'Personnalisé (pattern)', value: 'custom', default: cfg.naming?.mode === 'custom' },
    { label: 'NSFW aléatoire + numéro', value: 'nsfw', default: cfg.naming?.mode === 'nsfw' },
    { label: 'Numérique', value: 'numeric', default: cfg.naming?.mode === 'numeric' },
    { label: 'Date + numéro', value: 'date_num', default: cfg.naming?.mode === 'date_num' },
  );
  const archive = new StringSelectMenuBuilder().setCustomId('autothread_archive').setPlaceholder('Délai d\'archivage…').addOptions(
    { label: '1 jour', value: '1d', default: cfg.archive?.policy === '1d' },
    { label: '7 jours', value: '7d', default: cfg.archive?.policy === '7d' },
    { label: '1 mois', value: '1m', default: cfg.archive?.policy === '1m' },
    { label: 'Illimité', value: 'max', default: cfg.archive?.policy === 'max' },
  );
  const customBtn = new ButtonBuilder().setCustomId('autothread_custom_pattern').setLabel(`Pattern: ${cfg.naming?.customPattern ? cfg.naming.customPattern.slice(0,20) : 'non défini'}`).setStyle(ButtonStyle.Secondary);
  const rows = [
    new ActionRowBuilder().addComponents(channelsAdd),
    new ActionRowBuilder().addComponents(channelsRemove),
    new ActionRowBuilder().addComponents(naming),
    new ActionRowBuilder().addComponents(archive),
  ];
  if ((cfg.naming?.mode || 'member_num') === 'custom') {
    rows.push(new ActionRowBuilder().addComponents(customBtn));
  } else if ((cfg.naming?.mode || 'member_num') === 'nsfw') {
    const addBtn = new ButtonBuilder().setCustomId('autothread_nsfw_add').setLabel('Ajouter noms NSFW').setStyle(ButtonStyle.Primary);
    const remBtn = new ButtonBuilder().setCustomId('autothread_nsfw_remove').setLabel('Supprimer noms NSFW').setStyle(ButtonStyle.Danger);
    rows.push(new ActionRowBuilder().addComponents(addBtn, remBtn));
  }
  return rows;
}

async function buildCountingRows(guild) {
  const cfg = await getCountingConfig(guild.id);
  const chAdd = new ChannelSelectMenuBuilder().setCustomId('counting_channels_add').setPlaceholder('Ajouter des salons…').setMinValues(1).setMaxValues(3).addChannelTypes(ChannelType.GuildText);
  const chRem = new StringSelectMenuBuilder().setCustomId('counting_channels_remove').setPlaceholder('Retirer des salons…').setMinValues(1).setMaxValues(Math.max(1, Math.min(25, (cfg.channels||[]).length || 1)));
  const opts = (cfg.channels||[]).map(id => ({ label: guild.channels.cache.get(id)?.name || id, value: id }));
  if (opts.length) chRem.addOptions(...opts); else chRem.addOptions({ label: 'Aucun', value: 'none' }).setDisabled(true);
  const formulas = new ButtonBuilder().setCustomId('counting_toggle_formulas').setLabel(cfg.allowFormulas ? 'Formules: ON' : 'Formules: OFF').setStyle(cfg.allowFormulas ? ButtonStyle.Success : ButtonStyle.Secondary);
  const reset = new ButtonBuilder().setCustomId('counting_reset').setLabel(`Remise à zéro (actuel: ${cfg.state?.current||0})`).setStyle(ButtonStyle.Danger);
  return [
    new ActionRowBuilder().addComponents(chAdd),
    new ActionRowBuilder().addComponents(chRem),
    new ActionRowBuilder().addComponents(formulas, reset),
  ];
}

async function buildConfessRows(guild, mode = 'sfw') {
  const cf = await getConfessConfig(guild.id);
  const modeSelect = new StringSelectMenuBuilder().setCustomId('confess_mode').setPlaceholder('Mode…').addOptions(
    { label: 'Confessions', value: 'sfw', default: mode === 'sfw' },
    { label: 'Confessions NSFW', value: 'nsfw', default: mode === 'nsfw' },
  );
  const channelAdd = new ChannelSelectMenuBuilder().setCustomId(`confess_channels_add:${mode}`).setPlaceholder('Ajouter des salons…').setMinValues(1).setMaxValues(3).addChannelTypes(ChannelType.GuildText);
  const channelRemove = new StringSelectMenuBuilder().setCustomId(`confess_channels_remove:${mode}`).setPlaceholder('Retirer des salons…').setMinValues(1).setMaxValues(Math.max(1, Math.min(25, (cf[mode].channels||[]).length || 1)));
  const opts = (cf[mode].channels||[]).map(id => ({ label: guild.channels.cache.get(id)?.name || id, value: id }));
  if (opts.length) channelRemove.addOptions(...opts); else channelRemove.addOptions({ label: 'Aucun', value: 'none' }).setDisabled(true);
  const logSelect = new ChannelSelectMenuBuilder().setCustomId('confess_log_select').setPlaceholder(cf.logChannelId ? `Salon de logs actuel: <#${cf.logChannelId}>` : 'Choisir le salon de logs…').setMinValues(1).setMaxValues(1).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  const replyToggle = new ButtonBuilder().setCustomId('confess_toggle_replies').setLabel(cf.allowReplies ? 'Réponses: ON' : 'Réponses: OFF').setStyle(cf.allowReplies ? ButtonStyle.Success : ButtonStyle.Secondary);
  const nameToggle = new ButtonBuilder().setCustomId('confess_toggle_naming').setLabel(cf.threadNaming === 'nsfw' ? 'Nom de fil: NSFW+' : 'Nom de fil: Normal').setStyle(ButtonStyle.Secondary);
  return [
    new ActionRowBuilder().addComponents(modeSelect),
    new ActionRowBuilder().addComponents(channelAdd),
    new ActionRowBuilder().addComponents(channelRemove),
    new ActionRowBuilder().addComponents(logSelect),
    new ActionRowBuilder().addComponents(replyToggle, nameToggle),
  ];
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

// Build rows for managing action GIFs
async function buildEconomyGifRows(guild, currentKey) {
  const eco = await getEconomyConfig(guild.id);
  const allKeys = ['work','fish','give','steal','kiss','flirt','seduce','fuck','massage','dance','crime'];
  const opts = allKeys.map(k => ({ label: actionKeyToLabel(k), value: k, default: currentKey === k }));
  const pick = new StringSelectMenuBuilder().setCustomId('economy_gifs_action').setPlaceholder('Choisir une action…').addOptions(...opts);
  const rows = [new ActionRowBuilder().addComponents(pick)];
  if (currentKey && allKeys.includes(currentKey)) {
    const conf = eco.actions?.gifs?.[currentKey] || { success: [], fail: [] };
    const addSucc = new ButtonBuilder().setCustomId(`economy_gifs_add:success:${currentKey}`).setLabel('Ajouter GIF succès').setStyle(ButtonStyle.Success);
    const addFail = new ButtonBuilder().setCustomId(`economy_gifs_add:fail:${currentKey}`).setLabel('Ajouter GIF échec').setStyle(ButtonStyle.Danger);
    rows.push(new ActionRowBuilder().addComponents(addSucc, addFail));
    // Remove selects (success)
    const succList = Array.isArray(conf.success) ? conf.success.slice(0, 25) : [];
    const succSel = new StringSelectMenuBuilder().setCustomId(`economy_gifs_remove_success:${currentKey}`).setPlaceholder('Supprimer GIFs succès…').setMinValues(1).setMaxValues(Math.max(1, succList.length || 1));
    if (succList.length) succSel.addOptions(...succList.map((url, i) => ({ label: `Succès #${i+1}`, value: String(i), description: url.slice(0, 80) })));
    else succSel.addOptions({ label: 'Aucun', value: 'none' }).setDisabled(true);
    rows.push(new ActionRowBuilder().addComponents(succSel));
    // Remove selects (fail)
    const failList = Array.isArray(conf.fail) ? conf.fail.slice(0, 25) : [];
    const failSel = new StringSelectMenuBuilder().setCustomId(`economy_gifs_remove_fail:${currentKey}`).setPlaceholder('Supprimer GIFs échec…').setMinValues(1).setMaxValues(Math.max(1, failList.length || 1));
    if (failList.length) failSel.addOptions(...failList.map((url, i) => ({ label: `Échec #${i+1}`, value: String(i), description: url.slice(0, 80) })));
    else failSel.addOptions({ label: 'Aucun', value: 'none' }).setDisabled(true);
    rows.push(new ActionRowBuilder().addComponents(failSel));
  }
  return rows;
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

client.login(process.env.DISCORD_TOKEN).then(() => {
  console.log('Login succeeded');
}).catch((err) => {
  console.error('Login failed:', err?.message || err);
  process.exit(1);
});
client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  ensureStorageExists().catch(() => {});
  startYtProxyServer();
  // Init Erela.js (if available) with public nodes
  try {
    if (ErelaManager) {
      let nodes = [];
      try {
        if (process.env.LAVALINK_NODES) {
          const parsed = JSON.parse(process.env.LAVALINK_NODES);
          if (Array.isArray(parsed) && parsed.length && parsed.every(n => n && typeof n.host === 'string')) {
            nodes = parsed;
            console.log('[Music] Using nodes from LAVALINK_NODES env');
          }
        }
      } catch (e) { console.error('Invalid LAVALINK_NODES env:', e?.message || e); }
      if (!nodes.length) {
        console.warn('[Music] No LAVALINK_NODES provided. Music will be disabled.');
      }
      const manager = new ErelaManager({
        nodes,
        send: (id, payload) => {
          const guild = client.guilds.cache.get(id);
          if (guild) guild.shard.send(payload);
        },
        autoPlay: true,
      });
      client.music = manager;
      manager.on('nodeConnect', node => console.log(`[Music] Node connected: ${node.options.host}`));
      manager.on('nodeError', (node, err) => console.error('[Music] Node error', node.options.host, err?.message||err));
      manager.on('playerMove', (player, oldChannel, newChannel) => { if (!newChannel) player.destroy(); });
      manager.init(client.user.id);
      client.on('raw', (d) => { try { client.music?.updateVoiceState(d); } catch (_) {} });
    }
  } catch (e) {
    console.error('Music init failed', e);
  }
  // Logs: register listeners
  client.on(Events.GuildMemberAdd, async (m) => {
    const cfg = await getLogsConfig(m.guild.id); if (!cfg.categories?.joinleave) return;
    const embed = buildModEmbed(`${cfg.emoji} Arrivée`, `${m.user} a rejoint le serveur.`, []);
    await sendLog(m.guild, 'joinleave', embed);
  });
  client.on(Events.GuildMemberRemove, async (m) => {
    const cfg = await getLogsConfig(m.guild.id); if (!cfg.categories?.joinleave) return;
    const embed = buildModEmbed(`${cfg.emoji} Départ`, `<@${m.id}> a quitté le serveur.`, []);
    await sendLog(m.guild, 'joinleave', embed);
  });
  client.on(Events.MessageDelete, async (msg) => {
    try { if (!msg.guild) return; } catch (_) { return; }
    const cfg = await getLogsConfig(msg.guild.id); try { console.log('[Logs] MessageDelete evt', { g: msg.guild.id, cat: cfg.categories?.messages, ch: (cfg.channels?.messages||cfg.channelId)||null }); } catch (_) {}
    if (!cfg.categories?.messages) return;
    const author = msg.author || (msg.partial ? null : null);
    const content = msg.partial ? '(partiel)' : (msg.content || '—');
    const embed = buildModEmbed(`${cfg.emoji} Message supprimé`, `Salon: <#${msg.channelId}>`, [{ name:'Auteur', value: author ? `${author} (${author.id})` : 'Inconnu' }, { name:'Contenu', value: content }, { name:'Message ID', value: String(msg.id) }]);
    await sendLog(msg.guild, 'messages', embed);
  });
  client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
    const msg = newMsg; try { if (!msg.guild) return; } catch (_) { return; }
    // Fetch partials to ensure content
    try { if (oldMsg?.partial) await oldMsg.fetch(); } catch (_) {}
    try { if (msg?.partial) await msg.fetch(); } catch (_) {}
    const before = oldMsg?.partial ? '(partiel)' : (oldMsg?.content || '—');
    const after = msg?.partial ? '(partiel)' : (msg?.content || '—');
    const cfg = await getLogsConfig(msg.guild.id); try { console.log('[Logs] MessageUpdate evt', { g: msg.guild.id, cat: cfg.categories?.messages, ch: (cfg.channels?.messages||cfg.channelId)||null }); } catch (_) {}
    if (!cfg.categories?.messages) return;
    const embed = buildModEmbed(`${cfg.emoji} Message modifié`, `Salon: <#${msg.channelId}>`, [ { name:'Auteur', value: msg.author ? `${msg.author} (${msg.author.id})` : 'Inconnu' }, { name:'Avant', value: before }, { name:'Après', value: after }, { name:'Message ID', value: String(msg.id) } ]);
    await sendLog(msg.guild, 'messages', embed);
  });
  // Removed MessageCreate logging per user request
  client.on(Events.ThreadCreate, async (thread) => {
    if (!thread.guild) return; const cfg = await getLogsConfig(thread.guild.id); if (!cfg.categories?.threads) return;
    const embed = buildModEmbed(`${cfg.emoji} Thread créé`, `Fil: <#${thread.id}> dans <#${thread.parentId}>`, []);
    await sendLog(thread.guild, 'threads', embed);
  });
  client.on(Events.ThreadDelete, async (thread) => {
    if (!thread.guild) return; const cfg = await getLogsConfig(thread.guild.id); if (!cfg.categories?.threads) return;
    const embed = buildModEmbed(`${cfg.emoji} Thread supprimé`, `Fil: ${thread.id} dans <#${thread.parentId}>`, []);
    await sendLog(thread.guild, 'threads', embed);
  });
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
  // Temporary roles cleanup every 10 minutes
  setInterval(async () => {
    try {
      const guild = readyClient.guilds.cache.get(guildId) || await readyClient.guilds.fetch(guildId).catch(()=>null);
      if (!guild) return;
      const eco = await getEconomyConfig(guild.id);
      const grants = { ...(eco.shop?.grants || {}) };
      const now = Date.now();
      let changed = false;
      for (const key of Object.keys(grants)) {
        const g = grants[key];
        if (!g || !g.expiresAt || now < g.expiresAt) continue;
        try {
          const member = await guild.members.fetch(g.userId).catch(()=>null);
          if (member) { await member.roles.remove(g.roleId).catch(()=>{}); }
        } catch (_) {}
        delete grants[key];
        changed = true;
      }
      if (changed) {
        eco.shop = { ...(eco.shop||{}), grants };
        await updateEconomyConfig(guild.id, eco);
      }
    } catch (_) {}
  }, 10 * 60 * 1000);

  // AutoKick enforcement every 2 minutes (scans members by join date)
  setInterval(async () => {
    try {
      const guild = readyClient.guilds.cache.get(guildId) || await readyClient.guilds.fetch(guildId).catch(()=>null);
      if (!guild) return;
      const ak = await getAutoKickConfig(guild.id);
      if (!ak?.enabled || !ak.delayMs || ak.delayMs <= 0 || !ak.roleId) return;
      const now = Date.now();
      const roleId = String(ak.roleId);
      let members;
      try { members = await guild.members.fetch(); } catch (e) { console.error('[AutoKick] fetch members failed', e); return; }
      const me = guild.members.me;
      if (!me?.permissions?.has(PermissionsBitField.Flags.KickMembers)) {
        console.warn('[AutoKick] Missing KickMembers permission');
        return;
      }
      for (const m of members.values()) {
        try {
          if (!m || m.user.bot) continue;
          if (m.roles.cache.has(roleId)) continue; // has required role
          const joinedAt = m.joinedTimestamp || (m.joinedAt ? m.joinedAt.getTime?.() : 0);
          if (!joinedAt) continue;
          if (now - joinedAt < ak.delayMs) continue;
          // role hierarchy check: can we kick?
          if (!m.kickable) continue;
          await m.kick('AutoKick: délai dépassé sans rôle requis').catch((e)=>console.error('[AutoKick] kick failed', m.id, e?.message||e));
        } catch (e) { console.error('[AutoKick] loop error', e?.message||e); }
      }
    } catch (eOuter) { console.error('[AutoKick] tick failed', eOuter?.message||eOuter); }
  }, 60 * 60 * 1000);

  // Disboard bump reminder check every 1 minute
  setInterval(async () => {
    try {
      const guild = readyClient.guilds.cache.get(guildId) || await readyClient.guilds.fetch(guildId).catch(()=>null);
      if (!guild) return;
      const d = await getDisboardConfig(guild.id);
      if (!d?.lastBumpAt || d.reminded === true) return;
      const now = Date.now();
      const TWO_HOURS = 2 * 60 * 60 * 1000;
      if (now - d.lastBumpAt >= TWO_HOURS) {
        const ch = guild.channels.cache.get(d.lastBumpChannelId) || await guild.channels.fetch(d.lastBumpChannelId).catch(()=>null);
        if (ch && ch.isTextBased?.()) {
                  const embed = createEnhancedEmbed({
          title: '💋 Un petit bump, beau/belle gosse ?',
          description: '**Deux heures se sont écoulées…** 🕐\n\n> Faites vibrer le serveur à nouveau avec `/bump` 😈🔥\n\n*Le serveur a besoin de votre énergie !* ✨',
          color: THEME_COLORS.ACCENT,
          footerText: 'BAG • Disboard',
          fields: [
            { name: '⏰ Temps écoulé', value: '2 heures', inline: true },
            { name: '🎯 Action', value: 'Utilisez `/bump`', inline: true },
            { name: '🔥 Boost', value: 'Remontez le serveur !', inline: true }
          ]
        });
          await ch.send({ embeds: [embed] }).catch(()=>{});
        }
        await updateDisboardConfig(guild.id, { reminded: true });
      }
    } catch (_) {}
  }, 60 * 1000);

  // Backup logs heartbeat: announce periodic persistence (every 30 minutes)
  setInterval(async () => {
    try {
      const guild = readyClient.guilds.cache.get(guildId) || await readyClient.guilds.fetch(guildId).catch(()=>null);
      if (!guild) return;
      const cfg = await getLogsConfig(guild.id);
      if (!cfg?.categories?.backup) return;
      const embed = buildModEmbed(`${cfg.emoji} Sauvegarde`, `**Snapshot de l'état du bot enregistré avec succès** 💾\n\n> Toutes les données ont été sauvegardées\n\n*Votre configuration est en sécurité* 🔒`, [
        { name: '📅 Horodatage', value: new Date().toLocaleString('fr-FR'), inline: true },
        { name: '💾 Type', value: 'Sauvegarde automatique', inline: true },
        { name: '✅ Statut', value: 'Succès', inline: true }
      ], { color: THEME_COLORS.SUCCESS });
      await sendLog(guild, 'backup', embed);
    } catch (_) {}
  }, 30 * 60 * 1000);
});
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'config') {
      const hasManageGuild = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild) || interaction.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild);
      if (!hasManageGuild) {
        return interaction.reply({ content: '⛔ Cette commande est réservée à l\'équipe de modération.', ephemeral: true });
      }
      const embed = await buildConfigEmbed(interaction.guild);
      const row = buildTopSectionRow();
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
      } else if (section === 'truthdare') {
        const rows = await buildTruthDareRows(interaction.guild, 'sfw');
        await interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
      } else if (section === 'confess') {
        const rows = await buildConfessRows(interaction.guild, 'sfw');
        await interaction.update({ embeds: [embed], components: [...rows] });
      } else if (section === 'autothread') {
        const rows = await buildAutoThreadRows(interaction.guild);
        await interaction.update({ embeds: [embed], components: [...rows] });
      } else if (section === 'counting') {
        const rows = await buildCountingRows(interaction.guild);
        await interaction.update({ embeds: [embed], components: [...rows] });
      } else if (section === 'logs') {
        const rows = await buildLogsRows(interaction.guild);
        await interaction.update({ embeds: [embed], components: [...rows] });
      } else if (section === 'booster') {
        const rows = await buildBoosterRows(interaction.guild);
        await interaction.update({ embeds: [embed], components: [...rows] });
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
    // Karma type switch
    if (interaction.isStringSelectMenu() && interaction.customId === 'eco_karma_type') {
      const type = interaction.values[0];
      if (!client._ecoKarmaType) client._ecoKarmaType = new Map();
      client._ecoKarmaType.set(interaction.guild.id, type);
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildEconomyMenuRows(interaction.guild, 'karma');
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isButton() && interaction.customId === 'booster_toggle') {
      const eco = await getEconomyConfig(interaction.guild.id);
      const b = eco.booster || {};
      b.enabled = !b.enabled;
      await updateEconomyConfig(interaction.guild.id, { booster: b });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildBoosterRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isButton() && ['booster_textxp','booster_voicexp','booster_cd','booster_shop'].includes(interaction.customId)) {
      const ids = { booster_textxp: ['textXpMult','Multiplicateur XP texte (ex: 2)'], booster_voicexp: ['voiceXpMult','Multiplicateur XP vocal (ex: 2)'], booster_cd: ['actionCooldownMult','Multiplicateur cooldown (ex: 0.5)'], booster_shop: ['shopPriceMult','Multiplicateur prix boutique (ex: 0.5)'] };
      const [key, label] = ids[interaction.customId];
      const modal = new ModalBuilder().setCustomId(`booster_edit:${key}`).setTitle('Réglage Booster');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('value').setLabel(label).setStyle(TextInputStyle.Short).setRequired(true)));
      await interaction.showModal(modal);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('booster_edit:')) {
      await interaction.deferReply({ ephemeral: true });
      const key = interaction.customId.split(':')[1];
      let v = Number((interaction.fields.getTextInputValue('value')||'').trim());
      if (!Number.isFinite(v) || v <= 0) return interaction.editReply({ content: 'Valeur invalide.' });
      const eco = await getEconomyConfig(interaction.guild.id);
      const b = eco.booster || {};
      b[key] = v;
      await updateEconomyConfig(interaction.guild.id, { booster: b });
      return interaction.editReply({ content: '✅ Réglage mis à jour.' });
    }
    // Karma delete selected
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('eco_karma_rules:')) {
      // store selection in memory until delete click
      const type = interaction.customId.split(':')[1] || 'shop';
      if (!client._ecoKarmaSel) client._ecoKarmaSel = new Map();
      client._ecoKarmaSel.set(`${interaction.guild.id}:${type}`, interaction.values);
      try { await interaction.deferUpdate(); } catch (_) {}
    }
    if (interaction.isButton() && interaction.customId === 'eco_karma_delete') {
      const type = (client._ecoKarmaType?.get?.(interaction.guild.id)) || 'shop';
      const key = `${interaction.guild.id}:${type}`;
      const sel = client._ecoKarmaSel?.get?.(key) || [];
      const eco = await getEconomyConfig(interaction.guild.id);
      let list = Array.isArray(eco.karmaModifiers?.[type]) ? eco.karmaModifiers[type] : [];
      const idxs = new Set(sel.map(v => Number(v)));
      list = list.filter((_, i) => !idxs.has(i));
      eco.karmaModifiers = { ...(eco.karmaModifiers||{}), [type]: list };
      await updateEconomyConfig(interaction.guild.id, eco);
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildEconomyMenuRows(interaction.guild, 'karma');
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isButton() && interaction.customId === 'eco_karma_edit') {
      const type = (client._ecoKarmaType?.get?.(interaction.guild.id)) || 'shop';
      const sel = client._ecoKarmaSel?.get?.(`${interaction.guild.id}:${type}`) || [];
      if (!sel.length) return interaction.reply({ content: 'Sélectionnez d\'abord une règle.', ephemeral: true });
      const idx = Number(sel[0]);
      const eco = await getEconomyConfig(interaction.guild.id);
      const list = Array.isArray(eco.karmaModifiers?.[type]) ? eco.karmaModifiers[type] : [];
      const rule = list[idx];
      if (!rule) return interaction.reply({ content: 'Règle introuvable.', ephemeral: true });
      if (type === 'grants') {
        const modal = new ModalBuilder().setCustomId(`eco_karma_edit_grant:${idx}`).setTitle('Modifier grant');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('condition').setLabel('Condition').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(rule.condition||''))),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('money').setLabel('Montant (+/-)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(rule.money||0)))
        );
        try { return await interaction.showModal(modal); } catch (_) { return; }
      } else {
        const modal = new ModalBuilder().setCustomId(`eco_karma_edit_perc:${type}:${idx}`).setTitle('Modifier règle (%)');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('condition').setLabel('Condition').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(rule.condition||''))),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('percent').setLabel('Pourcentage (+/-)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(rule.percent||0)))
        );
        try { return await interaction.showModal(modal); } catch (_) { return; }
      }
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('eco_karma_edit_grant:')) {
      await interaction.deferReply({ ephemeral: true });
      const idx = Number(interaction.customId.split(':')[1]);
      const condition = (interaction.fields.getTextInputValue('condition')||'').trim();
      const money = Number((interaction.fields.getTextInputValue('money')||'0').trim());
      const eco = await getEconomyConfig(interaction.guild.id);
      const list = Array.isArray(eco.karmaModifiers?.grants) ? eco.karmaModifiers.grants : [];
      if (!list[idx]) return interaction.editReply({ content: 'Règle introuvable.' });
      list[idx] = { condition, money };
      eco.karmaModifiers = { ...(eco.karmaModifiers||{}), grants: list };
      await updateEconomyConfig(interaction.guild.id, eco);
      return interaction.editReply({ content: '✅ Grant modifié.' });
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('eco_karma_edit_perc:')) {
      await interaction.deferReply({ ephemeral: true });
      const [, type, idxStr] = interaction.customId.split(':');
      const idx = Number(idxStr);
      const condition = (interaction.fields.getTextInputValue('condition')||'').trim();
      const percent = Number((interaction.fields.getTextInputValue('percent')||'0').trim());
      const eco = await getEconomyConfig(interaction.guild.id);
      const list = Array.isArray(eco.karmaModifiers?.[type]) ? eco.karmaModifiers[type] : [];
      if (!list[idx]) return interaction.editReply({ content: 'Règle introuvable.' });
      list[idx] = { condition, percent };
      eco.karmaModifiers = { ...(eco.karmaModifiers||{}), [type]: list };
      await updateEconomyConfig(interaction.guild.id, eco);
      return interaction.editReply({ content: '✅ Règle modifiée.' });
    }
    if (interaction.isButton() && interaction.customId === 'eco_karma_clear') {
      const type = (client._ecoKarmaType?.get?.(interaction.guild.id)) || 'shop';
      const eco = await getEconomyConfig(interaction.guild.id);
      eco.karmaModifiers = { ...(eco.karmaModifiers||{}), [type]: [] };
      await updateEconomyConfig(interaction.guild.id, eco);
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildEconomyMenuRows(interaction.guild, 'karma');
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    // Karma rules creation: boutique
    if (interaction.isButton() && interaction.customId === 'eco_karma_add_shop') {
      const modal = new ModalBuilder().setCustomId('eco_karma_add_shop').setTitle('Règle boutique (karma)');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('condition').setLabel('Condition (ex: charm>=50, perversion>=100)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('percent').setLabel('Pourcentage (ex: -10 pour -10%)').setStyle(TextInputStyle.Short).setRequired(true))
      );
      try { return await interaction.showModal(modal); } catch (_) { return; }
    }
    if (interaction.isModalSubmit() && interaction.customId === 'eco_karma_add_shop') {
      await interaction.deferReply({ ephemeral: true });
      const condition = (interaction.fields.getTextInputValue('condition')||'').trim();
      const percent = Number((interaction.fields.getTextInputValue('percent')||'0').trim());
      const eco = await getEconomyConfig(interaction.guild.id);
      const list = Array.isArray(eco.karmaModifiers?.shop) ? eco.karmaModifiers.shop : [];
      list.push({ condition, percent });
      eco.karmaModifiers = { ...(eco.karmaModifiers||{}), shop: list };
      await updateEconomyConfig(interaction.guild.id, eco);
      return interaction.editReply({ content: '✅ Règle boutique ajoutée.' });
    }
    // Karma rules creation: actions
    if (interaction.isButton() && interaction.customId === 'eco_karma_add_action') {
      const modal = new ModalBuilder().setCustomId('eco_karma_add_action').setTitle('Règle actions (karma)');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('condition').setLabel('Condition (ex: charm>=50, perversion>=100)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('percent').setLabel('Pourcentage sur gains/pertes (ex: +15)').setStyle(TextInputStyle.Short).setRequired(true))
      );
      try { return await interaction.showModal(modal); } catch (_) { return; }
    }
    if (interaction.isModalSubmit() && interaction.customId === 'eco_karma_add_action') {
      await interaction.deferReply({ ephemeral: true });
      const condition = (interaction.fields.getTextInputValue('condition')||'').trim();
      const percent = Number((interaction.fields.getTextInputValue('percent')||'0').trim());
      const eco = await getEconomyConfig(interaction.guild.id);
      const list = Array.isArray(eco.karmaModifiers?.actions) ? eco.karmaModifiers.actions : [];
      list.push({ condition, percent });
      eco.karmaModifiers = { ...(eco.karmaModifiers||{}), actions: list };
      await updateEconomyConfig(interaction.guild.id, eco);
      return interaction.editReply({ content: '✅ Règle actions ajoutée.' });
    }
    // Karma grants
    if (interaction.isButton() && interaction.customId === 'eco_karma_add_grant') {
      const modal = new ModalBuilder().setCustomId('eco_karma_add_grant').setTitle('Grant direct (karma)');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('condition').setLabel('Condition (ex: charm>=100)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('money').setLabel('Montant (ex: +500 ou -200)').setStyle(TextInputStyle.Short).setRequired(true))
      );
      try { return await interaction.showModal(modal); } catch (_) { return; }
    }
    if (interaction.isModalSubmit() && interaction.customId === 'eco_karma_add_grant') {
      await interaction.deferReply({ ephemeral: true });
      const condition = (interaction.fields.getTextInputValue('condition')||'').trim();
      const money = Number((interaction.fields.getTextInputValue('money')||'0').trim());
      const eco = await getEconomyConfig(interaction.guild.id);
      const list = Array.isArray(eco.karmaModifiers?.grants) ? eco.karmaModifiers.grants : [];
      list.push({ condition, money });
      eco.karmaModifiers = { ...(eco.karmaModifiers||{}), grants: list };
      await updateEconomyConfig(interaction.guild.id, eco);
      return interaction.editReply({ content: '✅ Grant direct ajouté.' });
    }

    // Confess config handlers
    if (interaction.isStringSelectMenu() && interaction.customId === 'confess_mode') {
      const mode = interaction.values[0];
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildConfessRows(interaction.guild, mode);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isChannelSelectMenu() && interaction.customId.startsWith('confess_channels_add:')) {
      const mode = interaction.customId.split(':')[1] || 'sfw';
      await addConfessChannels(interaction.guild.id, interaction.values, mode);
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildConfessRows(interaction.guild, mode);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('confess_channels_remove:')) {
      const mode = interaction.customId.split(':')[1] || 'sfw';
      if (interaction.values.includes('none')) return interaction.deferUpdate();
      await removeConfessChannels(interaction.guild.id, interaction.values, mode);
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildConfessRows(interaction.guild, mode);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isChannelSelectMenu() && interaction.customId === 'confess_log_select') {
      const channelId = interaction.values[0];
      await updateConfessConfig(interaction.guild.id, { logChannelId: String(channelId||'') });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildConfessRows(interaction.guild, 'sfw');
      return interaction.update({ embeds: [embed], components: [...rows] });
    }

    // Logs config handlers
    if (interaction.isButton() && interaction.customId === 'logs_toggle') {
      const cfg = await getLogsConfig(interaction.guild.id);
      await updateLogsConfig(interaction.guild.id, { enabled: !cfg.enabled });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildLogsRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isButton() && interaction.customId === 'logs_pseudo') {
      const cfg = await getLogsConfig(interaction.guild.id);
      await updateLogsConfig(interaction.guild.id, { pseudo: !cfg.pseudo });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildLogsRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isButton() && interaction.customId === 'logs_emoji') {
      // Simple rotate among a set
      const cfg = await getLogsConfig(interaction.guild.id);
      const set = ['📝','🔔','🛡️','📢','🎧','💸','🧵','➕'];
      const idx = Math.max(0, set.indexOf(cfg.emoji||'📝'));
      const next = set[(idx+1)%set.length];
      await updateLogsConfig(interaction.guild.id, { emoji: next });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildLogsRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isChannelSelectMenu() && interaction.customId === 'logs_channel') {
      const id = interaction.values?.[0] || '';
      await updateLogsConfig(interaction.guild.id, { channelId: id });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildLogsRows(interaction.guild);
      await interaction.update({ embeds: [embed], components: [...rows] });
      try { await interaction.followUp({ content: id ? `✅ Salon global: <#${id}>` : '✅ Salon global effacé', ephemeral: true }); } catch (_) {}
      return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'logs_channel_percat') {
      if (!client._logsPerCat) client._logsPerCat = new Map();
      client._logsPerCat.set(interaction.guild.id, interaction.values[0]);
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildLogsRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isChannelSelectMenu() && interaction.customId.startsWith('logs_channel_set:')) {
      const cat = interaction.customId.split(':')[1] || 'moderation';
      const id = interaction.values?.[0];
      if (!id) { try { await interaction.reply({ content:'Aucun salon sélectionné.', ephemeral:true }); } catch (_) {} return; }
      const cfg = await getLogsConfig(interaction.guild.id);
      const channels = { ...(cfg.channels||{}) };
      channels[cat] = id;
      await updateLogsConfig(interaction.guild.id, { channels });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildLogsRows(interaction.guild);
      await interaction.update({ embeds: [embed], components: [...rows] });
      try { await interaction.followUp({ content: `✅ Salon pour ${cat}: <#${id}>`, ephemeral: true }); } catch (_) {}
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith('logs_cat:')) {
      const key = interaction.customId.split(':')[1];
      const cfg = await getLogsConfig(interaction.guild.id);
      const cats = { ...(cfg.categories||{}) };
      cats[key] = !cats[key];
      await updateLogsConfig(interaction.guild.id, { categories: cats });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildLogsRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'logs_cats_toggle') {
      const cfg = await getLogsConfig(interaction.guild.id);
      const set = new Set(interaction.values);
      const cats = { ...(cfg.categories||{}) };
      // Flip selected ones
      for (const k of set) { cats[k] = !cats[k]; }
      await updateLogsConfig(interaction.guild.id, { categories: cats });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildLogsRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isButton() && interaction.customId === 'confess_toggle_replies') {
      const cf = await getConfessConfig(interaction.guild.id);
      const allow = !cf.allowReplies;
      await updateConfessConfig(interaction.guild.id, { allowReplies: allow });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildConfessRows(interaction.guild, 'sfw');
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isButton() && interaction.customId === 'confess_toggle_naming') {
      const cf = await getConfessConfig(interaction.guild.id);
      const next = cf.threadNaming === 'nsfw' ? 'normal' : 'nsfw';
      await updateConfessConfig(interaction.guild.id, { threadNaming: next });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildConfessRows(interaction.guild, 'sfw');
      return interaction.update({ embeds: [embed], components: [...rows] });
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
    // AutoThread config handlers
    if (interaction.isChannelSelectMenu() && interaction.customId === 'autothread_channels_add') {
      const cfg = await getAutoThreadConfig(interaction.guild.id);
      const set = new Set(cfg.channels || []);
      for (const id of interaction.values) set.add(String(id));
      await updateAutoThreadConfig(interaction.guild.id, { channels: Array.from(set) });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildAutoThreadRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'autothread_channels_remove') {
      if (interaction.values.includes('none')) return interaction.deferUpdate();
      const cfg = await getAutoThreadConfig(interaction.guild.id);
      const remove = new Set(interaction.values.map(String));
      const next = (cfg.channels||[]).filter(id => !remove.has(String(id)));
      await updateAutoThreadConfig(interaction.guild.id, { channels: next });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildAutoThreadRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'autothread_naming') {
      const mode = interaction.values[0];
      const cfg = await getAutoThreadConfig(interaction.guild.id);
      await updateAutoThreadConfig(interaction.guild.id, { naming: { ...(cfg.naming||{}), mode } });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildAutoThreadRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'autothread_archive') {
      const policy = interaction.values[0];
      const cfg = await getAutoThreadConfig(interaction.guild.id);
      await updateAutoThreadConfig(interaction.guild.id, { archive: { ...(cfg.archive||{}), policy } });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildAutoThreadRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isButton() && interaction.customId === 'autothread_custom_pattern') {
      const modal = new ModalBuilder().setCustomId('autothread_custom_modal').setTitle('Pattern de nom de fil');
      const input = new TextInputBuilder().setCustomId('pattern').setLabel('Pattern (ex: Sujet-{num})').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80).setPlaceholder('Sujet-{num}');
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === 'autothread_custom_modal') {
      await interaction.deferReply({ ephemeral: true });
      const pattern = interaction.fields.getTextInputValue('pattern') || '';
      const cfg = await getAutoThreadConfig(interaction.guild.id);
      await updateAutoThreadConfig(interaction.guild.id, { naming: { ...(cfg.naming||{}), customPattern: pattern } });
      return interaction.editReply({ content: '✅ Pattern mis à jour.' });
    }
    // Counting config handlers
    if (interaction.isChannelSelectMenu() && interaction.customId === 'counting_channels_add') {
      const cfg = await getCountingConfig(interaction.guild.id);
      const set = new Set(cfg.channels || []);
      for (const id of interaction.values) set.add(String(id));
      await updateCountingConfig(interaction.guild.id, { channels: Array.from(set) });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildCountingRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'counting_channels_remove') {
      if (interaction.values.includes('none')) return interaction.deferUpdate();
      const cfg = await getCountingConfig(interaction.guild.id);
      const remove = new Set(interaction.values.map(String));
      const next = (cfg.channels||[]).filter(id => !remove.has(String(id)));
      await updateCountingConfig(interaction.guild.id, { channels: next });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildCountingRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isButton() && interaction.customId === 'counting_toggle_formulas') {
      const cfg = await getCountingConfig(interaction.guild.id);
      await updateCountingConfig(interaction.guild.id, { allowFormulas: !cfg.allowFormulas });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildCountingRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isButton() && interaction.customId === 'counting_reset') {
      await setCountingState(interaction.guild.id, { current: 0, lastUserId: '' });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildCountingRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isButton() && interaction.customId === 'autothread_nsfw_add') {
      const modal = new ModalBuilder().setCustomId('autothread_nsfw_add_modal').setTitle('Ajouter noms NSFW');
      const input = new TextInputBuilder().setCustomId('names').setLabel('Noms (un par ligne)').setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === 'autothread_nsfw_add_modal') {
      await interaction.deferReply({ ephemeral: true });
      const text = interaction.fields.getTextInputValue('names') || '';
      const add = text.split('\n').map(s => s.trim()).filter(Boolean);
      const cfg = await getAutoThreadConfig(interaction.guild.id);
      const set = new Set([...(cfg.nsfwNames||[]), ...add]);
      await updateAutoThreadConfig(interaction.guild.id, { nsfwNames: Array.from(set) });
      return interaction.editReply({ content: `✅ Ajouté ${add.length} nom(s) NSFW.` });
    }
    if (interaction.isButton() && interaction.customId === 'autothread_nsfw_remove') {
      const cfg = await getAutoThreadConfig(interaction.guild.id);
      const list = (cfg.nsfwNames||[]).slice(0,25);
      const sel = new StringSelectMenuBuilder().setCustomId('autothread_nsfw_remove_select').setPlaceholder('Supprimer des noms NSFW…').setMinValues(1).setMaxValues(Math.max(1, list.length || 1));
      if (list.length) sel.addOptions(...list.map((n,i)=>({ label: n.slice(0,80), value: String(i) })));
      else sel.addOptions({ label: 'Aucun', value: 'none' }).setDisabled(true);
      return interaction.reply({ components: [new ActionRowBuilder().addComponents(sel)], ephemeral: true });
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'autothread_nsfw_remove_select') {
      if (interaction.values.includes('none')) return interaction.deferUpdate();
      const cfg = await getAutoThreadConfig(interaction.guild.id);
      const idxs = new Set(interaction.values.map(v=>Number(v)).filter(n=>Number.isFinite(n)));
      const next = (cfg.nsfwNames||[]).filter((_,i)=>!idxs.has(i));
      await updateAutoThreadConfig(interaction.guild.id, { nsfwNames: next });
      return interaction.update({ content: '✅ Noms NSFW supprimés.', components: [] });
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
      let levels;
      try { levels = await getLevelsConfig(interaction.guild.id); }
      catch (e) {
        try { await ensureStorageExists(); levels = await getLevelsConfig(interaction.guild.id); }
        catch (e2) { return interaction.reply({ content: `Erreur de stockage: ${e2?.code||'inconnue'}`, ephemeral: true }); }
      }
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

    if (interaction.isChatInputCommand() && interaction.commandName === 'adminkarma') {
      const hasManageGuild = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild) || interaction.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild);
      if (!hasManageGuild) return interaction.reply({ content: '⛔ Permission requise.', ephemeral: true });
      const type = interaction.options.getString('type', true); // 'charm' | 'perversion'
      const action = interaction.options.getString('action', true); // add | remove | set
      const member = interaction.options.getUser('membre', true);
      const value = Math.max(0, Math.abs(interaction.options.getInteger('valeur', true)));
      const eco = await getEconomyConfig(interaction.guild.id);
      const u = await getEconomyUser(interaction.guild.id, member.id);
      let before = type === 'charm' ? (u.charm||0) : (u.perversion||0);
      let after = before;
      if (action === 'add') after = before + value;
      else if (action === 'remove') after = Math.max(0, before - value);
      else if (action === 'set') after = value;
      if (type === 'charm') u.charm = after; else u.perversion = after;
      await setEconomyUser(interaction.guild.id, member.id, u);
      const label = type === 'charm' ? 'charme 🫦' : 'perversion 😈';
      const embed = buildEcoEmbed({
        title: 'Admin Karma',
        description: `Membre: ${member}\n${label}: ${before} → ${after}`,
        fields: [{ name: 'Action', value: action, inline: true }]
      });
      return interaction.reply({ embeds: [embed], ephemeral: true });
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

    // removed economy_set_base and economy_set_cooldowns

    if (interaction.isButton() && interaction.customId === 'economy_gifs') {
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildEconomyGifRows(interaction.guild, 'work');
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'economy_gifs_action') {
      const key = interaction.values[0];
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildEconomyGifRows(interaction.guild, key);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isButton() && interaction.customId.startsWith('economy_gifs_add:')) {
      const parts = interaction.customId.split(':');
      const kind = parts[1]; // success | fail
      const key = parts[2];
      const modal = new ModalBuilder().setCustomId(`economy_gifs_add_modal:${kind}:${key}`).setTitle(`Ajouter GIFs ${kind} — ${actionKeyToLabel(key)}`);
      const input = new TextInputBuilder().setCustomId('urls').setLabel('URLs (une par ligne)').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('https://...gif\nhttps://...gif');
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('economy_gifs_add_modal:')) {
      await interaction.deferReply({ ephemeral: true });
      const parts = interaction.customId.split(':');
      const kind = parts[1];
      const key = parts[2];
      const text = interaction.fields.getTextInputValue('urls') || '';
      const urls = text.split('\n').map(s => s.trim()).filter(u => /^https?:\/\//i.test(u));
      const eco = await getEconomyConfig(interaction.guild.id);
      const gifs = { ...(eco.actions?.gifs || {}) };
      const entry = gifs[key] || { success: [], fail: [] };
      entry[kind] = Array.from(new Set([...(Array.isArray(entry[kind]) ? entry[kind] : []), ...urls])).slice(0, 100);
      gifs[key] = entry;
      await updateEconomyConfig(interaction.guild.id, { actions: { ...(eco.actions||{}), gifs } });
      return interaction.editReply({ content: `✅ Ajouté ${urls.length} GIF(s) à ${actionKeyToLabel(key)} (${kind}).` });
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('economy_gifs_remove_success:')) {
      const key = interaction.customId.split(':')[1];
      if (interaction.values.includes('none')) return interaction.deferUpdate();
      const idxs = interaction.values.map(v => Number(v)).filter(n => Number.isFinite(n));
      const eco = await getEconomyConfig(interaction.guild.id);
      const gifs = { ...(eco.actions?.gifs || {}) };
      const entry = gifs[key] || { success: [], fail: [] };
      entry.success = (entry.success||[]).filter((_, i) => !idxs.includes(i));
      gifs[key] = entry;
      await updateEconomyConfig(interaction.guild.id, { actions: { ...(eco.actions||{}), gifs } });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildEconomyGifRows(interaction.guild, key);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('economy_gifs_remove_fail:')) {
      const key = interaction.customId.split(':')[1];
      if (interaction.values.includes('none')) return interaction.deferUpdate();
      const idxs = interaction.values.map(v => Number(v)).filter(n => Number.isFinite(n));
      const eco = await getEconomyConfig(interaction.guild.id);
      const gifs = { ...(eco.actions?.gifs || {}) };
      const entry = gifs[key] || { success: [], fail: [] };
      entry.fail = (entry.fail||[]).filter((_, i) => !idxs.includes(i));
      gifs[key] = entry;
      await updateEconomyConfig(interaction.guild.id, { actions: { ...(eco.actions||{}), gifs } });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildEconomyGifRows(interaction.guild, key);
      return interaction.update({ embeds: [embed], components: [...rows] });
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

    // Anonymous reply button → modal
    if (interaction.isButton() && (interaction.customId === 'confess_reply' || interaction.customId.startsWith('confess_reply_thread:'))) {
      let msgId = interaction.message?.id || '0';
      if (interaction.customId.startsWith('confess_reply_thread:')) {
        // Use the thread id from the button so we can post directly there
        const threadId = interaction.customId.split(':')[1];
        msgId = `thread-${threadId}`;
      }
      const modal = new ModalBuilder().setCustomId(`confess_reply_modal:${msgId}`).setTitle('Répondre anonymement');
      const input = new TextInputBuilder().setCustomId('text').setLabel('Votre réponse').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('confess_reply_modal:')) {
      const text = interaction.fields.getTextInputValue('text');
      await interaction.deferReply({ ephemeral: true });
      const msgId = interaction.customId.split(':')[1] || '0';
      let thread = null;
      // If we are already in a thread, post there directly
      try { if (interaction.channel && interaction.channel.isThread?.()) thread = interaction.channel; } catch (_) {}
      if (!thread) {
        if (msgId.startsWith('thread-')) {
          const tid = msgId.split('-')[1];
          try { thread = await interaction.client.channels.fetch(tid).catch(()=>null); } catch (_) { thread = null; }
        } else {
          // Fetch the base message in this channel and use/create its thread
          let baseMsg = null;
          try { baseMsg = await interaction.channel.messages.fetch(msgId).catch(()=>null); } catch (_) { baseMsg = null; }
          try { thread = baseMsg && baseMsg.hasThread ? baseMsg.thread : null; } catch (_) { thread = null; }
          if (!thread && baseMsg) {
            try { thread = await baseMsg.startThread({ name: 'Discussion', autoArchiveDuration: 1440 }); } catch (_) { thread = null; }
          }
        }
      }
      if (thread) {
        const embed = createEnhancedEmbed({
          title: '💬 Réponse Anonyme',
          description: `> ${text}\n\n*Message posté de manière anonyme* 🕶️`,
          color: THEME_COLORS.PURPLE,
          author: { name: 'Système de Confession', iconURL: THEME_IMAGE },
          footerText: 'BAG • Confession Anonyme',
          fields: [
            { name: '🔒 Confidentialité', value: 'Identité protégée', inline: true },
            { name: '⏰ Posté', value: '<t:' + Math.floor(Date.now()/1000) + ':R>', inline: true }
          ]
        });
        const sent = await thread.send({ embeds: [embed] }).catch(()=>null);
        // Admin log for anonymous reply
        try {
          const cf = await getConfessConfig(interaction.guild.id);
          if (cf.logChannelId) {
            const log = interaction.guild.channels.cache.get(cf.logChannelId);
            if (log && log.isTextBased?.()) {
              const admin = new EmbedBuilder()
                .setColor(0xff7043)
                .setTitle('Réponse anonyme')
                .addFields(
                  { name: 'Auteur', value: `${interaction.user} (${interaction.user.id})` },
                  { name: 'Salon', value: `<#${interaction.channel.id}>` },
                  { name: 'Fil', value: thread ? `<#${thread.id}>` : '—' },
                  ...(sent && sent.url ? [{ name: 'Lien', value: sent.url }] : []),
                )
                .setDescription(text || '—')
                .setTimestamp(new Date());
              await log.send({ embeds: [admin] }).catch(()=>{});
            }
          }
        } catch (_) {}
        return interaction.editReply({ content: '✅ Réponse envoyée dans le fil.' });
      } else {
        const sent = await interaction.channel.send({ content: `Réponse anonyme: ${text}` }).catch(()=>null);
        // Admin log fallback
        try {
          const cf = await getConfessConfig(interaction.guild.id);
          if (cf.logChannelId) {
            const log = interaction.guild.channels.cache.get(cf.logChannelId);
            if (log && log.isTextBased?.()) {
              const admin = new EmbedBuilder()
                .setColor(0xff7043)
                .setTitle('Réponse anonyme (sans fil)')
                .addFields(
                  { name: 'Auteur', value: `${interaction.user} (${interaction.user.id})` },
                  { name: 'Salon', value: `<#${interaction.channel.id}>` },
                  ...(sent && sent.url ? [{ name: 'Lien', value: sent.url }] : []),
                )
                .setDescription(text || '—')
                .setTimestamp(new Date());
              await log.send({ embeds: [admin] }).catch(()=>{});
            }
          }
        } catch (_) {}
        return interaction.editReply({ content: '✅ Réponse envoyée.' });
      }
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
      const embed = createEnhancedEmbed({
        title: '🛍️ Boutique BAG',
        description: '**Bienvenue dans la boutique exclusive !** 💎\n\n> Sélectionnez un article à acheter ci-dessous\n\n*Découvrez nos articles premium et récompenses uniques* ✨',
        color: THEME_COLORS.GOLD,
        author: { name: 'Boutique Premium', iconURL: THEME_IMAGE },
        fields: [
          { name: '💰 Monnaie', value: 'Coins BAG', inline: true },
          { name: '🎁 Récompenses', value: 'Articles exclusifs', inline: true },
          { name: '⭐ Statut', value: 'Membre VIP', inline: true }
        ]
      });
      const rows = await buildBoutiqueRows(interaction.guild);
      return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }
    // Lecteur manuel supprimé: UI s'ouvrira automatiquement au /play
    // Basic /play (join + search + play)
    if (interaction.isChatInputCommand() && interaction.commandName === 'play') {
      try {
        await interaction.deferReply();
        const query = interaction.options.getString('recherche', true);
        if (!interaction.member?.voice?.channel) return interaction.editReply('Rejoignez un salon vocal.');
        if (!client.music || !ErelaManager) return interaction.editReply('Lecteur indisponible pour le moment (module).');
        const hasNode = (() => {
          try { return client.music.nodes && Array.from(client.music.nodes.values()).some(n => n.connected); } catch (_) { return false; }
        })();
        if (!hasNode) return interaction.editReply('Lecteur indisponible pour le moment (nœud non connecté).');
        // Timeout + multi-source fallback
        const searchWithTimeout = (q, user, ms = 15000) => {
          const t = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
          return Promise.race([client.music.search(q, user), t]);
        };
        const isUrl = /^https?:\/\//i.test(query);
        let normalized = query;
        try {
          if (isUrl) {
            const u = new URL(query);
            const host = u.hostname.replace(/^www\./, '');
            // Normalize YouTube hosts
            if (host === 'music.youtube.com' || host === 'm.youtube.com') u.hostname = 'www.youtube.com';
            if (host === 'youtu.be') {
              const id = u.pathname.replace(/^\//, '').split(/[?&#]/)[0];
              if (id) {
                u.hostname = 'www.youtube.com';
                u.pathname = '/watch';
                u.searchParams.set('v', id);
              }
            }
            // Map shorts/live/embed to watch
            if (/^\/shorts\//.test(u.pathname)) {
              const id = u.pathname.split('/')[2] || '';
              u.pathname = '/watch';
              if (id) u.searchParams.set('v', id);
            }
            if (/^\/live\//.test(u.pathname)) {
              const id = u.pathname.split('/')[2] || '';
              u.pathname = '/watch';
              if (id) u.searchParams.set('v', id);
            }
            if (/^\/embed\//.test(u.pathname)) {
              const id = u.pathname.split('/')[2] || '';
              u.pathname = '/watch';
              if (id) u.searchParams.set('v', id);
            }
            normalized = u.toString();
          }
        } catch (_) {}
        const attempts = isUrl ? [normalized] : [
          { query, source: 'youtube music' },
          { query, source: 'soundcloud' },
          { query, source: 'youtube' },
        ];
        let res = null;
        for (const attempt of attempts) {
          try {
            res = await searchWithTimeout(attempt, interaction.user, 15000);
            if (res && Array.isArray(res.tracks) && res.tracks.length) break;
          } catch (_) { /* continue */ }
        }
        if (!res || !res.tracks?.length) {
          // Last-chance: YouTube Music URL normalization already tried; also try extracting v parameter if provided
          try {
            if (isUrl) {
              const u2 = new URL(normalized);
              const vid = u2.searchParams.get('v');
              if (vid && /^[A-Za-z0-9_-]{8,}$/.test(vid)) {
                const direct = await searchWithTimeout(`https://www.youtube.com/watch?v=${vid}`, interaction.user, 12000).catch(()=>null);
                if (direct && direct.tracks?.length) res = direct;
                // Piped fallback to audio stream URL
                if ((!res || !res.tracks?.length) && typeof fetch === 'function') {
                  try {
                    const aurl = await getPipedAudioUrl(vid);
                    if (aurl) {
                      const httpRes = await client.music.search(aurl, interaction.user).catch(()=>null);
                      if (httpRes && httpRes.tracks?.length) res = httpRes;
                    }
                  } catch (_) {}
                }

                // Local yt-dlp fallback
                if (!res || !res.tracks?.length) {
                  const proxied = `http://127.0.0.1:8765/yt/${vid}`;
                  const httpRes2 = await client.music.search(proxied, interaction.user).catch(()=>null);
                  if (httpRes2 && httpRes2.tracks?.length) res = httpRes2;
                }
              }
            }
          } catch (_) {}
          // Fallback: yt-dlp to get direct audio URL if youtube fails
          if ((!res || !res.tracks?.length) && ytDlp && isUrl && /youtube\.com|youtu\.be/.test(normalized)) {
            try {
              const info = await ytDlp(normalized, { dumpSingleJson: true, noCheckCertificates: true, noWarnings: true, preferFreeFormats: true, addHeader: [ 'referer: https://www.youtube.com' ] });
              const candidates = Array.isArray(info?.formats) ? info.formats.filter(f => f.acodec && f.acodec !== 'none' && !f.vcodec && (!f.tbr || f.tbr <= 192)).sort((a,b)=> (a.tbr||0)-(b.tbr||0)) : [];
              const url = (candidates[0]?.url) || info?.url;
              if (url) {
                const httpRes = await client.music.search(url, interaction.user).catch(()=>null);
                if (httpRes && httpRes.tracks?.length) res = httpRes;
              }
            } catch (_) {}
          }
        }
        if (!res || !res.tracks?.length) return interaction.editReply('Aucun résultat. Essayez un lien YouTube complet (www.youtube.com).');
        let player = client.music.players.get(interaction.guild.id);
        if (!player) {
          try { console.log('[Music]/play creating player vc=', interaction.member.voice.channel.id, 'tc=', interaction.channel.id); } catch (_) {}
          player = client.music.create({ guild: interaction.guild.id, voiceChannel: interaction.member.voice.channel.id, textChannel: interaction.channel.id, selfDeaf: true });
          player.connect();
        }
        const wasPlaying = !!(player.playing || player.paused);
        const loadType = res.loadType || res.type;
        if (loadType === 'PLAYLIST_LOADED') player.queue.add(res.tracks);
        else {
          // Prefer highest bitrate track when multiple candidates are available
          try {
            const best = Array.isArray(res.tracks) ? res.tracks.sort((a,b)=> (b.info?.length||0)-(a.info?.length||0))[0] : res.tracks[0];
            player.queue.add(best || res.tracks[0]);
          } catch (_) {
            player.queue.add(res.tracks[0]);
          }
        }
        try { console.log('[Music]/play after add current=', !!player.queue.current, 'size=', player.queue.size, 'length=', player.queue.length); } catch (_) {}
        if (!player.playing && !player.paused) player.play({ volume: 100 });
        const firstTrack = res.tracks[0] || { title: 'Inconnu', uri: '' };
        if (wasPlaying) {
          const embed = createEnhancedEmbed({
            title: '➕ Ajouté à la file',
            description: `🎵 **[${firstTrack.title}](${firstTrack.uri})**\n\n*Piste ajoutée avec succès à la file d'attente*`,
            color: THEME_COLORS.SUCCESS,
            footerText: 'BAG • Musique',
            fields: [
              { name: '🎶 Statut', value: 'En file d\'attente', inline: true },
              { name: '⏱️ Ajouté', value: '<t:' + Math.floor(Date.now()/1000) + ':R>', inline: true }
            ]
          });
          await interaction.editReply({ embeds: [embed] });
        } else {
          const current = player.queue.current || firstTrack;
          const embed = createEnhancedEmbed({
            title: '🎶 Lecture en cours',
            description: `🎵 **[${current.title}](${current.uri})**\n\n*Profitez de cette magnifique mélodie !* 🎧`,
            color: THEME_COLORS.PRIMARY,
            footerText: 'BAG • Musique',
            fields: [
              { name: '▶️ Statut', value: 'En lecture', inline: true },
              { name: '🎵 Piste', value: 'Actuelle', inline: true },
              { name: '🔊 Volume', value: '100%', inline: true }
            ]
          });
          await interaction.editReply({ embeds: [embed] });
          try {
            const ui = createEnhancedEmbed({
              title: '🎧 Lecteur Musical',
              description: '**Contrôles de lecture avancés** 🎛️\n\n> Utilisez les boutons ci-dessous pour contrôler la musique\n\n*Interface intuitive pour une expérience optimale* 🎵',
              color: THEME_COLORS.ACCENT,
              image: THEME_IMAGE,
              footerText: 'BAG • Lecteur',
              fields: [
                { name: '⏮️ Précédent', value: 'Piste précédente', inline: true },
                { name: '▶️ Lecture', value: 'Jouer/Reprendre', inline: true },
                { name: '⏸️ Pause', value: 'Mettre en pause', inline: true },
                { name: '⏹️ Arrêt', value: 'Arrêter la lecture', inline: true },
                { name: '⏭️ Suivant', value: 'Piste suivante', inline: true },
                { name: '🔀 Aléatoire', value: 'Mode shuffle', inline: true }
              ]
            });
            const row1 = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('music_prev').setEmoji('⏮️').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId('music_play').setEmoji('▶️').setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId('music_pause').setEmoji('⏸️').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
              new ButtonBuilder().setCustomId('music_next').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
            );
            const row2 = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('music_shuffle').setEmoji('🔀').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId('music_loop').setEmoji('🔁').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId('music_queue').setLabel('File').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId('music_vol_down').setEmoji('🔉').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId('music_vol_up').setEmoji('🔊').setStyle(ButtonStyle.Secondary),
            );
            const row3 = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('music_leave').setLabel('Quitter').setStyle(ButtonStyle.Secondary),
            );
            await interaction.followUp({ embeds: [ui], components: [row1, row2, row3] });
          } catch (_) {}
        }
        return;
      } catch (e) {
        console.error('/play failed', e);
        try { return await interaction.editReply('Erreur de lecture.'); } catch (_) { return; }
      }
    }
    // Moderation commands (staff-only)
    if (interaction.isChatInputCommand() && ['ban','unban','kick','mute','unmute','warn','masskick','massban','purge'].includes(interaction.commandName)) {
      try {
        const member = interaction.member;
        const ok = await isStaffMember(interaction.guild, member);
        if (!ok) return interaction.reply({ content: '⛔ Réservé au staff.', ephemeral: true });
        const cmd = interaction.commandName;
        if (cmd === 'ban') {
          const user = interaction.options.getUser('membre', true);
          const reason = interaction.options.getString('raison') || '—';
          try { await interaction.guild.members.ban(user.id, { reason }); } catch (e) { return interaction.reply({ content: 'Échec du ban.', ephemeral: true }); }
          const embed = buildModEmbed('Ban', `${user} a été banni.`, [{ name:'Raison', value: reason }]);
          await interaction.reply({ embeds: [embed] });
          // log moderation
          const cfg = await getLogsConfig(interaction.guild.id);
          const log = buildModEmbed(`${cfg.emoji} Modération • Ban`, `${user} banni par ${interaction.user}`, [{ name:'Raison', value: reason }]);
          await sendLog(interaction.guild, 'moderation', log);
          return;
        }
        if (cmd === 'unban') {
          const userId = interaction.options.getString('userid', true);
          const reason = interaction.options.getString('raison') || '—';
          try { await interaction.guild.members.unban(userId, reason); } catch (e) { return interaction.reply({ content: 'Échec du déban.', ephemeral: true }); }
          const embed = buildModEmbed('Unban', `Utilisateur <@${userId}> débanni.`, [{ name:'Raison', value: reason }]);
          await interaction.reply({ embeds: [embed] });
          const cfg = await getLogsConfig(interaction.guild.id);
          const log = buildModEmbed(`${cfg.emoji} Modération • Unban`, `<@${userId}> débanni par ${interaction.user}`, [{ name:'Raison', value: reason }]);
          await sendLog(interaction.guild, 'moderation', log);
          return;
        }
        if (cmd === 'kick') {
          const user = interaction.options.getUser('membre', true);
          const reason = interaction.options.getString('raison') || '—';
          const m = await interaction.guild.members.fetch(user.id).catch(()=>null);
          if (!m) return interaction.reply({ content:'Membre introuvable.', ephemeral:true });
          try { await m.kick(reason); } catch (e) { return interaction.reply({ content:'Échec du kick.', ephemeral:true }); }
          const embed = buildModEmbed('Kick', `${user} a été expulsé.`, [{ name:'Raison', value: reason }]);
          await interaction.reply({ embeds: [embed] });
          const cfg = await getLogsConfig(interaction.guild.id);
          const log = buildModEmbed(`${cfg.emoji} Modération • Kick`, `${user} expulsé par ${interaction.user}`, [{ name:'Raison', value: reason }]);
          await sendLog(interaction.guild, 'moderation', log);
          return;
        }
        if (cmd === 'mute') {
          const user = interaction.options.getUser('membre', true);
          const minutes = interaction.options.getInteger('minutes', true);
          const reason = interaction.options.getString('raison') || '—';
          const m = await interaction.guild.members.fetch(user.id).catch(()=>null);
          if (!m) return interaction.reply({ content:'Membre introuvable.', ephemeral:true });
          const ms = minutes * 60 * 1000;
          try { await m.timeout(ms, reason); } catch (e) { return interaction.reply({ content:'Échec du mute.', ephemeral:true }); }
          const embed = buildModEmbed('Mute', `${user} a été réduit au silence.`, [{ name:'Durée', value: `${minutes} min`, inline:true }, { name:'Raison', value: reason, inline:true }]);
          await interaction.reply({ embeds: [embed] });
          const cfg = await getLogsConfig(interaction.guild.id);
          const log = buildModEmbed(`${cfg.emoji} Modération • Mute`, `${user} muet par ${interaction.user}`, [{ name:'Durée', value: `${minutes} min` }, { name:'Raison', value: reason }]);
          await sendLog(interaction.guild, 'moderation', log);
          return;
        }
        if (cmd === 'unmute') {
          const user = interaction.options.getUser('membre', true);
          const reason = interaction.options.getString('raison') || '—';
          const m = await interaction.guild.members.fetch(user.id).catch(()=>null);
          if (!m) return interaction.reply({ content:'Membre introuvable.', ephemeral:true });
          try { await m.timeout(null, reason); } catch (e) { return interaction.reply({ content:'Échec du unmute.', ephemeral:true }); }
          const embed = buildModEmbed('Unmute', `${user} a retrouvé la parole.`, [{ name:'Raison', value: reason }]);
          await interaction.reply({ embeds: [embed] });
          const cfg = await getLogsConfig(interaction.guild.id);
          const log = buildModEmbed(`${cfg.emoji} Modération • Unmute`, `${user} unmute par ${interaction.user}`, [{ name:'Raison', value: reason }]);
          await sendLog(interaction.guild, 'moderation', log);
          return;
        }
        if (cmd === 'warn') {
          const user = interaction.options.getUser('membre', true);
          const reason = interaction.options.getString('raison', true);
          try { const { addWarn, getWarns } = require('./storage/jsonStore'); await addWarn(interaction.guild.id, user.id, { by: interaction.user.id, reason }); const list = await getWarns(interaction.guild.id, user.id); const embed = buildModEmbed('Warn', `${user} a reçu un avertissement.`, [{ name:'Raison', value: reason }, { name:'Total avertissements', value: String(list.length) }]); await interaction.reply({ embeds: [embed] }); const cfg = await getLogsConfig(interaction.guild.id); const log = buildModEmbed(`${cfg.emoji} Modération • Warn`, `${user} averti par ${interaction.user}`, [{ name:'Raison', value: reason }, { name:'Total', value: String(list.length) }]); await sendLog(interaction.guild, 'moderation', log); return; } catch (_) { return interaction.reply({ content:'Échec du warn.', ephemeral:true }); }
        }
        if (cmd === 'masskick' || cmd === 'massban') {
          const mode = interaction.options.getString('mode', true); // with/without
          const role = interaction.options.getRole('role');
          const reason = interaction.options.getString('raison') || '—';
          const members = await interaction.guild.members.fetch();
          const should = (m) => {
            if (!role) return true; // si pas de rôle précisé, tout le monde
            const has = m.roles.cache.has(role.id);
            return mode === 'with' ? has : !has;
          };
          let count = 0; const action = cmd === 'massban' ? 'ban' : 'kick';
          for (const m of members.values()) {
            if (!should(m)) continue;
            try {
              if (action === 'ban') await interaction.guild.members.ban(m.id, { reason });
              else await m.kick(reason);
              count++;
            } catch (_) {}
          }
          const embed = buildModEmbed(cmd === 'massban' ? 'Mass Ban' : 'Mass Kick', `Action: ${cmd} • Affectés: ${count}`, [ role ? { name:'Rôle', value: role.name } : { name:'Rôle', value: '—' }, { name:'Mode', value: mode }, { name:'Raison', value: reason } ]);
          return interaction.reply({ embeds: [embed] });
        }
        if (cmd === 'purge') {
          const count = interaction.options.getInteger('nombre', true);
          const ch = interaction.channel;
          try { await ch.bulkDelete(count, true); } catch (_) { return interaction.reply({ content:'Échec de la purge (messages trop anciens ?).', ephemeral:true }); }
          // Reset runtime states (counting/confess mentions). Persisted configs sont conservés.
          try { const { setCountingState } = require('./storage/jsonStore'); await setCountingState(interaction.guild.id, { current: 0, lastUserId: '' }); } catch (_) {}
          const embed = buildModEmbed('Purge', `Salon nettoyé (${count} messages supprimés).`, []);
          return interaction.reply({ embeds: [embed] });
        }
      } catch (e) {
        return interaction.reply({ content: 'Erreur de modération.', ephemeral: true });
      }
    }

    // /testlog removed

    // Music: pause
    if (interaction.isChatInputCommand() && interaction.commandName === 'pause') {
      try {
        await interaction.deferReply();
        const player = client.music?.players.get(interaction.guild.id);
        if (!player) return interaction.editReply('Aucun lecteur.');
        player.pause(true);
        return interaction.editReply('⏸️ Lecture en pause.');
      } catch (e) { try { return await interaction.editReply('Erreur pause.'); } catch (_) { return; } }
    }

    // Music: resume
    if (interaction.isChatInputCommand() && interaction.commandName === 'resume') {
      try {
        await interaction.deferReply();
        const player = client.music?.players.get(interaction.guild.id);
        if (!player) return interaction.editReply('Aucun lecteur.');
        player.pause(false);
        return interaction.editReply('▶️ Lecture reprise.');
      } catch (e) { try { return await interaction.editReply('Erreur reprise.'); } catch (_) { return; } }
    }

    // Music: skip (next)
    if (interaction.isChatInputCommand() && interaction.commandName === 'skip') {
      try {
        await interaction.deferReply();
        const player = client.music?.players.get(interaction.guild.id);
        if (!player) return interaction.editReply('Aucun lecteur.');
        player.stop();
        return interaction.editReply('⏭️ Piste suivante.');
      } catch (e) { try { return await interaction.editReply('Erreur skip.'); } catch (_) { return; } }
    }

    // Music: stop (clear)
    if (interaction.isChatInputCommand() && interaction.commandName === 'stop') {
      try {
        await interaction.deferReply();
        const player = client.music?.players.get(interaction.guild.id);
        if (!player) return interaction.editReply('Aucun lecteur.');
        try { player.queue.clear(); } catch (_) {};
        player.stop();
        return interaction.editReply('⏹️ Lecture arrêtée.');
      } catch (e) { try { return await interaction.editReply('Erreur stop.'); } catch (_) { return; } }
    }

    // Music: queue
    if (interaction.isChatInputCommand() && interaction.commandName === 'queue') {
      try {
        const player = client.music?.players.get(interaction.guild.id);
        if (!player || (!player.queue.current && player.queue.size === 0)) {
          try { console.log('[Music]/queue empty'); } catch (_) {}
          return interaction.reply('Aucune piste en file.');
        }
        const lines = [];
        if (player.queue.current) lines.push(`En lecture: ${player.queue.current.title}`);
        for (let i = 0; i < Math.min(10, player.queue.length); i++) {
          const tr = player.queue[i];
          lines.push(`${i+1}. ${tr.title}`);
        }
        const embed = createEnhancedEmbed({
          title: '📋 File de Lecture',
          description: `**Voici votre playlist actuelle** 🎵\n\n${lines.join('\n')}\n\n*${player.queue.length} piste(s) en attente* 🎶`,
          color: THEME_COLORS.INFO,
          author: { name: 'Gestionnaire de File', iconURL: THEME_IMAGE },
          footerText: 'BAG • File de Lecture',
          fields: [
            { name: '🎵 En cours', value: player.queue.current?.title || 'Aucune', inline: true },
            { name: '📊 Total', value: `${player.queue.length} pistes`, inline: true },
            { name: '⏱️ Statut', value: player.playing ? 'En lecture' : 'En pause', inline: true }
          ]
        });
        return interaction.reply({ embeds: [embed] });
      } catch (e) { return interaction.reply('Erreur file.'); }
    }

    // Music: leave
    if (interaction.isChatInputCommand() && interaction.commandName === 'leave') {
      try {
        await interaction.deferReply();
        const player = client.music?.players.get(interaction.guild.id);
        if (!player) return interaction.editReply('Aucun lecteur.');
        player.destroy();
        return interaction.editReply('👋 Déconnexion du vocal.');
      } catch (e) { try { return await interaction.editReply('Erreur quit.'); } catch (_) { return; } }
    }

    // Music: radio
    if (interaction.isChatInputCommand() && interaction.commandName === 'radio') {
      try {
        await interaction.deferReply();
        const station = interaction.options.getString('station', true);
        if (!interaction.member?.voice?.channel) return interaction.editReply('Rejoignez un salon vocal.');
        const map = {
          chillout: 'http://streaming.tdiradio.com:8000/house.mp3',
          lofi: 'https://radio.plaza.one/mp3',
          edm: 'https://icecast.ravepartyradio.org/ravepartyradio-192.mp3',
          jazz: 'https://jazz.stream.9080/stream'
        };
        const url = map[station] || map.chillout;
        if (!client.music || !ErelaManager) return interaction.editReply('Lecteur indisponible.');
        const hasNode = (() => { try { return client.music.nodes && Array.from(client.music.nodes.values()).some(n => n.connected); } catch (_) { return false; } })();
        if (!hasNode) return interaction.editReply('Lecteur indisponible (nœud).');
        let player = client.music.players.get(interaction.guild.id);
        if (!player) {
          player = client.music.create({ guild: interaction.guild.id, voiceChannel: interaction.member.voice.channel.id, textChannel: interaction.channel.id, selfDeaf: true });
          player.connect();
        }
        const res = await client.music.search(url, interaction.user).catch(()=>null);
        if (!res || !res.tracks?.length) return interaction.editReply('Station indisponible.');
        player.queue.add(res.tracks[0]);
        if (!player.playing && !player.paused) player.play();
        const embed = createEnhancedEmbed({
          title: '📻 Radio en Direct',
          description: `**Station sélectionnée:** ${station} 🎙️\n\n> Diffusion en cours...\n\n*Profitez de votre radio préférée !* 📡`,
          color: THEME_COLORS.ACCENT,
          author: { name: 'Radio BAG', iconURL: THEME_IMAGE },
          footerText: 'BAG • Radio',
          fields: [
            { name: '📡 Station', value: station, inline: true },
            { name: '🔴 Statut', value: 'En direct', inline: true },
            { name: '🎵 Type', value: 'Radio live', inline: true }
          ]
        });
        return interaction.editReply({ embeds: [embed] });
      } catch (e) { try { return await interaction.editReply('Erreur radio.'); } catch (_) { return; } }
    }

    // /testaudio removed

    // Music player button controls
    if (interaction.isButton() && interaction.customId.startsWith('music_')) {
      try {
        await interaction.deferUpdate();
      } catch (_) {
        // ignore
      }
      const id = interaction.customId;
      const player = client.music?.players.get(interaction.guild.id);
      if (!player) return;
      try {
        if (id === 'music_pause') player.pause(true);
        else if (id === 'music_play') player.pause(false);
        else if (id === 'music_stop') { try { player.queue.clear(); } catch (_) {}; player.stop(); }
        else if (id === 'music_next') player.stop();
        else if (id === 'music_shuffle') player.queue.shuffle();
        else if (id === 'music_loop') player.setQueueRepeat(!player.queueRepeat);
        else if (id === 'music_leave') player.destroy();
        else if (id === 'music_queue') {
          const lines = [];
          if (player.queue.current) lines.push(`En lecture: ${player.queue.current.title}`);
          for (let i = 0; i < Math.min(10, player.queue.length); i++) { const tr = player.queue[i]; lines.push(`${i+1}. ${tr.title}`); }
          const content = lines.join('\n') || 'File vide.';
          try { console.log('[Music] button queue ->', content); } catch (_) {}
          try { await interaction.followUp({ content, ephemeral: true }); } catch (_) {}
        } else if (id === 'music_vol_down') {
          try { const v = Math.max(0, (player.volume || 100) - 10); player.setVolume(v); } catch (_) {}
        } else if (id === 'music_vol_up') {
          try { const v = Math.min(200, (player.volume || 100) + 10); player.setVolume(v); } catch (_) {}
        }
      } catch (_) {}
      return;
    }

    // /confess command
    if (interaction.isChatInputCommand() && interaction.commandName === 'confess') {
      const cf = await getConfessConfig(interaction.guild.id);
      const chId = interaction.channel.id;
      const mode = (Array.isArray(cf?.nsfw?.channels) && cf.nsfw.channels.includes(chId)) ? 'nsfw'
        : ((Array.isArray(cf?.sfw?.channels) && cf.sfw.channels.includes(chId)) ? 'sfw' : null);
      if (!mode) return interaction.reply({ content: '⛔ Ce salon ne permet pas les confessions. Configurez-les dans /config → Confessions.', ephemeral: true });
      const text = interaction.options.getString('texte');
      const attach = interaction.options.getAttachment('image');
      if ((!text || text.trim() === '') && !attach) return interaction.reply({ content: 'Veuillez fournir un texte ou une image.', ephemeral: true });
      // Post anonymously in current channel
      const embed = new EmbedBuilder()
        .setColor(THEME_COLOR_ACCENT)
        .setAuthor({ name: 'Confession anonyme' })
        .setDescription(text || null)
        .setThumbnail(THEME_IMAGE)
        .setTimestamp(new Date())
        .setFooter({ text: 'BAG • Confessions' });
      const files = [];
      if (attach && attach.url) files.push(attach.url);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confess_reply').setLabel('Répondre anonymement').setStyle(ButtonStyle.Secondary).setDisabled(!cf.allowReplies)
      );
      const msg = await interaction.channel.send({ embeds: [embed], components: [row], files: files.length ? files : undefined }).catch(()=>null);
      // Create discussion thread if replies allowed
      if (msg && cf.allowReplies) {
        try {
          const index = await incrementConfessCounter(interaction.guild.id);
          let threadName = `Confession #${index}`;
          if (cf.threadNaming === 'nsfw') {
            const base = (cf.nsfwNames || ['Velours','Nuit Rouge','Écarlate','Aphrodite','Énigme','Saphir','Nocturne','Scarlett','Mystique','Aphrodisia'])[Math.floor(Math.random()*10)];
            const num = Math.floor(100 + Math.random()*900);
            threadName = `${base}-${num}`;
          }
          const thread = await msg.startThread({ name: threadName, autoArchiveDuration: 1440 }).catch(()=>null);
          // Add an in-thread helper with its own reply button
          if (thread) {
            const thrRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId(`confess_reply_thread:${thread.id}`).setLabel('Répondre anonymement').setStyle(ButtonStyle.Secondary)
            );
            await thread.send({ content: 'Répondez anonymement avec le bouton ci-dessous.', components: [thrRow] }).catch(()=>{});
          }
        } catch (_) {}
      }
      // Admin log
      if (cf.logChannelId) {
        const log = interaction.guild.channels.cache.get(cf.logChannelId);
        if (log && log.isTextBased?.()) {
          const admin = new EmbedBuilder()
            .setColor(0xff7043)
            .setTitle('Nouvelle confession')
            .addFields(
              { name: 'Auteur', value: `${interaction.user} (${interaction.user.id})` },
              { name: 'Salon', value: `<#${interaction.channel.id}>` },
            )
            .setDescription(text || '—')
            .setTimestamp(new Date());
          const content = attach && attach.url ? { embeds: [admin], files: [attach.url] } : { embeds: [admin] };
          log.send(content).catch(()=>{});
        }
      }
      return interaction.reply({ content: '✅ Confession envoyée.', ephemeral: true });
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
        let price = Number(it.price||0);
        // Booster shop price multiplier
        try {
          const b = eco.booster || {};
          const mem = await interaction.guild.members.fetch(interaction.user.id).catch(()=>null);
          const isBooster = Boolean(mem?.premiumSince || mem?.premiumSinceTimestamp);
          if (b.enabled && isBooster && Number(b.shopPriceMult) > 0) price = Math.floor(price * Number(b.shopPriceMult));
        } catch (_) {}
        // Apply karma shop discounts/penalties
        try {
          const u = await getEconomyUser(interaction.guild.id, interaction.user.id);
          const actorCharm = u.charm || 0; const actorPerv = u.perversion || 0;
          const perc = (eco.karmaModifiers?.shop || []).reduce((acc, r) => {
            try {
              const expr = String(r.condition||'').toLowerCase().replace(/charm/g, String(actorCharm)).replace(/perversion/g, String(actorPerv));
              if (!/^[0-9+\-*/%<>=!&|().\s]+$/.test(expr)) return acc;
              // eslint-disable-next-line no-eval
              const ok = !!eval(expr);
              return ok ? acc + Number(r.percent||0) : acc;
            } catch (_) { return acc; }
          }, 0);
          const factor = Math.max(0, 1 + perc / 100);
          price = Math.max(0, Math.floor(price * factor));
        } catch (_) {}
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
        let price = Number(entry.price||0);
        // Booster shop price multiplier
        try {
          const b = eco.booster || {};
          const mem = await interaction.guild.members.fetch(interaction.user.id).catch(()=>null);
          const isBooster = Boolean(mem?.premiumSince || mem?.premiumSinceTimestamp);
          if (b.enabled && isBooster && Number(b.shopPriceMult) > 0) price = Math.floor(price * Number(b.shopPriceMult));
        } catch (_) {}
        // Apply karma shop modifiers
        try {
          const actorCharm = u.charm || 0; const actorPerv = u.perversion || 0;
          const perc = (eco.karmaModifiers?.shop || []).reduce((acc, r) => {
            try {
              const expr = String(r.condition||'').toLowerCase().replace(/charm/g, String(actorCharm)).replace(/perversion/g, String(actorPerv));
              if (!/^[0-9+\-*/%<>=!&|().\s]+$/.test(expr)) return acc;
              // eslint-disable-next-line no-eval
              const ok = !!eval(expr);
              return ok ? acc + Number(r.percent||0) : acc;
            } catch (_) { return acc; }
          }, 0);
          const factor = Math.max(0, 1 + perc / 100);
          price = Math.max(0, Math.floor(price * factor));
        } catch (_) {}
        if ((u.amount||0) < price) return interaction.reply({ content: 'Solde insuffisant.', ephemeral: true });
        u.amount = (u.amount||0) - price;
        await setEconomyUser(interaction.guild.id, interaction.user.id, u);
        try {
          const member = await interaction.guild.members.fetch(interaction.user.id);
          await member.roles.add(roleId);
        } catch (_) {}
        // Track grant for temporary roles
        if ((entry.durationDays||0) > 0) {
          const eco2 = await getEconomyConfig(interaction.guild.id);
          const grants = { ...(eco2.shop?.grants || {}) };
          grants[`${interaction.user.id}:${roleId}`] = { userId: interaction.user.id, roleId, expiresAt: Date.now() + entry.durationDays*24*60*60*1000 };
          eco2.shop = { ...(eco2.shop||{}), grants };
          await updateEconomyConfig(interaction.guild.id, eco2);
        }
        const label = entry.name || (interaction.guild.roles.cache.get(roleId)?.name) || roleId;
        const embed = buildEcoEmbed({ title: 'Achat réussi', description: `Rôle attribué: ${label} (${entry.durationDays?`${entry.durationDays}j`:'permanent'}) pour ${price} ${eco.currency?.name || 'BAG$'}`, fields: [ { name: 'Solde', value: String(u.amount), inline: true } ] });
        return interaction.update({ embeds: [embed], components: [] });
      }
      if (choice.startsWith('suite:')) {
        const key = choice.split(':')[1];
        const prices = eco.suites?.prices || { day:0, week:0, month:0 };
        const daysMap = { day: eco.suites?.durations?.day || 1, week: eco.suites?.durations?.week || 7, month: eco.suites?.durations?.month || 30 };
        let price = Number(prices[key]||0);
        // Booster shop price multiplier
        try {
          const b = eco.booster || {};
          const mem = await interaction.guild.members.fetch(interaction.user.id).catch(()=>null);
          const isBooster = Boolean(mem?.premiumSince || mem?.premiumSinceTimestamp);
          if (b.enabled && isBooster && Number(b.shopPriceMult) > 0) price = Math.floor(price * Number(b.shopPriceMult));
        } catch (_) {}
        // Apply karma shop modifiers
        try {
          const actorCharm = u.charm || 0; const actorPerv = u.perversion || 0;
          const perc = (eco.karmaModifiers?.shop || []).reduce((acc, r) => {
            try {
              const expr = String(r.condition||'').toLowerCase().replace(/charm/g, String(actorCharm)).replace(/perversion/g, String(actorPerv));
              if (!/^[0-9+\-*/%<>=!&|().\s]+$/.test(expr)) return acc;
              // eslint-disable-next-line no-eval
              const ok = !!eval(expr);
              return ok ? acc + Number(r.percent||0) : acc;
            } catch (_) { return acc; }
          }, 0);
          const factor = Math.max(0, 1 + perc / 100);
          price = Math.max(0, Math.floor(price * factor));
        } catch (_) {}
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
// GIFs per action (success/fail)
const ACTION_GIFS = {
  work: {
    success: [
      'https://media.giphy.com/media/3o6ZtaO9BZHcOjmErm/giphy.gif',
      'https://media.giphy.com/media/3ohs7KViFv2Q1k6Q9O/giphy.gif',
      'https://media.giphy.com/media/3o7aD2saalBwwftBIY/giphy.gif'
    ],
    fail: [
      'https://media.giphy.com/media/26tOZ42Mg6pbTUPHW/giphy.gif',
      'https://media.giphy.com/media/3o6ZtpxSZbQRRnwCKQ/giphy.gif'
    ]
  },
  fish: {
    success: [
      'https://media.giphy.com/media/xT9IgIc0lryrxvqVGM/giphy.gif',
      'https://media.giphy.com/media/3ohhwIDbJnb5jWRVja/giphy.gif',
      'https://media.giphy.com/media/3o7qE1YN7aBOFPRw8E/giphy.gif'
    ],
    fail: [
      'https://media.giphy.com/media/3o6ZsUT0G3jvm7FQ5S/giphy.gif',
      'https://media.giphy.com/media/3o7bu8sRnYpTOGQJkM/giphy.gif'
    ]
  },
  give: {
    success: [
      'https://media.giphy.com/media/3ohhwf34cGDoFFhRzi/giphy.gif',
      'https://media.giphy.com/media/xUNd9HZq1itMki3jhC/giphy.gif',
      'https://media.giphy.com/media/l2JhLz2W1pVhU4X1y/giphy.gif'
    ]
  },
  steal: {
    success: [
      'https://media.giphy.com/media/26u4b45b8KlgAB7iM/giphy.gif',
      'https://media.giphy.com/media/l0MYEw0GzQJQ2FqJW/giphy.gif'
    ],
    fail: [
      'https://media.giphy.com/media/26tPplGWjN0xLybiU/giphy.gif',
      'https://media.giphy.com/media/3o6Zt6ML6BklcajjsA/giphy.gif'
    ]
  },
  kiss: {
    success: [
      'https://media.giphy.com/media/G3va31oEEnIkM/giphy.gif',
      'https://media.giphy.com/media/12VXIxKaIEarL2/giphy.gif',
      'https://media.giphy.com/media/3o6gE5aY7e5Wfhm9H6/giphy.gif'
    ],
    fail: [
      'https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif',
      'https://media.giphy.com/media/3o85xpxuE5fJcm7k7K/giphy.gif'
    ]
  },
  flirt: {
    success: [
      'https://media.giphy.com/media/l0HUqsz2jdQYElRm0/giphy.gif',
      'https://media.giphy.com/media/l3vR85PnGsBwu1PFK/giphy.gif',
      'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif'
    ],
    fail: [
      'https://media.giphy.com/media/3ohc1aG3Z5rKobAjS4/giphy.gif',
      'https://media.giphy.com/media/l46C6sdSa5YyE1Uuk/giphy.gif'
    ]
  },
  seduce: {
    success: [
      'https://media.giphy.com/media/3oEduSbSGpGaRX2Vri/giphy.gif',
      'https://media.giphy.com/media/3o6Zt2bYkS6vCuxoXu/giphy.gif'
    ],
    fail: [
      'https://media.giphy.com/media/3o6gE8f3ZxZzQ0imeI/giphy.gif',
      'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif'
    ]
  },
  fuck: {
    success: [
      'https://media.giphy.com/media/3o6ZsY3qZKqRR3YK9m/giphy.gif',
      'https://media.giphy.com/media/3o7btYIYbW0nJwF0dK/giphy.gif'
    ],
    fail: [
      'https://media.giphy.com/media/3oEduW2X6y83L1ZyBG/giphy.gif',
      'https://media.giphy.com/media/3o6Zt8j0Yk6y3o5cQg/giphy.gif'
    ]
  },
  massage: {
    success: [
      'https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif',
      'https://media.giphy.com/media/l1J9sGZee7lU0w7M4/giphy.gif',
      'https://media.giphy.com/media/3o6ZsZ0GQztrU1Vf3a/giphy.gif'
    ],
    fail: [
      'https://media.giphy.com/media/3o6Zt8zb1hQv5nYVxe/giphy.gif',
      'https://media.giphy.com/media/3ohhwH4gN1ZkzQeKkg/giphy.gif'
    ]
  },
  dance: {
    success: [
      'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif',
      'https://media.giphy.com/media/l0IylOPCNkiqOgMyA/giphy.gif',
      'https://media.giphy.com/media/3o7TKtnuHOHHUjR38Y/giphy.gif'
    ],
    fail: [
      'https://media.giphy.com/media/3o6Zt7Rfw1gXkZ0pO0/giphy.gif',
      'https://media.giphy.com/media/3o6Zt1YwS2rCA3VvGk/giphy.gif'
    ]
  },
  crime: {
    success: [
      'https://media.giphy.com/media/l0K4lQZ9Fz3hX8qKc/giphy.gif',
      'https://media.giphy.com/media/3o6ZsZLoN4RpmjQe3W/giphy.gif',
      'https://media.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif'
    ],
    fail: [
      'https://media.giphy.com/media/3o6Zt8j0Yk6y3o5cQg/giphy.gif',
      'https://media.giphy.com/media/3ohfFh9d4dZ3n8m3Gk/giphy.gif'
    ]
  }
}

client.on(Events.MessageCreate, async (message) => {
  try {
    if (!message.guild || message.author.bot) return;
    // Disboard bump detection
    try {
      const DISBOARD_ID = '302050872383242240';
      if (message.author.id === DISBOARD_ID) {
        const texts = [];
        if (message.content) texts.push(String(message.content));
        if (Array.isArray(message.embeds)) {
          for (const em of message.embeds) {
            if (em?.title) texts.push(String(em.title));
            if (em?.description) texts.push(String(em.description));
            if (em?.footer?.text) texts.push(String(em.footer.text));
            if (Array.isArray(em?.fields)) for (const f of em.fields) { if (f?.name) texts.push(String(f.name)); if (f?.value) texts.push(String(f.value)); }
          }
        }
        const text = texts.join(' ').toLowerCase();
        const hasBump = text.includes('bump');
        const successHints = ['done','effectué','effectue','réussi','reussi','successful','merci','thank'];
        const hasSuccess = successHints.some(k => text.includes(k));
        if (hasBump && hasSuccess) {
          await updateDisboardConfig(message.guild.id, { lastBumpAt: Date.now(), lastBumpChannelId: message.channel.id, reminded: false });
          try {
            const embed = new EmbedBuilder()
              .setColor(THEME_COLOR_PRIMARY)
              .setAuthor({ name: 'BAG • Disboard' })
              .setTitle('✨ Merci pour le bump !')
              .setDescription('Votre soutien fait rayonner le serveur. Le cooldown de 2 heures démarre maintenant.\n\n• Prochain rappel automatique: dans 2h\n• Salon: <#' + message.channel.id + '>\n\nRestez sexy, beaux/belles gosses 😘')
              .setThumbnail(THEME_IMAGE)
              .setFooter({ text: 'BAG • Premium' })
              .setTimestamp(new Date());
            await message.channel.send({ embeds: [embed] }).catch(()=>{});
          } catch (_) {}
        }
      }
    } catch (_) {}
    // AutoThread runtime: if message is in a configured channel, create a thread if none exists
    try {
      const at = await getAutoThreadConfig(message.guild.id);
      if (at.channels && at.channels.includes(message.channel.id)) {
        if (!message.hasThread) {
          const now = new Date();
          const num = (at.counter || 1);
          let name = 'Sujet-' + num;
          const mode = at.naming?.mode || 'member_num';
          if (mode === 'member_num') name = (message.member?.displayName || message.author.username) + '-' + num;
          else if (mode === 'custom' && at.naming?.customPattern) name = (at.naming.customPattern || '').replace('{num}', String(num)).replace('{user}', message.member?.displayName || message.author.username).substring(0, 90);
          else if (mode === 'nsfw') {
            const base = (at.nsfwNames||['Velours','Nuit Rouge','Écarlate','Aphrodite','Énigme','Saphir','Nocturne','Scarlett','Mystique','Aphrodisia'])[Math.floor(Math.random()*10)];
            const suffix = Math.floor(100 + Math.random()*900);
            name = base + '-' + suffix;
          } else if (mode === 'numeric') name = String(num);
          else if (mode === 'date_num') name = now.toISOString().slice(0,10) + '-' + num;
          const policy = at.archive?.policy || '7d';
          const archiveMap = { '1d': 1440, '7d': 10080, '1m': 43200, 'max': 10080 };
          const autoArchiveDuration = archiveMap[policy] || 10080;
          await message.startThread({ name, autoArchiveDuration }).catch(()=>{});
          await updateAutoThreadConfig(message.guild.id, { counter: num + 1 });
        }
      }
    } catch (_) {}
    // Counting runtime
    try {
      const cfg = await getCountingConfig(message.guild.id);
      if (cfg.channels && cfg.channels.includes(message.channel.id)) {
        const raw = (message.content || '').trim();
        // Keep only digits, operators, parentheses, spaces, caret, and sqrt symbol
        const onlyDigitsAndOps = raw.replace(/[^0-9+\-*/().\s^√]/g, '');
        // If any letters are present in the original message, ignore (do not reset)
        const state0 = cfg.state || { current: 0, lastUserId: '' };
        const expected0 = (state0.current || 0) + 1;
        if (/[a-zA-Z]/.test(raw)) {
          return;
        }
        // If no digit at all, ignore silently
        if (!/\d/.test(onlyDigitsAndOps)) {
          return;
        }
        let value = NaN;
        // Fast path: plain integer
        const intMatch = onlyDigitsAndOps.match(/^-?\d+$/);
        if (intMatch) {
          value = Number(intMatch[0]);
        } else if (cfg.allowFormulas) {
          let expr0 = onlyDigitsAndOps;
          expr0 = expr0.replace(/√\s*\(/g, 'Math.sqrt(');
          expr0 = expr0.replace(/√\s*([0-9]+(?:\.[0-9]+)?)/g, 'Math.sqrt($1)');
          expr0 = expr0.replace(/\^/g,'**');
          const testable = expr0.replace(/Math\.sqrt/g,'');
          const ok = /^[0-9+\-*/().\s]*$/.test(testable);
          if (ok && expr0.length > 0) {
            try { value = Number(Function('"use strict";return (' + expr0 + ')')()); } catch (_) { value = NaN; }
          }
          if (!Number.isFinite(value)) {
            const digitsOnly = onlyDigitsAndOps.replace(/[^0-9]/g,'');
            if (digitsOnly.length > 0) value = Number(digitsOnly);
          }
        } else {
          const digitsOnly = onlyDigitsAndOps.replace(/[^0-9]/g,'');
          if (digitsOnly.length > 0) value = Number(digitsOnly);
        }
        // Final fallback: first integer sequence
        if (!Number.isFinite(value)) {
          const m = onlyDigitsAndOps.match(/-?\d+/);
          if (m) value = Number(m[0]);
        }
        if (!Number.isFinite(value)) {
          await setCountingState(message.guild.id, { current: 0, lastUserId: '' });
          await message.reply({ embeds: [new EmbedBuilder().setColor(0xec407a).setTitle('❌ Oups… valeur invalide').setDescription('Attendu: **' + expected0 + '**\nRemise à zéro → **1**\n<@' + message.author.id + '>, on repart en douceur.').setFooter({ text: 'BAG • Comptage' }).setThumbnail(THEME_IMAGE)] }).catch(()=>{});
        } else {
          const next = Math.trunc(value);
          const state = cfg.state || { current: 0, lastUserId: '' };
          const expected = (state.current || 0) + 1;
          if ((state.lastUserId||'') === message.author.id) {
            await setCountingState(message.guild.id, { current: 0, lastUserId: '' });
            await message.reply({ embeds: [new EmbedBuilder().setColor(0xec407a).setTitle('❌ Doucement, un à la fois…').setDescription('Deux chiffres d\'affilée 😉\nAttendu: **' + expected + '**\nRemise à zéro → **1**\n<@' + message.author.id + '>, à toi de rejouer.').setFooter({ text: 'BAG • Comptage' }).setThumbnail(THEME_IMAGE)] }).catch(()=>{});
          } else if (next !== expected) {
            await setCountingState(message.guild.id, { current: 0, lastUserId: '' });
            await message.reply({ embeds: [new EmbedBuilder().setColor(0xec407a).setTitle('❌ Mauvais numéro').setDescription('Attendu: **' + expected + '**\nRemise à zéro → **1**\n<@' + message.author.id + '>, on se retrouve au début 💕').setFooter({ text: 'BAG • Comptage' }).setThumbnail(THEME_IMAGE)] }).catch(()=>{});
          } else {
            await setCountingState(message.guild.id, { current: next, lastUserId: message.author.id });
            try { await message.react('✅'); } catch (_) {}
          }
        }
      }
    } catch (_) {}

    const levels = await getLevelsConfig(message.guild.id);
    if (!levels?.enabled) return;
    const stats = await getUserStats(message.guild.id, message.author.id);
    stats.messages = (stats.messages||0) + 1;
    // XP for text
    let textXp = (levels.xpPerMessage || 10);
    try {
      const eco = await getEconomyConfig(message.guild.id);
      const b = eco.booster || {};
      const mem = await message.guild.members.fetch(message.author.id).catch(()=>null);
      const isBooster = Boolean(mem?.premiumSince || mem?.premiumSinceTimestamp);
      if (b.enabled && isBooster && Number(b.textXpMult) > 0) textXp = Math.round(textXp * Number(b.textXpMult));
    } catch (_) {}
    stats.xp = (stats.xp||0) + textXp;
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
        let xpAdd = minutes * (levels.xpPerVoiceMinute || 5);
        try {
          const eco = await getEconomyConfig(newState.guild.id);
          const b = eco.booster || {};
          const mem2 = await newState.guild.members.fetch(newState.id).catch(()=>null);
          const isBooster2 = Boolean(mem2?.premiumSince || mem2?.premiumSinceTimestamp);
          if (b.enabled && isBooster2 && Number(b.voiceXpMult) > 0) xpAdd = Math.round(xpAdd * Number(b.voiceXpMult));
        } catch (_) {}
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

let SUITE_EMOJI = '💞';

function emojiForHex(hex) {
  try {
    const h = hex.startsWith('#') ? hex.slice(1) : hex;
    const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    const d = max - min;
    let hue = 0;
    if (d === 0) hue = 0;
    else if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;
    // map to nearest color emoji
    if (max < 60) return '⚫️';
    if (hue < 15 || hue >= 345) return '🔴';
    if (hue < 45) return '🟠';
    if (hue < 75) return '🟡';
    if (hue < 165) return '🟢';
    if (hue < 255) return '🔵';
    if (hue < 315) return '🟣';
    return '🟤';
  } catch (_) { return '⬛'; }
}

const COLOR_PALETTES = {
  pastel: ['#FFB3BA','#FFDFBA','#FFFFBA','#BAFFC9','#BAE1FF','#F8BBD0','#F48FB1','#E1BEE7','#D1C4E9','#C5CAE9','#BBDEFB','#B3E5FC','#B2EBF2','#C8E6C9','#DCEDC8'],
  vif: ['#F44336','#E91E63','#9C27B0','#673AB7','#3F51B5','#2196F3','#03A9F4','#00BCD4','#009688','#4CAF50','#8BC34A','#CDDC39','#FFEB3B','#FFC107','#FF9800','#FF5722','#795548'],
  sombre: ['#1B1B1B','#212121','#263238','#2E3440','#37474F','#3E4C59','#424242','#455A64','#4E5D6C','#546E7A','#5C6B73','#607D8B','#6B7C8C'],
};

async function buildTruthDareRows(guild, mode = 'sfw') {
  const td = await getTruthDareConfig(guild.id);
  const modeSelect = new StringSelectMenuBuilder().setCustomId('td_mode').setPlaceholder('Mode…').addOptions(
    { label: 'Action/Vérité', value: 'sfw', default: mode === 'sfw' },
    { label: 'Action/Vérité NSFW', value: 'nsfw', default: mode === 'nsfw' },
  );
  const channelAdd = new ChannelSelectMenuBuilder().setCustomId(`td_channels_add:${mode}`).setPlaceholder('Ajouter des salons…').setMinValues(1).setMaxValues(3).addChannelTypes(ChannelType.GuildText);
  const channelRemove = new StringSelectMenuBuilder().setCustomId(`td_channels_remove:${mode}`).setPlaceholder('Retirer des salons…').setMinValues(1).setMaxValues(Math.max(1, Math.min(25, (td[mode].channels||[]).length || 1)));
  const opts = (td[mode].channels||[]).map(id => ({ label: guild.channels.cache.get(id)?.name || id, value: id }));
  if (opts.length) channelRemove.addOptions(...opts); else channelRemove.addOptions({ label: 'Aucun', value: 'none' }).setDisabled(true);
  const addActionBtn = new ButtonBuilder().setCustomId(`td_prompts_add_action:${mode}`).setLabel('Ajouter ACTION').setStyle(ButtonStyle.Primary);
  const addTruthBtn = new ButtonBuilder().setCustomId(`td_prompts_add_verite:${mode}`).setLabel('Ajouter VERITE').setStyle(ButtonStyle.Success);
  const promptsDelBtn = new ButtonBuilder().setCustomId(`td_prompts_delete:${mode}`).setLabel('Supprimer prompt').setStyle(ButtonStyle.Danger);
  const promptsDelAllBtn = new ButtonBuilder().setCustomId(`td_prompts_delete_all:${mode}`).setLabel('Tout supprimer').setStyle(ButtonStyle.Danger);
  return [
    new ActionRowBuilder().addComponents(modeSelect),
    new ActionRowBuilder().addComponents(channelAdd),
    new ActionRowBuilder().addComponents(channelRemove),
    new ActionRowBuilder().addComponents(addActionBtn, addTruthBtn, promptsDelBtn, promptsDelAllBtn),
  ];
}

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const ak = await getAutoKickConfig(member.guild.id);
    if (!ak?.enabled) return;
    await addPendingJoiner(member.guild.id, member.id, Date.now());
  } catch (_) {}
});