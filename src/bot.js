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
      if (req.url === '/backup') {
        const token = process.env.BACKUP_TOKEN || '';
        const auth = req.headers['authorization'] || '';
        if (token && auth !== `Bearer ${token}`) { res.statusCode = 401; return res.end('Unauthorized'); }
        try {
          const { readConfig, paths } = require('./storage/jsonStore');
          readConfig().then(async (cfg) => {
            const text = JSON.stringify(cfg, null, 2);
            res.setHeader('Content-Type', 'application/json');
            res.end(text);
            // Log success to configured logs channel
            try {
              const g = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(()=>null);
              if (g) { const lc = await getLogsConfig(g.id); const em = buildModEmbed(`${lc.emoji} Sauvegarde`, `Sauvegarde HTTP /backup — méthode: http`, []); await sendLog(g, 'backup', em); }
            } catch (_) {}
          }).catch(() => { res.statusCode = 500; res.end('ERR'); });
        } catch (_) { res.statusCode = 500; res.end('ERR'); }
        return;
      }
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

const THEME_COLOR_PRIMARY = 0x1e88e5; // blue
const THEME_COLOR_ACCENT = 0xec407a; // pink
const THEME_COLOR_NSFW = 0xd32f2f; // deep red for NSFW
const THEME_IMAGE = 'https://cdn.discordapp.com/attachments/1408458115283812484/1408497858256179400/file_00000000d78861f4993dddd515f84845.png?ex=68b08cda&is=68af3b5a&hm=2e68cb9d7dfc7a60465aa74447b310348fc2d7236e74fa7c08f9434c110d7959&';
const THEME_FOOTER_ICON = 'https://cdn.discordapp.com/attachments/1408458115283812484/1408458115770482778/20250305162902.png?ex=68b50516&is=68b3b396&hm=1d83bbaaa9451ed0034a52c48ede5ddc55db692b15e65b4fe5c659ed4c80b77d&';

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

function buildModEmbed(title, description, extras) {
  const embed = new EmbedBuilder()
    .setColor(THEME_COLOR_ACCENT)
    .setTitle(title)
    .setDescription(description || null)
    .setThumbnail(THEME_IMAGE)
    .setTimestamp(new Date())
    .setFooter({ text: 'BAG • Modération', iconURL: THEME_FOOTER_ICON });
  try { if (embed?.data?.footer?.text || true) embed.setFooter({ text: embed?.data?.footer?.text || 'Boy and Girls (BAG)', iconURL: THEME_FOOTER_ICON }); } catch (_) {}
  if (Array.isArray(extras) && extras.length) embed.addFields(extras);
  return embed;
}

function buildEcoEmbed(opts) {
  const { title, description, fields, color } = opts || {};
  const embed = new EmbedBuilder()
    .setColor(color || THEME_COLOR_PRIMARY)
    .setThumbnail(THEME_IMAGE)
    .setTimestamp(new Date())
    .setFooter({ text: 'BAG • Économie', iconURL: THEME_FOOTER_ICON });
  if (title) embed.setTitle(String(title));
  if (description) embed.setDescription(String(description));
  if (Array.isArray(fields) && fields.length) embed.addFields(fields);
  return embed;
}

// Embeds — Action/Vérité (Pro & Premium styles)
function buildTruthDareStartEmbed(mode, hasAction, hasTruth) {
  const isNsfw = String(mode||'').toLowerCase() === 'nsfw';
  const color = isNsfw ? THEME_COLOR_NSFW : THEME_COLOR_ACCENT;
  const title = isNsfw ? '🔞 Action ou Vérité (NSFW)' : '🎲 Action ou Vérité';
  const footerText = isNsfw ? 'BAG • Premium' : 'BAG • Pro';
  const lines = [];
  if (hasAction && hasTruth) lines.push('Choisissez votre destin…');
  else if (hasAction) lines.push('Appuyez sur ACTION pour commencer.');
  else if (hasTruth) lines.push('Appuyez sur VÉRITÉ pour commencer.');
  lines.push('Cliquez pour un nouveau prompt à chaque tour.');
  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: 'Action/Vérité • Boy and Girls (BAG)' })
    .setTitle(title)
    .setDescription(lines.join('\n'))
    .setThumbnail(THEME_IMAGE)
    .setTimestamp(new Date())
    .setFooter({ text: footerText, iconURL: THEME_FOOTER_ICON });
  return embed;
}

function buildTruthDarePromptEmbed(mode, type, text) {
  const isNsfw = String(mode||'').toLowerCase() === 'nsfw';
  const footerText = isNsfw ? 'BAG • Premium' : 'BAG • Pro';
  let color = isNsfw ? THEME_COLOR_NSFW : THEME_COLOR_PRIMARY;
  if (String(type||'').toLowerCase() === 'verite') color = isNsfw ? THEME_COLOR_NSFW : THEME_COLOR_ACCENT;
  const title = String(type||'').toLowerCase() === 'action' ? '🔥 ACTION' : '🎯 VÉRITÉ';
  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: 'Action/Vérité • Boy and Girls (BAG)' })
    .setTitle(title)
    .setDescription(`${String(text||'—')}\n\nCliquez pour un nouveau prompt.`)
    .setThumbnail(THEME_IMAGE)
    .setTimestamp(new Date())
    .setFooter({ text: footerText, iconURL: THEME_FOOTER_ICON });
  return embed;
}

async function handleEconomyAction(interaction, actionKey) {
  const eco = await getEconomyConfig(interaction.guild.id);
  // Check enabled
  const enabled = Array.isArray(eco.actions?.enabled) ? eco.actions.enabled : [];
  if (enabled.length && !enabled.includes(actionKey)) {
    return interaction.reply({ content: `⛔ Action désactivée.`, ephemeral: true });
  }
  const u = await getEconomyUser(interaction.guild.id, interaction.user.id);
  const now = Date.now();
  const conf = (eco.actions?.config || {})[actionKey] || {};
  const baseCd = Number(conf.cooldown || (eco.settings?.cooldowns?.[actionKey] || 0));
  let cdLeft = Math.max(0, (u.cooldowns?.[actionKey] || 0) - now);
  if (cdLeft > 0) return interaction.reply({ content: `Veuillez patienter ${Math.ceil(cdLeft/1000)}s avant de réessayer.`, ephemeral: true });
  // Booster cooldown multiplier
  let cdToSet = baseCd;
  try {
    const b = eco.booster || {};
    const mem = await interaction.guild.members.fetch(interaction.user.id).catch(()=>null);
    const isBooster = Boolean(mem?.premiumSince || mem?.premiumSinceTimestamp);
    if (b.enabled && isBooster && Number(b.actionCooldownMult) > 0) {
      cdToSet = Math.round(cdToSet * Number(b.actionCooldownMult));
    }
  } catch (_) {}
  // Utility
  const setCd = (k, sec) => { if (!u.cooldowns) u.cooldowns = {}; u.cooldowns[k] = now + sec*1000; };
  const randInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
  const gifs = ((eco.actions?.gifs || {})[actionKey]) || { success: [], fail: [] };
  const successRate = Number(conf.successRate ?? 1);
  const success = Math.random() < successRate;
  let moneyDelta = 0;
  let karmaField = null;
  let imageUrl = undefined;
  if (success) {
    moneyDelta = randInt(Number(conf.moneyMin||0), Number(conf.moneyMax||0));
    if (conf.karma === 'charm') { u.charm = (u.charm||0) + Number(conf.karmaDelta||0); karmaField = ['Karma charme', `+${Number(conf.karmaDelta||0)}`]; }
    else if (conf.karma === 'perversion') { u.perversion = (u.perversion||0) + Number(conf.karmaDelta||0); karmaField = ['Karma perversion', `+${Number(conf.karmaDelta||0)}`]; }
    imageUrl = Array.isArray(gifs.success) && gifs.success.length ? gifs.success[Math.floor(Math.random()*gifs.success.length)] : undefined;
  } else {
    moneyDelta = -randInt(Number(conf.failMoneyMin||0), Number(conf.failMoneyMax||0));
    if (conf.karma === 'charm') { u.charm = (u.charm||0) - Number(conf.failKarmaDelta||0); karmaField = ['Karma charme', `-${Number(conf.failKarmaDelta||0)}`]; }
    else if (conf.karma === 'perversion') { u.perversion = (u.perversion||0) + Number(conf.failKarmaDelta||0); karmaField = ['Karma perversion', `+${Number(conf.failKarmaDelta||0)}`]; }
    imageUrl = Array.isArray(gifs.fail) && gifs.fail.length ? gifs.fail[Math.floor(Math.random()*gifs.fail.length)] : undefined;
  }
  // Special cases
  if (actionKey === 'give') {
    const cible = interaction.options.getUser('membre', true);
    const montant = interaction.options.getInteger('montant', true);
    if ((u.amount||0) < montant) return interaction.reply({ content: `Solde insuffisant.`, ephemeral: true });
    u.amount = (u.amount||0) - montant;
    const tu = await getEconomyUser(interaction.guild.id, cible.id);
    tu.amount = (tu.amount||0) + montant;
    await setEconomyUser(interaction.guild.id, interaction.user.id, u);
    await setEconomyUser(interaction.guild.id, cible.id, tu);
    const embed = buildEcoEmbed({ title: 'Don effectué', description: `Vous avez donné ${montant} ${eco.currency?.name || 'BAG$'} à ${cible}.`, fields: [ { name: 'Votre solde', value: String(u.amount), inline: true } ] });
    if (imageUrl) embed.setImage(imageUrl);
    return interaction.reply({ embeds: [embed] });
  }
  if (actionKey === 'steal') {
    const cible = interaction.options.getUser('membre', true);
    const tu = await getEconomyUser(interaction.guild.id, cible.id);
    if (success) {
      const canSteal = Math.max(0, Math.min(Number(conf.moneyMax||0), tu.amount||0));
      const got = randInt(Math.min(Number(conf.moneyMin||0), canSteal), canSteal);
      tu.amount = Math.max(0, (tu.amount||0) - got);
      u.amount = (u.amount||0) + got;
      setCd('steal', cdToSet);
      await setEconomyUser(interaction.guild.id, interaction.user.id, u);
      await setEconomyUser(interaction.guild.id, cible.id, tu);
      const embed = buildEcoEmbed({ title: 'Vol réussi', description: `Vous avez volé ${got} ${eco.currency?.name || 'BAG$'} à ${cible}.`, fields: [ { name: 'Votre solde', value: String(u.amount), inline: true } ] });
      if (imageUrl) embed.setImage(imageUrl);
      return interaction.reply({ embeds: [embed] });
    } else {
      const lost = randInt(Number(conf.failMoneyMin||0), Number(conf.failMoneyMax||0));
      u.amount = Math.max(0, (u.amount||0) - lost);
      tu.amount = (tu.amount||0) + lost;
      setCd('steal', cdToSet);
      await setEconomyUser(interaction.guild.id, interaction.user.id, u);
      await setEconomyUser(interaction.guild.id, cible.id, tu);
      const embed = buildEcoEmbed({ title: 'Vol raté', description: `Vous avez été repéré par ${cible} et perdu ${lost} ${eco.currency?.name || 'BAG$'}.`, fields: [ { name: 'Votre solde', value: String(u.amount), inline: true } ] });
      if (imageUrl) embed.setImage(imageUrl);
      return interaction.reply({ embeds: [embed] });
    }
  }
  // Generic flow
  u.amount = Math.max(0, (u.amount||0) + moneyDelta);
  setCd(actionKey, cdToSet);
  await setEconomyUser(interaction.guild.id, interaction.user.id, u);
  const nice = actionKeyToLabel(actionKey);
  const title = success ? `Action réussie — ${nice}` : `Action échouée — ${nice}`;
  const desc = success ? `Gain: ${moneyDelta} ${eco.currency?.name || 'BAG$'}` : `Perte: ${Math.abs(moneyDelta)} ${eco.currency?.name || 'BAG$'}`;
  const fields = [ { name: 'Solde', value: String(u.amount), inline: true } ];
  if (karmaField) fields.push({ name: karmaField[0], value: karmaField[1], inline: true });
  const embed = buildEcoEmbed({ title, description: desc, fields });
  if (imageUrl) embed.setImage(imageUrl);
  return interaction.reply({ embeds: [embed] });
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

  embed.setFooter({ text: 'Boy and Girls (BAG) • Config', iconURL: THEME_FOOTER_ICON });

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

function buildBackRow() {
  const back = new ButtonBuilder()
    .setCustomId('config_back_home')
    .setLabel('← Retour')
    .setStyle(ButtonStyle.Secondary);
  return new ActionRowBuilder().addComponents(back);
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
      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, '#141414');
      bg.addColorStop(1, '#1e1e1e');
      ctx.fillStyle = bg;
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
    .setFooter({ text: `Boy and Girls (BAG) • ${offset + 1}-${Math.min(total, offset + limit)} sur ${total}`, iconURL: THEME_FOOTER_ICON })
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
  const gifsBtn = new ButtonBuilder().setCustomId('economy_gifs').setLabel('GIF actions').setStyle(ButtonStyle.Primary);
  const row = new ActionRowBuilder().addComponents(curBtn, gifsBtn);
  return [row];
}

function buildEconomyMenuSelect(selectedPage) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('economy_menu')
    .setPlaceholder('Économie: choisir une page…')
    .addOptions(
      { label: 'Réglages', value: 'settings', description: 'Devise, préférences', default: selectedPage === 'settings' },
      { label: 'Actions', value: 'actions', description: 'Activer/configurer les actions', default: selectedPage === 'actions' },
      { label: 'Karma', value: 'karma', description: 'Règles de karma', default: selectedPage === 'karma' },
      { label: 'Suites', value: 'suites', description: 'Salons privés temporaires', default: selectedPage === 'suites' },
      { label: 'Boutique', value: 'shop', description: 'Objets et rôles', default: selectedPage === 'shop' },
    );
  return new ActionRowBuilder().addComponents(menu);
}

async function buildEconomyMenuRows(guild, page) {
  const p = page || 'settings';
  if (p === 'karma') {
    const rows = await buildEconomyKarmaRows(guild);
    return [buildEconomyMenuSelect(p), ...rows];
  }
  if (p === 'actions') {
    if (!client._ecoActionCurrent) client._ecoActionCurrent = new Map();
    const sel = client._ecoActionCurrent.get(guild.id) || null;
    const rows = await buildEconomyActionDetailRows(guild, sel);
    return [buildEconomyMenuSelect(p), ...rows];
  }
  // default: settings
  const rows = await buildEconomySettingsRows(guild);
  return [buildEconomyMenuSelect('settings'), ...rows];
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

async function buildLogsRows(guild) {
  const cfg = await getLogsConfig(guild.id);
  const toggle = new ButtonBuilder().setCustomId('logs_toggle').setLabel(cfg.enabled ? 'Logs: ON' : 'Logs: OFF').setStyle(cfg.enabled ? ButtonStyle.Success : ButtonStyle.Secondary);
  const pseudo = new ButtonBuilder().setCustomId('logs_pseudo').setLabel(cfg.pseudo ? 'Pseudo: ON' : 'Pseudo: OFF').setStyle(cfg.pseudo ? ButtonStyle.Success : ButtonStyle.Secondary);
  const emoji = new ButtonBuilder().setCustomId('logs_emoji').setLabel(`Emoji: ${cfg.emoji || '📝'}`).setStyle(ButtonStyle.Secondary);
  const rowToggles = new ActionRowBuilder().addComponents(toggle, pseudo, emoji);

  const globalCh = new ChannelSelectMenuBuilder()
    .setCustomId('logs_channel')
    .setPlaceholder(cfg.channelId ? `Global: <#${cfg.channelId}>` : 'Salon global (optionnel)…')
    .setMinValues(0)
    .setMaxValues(1)
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  const rowGlobal = new ActionRowBuilder().addComponents(globalCh);

  if (!client._logsPerCat) client._logsPerCat = new Map();
  const cats = cfg.categories || {};
  const catKeys = Object.keys(cats);
  const selected = client._logsPerCat.get(guild.id) || 'moderation';
  const perCatSelect = new StringSelectMenuBuilder()
    .setCustomId('logs_channel_percat')
    .setPlaceholder('Choisir une catégorie…')
    .setMinValues(1)
    .setMaxValues(1);
  for (const k of catKeys) perCatSelect.addOptions({ label: k, value: k, default: selected === k });
  const rowPerCat = new ActionRowBuilder().addComponents(perCatSelect);

  const perCatCh = new ChannelSelectMenuBuilder()
    .setCustomId('logs_channel_set:' + selected)
    .setPlaceholder(cfg.channels?.[selected] ? `Salon ${selected}: <#${cfg.channels[selected]}>` : `Salon pour ${selected}…`)
    .setMinValues(1)
    .setMaxValues(1)
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
  const rowPerCatCh = new ActionRowBuilder().addComponents(perCatCh);

  const multi = new StringSelectMenuBuilder()
    .setCustomId('logs_cats_toggle')
    .setPlaceholder('Basculer catégories…')
    .setMinValues(1)
    .setMaxValues(Math.min(25, Math.max(1, catKeys.length || 1)));
  if (catKeys.length) multi.addOptions(...catKeys.map(k => ({ label: `${k} (${cats[k] ? 'ON' : 'OFF'})`, value: k })));
  else multi.addOptions({ label: 'Aucune catégorie', value: 'none' }).setDisabled(true);
  const rowMulti = new ActionRowBuilder().addComponents(multi);

  return [rowToggles, rowGlobal, rowPerCat, rowPerCatCh, rowMulti];
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

async function buildEconomyActionsRows(guild, selectedKey) {
  const eco = await getEconomyConfig(guild.id);
  const enabled = Array.isArray(eco.actions?.enabled) ? eco.actions.enabled : Object.keys(eco.actions?.config || {});
  const options = enabled.map((k) => {
    const c = (eco.actions?.config || {})[k] || {};
    const karma = c.karma === 'perversion' ? '😈' : (c.karma === 'charm' ? '🫦' : '—');
    return { label: `${actionKeyToLabel(k)} • ${karma} • ${c.moneyMin||0}-${c.moneyMax||0} • ${c.cooldown||0}s`, value: k, default: selectedKey === k };
  });
  if (options.length === 0) options.push({ label: 'Aucune action', value: 'none' });
  const select = new StringSelectMenuBuilder().setCustomId('economy_actions_pick').setPlaceholder('Choisir une action à modifier…').addOptions(...options);
  const row = new ActionRowBuilder().addComponents(select);
  return [row];
}

async function buildEconomyActionDetailRows(guild, selectedKey) {
  const rows = await buildEconomyActionsRows(guild, selectedKey);
  if (!selectedKey || selectedKey === 'none') return rows;
  const eco = await getEconomyConfig(guild.id);
  const isEnabled = Array.isArray(eco.actions?.enabled) ? eco.actions.enabled.includes(selectedKey) : true;
  const toggle = new ButtonBuilder().setCustomId(`economy_action_toggle:${selectedKey}`).setLabel(isEnabled ? 'Action: ON' : 'Action: OFF').setStyle(isEnabled ? ButtonStyle.Success : ButtonStyle.Secondary);
  const editBasic = new ButtonBuilder().setCustomId(`economy_action_edit_basic:${selectedKey}`).setLabel('Paramètres de base').setStyle(ButtonStyle.Primary);
  const editKarma = new ButtonBuilder().setCustomId(`economy_action_edit_karma:${selectedKey}`).setLabel('Karma').setStyle(ButtonStyle.Secondary);
  rows.push(new ActionRowBuilder().addComponents(toggle, editBasic, editKarma));
  return rows;
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

async function buildSuitesRows(guild) {
  const eco = await getEconomyConfig(guild.id);
  const placeholder = eco.suites?.categoryId ? `Catégorie actuelle: <#${eco.suites.categoryId}>` : 'Choisir la catégorie pour les suites…';
  const cat = new ChannelSelectMenuBuilder()
    .setCustomId('suites_category')
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(1)
    .addChannelTypes(ChannelType.GuildCategory);
  return [new ActionRowBuilder().addComponents(cat)];
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
          const embed = new EmbedBuilder()
            .setColor(THEME_COLOR_ACCENT)
            .setTitle('💋 Un petit bump, beau/belle gosse ?')
            .setDescription('Deux heures se sont écoulées… Faites vibrer le serveur à nouveau avec `/bump` 😈🔥')
            .setThumbnail(THEME_IMAGE)
            .setFooter({ text: 'BAG • Disboard', iconURL: THEME_FOOTER_ICON })
            .setTimestamp(new Date());
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
      const embed = buildModEmbed(`${cfg.emoji} Sauvegarde`, `Snapshot de l'état du bot enregistré.`, [
        { name: 'Horodatage', value: new Date().toLocaleString('fr-FR') }
      ]);
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
    // Boutique config handlers
    if (interaction.isButton() && interaction.customId === 'shop_add_role') {
      const modal = new ModalBuilder().setCustomId('shop_add_role_modal').setTitle('Ajouter un rôle à la boutique');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roleId').setLabel('ID du rôle').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Prix').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duration').setLabel('Durée en jours (0=permanent)').setStyle(TextInputStyle.Short).setRequired(true))
      );
      try { return await interaction.showModal(modal); } catch (_) { return; }
    }
    if (interaction.isModalSubmit() && interaction.customId === 'shop_add_role_modal') {
      await interaction.deferReply({ ephemeral: true });
      const roleId = (interaction.fields.getTextInputValue('roleId')||'').trim();
      const price = Number((interaction.fields.getTextInputValue('price')||'0').trim());
      const durationDays = Math.max(0, Number((interaction.fields.getTextInputValue('duration')||'0').trim()));
      const eco = await getEconomyConfig(interaction.guild.id);
      const roles = Array.isArray(eco.shop?.roles) ? eco.shop.roles.slice() : [];
      const exists = roles.find(r => String(r.roleId) === String(roleId) && Number(r.durationDays||0) === Number(durationDays||0));
      if (exists) return interaction.editReply({ content: 'Ce rôle existe déjà dans la boutique avec cette durée.' });
      roles.push({ roleId, price: Math.max(0, price), durationDays: Math.max(0, durationDays) });
      eco.shop = { ...(eco.shop||{}), roles };
      await updateEconomyConfig(interaction.guild.id, eco);
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = [buildEconomyMenuSelect('shop'), ...(await buildShopRows(interaction.guild))];
      return interaction.editReply({ content: '✅ Rôle ajouté.', embeds: [embed], components: [...rows] });
    }
    if (interaction.isButton() && interaction.customId === 'shop_add_item') {
      const modal = new ModalBuilder().setCustomId('shop_add_item_modal').setTitle('Ajouter un objet à la boutique');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nom de l\'objet').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Prix').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('id').setLabel('Identifiant (unique)').setStyle(TextInputStyle.Short).setRequired(true))
      );
      try { return await interaction.showModal(modal); } catch (_) { return; }
    }
    if (interaction.isModalSubmit() && interaction.customId === 'shop_add_item_modal') {
      await interaction.deferReply({ ephemeral: true });
      const id = (interaction.fields.getTextInputValue('id')||'').trim();
      const name = (interaction.fields.getTextInputValue('name')||'').trim();
      const price = Number((interaction.fields.getTextInputValue('price')||'0').trim());
      const eco = await getEconomyConfig(interaction.guild.id);
      const items = Array.isArray(eco.shop?.items) ? eco.shop.items.slice() : [];
      if (items.some(x => String(x.id) === id)) return interaction.editReply({ content: 'ID d\'objet déjà utilisé.' });
      items.push({ id, name, price: Math.max(0, price) });
      eco.shop = { ...(eco.shop||{}), items };
      await updateEconomyConfig(interaction.guild.id, eco);
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = [buildEconomyMenuSelect('shop'), ...(await buildShopRows(interaction.guild))];
      return interaction.editReply({ content: '✅ Objet ajouté.', embeds: [embed], components: [...rows] });
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'shop_remove_select') {
      if (interaction.values.includes('none')) return interaction.deferUpdate();
      const eco = await getEconomyConfig(interaction.guild.id);
      const items = Array.isArray(eco.shop?.items) ? eco.shop.items.slice() : [];
      const roles = Array.isArray(eco.shop?.roles) ? eco.shop.roles.slice() : [];
      for (const v of interaction.values) {
        if (v.startsWith('item:')) {
          const id = v.split(':')[1];
          const idx = items.findIndex(x => String(x.id) === id);
          if (idx >= 0) items.splice(idx, 1);
        } else if (v.startsWith('role:')) {
          const [_, roleId, durStr] = v.split(':');
          const dur = Number(durStr||0);
          const idx = roles.findIndex(r => String(r.roleId) === String(roleId) && Number(r.durationDays||0) === dur);
          if (idx >= 0) roles.splice(idx, 1);
        }
      }
      eco.shop = { ...(eco.shop||{}), items, roles };
      await updateEconomyConfig(interaction.guild.id, eco);
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = [buildEconomyMenuSelect('shop'), ...(await buildShopRows(interaction.guild))];
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'economy_actions_pick') {
      const key = interaction.values[0];
      if (!client._ecoActionCurrent) client._ecoActionCurrent = new Map();
      client._ecoActionCurrent.set(interaction.guild.id, key);
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildEconomyMenuRows(interaction.guild, 'actions');
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isButton() && interaction.customId.startsWith('economy_action_toggle:')) {
      const key = interaction.customId.split(':')[1];
      const eco = await getEconomyConfig(interaction.guild.id);
      const enabled = new Set(Array.isArray(eco.actions?.enabled) ? eco.actions.enabled : []);
      if (enabled.has(key)) enabled.delete(key); else enabled.add(key);
      eco.actions = { ...(eco.actions||{}), enabled: Array.from(enabled) };
      await updateEconomyConfig(interaction.guild.id, eco);
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildEconomyMenuRows(interaction.guild, 'actions');
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isButton() && interaction.customId.startsWith('economy_action_edit_basic:')) {
      const key = interaction.customId.split(':')[1];
      const eco = await getEconomyConfig(interaction.guild.id);
      const c = (eco.actions?.config || {})[key] || {};
      const modal = new ModalBuilder().setCustomId(`economy_action_basic_modal:${key}`).setTitle('Paramètres de base');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('moneyMin').setLabel('Argent min').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(c.moneyMin||0))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('moneyMax').setLabel('Argent max').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(c.moneyMax||0))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cooldown').setLabel('Cooldown (sec)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(c.cooldown||0))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('successRate').setLabel('Taux de succès (0-1)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(c.successRate??1)))
      );
      try { return await interaction.showModal(modal); } catch (_) { return; }
    }
    if (interaction.isButton() && interaction.customId.startsWith('economy_action_edit_karma:')) {
      const key = interaction.customId.split(':')[1];
      const eco = await getEconomyConfig(interaction.guild.id);
      const c = (eco.actions?.config || {})[key] || {};
      const modal = new ModalBuilder().setCustomId(`economy_action_karma_modal:${key}`).setTitle('Réglages Karma');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('karma').setLabel("Type ('charm' | 'perversion' | 'none')").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(c.karma||'none'))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('karmaDelta').setLabel('Delta (succès)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(c.karmaDelta||0))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('failMoneyMin').setLabel('Argent échec min').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(c.failMoneyMin||0))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('failMoneyMax').setLabel('Argent échec max').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(c.failMoneyMax||0))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('failKarmaDelta').setLabel('Delta Karma (échec)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(c.failKarmaDelta||0)))
      );
      try { return await interaction.showModal(modal); } catch (_) { return; }
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('economy_action_basic_modal:')) {
      await interaction.deferReply({ ephemeral: true });
      const key = interaction.customId.split(':')[1];
      const eco = await getEconomyConfig(interaction.guild.id);
      const c = (eco.actions?.config || {})[key] || {};
      const moneyMin = Number((interaction.fields.getTextInputValue('moneyMin')||'0').trim());
      const moneyMax = Number((interaction.fields.getTextInputValue('moneyMax')||'0').trim());
      const cooldown = Number((interaction.fields.getTextInputValue('cooldown')||'0').trim());
      const successRate = Number((interaction.fields.getTextInputValue('successRate')||'1').trim());
      if (!eco.actions) eco.actions = {};
      if (!eco.actions.config) eco.actions.config = {};
      eco.actions.config[key] = { ...(c||{}), moneyMin, moneyMax, cooldown, successRate };
      await updateEconomyConfig(interaction.guild.id, eco);
      return interaction.editReply({ content: '✅ Paramètres mis à jour.' });
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('economy_action_karma_modal:')) {
      await interaction.deferReply({ ephemeral: true });
      const key = interaction.customId.split(':')[1];
      const eco = await getEconomyConfig(interaction.guild.id);
      const c = (eco.actions?.config || {})[key] || {};
      const karma = String((interaction.fields.getTextInputValue('karma')||'none').trim());
      const karmaDelta = Number((interaction.fields.getTextInputValue('karmaDelta')||'0').trim());
      const failMoneyMin = Number((interaction.fields.getTextInputValue('failMoneyMin')||'0').trim());
      const failMoneyMax = Number((interaction.fields.getTextInputValue('failMoneyMax')||'0').trim());
      const failKarmaDelta = Number((interaction.fields.getTextInputValue('failKarmaDelta')||'0').trim());
      if (!['charm','perversion','none'].includes(karma)) return interaction.editReply({ content: 'Type karma invalide.' });
      if (!eco.actions) eco.actions = {};
      if (!eco.actions.config) eco.actions.config = {};
      eco.actions.config[key] = { ...(c||{}), karma, karmaDelta, failMoneyMin, failMoneyMax, failKarmaDelta };
      await updateEconomyConfig(interaction.guild.id, eco);
      return interaction.editReply({ content: '✅ Karma mis à jour.' });
    }
    if (interaction.isChannelSelectMenu() && interaction.customId === 'suites_category') {
      const id = interaction.values?.[0];
      const eco = await getEconomyConfig(interaction.guild.id);
      const suites = { ...(eco.suites || {}), categoryId: id };
      await updateEconomyConfig(interaction.guild.id, { suites });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = [buildEconomyMenuSelect('suites'), ...(await buildSuitesRows(interaction.guild))];
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isButton() && interaction.customId === 'config_back_home') {
      const embed = await buildConfigEmbed(interaction.guild);
      const row = buildTopSectionRow();
      return interaction.update({ embeds: [embed], components: [row] });
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

    // Truth/Dare config handlers
    if (interaction.isStringSelectMenu() && interaction.customId === 'td_mode') {
      const mode = interaction.values[0];
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTruthDareRows(interaction.guild, mode);
      return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
    }
    if (interaction.isChannelSelectMenu() && interaction.customId.startsWith('td_channels_add:')) {
      const mode = interaction.customId.split(':')[1] || 'sfw';
      await addTdChannels(interaction.guild.id, interaction.values, mode);
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTruthDareRows(interaction.guild, mode);
      return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('td_channels_remove:')) {
      const mode = interaction.customId.split(':')[1] || 'sfw';
      if (interaction.values.includes('none')) return interaction.deferUpdate();
      await removeTdChannels(interaction.guild.id, interaction.values, mode);
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTruthDareRows(interaction.guild, mode);
      return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
    }
    if (interaction.isButton() && interaction.customId.startsWith('td_prompts_add_action:')) {
      const mode = interaction.customId.split(':')[1] || 'sfw';
      const modal = new ModalBuilder().setCustomId('td_prompts_add:action:' + mode).setTitle('Ajouter des ACTIONS');
      const input = new TextInputBuilder().setCustomId('texts').setLabel('Une par ligne').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2000);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      try { return await interaction.showModal(modal); } catch (_) { return; }
    }
    if (interaction.isButton() && interaction.customId.startsWith('td_prompts_add_verite:')) {
      const mode = interaction.customId.split(':')[1] || 'sfw';
      const modal = new ModalBuilder().setCustomId('td_prompts_add:verite:' + mode).setTitle('Ajouter des VÉRITÉS');
      const input = new TextInputBuilder().setCustomId('texts').setLabel('Une par ligne').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2000);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      try { return await interaction.showModal(modal); } catch (_) { return; }
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('td_prompts_add:')) {
      const parts = interaction.customId.split(':');
      const type = parts[1] || 'action';
      const mode = parts[2] || 'sfw';
      const textsRaw = (interaction.fields.getTextInputValue('texts')||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      if (textsRaw.length === 0) return interaction.reply({ content: 'Aucun texte fourni.', ephemeral: true });
      await addTdPrompts(interaction.guild.id, type, textsRaw, mode);
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTruthDareRows(interaction.guild, mode);
      return interaction.reply({ content: '✅ Ajouté.', ephemeral: true }).then(async ()=>{ try { await interaction.followUp({ embeds: [embed], components: [buildBackRow(), ...rows] }); } catch (_) {} });
    }
    if (interaction.isButton() && interaction.customId.startsWith('td_prompts_delete_all:')) {
      const mode = interaction.customId.split(':')[1] || 'sfw';
      const td = await getTruthDareConfig(interaction.guild.id);
      const ids = (td?.[mode]?.prompts || []).map(p => p.id);
      await deleteTdPrompts(interaction.guild.id, ids, mode);
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTruthDareRows(interaction.guild, mode);
      return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
    }
    if (interaction.isButton() && interaction.customId.startsWith('td_prompts_delete:')) {
      const mode = interaction.customId.split(':')[1] || 'sfw';
      const { rows, pageText } = await buildTdDeleteComponents(interaction.guild, mode, 0);
      try { return await interaction.reply({ content: 'Sélectionnez les prompts à supprimer • ' + pageText, components: rows, ephemeral: true }); } catch (_) { return; }
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('td_prompts_delete_select:')) {
      const parts = interaction.customId.split(':');
      const mode = parts[1] || 'sfw';
      if (interaction.values.includes('none')) return interaction.deferUpdate();
      await deleteTdPrompts(interaction.guild.id, interaction.values, mode);
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTruthDareRows(interaction.guild, mode);
      try { await interaction.update({ content: '✅ Supprimé.', components: [] }); } catch (_) {}
      try { await interaction.followUp({ embeds: [embed], components: [buildBackRow(), ...rows], ephemeral: true }); } catch (_) {}
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith('td_prompts_delete_page:')) {
      const parts = interaction.customId.split(':');
      const mode = parts[1] || 'sfw';
      const offset = Number(parts[2]) || 0;
      const { rows, pageText } = await buildTdDeleteComponents(interaction.guild, mode, offset);
      try { return await interaction.update({ content: 'Sélectionnez les prompts à supprimer • ' + pageText, components: rows }); } catch (_) { return; }
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

    // /ajout argent — Admin only
    if (interaction.isChatInputCommand() && interaction.commandName === 'ajout') {
      const sub = interaction.options.getSubcommand();
      if (sub === 'argent') {
        const hasAdmin = interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) || interaction.member?.permissions?.has(PermissionsBitField.Flags.Administrator);
        if (!hasAdmin) return interaction.reply({ content: '⛔ Réservé aux administrateurs.', ephemeral: true });
        const member = interaction.options.getUser('membre', true);
        const montant = Math.max(1, Math.abs(interaction.options.getInteger('montant', true)));
        try {
          await interaction.deferReply({ ephemeral: true });
        } catch (_) {}
        const eco = await getEconomyConfig(interaction.guild.id);
        const u = await getEconomyUser(interaction.guild.id, member.id);
        const before = u.amount || 0;
        u.amount = (u.amount || 0) + montant;
        await setEconomyUser(interaction.guild.id, member.id, u);
        const embed = buildEcoEmbed({
          title: 'Ajout d\'argent',
          description: `Membre: ${member}\nMontant ajouté: ${montant} ${eco.currency?.name || 'BAG$'}\nSolde: ${before} → ${u.amount}`,
        });
        return interaction.editReply({ embeds: [embed] });
      }
      return interaction.reply({ content: 'Sous-commande inconnue.', ephemeral: true });
    }

    // Legacy alias: /ajoutargent
    if (interaction.isChatInputCommand() && interaction.commandName === 'ajoutargent') {
      const hasAdmin = interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) || interaction.member?.permissions?.has(PermissionsBitField.Flags.Administrator);
      if (!hasAdmin) return interaction.reply({ content: '⛔ Réservé aux administrateurs.', ephemeral: true });
      const member = interaction.options.getUser('membre', true);
      const montant = Math.max(1, Math.abs(interaction.options.getInteger('montant', true)));
      try { await interaction.deferReply({ ephemeral: true }); } catch (_) {}
      const eco = await getEconomyConfig(interaction.guild.id);
      const u = await getEconomyUser(interaction.guild.id, member.id);
      const before = u.amount || 0;
      u.amount = (u.amount || 0) + montant;
      await setEconomyUser(interaction.guild.id, member.id, u);
      const embed = buildEcoEmbed({ title: 'Ajout d\'argent', description: `Membre: ${member}\nMontant ajouté: ${montant} ${eco.currency?.name || 'BAG$'}\nSolde: ${before} → ${u.amount}` });
      return interaction.editReply({ embeds: [embed] });
    }

    // /niveau (FR) and /level (EN alias): show user's current level card
    if (interaction.isChatInputCommand() && (interaction.commandName === 'niveau' || interaction.commandName === 'level')) {
      try { await interaction.deferReply(); } catch (_) {}
      try {
        const levels = await getLevelsConfig(interaction.guild.id);
        const userFr = interaction.options.getUser?.('membre');
        const userEn = interaction.options.getUser?.('member');
        const targetUser = userFr || userEn || interaction.user;
        const member = await fetchMember(interaction.guild, targetUser.id);
        const stats = await getUserStats(interaction.guild.id, targetUser.id);
        const required = Math.max(1, xpRequiredForNext(stats.level, levels.levelCurve));
        const progressRatio = Math.max(0, Math.min(1, (stats.xpSinceLevel || 0) / required));
        const progressText = `XP: ${(stats.xpSinceLevel || 0).toLocaleString('fr-FR')}/${required.toLocaleString('fr-FR')}`;
        const lastReward = getLastRewardForLevel(levels, stats.level);
        const roleName = lastReward ? (interaction.guild.roles.cache.get(lastReward.roleId)?.name || `Rôle ${lastReward.roleId}`) : null;
        const name = memberDisplayName(interaction.guild, member, targetUser.id);
        const isCert = memberHasCertifiedRole(member, levels);
        let img = null;
        if (isCert) {
          const bg = chooseCardBackgroundForMember(member, levels);
          const sub = [
            `${name.toUpperCase()} • NIVEAU ACTUEL : ${String(stats.level)}`,
            roleName ? `(Dernière récompense : ${roleName})` : ''
          ].filter(Boolean);
          img = await drawCertifiedCard({ backgroundUrl: bg, name, sublines: sub, logoUrl: CERTIFIED_LOGO_URL, useRoseGold: CERTIFIED_ROSEGOLD });
        } else {
          const bg = chooseCardBackgroundForMember(member, levels);
          const avatarUrl = member?.user?.displayAvatarURL?.({ extension: 'png', size: 256 }) || null;
          const lines = [
            `Niveau: ${stats.level}`,
            roleName ? `Dernière récompense: ${roleName} (niv ${lastReward.level})` : 'Dernière récompense: —',
          ];
          img = await drawCard(bg, `${name}`, lines, progressRatio, progressText, avatarUrl);
        }
        const mention = targetUser && targetUser.id !== interaction.user.id ? `<@${targetUser.id}>` : '';
        if (img) return interaction.editReply({ content: mention || undefined, files: [{ attachment: img, name: 'level.png' }] });
        return interaction.editReply({ content: `${mention || targetUser} • Niveau: ${stats.level} (${(stats.xpSinceLevel||0)}/${required})` });
      } catch (e) {
        try { return await interaction.editReply({ content: 'Une erreur est survenue lors du rendu de votre carte de niveau.' }); } catch (_) { return; }
      }
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
        const embed = new EmbedBuilder().setColor(THEME_COLOR_PRIMARY).setAuthor({ name: 'Réponse anonyme' }).setDescription(text).setFooter({ text: 'Boy and Girls (BAG)', iconURL: THEME_FOOTER_ICON }).setTimestamp(new Date());
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

    

    // Economy standalone commands (aliases)
    if (interaction.isChatInputCommand() && interaction.commandName === 'travailler') {
      return handleEconomyAction(interaction, 'work');
    }
    if (interaction.isChatInputCommand() && (interaction.commandName === 'pêcher' || interaction.commandName === 'pecher')) {
      return handleEconomyAction(interaction, 'fish');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'donner') {
      return handleEconomyAction(interaction, 'give');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'voler') {
      return handleEconomyAction(interaction, 'steal');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'embrasser') {
      return handleEconomyAction(interaction, 'kiss');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'flirter') {
      return handleEconomyAction(interaction, 'flirt');
    }
    if (interaction.isChatInputCommand() && (interaction.commandName === 'séduire' || interaction.commandName === 'seduire')) {
      return handleEconomyAction(interaction, 'seduce');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'fuck') {
      return handleEconomyAction(interaction, 'fuck');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'masser') {
      return handleEconomyAction(interaction, 'massage');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'danser') {
      return handleEconomyAction(interaction, 'dance');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'crime') {
      return handleEconomyAction(interaction, 'crime');
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'boutique') {
      const embed = new EmbedBuilder().setColor(THEME_COLOR_PRIMARY).setTitle('Boutique BAG').setDescription('Sélectionnez un article à acheter.').setThumbnail(THEME_IMAGE).setFooter({ text: 'Boy and Girls (BAG)', iconURL: THEME_FOOTER_ICON });
      const rows = await buildBoutiqueRows(interaction.guild);
      return interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'actionverite') {
      try {
        const td = await getTruthDareConfig(interaction.guild.id);
        const chId = interaction.channel.id;
        const isNSFW = Array.isArray(td?.nsfw?.channels) && td.nsfw.channels.includes(chId);
        const isSFW = Array.isArray(td?.sfw?.channels) && td.sfw.channels.includes(chId);
        if (!isNSFW && !isSFW) {
          return interaction.reply({ content: '⛔ Ce salon n\'est pas autorisé pour Action/Vérité. Configurez-le dans /config → Action/Vérité.', ephemeral: true });
        }
        const mode = isNSFW ? 'nsfw' : 'sfw';
        const list = (td[mode]?.prompts || []);
        const hasAction = list.some(p => (p?.type||'').toLowerCase() === 'action');
        const hasTruth = list.some(p => (p?.type||'').toLowerCase() === 'verite');
        if (!hasAction && !hasTruth) {
          return interaction.reply({ content: 'Aucun prompt configuré pour ce mode. Ajoutez-en dans /config → Action/Vérité.', ephemeral: true });
        }
        const embed = buildTruthDareStartEmbed(mode, hasAction, hasTruth);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('td_game:' + mode + ':action').setLabel('ACTION').setStyle(ButtonStyle.Primary).setDisabled(!hasAction),
          new ButtonBuilder().setCustomId('td_game:' + mode + ':verite').setLabel('VÉRITÉ').setStyle(ButtonStyle.Success).setDisabled(!hasTruth),
        );
        return interaction.reply({ embeds: [embed], components: [row] });
      } catch (_) {
        return interaction.reply({ content: 'Erreur Action/Vérité.', ephemeral: true });
      }
    }

    // Admin-only: /backup (export config)
    if (interaction.isChatInputCommand() && interaction.commandName === 'backup') {
      try {
        const ok = await isStaffMember(interaction.guild, interaction.member);
        if (!ok) return interaction.reply({ content: '⛔ Réservé au staff.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const { readConfig } = require('./storage/jsonStore');
        const cfg = await readConfig();
        const json = Buffer.from(JSON.stringify(cfg, null, 2), 'utf8');
        const file = { attachment: json, name: 'bag-backup.json' };
        try {
          const lc = await getLogsConfig(interaction.guild.id);
          const em = buildModEmbed(`${lc.emoji} Sauvegarde`, `Sauvegarde Discord — méthode: slash`, [ { name: 'Auteur', value: `${interaction.user}` } ]);
          await sendLog(interaction.guild, 'backup', em);
        } catch (_) {}
        return interaction.editReply({ content: '📦 Sauvegarde générée.', files: [file] });
      } catch (e) {
        try {
          const lc = await getLogsConfig(interaction.guild.id);
          const em = buildModEmbed(`${lc.emoji} Sauvegarde`, `Échec sauvegarde Discord — méthode: slash`, [ { name: 'Erreur', value: String(e?.message||e) } ]);
          await sendLog(interaction.guild, 'backup', em);
        } catch (_) {}
        return interaction.reply({ content: 'Erreur export.', ephemeral: true });
      }
    }

    // Admin-only: /restore (import config)
    if (interaction.isChatInputCommand() && interaction.commandName === 'restore') {
      try {
        const ok = await isStaffMember(interaction.guild, interaction.member);
        if (!ok) return interaction.reply({ content: '⛔ Réservé au staff.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const att = interaction.options.getAttachment('fichier');
        const raw = interaction.options.getString('json');
        let text = '';
        if (att && att.url) {
          try { const r = await fetch(att.url); text = await r.text(); } catch (_) {}
        }
        if (!text && raw && raw.trim()) text = raw.trim();
        if (!text) return interaction.editReply({ content: 'Fournissez un fichier ou un JSON.' });
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (_) { return interaction.editReply({ content: 'JSON invalide.' }); }
        if (!parsed || typeof parsed !== 'object' || !parsed.guilds) return interaction.editReply({ content: 'Format inattendu: champ "guilds" manquant.' });
        const { writeConfig } = require('./storage/jsonStore');
        await writeConfig(parsed);
        try {
          const lc = await getLogsConfig(interaction.guild.id);
          const method = att && att.url ? 'fichier' : 'texte';
          const em = buildModEmbed(`${lc.emoji} Restauration`, `Restauration config — méthode: ${method}`, [ { name: 'Auteur', value: `${interaction.user}` } ]);
          await sendLog(interaction.guild, 'backup', em);
        } catch (_) {}
        return interaction.editReply({ content: '✅ Restauration effectuée.' });
      } catch (e) {
        try {
          const lc = await getLogsConfig(interaction.guild.id);
          const em = buildModEmbed(`${lc.emoji} Restauration`, `Échec restauration config`, [ { name: 'Erreur', value: String(e?.message||e) } ]);
          await sendLog(interaction.guild, 'backup', em);
        } catch (_) {}
        return interaction.reply({ content: 'Erreur restauration.', ephemeral: true });
      }
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
          const embed = new EmbedBuilder().setColor(THEME_COLOR_PRIMARY).setTitle('➕ Ajouté à la file').setDescription(`[${firstTrack.title}](${firstTrack.uri})`).setFooter({ text: 'BAG • Musique', iconURL: THEME_FOOTER_ICON }).setTimestamp(new Date());
          await interaction.editReply({ embeds: [embed] });
        } else {
          const current = player.queue.current || firstTrack;
          const embed = new EmbedBuilder().setColor(THEME_COLOR_PRIMARY).setTitle('🎶 Lecture').setDescription(`[${current.title}](${current.uri})`).setFooter({ text: 'BAG • Musique', iconURL: THEME_FOOTER_ICON }).setTimestamp(new Date());
          await interaction.editReply({ embeds: [embed] });
          try {
            const ui = new EmbedBuilder().setColor(THEME_COLOR_ACCENT).setTitle('🎧 Lecteur').setDescription('Contrôles de lecture').setImage(THEME_IMAGE).setFooter({ text: 'BAG • Lecteur', iconURL: THEME_FOOTER_ICON }).setTimestamp(new Date());
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
        const embed = new EmbedBuilder().setColor(THEME_COLOR_PRIMARY).setTitle('File de lecture').setDescription(lines.join('\n')).setFooter({ text: 'BAG • Musique', iconURL: THEME_FOOTER_ICON }).setTimestamp(new Date());
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
        const embed = new EmbedBuilder().setColor(THEME_COLOR_ACCENT).setTitle('📻 Radio').setDescription(`Station: ${station}`).setFooter({ text: 'BAG • Musique', iconURL: THEME_FOOTER_ICON }).setTimestamp(new Date());
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

    // Truth/Dare game buttons
    if (interaction.isButton() && interaction.customId.startsWith('td_game:')) {
      try {
        await interaction.deferUpdate().catch(()=>{});
        const [, mode, type] = interaction.customId.split(':');
        const td = await getTruthDareConfig(interaction.guild.id);
        const list = (td?.[mode]?.prompts || []).filter(p => (p?.type||'').toLowerCase() === String(type||'').toLowerCase());
        if (!list.length) {
          try { await interaction.followUp({ content: 'Aucun prompt disponible.', ephemeral: true }); } catch (_) {}
          return;
        }
        const pick = list[Math.floor(Math.random() * list.length)];
        const embed = buildTruthDarePromptEmbed(mode, type, String(pick.text||'—'));
        try { await interaction.followUp({ embeds: [embed] }); } catch (_) {}
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
        .setFooter({ text: 'BAG • Confessions', iconURL: THEME_FOOTER_ICON });
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
`,
      });
      return interaction.reply({ embeds: [embed] });
    }
    /*
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
*/

  } catch (_) {}
});

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
              .setFooter({ text: 'BAG • Premium', iconURL: THEME_FOOTER_ICON })
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
        const onlyDigitsAndOps = raw.replace(/[^0-9+\-*\/().\s^√]/g, '');
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
          const ok = /^[0-9+\-*\/().\s]*$/.test(testable);
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
          await message.reply({ embeds: [new EmbedBuilder().setColor(0xec407a).setTitle('❌ Oups… valeur invalide').setDescription('Attendu: **' + expected0 + '**\nRemise à zéro → **1**\n<@' + message.author.id + '>, on repart en douceur.').setFooter({ text: 'BAG • Comptage', iconURL: THEME_FOOTER_ICON }).setThumbnail(THEME_IMAGE)] }).catch(()=>{});
        } else {
          const next = Math.trunc(value);
          const state = cfg.state || { current: 0, lastUserId: '' };
          const expected = (state.current || 0) + 1;
          if ((state.lastUserId||'') === message.author.id) {
            await setCountingState(message.guild.id, { current: 0, lastUserId: '' });
            await message.reply({ embeds: [new EmbedBuilder().setColor(0xec407a).setTitle('❌ Doucement, un à la fois…').setDescription('Deux chiffres d\'affilée 😉\nAttendu: **' + expected + '**\nRemise à zéro → **1**\n<@' + message.author.id + '>, à toi de rejouer.').setFooter({ text: 'BAG • Comptage', iconURL: THEME_FOOTER_ICON }).setThumbnail(THEME_IMAGE)] }).catch(()=>{});
          } else if (next !== expected) {
            await setCountingState(message.guild.id, { current: 0, lastUserId: '' });
            await message.reply({ embeds: [new EmbedBuilder().setColor(0xec407a).setTitle('❌ Mauvais numéro').setDescription('Attendu: **' + expected + '**\nRemise à zéro → **1**\n<@' + message.author.id + '>, on se retrouve au début 💕').setFooter({ text: 'BAG • Comptage', iconURL: THEME_FOOTER_ICON }).setThumbnail(THEME_IMAGE)] }).catch(()=>{});
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
    options.push({ label: 'Objet: ' + (it.name || it.id) + ' — ' + (it.price||0), value: 'item:' + it.id });
  }
  for (const r of (eco.shop?.roles || [])) {
    const roleName = guild.roles.cache.get(r.roleId)?.name || r.name || r.roleId;
    const dur = r.durationDays ? (r.durationDays + 'j') : 'permanent';
    options.push({ label: 'Rôle: ' + roleName + ' — ' + (r.price||0) + ' (' + dur + ')', value: 'role:' + r.roleId + ':' + (r.durationDays||0) });
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
  const channelAdd = new ChannelSelectMenuBuilder().setCustomId('td_channels_add:' + mode).setPlaceholder('Ajouter des salons…').setMinValues(1).setMaxValues(3).addChannelTypes(ChannelType.GuildText);
  const channelRemove = new StringSelectMenuBuilder().setCustomId('td_channels_remove:' + mode).setPlaceholder('Retirer des salons…').setMinValues(1).setMaxValues(Math.max(1, Math.min(25, (td[mode].channels||[]).length || 1)));
  const opts = (td[mode].channels||[]).map(id => ({ label: guild.channels.cache.get(id)?.name || id, value: id }));
  if (opts.length) channelRemove.addOptions(...opts); else channelRemove.addOptions({ label: 'Aucun', value: 'none' }).setDisabled(true);
  const addActionBtn = new ButtonBuilder().setCustomId('td_prompts_add_action:' + mode).setLabel('Ajouter ACTION').setStyle(ButtonStyle.Primary);
  const addTruthBtn = new ButtonBuilder().setCustomId('td_prompts_add_verite:' + mode).setLabel('Ajouter VERITE').setStyle(ButtonStyle.Success);
  const promptsDelBtn = new ButtonBuilder().setCustomId('td_prompts_delete:' + mode).setLabel('Supprimer prompt').setStyle(ButtonStyle.Danger);
  const promptsDelAllBtn = new ButtonBuilder().setCustomId('td_prompts_delete_all:' + mode).setLabel('Tout supprimer').setStyle(ButtonStyle.Danger);
  return [
    new ActionRowBuilder().addComponents(modeSelect),
    new ActionRowBuilder().addComponents(channelAdd),
    new ActionRowBuilder().addComponents(channelRemove),
    new ActionRowBuilder().addComponents(addActionBtn, addTruthBtn, promptsDelBtn, promptsDelAllBtn),
  ];
}

function clampOffset(total, offset, limit) {
  if (total <= 0) return 0;
  const lastPageStart = Math.floor((total - 1) / limit) * limit;
  if (!Number.isFinite(offset) || offset < 0) return 0;
  if (offset > lastPageStart) return lastPageStart;
  return Math.floor(offset / limit) * limit;
}

async function buildTdDeleteComponents(guild, mode = 'sfw', offset = 0) {
  const td = await getTruthDareConfig(guild.id);
  const list = (td?.[mode]?.prompts || []).slice();
  const limit = 25;
  const total = list.length;
  const off = clampOffset(total, Number(offset) || 0, limit);
  const view = list.slice(off, off + limit);
  const from = total === 0 ? 0 : off + 1;
  const to = Math.min(total, off + view.length);
  const pageText = `Prompts ${from}-${to} sur ${total}`;

  const select = new StringSelectMenuBuilder()
    .setCustomId('td_prompts_delete_select:' + mode + ':' + off)
    .setPlaceholder(total ? ('Choisir des prompts à supprimer • ' + pageText) : 'Aucun prompt')
    .setMinValues(1)
    .setMaxValues(Math.max(1, view.length || 1));
  if (view.length) select.addOptions(...view.map(p => ({ label: `#${p.id} ${String(p.text||'').slice(0,80)}`, value: String(p.id) })));
  else select.addOptions({ label: 'Aucun', value: 'none' }).setDisabled(true);

  const hasPrev = off > 0;
  const hasNext = off + limit < total;
  const prevBtn = new ButtonBuilder().setCustomId(`td_prompts_delete_page:${mode}:${Math.max(0, off - limit)}`).setLabel('⟨ Précédent').setStyle(ButtonStyle.Secondary).setDisabled(!hasPrev);
  const nextBtn = new ButtonBuilder().setCustomId(`td_prompts_delete_page:${mode}:${off + limit}`).setLabel('Suivant ⟩').setStyle(ButtonStyle.Primary).setDisabled(!hasNext);

  return {
    rows: [
      new ActionRowBuilder().addComponents(select),
      new ActionRowBuilder().addComponents(prevBtn, nextBtn),
    ],
    pageText,
    offset: off,
    limit,
    total,
  };
}

async function buildBoutiqueRows(guild) {
  const eco = await getEconomyConfig(guild.id);
  const options = [];
  // Items
  for (const it of (eco.shop?.items || [])) {
    const label = 'Objet: ' + (it.name || it.id) + ' — ' + (it.price||0);
    options.push({ label, value: 'item:' + it.id });
  }
  // Roles
  for (const r of (eco.shop?.roles || [])) {
    const roleName = guild.roles.cache.get(r.roleId)?.name || r.name || r.roleId;
    const dur = r.durationDays ? (r.durationDays + 'j') : 'permanent';
    const label = 'Rôle: ' + roleName + ' — ' + (r.price||0) + ' (' + dur + ')';
    options.push({ label, value: 'role:' + r.roleId + ':' + (r.durationDays||0) });
  }
  // Suites (private rooms)
  if (eco.suites) {
    const prices = eco.suites.prices || { day:0, week:0, month:0 };
    const labels = [
      { key:'day', name:'Suite privée (1j)' },
      { key:'week', name:'Suite privée (7j)' },
      { key:'month', name:'Suite privée (30j)' },
    ];
    for (const l of labels) {
      const price = Number(prices[l.key]||0);
      const label = (eco.suites.emoji || '💞') + ' ' + l.name + ' — ' + price;
      options.push({ label, value: 'suite:' + l.key });
    }
  }
  const select = new StringSelectMenuBuilder().setCustomId('boutique_select').setPlaceholder('Choisir un article…').setMinValues(1).setMaxValues(1);
  if (options.length) select.addOptions(...options);
  else select.addOptions({ label: 'Aucun article disponible', value: 'none' }).setDisabled(true);
  const row = new ActionRowBuilder().addComponents(select);
  return [row];
}

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const ak = await getAutoKickConfig(member.guild.id);
    if (!ak?.enabled) return;
    await addPendingJoiner(member.guild.id, member.id, Date.now());
  } catch (_) {}
});