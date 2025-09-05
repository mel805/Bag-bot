require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, RoleSelectMenuBuilder, UserSelectMenuBuilder, StringSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionsBitField, Events, AttachmentBuilder } = require('discord.js');
let ErelaManager;
try { ({ Manager: ErelaManager } = require('erela.js')); } catch (_) { ErelaManager = null; }
const { setGuildStaffRoleIds, getGuildStaffRoleIds, ensureStorageExists, getAutoKickConfig, updateAutoKickConfig, addPendingJoiner, removePendingJoiner, getLevelsConfig, updateLevelsConfig, getUserStats, setUserStats, getEconomyConfig, updateEconomyConfig, getEconomyUser, setEconomyUser, getTruthDareConfig, updateTruthDareConfig, addTdChannels, removeTdChannels, addTdPrompts, deleteTdPrompts, editTdPrompt, getConfessConfig, updateConfessConfig, addConfessChannels, removeConfessChannels, incrementConfessCounter, getGeoConfig, setUserLocation, getUserLocation, getAllLocations, getAutoThreadConfig, updateAutoThreadConfig, getCountingConfig, updateCountingConfig, setCountingState, getDisboardConfig, updateDisboardConfig, getLogsConfig, updateLogsConfig } = require('./storage/jsonStore');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
let ytDlp;
try { ytDlp = require('yt-dlp-exec'); } catch (_) { ytDlp = null; }

const fs2 = require('fs');
const path2 = require('path');
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
// GIF URL helpers: normalize and resolve direct media links for better embed rendering
function isLikelyDirectImageUrl(url) {
  try {
    const u = new URL(url);
    const host = String(u.hostname || '').toLowerCase();
    const pathname = String(u.pathname || '');
    if (/\.(gif|png|jpg|jpeg|webp)(?:\?|#|$)/i.test(pathname)) return true;
    if (host.includes('media.giphy.com') || host.includes('i.giphy.com')) return true;
    if (/^media\d*\.tenor\.com$/i.test(host)) return true;
    return false;
  } catch (_) { return false; }
}
function normalizeGifUrlBasic(url) {
  try {
    const u = new URL(url);
    const host = String(u.hostname || '').toLowerCase();
    const path = String(u.pathname || '');
    // Convert giphy page URLs to direct media URLs
    if (host.includes('giphy.com') && (/\/gifs?\//i.test(path))) {
      const parts = path.split('/');
      const last = parts[parts.length - 1] || '';
      const id = (last.includes('-') ? last.split('-').pop() : last).replace(/[^A-Za-z0-9]/g, '');
      if (id) return `https://media.giphy.com/media/${id}/giphy.gif`;
    }
    return url;
  } catch (_) { return url; }
}
async function resolveGifUrl(url, opts) {
  const options = opts || {};
  const timeoutMs = Number(options.timeoutMs || 2500);
  const normalized = normalizeGifUrlBasic(url);
  if (isLikelyDirectImageUrl(normalized)) return normalized;
  try {
    const u = new URL(normalized);
    const host = String(u.hostname || '').toLowerCase();
    // Try to resolve Tenor page URLs to a direct media
    if (host.includes('tenor.com') && !/^media\d*\.tenor\.com$/i.test(host)) {
      const ctrl = new AbortController();
      const t = setTimeout(() => { try { ctrl.abort(); } catch (_) {} }, timeoutMs);
      let html = '';
      try {
        const r = await fetch(normalized, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (r && r.ok) html = await r.text();
      } catch (_) {}
      clearTimeout(t);
      if (html) {
        // Prefer og:image
        const mImg = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        if (mImg && mImg[1] && isLikelyDirectImageUrl(mImg[1])) return mImg[1];
        const mVid = html.match(/<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/i);
        if (mVid && mVid[1]) {
          const cand = mVid[1];
          if (isLikelyDirectImageUrl(cand)) return cand;
        }
      }
    }
    // Generic: try to resolve any page URL by scraping OpenGraph og:image as a last resort
    if (!isLikelyDirectImageUrl(normalized)) {
      const ctrl = new AbortController();
      const t = setTimeout(() => { try { ctrl.abort(); } catch (_) {} }, Math.max(1000, Math.min(timeoutMs, 3000)));
      let html = '';
      try {
        const r = await fetch(normalized, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (r && r.ok) html = await r.text();
      } catch (_) {}
      clearTimeout(t);
      if (html) {
        const mImg = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        if (mImg && mImg[1]) {
          const cand = mImg[1];
          if (isLikelyDirectImageUrl(cand)) return cand;
        }
      }
    }
  } catch (_) {}
  return normalized;
}
// Try to detect if a URL points to an image by checking Content-Type via HEAD
async function urlContentTypeIsImage(url, timeoutMs = 2000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => { try { ctrl.abort(); } catch (_) {} }, timeoutMs);
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    clearTimeout(t);
    const ct = String(r.headers.get('content-type') || '');
    return /^image\//i.test(ct);
  } catch (_) { return false; }
}
// Attempt to download image bytes and return an Attachment for Discord embeds
async function tryCreateImageAttachmentFromUrl(url, opts) {
  const options = opts || {};
  const timeoutMs = Number(options.timeoutMs || 3000);
  const maxBytes = Number(options.maxBytes || 7500000); // ~7.5MB safe default
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => { try { ctrl.abort(); } catch (_) {} }, timeoutMs);
    const head = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' } }).catch(()=>null);
    clearTimeout(t);
    const contentType = String(head?.headers?.get?.('content-type') || '');
    const isImage = /^image\//i.test(contentType);
    if (!isImage) return null;
    const lenHeader = head?.headers?.get?.('content-length');
    if (lenHeader && Number(lenHeader) > maxBytes) return null;
    const ctrl2 = new AbortController();
    const t2 = setTimeout(() => { try { ctrl2.abort(); } catch (_) {} }, timeoutMs);
    const r = await fetch(url, { method: 'GET', redirect: 'follow', signal: ctrl2.signal, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' } });
    clearTimeout(t2);
    if (!r.ok) return null;
    const ct = String(r.headers.get('content-type') || contentType || '');
    if (!/^image\//i.test(ct)) return null;
    const ab = await r.arrayBuffer();
    const size = ab.byteLength || 0;
    if (size <= 0 || size > maxBytes) return null;
    const ext = (() => {
      if (/gif/i.test(ct)) return 'gif';
      if (/png/i.test(ct)) return 'png';
      if (/jpe?g/i.test(ct)) return 'jpg';
      if (/webp/i.test(ct)) return 'webp';
      return 'img';
    })();
    const fileName = `action-media.${ext}`;
    const buffer = Buffer.from(ab);
    return { attachment: new AttachmentBuilder(buffer, { name: fileName }), filename: fileName };
  } catch (_) {
    return null;
  }
}
// Geocoding via LocationIQ and distance computations for /map, /proche, /localisation
async function geocodeCityToCoordinates(cityQuery) {
  const token = process.env.LOCATIONIQ_TOKEN || '';
  if (!token) return null;
  try {
    const q = encodeURIComponent(String(cityQuery||'').trim());
    if (!q) return null;
    const endpoint = `https://eu1.locationiq.com/v1/search?key=${token}&q=${q}&format=json&limit=1&normalizecity=1&accept-language=fr`;
    const r = await fetch(endpoint);
    if (!r.ok) return null;
    const arr = await r.json();
    if (!Array.isArray(arr) || !arr.length) return null;
    const it = arr[0] || {};
    const lat = Number(it.lat || it.latitude || 0);
    const lon = Number(it.lon || it.longitude || 0);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    const display = String(it.display_name || it.address?.city || it.address?.town || it.address?.village || cityQuery).trim();
    return { lat, lon, displayName: display };
  } catch (_) {
    return null;
  }
}
function toRad(deg) {
  return (deg * Math.PI) / 180;
}
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c);
}
function zoomForRadiusKm(radiusKm) {
  if (radiusKm <= 20) return 11;
  if (radiusKm <= 50) return 10;
  if (radiusKm <= 100) return 9;
  if (radiusKm <= 200) return 8;
  if (radiusKm <= 400) return 7;
  if (radiusKm <= 800) return 6;
  return 5;
}
async function fetchStaticMapBuffer(centerLat, centerLon, zoom, markerList, width = 800, height = 500) {
  const token = process.env.LOCATIONIQ_TOKEN || '';
  const liqUrl = (() => {
    if (!token) return null;
    let u = `https://maps.locationiq.com/v3/staticmap?key=${encodeURIComponent(token)}&center=${encodeURIComponent(String(centerLat))},${encodeURIComponent(String(centerLon))}&zoom=${encodeURIComponent(String(zoom))}&size=${encodeURIComponent(String(width))}x${encodeURIComponent(String(height))}&format=png`;
    const safe = Array.isArray(markerList) ? markerList.filter(m => isFinite(Number(m.lat)) && isFinite(Number(m.lon))) : [];
    if (safe.length) {
      const parts = safe.map(m => `icon:${encodeURIComponent(m.icon || 'small-red-cutout')}|${encodeURIComponent(String(Number(m.lat)))},${encodeURIComponent(String(Number(m.lon)))}`);
      u += `&markers=${parts.join('|')}`;
    }
    return u;
  })();
  const osmUrl = (() => {
    // Fallback provider (no token required)
    let u = `https://staticmap.openstreetmap.de/staticmap.php?center=${encodeURIComponent(String(centerLat))},${encodeURIComponent(String(centerLon))}&zoom=${encodeURIComponent(String(zoom))}&size=${encodeURIComponent(String(width))}x${encodeURIComponent(String(height))}`;
    const safe = Array.isArray(markerList) ? markerList.filter(m => isFinite(Number(m.lat)) && isFinite(Number(m.lon))) : [];
    if (safe.length) {
      const parts = safe.map(m => `${encodeURIComponent(String(Number(m.lat)))},${encodeURIComponent(String(Number(m.lon)))},${encodeURIComponent((m.icon && String(m.icon).includes('blue')) ? 'blue-pushpin' : 'red-pushpin')}`);
      u += `&markers=${parts.join('|')}`;
    }
    return u;
  })();
  const tryFetch = async (url) => {
    if (!url) return null;
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      const ab = await r.arrayBuffer();
      return Buffer.from(ab);
    } catch (_) { return null; }
  };
  // Try LocationIQ first, then OSM
  const buf1 = await tryFetch(liqUrl);
  if (buf1) return buf1;
  return await tryFetch(osmUrl);
}
function buildStaticMapUrl(centerLat, centerLon, zoom, markerList, width = 800, height = 500) {
  const token = process.env.LOCATIONIQ_TOKEN || '';
  if (token) {
    let u = `https://maps.locationiq.com/v3/staticmap?key=${encodeURIComponent(token)}&center=${encodeURIComponent(String(centerLat))},${encodeURIComponent(String(centerLon))}&zoom=${encodeURIComponent(String(zoom))}&size=${encodeURIComponent(String(width))}x${encodeURIComponent(String(height))}&format=png`;
    const safe = Array.isArray(markerList) ? markerList.filter(m => isFinite(Number(m.lat)) && isFinite(Number(m.lon))) : [];
    if (safe.length) {
      const parts = safe.map(m => `icon:${encodeURIComponent(m.icon || 'small-red-cutout')}|${encodeURIComponent(String(Number(m.lat)))},${encodeURIComponent(String(Number(m.lon)))}`);
      u += `&markers=${parts.join('|')}`;
    }
    return u;
  }
  // Fallback OSM URL if no token
  let u = `https://staticmap.openstreetmap.de/staticmap.php?center=${encodeURIComponent(String(centerLat))},${encodeURIComponent(String(centerLon))}&zoom=${encodeURIComponent(String(zoom))}&size=${encodeURIComponent(String(width))}x${encodeURIComponent(String(height))}`;
  const safe = Array.isArray(markerList) ? markerList.filter(m => isFinite(Number(m.lat)) && isFinite(Number(m.lon))) : [];
  if (safe.length) {
    const parts = safe.map(m => `${encodeURIComponent(String(Number(m.lat)))},${encodeURIComponent(String(Number(m.lon)))},${encodeURIComponent((m.icon && String(m.icon).includes('blue')) ? 'blue-pushpin' : 'red-pushpin')}`);
    u += `&markers=${parts.join('|')}`;
  }
  return u;
}
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;

// Interaction monitoring for debugging stuck interactions
const pendingInteractions = new Map();

function trackInteraction(interaction, actionType = 'unknown') {
  const key = `${interaction.id}-${interaction.user.id}`;
  pendingInteractions.set(key, {
    id: interaction.id,
    userId: interaction.user.id,
    actionType,
    timestamp: Date.now(),
    deferred: interaction.deferred,
    replied: interaction.replied
  });
  
  // Auto-cleanup after 30 seconds
  setTimeout(() => {
    if (pendingInteractions.has(key)) {
      console.warn(`[Monitor] Interaction ${actionType} from ${interaction.user.tag || interaction.user.id} timed out after 30s`);
      pendingInteractions.delete(key);
    }
  }, 30000);
}

function untrackInteraction(interaction) {
  const key = `${interaction.id}-${interaction.user.id}`;
  pendingInteractions.delete(key);
}
// Fonction pour trouver le fichier logo (avec ou sans majuscule)
function findLogoPath() {
  const fs = require('fs');
  const possiblePaths = ['./Bag.png', './bag.png', './BAG.png'];
  for (const path of possiblePaths) {
    if (fs.existsSync(path)) {
      console.log('[Logo] Fichier logo trouvé:', path);
      return path;
    }
  }
  console.log('[Logo] Aucun fichier logo trouvé, utilisation du fallback');
  return null;
}

const LOGO_PATH = findLogoPath();
const CERTIFIED_LOGO_URL = process.env.CERTIFIED_LOGO_URL || LOGO_PATH;
const CERTIFIED_ROSEGOLD = String(process.env.CERTIFIED_ROSEGOLD || 'false').toLowerCase() === 'true';
const LEVEL_CARD_LOGO_URL = process.env.LEVEL_CARD_LOGO_URL || LOGO_PATH;

// Ticket banner helper (bag2)
function findTicketBannerPath() {
  try {
    const fs = require('fs');
    const possible = ['./bag2.png', './Bag2.png', './BAG2.png'];
    for (const p of possible) {
      if (fs.existsSync(p)) {
        try { console.log('[Tickets] Bannière trouvée:', p); } catch (_) {}
        return p;
      }
    }
  } catch (_) {}
  try { console.warn('[Tickets] Aucune bannière bag2.png trouvée'); } catch (_) {}
  return null;
}
const TICKET_BANNER_PATH = findTicketBannerPath();
function maybeAttachTicketBanner(embed) {
  if (!TICKET_BANNER_PATH) return null;
  try {
    const fs = require('fs');
    const buffer = fs.readFileSync(TICKET_BANNER_PATH);
    if (embed && typeof embed.setImage === 'function') {
      embed.setImage('attachment://ticket-banner.png');
    }
    return new AttachmentBuilder(buffer, { name: 'ticket-banner.png' });
  } catch (_) {
    return null;
  }
}

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

// Fonction pour envoyer des logs détaillés de sauvegarde
async function sendDetailedBackupLog(guild, info, method, user) {
  try {
    const lc = await getLogsConfig(guild.id);
    if (!lc?.categories?.backup) return;

    const timestamp = new Date(info.details?.timestamp || new Date()).toLocaleString('fr-FR');
    
    // Déterminer le statut global
    const localSuccess = info.local?.success;
    const githubSuccess = info.github?.success;
    const githubConfigured = info.github?.configured;
    
    let globalStatus = '❌ Échec';
    let statusColor = 0xff4444; // Rouge
    
    if (localSuccess && githubSuccess) {
      globalStatus = '✅ Succès complet';
      statusColor = 0x44ff44; // Vert
    } else if (localSuccess && !githubConfigured) {
      globalStatus = '⚠️ Succès partiel';
      statusColor = 0xffaa44; // Orange
    } else if (localSuccess) {
      globalStatus = '⚠️ Local OK, GitHub KO';
      statusColor = 0xffaa44; // Orange
    }

    // Construire l'embed principal
    const embed = {
      title: `${lc.emoji} Sauvegarde ${globalStatus}`,
      description: `**Méthode:** ${method}${user ? `\n**Auteur:** ${user}` : ''}`,
      color: statusColor,
      timestamp: new Date().toISOString(),
      fields: []
    };

    // Informations générales
    if (info.details) {
      embed.fields.push({
        name: '📊 Données sauvegardées',
        value: [
          `📁 Serveurs: ${info.details.guildsCount || 0}`,
          `👥 Utilisateurs: ${info.details.usersCount || 0}`,
          `💾 Taille: ${Math.round((info.details.dataSize || 0) / 1024)} KB`,
          `⏰ ${timestamp}`
        ].join('\n'),
        inline: false
      });
    }

    // Statut sauvegarde locale
    const localIcon = localSuccess ? '✅' : '❌';
    const localType = info.storage === 'postgres' ? 'PostgreSQL' : info.storage === 'http' ? 'HTTP Export' : 'Fichier';
    let localValue = `${localIcon} ${localType}`;
    
    if (localSuccess) {
      if (info.historyId) localValue += `\n📝 ID: ${info.historyId}`;
      if (info.backupFile) localValue += `\n📄 Fichier créé`;
    } else if (info.local?.error) {
      localValue += `\n💥 ${info.local.error}`;
    }

    embed.fields.push({
      name: '🏠 Sauvegarde Locale',
      value: localValue,
      inline: true
    });

    // Statut sauvegarde GitHub
    const githubIcon = githubSuccess ? '✅' : (githubConfigured ? '❌' : '⚙️');
    let githubValue = `${githubIcon} GitHub`;
    
    if (!githubConfigured) {
      githubValue += '\n⚙️ Non configuré';
    } else if (githubSuccess) {
      githubValue += `\n🔗 ${info.github.commit_sha.substring(0, 7)}`;
      if (info.github.commit_url) githubValue += `\n[Voir commit](${info.github.commit_url})`;
    } else if (info.github?.error) {
      githubValue += `\n💥 ${info.github.error.substring(0, 100)}`;
    }

    embed.fields.push({
      name: '🐙 Sauvegarde GitHub',
      value: githubValue,
      inline: true
    });

    // Recommandations si problèmes
    if (!githubConfigured) {
      embed.fields.push({
        name: '💡 Configuration GitHub',
        value: 'Variables requises:\n`GITHUB_TOKEN`\n`GITHUB_REPO`\n\nUtilisez `/github-backup test` pour vérifier.',
        inline: false
      });
    } else if (!githubSuccess && githubConfigured) {
      embed.fields.push({
        name: '🔧 Dépannage',
        value: 'Vérifiez:\n• Token GitHub valide\n• Permissions du dépôt\n• Connexion réseau\n\nUtilisez `/github-backup test`',
        inline: false
      });
    }

    await sendLog(guild, 'backup', embed);
  } catch (error) {
    console.error('[BackupLog] Erreur envoi log:', error.message);
  }
}

// Fonction pour envoyer des logs détaillés de restauration
async function sendDetailedRestoreLog(guild, result, method, user) {
  try {
    const lc = await getLogsConfig(guild.id);
    if (!lc?.categories?.backup) return;

    const sourceLabels = {
      'github': { icon: '🐙', name: 'GitHub', color: 0x6cc644 },
      'postgres_history': { icon: '🐘', name: 'PostgreSQL (Historique)', color: 0x336791 },
      'postgres_current': { icon: '🐘', name: 'PostgreSQL (Actuel)', color: 0x336791 },
      'file_backup': { icon: '📁', name: 'Fichier (Backup)', color: 0xffa500 },
      'file_current': { icon: '📁', name: 'Fichier (Actuel)', color: 0xffa500 },
      'default': { icon: '🔧', name: 'Configuration par défaut', color: 0x999999 }
    };

    const sourceInfo = sourceLabels[result?.source] || { icon: '❓', name: 'Source inconnue', color: 0xff4444 };
    const success = result?.ok;

    const embed = {
      title: `${lc.emoji} Restauration ${success ? '✅ Réussie' : '❌ Échouée'}`,
      description: `**Méthode:** ${method}${user ? `\n**Auteur:** ${user}` : ''}`,
      color: success ? sourceInfo.color : 0xff4444,
      timestamp: new Date().toISOString(),
      fields: [
        {
          name: '📥 Source de restauration',
          value: `${sourceInfo.icon} ${sourceInfo.name}`,
          inline: true
        },
        {
          name: '📊 Statut',
          value: success ? '✅ Données restaurées' : '❌ Échec de restauration',
          inline: true
        }
      ]
    };

    // Ajouter des détails selon la source
    if (success) {
      switch (result.source) {
        case 'github':
          embed.fields.push({
            name: '🐙 Détails GitHub',
            value: '✅ Restauration depuis la sauvegarde GitHub\n🔄 Synchronisation locale effectuée',
            inline: false
          });
          break;
        case 'postgres_history':
        case 'postgres_current':
          embed.fields.push({
            name: '🐘 Détails PostgreSQL',
            value: '✅ Restauration depuis la base de données\n🔄 Synchronisation fichier effectuée',
            inline: false
          });
          break;
        case 'file_backup':
        case 'file_current':
          embed.fields.push({
            name: '📁 Détails Fichier',
            value: '✅ Restauration depuis fichier local\n⚠️ Considérez configurer GitHub pour plus de sécurité',
            inline: false
          });
          break;
        case 'default':
          embed.fields.push({
            name: '🔧 Configuration par défaut',
            value: '⚠️ Aucune sauvegarde trouvée\n🆕 Configuration vierge appliquée',
            inline: false
          });
          break;
      }
    }

    // Recommandations selon la source utilisée
    if (success && result.source !== 'github') {
      embed.fields.push({
        name: '💡 Recommandation',
        value: 'Pour une sécurité maximale, configurez GitHub:\n• `GITHUB_TOKEN`\n• `GITHUB_REPO`\n\nUtilisez `/github-backup test`',
        inline: false
      });
    }

    await sendLog(guild, 'backup', embed);
  } catch (error) {
    console.error('[RestoreLog] Erreur envoi log:', error.message);
  }
}

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
              if (g) {
                // Simuler les infos de backup pour HTTP (pas de données détaillées disponibles ici)
                const httpInfo = { 
                  storage: 'http', 
                  local: { success: true }, 
                  github: { success: false, configured: false, error: 'Non disponible via HTTP' },
                  details: { timestamp: new Date().toISOString() }
                };
                await sendDetailedBackupLog(g, httpInfo, 'http', null);
              }
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
// Local Lavalink + WS proxy (optional)
let localLavalinkStarted = false;
let localLavalinkProxyStarted = false;
let localLavalinkV3Started = false;
function shouldEnableLocalLavalink() {
  return String(process.env.ENABLE_LOCAL_LAVALINK || 'false').toLowerCase() === 'true';
}
function shouldEnableLocalLavalinkV3() {
  return String(process.env.ENABLE_LOCAL_LAVALINK_V3 || 'false').toLowerCase() === 'true';
}
function startLocalLavalink() {
  if (localLavalinkStarted) return;
  try {
    const { spawn } = require('node:child_process');
    const cwd = '/workspace/lavalink';
    const child = spawn('java', ['-jar', 'Lavalink.jar'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => { try { const t = d.toString('utf8'); if (/Lavalink is ready to accept connections\./.test(t)) console.log('[LocalLL]', t.trim()); } catch (_) {} });
    child.stderr.on('data', (d) => { try { console.warn('[LocalLL-err]', d.toString('utf8').trim()); } catch (_) {} });
    child.on('error', (e) => { try { console.error('[LocalLL] failed to start:', e?.message || e); } catch (_) {} });
    localLavalinkStarted = true;
    console.log('[LocalLL] Starting Lavalink.jar on 127.0.0.1:2333');
  } catch (e) {
    try { console.error('[LocalLL] spawn error:', e?.message || e); } catch (_) {}
  }
}
function startLocalLavalinkV3() {
  if (localLavalinkV3Started) return;
  try {
    const { spawn } = require('node:child_process');
    const cwd = '/workspace/lavalink-v3';
    const child = spawn('java', ['-jar', 'Lavalink.jar'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => { try { const t = d.toString('utf8'); if (/Lavalink is ready to accept connections\./.test(t)) console.log('[LocalLL-v3]', t.trim()); } catch (_) {} });
    child.stderr.on('data', (d) => { try { console.warn('[LocalLL-v3-err]', d.toString('utf8').trim()); } catch (_) {} });
    child.on('error', (e) => { try { console.error('[LocalLL-v3] failed to start:', e?.message || e); } catch (_) {} });
    localLavalinkV3Started = true;
    console.log('[LocalLL-v3] Starting Lavalink.jar on 127.0.0.1:2340');
  } catch (e) {
    try { console.error('[LocalLL-v3] spawn error:', e?.message || e); } catch (_) {}
  }
}
function startLocalLavalinkProxy() {
  if (localLavalinkProxyStarted) return;
  try {
    const { spawn } = require('node:child_process');
    const env = { ...process.env, LAVALINK_HOST: '127.0.0.1', LAVALINK_PORT: '2333', LAVALINK_PROXY_HOST: '127.0.0.1', LAVALINK_PROXY_PORT: '2334', LAVALINK_SECURE: String(process.env.LAVALINK_SECURE || 'false') };
    const child = spawn(process.execPath, ['/workspace/lavalink/ws-proxy.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (d) => { try { console.log(d.toString('utf8').trim()); } catch (_) {} });
    child.stderr.on('data', (d) => { try { console.warn('[LL-Proxy-err]', d.toString('utf8').trim()); } catch (_) {} });
    child.on('error', (e) => { try { console.error('[LL-Proxy] failed to start:', e?.message || e); } catch (_) {} });
    localLavalinkProxyStarted = true;
  } catch (e) {
    try { console.error('[LL-Proxy] spawn error:', e?.message || e); } catch (_) {}
  }
}
function startLocalLavalinkStack() {
  startLocalLavalink();
  startLocalLavalinkProxy();
}

const THEME_COLOR_PRIMARY = 0x1e88e5; // blue
const THEME_COLOR_ACCENT = 0xec407a; // pink
const THEME_COLOR_NSFW = 0xd32f2f; // deep red for NSFW
const THEME_IMAGE = 'https://cdn.discordapp.com/attachments/1408458115283812484/1408497858256179400/file_00000000d78861f4993dddd515f84845.png?ex=68b08cda&is=68af3b5a&hm=2e68cb9d7dfc7a60465aa74447b310348fc2d7236e74fa7c08f9434c110d7959&';
const THEME_FOOTER_ICON = 'https://cdn.discordapp.com/attachments/1408458115283812484/1408458115770482778/20250305162902.png?ex=68b50516&is=68b3b396&hm=1d83bbaaa9451ed0034a52c48ede5ddc55db692b15e65b4fe5c659ed4c80b77d&';
const THEME_TICKET_FOOTER_ICON = 'https://cdn.discordapp.com/attachments/1408458115283812484/1411752143173714040/IMG_20250831_183646.png?ex=68b7c664&is=68b674e4&hm=5980bdf7a118bddd76bb4d5f57168df7b2986b23b56ff0c96d47c3827b283765&';

const DELAY_OPTIONS = [
  { label: '15 minutes', ms: 15 * 60 * 1000 },
  { label: '1 heure', ms: 60 * 60 * 1000 },
  { label: '6 heures', ms: 6 * 60 * 60 * 1000 },
  { label: '24 heures', ms: 24 * 60 * 60 * 1000 },
  { label: '2 jours', ms: 2 * 24 * 60 * 60 * 1000 },
  { label: '3 jours', ms: 3 * 24 * 60 * 60 * 1000 },
  { label: '7 jours', ms: 7 * 24 * 60 * 60 * 1000 },
];

const MIN_DELAY_MS = Math.min(...DELAY_OPTIONS.map(d => d.ms));
const MAX_DELAY_MS = Math.max(...DELAY_OPTIONS.map(d => d.ms));

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
  // Track this interaction for monitoring
  trackInteraction(interaction, `economy-${actionKey}`);
  let fallbackTimer = null;
  const clearFallbackTimer = () => { try { if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; } } catch (_) {} };
  const respondAndUntrack = async (payload, preferFollowUp = false) => {
    try {
      clearFallbackTimer();
      if (interaction.deferred || interaction.replied) {
        const cloned = { ...(payload || {}) };
        try { if ('ephemeral' in cloned) delete cloned.ephemeral; } catch (_) {}
        if (preferFollowUp) {
          return await interaction.followUp(cloned);
        }
        return await interaction.editReply(cloned);
      }
      return await interaction.reply(payload);
    } finally {
      try { untrackInteraction(interaction); } catch (_) {}
    }
  };
  
  try {
    // Early defer for heavy actions BEFORE any storage access to avoid 3s timeout
    const heavyActions = ['work', 'fish', 'daily', 'steal', 'kiss', 'flirt', 'seduce', 'fuck', 'sodo', 'orgasme', 'lick', 'suck', 'nibble', 'branler', 'doigter'];
    let hasDeferred = false;
    if (heavyActions.includes(actionKey)) {
      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply();
          hasDeferred = true;
          console.log(`[Economy] Early defer for heavy action: ${actionKey}`);
          try {
            clearFallbackTimer();
            fallbackTimer = setTimeout(async () => {
              try {
                if (!interaction.replied) {
                  await interaction.editReply({ content: '⏳ Toujours en cours… merci de patienter quelques secondes de plus.' });
                }
              } catch (_) {}
            }, 10000);
          } catch (_) {}
        }
      } catch (error) {
        console.error(`[Economy] Early defer failed for ${actionKey}:`, error.message);
      }
    }
    const eco = await getEconomyConfig(interaction.guild.id);
    // Disallow bot users executing actions
    if (interaction.user?.bot) {
      return respondAndUntrack({ content: '⛔ Les bots ne peuvent pas utiliser cette action.', ephemeral: true });
    }
  // Check enabled
  const enabled = Array.isArray(eco.actions?.enabled) ? eco.actions.enabled : [];
  if (enabled.length && !enabled.includes(actionKey)) {
    return respondAndUntrack({ content: `⛔ Action désactivée.`, ephemeral: true });
  }
  // Resolve optional/required partner for actions that target a user
  const actionsWithTarget = ['kiss','flirt','seduce','fuck','sodo','orgasme','branler','doigter','hairpull','caress','lick','suck','nibble','tickle','revive','comfort','massage','dance','shower','wet','bed','undress','collar','leash','kneel','order','punish','rose','wine','pillowfight','sleep','oops','caught','tromper','orgie'];
  let initialPartner = null;
  let tromperResolvedPartner = null;
  try {
    if (actionsWithTarget.includes(actionKey)) {
      // Only get the target if user actually provided one
      initialPartner = interaction.options.getUser('cible', false);
    } else if (actionKey === 'crime') {
      initialPartner = interaction.options.getUser('complice', false);
    }
  } catch (_) {}
  if (initialPartner && initialPartner.bot) {
    return respondAndUntrack({ content: '⛔ Cible invalide: les bots sont exclus.', ephemeral: true });
  }
  // For heavier actions like 'tromper', defer reply IMMEDIATELY to avoid 3s timeout
  // preserve hasDeferred from early block above
  if (actionKey === 'tromper' || actionKey === 'orgie') {
    try {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
        hasDeferred = true;
        console.log(`[${actionKey === 'tromper' ? 'Tromper' : 'Orgie'}] Reply deferred immediately to prevent timeout`);
      }
    } catch (error) {
      console.error(`[${actionKey === 'tromper' ? 'Tromper' : 'Orgie'}] Failed to defer reply:`, error.message);
      // Fallback: try to reply immediately
      return respondAndUntrack({ 
        content: '⏳ Action en cours... Veuillez patienter.', 
        ephemeral: true 
      });
    }
  }
  // (removed duplicate heavy defer block; handled earlier)
  
  const u = await getEconomyUser(interaction.guild.id, interaction.user.id);
  const now = Date.now();
  const conf = (eco.actions?.config || {})[actionKey] || {};
  const baseCd = Number(conf.cooldown || (eco.settings?.cooldowns?.[actionKey] || 0));
  let cdLeft = Math.max(0, (u.cooldowns?.[actionKey] || 0) - now);
  if (cdLeft > 0) {
    const txt = `Veuillez patienter ${Math.ceil(cdLeft/1000)}s avant de réessayer.`;
    if (interaction.deferred || hasDeferred) {
      return respondAndUntrack({ content: txt });
    }
    return respondAndUntrack({ content: txt, ephemeral: true });
  }
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
  const msgSet = ((eco.actions?.messages || {})[actionKey]) || { success: [], fail: [] };
  let msgText = null;
  const successRate = Number(conf.successRate ?? 1);
  const success = Math.random() < successRate;
  // XP config
  const xpOnSuccess = Math.max(0, Number(conf.xpDelta || 0));
  const xpOnFail = Math.max(0, Number(conf.failXpDelta || 0));
  const partnerXpShare = Math.max(0, Number(conf.partnerXpShare || 0));
  const awardXp = async (userId, baseXp) => {
    try {
      // Skip XP for bots if ever called with a bot ID
      try { const m = await interaction.guild.members.fetch(userId).catch(()=>null); if (m?.user?.bot) return; } catch (_) {}
      const levels = await getLevelsConfig(interaction.guild.id);
      if (!levels?.enabled) return;
      const add = Math.max(0, Math.round(baseXp));
      if (add <= 0) return;
      const stats = await getUserStats(interaction.guild.id, userId);
      const prevLevel = stats.level || 0;
      stats.xp = (stats.xp||0) + add;
      const norm = xpToLevel(stats.xp, levels.levelCurve || { base: 100, factor: 1.2 });
      stats.level = norm.level;
      stats.xpSinceLevel = norm.xpSinceLevel;
      await setUserStats(interaction.guild.id, userId, stats);
      if (stats.level > prevLevel) {
        const mem = await fetchMember(interaction.guild, userId);
        if (mem) {
          maybeAnnounceLevelUp(interaction.guild, mem, levels, stats.level);
          const rid = (levels.rewards || {})[String(stats.level)];
          if (rid) {
            try { await mem.roles.add(rid); } catch (_) {}
            maybeAnnounceRoleAward(interaction.guild, mem, levels, rid);
          }
        }
      }
    } catch (_) {}
  };
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
  if (imageUrl) {
    try {
      imageUrl = normalizeGifUrlBasic(String(imageUrl));
    } catch (_) {}
  }
  // Special storyline for tromper (NSFW) and orgie (NSFW group)
  if (actionKey === 'tromper') {
    console.log('[Tromper] Starting tromper action for user:', interaction.user.id);
    let partner = initialPartner;
    let third = null;
    
    // Helper function for fetch with timeout
    const fetchMembersWithTimeout = async (guild, timeoutMs = 1500) => {
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Member fetch timeout')), timeoutMs)
      );
      
      const fetchPromise = guild.members.fetch({ 
        limit: 20, // Reduced limit for faster response
        force: false
      });
      
      return Promise.race([fetchPromise, timeoutPromise]);
    };
    
    try {
      console.log('[Tromper] Getting available members from cache...');
      
      // Use cached members first for better performance
      let availableMembers = interaction.guild.members.cache.filter(m => !m.user.bot && m.user.id !== interaction.user.id);
      console.log('[Tromper] Cached members available:', availableMembers.size);
      
      // If we have very few cached members, try to fetch more (but with strict timeout)
      if (availableMembers.size < 3) {
        console.log('[Tromper] Few cached members, attempting limited fetch with timeout...');
        try {
          // Fetch with strict timeout to avoid blocking
          const fetched = await fetchMembersWithTimeout(interaction.guild, 1500);
          const fetchedHumans = fetched.filter(m => !m.user.bot && m.user.id !== interaction.user.id);
          console.log('[Tromper] Fetched additional members:', fetchedHumans.size);
          
          // Merge with cached members
          availableMembers = availableMembers.concat(fetchedHumans);
          console.log('[Tromper] Total available members:', availableMembers.size);
        } catch (fetchError) {
          console.warn('[Tromper] Limited fetch failed, using cache only:', fetchError.message);
          // Continue with cache only - this is acceptable
        }
      }
      
      // If no partner provided, auto-select a random eligible partner from available members
      if (!partner) {
        const candidates = availableMembers;
        if (candidates.size > 0) {
          const arr = Array.from(candidates.values());
          partner = arr[Math.floor(Math.random() * arr.length)].user;
          console.log('[Tromper] Auto-selected partner:', partner.id);
        } else {
          console.log('[Tromper] No partner candidates available for auto-selection');
        }
      } else {
        console.log('[Tromper] Using provided partner:', partner.id);
      }
      
      // Pick third, excluding actor and partner if present
      const thirdCandidates = availableMembers.filter(m => partner ? (m.user.id !== partner.id) : true);
      console.log('[Tromper] Third member candidates:', thirdCandidates.size);
      if (thirdCandidates.size > 0) {
        const arrT = Array.from(thirdCandidates.values());
        third = arrT[Math.floor(Math.random() * arrT.length)].user;
        console.log('[Tromper] Selected third member:', third.id);
      } else {
        console.log('[Tromper] No third member available, will use simplified scenario');
      }
    } catch (e) {
      console.error('[Tromper] Error in member selection logic:', e?.message || e);
      console.error('[Tromper] Stack trace:', e?.stack);
      // Continue with simplified scenario if member selection fails
      console.log('[Tromper] Continuing with simplified scenario due to error');
    }
    // Persist chosen partner for later use (mention + rewards/xp)
    if (partner) { 
      initialPartner = partner; 
      tromperResolvedPartner = partner; 
      console.log('[Tromper] Partner persisted for rewards');
    }
    if (!third) {
      if (success) {
        const texts = partner ? [
          `Tu prends ${partner} au piège: tout te profite…`,
          `Situation ambiguë avec ${partner}, mais tu en ressors gagnant(e).`,
        ] : [
          'Tu prends la main: tout te profite…',
          'Situation ambiguë, mais tu en ressors gagnant(e).',
        ];
        msgText = texts[randInt(0, texts.length - 1)];
      } else {
        const texts = partner ? [
          `Le plan échoue: ${partner} te surprend et te fait payer la note.`,
          `Pris(e) en faute par ${partner}, tout s\'effondre pour toi.`,
        ] : [
          'Le plan échoue: tu es pris(e) et tu payes la note.',
          'Pris(e) en faute, tout s\'effondre pour toi.',
        ];
        msgText = texts[randInt(0, texts.length - 1)];
      }
    } else {
      console.log('[Tromper] Applying penalties to third member:', third.id);
      // Apply special penalties to the third member
      const thirdUser = await getEconomyUser(interaction.guild.id, third.id);
      const loseMin = Math.max(1, Number(conf.failMoneyMin||5));
      const loseMax = Math.max(loseMin, Number(conf.failMoneyMax||10));
      const thirdMoneyDelta = -randInt(loseMin, loseMax);
      let thirdCharmDelta = 0;
      let thirdPervDelta = 0;
      if (conf.karma === 'perversion') thirdPervDelta = Number(conf.failKarmaDelta||1);
      else if (conf.karma === 'charm') thirdCharmDelta = -Number(conf.failKarmaDelta||1);
      thirdUser.amount = Math.max(0, (thirdUser.amount||0) + thirdMoneyDelta);
      if (thirdCharmDelta) thirdUser.charm = (thirdUser.charm||0) + thirdCharmDelta;
      if (thirdPervDelta) thirdUser.perversion = (thirdUser.perversion||0) + thirdPervDelta;
      console.log('[Tromper] Saving third member economy data...');
      await setEconomyUser(interaction.guild.id, third.id, thirdUser);
      console.log('[Tromper] Third member penalties applied successfully');
      // Messages
      if (success) {
        const texts = partner ? [
          `Tu surprends ${partner} avec ${third}… et c'est ${third} qui trinque.`,
          `Pris en flagrant délit: ${third} paye pour avoir brisé la confiance.`,
          `Scène chaude: tu retournes la situation sur ${third}.`
        ] : [
          `Tu surprends ${third} en mauvaise posture… et c'est ${third} qui trinque.`,
          `Pris en flagrant délit: ${third} paye pour avoir brisé la confiance.`,
          `Scène chaude: tu retournes la situation sur ${third}.`
        ];
        msgText = texts[randInt(0, texts.length - 1)];
      } else {
        const texts = partner ? [
          `Tu es surpris(e) avec ${third} par ${partner}… ça tourne mal pour vous deux.`,
          `${partner} vous coince, toi et ${third}: pertes et remords.`,
          `Exposé(e) au grand jour: ${partner} règle ses comptes.`,
        ] : [
          `Tu es surpris(e) avec ${third}… ça tourne mal pour vous deux.`,
          `On vous coince, toi et ${third}: pertes et remords.`,
          `Exposé(e) au grand jour: les comptes sont réglés.`,
        ];
        msgText = texts[randInt(0, texts.length - 1)];
      }
      // Attach a transient field for later embed
      const currency = eco.currency?.name || 'BAG$';
      const thirdFieldVal = `${third} → ${thirdMoneyDelta}${currency ? ' ' + currency : ''}`
        + (thirdCharmDelta ? `, Charme ${thirdCharmDelta>=0?'+':''}${thirdCharmDelta}` : '')
        + (thirdPervDelta ? `, Perversion ${thirdPervDelta>=0?'+':''}${thirdPervDelta}` : '');
      global.__eco_tromper_third = { name: 'Sanction du tiers', value: thirdFieldVal, inline: false };
    }
    console.log('[Tromper] Tromper logic completed successfully');
  }
  // Special storyline for orgie (NSFW group): actor, optional cible, and 3-4 additional random members
  if (actionKey === 'orgie') {
    console.log('[Orgie] Starting orgie action for user:', interaction.user.id);
    let partner = initialPartner;
    let participants = [];
    try {
      let availableMembers = interaction.guild.members.cache.filter(m => !m.user.bot && m.user.id !== interaction.user.id);
      if (availableMembers.size < 6) {
        try {
          const fetched = await interaction.guild.members.fetch({ limit: 30, force: false });
          availableMembers = availableMembers.concat(fetched.filter(m => !m.user.bot && m.user.id !== interaction.user.id));
        } catch (e) {
          console.warn('[Orgie] Fetch members fallback failed:', e?.message || e);
        }
      }
      // Ensure partner is set if provided and valid
      const excludeIds = new Set([interaction.user.id]);
      if (partner && !partner.bot) excludeIds.add(partner.id);
      // Determine number of random others: 4 if partner exists, else 5
      const needed = partner ? 4 : 5;
      const pool = Array.from(availableMembers.values())
        .map(m => m.user)
        .filter(u2 => !u2.bot && !excludeIds.has(u2.id));
      for (let i = 0; i < needed && pool.length > 0; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        participants.push(pool[idx]);
        excludeIds.add(pool[idx].id);
        pool.splice(idx, 1);
      }
    } catch (e) {
      console.error('[Orgie] Error selecting participants:', e?.message || e);
    }
    const everyone = [partner, ...participants].filter(Boolean);
    const list = everyone.length ? everyone.map(u2 => String(u2)).join(', ') : 'personne';
    if (success) {
      const texts = partner ? [
        `Orgie réussie avec ${partner} et ${participants.length} autres: la pièce s'enflamme.`,
        `Vous vous abandonnez, ${partner} et ${participants.length} complices… c'est mémorable.`,
      ] : [
        `Orgie sauvage avec ${participants.length} partenaires: tout le monde y trouve son compte.`,
        `Tu lances une orgie à ${participants.length + 1}: extase collective.`,
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = partner ? [
        `Orgie avortée: ${partner} et le groupe se dispersent, ambiance cassée.`,
        `Le plan tourne court avec ${partner} et les autres: frustration générale.`,
      ] : [
        `Orgie ratée: le groupe ne prend pas, tu perds la main.`,
        `Ça capote: l'envie n'y est pas, tout le monde s'éloigne.`,
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
    if (everyone.length) {
      const currency = eco.currency?.name || 'BAG$';
      const label = `Participants (${everyone.length})`;
      const val = `${list}`;
      global.__eco_orgie_participants = { name: label, value: val, inline: false };
    }
    console.log('[Orgie] Orgie logic completed successfully');
  }
  // Decide how to render the image: embed if definitely image, else post link in message content
  let imageIsDirect = false;
  let imageLinkForContent = null;
  let imageAttachment = null; // { attachment, filename }
  if (imageUrl) {
    try { imageIsDirect = isLikelyDirectImageUrl(imageUrl); } catch (_) { imageIsDirect = false; }
    if (!imageIsDirect) {
      imageLinkForContent = String(imageUrl);
    }
  }
  // Try to resolve non-direct GIF page URLs (e.g., Tenor/Giphy) and attach if needed
  if (imageUrl && !imageIsDirect) {
    // Defer before doing network lookups to avoid 3s timeout
    try {
      if (!hasDeferred && !interaction.deferred && !interaction.replied) {
        await interaction.deferReply();
        hasDeferred = true;
      }
    } catch (_) {}
    // Attempt to resolve to a direct media URL with better error handling
    try {
      const resolved = await resolveGifUrl(imageUrl, { timeoutMs: 2000 });
      if (resolved) {
        imageUrl = resolved;
        try { imageIsDirect = isLikelyDirectImageUrl(imageUrl); } catch (_) { imageIsDirect = false; }
        imageLinkForContent = imageIsDirect ? null : String(imageUrl);
      }
    } catch (error) {
      console.warn(`[Economy] Failed to resolve GIF URL ${imageUrl}:`, error.message);
    }
    // As a final fallback, try to fetch and attach the image bytes
    if (!imageIsDirect) {
      try {
        const att = await tryCreateImageAttachmentFromUrl(imageUrl, { timeoutMs: 2500 });
        if (att && att.attachment) {
          imageAttachment = att;
          imageLinkForContent = null;
        }
      } catch (error) {
        console.warn(`[Economy] Failed to create image attachment from ${imageUrl}:`, error.message);
        // If all image processing fails, continue without image but log it
        imageLinkForContent = String(imageUrl);
      }
    }
  }
  // Only set msgText from config if it hasn't been set by special action logic (like tromper/orgie)
  if (!msgText) {
    msgText = success
      ? (Array.isArray(msgSet.success) && msgSet.success.length ? msgSet.success[Math.floor(Math.random()*msgSet.success.length)] : null)
      : (Array.isArray(msgSet.fail) && msgSet.fail.length ? msgSet.fail[Math.floor(Math.random()*msgSet.fail.length)] : null);
  }
  // Keep 'orgasme' simple: use curated short phrases matching the intent
  if (actionKey === 'kiss') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tu embrasses ${partner} avec passion, les lèvres se rencontrent dans un baiser brûlant.` : `Tu t'embrasses dans le miroir, un moment d'intimité avec toi-même.`,
        partner ? `Baiser tendre avec ${partner}, l'émotion monte entre vous.` : `Baiser solitaire mais intense, tu te fais plaisir.`,
        partner ? `Vos lèvres se fondent dans un baiser sensuel avec ${partner}.` : `Baiser passionné, tu te laisses aller au plaisir.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        partner ? `Tu tentes d'embrasser ${partner}, mais il/elle détourne la tête.` : `Tu tentes de t'embrasser, mais le moment n'y est pas.`,
        partner ? `Baiser refusé par ${partner}, l'ambiance n'est pas au rendez-vous.` : `Baiser raté, tu préfères reporter à plus tard.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'flirt') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tu dragues ${partner} avec charme, un regard complice s'échange.` : `Tu pratiques ton charme devant le miroir, confiance en toi renforcée.`,
        partner ? `Séduction réussie avec ${partner}, l'ambiance devient électrique.` : `Tu séduis l'air, ton charme naturel ressort.`,
        partner ? `Tu fais de l'œil à ${partner}, le jeu de la séduction commence.` : `Tu travailles ton charme, prêt(e) pour de nouvelles conquêtes.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        partner ? `Tu tentes de draguer ${partner}, mais il/elle n'est pas réceptif(ve).` : `Tu tentes de séduire, mais le charme ne fonctionne pas.`,
        partner ? `Séduction ratée avec ${partner}, l'ambiance n'y est pas.` : `Drague maladroite, tu préfères reporter à plus tard.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'seduce') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tu séduis ${partner} avec maîtrise, l'envie monte entre vous.` : `Tu pratiques l'art de la séduction, ton charme naturel ressort.`,
        partner ? `Séduction intense avec ${partner}, l'ambiance devient torride.` : `Tu séduis l'air, prêt(e) pour de nouvelles aventures.`,
        partner ? `Tu envoûtes ${partner} par ta présence magnétique.` : `Tu travailles ta séduction, confiance en toi décuplée.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        partner ? `Tu tentes de séduire ${partner}, mais il/elle résiste à ton charme.` : `Tu tentes de séduire, mais l'ambiance n'y est pas.`,
        partner ? `Séduction échouée avec ${partner}, il/elle n'est pas réceptif(ve).` : `Séduction ratée, tu préfères reporter à plus tard.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'fuck') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tu baises ${partner} avec passion, l'extase vous emporte tous les deux.` : `Tu te masturbes avec intensité, le plaisir monte en toi.`,
        partner ? `Rapport sexuel torride avec ${partner}, plaisir partagé à son comble.` : `Masturbation intense, tu atteins l'extase.`,
        partner ? `Tu pénètres ${partner} avec désir, l'ambiance est au rendez-vous.` : `Tu te fais plaisir, corps en feu et désir assouvi.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        partner ? `Tu tentes de baiser ${partner}, mais il/elle n'est pas d'humeur.` : `Tu tentes de te masturber, mais le moment n'y est pas.`,
        partner ? `Rapport refusé par ${partner}, l'ambiance n'est pas au rendez-vous.` : `Masturbation ratée, tu préfères reporter à plus tard.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'massage') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tu masses ${partner} avec douceur, détente et bien-être partagés.` : `Tu te masses, détente et relaxation au rendez-vous.`,
        partner ? `Massage apaisant pour ${partner}, les tensions s'évacuent.` : `Auto-massage réussi, tu te détends complètement.`,
        partner ? `Tes mains expertes soulagent ${partner}, moment de pure détente.` : `Massage personnel, tu prends soin de toi.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        partner ? `Tu tentes de masser ${partner}, mais il/elle préfère être seul(e).` : `Tu tentes de te masser, mais tu n'es pas dans le bon état d'esprit.`,
        partner ? `Massage refusé par ${partner}, l'ambiance n'y est pas.` : `Auto-massage raté, tu préfères reporter à plus tard.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'dance') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tu danses avec ${partner}, rythme et harmonie parfaits.` : `Tu danses seul(e), rythme et grâce naturelle.`,
        partner ? `Danse sensuelle avec ${partner}, l'ambiance devient électrique.` : `Tu danses avec style, confiance et élégance.`,
        partner ? `Vous dansez ensemble, ${partner} et toi, moment magique.` : `Danse libre, tu exprimes ta joie de vivre.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        partner ? `Tu tentes de danser avec ${partner}, mais il/elle n'est pas d'humeur.` : `Tu tentes de danser, mais tu n'es pas dans le bon rythme.`,
        partner ? `Danse refusée par ${partner}, l'ambiance n'y est pas.` : `Danse ratée, tu préfères reporter à plus tard.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'lick') {
    const zones = ['seins','chatte','cul','oreille','ventre','bite'];
    const poss = { seins: 'ses', chatte: 'sa', cul: 'son', oreille: 'son', ventre: 'son', bite: 'sa' };
    const zoneOpt = String(interaction.options.getString('zone', false) || '').toLowerCase();
    const z = zones.includes(zoneOpt) ? zoneOpt : zones[randInt(0, zones.length - 1)];
    const p = poss[z] || 'sa';
    if (success) {
      const texts = [
        `Tu lèches ${p} ${z} avec gourmandise.`,
        `Un coup de langue taquin sur ${p} ${z}…`,
        `Tu te penches et lèches ${p} ${z} 😈`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        `Tu tentes de lécher ${p} ${z}, mais on te repousse gentiment.`,
        `Tu vises ${p} ${z}… raté, ambiance gênante.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'suck') {
    const zones = ['bite','téton','oreille'];
    const poss = { bite: 'sa', 'téton': 'son', 'oreille': 'son' };
    const zoneOpt = String(interaction.options.getString('zone', false) || '').toLowerCase();
    const z = zones.includes(zoneOpt) ? zoneOpt : zones[randInt(0, zones.length - 1)];
    const p = poss[z] || 'son';
    if (success) {
      const texts = [
        `Tu suces ${p} ${z} lentement…`,
        `Tes lèvres se referment sur ${p} ${z} avec envie.`,
        `Tu t'appliques sur ${p} ${z}, c'est brûlant.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        `Tu t'approches de ${p} ${z}, mais il/elle te retient.`,
        `Tu tentes sur ${p} ${z}… l'ambiance n'y est pas.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'nibble') {
    const zones = ['cou','lèvres','épaule','lobe'];
    const zoneOpt = String(interaction.options.getString('zone', false) || '').toLowerCase();
    const z = zones.includes(zoneOpt) ? zoneOpt : zones[randInt(0, zones.length - 1)];
    const targetText = (z === 'lèvres') ? 'les lèvres' : (z === 'lobe' ? "le lobe" : (z === 'cou' ? 'le cou' : "l'épaule"));
    if (success) {
      const texts = [
        `Tu mordilles ${targetText} avec douceur, frisson garanti.`,
        `Petite morsure taquine sur ${targetText}, souffle coupé.`,
        `Tu poses tes dents sur ${targetText}, excitation immédiate.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        `Tu tentes de mordre ${targetText}, mais il/elle préfère attendre.`,
        `Mauvais timing pour une morsure, vous ralentissez.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'caress') {
    const zones = ['sein','fesses','corps','jambes','bite','pied','nuque','épaule'];
    const poss = { sein: 'son', fesses: 'ses', corps: 'son', jambes: 'ses', bite: 'sa', pied: 'son', nuque: 'sa', 'épaule': 'son' };
    const zoneOpt = String(interaction.options.getString('zone', false) || '').toLowerCase();
    const z = zones.includes(zoneOpt) ? zoneOpt : zones[randInt(0, zones.length - 1)];
    const p = poss[z] || 'son';
    if (success) {
      const texts = [
        `Tes mains caressent ${p} ${z} avec une douceur électrique…`,
        `Tu caresses ${p} ${z}, les frissons apparaissent.`,
        `Des caresses lentes sur ${p} ${z} font monter le désir.`,
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        `Tu tentes de caresser ${p} ${z}, mais il/elle préfère attendre.`,
        `Sur ${p} ${z}, ce n'est pas le bon moment.`,
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'tickle') {
    const zones = ['côtes','pieds','nuque','ventre','aisselles'];
    const poss = { côtes: 'ses', pieds: 'ses', nuque: 'sa', ventre: 'son', aisselles: 'ses' };
    const zoneOpt = String(interaction.options.getString('zone', false) || '').toLowerCase();
    const z = zones.includes(zoneOpt) ? zoneOpt : zones[randInt(0, zones.length - 1)];
    const p = poss[z] || 'ses';
    if (success) {
      const texts = [
        `Tu chatouilles ${p} ${z} jusqu'au fou rire.`,
        `Une avalanche de chatouilles sur ${p} ${z} !`,
        `Tu l'attrapes et chatouilles ${p} ${z} 😂`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        `Tu tentes de chatouiller ${p} ${z}, mais ça ne prend pas.`,
        `Pas sensible ici… ${p} ${z} ne réagissent pas.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'sodo') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tu pénètres ${partner} par derrière avec intensité et douceur.` : `Tu t'abandonnes à une sodomie torride, consentie et maîtrisée.`,
        partner ? `Vous profitez d'une sodomie passionnée avec ${partner} 😈` : `Sodomie consentie, rythmée et ardente.`,
        `Préparation, lubrifiant, communication: tout est parfait, plaisir partagé.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        'Pas le bon moment: on privilégie le confort et la sécurité.',
        'Sans préparation adéquate, vous préférez reporter.',
        'On arrête: consentement et confort avant tout.'
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'orgasme') {
    const partner = interaction.options.getUser('cible', false);
    if (!msgText) {
      if (success) {
        const texts = [
          partner ? `Tu guides ${partner} jusqu'à l'extase, souffle coupé…` : `Tu atteins l'extase, corps en feu…`,
          partner ? `Plaisir partagé avec ${partner}, frissons complices.` : `Climax intense, le cœur s'emballe.`,
          `Respirs courts, regard qui brille: c'est l'explosion.`
        ];
        msgText = texts[randInt(0, texts.length - 1)];
      } else {
        const texts = [
          'Le moment n\'est pas le bon, vous ralentissez.',
          'On communique, on remet ça plus tard.'
        ];
        msgText = texts[randInt(0, texts.length - 1)];
      }
    }
  }
  if (actionKey === 'branler') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tu branles ${partner} avec un rythme assuré.` : `Tu te fais plaisir avec assurance…`,
        partner ? `Ta main s'active sur ${partner}, le souffle s'accélère.` : `Mouvements réguliers, la tension monte.`,
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        'Tu ralentis… ce n\'est pas le bon moment.',
        'On préfère attendre, consentement et confort d\'abord.'
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'doigter') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tes doigts explorent ${partner} avec douceur et précision.` : `Tes doigts explorent, réactions immédiates…`,
        partner ? `Tu doigtes ${partner} avec tact, le corps répond.` : `Exploration délicate, la chaleur monte.`,
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        'Tu t\'arrêtes: il/elle n\'est pas à l\'aise.',
        'Pas le bon timing, vous en discutez d\'abord.'
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'hairpull') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tu glisses ta main dans les cheveux de ${partner} et tires avec fermeté.` : `Tu agrippes les cheveux et tires, le regard s'embrase.`,
        partner ? `Prise assurée dans la chevelure de ${partner}, le contrôle te va bien.` : `Prise dans la chevelure, tu guides avec assurance.`,
        `Geste maîtrisé, consentement clair: excitation immédiate.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        'Tu hésites… le geste manque de clarté.',
        'Pas d\'accord là-dessus, vous évitez pour l\'instant.',
        'Mauvais moment: discussion et consentement avant tout.'
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'revive') {
    const techniques = ['bouche-à-bouche','massage cardiaque','position latérale de sécurité','défibrillateur (imaginaire)','vérification des voies aériennes'];
    const t = techniques[randInt(0, techniques.length - 1)];
    if (success) {
      const texts = [
        `Tu appliques ${t} avec sang-froid. Il/elle reprend des signes de vie.`,
        `Intervention rapide: ${t}. Le pouls revient.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        `Tu tentes ${t}, mais rien pour l'instant.`,
        `Stressé·e, ${t} manque d'efficacité. Continue tes efforts.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'comfort') {
    if (success) {
      const texts = [
        'Tu offres un câlin apaisant, tout en douceur.',
        'Tu glisses quelques mots rassurants et serres la main.',
        'Tu poses une couverture sur ses épaules et souris tendrement.'
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        'Tu hésites… les mots ne sortent pas.',
        'Tu tentes un geste, mais le moment ne s\'y prête pas.'
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'shower') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tu prends une douche avec ${partner}, moment d'intimité partagé.` : `Tu prends une douche relaxante, détente et bien-être.`,
        partner ? `Douche sensuelle avec ${partner}, l'eau coule sur vos corps.` : `Douche chaude, tu te détends sous le jet d'eau.`,
        partner ? `Vous vous lavez ensemble, ${partner} et toi, moment de complicité.` : `Douche rafraîchissante, tu te sens revigoré(e).`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        partner ? `Tu tentes de prendre une douche avec ${partner}, mais il/elle préfère être seul(e).` : `Tu tentes de prendre une douche, mais l'eau est froide.`,
        partner ? `Douche refusée par ${partner}, l'ambiance n'y est pas.` : `Douche ratée, tu préfères reporter à plus tard.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'bed') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tu t'allonges au lit avec ${partner}, moment de détente partagé.` : `Tu t'allonges au lit, repos et relaxation.`,
        partner ? `Lit douillet avec ${partner}, vous vous détendez ensemble.` : `Lit confortable, tu te reposes paisiblement.`,
        partner ? `Vous vous couchez ensemble, ${partner} et toi, moment de calme.` : `Tu te couches, prêt(e) pour une bonne nuit.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        partner ? `Tu tentes de t'allonger avec ${partner}, mais il/elle préfère être seul(e).` : `Tu tentes de te coucher, mais tu n'arrives pas à dormir.`,
        partner ? `Lit refusé par ${partner}, l'ambiance n'y est pas.` : `Repos raté, tu préfères rester éveillé(e).`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'sleep') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tu t'endors avec ${partner}, sommeil paisible et réparateur.` : `Tu t'endors, sommeil profond et réparateur.`,
        partner ? `Dodo avec ${partner}, vous dormez paisiblement ensemble.` : `Tu dors, rêves doux et repos complet.`,
        partner ? `Vous vous endormez ensemble, ${partner} et toi, moment de sérénité.` : `Tu t'endors, prêt(e) pour de beaux rêves.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        partner ? `Tu tentes de dormir avec ${partner}, mais il/elle préfère être seul(e).` : `Tu tentes de dormir, mais tu n'arrives pas à t'endormir.`,
        partner ? `Sommeil refusé par ${partner}, l'ambiance n'y est pas.` : `Dodo raté, tu préfères rester éveillé(e).`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'work') {
    if (success) {
      const texts = [
        'Tu travailles dur et gagnes de l\'argent honnêtement.',
        'Tu accomplis tes tâches avec diligence, récompense méritée.',
        'Travail bien fait, tu es récompensé(e) pour tes efforts.',
        'Tu bosses efficacement, l\'argent rentre dans tes poches.',
        'Travail productif, tu mérites cette récompense.'
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        'Tu travailles, mais sans grand résultat cette fois.',
        'Travail difficile, tu n\'obtiens pas grand-chose.',
        'Tu bosses, mais la récompense est maigre.',
        'Travail peu productif, dommage pour cette fois.'
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'daily') {
    if (success) {
      const texts = [
        'Tu récupères ta récompense quotidienne, bon début de journée !',
        'Récompense du jour récupérée, tu commences bien ta journée.',
        'Tu touches ton bonus quotidien, parfait pour démarrer.',
        'Récompense journalière obtenue, excellente journée en perspective !',
        'Ton bonus du jour est là, profites-en bien !'
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        'Tu as déjà récupéré ta récompense quotidienne aujourd\'hui.',
        'Récompense du jour déjà prise, reviens demain !',
        'Tu as déjà touché ton bonus quotidien.',
        'Récompense journalière déjà récupérée, patience !'
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'fish') {
    if (success) {
      const texts = [
        'Tu pêches avec succès, un beau poisson au bout de ta ligne !',
        'Pêche fructueuse, tu remontes un poisson de bonne taille.',
        'Tu attrapes un poisson, la pêche est bonne aujourd\'hui !',
        'Belle prise ! Tu sors un poisson de l\'eau.',
        'Pêche réussie, tu rentres avec du poisson frais.'
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        'Tu pêches, mais rien ne mord à l\'hameçon.',
        'Pêche infructueuse, les poissons ne sont pas au rendez-vous.',
        'Tu lances ta ligne, mais aucun poisson ne s\'intéresse à ton appât.',
        'Pêche ratée, tu rentres les mains vides cette fois.'
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'wet') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tu mouilles ${partner}, l'eau coule sur son corps.` : `Tu te mouilles, sensation rafraîchissante.`,
        partner ? `Vous vous mouillez ensemble, ${partner} et toi, moment de complicité.` : `Tu te mouilles, détente et fraîcheur.`,
        partner ? `Eau sur ${partner}, moment de jeu et de rires.` : `Tu te mouilles, sensation agréable et rafraîchissante.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        partner ? `Tu tentes de mouiller ${partner}, mais il/elle évite l'eau.` : `Tu tentes de te mouiller, mais l'eau est trop froide.`,
        partner ? `Mouillage refusé par ${partner}, l'ambiance n'y est pas.` : `Mouillage raté, tu préfères rester au sec.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'undress') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tu déshabilles ${partner} avec douceur, moment d'intimité.` : `Tu te déshabilles, moment de détente personnelle.`,
        partner ? `Vous vous déshabillez ensemble, ${partner} et toi, complicité partagée.` : `Tu enlèves tes vêtements, liberté et confort.`,
        partner ? `Déshabillage sensuel avec ${partner}, l'ambiance devient intime.` : `Tu te déshabilles, sensation de liberté.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        partner ? `Tu tentes de déshabiller ${partner}, mais il/elle préfère garder ses vêtements.` : `Tu tentes de te déshabiller, mais tu préfères rester habillé(e).`,
        partner ? `Déshabillage refusé par ${partner}, l'ambiance n'y est pas.` : `Déshabillage raté, tu préfères rester couvert(e).`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'collar') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tu mets un collier à ${partner}, symbole de confiance et d'intimité.` : `Tu portes un collier, élégance et style.`,
        partner ? `Collier posé sur ${partner}, moment de tendresse partagé.` : `Tu enfiles un collier, accessoire qui te va bien.`,
        partner ? `Vous partagez un collier, ${partner} et toi, lien symbolique.` : `Tu portes un collier, confiance en toi renforcée.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        partner ? `Tu tentes de mettre un collier à ${partner}, mais il/elle n'est pas d'accord.` : `Tu tentes de porter un collier, mais ça ne te convient pas.`,
        partner ? `Collier refusé par ${partner}, l'ambiance n'y est pas.` : `Collier raté, tu préfères rester sans accessoire.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'leash') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tu attaches une laisse à ${partner}, jeu de confiance et d'intimité.` : `Tu portes une laisse, moment de soumission consentie.`,
        partner ? `Laisse posée sur ${partner}, moment de jeu partagé.` : `Tu enfiles une laisse, sensation de liberté contrôlée.`,
        partner ? `Vous jouez avec une laisse, ${partner} et toi, complicité spéciale.` : `Tu portes une laisse, confiance en toi renforcée.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        partner ? `Tu tentes d'attacher une laisse à ${partner}, mais il/elle n'est pas d'accord.` : `Tu tentes de porter une laisse, mais ça ne te convient pas.`,
        partner ? `Laisse refusée par ${partner}, l'ambiance n'y est pas.` : `Laisse ratée, tu préfères rester libre.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'kneel') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tu t'agenouilles devant ${partner}, geste de respect et d'intimité.` : `Tu t'agenouilles, moment de réflexion et de calme.`,
        partner ? `Agenouillement devant ${partner}, moment de soumission consentie.` : `Tu t'agenouilles, posture de méditation et de paix.`,
        partner ? `Vous partagez ce moment, ${partner} et toi, complicité spéciale.` : `Tu t'agenouilles, confiance en toi renforcée.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        partner ? `Tu tentes de t'agenouiller devant ${partner}, mais il/elle préfère l'égalité.` : `Tu tentes de t'agenouiller, mais tu préfères rester debout.`,
        partner ? `Agenouillement refusé par ${partner}, l'ambiance n'y est pas.` : `Agenouillement raté, tu préfères rester droit(e).`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'order') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tu donnes un ordre à ${partner}, qui l'exécute avec confiance.` : `Tu prends le contrôle, confiance en toi renforcée.`,
        partner ? `Ordre donné à ${partner}, moment de leadership partagé.` : `Tu assumes ton autorité, leadership naturel.`,
        partner ? `Vous jouez le jeu des ordres, ${partner} et toi, complicité spéciale.` : `Tu donnes des ordres, confiance en toi décuplée.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        partner ? `Tu tentes de donner un ordre à ${partner}, mais il/elle n'est pas d'accord.` : `Tu tentes de donner un ordre, mais ça ne fonctionne pas.`,
        partner ? `Ordre refusé par ${partner}, l'ambiance n'y est pas.` : `Ordre raté, tu préfères la collaboration.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'punish') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tu punis ${partner} avec douceur, moment de jeu et d'intimité.` : `Tu te punis, moment de réflexion personnelle.`,
        partner ? `Punition donnée à ${partner}, jeu de confiance partagé.` : `Tu assumes ta punition, moment de croissance.`,
        partner ? `Vous jouez le jeu de la punition, ${partner} et toi, complicité spéciale.` : `Tu acceptes ta punition, confiance en toi renforcée.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        partner ? `Tu tentes de punir ${partner}, mais il/elle n'est pas d'accord.` : `Tu tentes de te punir, mais ça ne te convient pas.`,
        partner ? `Punition refusée par ${partner}, l'ambiance n'y est pas.` : `Punition ratée, tu préfères la douceur.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'rose') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tu offres une rose à ${partner}, geste romantique et tendre.` : `Tu admires une rose, moment de beauté et de paix.`,
        partner ? `Rose offerte à ${partner}, moment de romance partagé.` : `Tu respires le parfum d'une rose, détente et sérénité.`,
        partner ? `Vous partagez une rose, ${partner} et toi, moment romantique.` : `Tu portes une rose, élégance et charme naturel.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        partner ? `Tu tentes d'offrir une rose à ${partner}, mais il/elle n'est pas réceptif(ve).` : `Tu tentes d'admirer une rose, mais elle se fane.`,
        partner ? `Rose refusée par ${partner}, l'ambiance n'y est pas.` : `Rose ratée, tu préfères autre chose.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'wine') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tu partages un verre de vin avec ${partner}, moment de détente et de complicité.` : `Tu dégustes un verre de vin, moment de plaisir et de détente.`,
        partner ? `Vin partagé avec ${partner}, ambiance chaleureuse et conviviale.` : `Tu savoures un bon vin, moment de plaisir personnel.`,
        partner ? `Vous trinquez ensemble, ${partner} et toi, moment de convivialité.` : `Tu bois un verre de vin, détente et bien-être.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        partner ? `Tu tentes de partager un verre avec ${partner}, mais il/elle préfère autre chose.` : `Tu tentes de boire du vin, mais tu préfères autre chose.`,
        partner ? `Vin refusé par ${partner}, l'ambiance n'y est pas.` : `Vin raté, tu préfères une autre boisson.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'pillowfight') {
    const partner = interaction.options.getUser('cible', false);
    if (success) {
      const texts = [
        partner ? `Tu fais une bataille d'oreillers avec ${partner}, moment de jeu et de rires.` : `Tu joues avec des oreillers, moment de détente et de plaisir.`,
        partner ? `Bataille d'oreillers avec ${partner}, ambiance joyeuse et ludique.` : `Tu t'amuses avec des oreillers, moment de légèreté.`,
        partner ? `Vous vous battez avec des oreillers, ${partner} et toi, moment de complicité.` : `Tu fais une bataille d'oreillers, joie et détente.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        partner ? `Tu tentes de faire une bataille d'oreillers avec ${partner}, mais il/elle n'est pas d'humeur.` : `Tu tentes de jouer avec des oreillers, mais tu n'es pas dans le bon état d'esprit.`,
        partner ? `Bataille d'oreillers refusée par ${partner}, l'ambiance n'y est pas.` : `Bataille d'oreillers ratée, tu préfères te reposer.`
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'oops') {
    if (success) {
      const texts = [
        'Tu fais un petit accident, mais tout se passe bien !',
        'Oups ! Un petit incident, mais rien de grave.',
        'Tu commets une petite erreur, mais c\'est pardonnable.',
        'Petit accident, mais tu gères la situation avec humour.',
        'Oups ! Un moment de maladresse, mais tout va bien.'
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        'Tu fais un accident, et ça tourne mal.',
        'Oups ! Un incident qui dégénère.',
        'Tu commets une erreur, et les conséquences sont fâcheuses.',
        'Accident mal géré, la situation empire.',
        'Oups ! Une maladresse qui coûte cher.'
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  if (actionKey === 'caught') {
    if (success) {
      const texts = [
        'Tu es surpris(e) en train de faire quelque chose, mais tu t\'en sors bien !',
        'Tu es pris(e) sur le fait, mais tu gères la situation.',
        'Tu es découvert(e), mais tu trouves une bonne explication.',
        'Tu es surpris(e), mais tu retournes la situation à ton avantage.',
        'Tu es pris(e) en flagrant délit, mais tu t\'en sors avec style.'
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    } else {
      const texts = [
        'Tu es surpris(e) en train de faire quelque chose, et ça tourne mal.',
        'Tu es pris(e) sur le fait, et tu ne peux pas t\'en sortir.',
        'Tu es découvert(e), et les conséquences sont fâcheuses.',
        'Tu es surpris(e), et la situation dégénère.',
        'Tu es pris(e) en flagrant délit, et tu payes les conséquences.'
      ];
      msgText = texts[randInt(0, texts.length - 1)];
    }
  }
  // Special cases
  if (actionKey === 'give') {
    const cible = interaction.options.getUser('membre', true);
    if (cible?.bot) return respondAndUntrack({ content: '⛔ Vous ne pouvez pas donner à un bot.', ephemeral: true });
    const montant = interaction.options.getInteger('montant', true);
    if ((u.amount||0) < montant) return respondAndUntrack({ content: `Solde insuffisant.`, ephemeral: true });
    u.amount = (u.amount||0) - montant;
    const tu = await getEconomyUser(interaction.guild.id, cible.id);
    tu.amount = (tu.amount||0) + montant;
    // Apply karma on give, if configured
    let giveKarmaField = null;
    if (conf.karma === 'charm' && Number(conf.karmaDelta||0) !== 0) { u.charm = (u.charm||0) + Number(conf.karmaDelta||0); giveKarmaField = ['Karma charme', `+${Number(conf.karmaDelta||0)}`]; }
    else if (conf.karma === 'perversion' && Number(conf.karmaDelta||0) !== 0) { u.perversion = (u.perversion||0) + Number(conf.karmaDelta||0); giveKarmaField = ['Karma perversion', `+${Number(conf.karmaDelta||0)}`]; }
    await setEconomyUser(interaction.guild.id, interaction.user.id, u);
    await setEconomyUser(interaction.guild.id, cible.id, tu);
    const currency = eco.currency?.name || 'BAG$';
    const desc = msgText ? `${msgText}\nVous avez donné ${montant} ${currency} à ${cible}.` : `Vous avez donné ${montant} ${currency} à ${cible}.`;
    const fields = [
      { name: 'Argent', value: `-${montant} ${currency}`, inline: true },
      { name: 'Solde argent', value: String(u.amount), inline: true },
      ...(giveKarmaField ? [{ name: 'Karma', value: `${giveKarmaField[0].toLowerCase().includes('perversion') ? 'Perversion' : 'Charme'} ${giveKarmaField[1]}`, inline: true }] : []),
      { name: 'Solde charme', value: String(u.charm||0), inline: true },
      { name: 'Solde perversion', value: String(u.perversion||0), inline: true },
    ];
    const embed = buildEcoEmbed({ title: 'Don effectué', description: desc, fields });
    if (imageUrl && imageIsDirect) embed.setImage(imageUrl);
    else if (imageAttachment) embed.setImage(`attachment://${imageAttachment.filename}`);
    // XP awards (actor + partner)
    try {
      const baseXp = success ? xpOnSuccess : xpOnFail; // give is always success, but keep consistent
      await awardXp(interaction.user.id, baseXp);
      if (cible && cible.id !== interaction.user.id && partnerXpShare > 0) {
        await awardXp(cible.id, Math.round(baseXp * partnerXpShare));
      }
    } catch (_) {}
    const parts = [String(cible)];
    if (imageLinkForContent) parts.push(imageLinkForContent);
    const content = parts.filter(Boolean).join('\n') || undefined;
    return respondAndUntrack({ content, embeds: [embed], files: imageAttachment ? [imageAttachment.attachment] : undefined });
  }
  if (actionKey === 'steal') {
    const cible = interaction.options.getUser('membre', true);
    if (cible?.bot) return respondAndUntrack({ content: '⛔ Vous ne pouvez pas voler un bot.', ephemeral: true });
    const tu = await getEconomyUser(interaction.guild.id, cible.id);
    if (success) {
      const canSteal = Math.max(0, Math.min(Number(conf.moneyMax||0), tu.amount||0));
      const got = randInt(Math.min(Number(conf.moneyMin||0), canSteal), canSteal);
      tu.amount = Math.max(0, (tu.amount||0) - got);
      u.amount = (u.amount||0) + got;
      // Karma on success
      let stealKarmaField = null;
      if (conf.karma === 'charm' && Number(conf.karmaDelta||0) !== 0) { u.charm = (u.charm||0) + Number(conf.karmaDelta||0); stealKarmaField = ['Karma charme', `+${Number(conf.karmaDelta||0)}`]; }
      else if (conf.karma === 'perversion' && Number(conf.karmaDelta||0) !== 0) { u.perversion = (u.perversion||0) + Number(conf.karmaDelta||0); stealKarmaField = ['Karma perversion', `+${Number(conf.karmaDelta||0)}`]; }
      setCd('steal', cdToSet);
      await setEconomyUser(interaction.guild.id, interaction.user.id, u);
      await setEconomyUser(interaction.guild.id, cible.id, tu);
      const currency = eco.currency?.name || 'BAG$';
      const desc = msgText ? `${msgText}\nVous avez volé ${got} ${currency} à ${cible}.` : `Vous avez volé ${got} ${currency} à ${cible}.`;
      const fields = [
        { name: 'Argent', value: `+${got} ${currency}`, inline: true },
        { name: 'Solde argent', value: String(u.amount), inline: true },
        ...(stealKarmaField ? [{ name: 'Karma', value: `${stealKarmaField[0].toLowerCase().includes('perversion') ? 'Perversion' : 'Charme'} ${stealKarmaField[1]}`, inline: true }] : []),
        { name: 'Solde charme', value: String(u.charm||0), inline: true },
        { name: 'Solde perversion', value: String(u.perversion||0), inline: true },
      ];
      const embed = buildEcoEmbed({ title: 'Vol réussi', description: desc, fields });
      if (imageUrl && imageIsDirect) embed.setImage(imageUrl);
      else if (imageAttachment) embed.setImage(`attachment://${imageAttachment.filename}`);
      // XP awards (actor + partner if applicable — not used for steal)
      try {
        await awardXp(interaction.user.id, xpOnSuccess);
      } catch (_) {}
      {
        const parts = [String(cible)];
        if (imageLinkForContent) parts.push(imageLinkForContent);
        const content = parts.filter(Boolean).join('\n') || undefined;
        return respondAndUntrack({ content, embeds: [embed], files: imageAttachment ? [imageAttachment.attachment] : undefined, ephemeral: true });
      }
    } else {
      const lost = randInt(Number(conf.failMoneyMin||0), Number(conf.failMoneyMax||0));
      u.amount = Math.max(0, (u.amount||0) - lost);
      tu.amount = (tu.amount||0) + lost;
      // Karma on fail
      let stealKarmaField = null;
      if (conf.karma === 'charm' && Number(conf.failKarmaDelta||0) !== 0) { u.charm = (u.charm||0) - Number(conf.failKarmaDelta||0); stealKarmaField = ['Karma charme', `-${Number(conf.failKarmaDelta||0)}`]; }
      else if (conf.karma === 'perversion' && Number(conf.failKarmaDelta||0) !== 0) { u.perversion = (u.perversion||0) + Number(conf.failKarmaDelta||0); stealKarmaField = ['Karma perversion', `+${Number(conf.failKarmaDelta||0)}`]; }
      setCd('steal', cdToSet);
      await setEconomyUser(interaction.guild.id, interaction.user.id, u);
      await setEconomyUser(interaction.guild.id, cible.id, tu);
      const currency = eco.currency?.name || 'BAG$';
      const desc = msgText ? `${msgText}\nVous avez été repéré par ${cible} et perdu ${lost} ${currency}.` : `Vous avez été repéré par ${cible} et perdu ${lost} ${currency}.`;
      const fields = [
        { name: 'Argent', value: `-${lost} ${currency}`, inline: true },
        { name: 'Solde argent', value: String(u.amount), inline: true },
        ...(stealKarmaField ? [{ name: 'Karma', value: `${stealKarmaField[0].toLowerCase().includes('perversion') ? 'Perversion' : 'Charme'} ${stealKarmaField[1]}`, inline: true }] : []),
        { name: 'Solde charme', value: String(u.charm||0), inline: true },
        { name: 'Solde perversion', value: String(u.perversion||0), inline: true },
      ];
      const embed = buildEcoEmbed({ title: 'Vol raté', description: desc, fields });
      if (imageUrl && imageIsDirect) embed.setImage(imageUrl);
      else if (imageAttachment) embed.setImage(`attachment://${imageAttachment.filename}`);
      try {
        await awardXp(interaction.user.id, xpOnFail);
      } catch (_) {}
      {
        const parts = [String(cible)];
        if (imageLinkForContent) parts.push(imageLinkForContent);
        const content = parts.filter(Boolean).join('\n') || undefined;
        return respondAndUntrack({ content, embeds: [embed], files: imageAttachment ? [imageAttachment.attachment] : undefined });
      }
    }
  }
  // Generic flow
  u.amount = Math.max(0, (u.amount||0) + moneyDelta);
  setCd(actionKey, cdToSet);
  await setEconomyUser(interaction.guild.id, interaction.user.id, u);
  // XP awards (actor + partner/complice if present)
  try {
    const baseXp = success ? xpOnSuccess : xpOnFail;
    await awardXp(interaction.user.id, baseXp);
    let partnerUser = null;
    if (actionsWithTarget.includes(actionKey)) {
      partnerUser = actionKey === 'tromper' ? (tromperResolvedPartner || interaction.options.getUser('cible', false)) : interaction.options.getUser('cible', false);
    } else if (actionKey === 'crime') {
      partnerUser = interaction.options.getUser('complice', false);
    }
    if (partnerUser && !partnerUser.bot && partnerUser.id !== interaction.user.id && partnerXpShare > 0) {
      await awardXp(partnerUser.id, Math.round(baseXp * partnerXpShare));
    }
  } catch (_) {}
  const nice = actionKeyToLabel(actionKey);
  const title = success ? `Action réussie — ${nice}` : `Action échouée — ${nice}`;
  const currency = eco.currency?.name || 'BAG$';
  const desc = msgText || (success ? `Gain: ${moneyDelta} ${currency}` : `Perte: ${Math.abs(moneyDelta)} ${currency}`);
  // Partner rewards (cible/complice)
  let partnerField = null;
  if (success) {
    try {
      let partnerUser = null;
      if (actionsWithTarget.includes(actionKey)) {
        partnerUser = actionKey === 'tromper' ? (tromperResolvedPartner || interaction.options.getUser('cible', false)) : interaction.options.getUser('cible', false);
      } else if (actionKey === 'crime') {
        partnerUser = interaction.options.getUser('complice', false);
      }
      if (partnerUser && !partnerUser.bot && partnerUser.id !== interaction.user.id) {
        const pMoneyShare = Number(conf.partnerMoneyShare || 0);
        const pKarmaShare = Number(conf.partnerKarmaShare || 0);
        const partnerMoneyGain = Math.max(0, Math.round(Math.max(0, moneyDelta) * (isFinite(pMoneyShare) ? pMoneyShare : 0)));
        const partner = await getEconomyUser(interaction.guild.id, partnerUser.id);
        let partnerKarmaText = '';
        if (conf.karma === 'charm') {
          const kd = Math.max(0, Math.round(Number(conf.karmaDelta||0) * (isFinite(pKarmaShare) ? pKarmaShare : 0)));
          if (kd > 0) { partner.charm = (partner.charm||0) + kd; partnerKarmaText = `, Charme +${kd}`; }
        } else if (conf.karma === 'perversion') {
          const kd = Math.max(0, Math.round(Number(conf.karmaDelta||0) * (isFinite(pKarmaShare) ? pKarmaShare : 0)));
          if (kd > 0) { partner.perversion = (partner.perversion||0) + kd; partnerKarmaText = `, Perversion +${kd}`; }
        }
        if (partnerMoneyGain > 0) partner.amount = Math.max(0, (partner.amount||0) + partnerMoneyGain);
        await setEconomyUser(interaction.guild.id, partnerUser.id, partner);
        if (partnerMoneyGain > 0 || partnerKarmaText) {
          const value = `${partnerUser} → ${partnerMoneyGain > 0 ? `+${partnerMoneyGain} ${currency}` : ''}${partnerKarmaText}`.trim();
          partnerField = { name: 'Partenaire récompenses', value, inline: false };
        }
      }
    } catch (_) {}
  }
  const moneyField = { name: 'Argent', value: `${moneyDelta >= 0 ? '+' : '-'}${Math.abs(moneyDelta)} ${currency}`, inline: true };
  const fields = [
    moneyField,
    { name: 'Solde argent', value: String(u.amount), inline: true },
    ...(karmaField ? [{ name: 'Karma', value: `${karmaField[0].toLowerCase().includes('perversion') ? 'Perversion' : 'Charme'} ${karmaField[1]}`, inline: true }] : []),
    ...(partnerField ? [partnerField] : []),
    ...(global.__eco_tromper_third ? [global.__eco_tromper_third] : []),
    ...(global.__eco_orgie_participants ? [global.__eco_orgie_participants] : []),
    { name: 'Solde charme', value: String(u.charm||0), inline: true },
    { name: 'Solde perversion', value: String(u.perversion||0), inline: true },
  ];
  const embed = buildEcoEmbed({ title, description: desc, fields });
  if (imageUrl && imageIsDirect) embed.setImage(imageUrl);
  else if (imageAttachment) embed.setImage(`attachment://${imageAttachment.filename}`);
  const parts = [initialPartner ? String(initialPartner) : undefined];
  if (imageLinkForContent) parts.push(imageLinkForContent);
  const content = parts.filter(Boolean).join('\n') || undefined;
  try { delete global.__eco_tromper_third; } catch (_) {}
  try { delete global.__eco_orgie_participants; } catch (_) {}
  
  // Final safety check to ensure interaction is always responded to
  try {
    return await respondAndUntrack({ content, embeds: [embed], files: imageAttachment ? [imageAttachment.attachment] : undefined }, false);
  } catch (error) {
    console.error(`[Economy] Failed to respond to ${actionKey} interaction:`, error.message);
    // Last resort: try followUp if possible
    try {
      if (!interaction.replied) {
        return await respondAndUntrack({ 
          content: `⚠️ Action ${actionKey} terminée mais erreur d'affichage.`, 
          ephemeral: true 
        }, true);
      }
    } catch (_) {
      console.error(`[Economy] Complete failure to respond to ${actionKey} interaction`);
    } finally {
      try { untrackInteraction(interaction); } catch (_) {}
    }
  }
  } catch (mainError) {
    console.error(`[Economy] Critical error in handleEconomyAction for ${actionKey}:`, mainError);
    try {
      return await respondAndUntrack({ 
        content: `❌ Erreur lors de l'exécution de l'action ${actionKey}.`, 
        ephemeral: true 
      });
    } catch (err) {
      console.error(`[Economy] Could not even send error message for ${actionKey}:`, err?.message || err);
      try { untrackInteraction(interaction); } catch (_) {}
    }
  }
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
      { label: 'Tickets', value: 'tickets', description: 'Configurer les tickets' },
      { label: 'Booster', value: 'booster', description: 'Récompenses boosters de serveur' },
      { label: 'Action/Vérité', value: 'truthdare', description: 'Configurer le jeu' },
      { label: 'Confessions', value: 'confess', description: 'Configurer les confessions anonymes' },
      { label: 'AutoThread', value: 'autothread', description: 'Créer des fils automatiquement' },
      { label: 'Comptage', value: 'counting', description: 'Configurer le salon de comptage' },
      { label: 'Logs', value: 'logs', description: "Configurer les journaux d'activité" },
    );
  
  // Add diagnostic button for troubleshooting
  const diagBtn = new ButtonBuilder()
    .setCustomId('config_economy_diagnostic')
    .setLabel('🔧 Diagnostic Économie')
    .setStyle(ButtonStyle.Secondary);
    
  const row1 = new ActionRowBuilder().addComponents(select);
  const row2 = new ActionRowBuilder().addComponents(diagBtn);
  return [row1, row2];
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
  const canEnable = Boolean(ak?.roleId) && Number.isFinite(ak?.delayMs) && ak.delayMs >= MIN_DELAY_MS && ak.delayMs <= MAX_DELAY_MS;
  const enableBtn = new ButtonBuilder().setCustomId('autokick_enable').setLabel('Activer AutoKick').setStyle(ButtonStyle.Success).setDisabled(ak.enabled || !canEnable);
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
    new ButtonBuilder().setCustomId('levels_page:cards').setLabel('Cartes').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('levels_page:rewards').setLabel('Récompenses').setStyle(ButtonStyle.Secondary)
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
    new ButtonBuilder().setCustomId('levels_page:cards').setLabel('Cartes').setStyle(ButtonStyle.Primary).setDisabled(true),
    new ButtonBuilder().setCustomId('levels_page:rewards').setLabel('Récompenses').setStyle(ButtonStyle.Secondary)
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
  const nav = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('levels_page:general').setLabel('Réglages').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('levels_page:cards').setLabel('Cartes').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('levels_page:rewards').setLabel('Récompenses').setStyle(ButtonStyle.Primary).setDisabled(true)
  );
  const addRole = new RoleSelectMenuBuilder()
    .setCustomId('levels_reward_add_role')
    .setPlaceholder('Choisir le rôle à associer à un niveau…')
    .setMinValues(1)
    .setMaxValues(1);
  const options = Object.entries(levels.rewards || {})
    .map(([lvlStr, rid]) => {
      const role = guild.roles.cache.get(rid);
      return { label: `Niveau ${lvlStr} → ${role ? role.name : rid}`, value: String(lvlStr) };
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
  return [nav, new ActionRowBuilder().addComponents(addRole), new ActionRowBuilder().addComponents(removeSelect)];
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
  // If no image configured, return null to trigger prestige default rendering
  if (!memberOrMention || !memberOrMention.roles) return bgs.default || null;
  const femaleIds = new Set(levels.cards?.femaleRoleIds || []);
  const certIds = new Set(levels.cards?.certifiedRoleIds || []);
  const hasFemale = memberOrMention.roles.cache?.some(r => femaleIds.has(r.id));
  const hasCert = memberOrMention.roles.cache?.some(r => certIds.has(r.id));
  if (hasFemale && hasCert) return bgs.certified || bgs.female || bgs.default || null;
  if (hasFemale) return bgs.female || bgs.default || null;
  if (hasCert) return bgs.certified || bgs.default || null;
  return bgs.default || null;
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

function memberHasFemaleRole(memberOrMention, levels) {
  try {
    const femaleIds = new Set(Array.isArray(levels?.cards?.femaleRoleIds) ? levels.cards.femaleRoleIds : []);
    return Boolean(memberOrMention?.roles?.cache?.some(r => femaleIds.has(r.id)));
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
// Helpers for prestige framing and icons
// Font helpers (Cinzel + Cormorant Garamond)
const FONTS_DIR = path2.join(process.cwd(), 'assets', 'fonts');
const CINZEL_URLS = [
  'https://github.com/google/fonts/raw/main/ofl/cinzel/Cinzel%5Bwght%5D.ttf',
  'https://github.com/google/fonts/raw/main/ofl/cinzel/Cinzel-VariableFont_wght.ttf',
  'https://github.com/google/fonts/raw/main/ofl/cinzel/Cinzel-Regular.ttf'
];
const CORMORANT_URLS = [
  'https://github.com/google/fonts/raw/main/ofl/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf',
  'https://github.com/google/fonts/raw/main/ofl/cormorantgaramond/CormorantGaramond-VariableFont_wght.ttf',
  'https://github.com/google/fonts/raw/main/ofl/cormorantgaramond/CormorantGaramond-Regular.ttf'
];
async function ensureDir(p) { try { await fs2.promises.mkdir(p, { recursive: true }); } catch (_) {} }
async function downloadFirstAvailable(urls, destPath) {
  await ensureDir(path2.dirname(destPath));
  try { await fs2.promises.access(destPath); return destPath; } catch (_) {}
  let lastErr = null;
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (!r.ok) { lastErr = new Error(String(r.status)); continue; }
      const ab = await r.arrayBuffer();
      await fs2.promises.writeFile(destPath, Buffer.from(ab));
      return destPath;
    } catch (e) { lastErr = e; }
  }
  if (lastErr) throw lastErr;
  return destPath;
}
let prestigeFontsReady = false;
async function ensurePrestigeFonts() {
  if (prestigeFontsReady) return true;
  try {
    const cinzelPath = path2.join(FONTS_DIR, 'Cinzel.ttf');
    const cormPath = path2.join(FONTS_DIR, 'CormorantGaramond.ttf');
    await downloadFirstAvailable(CINZEL_URLS, cinzelPath).catch(()=>{});
    await downloadFirstAvailable(CORMORANT_URLS, cormPath).catch(()=>{});
    try { if (fs2.existsSync(cinzelPath)) GlobalFonts.registerFromPath(cinzelPath, 'Cinzel'); } catch (_) {}
    try { if (fs2.existsSync(cormPath)) GlobalFonts.registerFromPath(cormPath, 'Cormorant Garamond'); } catch (_) {}
    prestigeFontsReady = true;
  } catch (_) { /* continue with system serif fallback */ }
  return true;
}
function getGoldPalette(variant = 'gold') {
  return variant === 'rosegold'
    ? { light: '#F6C2D2', mid: '#E6A2B8', dark: '#B76E79' }
    : { light: '#FFEEC7', mid: '#FFD700', dark: '#B8860B' };
}
function strokeGoldRect(ctx, x, y, w, h, weight, variant = 'gold') {
  const p = getGoldPalette(variant);
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, p.light);
  grad.addColorStop(0.5, p.mid);
  grad.addColorStop(1, p.dark);
  ctx.save();
  ctx.lineWidth = weight;
  ctx.strokeStyle = grad;
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = Math.max(2, Math.round(weight * 1.2));
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}
function drawCrown(ctx, cx, cy, size, variant = 'gold') {
  const p = getGoldPalette(variant);
  const grad = ctx.createLinearGradient(cx, cy - size, cx, cy + size);
  grad.addColorStop(0, p.light);
  grad.addColorStop(0.5, p.mid);
  grad.addColorStop(1, p.dark);
  const w = size * 1.6;
  const h = size;
  const x = cx - w/2;
  const y = cy - h/2;
  ctx.save();
  ctx.beginPath();
  // base
  ctx.moveTo(x, y + h*0.8);
  ctx.lineTo(x + w, y + h*0.8);
  // spikes
  const spikeW = w/3;
  ctx.lineTo(x + w - spikeW*0.5, y + h*0.2);
  ctx.lineTo(x + w - spikeW*1.5, y + h*0.6);
  ctx.lineTo(x + spikeW*1.5, y + h*0.2);
  ctx.lineTo(x + spikeW*0.5, y + h*0.6);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = Math.max(1, Math.round(size*0.08));
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
function drawDiamond(ctx, cx, cy, size, variant = 'gold') {
  const p = getGoldPalette(variant);
  const grad = ctx.createLinearGradient(cx, cy - size, cx, cy + size);
  grad.addColorStop(0, p.light);
  grad.addColorStop(0.5, p.mid);
  grad.addColorStop(1, p.dark);
  const x = cx, y = cy, s = size;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.lineTo(x + s, y);
  ctx.lineTo(x, y + s);
  ctx.lineTo(x - s, y);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = Math.max(1, Math.round(size*0.1));
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
function drawImageCover(ctx, img, width, height) {
  const iw = img.width || 1, ih = img.height || 1;
  const ir = iw / ih;
  const r = width / height;
  let dw, dh, dx, dy;
  if (ir > r) { // image is wider
    dh = height;
    dw = Math.ceil(dh * ir);
    dx = Math.floor((width - dw) / 2);
    dy = 0;
  } else {
    dw = width;
    dh = Math.ceil(dw / ir);
    dx = 0;
    dy = Math.floor((height - dh) / 2);
  }
  ctx.drawImage(img, dx, dy, dw, dh);
}
async function drawCertifiedCard(options) {
  const { backgroundUrl, name, sublines, footerLines, logoUrl, useRoseGold, isCertified } = options;
  try {
    await ensurePrestigeFonts();
    const width = 1920, height = 1080;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    // Background (darkened, barely visible)
    try {
      const entry = await getCachedImage(backgroundUrl);
      if (entry) {
        drawImageCover(ctx, entry.img, width, height);
        ctx.fillStyle = 'rgba(0,0,0,0.78)';
        ctx.fillRect(0, 0, width, height);
      } else {
        const bg = ctx.createLinearGradient(0, 0, 0, height);
        bg.addColorStop(0, '#0b0b0b');
        bg.addColorStop(1, '#121212');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);
      }
    } catch (_) {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, width, height);
    }
    // Vignette
    const grd = ctx.createRadialGradient(width/2, height/2, Math.min(width,height)/6, width/2, height/2, Math.max(width,height)/1.05);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, width, height);
    // Double border (exact spacing like reference)
    const outerPad = 20;
    const innerPad = 40;
    strokeGoldRect(ctx, outerPad, outerPad, width - outerPad*2, height - outerPad*2, 4, useRoseGold?'rosegold':'gold');
    strokeGoldRect(ctx, outerPad + innerPad, outerPad + innerPad, width - (outerPad + innerPad)*2, height - (outerPad + innerPad)*2, 2, useRoseGold?'rosegold':'gold');
    // Crowns top corners
    const crownSize = 70;
    drawCrown(ctx, outerPad + 80, outerPad + 18 + crownSize/2, crownSize, useRoseGold?'rosegold':'gold');
    drawCrown(ctx, width - (outerPad + 80), outerPad + 18 + crownSize/2, crownSize, useRoseGold?'rosegold':'gold');
    // Diamonds bottom corners
    drawDiamond(ctx, 120, height - 70, 20, useRoseGold?'rosegold':'gold');
    drawDiamond(ctx, width - 120, height - 70, 20, useRoseGold?'rosegold':'gold');
    // Center medallion + logo (with graceful fallback when no image configured)
    {
      const medSize = 520;
      const cx = Math.floor(width/2), cy = 720;
      // Outer ring
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, medSize/2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.strokeStyle = getGoldPalette(useRoseGold?'rosegold':'gold').mid;
      ctx.lineWidth = 18;
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.restore();

      let drewLogo = false;
      if (logoUrl) {
        const lg = await getCachedImage(logoUrl);
        if (lg) {
          const s = medSize - 60;
          const x = cx - Math.floor(s/2);
          const y = cy - Math.floor(s/2);
          ctx.drawImage(lg.img, x, y, s, s);
          drewLogo = true;
        }
      }
      if (!drewLogo) {
        // Inner thin ring
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, (medSize-60)/2, 0, Math.PI*2);
        ctx.closePath();
        ctx.lineWidth = 6;
        ctx.strokeStyle = getGoldPalette(useRoseGold?'rosegold':'gold').mid;
        ctx.stroke();
        ctx.restore();
        // Fallback initials "BAG" styled in gold
        const serifCinzelLocal = GlobalFonts.has?.('Cinzel') ? '"Cinzel"' : 'Georgia, "Times New Roman", Serif';
        const sMax = Math.floor((medSize-90));
        const bagSize = fitText(ctx, 'BAG', sMax, 200, serifCinzelLocal);
        ctx.font = `700 ${bagSize}px ${serifCinzelLocal}`;
        applyGoldStyles(ctx, cx, cy + 6, 'BAG', sMax, bagSize, useRoseGold?'rosegold':'gold');
      }
    }
    // Typography
    const serifCinzel = GlobalFonts.has?.('Cinzel') ? '"Cinzel"' : 'Georgia, "Times New Roman", Serif';
    const serifCorm = GlobalFonts.has?.('Cormorant Garamond') ? '"Cormorant Garamond"' : 'Georgia, "Times New Roman", Serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Title
    const baseTitle = isCertified ? 'ANNONCE DE PRESTIGE' : 'ANNONCE DE PRESTIGE';
    const mainTitle = isCertified ? `♕ ${baseTitle} ♕` : baseTitle;
    let size = fitText(ctx, mainTitle, Math.floor(width*0.9), 110, serifCinzel);
    ctx.font = `700 ${size}px ${serifCinzel}`;
    applyGoldStyles(ctx, Math.floor(width/2), 160, mainTitle, Math.floor(width*0.9), size, useRoseGold?'rosegold':'gold');
    // Name
    size = fitText(ctx, String(name||''), Math.floor(width*0.85), 78, serifCinzel);
    ctx.font = `700 ${size}px ${serifCinzel}`;
    applyGoldStyles(ctx, Math.floor(width/2), 320, String(name||''), Math.floor(width*0.85), size, useRoseGold?'rosegold':'gold');
    // Subtitle
    let s2 = fitText(ctx, 'vient de franchir un nouveau cap !', Math.floor(width*0.85), 46, serifCorm);
    ctx.font = `600 ${s2}px ${serifCorm}`;
    applyGoldStyles(ctx, Math.floor(width/2), 390, 'vient de franchir un nouveau cap !', Math.floor(width*0.85), s2, useRoseGold?'rosegold':'gold');
    // Level and distinction
    const lines = Array.isArray(sublines)?sublines:[];
    const levelLine = lines.find(l => String(l||'').toLowerCase().startsWith('niveau')) || '';
    const roleLine = lines.find(l => String(l||'').toLowerCase().startsWith('dernière')) || '';
    s2 = fitText(ctx, levelLine, Math.floor(width*0.85), 64, serifCinzel);
    ctx.font = `700 ${s2}px ${serifCinzel}`;
    applyGoldStyles(ctx, Math.floor(width/2), 470, levelLine, Math.floor(width*0.85), s2, useRoseGold?'rosegold':'gold');
    s2 = fitText(ctx, roleLine, Math.floor(width*0.85), 54, serifCorm);
    ctx.font = `700 ${s2}px ${serifCorm}`;
    applyGoldStyles(ctx, Math.floor(width/2), 540, roleLine, Math.floor(width*0.85), s2, useRoseGold?'rosegold':'gold');
    // Footer
    const footer = Array.isArray(footerLines) && footerLines.length ? footerLines : [
      'Félicitations !',
      isCertified ? '💎 continue ton ascension vers les récompenses ultimes 💎' : '💎 CONTINUE TON ASCENSION VERS LES RÉCOMPENSES ULTIMES 💎',
    ];
    let fy = 865;
    const fSizes = [80, 40];
    for (let i=0;i<Math.min(footer.length,2);i++) {
      const txt = String(footer[i]||'');
      const fsz = fitText(ctx, txt, Math.floor(width*0.9), fSizes[i], serifCinzel);
      ctx.font = `${i===0?700:600} ${fsz}px ${serifCinzel}`;
      applyGoldStyles(ctx, Math.floor(width/2), fy, txt, Math.floor(width*0.9), fsz, useRoseGold?'rosegold':'gold');
      fy += Math.floor(fsz*1.2);
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
  console.log('[Announce] Tentative d\'annonce de niveau:', { guildId: guild.id, newLevel, enabled: levels.announce?.levelUp?.enabled, channelId: levels.announce?.levelUp?.channelId });
  const ann = levels.announce?.levelUp || {};
  if (!ann.enabled || !ann.channelId) {
    console.log('[Announce] Annonce de niveau désactivée ou canal manquant');
    return;
  }
  const channel = guild.channels.cache.get(ann.channelId);
  if (!channel || !channel.isTextBased?.()) {
    console.log('[Announce] Canal d\'annonce de niveau introuvable ou invalide');
    return;
  }
  console.log('[Announce] Canal d\'annonce de niveau trouvé:', channel.name);
  const name = memberDisplayName(guild, memberOrMention, memberOrMention?.id);
  const mention = memberOrMention?.id ? `<@${memberOrMention.id}>` : '';
  const lastReward = getLastRewardForLevel(levels, newLevel);
  const roleName = lastReward ? (guild.roles.cache.get(lastReward.roleId)?.name || `Rôle ${lastReward.roleId}`) : null;
  const bg = chooseCardBackgroundForMember(memberOrMention, levels);
  const sub = [
    'Vient de franchir un nouveau cap !',
    `Niveau atteint : ${String(newLevel)}`,
    `Dernière distinction : ${roleName || '—'}`
  ];
  const isCert = memberHasCertifiedRole(memberOrMention, levels);
  const isFemale = memberHasFemaleRole(memberOrMention, levels);
  if (isCert) {
    const { renderLevelCardLandscape } = require('./level-landscape');
    renderLevelCardLandscape({
      memberName: name,
      level: newLevel,
      roleName: roleName || '—',
      logoUrl: (CERTIFIED_LOGO_URL || LEVEL_CARD_LOGO_URL || undefined),
      isCertified: true,
    }).then((img) => {
      if (img) channel.send({ content: `${mention}`, files: [{ attachment: img, name: 'levelup.png' }] }).catch(() => {});
      else channel.send({ content: `🎉 ${mention || name} passe niveau ${newLevel} !` }).catch(() => {});
    });
    return;
  }
  if (isFemale) {
    const { renderPrestigeCardRoseGoldLandscape } = require('./prestige-rose-gold-landscape');
    renderPrestigeCardRoseGoldLandscape({
      memberName: name,
      level: newLevel,
      lastRole: roleName || '—',
      logoUrl: CERTIFIED_LOGO_URL || LEVEL_CARD_LOGO_URL || undefined,
      bgLogoUrl: CERTIFIED_LOGO_URL || LEVEL_CARD_LOGO_URL || undefined,
    }).then((img) => {
      if (img) channel.send({ content: `${mention}`, files: [{ attachment: img, name: 'levelup.png' }] }).catch(() => {});
      else channel.send({ content: `🎉 ${mention || name} passe niveau ${newLevel} !` }).catch(() => {});
    });
    return;
  }
  {
    const { renderPrestigeCardBlueLandscape } = require('./prestige-blue-landscape');
    renderPrestigeCardBlueLandscape({
      memberName: name,
      level: newLevel,
      lastRole: roleName || '—',
      logoUrl: LEVEL_CARD_LOGO_URL || undefined,
      bgLogoUrl: LEVEL_CARD_LOGO_URL || undefined,
    }).then((img) => {
      if (img) channel.send({ content: `${mention}`, files: [{ attachment: img, name: 'levelup.png' }] }).catch(() => {});
      else channel.send({ content: `🎉 ${mention || name} passe niveau ${newLevel} !` }).catch(() => {});
    });
  }
}
function maybeAnnounceRoleAward(guild, memberOrMention, levels, roleId) {
  console.log('[Announce] Tentative d\'annonce de rôle récompense:', { guildId: guild.id, roleId, enabled: levels.announce?.roleAward?.enabled, channelId: levels.announce?.roleAward?.channelId });
  const ann = levels.announce?.roleAward || {};
  if (!ann.enabled || !ann.channelId || !roleId) {
    console.log('[Announce] Annonce de rôle désactivée, canal manquant ou roleId manquant');
    return;
  }
  const channel = guild.channels.cache.get(ann.channelId);
  if (!channel || !channel.isTextBased?.()) {
    console.log('[Announce] Canal d\'annonce de rôle introuvable ou invalide');
    return;
  }
  console.log('[Announce] Canal d\'annonce de rôle trouvé:', channel.name);
  const roleName = guild.roles.cache.get(roleId)?.name || `Rôle ${roleId}`;
  const name = memberDisplayName(guild, memberOrMention, memberOrMention?.id);
  const mention = memberOrMention?.id ? `<@${memberOrMention.id}>` : '';
  const bg = chooseCardBackgroundForMember(memberOrMention, levels);
  const sub = [ `Nouvelle distinction : ${roleName}` ];
  const isCert = memberHasCertifiedRole(memberOrMention, levels);
  const isFemale = memberHasFemaleRole(memberOrMention, levels);
  if (isCert) {
    const { renderLevelCardLandscape } = require('./level-landscape');
    renderLevelCardLandscape({
      memberName: name,
      level: 0,
      roleName: roleName || '—',
      logoUrl: (CERTIFIED_LOGO_URL || LEVEL_CARD_LOGO_URL || undefined),
      isCertified: true,
      isRoleAward: true,
    }).then((img) => {
      if (img) channel.send({ content: `${mention}`, files: [{ attachment: img, name: 'role.png' }] }).catch(() => {});
      else channel.send({ content: `Félicitations !\nTu as obtenue le rôle\n(${roleName})` }).catch(() => {});
    });
    return;
  }
  if (isFemale) {
    const { renderPrestigeCardRoseGoldLandscape } = require('./prestige-rose-gold-landscape');
    renderPrestigeCardRoseGoldLandscape({
      memberName: name,
      level: 0,
      lastRole: roleName,
      logoUrl: CERTIFIED_LOGO_URL || LEVEL_CARD_LOGO_URL || undefined,
      bgLogoUrl: CERTIFIED_LOGO_URL || LEVEL_CARD_LOGO_URL || undefined,
      isRoleAward: true,
    }).then((img) => {
      if (img) channel.send({ content: `${mention}`, files: [{ attachment: img, name: 'role.png' }] }).catch(() => {});
      else channel.send({ content: `Félicitations !\nTu as obtenue le rôle\n(${roleName})` }).catch(() => {});
    });
    return;
  }
  {
    const { renderPrestigeCardBlueLandscape } = require('./prestige-blue-landscape');
    renderPrestigeCardBlueLandscape({
      memberName: name,
      level: 0,
      lastRole: roleName,
      logoUrl: LEVEL_CARD_LOGO_URL || undefined,
      bgLogoUrl: LEVEL_CARD_LOGO_URL || undefined,
      isRoleAward: true,
    }).then((img) => {
      if (img) channel.send({ content: `${mention}`, files: [{ attachment: img, name: 'role.png' }] }).catch(() => {});
      else channel.send({ content: `Félicitations !\nTu as obtenue le rôle\n(${roleName})` }).catch(() => {});
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

async function buildTopEconomieEmbed(guild, entriesSorted, offset, limit) {
  const slice = entriesSorted.slice(offset, offset + limit);
  const formatNum = (n) => (Number(n) || 0).toLocaleString('fr-FR');
  const medalFor = (i) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`);
  const eco = await getEconomyConfig(guild.id);
  const currency = eco.currency?.name || 'BAG$';
  const symbol = eco.currency?.symbol || '🪙';
  
  const lines = await Promise.all(slice.map(async ([uid, st], idx) => {
    const rank = offset + idx;
    const mem = guild.members.cache.get(uid) || await guild.members.fetch(uid).catch(() => null);
    const display = mem ? (mem.nickname || mem.user.username) : `<@${uid}>`;
    const amount = formatNum(st.amount || 0);
    const charm = st.charm || 0;
    const perv = st.perversion || 0;
    return `${medalFor(rank)} **${display}** • ${amount} ${symbol} • 🫦 ${charm} • 😈 ${perv}`;
  }));
  
  const color = pickThemeColorForGuild(guild);
  const total = entriesSorted.length;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: `${guild.name} • Classement Économie`, iconURL: guild.iconURL?.() || undefined })
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
  const prevBtn = new ButtonBuilder().setCustomId(`top_economie_page:${prevOffset}:${limit}`).setLabel('⟨ Précédent').setStyle(ButtonStyle.Secondary).setDisabled(!hasPrev);
  const nextBtn = new ButtonBuilder().setCustomId(`top_economie_page:${nextOffset}:${limit}`).setLabel('Suivant ⟩').setStyle(ButtonStyle.Primary).setDisabled(!hasNext);
  row.addComponents(prevBtn, nextBtn);
  components.push(row);

  return { embed, components };
}

// Add Economy config UI (basic Settings page)
async function buildEconomySettingsRows(guild) {
  const eco = await getEconomyConfig(guild.id);
  const curBtn = new ButtonBuilder().setCustomId('economy_set_currency').setLabel(`Devise: ${eco.currency?.symbol || '🪙'} ${eco.currency?.name || 'BAG$'}`).setStyle(ButtonStyle.Secondary);
  const gifsBtn = new ButtonBuilder().setCustomId('economy_gifs').setLabel('GIF actions').setStyle(ButtonStyle.Primary);
  
  // Boutons pour l'argent gagné par message et en vocal
  const messageMin = eco.rewards?.message?.min || 1;
  const messageMax = eco.rewards?.message?.max || 3;
  const voiceMin = eco.rewards?.voice?.min || 2;
  const voiceMax = eco.rewards?.voice?.max || 5;
  
  const msgMoneyBtn = new ButtonBuilder().setCustomId('economy_message_money').setLabel(`Argent texte: ${messageMin}-${messageMax}`).setStyle(ButtonStyle.Success);
  const voiceMoneyBtn = new ButtonBuilder().setCustomId('economy_voice_money').setLabel(`Argent vocal: ${voiceMin}-${voiceMax}`).setStyle(ButtonStyle.Success);
  
  const row1 = new ActionRowBuilder().addComponents(curBtn, gifsBtn);
  const row2 = new ActionRowBuilder().addComponents(msgMoneyBtn, voiceMoneyBtn);
  return [row1, row2];
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
  try {
    // Validate guild parameter
    if (!guild || !guild.id) {
      throw new Error('Invalid guild parameter in buildEconomyMenuRows');
    }
    
    const p = page || 'settings';
    
    // Initialize caches
    initializeEconomyCaches();
    
    if (p === 'karma') {
      const rows = await buildEconomyKarmaRows(guild);
      return [...rows];
    }
    if (p === 'actions') {
      const sel = client._ecoActionCurrent.get(guild.id) || null;
      const rows = await buildEconomyActionDetailRows(guild, sel);
      return [buildEconomyMenuSelect(p), ...rows];
    }
    // default: settings
    const rows = await buildEconomySettingsRows(guild);
    return [buildEconomyMenuSelect('settings'), ...rows];
  } catch (error) {
    console.error('[Economy] Failed to build menu rows:', error.message);
    console.error('[Economy] Stack trace:', error.stack);
    
    // Return fallback menu with error indication
    const errorRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('config_back_home')
        .setLabel('❌ Erreur - Retour')
        .setStyle(ButtonStyle.Danger)
    );
    return [buildEconomyMenuSelect('settings'), errorRow];
  }
}

async function buildBoosterRows(guild) {
  const eco = await getEconomyConfig(guild.id);
  const b = eco.booster || { enabled: true, textXpMult: 2, voiceXpMult: 2, actionCooldownMult: 0.5, shopPriceMult: 0.5 };
  const toggle = new ButtonBuilder().setCustomId('booster_toggle').setLabel(b.enabled ? 'Boosters: ON' : 'Boosters: OFF').setStyle(b.enabled ? ButtonStyle.Success : ButtonStyle.Secondary);
  const textXp = new ButtonBuilder().setCustomId('booster_textxp').setLabel(`XP texte x${b.textXpMult}`).setStyle(ButtonStyle.Primary);
  const voiceXp = new ButtonBuilder().setCustomId('booster_voicexp').setLabel(`XP vocal x${b.voiceXpMult}`).setStyle(ButtonStyle.Primary);
  const cdMult = new ButtonBuilder().setCustomId('booster_cd').setLabel(`Cooldown x${b.actionCooldownMult}`).setStyle(ButtonStyle.Secondary);
  const priceMult = new ButtonBuilder().setCustomId('booster_shop').setLabel(`Prix boutique x${b.shopPriceMult}`).setStyle(ButtonStyle.Secondary);
  const row1 = new ActionRowBuilder().addComponents(toggle);
  const row2 = new ActionRowBuilder().addComponents(textXp, voiceXp, cdMult, priceMult);
  // Rôles associés aux boosters
  const addRoles = new RoleSelectMenuBuilder().setCustomId('booster_roles_add').setPlaceholder('Ajouter des rôles (boosters)').setMinValues(1).setMaxValues(25);
  const currentRoles = Array.isArray(b.roles) ? b.roles : [];
  const rolesLabel = currentRoles.length ? currentRoles.map(id => guild.roles.cache.get(id) || `<@&${id}>`).map(r => (typeof r === 'string' ? r : r.toString())).join(', ') : 'Aucun';
  const removeOpts = currentRoles.length ? currentRoles.map(id => ({ label: (guild.roles.cache.get(id)?.name || id).toString().slice(0,100), value: String(id) })) : [{ label: 'Aucun', value: 'none' }];
  const removeSelect = new StringSelectMenuBuilder().setCustomId('booster_roles_remove').setPlaceholder(`Retirer des rôles (${rolesLabel})`);
  if (currentRoles.length) removeSelect.setMinValues(1).setMaxValues(Math.min(25, currentRoles.length)).addOptions(...removeOpts);
  else removeSelect.setMinValues(0).setMaxValues(1).addOptions(...removeOpts).setDisabled(true);
  const row3 = new ActionRowBuilder().addComponents(addRoles);
  const row4 = new ActionRowBuilder().addComponents(removeSelect);
  return [row1, row2, row3, row4];
}


// Initialize and validate economy cache maps
function initializeEconomyCaches() {
  if (!client._ecoKarmaType) client._ecoKarmaType = new Map();
  if (!client._ecoKarmaSel) client._ecoKarmaSel = new Map();
  if (!client._ecoActionCurrent) client._ecoActionCurrent = new Map();
}

// Clear karma cache for a specific guild
function clearKarmaCache(guildId) {
  try {
    if (client._ecoKarmaType) client._ecoKarmaType.delete(guildId);
    if (client._ecoKarmaSel) {
      const keys = Array.from(client._ecoKarmaSel.keys()).filter(k => k.startsWith(`${guildId}:`));
      keys.forEach(k => client._ecoKarmaSel.delete(k));
    }
  } catch (error) {
    console.error('[Karma] Failed to clear cache:', error.message);
  }
}
// Validate and sanitize karma cache state
function validateKarmaCache() {
  try {
    // Clean up orphaned cache entries periodically
    if (client._ecoKarmaSel && client._ecoKarmaSel.size > 100) {
      console.log('[Karma] Cleaning up large karma selection cache');
      client._ecoKarmaSel.clear();
    }
    
    if (client._ecoKarmaType && client._ecoKarmaType.size > 100) {
      console.log('[Karma] Cleaning up large karma type cache');
      client._ecoKarmaType.clear();
    }
    
    if (client._ecoActionCurrent && client._ecoActionCurrent.size > 100) {
      console.log('[Karma] Cleaning up large action current cache');
      client._ecoActionCurrent.clear();
    }
  } catch (error) {
    console.error('[Karma] Failed to validate cache:', error.message);
  }
}

// Diagnostic function for economy/karma issues
async function diagnoseEconomyKarmaIssues(guildId) {
  try {
    console.log(`[Karma] Running diagnostic for guild ${guildId}`);
    
    // Check economy config structure
    const eco = await getEconomyConfig(guildId);
    const issues = [];
    
    if (!eco.karmaModifiers) {
      issues.push('Missing karmaModifiers structure');
    } else {
      if (!Array.isArray(eco.karmaModifiers.shop)) issues.push('Invalid shop karma modifiers');
      if (!Array.isArray(eco.karmaModifiers.actions)) issues.push('Invalid actions karma modifiers');
      if (!Array.isArray(eco.karmaModifiers.grants)) issues.push('Invalid grants karma modifiers');
    }
    
    if (!eco.actions || typeof eco.actions !== 'object') {
      issues.push('Missing actions structure');
    } else {
      if (!eco.actions.config || typeof eco.actions.config !== 'object') {
        issues.push('Missing actions config');
      }
    }
    
    // Check cache state
    const cacheInfo = {
      karmaType: client._ecoKarmaType?.size || 0,
      karmaSel: client._ecoKarmaSel?.size || 0,
      actionCurrent: client._ecoActionCurrent?.size || 0
    };
    
    console.log(`[Karma] Diagnostic results for ${guildId}:`, {
      issues,
      cacheInfo,
      karmaModifiersCount: {
        shop: eco.karmaModifiers?.shop?.length || 0,
        actions: eco.karmaModifiers?.actions?.length || 0,
        grants: eco.karmaModifiers?.grants?.length || 0
      }
    });
    
    return { issues, cacheInfo };
  } catch (error) {
    console.error(`[Karma] Diagnostic failed for guild ${guildId}:`, error.message);
    return { issues: ['Diagnostic failed'], error: error.message };
  }
}
// Build rows to manage karma-based discounts/penalties
async function buildEconomyKarmaRows(guild) {
  try {
    // Validate guild parameter
    if (!guild || !guild.id) {
      throw new Error('Guild parameter is invalid');
    }

    const eco = await getEconomyConfig(guild.id);
    
    // Initialize cache maps if they don't exist
    initializeEconomyCaches();
    
    // Selected type with fallback validation
    const type = client._ecoKarmaType?.get?.(guild.id) || 'shop';
    if (!['shop', 'actions', 'grants'].includes(type)) {
      client._ecoKarmaType.set(guild.id, 'shop');
    }
    
    // Ensure karmaModifiers structure exists
    if (!eco.karmaModifiers || typeof eco.karmaModifiers !== 'object') {
      eco.karmaModifiers = { shop: [], actions: [], grants: [] };
      await updateEconomyConfig(guild.id, eco);
    }
    
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
      try {
        const baseName = r.name ? `${r.name}: ` : '';
        const condition = String(r.condition || '').slice(0, 50);
        const label = type === 'grants' 
          ? `${baseName}if ${condition} -> money ${r.money}` 
          : `${baseName}if ${condition} -> ${r.percent}%`;
        return { label: label.slice(0, 100), value: String(idx) };
      } catch (err) {
        console.error('[Karma] Error processing rule:', err.message);
        return { label: `Règle ${idx} (erreur)`, value: String(idx) };
      }
    }) : [{ label: 'Aucune règle', value: 'none' }];
    
    const rulesSelect = new StringSelectMenuBuilder()
      .setCustomId(`eco_karma_rules:${type}`)
      .setPlaceholder('Sélectionner des règles à supprimer…')
      .setMinValues(0)
      .setMaxValues(Math.min(25, Math.max(1, options.length)))
      .addOptions(...options);
    
    if (options.length === 1 && options[0].value === 'none') {
      rulesSelect.setDisabled(true);
    }
    
    const rowRules = new ActionRowBuilder().addComponents(rulesSelect);
    
    // Boutons d'ajout de règles
    const addShop = new ButtonBuilder().setCustomId('eco_karma_add_shop').setLabel('+ Boutique').setStyle(ButtonStyle.Primary);
    const addAct = new ButtonBuilder().setCustomId('eco_karma_add_action').setLabel('+ Actions').setStyle(ButtonStyle.Primary);
    const addGrant = new ButtonBuilder().setCustomId('eco_karma_add_grant').setLabel('+ Grant').setStyle(ButtonStyle.Secondary);
    const delBtn = new ButtonBuilder().setCustomId('eco_karma_delete').setLabel('Supprimer').setStyle(ButtonStyle.Danger);
    const editBtn = new ButtonBuilder().setCustomId('eco_karma_edit').setLabel('Modifier').setStyle(ButtonStyle.Secondary);
    const rowActions = new ActionRowBuilder().addComponents(addShop, addAct, addGrant, editBtn, delBtn);
    
    // Reset hebdomadaire - menu déroulant pour économiser l'espace
    const resetEnabled = eco.karmaReset?.enabled || false;
    const resetDay = (typeof eco.karmaReset?.day === 'number' && eco.karmaReset.day >= 0 && eco.karmaReset.day <= 6) ? eco.karmaReset.day : 1;
    const dayLabels = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
    const resetSelect = new StringSelectMenuBuilder()
      .setCustomId('eco_karma_reset_menu')
      .setPlaceholder(`Reset hebdo: ${resetEnabled ? 'ACTIVÉ' : 'DÉSACTIVÉ'} • Jour: ${dayLabels[resetDay]}`)
      .addOptions(
        { label: resetEnabled ? 'Désactiver reset hebdo' : 'Activer reset hebdo', value: 'toggle' },
        { label: 'Reset maintenant', value: 'now', description: 'Remet tous les karma à 0' },
        { label: 'Choisir jour: Dimanche', value: 'day:0' },
        { label: 'Choisir jour: Lundi', value: 'day:1' },
        { label: 'Choisir jour: Mardi', value: 'day:2' },
        { label: 'Choisir jour: Mercredi', value: 'day:3' },
        { label: 'Choisir jour: Jeudi', value: 'day:4' },
        { label: 'Choisir jour: Vendredi', value: 'day:5' },
        { label: 'Choisir jour: Samedi', value: 'day:6' }
      );
    const rowReset = new ActionRowBuilder().addComponents(resetSelect);
    
    return [rowType, rowRules, rowActions, rowReset];
  } catch (error) {
    console.error('[Karma] Failed to build karma rows:', error.message);
    console.error('[Karma] Stack trace:', error.stack);
    
    // Clear potentially corrupted cache state
    clearKarmaCache(guild.id);
    
    // Return basic error row with retry functionality
    const errorRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('karma_error_retry')
        .setLabel('❌ Erreur karma - Réessayer')
        .setStyle(ButtonStyle.Danger)
    );
    return [errorRow];
  }
}

async function buildAutoThreadRows(guild, page = 0) {
  const cfg = await getAutoThreadConfig(guild.id);
  const channelsAdd = new ChannelSelectMenuBuilder().setCustomId('autothread_channels_add').setPlaceholder('Ajouter des salons…').setMinValues(1).setMaxValues(25).addChannelTypes(ChannelType.GuildText);
  
  // Pagination pour la suppression si plus de 25 canaux
  // Filter out invalid/deleted channels before processing
  const validChannels = (cfg.channels || []).filter(id => {
    const channel = guild.channels.cache.get(id);
    return channel && channel.type === ChannelType.GuildText;
  });
  
  // Update config if invalid channels were found and removed
  if (validChannels.length !== (cfg.channels || []).length) {
    await updateAutoThreadConfig(guild.id, { channels: validChannels });
  }
  
  const allChannels = validChannels;
  const pageSize = 25;
  const totalPages = Math.ceil(allChannels.length / pageSize);
  const startIndex = page * pageSize;
  const endIndex = Math.min(startIndex + pageSize, allChannels.length);
  const channelsForPage = allChannels.slice(startIndex, endIndex);
  
  const channelsRemove = new StringSelectMenuBuilder()
    .setCustomId(`autothread_channels_remove:${page}`)
    .setPlaceholder(totalPages > 1 ? `Retirer des salons… (page ${page + 1}/${totalPages})` : 'Retirer des salons…')
    .setMinValues(1)
    .setMaxValues(Math.max(1, channelsForPage.length || 1));
  
  // Ensure we only map valid channels with proper names
  const opts = channelsForPage
    .map(id => {
      const channel = guild.channels.cache.get(id);
      if (!channel) return null;
      return { 
        label: channel.name || `Channel ${id}`, 
        value: id 
      };
    })
    .filter(opt => opt !== null);
    
  if (opts.length) channelsRemove.addOptions(...opts); else channelsRemove.addOptions({ label: 'Aucun', value: 'none' }).setDisabled(true);
  const naming = new StringSelectMenuBuilder().setCustomId('autothread_naming').setPlaceholder('Nom du fil…').addOptions(
    { label: 'Membre + numéro', value: 'member_num', default: cfg.naming?.mode === 'member_num' },
    { label: 'Personnalisé (pattern)', value: 'custom', default: cfg.naming?.mode === 'custom' },
    { label: 'NSFW aléatoire + numéro', value: 'nsfw', default: cfg.naming?.mode === 'nsfw' },
    { label: 'Numérique', value: 'numeric', default: cfg.naming?.mode === 'numeric' },
    { label: 'Date + numéro', value: 'date_num', default: cfg.naming?.mode === 'date_num' },
  );
  const customBtn = new ButtonBuilder().setCustomId('autothread_custom_pattern').setLabel(`Pattern: ${cfg.naming?.customPattern ? cfg.naming.customPattern.slice(0,20) : 'non défini'}`).setStyle(ButtonStyle.Secondary);
  const archiveOpenBtn = new ButtonBuilder().setCustomId('autothread_archive_open').setLabel('Archivage…').setStyle(ButtonStyle.Secondary);
  
  // Garder au maximum 4 rows (avec la row Retour = 5 max)
  const rows = [
    new ActionRowBuilder().addComponents(channelsAdd),
    new ActionRowBuilder().addComponents(channelsRemove),
    new ActionRowBuilder().addComponents(naming),
  ];
  
  // Créer une row combinée pour les contrôles additionnels (max 5 boutons par row)
  const additionalButtons = [];
  
  // Boutons de pagination
  if (totalPages > 1) {
    const prevBtn = new ButtonBuilder()
      .setCustomId(`autothread_page:${Math.max(0, page - 1)}`)
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0);
    
    const nextBtn = new ButtonBuilder()
      .setCustomId(`autothread_page:${Math.min(totalPages - 1, page + 1)}`)
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === totalPages - 1);
    
    additionalButtons.push(prevBtn, nextBtn);
  }
  
  // Ajout accès archivage (ephemeral)
  additionalButtons.push(archiveOpenBtn);
  
  // Boutons pour modes spéciaux
  if ((cfg.naming?.mode || 'member_num') === 'custom') {
    additionalButtons.push(customBtn);
  } else if ((cfg.naming?.mode || 'member_num') === 'nsfw') {
    const addBtn = new ButtonBuilder().setCustomId('autothread_nsfw_add').setLabel('+ NSFW').setStyle(ButtonStyle.Primary);
    const remBtn = new ButtonBuilder().setCustomId('autothread_nsfw_remove').setLabel('- NSFW').setStyle(ButtonStyle.Danger);
    additionalButtons.push(addBtn, remBtn);
  }
  
  // Ajouter la row des boutons additionnels si elle contient des éléments
  if (additionalButtons.length > 0) {
    rows.push(new ActionRowBuilder().addComponents(...additionalButtons.slice(0, 5))); // Max 5 boutons
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
  const resetTrophies = new ButtonBuilder().setCustomId('counting_reset_trophies').setLabel('Reset trophées 🏆').setStyle(ButtonStyle.Danger);
  return [
    new ActionRowBuilder().addComponents(chAdd),
    new ActionRowBuilder().addComponents(chRem),
    new ActionRowBuilder().addComponents(formulas, reset),
    new ActionRowBuilder().addComponents(resetTrophies),
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

  // Combiner les rows pour respecter la limite de 5 ActionRow (4 + buildBackRow)
  // Fusionner rowPerCat et rowMulti ne peut pas se faire car ce sont 2 SelectMenu
  // Donc on garde les 4 plus importantes et on enlève rowMulti
  return [rowToggles, rowGlobal, rowPerCat, rowPerCatCh];
}

async function buildConfessRows(guild, mode = 'sfw') {
  const cf = await getConfessConfig(guild.id);
  
  // Filter out invalid/deleted channels before processing
  const validChannels = (cf[mode].channels || []).filter(id => {
    const channel = guild.channels.cache.get(id);
    return channel && channel.type === ChannelType.GuildText;
  });
  
  // Update config if invalid channels were found and removed
  if (validChannels.length !== (cf[mode].channels || []).length) {
    const updateData = {};
    updateData[mode] = { ...cf[mode], channels: validChannels };
    await updateConfessConfig(guild.id, updateData);
  }
  
  const modeSelect = new StringSelectMenuBuilder().setCustomId('confess_mode').setPlaceholder('Mode…').addOptions(
    { label: 'Confessions', value: 'sfw', default: mode === 'sfw' },
    { label: 'Confessions NSFW', value: 'nsfw', default: mode === 'nsfw' },
  );
  const channelAdd = new ChannelSelectMenuBuilder().setCustomId(`confess_channels_add:${mode}`).setPlaceholder('Ajouter des salons…').setMinValues(1).setMaxValues(3).addChannelTypes(ChannelType.GuildText);
  const channelRemove = new StringSelectMenuBuilder().setCustomId(`confess_channels_remove:${mode}`).setPlaceholder('Retirer des salons…').setMinValues(1).setMaxValues(Math.max(1, Math.min(25, validChannels.length || 1)));
  
  // Ensure we only map valid channels with proper names
  const opts = validChannels
    .map(id => {
      const channel = guild.channels.cache.get(id);
      if (!channel) return null;
      return { 
        label: channel.name || `Channel ${id}`, 
        value: id 
      };
    })
    .filter(opt => opt !== null);
    
  if (opts.length) channelRemove.addOptions(...opts); else channelRemove.addOptions({ label: 'Aucun', value: 'none' }).setDisabled(true);
  const replyToggle = new ButtonBuilder().setCustomId('confess_toggle_replies').setLabel(cf.allowReplies ? 'Réponses: ON' : 'Réponses: OFF').setStyle(cf.allowReplies ? ButtonStyle.Success : ButtonStyle.Secondary);
  const nameToggle = new ButtonBuilder().setCustomId('confess_toggle_naming').setLabel(cf.threadNaming === 'nsfw' ? 'Nom de fil: NSFW+' : 'Nom de fil: Normal').setStyle(ButtonStyle.Secondary);
  const logsOpenBtn = new ButtonBuilder().setCustomId('confess_logs_open').setLabel('Salon de logs…').setStyle(ButtonStyle.Secondary);
  
  // Limite 4 rows (Back + 4 = 5 max)
  const rows = [
    new ActionRowBuilder().addComponents(modeSelect),
    new ActionRowBuilder().addComponents(channelAdd),
    new ActionRowBuilder().addComponents(channelRemove),
  ];
  
  // Combiner les boutons dans une seule row pour respecter la limite de 5 ActionRow
  const toggleButtons = [replyToggle, nameToggle, logsOpenBtn];
  if (cf.threadNaming === 'nsfw') {
    const addBtn = new ButtonBuilder().setCustomId('confess_nsfw_add').setLabel('+ NSFW').setStyle(ButtonStyle.Primary);
    const remBtn = new ButtonBuilder().setCustomId('confess_nsfw_remove').setLabel('- NSFW').setStyle(ButtonStyle.Danger);
    toggleButtons.push(addBtn, remBtn);
  }
  rows.push(new ActionRowBuilder().addComponents(...toggleButtons));
  
  return rows;
}
async function buildTicketsRows(guild, submenu) {
  const { getTicketsConfig } = require('./storage/jsonStore');
  const t = await getTicketsConfig(guild.id);
  const current = String(submenu || 'panel');

  // Top-level submenu selector
  const ticketsMenu = new StringSelectMenuBuilder()
    .setCustomId('tickets_menu')
    .setPlaceholder(
      current === 'panel' ? 'Sous-menu: Panel' :
      current === 'ping' ? 'Sous-menu: Rôles à ping' :
      current === 'categories' ? 'Sous-menu: Catégories' :
      current === 'naming' ? 'Sous-menu: Nommage' :
      current === 'transcript' ? 'Sous-menu: Transcript' :
      current === 'certified' ? 'Sous-menu: Rôle certifié' : 'Sous-menu: Rôles d\'accès'
    )
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      { label: 'Panel', value: 'panel', description: 'Panneau et salons', default: current === 'panel' },
      { label: 'Rôles à ping', value: 'ping', description: 'Rôles ping à l\'ouverture', default: current === 'ping' },
      { label: 'Catégories', value: 'categories', description: 'Gérer les catégories', default: current === 'categories' },
      { label: 'Rôles d\'accès', value: 'access', description: 'Rôles ayant accès', default: current === 'access' },
      { label: 'Transcript', value: 'transcript', description: 'Type et salon de transcription', default: current === 'transcript' },
      { label: 'Nommage', value: 'naming', description: 'Format du nom des tickets', default: current === 'naming' },
      { label: 'Rôle certifié', value: 'certified', description: 'Rôle attribué par bouton', default: current === 'certified' },
    );
  const menuRow = new ActionRowBuilder().addComponents(ticketsMenu);

  // Shared builders
  const panelBtn = new ButtonBuilder().setCustomId('tickets_post_panel').setLabel('Publier panneau').setStyle(ButtonStyle.Primary);
  const editPanelBtn = new ButtonBuilder().setCustomId('tickets_edit_panel').setLabel('Éditer panneau').setStyle(ButtonStyle.Secondary);
  const pingStaffToggle = new ButtonBuilder().setCustomId('tickets_toggle_ping_staff').setLabel(t.pingStaffOnOpen ? 'Ping staff: ON' : 'Ping staff: OFF').setStyle(t.pingStaffOnOpen ? ButtonStyle.Success : ButtonStyle.Secondary);
  const newCatBtn = new ButtonBuilder().setCustomId('tickets_add_cat').setLabel('Nouvelle catégorie').setStyle(ButtonStyle.Secondary);
  const remCatBtn = new ButtonBuilder().setCustomId('tickets_remove_cat').setLabel('Retirer catégorie').setStyle(ButtonStyle.Danger);
  const editCatStartBtn = new ButtonBuilder().setCustomId('tickets_edit_cat_start').setLabel('Modifier catégorie').setStyle(ButtonStyle.Secondary);

  const rows = [menuRow];

  if (current === 'panel') {
    const controlRow = new ActionRowBuilder().addComponents(panelBtn, editPanelBtn);
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId('tickets_set_category')
      .setPlaceholder(t.categoryId ? `Catégorie actuelle: <#${t.categoryId}>` : 'Catégorie Discord pour les tickets…')
      .addChannelTypes(ChannelType.GuildCategory)
      .setMinValues(1)
      .setMaxValues(1);
    const panelChannelSelect = new ChannelSelectMenuBuilder()
      .setCustomId('tickets_set_panel_channel')
      .setPlaceholder(t.panelChannelId ? `Salon actuel: <#${t.panelChannelId}>` : 'Salon pour publier le panneau…')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(1)
      .setMaxValues(1);
    rows.push(controlRow);
    rows.push(new ActionRowBuilder().addComponents(channelSelect));
    rows.push(new ActionRowBuilder().addComponents(panelChannelSelect));
    return rows;
  }

  if (current === 'ping') {
    const catSelectPing = new StringSelectMenuBuilder()
      .setCustomId('tickets_pick_cat_ping')
      .setPlaceholder('Choisir une catégorie à configurer (rôles ping)…')
      .setMinValues(1)
      .setMaxValues(1);
    const catOpts = (t.categories || []).slice(0, 25).map(c => ({ label: `${c.emoji ? c.emoji + ' ' : ''}${c.label}`, value: c.key }));
    if (catOpts.length) catSelectPing.addOptions(...catOpts); else catSelectPing.addOptions({ label: 'Aucune catégorie', value: 'none' }).setDisabled(true);
    rows.push(new ActionRowBuilder().addComponents(pingStaffToggle));
    rows.push(new ActionRowBuilder().addComponents(catSelectPing));
    return rows;
  }

  if (current === 'categories') {
    const control = new ActionRowBuilder().addComponents(newCatBtn, editCatStartBtn, remCatBtn);
    return [menuRow, control];
  }

  if (current === 'transcript') {
    const styleSel = new StringSelectMenuBuilder()
      .setCustomId('tickets_transcript_style')
      .setPlaceholder(`Style actuel: ${t.transcript?.style || 'pro'}`)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        { label: 'Pro', value: 'pro', description: 'Texte lisible avec en-tête', default: (t.transcript?.style || 'pro') === 'pro' },
        { label: 'Premium', value: 'premium', description: 'Style premium (accentué)', default: t.transcript?.style === 'premium' },
        { label: 'Classic', value: 'classic', description: 'Texte brut simple', default: t.transcript?.style === 'classic' },
      );
    const transCh = new ChannelSelectMenuBuilder()
      .setCustomId('tickets_set_transcript_channel')
      .setPlaceholder(t.transcriptChannelId ? `Salon actuel: <#${t.transcriptChannelId}>` : 'Choisir le salon de transcription…')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setMinValues(1)
      .setMaxValues(1);
    rows.push(new ActionRowBuilder().addComponents(styleSel));
    rows.push(new ActionRowBuilder().addComponents(transCh));
    return rows;
  }

  if (current === 'naming') {
    const mode = t.naming?.mode || 'ticket_num';
    const modeSel = new StringSelectMenuBuilder()
      .setCustomId('tickets_naming_mode')
      .setPlaceholder(`Mode actuel: ${mode}`)
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        { label: 'ticket + numéro', value: 'ticket_num', description: 'Ex: ticket-12', default: mode === 'ticket_num' },
        { label: 'nom + numéro', value: 'member_num', description: 'Ex: julie-12', default: mode === 'member_num' },
        { label: 'catégorie + numéro', value: 'category_num', description: 'Ex: support-12', default: mode === 'category_num' },
        { label: 'modèle personnalisé', value: 'custom', description: 'Utilise {num} {user} {cat} {date}', default: mode === 'custom' },
        { label: 'numérique seul', value: 'numeric', description: 'Ex: 12', default: mode === 'numeric' },
        { label: 'date + numéro', value: 'date_num', description: 'Ex: 2025-01-01-12', default: mode === 'date_num' },
      );
    const pattern = (t.naming?.customPattern || '{user}-{num}').slice(0, 80);
    const editPatternBtn = new ButtonBuilder().setCustomId('tickets_edit_pattern').setLabel('Éditer le modèle').setStyle(ButtonStyle.Primary).setDisabled(mode !== 'custom');
    const showPatternBtn = new ButtonBuilder().setCustomId('tickets_pattern_display').setLabel(`Actuel: ${pattern}`).setStyle(ButtonStyle.Secondary).setDisabled(true);
    rows.push(new ActionRowBuilder().addComponents(modeSel));
    rows.push(new ActionRowBuilder().addComponents(editPatternBtn, showPatternBtn));
    return rows;
  }

  if (current === 'certified') {
    const roleSel = new RoleSelectMenuBuilder()
      .setCustomId('tickets_set_certified_role')
      .setPlaceholder(t.certifiedRoleId ? `Rôle actuel: <@&${t.certifiedRoleId}>` : 'Choisir le rôle certifié…')
      .setMinValues(1)
      .setMaxValues(1);
    const clearBtn = new ButtonBuilder()
      .setCustomId('tickets_clear_certified_role')
      .setLabel('Retirer le rôle certifié')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!t.certifiedRoleId);
    rows.push(new ActionRowBuilder().addComponents(roleSel));
    rows.push(new ActionRowBuilder().addComponents(clearBtn));
    return rows;
  }

  // access
  const catSelectAccess = new StringSelectMenuBuilder()
    .setCustomId('tickets_pick_cat_access')
    .setPlaceholder('Choisir une catégorie à configurer (rôles d\'accès)…')
    .setMinValues(1)
    .setMaxValues(1);
  const catOpts = (t.categories || []).slice(0, 25).map(c => ({ label: `${c.emoji ? c.emoji + ' ' : ''}${c.label}`, value: c.key }));
  if (catOpts.length) catSelectAccess.addOptions(...catOpts); else catSelectAccess.addOptions({ label: 'Aucune catégorie', value: 'none' }).setDisabled(true);
  rows.push(new ActionRowBuilder().addComponents(catSelectAccess));
  return rows;
}

function actionKeyToLabel(key) {
  const map = {
    daily: 'quotidien',
    work: 'travailler',
    fish: 'pêcher',
    give: 'donner',
    steal: 'voler',
    kiss: 'embrasser',
    flirt: 'flirter',
    seduce: 'séduire',
    fuck: 'fuck',
    sodo: 'sodo',
    orgasme: 'donner orgasme',
    branler: 'branler',
    doigter: 'doigter',
    hairpull: 'tirer cheveux',
    caress: 'caresser',
    lick: 'lécher',
    suck: 'sucer',
    nibble: 'mordre',
    tickle: 'chatouiller',
    revive: 'réanimer',
    comfort: 'réconforter',
    massage: 'masser',
    dance: 'danser',
    crime: 'crime',
    // Hot & Fun
    shower: 'douche',
    wet: 'wet',
    bed: 'lit',
    undress: 'déshabiller',
    // Domination / Soumission
    collar: 'collier',
    leash: 'laisse',
    kneel: 'à genoux',
    order: 'ordonner',
    punish: 'punir',
    // Séduction & RP doux
    rose: 'rose',
    wine: 'vin',
    pillowfight: 'bataille oreillers',
    sleep: 'dormir',
    // Délires / Jeux
    oops: 'oups',
    caught: 'surpris',
    tromper: 'tromper',
    orgie: 'orgie'
  };
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

  // Discord limite un StringSelect à 25 options max. Découper en plusieurs menus si nécessaire.
  const rows = [];
  for (let i = 0; i < options.length; i += 25) {
    const chunk = options.slice(i, i + 25);
    const select = new StringSelectMenuBuilder()
      .setCustomId(`economy_actions_pick:${Math.floor(i / 25)}`)
      .setPlaceholder('Choisir une action à modifier…')
      .addOptions(...chunk);
    rows.push(new ActionRowBuilder().addComponents(select));
  }
  return rows;
}
async function buildEconomyActionDetailRows(guild, selectedKey) {
  const rows = await buildEconomyActionsRows(guild, selectedKey);
  if (!selectedKey || selectedKey === 'none') return rows;
  const eco = await getEconomyConfig(guild.id);
  const isEnabled = Array.isArray(eco.actions?.enabled) ? eco.actions.enabled.includes(selectedKey) : true;
  const toggle = new ButtonBuilder().setCustomId(`economy_action_toggle:${selectedKey}`).setLabel(isEnabled ? 'Action: ON' : 'Action: OFF').setStyle(isEnabled ? ButtonStyle.Success : ButtonStyle.Secondary);
  const editBasic = new ButtonBuilder().setCustomId(`economy_action_edit_basic:${selectedKey}`).setLabel('Paramètres de base').setStyle(ButtonStyle.Primary);
  const editKarma = new ButtonBuilder().setCustomId(`economy_action_edit_karma:${selectedKey}`).setLabel('Karma').setStyle(ButtonStyle.Secondary);
  const editPartner = new ButtonBuilder().setCustomId(`economy_action_edit_partner:${selectedKey}`).setLabel('Récompenses partenaire').setStyle(ButtonStyle.Secondary);
  rows.push(new ActionRowBuilder().addComponents(toggle, editBasic, editKarma, editPartner));
  return rows;
}

// Build rows for managing action GIFs
async function buildEconomyGifRows(guild, currentKey) {
  const eco = await getEconomyConfig(guild.id);
  const allKeys = ['daily','work','fish','give','steal','kiss','flirt','seduce','fuck','sodo','orgasme','branler','doigter','hairpull','caress','lick','suck','nibble','tickle','revive','comfort','massage','dance','crime','shower','wet','bed','undress','collar','leash','kneel','order','punish','rose','wine','pillowfight','sleep','oops','caught','tromper','orgie'];
  const opts = allKeys.map(k => ({ label: actionKeyToLabel(k), value: k, default: currentKey === k }));
  // Discord limite les StringSelectMenu à 25 options max. Divisons en plusieurs menus.
  const rows = [];
  for (let i = 0; i < opts.length; i += 25) {
    const chunk = opts.slice(i, i + 25);
    const pick = new StringSelectMenuBuilder()
      .setCustomId(`economy_gifs_action_${Math.floor(i / 25)}`)
      .setPlaceholder(`Choisir une action… (${Math.floor(i / 25) + 1}/${Math.ceil(opts.length / 25)})`)
      .addOptions(...chunk);
    rows.push(new ActionRowBuilder().addComponents(pick));
  }
  if (currentKey && allKeys.includes(currentKey)) {
    const conf = eco.actions?.gifs?.[currentKey] || { success: [], fail: [] };
    const addSucc = new ButtonBuilder().setCustomId(`economy_gifs_add:success:${currentKey}`).setLabel('Ajouter GIF succès').setStyle(ButtonStyle.Success);
    const addFail = new ButtonBuilder().setCustomId(`economy_gifs_add:fail:${currentKey}`).setLabel('Ajouter GIF échec').setStyle(ButtonStyle.Danger);
    rows.push(new ActionRowBuilder().addComponents(addSucc, addFail));
    // Remove selects (success)
    const succList = Array.isArray(conf.success) ? conf.success.slice(0, 25) : [];
    const succSel = new StringSelectMenuBuilder().setCustomId(`economy_gifs_remove_success:${currentKey}`).setPlaceholder('Supprimer GIFs succès…');
    if (succList.length > 0) {
      succSel.setMinValues(1).setMaxValues(Math.min(25, succList.length));
      succSel.addOptions(...succList.map((url, i) => ({ label: `Succès #${i+1}`, value: String(i), description: url.slice(0, 80) })));
    } else {
      succSel.setMinValues(0).setMaxValues(1);
      succSel.addOptions({ label: 'Aucun', value: 'none' }).setDisabled(true);
    }
    rows.push(new ActionRowBuilder().addComponents(succSel));
    // Remove selects (fail)
    const failList = Array.isArray(conf.fail) ? conf.fail.slice(0, 25) : [];
    const failSel = new StringSelectMenuBuilder().setCustomId(`economy_gifs_remove_fail:${currentKey}`).setPlaceholder('Supprimer GIFs échec…');
    if (failList.length > 0) {
      failSel.setMinValues(1).setMaxValues(Math.min(25, failList.length));
      failSel.addOptions(...failList.map((url, i) => ({ label: `Échec #${i+1}`, value: String(i), description: url.slice(0, 80) })));
    } else {
      failSel.setMinValues(0).setMaxValues(1);
      failSel.addOptions({ label: 'Aucun', value: 'none' }).setDisabled(true);
    }
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
  const prices = eco.suites?.prices || { day: 0, week: 0, month: 0 };
  const priceBtn = new ButtonBuilder()
    .setCustomId('suites_edit_prices')
    .setLabel(`Tarifs: ${prices.day||0}/${prices.week||0}/${prices.month||0}`)
    .setStyle(ButtonStyle.Primary);
  return [
    new ActionRowBuilder().addComponents(cat),
    new ActionRowBuilder().addComponents(priceBtn)
  ];
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
  // Boot persistance dès le départ et journaliser le mode choisi
  ensureStorageExists().then(()=>console.log('[bot] Storage initialized')).catch((e)=>console.warn('[bot] Storage init error:', e?.message||e));
  
  // Initialize economy caches to prevent interaction failures
  initializeEconomyCaches();
  console.log('[bot] Economy caches initialized');
  
  // Set up periodic cache validation (every 30 minutes)
  setInterval(() => {
    validateKarmaCache();
  }, 30 * 60 * 1000);
  
  startYtProxyServer();
  // Start local Lavalink stack only if explicitly enabled
  if (shouldEnableLocalLavalink()) {
    console.log('[Music] Local Lavalink enabled -> starting local Lavalink + proxy');
    startLocalLavalinkStack();
  } else {
    console.log('[Music] Using remote/public Lavalink nodes (local disabled)');
  }
  // Start local Lavalink v3 if explicitly enabled
  if (shouldEnableLocalLavalinkV3()) {
    console.log('[Music] Local Lavalink v3 enabled -> starting local v3 server');
    startLocalLavalinkV3();
  } else {
    console.log('[Music] Using remote/public Lavalink v3 nodes (local v3 disabled)');
  }
  // Init Erela.js (if available) with multiple fallback nodes
  try {
    if (ErelaManager && process.env.ENABLE_MUSIC !== 'false') {
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
      // If not provided via env, try to load from files
      if (!Array.isArray(nodes) || nodes.length === 0) {
        const fs = require('fs');
        const candidates = [
          '/workspace/lavalink-nodes.stable.json',
          '/workspace/lavalink-nodes-stable.json',
          'lavalink-nodes.stable.json',
          'lavalink-nodes-stable.json'
        ];
        for (const p of candidates) {
          try {
            if (fs.existsSync(p)) {
              const txt = fs.readFileSync(p, 'utf8');
              const arr = JSON.parse(txt);
              if (Array.isArray(arr) && arr.length) {
                nodes = arr;
                console.log('[Music] Using nodes from file:', p);
                break;
              }
            }
          } catch (e) {
            console.warn('[Music] Failed to read nodes file', p, e?.message || e);
          }
        }
      }
      // If local lavalink is not enabled, filter out localhost nodes from file/env config
      try {
        const localEnabled = shouldEnableLocalLavalink() || shouldEnableLocalLavalinkV3();
        if (!localEnabled && Array.isArray(nodes) && nodes.length > 0) {
          const before = nodes.length;
          nodes = nodes.filter(n => {
            const host = String(n?.host || '').toLowerCase();
            return host !== '127.0.0.1' && host !== 'localhost' && host !== '::1';
          });
          if (before !== nodes.length) console.log('[Music] Filtered out local Lavalink nodes because local Lavalink is disabled');
        }
      } catch (_) {}
      // Final fallback: tested and working public nodes (prioritized by reliability)
      if (!Array.isArray(nodes) || nodes.length === 0) {
        const pw = String(process.env.LAVALINK_PASSWORD || 'youshallnotpass');
        nodes = [
          { identifier: 'ajieblogs-v4-80-primary', host: 'lava-v4.ajieblogs.eu.org', port: 80, password: 'https://dsc.gg/ajidevserver', secure: false, retryAmount: 3, retryDelay: 10000 },
          { identifier: 'ajieblogs-v3-80-secondary', host: 'lava-v3.ajieblogs.eu.org', port: 80, password: 'https://dsc.gg/ajidevserver', secure: false, retryAmount: 3, retryDelay: 10000 },
          { identifier: 'darrennathanael-http', host: 'lavalink.darrennathanael.com', port: 443, password: 'darrennathanael.com', secure: true, retryAmount: 3, retryDelay: 10000 }
        ];
        console.log('[Music] Using tested working nodes: ajieblogs v4/v3 (80), darrennathanael (443)');
      }
      // If local lavalink enabled, add it as last-resort fallback (proxy port 2334)
      if (shouldEnableLocalLavalink()) {
        nodes.push({ identifier: 'local-fallback', host: '127.0.0.1', port: 2334, password: String(process.env.LAVALINK_PASSWORD || 'youshallnotpass'), secure: false, retryAmount: 5, retryDelay: 30000 });
      }
      // If local lavalink v3 enabled, add it as another fallback (port 2340)
      if (shouldEnableLocalLavalinkV3()) {
        nodes.push({ identifier: 'local-v3', host: '127.0.0.1', port: 2340, password: String(process.env.LAVALINK_PASSWORD || 'youshallnotpass'), secure: false, retryAmount: 5, retryDelay: 30000 });
      }
      // Deduplicate nodes by host:port
      const seen = new Set();
      nodes = nodes.filter(n => {
        const key = `${n.host}:${n.port}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      try { console.log('[Music] Nodes configured:', nodes.map(n => `${n.identifier||n.host}:${n.port}${n.secure?' (tls)':''}`).join(', ')); } catch (_) {}

      const manager = new ErelaManager({
        nodes,
        send: (id, payload) => {
          const guild = client.guilds.cache.get(id);
          if (guild) guild.shard.send(payload);
        },
        autoPlay: true,
        clientName: 'BAG-Discord-Bot',
      });
      
      client.music = manager;
      
      // Enhanced event handlers
      manager.on('nodeConnect', node => {
        console.log(`[Music] ✅ Node connected: ${node.options.identifier || node.options.host}:${node.options.port}`);
        // Reset reconnect attempts on successful connection
        node.reconnectAttempts = 0;
      });
      
      manager.on('nodeReconnect', node => {
        console.log(`[Music] 🔄 Node reconnecting: ${node.options.identifier || node.options.host}:${node.options.port}`);
      });
      
      manager.on('nodeDisconnect', (node, reason) => {
        console.warn(`[Music] ❌ Node disconnected: ${node.options.identifier || node.options.host}:${node.options.port} - Reason: ${reason?.message || reason}`);
        // Try to connect to next available node if this one fails
        setTimeout(() => {
          const availableNodes = Array.from(client.music.nodes.values()).filter(n => n.connected);
          if (availableNodes.length === 0) {
            console.log('[Music] 🔄 All nodes disconnected, attempting to reconnect to any available node...');
          }
        }, 1000);
      });
      
      manager.on('nodeError', (node, err) => {
        console.error(`[Music] 💥 Node error: ${node.options.identifier || node.options.host}:${node.options.port} - ${err?.message || err}`);
        // Try to reconnect after error with exponential backoff
        const reconnectDelay = Math.min(30000, (node.reconnectAttempts || 0) * 5000 + 5000);
        node.reconnectAttempts = (node.reconnectAttempts || 0) + 1;
        
        // Stop trying after 10 attempts to prevent infinite loops
        if (node.reconnectAttempts > 10) {
          console.error(`[Music] 🚫 Node ${node.options.identifier} disabled after 10 failed attempts`);
          return;
        }
        
        setTimeout(() => {
          try {
            if (!node.connected) {
              console.log(`[Music] 🔄 Attempting to reconnect node: ${node.options.identifier} (attempt ${node.reconnectAttempts})`);
              node.connect();
            }
          } catch (e) {
            console.error(`[Music] Failed to reconnect node: ${e?.message || e}`);
          }
        }, reconnectDelay);
      });
      
      manager.on('playerMove', (player, oldChannel, newChannel) => { 
        if (!newChannel) player.destroy(); 
      });
      
      manager.on('queueEnd', player => {
        console.log(`[Music] Queue ended for guild: ${player.guild}`);
      });
      
      manager.init(client.user.id);
      client.on('raw', (d) => { try { client.music?.updateVoiceState(d); } catch (_) {} });
      
      // Enhanced periodic node health check with intelligent reconnection
      setInterval(() => {
        try {
          const allNodes = Array.from(client.music.nodes.values());
          const connectedNodes = allNodes.filter(n => n.connected);
          const totalNodes = allNodes.length;
          
          if (connectedNodes.length === 0 && totalNodes > 0) {
            console.warn(`[Music] ⚠️  No nodes connected (0/${totalNodes}). Attempting smart reconnection...`);
            
            // Try to connect nodes in priority order (local first, then public)
            const priorityOrder = ['N/ams'];
            
            for (const priority of priorityOrder) {
              const node = allNodes.find(n => n.options.identifier === priority);
              if (node && !node.connected && (node.reconnectAttempts || 0) < 5) {
                try {
                  console.log(`[Music] 🔄 Trying priority node: ${priority}`);
                  node.connect();
                  break; // Only try one at a time
                } catch (e) {
                  console.error(`[Music] Failed to connect ${priority}: ${e?.message || e}`);
                }
              }
            }
          } else if (connectedNodes.length > 0) {
            console.log(`[Music] 📊 Node status: ${connectedNodes.length}/${totalNodes} connected (${connectedNodes.map(n => n.options.identifier).join(', ')})`);
          }
        } catch (e) {
          console.error(`[Music] Health check error: ${e?.message || e}`);
        }
      }, 30000); // Check every 30 seconds
      
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
  // Tickets: auto-close when member leaves
  client.on(Events.GuildMemberRemove, async (m) => {
    try {
      const { getTicketsConfig, closeTicketRecord } = require('./storage/jsonStore');
      const t = await getTicketsConfig(m.guild.id);
      const entries = Object.entries(t.records || {}).filter(([cid, rec]) => rec && String(rec.userId) === String(m.id) && !rec.closedAt);
      for (const [channelId, rec] of entries) {
        const ch = m.guild.channels.cache.get(channelId) || await m.guild.channels.fetch(channelId).catch(() => null);
        if (!ch || !ch.isTextBased?.()) continue;
        // Send transcript to transcript channel before closing
        try {
          const transcriptChannel = t.transcriptChannelId ? (m.guild.channels.cache.get(t.transcriptChannelId) || await m.guild.channels.fetch(t.transcriptChannelId).catch(()=>null)) : null;
          if (transcriptChannel && transcriptChannel.isTextBased?.()) {
            const msgs = await ch.messages.fetch({ limit: 100 }).catch(()=>null);
            const sorted = msgs ? Array.from(msgs.values()).sort((a,b) => a.createdTimestamp - b.createdTimestamp) : [];
            const lines = [];
            const head = `Transcription du ticket <#${ch.id}>\nAuteur: <@${rec.userId}>\nFermé: Départ serveur\nCatégorie: ${rec.categoryKey || '—'}\nOuvert: ${new Date(rec.createdAt||Date.now()).toLocaleString()}\nFermé: ${new Date().toLocaleString()}\n`;
            function esc(s) { return String(s||'').replace(/[&<>"]|'/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }
            const staffRoleIds = await getGuildStaffRoleIds(m.guild.id).catch(()=>[]);
            const htmlLines = [];
            for (const msg of sorted) {
              const when = new Date(msg.createdTimestamp).toISOString();
              const author = msg.author ? `${msg.author.tag}` : 'Unknown';
              const contentTxt = (msg.cleanContent || '');
              const content = contentTxt.replace(/\n/g, ' ');
              lines.push(`[${when}] ${author}: ${content}`);
              let cls = '';
              if (msg.author?.bot) cls = 'bot';
              else if (String(msg.author?.id) === String(rec.userId)) cls = 'member';
              else if (msg.member && Array.isArray(staffRoleIds) && staffRoleIds.some((rid) => msg.member.roles?.cache?.has?.(rid))) cls = 'staff';
              const lineHtml = `<div class="msg"><span class="time">[${esc(when)}]</span> <span class="author">${esc(author)}</span>: <span class="content ${cls}">${esc(contentTxt)}</span></div>`;
              htmlLines.push(lineHtml);
            }
            const text = head + '\n' + (lines.join('\n') || '(aucun message)');
            const file = new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: `transcript-${ch.id}.txt` });
            const htmlDoc = `<!doctype html><html><head><meta charset="utf-8"><title>Transcription ${esc(ch.name||ch.id)}</title><style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Ubuntu,"Helvetica Neue",Arial,sans-serif;background:#0b0f12;color:#e0e6ed;margin:16px} h2{margin:0 0 8px 0} .meta{color:#90a4ae;white-space:pre-wrap;margin-bottom:8px} .time{color:#90a4ae} .msg{margin:4px 0} .content{white-space:pre-wrap} .content.member{color:#4caf50} .content.staff{color:#ffb74d} .content.bot{color:#64b5f6}</style></head><body><h2>Transcription du ticket ${esc(ch.name||('#'+ch.id))}</h2><div class="meta">${esc(head)}</div><hr/>${htmlLines.join('\n')}</body></html>`;
            const fileHtml = new AttachmentBuilder(Buffer.from(htmlDoc, 'utf8'), { name: `transcript-${ch.id}.html` });
            const color = (t.transcript?.style === 'premium') ? THEME_COLOR_ACCENT : THEME_COLOR_PRIMARY;
            const title = (t.transcript?.style === 'premium') ? '💎 Transcription Premium' : (t.transcript?.style === 'pro' ? '🧾 Transcription Pro' : 'Transcription');
            const tEmbed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(`Ticket: <#${ch.id}> — Auteur: <@${rec.userId}>`).setTimestamp(new Date()).setFooter({ text: 'BAG • Tickets', iconURL: THEME_TICKET_FOOTER_ICON });
            const __bannerT = maybeAttachTicketBanner(tEmbed);
            const files = __bannerT ? [file, fileHtml, __bannerT] : [file, fileHtml];
            await transcriptChannel.send({ content: `<@${rec.userId}>`, embeds: [tEmbed], files, allowedMentions: { users: [rec.userId] } }).catch(()=>{});
          }
        } catch (_) {}
        const embed = new EmbedBuilder()
          .setColor(THEME_COLOR_PRIMARY)
          .setTitle('Ticket fermé')
          .setDescription(`L'auteur du ticket a quitté le serveur. Ticket fermé automatiquement.`)
          .setFooter({ text: 'BAG • Tickets', iconURL: THEME_TICKET_FOOTER_ICON })
          .setTimestamp(new Date());
        try {
          const __banner = maybeAttachTicketBanner(embed);
          await ch.send({ embeds: [embed], files: __banner ? [__banner] : [] });
        } catch (_) {}
        try { await closeTicketRecord(m.guild.id, channelId); } catch (_) {}
        try { await ch.permissionOverwrites?.edit?.(rec.userId, { ViewChannel: false }); } catch (_) {}
      }
    } catch (_) {}
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
  // Note: Le message de bienvenue des suites privées est maintenant envoyé directement
  // lors de la création dans la logique d'achat pour éviter les problèmes de timing
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
          let textDeleted = true;
          let voiceDeleted = true;
          // delete text channel
          try {
            const tcid = info.textId;
            if (tcid) {
              const tch = guild.channels.cache.get(tcid) || await guild.channels.fetch(tcid).catch(()=>null);
              if (tch) {
                await tch.delete().catch((e)=>{ try { console.warn('[Suites] Échec suppression texte', { uid, tcid, error: e?.message }); } catch(_){}; });
                const still = guild.channels.cache.get(tcid) || await guild.channels.fetch(tcid).catch(()=>null);
                textDeleted = !still;
              }
            }
          } catch (e) {
            try { console.warn('[Suites] Erreur suppression texte', { uid, error: e?.message }); } catch(_){}
          }
          // delete voice channel
          try {
            const vcid = info.voiceId;
            if (vcid) {
              const vch = guild.channels.cache.get(vcid) || await guild.channels.fetch(vcid).catch(()=>null);
              if (vch) {
                await vch.delete().catch((e)=>{ try { console.warn('[Suites] Échec suppression vocal', { uid, vcid, error: e?.message }); } catch(_){}; });
                const still = guild.channels.cache.get(vcid) || await guild.channels.fetch(vcid).catch(()=>null);
                voiceDeleted = !still;
              }
            }
          } catch (e) {
            try { console.warn('[Suites] Erreur suppression vocal', { uid, error: e?.message }); } catch(_){}
          }
          // Remove entry only if both channels are gone or undefined
          const canRemove = (info.textId ? textDeleted : true) && (info.voiceId ? voiceDeleted : true);
          if (canRemove) {
            try { console.log('[Suites] Entrée supprimée (canaux supprimés ou introuvables)', { uid, textId: info.textId||null, voiceId: info.voiceId||null }); } catch(_){}
            delete active[uid];
            modified = true;
          } else {
            try { console.warn('[Suites] Entrée conservée: suppression incomplète', { uid, textDeleted, voiceDeleted }); } catch(_){}
          }
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
            .setFooter({ text: 'BAG • Disboard', iconURL: THEME_TICKET_FOOTER_ICON })
            .setTimestamp(new Date());
          await ch.send({ embeds: [embed] }).catch(()=>{});
        }
        await updateDisboardConfig(guild.id, { reminded: true });
      }
    } catch (_) {}
  }, 60 * 1000);

  // Monitor stuck interactions every 5 minutes
  setInterval(() => {
    try {
      const now = Date.now();
      const stuck = Array.from(pendingInteractions.values()).filter(p => now - p.timestamp > 15000); // 15+ seconds old
      
      if (stuck.length > 0) {
        console.warn(`[Monitor] Found ${stuck.length} potentially stuck interactions:`);
        stuck.forEach(p => {
          console.warn(`  - ${p.actionType} from user ${p.userId} (${Math.round((now - p.timestamp)/1000)}s ago)`);
        });
      }
      
      // Also log current stats
      if (pendingInteractions.size > 0) {
        console.log(`[Monitor] Currently tracking ${pendingInteractions.size} pending interactions`);
      }
    } catch (error) {
      console.error('[Monitor] Error checking stuck interactions:', error);
    }
  }, 5 * 60 * 1000);

  // Backup heartbeat: persist current state and log every 30 minutes
  setInterval(async () => {
    try {
      const guild = readyClient.guilds.cache.get(guildId) || await readyClient.guilds.fetch(guildId).catch(()=>null);
      if (!guild) return;
      
      // Force a read+write round-trip to create snapshot/rolling backups avec GitHub
      const { backupNow } = require('./storage/jsonStore');
      const backupInfo = await backupNow();
      
      const cfg = await getLogsConfig(guild.id);
      if (!cfg?.categories?.backup) return;
      
      // Utiliser les vraies informations de sauvegarde (incluant GitHub)
      const autoInfo = { 
        storage: 'auto', 
        local: backupInfo.local || { success: true }, 
        github: backupInfo.github || { success: false, configured: false, error: 'GitHub non configuré' },
        details: { 
          timestamp: new Date().toISOString(),
          dataSize: backupInfo.details?.dataSize || 0,
          guildsCount: backupInfo.details?.guildsCount || 0,
          usersCount: backupInfo.details?.usersCount || 0
        }
      };
      
      await sendDetailedBackupLog(guild, autoInfo, 'automatique', null);
    } catch (error) {
      console.error('[Backup Auto] Erreur:', error.message);
    }
  }, 30 * 60 * 1000);

  // Weekly karma reset at configured day (UTC) at 00:00
  setInterval(async () => {
    try {
      const now = new Date();
      const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
      const hour = now.getUTCHours();
      const minute = now.getUTCMinutes();
      
      // Execute once per minute exactly at 00:00 UTC; per guild day configured
      if (hour === 0 && minute === 0) {
        console.log('[Karma Reset] Starting weekly karma reset...');
        
        for (const [guildId, guild] of client.guilds.cache) {
          try {
            const eco = await getEconomyConfig(guildId);
            
            // Check if weekly reset is enabled for this guild
            if (!eco.karmaReset?.enabled) continue;
            const resetDay = (typeof eco.karmaReset.day === 'number' && eco.karmaReset.day >= 0 && eco.karmaReset.day <= 6) ? eco.karmaReset.day : 1;
            if (dayOfWeek !== resetDay) continue;
            
            // Get all users in this guild's economy
            const balances = eco.balances || {};
            let resetCount = 0;
            
            for (const userId in balances) {
              const user = balances[userId];
              if (user.charm > 0 || user.perversion > 0) {
                user.charm = 0;
                user.perversion = 0;
                resetCount++;
              }
            }
            
            if (resetCount > 0) {
              eco.balances = balances;
              await updateEconomyConfig(guildId, eco);
              
              // Log the reset if logging is configured
              const cfg = await getLogsConfig(guildId);
              if (cfg?.categories?.economy) {
                const channel = guild.channels.cache.get(cfg.categories.economy);
                if (channel) {
                  const embed = new EmbedBuilder()
                    .setTitle('🔄 Reset Hebdomadaire du Karma')
                    .setDescription(`Le karma de ${resetCount} utilisateur(s) a été remis à zéro.`)
                    .setColor(0x00ff00)
                    .setTimestamp();
                  try {
                    await channel.send({ embeds: [embed] });
                  } catch (_) {}
                }
              }
              
              console.log(`[Karma Reset] Guild ${guildId}: Reset ${resetCount} users`);
            }
          } catch (error) {
            console.error(`[Karma Reset] Error for guild ${guildId}:`, error.message);
          }
        }
        
        console.log('[Karma Reset] Weekly karma reset completed');
      }
    } catch (error) {
      console.error('[Karma Reset] Global error:', error.message);
    }
  }, 60 * 1000); // Check every minute
});
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'config') {
      const hasManageGuild = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild) || interaction.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild);
      if (!hasManageGuild) {
        return interaction.reply({ content: '⛔ Cette commande est réservée à l\'équipe de modération.', ephemeral: true });
      }
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = buildTopSectionRow();
      await interaction.reply({ embeds: [embed], components: [...rows], ephemeral: true });
      return;
    }

    // Map: let a user set or view their city location
    if (interaction.isChatInputCommand() && interaction.commandName === 'map') {
      try {
        const city = (interaction.options.getString('ville', true) || '').trim();
        if (!process.env.LOCATIONIQ_TOKEN) return interaction.reply({ content: 'Service de géolocalisation indisponible. Configurez LOCATIONIQ_TOKEN.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const hit = await geocodeCityToCoordinates(city);
        if (!hit) return interaction.editReply({ content: 'Ville introuvable. Essayez: "Ville, Pays".' });
        const stored = await setUserLocation(interaction.guild.id, interaction.user.id, hit.lat, hit.lon, hit.displayName);
        const embed = new EmbedBuilder()
          .setColor(THEME_COLOR_PRIMARY)
          .setTitle('Localisation enregistrée')
          .setDescription(`${interaction.user} → ${stored.city || hit.displayName}`)
          .addFields(
            { name: 'Latitude', value: String(stored.lat), inline: true },
            { name: 'Longitude', value: String(stored.lon), inline: true },
          )
          .setFooter({ text: 'BAG • Localisation', iconURL: THEME_FOOTER_ICON });
        let file = null;
        const buf = await fetchStaticMapBuffer(stored.lat, stored.lon, 10, [{ lat: stored.lat, lon: stored.lon, icon: 'small-blue-cutout' }], 600, 400);
        if (buf) file = { attachment: buf, name: 'map.png' };
        if (!file) {
          const mapUrl = buildStaticMapUrl(stored.lat, stored.lon, 10, [{ lat: stored.lat, lon: stored.lon, icon: 'small-blue-cutout' }], 800, 500);
          if (mapUrl) embed.setImage(mapUrl);
          return interaction.editReply({ embeds: [embed] });
        }
        embed.setImage('attachment://map.png');
        return interaction.editReply({ embeds: [embed], files: [file] });
      } catch (_) {
        return interaction.reply({ content: 'Erreur géolocalisation.', ephemeral: true });
      }
    }

    // Proche: list nearby members within a distance radius
    if (interaction.isChatInputCommand() && interaction.commandName === 'proche') {
      try {
        if (!process.env.LOCATIONIQ_TOKEN) return interaction.reply({ content: 'Service de géolocalisation indisponible. Configurez LOCATIONIQ_TOKEN.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const radius = Math.max(10, Math.min(1000, interaction.options.getInteger('distance') || 200));
        const selfLoc = await getUserLocation(interaction.guild.id, interaction.user.id);
        if (!selfLoc) return interaction.editReply('Définissez d\'abord votre ville avec `/map`');
        const all = await getAllLocations(interaction.guild.id);
        const entries = Object.entries(all).filter(([uid, loc]) => uid !== interaction.user.id && isFinite(loc?.lat) && isFinite(loc?.lon));
        const withDist = await Promise.all(entries.map(async ([uid, loc]) => {
          const km = haversineDistanceKm(selfLoc.lat, selfLoc.lon, Number(loc.lat), Number(loc.lon));
          const mem = interaction.guild.members.cache.get(uid) || await interaction.guild.members.fetch(uid).catch(()=>null);
          return { uid, member: mem, city: String(loc.city||'').trim(), km };
        }));
        const nearby = withDist.filter(x => x.km <= radius).sort((a,b)=>a.km-b.km).slice(0, 25);
        const lines = nearby.length ? nearby.map(x => `${x.member ? x.member : `<@${x.uid}>`} — ${x.km} km${x.city?` • ${x.city}`:''}`).join('\n') : 'Aucun membre à proximité.';
        const embed = new EmbedBuilder()
          .setColor(THEME_COLOR_PRIMARY)
          .setTitle('Membres proches')
          .setDescription(lines)
          .addFields({ name: 'Rayon', value: `${radius} km`, inline: true })
          .setFooter({ text: 'BAG • Localisation', iconURL: THEME_FOOTER_ICON });
        // Build markers: center user in blue, others in red
        const markers = [{ lat: selfLoc.lat, lon: selfLoc.lon, icon: 'small-blue-cutout' }];
        for (const x of nearby) markers.push({ lat: all[x.uid].lat, lon: all[x.uid].lon, icon: 'small-red-cutout' });
        const z = zoomForRadiusKm(radius);
        let file = null;
        const buf = await fetchStaticMapBuffer(selfLoc.lat, selfLoc.lon, z, markers, 600, 400);
        if (buf) file = { attachment: buf, name: 'nearby.png' };
        if (!file) {
          const mapUrl = buildStaticMapUrl(selfLoc.lat, selfLoc.lon, z, markers, 600, 400);
          if (mapUrl) embed.setImage(mapUrl);
          return interaction.editReply({ embeds: [embed] });
        }
        embed.setImage('attachment://nearby.png');
        return interaction.editReply({ embeds: [embed], files: [file] });
      } catch (_) {
        return interaction.reply({ content: 'Erreur proximité.', ephemeral: true });
      }
    }
    // Localisation: admin overview or per-member location
    if (interaction.isChatInputCommand() && interaction.commandName === 'localisation') {
      try {
        const ok = await isStaffMember(interaction.guild, interaction.member);
        if (!ok) return interaction.reply({ content: '⛔ Réservé au staff.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const target = interaction.options.getUser('membre');
        if (target) {
          const loc = await getUserLocation(interaction.guild.id, target.id);
          if (!loc) return interaction.editReply({ content: `Aucune localisation connue pour ${target}.` });
          const url = `https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lon}#map=10/${loc.lat}/${loc.lon}`;
          const embed = new EmbedBuilder()
            .setColor(THEME_COLOR_PRIMARY)
            .setTitle('Localisation membre')
            .setDescription(`${target} — ${loc.city || '—'}`)
            .addFields(
              { name: 'Latitude', value: String(loc.lat), inline: true },
              { name: 'Longitude', value: String(loc.lon), inline: true },
              { name: 'Carte', value: url }
            )
            .setFooter({ text: 'BAG • Localisation', iconURL: THEME_FOOTER_ICON });
          let file = null;
          const buf = await fetchStaticMapBuffer(loc.lat, loc.lon, 10, [{ lat: loc.lat, lon: loc.lon, icon: 'small-blue-cutout' }], 600, 400);
          if (buf) file = { attachment: buf, name: 'member.png' };
          if (!file) {
            const mapUrl = buildStaticMapUrl(loc.lat, loc.lon, 10, [{ lat: loc.lat, lon: loc.lon, icon: 'small-blue-cutout' }], 600, 400);
            if (mapUrl) embed.setImage(mapUrl);
            return interaction.editReply({ embeds: [embed] });
          }
          embed.setImage('attachment://member.png');
          return interaction.editReply({ embeds: [embed], files: [file] });
        }
        const all = await getAllLocations(interaction.guild.id);
        const ids = Object.keys(all);
        const lines = (await Promise.all(ids.slice(0, 25).map(async (uid) => {
          const mem = interaction.guild.members.cache.get(uid) || await interaction.guild.members.fetch(uid).catch(()=>null);
          const loc = all[uid];
          const name = mem ? (mem.nickname || mem.user.username) : uid;
          return `• ${name} — ${loc.city || `${loc.lat}, ${loc.lon}`}`;
        })) ).join('\n') || '—';
        const embed = new EmbedBuilder()
          .setColor(THEME_COLOR_PRIMARY)
          .setTitle('Localisations membres')
          .setDescription(lines)
          .addFields({ name: 'Total', value: String(ids.length), inline: true })
          .setFooter({ text: 'BAG • Localisation', iconURL: THEME_FOOTER_ICON });
        // Try to compute map center and show up to 25 markers
        const points = ids.slice(0, 25).map(uid => ({ lat: Number(all[uid].lat), lon: Number(all[uid].lon) })).filter(p => isFinite(p.lat) && isFinite(p.lon));
        if (points.length) {
          const avgLat = points.reduce((s,p)=>s+p.lat,0)/points.length;
          const avgLon = points.reduce((s,p)=>s+p.lon,0)/points.length;
          const markers = points.map(p => ({ lat: p.lat, lon: p.lon, icon: 'small-red-cutout' }));
          let file = null;
          const buf = await fetchStaticMapBuffer(avgLat, avgLon, 5, markers, 600, 400);
          if (buf) file = { attachment: buf, name: 'members.png' };
          if (!file) {
            const mapUrl = buildStaticMapUrl(avgLat, avgLon, 5, markers, 600, 400);
            if (mapUrl) embed.setImage(mapUrl);
            return interaction.editReply({ embeds: [embed] });
          }
          embed.setImage('attachment://members.png');
          return interaction.editReply({ embeds: [embed], files: [file] });
        }
        return interaction.editReply({ embeds: [embed] });
      } catch (_) {
        return interaction.reply({ content: 'Erreur localisation.', ephemeral: true });
      }
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
        try {
          const rows = await buildEconomyMenuRows(interaction.guild, 'settings');
          await interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
        } catch (error) {
          console.error('Error building economy configuration:', error);
          // Clear economy caches in case of corruption
          clearKarmaCache(interaction.guild.id);
          await interaction.update({ 
            embeds: [embed], 
            components: [buildBackRow()], 
            content: '❌ Erreur lors du chargement de la configuration économie. Cache vidé, réessayez.' 
          });
        }
      } else if (section === 'tickets') {
        const rows = await buildTicketsRows(interaction.guild, 'panel');
        await interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
      } else if (section === 'truthdare') {
        const rows = await buildTruthDareRows(interaction.guild, 'sfw');
        await interaction.update({ embeds: [embed], components: [...rows] });
      } else if (section === 'confess') {
        try {
          const rows = await buildConfessRows(interaction.guild, 'sfw');
          await interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
        } catch (error) {
          console.error('Error building confess configuration:', error);
          await interaction.update({ embeds: [embed], components: [buildBackRow()], content: '❌ Erreur lors du chargement de la configuration confessions.' });
        }
      } else if (section === 'autothread') {
        try {
          const rows = await buildAutoThreadRows(interaction.guild, 0);
          await interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
        } catch (error) {
          console.error('Error building autothread configuration:', error);
          await interaction.update({ embeds: [embed], components: [buildBackRow()], content: '❌ Erreur lors du chargement de la configuration autothread.' });
        }
      } else if (section === 'counting') {
        const rows = await buildCountingRows(interaction.guild);
        await interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
      } else if (section === 'logs') {
        const rows = await buildLogsRows(interaction.guild);
        await interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
      } else if (section === 'booster') {
        const rows = await buildBoosterRows(interaction.guild);
        await interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
      } else {
        await interaction.update({ embeds: [embed], components: [buildBackRow()] });
      }
      return;
    }

    // Tickets config handlers
    if (interaction.isStringSelectMenu() && interaction.customId === 'tickets_menu') {
      const submenu = interaction.values[0];
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTicketsRows(interaction.guild, submenu);
      return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
    }
    if (interaction.isChannelSelectMenu() && interaction.customId === 'tickets_set_category') {
      const { updateTicketsConfig } = require('./storage/jsonStore');
      const catId = interaction.values[0];
      const chan = interaction.guild.channels.cache.get(catId) || await interaction.guild.channels.fetch(catId).catch(()=>null);
      if (!chan || chan.type !== ChannelType.GuildCategory) {
        try { return await interaction.reply({ content: '❌ Catégorie invalide ou introuvable. Sélectionnez une catégorie Discord.', ephemeral: true }); } catch (_) { return; }
      }
      await updateTicketsConfig(interaction.guild.id, { categoryId: catId });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTicketsRows(interaction.guild, 'panel');
      return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
    }
    if (interaction.isChannelSelectMenu() && interaction.customId === 'tickets_set_panel_channel') {
      const { updateTicketsConfig } = require('./storage/jsonStore');
      const chId = interaction.values[0];
      const ch = interaction.guild.channels.cache.get(chId) || await interaction.guild.channels.fetch(chId).catch(()=>null);
      if (!ch || !ch.isTextBased?.()) {
        try { return await interaction.reply({ content: '❌ Salon invalide. Choisissez un salon texte ou annonces.', ephemeral: true }); } catch (_) { return; }
      }
      await updateTicketsConfig(interaction.guild.id, { panelChannelId: chId });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTicketsRows(interaction.guild, 'panel');
      return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
    }
    if (interaction.isChannelSelectMenu() && interaction.customId === 'tickets_set_transcript_channel') {
      const { updateTicketsConfig } = require('./storage/jsonStore');
      const chId = interaction.values[0];
      await updateTicketsConfig(interaction.guild.id, { transcriptChannelId: chId });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTicketsRows(interaction.guild, 'transcript');
      return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'tickets_transcript_style') {
      const style = interaction.values[0];
      const { updateTicketsConfig } = require('./storage/jsonStore');
      await updateTicketsConfig(interaction.guild.id, { transcript: { style } });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTicketsRows(interaction.guild, 'transcript');
      return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'tickets_naming_mode') {
      const mode = interaction.values[0];
      const { getTicketsConfig, updateTicketsConfig } = require('./storage/jsonStore');
      const t = await getTicketsConfig(interaction.guild.id);
      await updateTicketsConfig(interaction.guild.id, { naming: { ...(t.naming||{}), mode } });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTicketsRows(interaction.guild, 'naming');
      return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
    }
    if (interaction.isButton() && interaction.customId === 'tickets_edit_pattern') {
      const { getTicketsConfig } = require('./storage/jsonStore');
      const t = await getTicketsConfig(interaction.guild.id);
      const modal = new ModalBuilder().setCustomId('tickets_edit_pattern_modal').setTitle('Modèle de nom de ticket');
      const hint = '{user}, {cat}, {num}, {date}';
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pattern').setLabel(`Modèle (${hint})`).setStyle(TextInputStyle.Short).setRequired(true).setValue(String(t.naming?.customPattern||'{user}-{num}').slice(0, 80)))
      );
      try { await interaction.showModal(modal); } catch (_) {}
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === 'tickets_edit_pattern_modal') {
      await interaction.deferReply({ ephemeral: true });
      const pattern = (interaction.fields.getTextInputValue('pattern')||'').trim().slice(0, 80);
      const { getTicketsConfig, updateTicketsConfig } = require('./storage/jsonStore');
      const t = await getTicketsConfig(interaction.guild.id);
      await updateTicketsConfig(interaction.guild.id, { naming: { ...(t.naming||{}), customPattern: pattern } });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTicketsRows(interaction.guild, 'naming');
      try { await interaction.editReply({ content: '✅ Modèle mis à jour.' }); } catch (_) {}
      try { await interaction.followUp({ embeds: [embed], components: [buildBackRow(), ...rows], ephemeral: true }); } catch (_) {}
      return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'tickets_pick_cat_ping') {
      const key = interaction.values[0];
      const embed = await buildConfigEmbed(interaction.guild);
      const pingRoles = new RoleSelectMenuBuilder().setCustomId(`tickets_cat_ping_roles:${key}`).setPlaceholder('Rôles staff à ping…').setMinValues(0).setMaxValues(25);
      return interaction.update({ embeds: [embed], components: [buildBackRow(), new ActionRowBuilder().addComponents(pingRoles)] });
    }
    if (interaction.isRoleSelectMenu() && interaction.customId === 'tickets_set_certified_role') {
      const roleId = interaction.values[0];
      const { updateTicketsConfig } = require('./storage/jsonStore');
      await updateTicketsConfig(interaction.guild.id, { certifiedRoleId: roleId });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTicketsRows(interaction.guild, 'certified');
      return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
    }
    if (interaction.isButton() && interaction.customId === 'tickets_clear_certified_role') {
      const { updateTicketsConfig } = require('./storage/jsonStore');
      await updateTicketsConfig(interaction.guild.id, { certifiedRoleId: '' });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTicketsRows(interaction.guild, 'certified');
      return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'tickets_pick_cat_access') {
      const key = interaction.values[0];
      const embed = await buildConfigEmbed(interaction.guild);
      const viewerRoles = new RoleSelectMenuBuilder().setCustomId(`tickets_cat_view_roles:${key}`).setPlaceholder('Rôles ayant accès…').setMinValues(0).setMaxValues(25);
      return interaction.update({ embeds: [embed], components: [buildBackRow(), new ActionRowBuilder().addComponents(viewerRoles)] });
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'tickets_edit_cat') {
      const key = interaction.values[0];
      const { getTicketsConfig } = require('./storage/jsonStore');
      const t = await getTicketsConfig(interaction.guild.id);
      const cat = (t.categories || []).find(c => c.key === key);
      if (!cat) return interaction.reply({ content: 'Catégorie introuvable.', ephemeral: true });
      const pingRoles = new RoleSelectMenuBuilder().setCustomId(`tickets_cat_ping_roles:${key}`).setPlaceholder('Rôles staff à ping…').setMinValues(0).setMaxValues(25);
      const viewerRoles = new RoleSelectMenuBuilder().setCustomId(`tickets_cat_view_roles:${key}`).setPlaceholder('Rôles ayant accès…').setMinValues(0).setMaxValues(25);
      const rowPing = new ActionRowBuilder().addComponents(pingRoles);
      const rowView = new ActionRowBuilder().addComponents(viewerRoles);
      const embed = await buildConfigEmbed(interaction.guild);
      return interaction.update({ embeds: [embed], components: [buildBackRow(), rowPing, rowView] });
    }
    if (interaction.isRoleSelectMenu() && interaction.customId.startsWith('tickets_cat_ping_roles:')) {
      const key = interaction.customId.split(':')[1];
      const { getTicketsConfig, updateTicketsConfig } = require('./storage/jsonStore');
      const t = await getTicketsConfig(interaction.guild.id);
      const categories = (t.categories || []).map(c => c.key === key ? { ...c, staffPingRoleIds: interaction.values } : c);
      await updateTicketsConfig(interaction.guild.id, { categories });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTicketsRows(interaction.guild, 'ping');
      try { await interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] }); }
      catch (_) { try { await interaction.deferUpdate(); } catch (_) {} }
      try { await interaction.followUp({ content: '✅ Rôles ping mis à jour.', ephemeral: true }); } catch (_) {}
      return;
    }
    if (interaction.isRoleSelectMenu() && interaction.customId.startsWith('tickets_cat_view_roles:')) {
      const key = interaction.customId.split(':')[1];
      const { getTicketsConfig, updateTicketsConfig } = require('./storage/jsonStore');
      const t = await getTicketsConfig(interaction.guild.id);
      const categories = (t.categories || []).map(c => c.key === key ? { ...c, extraViewerRoleIds: interaction.values } : c);
      await updateTicketsConfig(interaction.guild.id, { categories });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTicketsRows(interaction.guild, 'access');
      try { await interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] }); }
      catch (_) { try { await interaction.deferUpdate(); } catch (_) {} }
      try { await interaction.followUp({ content: '✅ Rôles d\'accès mis à jour.', ephemeral: true }); } catch (_) {}
      return;
    }
    if (interaction.isButton() && interaction.customId === 'tickets_add_cat') {
      const modal = new ModalBuilder().setCustomId('tickets_add_cat_modal').setTitle('Nouvelle catégorie');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('key').setLabel('Clé (unique)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('label').setLabel('Nom visible').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji (optionnel)').setStyle(TextInputStyle.Short).setRequired(false)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(false))
      );
      try { await interaction.showModal(modal); } catch (_) {}
      return;
    }
    if (interaction.isButton() && interaction.customId === 'tickets_remove_cat') {
      const { getTicketsConfig } = require('./storage/jsonStore');
      const t = await getTicketsConfig(interaction.guild.id);
      if (!Array.isArray(t.categories) || !t.categories.length) return interaction.reply({ content: 'Aucune catégorie à retirer.', ephemeral: true });
      const select = new StringSelectMenuBuilder()
        .setCustomId('tickets_remove_cat_pick')
        .setPlaceholder('Choisir la catégorie à supprimer…')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(...t.categories.slice(0, 25).map(c => ({ label: `${c.emoji ? c.emoji + ' ' : ''}${c.label}`, value: c.key, description: c.key })));
      const embed = await buildConfigEmbed(interaction.guild);
      return interaction.update({ embeds: [embed], components: [buildBackRow(), new ActionRowBuilder().addComponents(select)] });
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'tickets_remove_cat_pick') {
      await interaction.deferReply({ ephemeral: true });
      const key = interaction.values[0];
      const { removeTicketCategory } = require('./storage/jsonStore');
      await removeTicketCategory(interaction.guild.id, key);
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTicketsRows(interaction.guild, 'categories');
      try { await interaction.editReply({ content: '✅ Catégorie supprimée.' }); } catch (_) {}
      try { await interaction.followUp({ embeds: [embed], components: [buildBackRow(), ...rows], ephemeral: true }); } catch (_) {}
      return;
    }
    if (interaction.isButton() && interaction.customId === 'tickets_edit_cat_start') {
      const { getTicketsConfig } = require('./storage/jsonStore');
      const t = await getTicketsConfig(interaction.guild.id);
      if (!Array.isArray(t.categories) || !t.categories.length) return interaction.reply({ content: 'Aucune catégorie à modifier.', ephemeral: true });
      const pick = new StringSelectMenuBuilder()
        .setCustomId('tickets_edit_cat_pick')
        .setPlaceholder('Choisir la catégorie à modifier…')
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(...t.categories.slice(0, 25).map(c => ({ label: `${c.emoji ? c.emoji + ' ' : ''}${c.label}`, value: c.key, description: c.key })));
      const embed = await buildConfigEmbed(interaction.guild);
      return interaction.update({ embeds: [embed], components: [buildBackRow(), new ActionRowBuilder().addComponents(pick)] });
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'tickets_edit_cat_pick') {
      const key = interaction.values[0];
      const { getTicketsConfig } = require('./storage/jsonStore');
      const t = await getTicketsConfig(interaction.guild.id);
      const cat = (t.categories || []).find(c => c.key === key);
      if (!cat) return interaction.reply({ content: 'Catégorie introuvable.', ephemeral: true });
      const modal = new ModalBuilder().setCustomId(`tickets_edit_cat_modal:${key}`).setTitle('Modifier catégorie');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('label').setLabel('Nom visible').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(cat.label||''))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji').setStyle(TextInputStyle.Short).setRequired(false).setValue(String(cat.emoji||''))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(false).setValue(String(cat.description||'')))
      );
      try { await interaction.showModal(modal); } catch (_) {}
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === 'tickets_edit_cat_modal') {
      await interaction.deferReply({ ephemeral: true });
      const key = interaction.customId.split(':')[1];
      const label = (interaction.fields.getTextInputValue('label')||'').trim().slice(0, 50);
      const emoji = (interaction.fields.getTextInputValue('emoji')||'').trim().slice(0, 10);
      const desc = (interaction.fields.getTextInputValue('desc')||'').trim().slice(0, 200);
      if (!label) return interaction.editReply({ content: 'Nom requis.' });
      const { getTicketsConfig, updateTicketsConfig } = require('./storage/jsonStore');
      const t = await getTicketsConfig(interaction.guild.id);
      const categories = (t.categories || []).map(c => c.key === key ? { ...c, label, emoji, description: desc } : c);
      await updateTicketsConfig(interaction.guild.id, { categories });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTicketsRows(interaction.guild, 'categories');
      try { await interaction.editReply({ content: '✅ Catégorie modifiée.' }); } catch (_) {}
      try { await interaction.followUp({ embeds: [embed], components: [buildBackRow(), ...rows], ephemeral: true }); } catch (_) {}
      return;
    }
    if (interaction.isButton() && interaction.customId === 'tickets_post_panel') {
      await interaction.deferReply({ ephemeral: true });
      const { getTicketsConfig, updateTicketsConfig } = require('./storage/jsonStore');
      const t = await getTicketsConfig(interaction.guild.id);
      const panelChannel = interaction.guild.channels.cache.get(t.panelChannelId) || await interaction.guild.channels.fetch(t.panelChannelId).catch(()=>null);
      if (!panelChannel || !panelChannel.isTextBased?.()) {
        return interaction.editReply({ content: 'Configurez d\'abord le salon du panneau.' });
      }
      const embed = new EmbedBuilder()
        .setColor(THEME_COLOR_PRIMARY)
        .setTitle(t.panelTitle || '🎫 Ouvrir un ticket')
        .setDescription(t.panelText || 'Choisissez une catégorie pour créer un ticket. Un membre du staff vous assistera.')
        .setThumbnail(THEME_IMAGE)
        .setFooter({ text: 'BAG • Tickets', iconURL: THEME_TICKET_FOOTER_ICON })
        .setTimestamp(new Date());
      const select = new StringSelectMenuBuilder().setCustomId('ticket_open').setPlaceholder('Sélectionnez une catégorie…').setMinValues(1).setMaxValues(1);
      const opts = (t.categories || []).slice(0, 25).map(c => ({ label: c.label, value: c.key, description: c.description?.slice(0, 90) || undefined, emoji: c.emoji || undefined }));
      if (!opts.length) return interaction.editReply({ content: 'Ajoutez au moins une catégorie de ticket.' });
      select.addOptions(...opts);
      const row = new ActionRowBuilder().addComponents(select);
      const __banner = maybeAttachTicketBanner(embed);
      const msg = await panelChannel.send({ embeds: [embed], components: [row], files: __banner ? [__banner] : [] }).catch(()=>null);
      if (!msg) return interaction.editReply({ content: 'Impossible d\'envoyer le panneau.' });
      await updateTicketsConfig(interaction.guild.id, { panelMessageId: msg.id });
      return interaction.editReply({ content: '✅ Panneau publié.' });
    }
    if (interaction.isButton() && interaction.customId === 'tickets_edit_panel') {
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(()=>null);
      if (!member || !(await isStaffMember(interaction.guild, member))) return interaction.reply({ content: 'Réservé au staff.', ephemeral: true });
      const { getTicketsConfig } = require('./storage/jsonStore');
      const t = await getTicketsConfig(interaction.guild.id);
      const modal = new ModalBuilder().setCustomId('tickets_edit_panel_modal').setTitle('Éditer le panneau');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('title').setLabel('Titre').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(t.panelTitle||'')) ),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('text').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(true).setValue(String(t.panelText||'')) )
      );
      try { await interaction.showModal(modal); } catch (_) {}
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === 'tickets_edit_panel_modal') {
      await interaction.deferReply({ ephemeral: true });
      const title = (interaction.fields.getTextInputValue('title')||'').trim().slice(0, 100);
      const text = (interaction.fields.getTextInputValue('text')||'').trim().slice(0, 1000);
      const { updateTicketsConfig, getTicketsConfig } = require('./storage/jsonStore');
      await updateTicketsConfig(interaction.guild.id, { panelTitle: title, panelText: text });
      // Optionally update existing panel message if configured
      try {
        const t = await getTicketsConfig(interaction.guild.id);
        if (t.panelChannelId && t.panelMessageId) {
          const ch = interaction.guild.channels.cache.get(t.panelChannelId) || await interaction.guild.channels.fetch(t.panelChannelId).catch(()=>null);
          const msg = ch ? (await ch.messages.fetch(t.panelMessageId).catch(()=>null)) : null;
          if (msg) {
            const embed = new EmbedBuilder().setColor(THEME_COLOR_PRIMARY).setTitle(title).setDescription(text).setThumbnail(THEME_IMAGE).setFooter({ text: 'BAG • Tickets', iconURL: THEME_TICKET_FOOTER_ICON }).setTimestamp(new Date());
            const __banner = maybeAttachTicketBanner(embed);
            const { getTicketsConfig } = require('./storage/jsonStore');
            const cfg = await getTicketsConfig(interaction.guild.id);
            const select = new StringSelectMenuBuilder().setCustomId('ticket_open').setPlaceholder('Sélectionnez une catégorie…').setMinValues(1).setMaxValues(1);
            const opts = (cfg.categories || []).slice(0, 25).map(c => ({ label: c.label, value: c.key, description: c.description?.slice(0, 90) || undefined, emoji: c.emoji || undefined }));
            if (opts.length) select.addOptions(...opts);
            const row = new ActionRowBuilder().addComponents(select);
            await msg.edit({ embeds: [embed], components: [row], files: __banner ? [__banner] : [] }).catch(()=>{});
          }
        }
      } catch (_) {}
      return interaction.editReply({ content: '✅ Panneau mis à jour.' });
    }
    if (interaction.isButton() && interaction.customId === 'tickets_toggle_ping_staff') {
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(()=>null);
      if (!member || !(await isStaffMember(interaction.guild, member))) return interaction.reply({ content: 'Réservé au staff.', ephemeral: true });
      const { getTicketsConfig, updateTicketsConfig } = require('./storage/jsonStore');
      const t = await getTicketsConfig(interaction.guild.id);
      const next = !t.pingStaffOnOpen;
      await updateTicketsConfig(interaction.guild.id, { pingStaffOnOpen: next });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTicketsRows(interaction.guild, 'panel');
      return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
    }

    if (interaction.isModalSubmit() && interaction.customId === 'tickets_add_cat_modal') {
      await interaction.deferReply({ ephemeral: true });
      const key = (interaction.fields.getTextInputValue('key')||'').trim().slice(0, 50);
      const label = (interaction.fields.getTextInputValue('label')||'').trim().slice(0, 50);
      const emoji = (interaction.fields.getTextInputValue('emoji')||'').trim().slice(0, 10);
      const desc = (interaction.fields.getTextInputValue('desc')||'').trim().slice(0, 200);
      if (!key || !label) return interaction.editReply({ content: 'Clé et nom requis.' });
      const { addTicketCategory } = require('./storage/jsonStore');
      await addTicketCategory(interaction.guild.id, { key, label, emoji, description: desc });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTicketsRows(interaction.guild, 'categories');
      try { await interaction.editReply({ content: '✅ Catégorie ajoutée.' }); } catch (_) {}
      try { await interaction.followUp({ embeds: [embed], components: [buildBackRow(), ...rows], ephemeral: true }); } catch (_) {}
      return;
    }
    // Ticket open via panel
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_open') {
      await interaction.deferReply({ ephemeral: true });
      const { getTicketsConfig, addTicketRecord } = require('./storage/jsonStore');
      const t = await getTicketsConfig(interaction.guild.id);
      const catKey = interaction.values[0];
      const cat = (t.categories || []).find(c => c.key === catKey);
      if (!cat) return interaction.editReply({ content: 'Catégorie invalide.' });
      const parent = t.categoryId ? (interaction.guild.channels.cache.get(t.categoryId) || await interaction.guild.channels.fetch(t.categoryId).catch(()=>null)) : null;
      const num = (t.counter || 1);
      const sanitize = (s) => String(s || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9_-]+/g, '');
      const now = new Date();
      const userPart = sanitize(interaction.member?.displayName || interaction.user.username);
      const catPart = sanitize(cat.label || cat.key || 'ticket');
      let baseName = 'ticket-' + num;
      const mode = t.naming?.mode || 'ticket_num';
      if (mode === 'member_num') baseName = `${userPart}-${num}`;
      else if (mode === 'category_num') baseName = `${catPart}-${num}`;
      else if (mode === 'numeric') baseName = String(num);
      else if (mode === 'date_num') baseName = `${now.toISOString().slice(0,10)}-${num}`;
      else if (mode === 'custom' && t.naming?.customPattern) {
        const pattern = String(t.naming.customPattern || '{user}-{num}');
        const replaced = pattern
          .replace(/\{num\}/g, String(num))
          .replace(/\{user\}/g, userPart)
          .replace(/\{cat\}/g, catPart)
          .replace(/\{date\}/g, now.toISOString().slice(0,10));
        baseName = sanitize(replaced).replace(/-{2,}/g, '-');
        if (!baseName) baseName = 'ticket-' + num;
      }
      const prefix = cat.emoji ? `${cat.emoji}-` : '';
      const channelName = (prefix + baseName).slice(0, 90);
      const ch = await interaction.guild.channels.create({ name: channelName, parent: parent?.id, type: ChannelType.GuildText, topic: `Ticket ${channelName} • ${interaction.user.tag} • ${cat.label}` }).catch(()=>null);
      if (!ch) return interaction.editReply({ content: 'Impossible de créer le ticket.' });
      await ch.permissionOverwrites?.create?.(interaction.user.id, { ViewChannel: true, SendMessages: true }).catch(()=>{});
      try {
        const staffIds = await getGuildStaffRoleIds(interaction.guild.id);
        for (const rid of staffIds) {
          await ch.permissionOverwrites?.create?.(rid, { ViewChannel: true, SendMessages: true }).catch(()=>{});
        }
      } catch (_) {}
      // Extra viewer roles per-category
      try {
        for (const rid of (cat.extraViewerRoleIds || [])) {
          await ch.permissionOverwrites?.create?.(rid, { ViewChannel: true, SendMessages: true }).catch(()=>{});
        }
      } catch (_) {}
      await addTicketRecord(interaction.guild.id, ch.id, interaction.user.id, catKey);
      const embed = new EmbedBuilder()
        .setColor(THEME_COLOR_PRIMARY)
        .setTitle(`${cat.emoji ? cat.emoji + ' ' : ''}Ticket • ${cat.label}`)
        .setDescription(`${cat.description || 'Expliquez votre demande ci-dessous.'}`)
        .addFields(
          { name: 'Auteur', value: `${interaction.user}`, inline: true },
          { name: 'Catégorie', value: `${cat.label}`, inline: true }
        )
        .setThumbnail(interaction.user.displayAvatarURL?.() || THEME_IMAGE)
        .setFooter({ text: 'BAG • Tickets', iconURL: THEME_TICKET_FOOTER_ICON })
        .setTimestamp(new Date());
      const __banner = maybeAttachTicketBanner(embed);
      const claimBtn = new ButtonBuilder().setCustomId('ticket_claim').setLabel('S\'approprier').setStyle(ButtonStyle.Success);
      const transferBtn = new ButtonBuilder().setCustomId('ticket_transfer').setLabel('Transférer').setStyle(ButtonStyle.Secondary);
      const certifyBtn = new ButtonBuilder().setCustomId('ticket_certify').setLabel('Certifier').setStyle(ButtonStyle.Primary);
      const closeBtn = new ButtonBuilder().setCustomId('ticket_close').setLabel('Fermer').setStyle(ButtonStyle.Danger);
      const row = new ActionRowBuilder().addComponents(claimBtn, transferBtn, certifyBtn, closeBtn);
      // Mention the user and optionally ping staff roles
      let content = `${interaction.user} merci d'expliquer votre demande.`;
      if (t.pingStaffOnOpen) {
        try {
          const pings = (cat.staffPingRoleIds && cat.staffPingRoleIds.length) ? cat.staffPingRoleIds : await getGuildStaffRoleIds(interaction.guild.id);
          if (Array.isArray(pings) && pings.length) content += `\n${pings.map(id => `<@&${id}>`).join(' ')}`;
        } catch (_) {}
      }
      await ch.send({ content, embeds: [embed], components: [row], files: __banner ? [__banner] : [], allowedMentions: { users: [interaction.user.id], roles: t.pingStaffOnOpen ? undefined : [] } }).catch(()=>{});
      await interaction.editReply({ content: `✅ Ticket créé: ${ch}` });
      return;
    }

    if (interaction.isButton() && interaction.customId === 'ticket_claim') {
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(()=>null);
      if (!member) return;
      const isStaff = await isStaffMember(interaction.guild, member);
      if (!isStaff) return interaction.reply({ content: 'Réservé au staff.', ephemeral: true });
      const { setTicketClaim, getTicketsConfig } = require('./storage/jsonStore');
      const rec = await setTicketClaim(interaction.guild.id, interaction.channel.id, interaction.user.id);
      if (!rec) return interaction.reply({ content: 'Ce salon n\'est pas un ticket.', ephemeral: true });
      try { await interaction.deferUpdate(); } catch (_) {}
      const t = await getTicketsConfig(interaction.guild.id);
      const embed = new EmbedBuilder().setColor(THEME_COLOR_ACCENT).setTitle('Ticket pris en charge').setDescription(`${interaction.user} prend en charge ce ticket.`).setFooter({ text: 'BAG • Tickets', iconURL: THEME_TICKET_FOOTER_ICON }).setTimestamp(new Date());
      const __banner = maybeAttachTicketBanner(embed);
      await interaction.channel.send({ embeds: [embed], files: __banner ? [__banner] : [] }).catch(()=>{});
      return;
    }
    if (interaction.isButton() && interaction.customId === 'ticket_close') {
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(()=>null);
      if (!member) return;
      const isStaff = await isStaffMember(interaction.guild, member);
      if (!isStaff) return interaction.reply({ content: 'Réservé au staff.', ephemeral: true });
      const { closeTicketRecord, getTicketsConfig } = require('./storage/jsonStore');
      const rec = await closeTicketRecord(interaction.guild.id, interaction.channel.id);
      if (!rec) return interaction.reply({ content: 'Ce salon n\'est pas un ticket.', ephemeral: true });
      try { await interaction.deferUpdate(); } catch (_) {}
      const t = await getTicketsConfig(interaction.guild.id);
      // Build transcript and send to configured channel; fallback to logs if unset
      try {
        const transcriptChannel = t.transcriptChannelId ? (interaction.guild.channels.cache.get(t.transcriptChannelId) || await interaction.guild.channels.fetch(t.transcriptChannelId).catch(()=>null)) : null;
        let sentTranscript = false;
        async function buildTranscriptPayload() {
          const msgs = await interaction.channel.messages.fetch({ limit: 100 }).catch(()=>null);
          const sorted = msgs ? Array.from(msgs.values()).sort((a,b) => a.createdTimestamp - b.createdTimestamp) : [];
          const lines = [];
          function esc(s) { return String(s||'').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }
          const staffRoleIds = await getGuildStaffRoleIds(interaction.guild.id).catch(()=>[]);
          const htmlLines = [];
          for (const msg of sorted) {
            const when = new Date(msg.createdTimestamp).toISOString();
            const author = msg.author ? `${msg.author.tag}` : 'Unknown';
            const contentTxt = (msg.cleanContent || '');
            const content = contentTxt.replace(/\n/g, ' ');
            lines.push(`[${when}] ${author}: ${content}`);
            let cls = '';
            if (msg.author?.bot) cls = 'bot';
            else if (String(msg.author?.id) === String(rec.userId)) cls = 'member';
            else if (msg.member && Array.isArray(staffRoleIds) && staffRoleIds.some((rid) => msg.member.roles?.cache?.has?.(rid))) cls = 'staff';
            const lineHtml = `<div class=\"msg\"><span class=\"time\">[${esc(when)}]</span> <span class=\"author\">${esc(author)}</span>: <span class=\"content ${cls}\">${esc(contentTxt)}</span></div>`;
            htmlLines.push(lineHtml);
          }
          const head = `Transcription du ticket <#${interaction.channel.id}>\nAuteur: <@${rec.userId}>\nFermé par: ${interaction.user}\nCatégorie: ${rec.categoryKey || '—'}\nOuvert: ${new Date(rec.createdAt||Date.now()).toLocaleString()}\nFermé: ${new Date().toLocaleString()}\n`;
          const text = head + '\n' + (lines.join('\n') || '(aucun message)');
          const file = new AttachmentBuilder(Buffer.from(text, 'utf8'), { name: `transcript-${interaction.channel.id}.txt` });
          const htmlDoc = `<!doctype html><html><head><meta charset=\"utf-8\"><title>Transcription ${esc(interaction.channel.name||interaction.channel.id)}</title><style>body{font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Ubuntu,\"Helvetica Neue\",Arial,sans-serif;background:#0b0f12;color:#e0e6ed;margin:16px} h2{margin:0 0 8px 0} .meta{color:#90a4ae;white-space:pre-wrap;margin-bottom:8px} .time{color:#90a4ae} .msg{margin:4px 0} .content{white-space:pre-wrap} .content.member{color:#4caf50} .content.staff{color:#ffb74d} .content.bot{color:#64b5f6}</style></head><body><h2>Transcription du ticket ${esc(interaction.channel.name||('#'+interaction.channel.id))}</h2><div class=\"meta\">${esc(head)}</div><hr/>${htmlLines.join('\\n')}</body></html>`;
          const fileHtml = new AttachmentBuilder(Buffer.from(htmlDoc, 'utf8'), { name: `transcript-${interaction.channel.id}.html` });
          const color = (t.transcript?.style === 'premium') ? THEME_COLOR_ACCENT : THEME_COLOR_PRIMARY;
          const title = (t.transcript?.style === 'premium') ? '💎 Transcription Premium' : (t.transcript?.style === 'pro' ? '🧾 Transcription Pro' : 'Transcription');
          const tEmbed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(`Ticket: <#${interaction.channel.id}> — Auteur: <@${rec.userId}>`).setTimestamp(new Date()).setFooter({ text: 'BAG • Tickets', iconURL: THEME_TICKET_FOOTER_ICON });
          return { tEmbed, file, fileHtml };
        }
        if (transcriptChannel && transcriptChannel.isTextBased?.()) {
          const payload = await buildTranscriptPayload();
          const __bannerT = maybeAttachTicketBanner(payload.tEmbed);
          const files = __bannerT ? [payload.file, payload.fileHtml, __bannerT] : [payload.file, payload.fileHtml];
          await transcriptChannel.send({ content: `<@${rec.userId}>`, embeds: [payload.tEmbed], files, allowedMentions: { users: [rec.userId] } }).catch(()=>{});
          sentTranscript = true;
        }
        if (!sentTranscript) {
          try {
            const { getLogsConfig } = require('./storage/jsonStore');
            const logs = await getLogsConfig(interaction.guild.id);
            const fallbackId = (logs.channels && (logs.channels.messages || logs.channels.backup || logs.channels.moderation)) || logs.channelId || '';
            if (fallbackId) {
              const fb = interaction.guild.channels.cache.get(fallbackId) || await interaction.guild.channels.fetch(fallbackId).catch(()=>null);
              if (fb && fb.isTextBased?.()) {
                const payload = await buildTranscriptPayload();
                const __bannerT = maybeAttachTicketBanner(payload.tEmbed);
                const files = __bannerT ? [payload.file, payload.fileHtml, __bannerT] : [payload.file, payload.fileHtml];
                await fb.send({ content: `<@${rec.userId}>`, embeds: [payload.tEmbed], files, allowedMentions: { users: [rec.userId] } }).catch(()=>{});
                sentTranscript = true;
              }
            }
          } catch (_) {}
        }
      } catch (_) {}
      const embed = new EmbedBuilder().setColor(THEME_COLOR_PRIMARY).setTitle('Ticket fermé').setDescription(`Fermé par ${interaction.user}.`).setFooter({ text: 'BAG • Tickets', iconURL: THEME_TICKET_FOOTER_ICON }).setTimestamp(new Date());
      const __banner = maybeAttachTicketBanner(embed);
      await interaction.channel.send({ embeds: [embed], files: __banner ? [__banner] : [] }).catch(()=>{});
      // Optionally lock channel
      try { await interaction.channel.permissionOverwrites?.edit?.(rec.userId, { ViewChannel: false }); } catch (_) {}
      try { setTimeout(() => { try { interaction.channel?.delete?.('Ticket fermé'); } catch (_) {} }, 5000); } catch (_) {}
      return;
    }
    if (interaction.isButton() && interaction.customId === 'ticket_certify') {
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(()=>null);
      if (!member) return;
      const isStaff = await isStaffMember(interaction.guild, member);
      if (!isStaff) return interaction.reply({ content: 'Réservé au staff.', ephemeral: true });
      const { getTicketsConfig } = require('./storage/jsonStore');
      const t = await getTicketsConfig(interaction.guild.id);
      const roleId = t.certifiedRoleId;
      if (!roleId) return interaction.reply({ content: 'Aucun rôle certifié configuré. Configurez-le via /config → Tickets → Rôle certifié.', ephemeral: true });
      const rec = (t.records || {})[String(interaction.channel.id)];
      if (!rec || !rec.userId) return interaction.reply({ content: 'Ce salon n\'est pas un ticket.', ephemeral: true });
      const targetMember = await interaction.guild.members.fetch(rec.userId).catch(()=>null);
      if (!targetMember) return interaction.reply({ content: 'Auteur du ticket introuvable.', ephemeral: true });
      const role = interaction.guild.roles.cache.get(roleId) || await interaction.guild.roles.fetch(roleId).catch(()=>null);
      if (!role) return interaction.reply({ content: 'Rôle certifié introuvable sur ce serveur. Reconfigurez-le.', ephemeral: true });
      if (targetMember.roles.cache.has(role.id)) return interaction.reply({ content: 'Ce membre est déjà certifié.', ephemeral: true });
      try {
        await targetMember.roles.add(role.id, `Certification via ticket ${interaction.channel.id} par ${interaction.user.tag}`);
      } catch (err) {
        return interaction.reply({ content: `Impossible d'attribuer le rôle (permissions manquantes ?).`, ephemeral: true });
      }
      try { await interaction.deferUpdate(); } catch (_) {}
      const embed = new EmbedBuilder()
        .setColor(THEME_COLOR_ACCENT)
        .setTitle('Membre certifié')
        .setDescription(`${targetMember} a reçu le rôle ${role} par ${interaction.user}.`)
        .setFooter({ text: 'BAG • Tickets', iconURL: THEME_TICKET_FOOTER_ICON })
        .setTimestamp(new Date());
      const __banner = maybeAttachTicketBanner(embed);
      await interaction.channel.send({ embeds: [embed], files: __banner ? [__banner] : [] }).catch(()=>{});
      return;
    }

    if (interaction.isButton() && interaction.customId === 'ticket_transfer') {
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(()=>null);
      if (!member) return;
      const isStaff = await isStaffMember(interaction.guild, member);
      if (!isStaff) return interaction.reply({ content: 'Réservé au staff.', ephemeral: true });
      const select = new UserSelectMenuBuilder()
        .setCustomId('ticket_transfer_select')
        .setPlaceholder('Choisir le membre du staff destinataire…')
        .setMinValues(1)
        .setMaxValues(1);
      const row = new ActionRowBuilder().addComponents(select);
      return interaction.reply({ content: 'Sélectionnez le destinataire du ticket.', components: [row], ephemeral: true });
    }
    if (interaction.isUserSelectMenu() && interaction.customId === 'ticket_transfer_select') {
      const member = await interaction.guild.members.fetch(interaction.user.id).catch(()=>null);
      if (!member) return;
      const isStaff = await isStaffMember(interaction.guild, member);
      if (!isStaff) return interaction.reply({ content: 'Réservé au staff.', ephemeral: true });
      const targetId = interaction.values[0];
      const targetMember = await interaction.guild.members.fetch(targetId).catch(()=>null);
      if (!targetMember) return interaction.reply({ content: 'Membre introuvable.', ephemeral: true });
      const targetIsStaff = await isStaffMember(interaction.guild, targetMember);
      if (!targetIsStaff) return interaction.reply({ content: 'Le destinataire doit être membre du staff.', ephemeral: true });
      const { setTicketClaim } = require('./storage/jsonStore');
      const rec = await setTicketClaim(interaction.guild.id, interaction.channel.id, targetId);
      if (!rec) return interaction.reply({ content: 'Ce salon n\'est pas un ticket.', ephemeral: true });
      try { await interaction.update({ content: '✅ Ticket transféré.', components: [] }); } catch (_) {}
      const embed = new EmbedBuilder()
        .setColor(THEME_COLOR_ACCENT)
        .setTitle('Ticket transféré')
        .setDescription(`Transféré à ${targetMember} par ${interaction.user}.`)
        .setFooter({ text: 'BAG • Tickets', iconURL: THEME_TICKET_FOOTER_ICON })
        .setTimestamp(new Date());
      const __banner = maybeAttachTicketBanner(embed);
      await interaction.channel.send({ embeds: [embed], files: __banner ? [__banner] : [] }).catch(()=>{});
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'economy_menu') {
      try {
        const page = interaction.values[0];
        
        // Validate page value
        if (!['settings', 'actions', 'karma', 'suites', 'shop'].includes(page)) {
          return interaction.reply({ content: '❌ Page d\'économie invalide.', ephemeral: true });
        }
        
        const embed = await buildConfigEmbed(interaction.guild);
        const topRows = buildTopSectionRow();
        const baseRows = [topRows[0]]; // n'utiliser que la première rangée (sélecteur de section)
        let rows;
        
        if (page === 'suites') {
          rows = [buildEconomyMenuSelect(page), ...(await buildSuitesRows(interaction.guild))];
        } else if (page === 'shop') {
          rows = [buildEconomyMenuSelect(page), ...(await buildShopRows(interaction.guild))];
        } else if (page === 'karma') {
          // Karma renvoie déjà 4 rangées; on n'ajoute pas buildEconomyMenuSelect pour éviter d'excéder 5 rangées au total avec la barre du haut
          rows = await buildEconomyMenuRows(interaction.guild, page);
        } else {
          rows = await buildEconomyMenuRows(interaction.guild, page);
        }
        
        // Discord permet max 5 rangées par message
        const limited = [...baseRows, ...rows].slice(0, 5);
        return interaction.update({ embeds: [embed], components: limited });
      } catch (error) {
        console.error('[Economy] Menu navigation failed:', error.message);
        console.error('[Economy] Menu stack trace:', error.stack);
        
        // Clear caches and provide fallback
        clearKarmaCache(interaction.guild.id);
        
        try {
          const embed = await buildConfigEmbed(interaction.guild);
          const backRow = buildBackRow();
          return interaction.update({ embeds: [embed], components: [backRow], content: '❌ Erreur lors de la navigation dans les menus économie. Cache vidé, retournez au menu principal.' });
        } catch (fallbackError) {
          console.error('[Economy] Fallback failed:', fallbackError.message);
          return interaction.reply({ content: '❌ Erreur critique dans la configuration économie.', ephemeral: true }).catch(() => {});
        }
      }
    }
    // Boutique config handlers
    if (interaction.isButton() && interaction.customId === 'shop_add_role') {
      const modal = new ModalBuilder().setCustomId('shop_add_role_modal').setTitle('Ajouter un rôle à la boutique');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roleId').setLabel('ID du rôle').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('price').setLabel('Prix').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duration').setLabel('Durée jours (0=permanent)').setStyle(TextInputStyle.Short).setRequired(true))
      );
      try { return await interaction.showModal(modal); } catch (error) { 
        console.error('[Modal Error]', error.message);
        return interaction.reply({ content: '❌ Erreur lors de l\'ouverture du formulaire. Veuillez réessayer.', ephemeral: true }).catch(() => {});
      }
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
      try { return await interaction.showModal(modal); } catch (error) { 
        console.error('[Modal Error]', error.message);
        return interaction.reply({ content: '❌ Erreur lors de l\'ouverture du formulaire. Veuillez réessayer.', ephemeral: true }).catch(() => {});
      }
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
    if (interaction.isStringSelectMenu() && (interaction.customId === 'economy_actions_pick' || interaction.customId.startsWith('economy_actions_pick:'))) {
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
      try { return await interaction.showModal(modal); } catch (error) { 
        console.error('[Modal Error]', error.message);
        return interaction.reply({ content: '❌ Erreur lors de l\'ouverture du formulaire. Veuillez réessayer.', ephemeral: true }).catch(() => {});
      }
    }
    if (interaction.isButton() && interaction.customId.startsWith('economy_action_edit_karma:')) {
      const key = interaction.customId.split(':')[1];
      const eco = await getEconomyConfig(interaction.guild.id);
      const c = (eco.actions?.config || {})[key] || {};
      const modal = new ModalBuilder().setCustomId(`economy_action_karma_modal:${key}`).setTitle('Réglages Karma');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('karma').setLabel("Type (charm/perversion/none)").setStyle(TextInputStyle.Short).setRequired(true).setValue(String(c.karma||'none'))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('karmaDelta').setLabel('Delta (succès)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(c.karmaDelta||0))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('failMoneyMin').setLabel('Argent min (échec)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(c.failMoneyMin||0))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('failMoneyMax').setLabel('Argent max (échec)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(c.failMoneyMax||0))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('failKarmaDelta').setLabel('Delta Karma (échec)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(c.failKarmaDelta||0)))
      );
      try { 
        return await interaction.showModal(modal); 
      } catch (error) { 
        console.error('[Karma] Failed to show karma modal:', error.message);
        return interaction.reply({ content: '❌ Erreur lors de l\'ouverture du formulaire karma. Veuillez réessayer.', ephemeral: true }).catch(() => {});
      }
    }
    if (interaction.isButton() && interaction.customId.startsWith('economy_action_edit_partner:')) {
      const key = interaction.customId.split(':')[1];
      const eco = await getEconomyConfig(interaction.guild.id);
      const c = (eco.actions?.config || {})[key] || {};
      const modal = new ModalBuilder().setCustomId(`economy_action_partner_modal:${key}`).setTitle('Récompenses partenaire');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('partnerMoneyShare').setLabel('Part argent (mult.)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(c.partnerMoneyShare||0))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('partnerKarmaShare').setLabel('Part karma (mult.)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(c.partnerKarmaShare||0)))
      );
      try { return await interaction.showModal(modal); } catch (error) { 
        console.error('[Modal Error]', error.message);
        return interaction.reply({ content: '❌ Erreur lors de l\'ouverture du formulaire. Veuillez réessayer.', ephemeral: true }).catch(() => {});
      }
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
      try {
        await interaction.deferReply({ ephemeral: true });
        
        const key = interaction.customId.split(':')[1];
        if (!key) {
          return interaction.editReply({ content: '❌ Clé d\'action manquante.' });
        }
        
        const eco = await getEconomyConfig(interaction.guild.id);
        const c = (eco.actions?.config || {})[key] || {};
        
        const karma = String((interaction.fields.getTextInputValue('karma')||'none').trim()).toLowerCase();
        const karmaDelta = Number((interaction.fields.getTextInputValue('karmaDelta')||'0').trim());
        const failMoneyMin = Number((interaction.fields.getTextInputValue('failMoneyMin')||'0').trim());
        const failMoneyMax = Number((interaction.fields.getTextInputValue('failMoneyMax')||'0').trim());
        const failKarmaDelta = Number((interaction.fields.getTextInputValue('failKarmaDelta')||'0').trim());
        
        // Validate karma type
        if (!['charm','perversion','none'].includes(karma)) {
          return interaction.editReply({ content: '❌ Type karma invalide. Utilisez: charm, perversion ou none.' });
        }
        
        // Validate numeric values
        if (isNaN(karmaDelta) || isNaN(failMoneyMin) || isNaN(failMoneyMax) || isNaN(failKarmaDelta)) {
          return interaction.editReply({ content: '❌ Valeurs numériques invalides.' });
        }
        
        // Ensure structure exists
        if (!eco.actions) eco.actions = {};
        if (!eco.actions.config) eco.actions.config = {};
        
        eco.actions.config[key] = { 
          ...(c||{}), 
          karma, 
          karmaDelta: Math.max(0, karmaDelta), 
          failMoneyMin: Math.max(0, failMoneyMin), 
          failMoneyMax: Math.max(0, failMoneyMax), 
          failKarmaDelta: Math.max(0, failKarmaDelta) 
        };
        
        await updateEconomyConfig(interaction.guild.id, eco);
        return interaction.editReply({ content: `✅ Karma mis à jour pour l'action "${key}".` });
      } catch (error) {
        console.error('[Karma] Modal submission failed:', error.message);
        console.error('[Karma] Modal stack trace:', error.stack);
        return interaction.editReply({ content: '❌ Erreur lors de la sauvegarde des réglages karma.' }).catch(() => {});
      }
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('economy_action_partner_modal:')) {
      await interaction.deferReply({ ephemeral: true });
      const key = interaction.customId.split(':')[1];
      const eco = await getEconomyConfig(interaction.guild.id);
      const c = (eco.actions?.config || {})[key] || {};
      const partnerMoneyShare = Number((interaction.fields.getTextInputValue('partnerMoneyShare')||'0').trim());
      const partnerKarmaShare = Number((interaction.fields.getTextInputValue('partnerKarmaShare')||'0').trim());
      if (!eco.actions) eco.actions = {};
      if (!eco.actions.config) eco.actions.config = {};
      eco.actions.config[key] = { ...(c||{}), partnerMoneyShare, partnerKarmaShare };
      await updateEconomyConfig(interaction.guild.id, eco);
      return interaction.editReply({ content: '✅ Récompenses partenaire mises à jour.' });
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
    if (interaction.isButton() && interaction.customId === 'suites_edit_prices') {
      const eco = await getEconomyConfig(interaction.guild.id);
      const prices = eco.suites?.prices || { day: 0, week: 0, month: 0 };
      const modal = new ModalBuilder().setCustomId('suites_prices_modal').setTitle('Tarifs des suites privées');
      const day = new TextInputBuilder().setCustomId('day').setLabel('Prix 1 jour').setStyle(TextInputStyle.Short).setPlaceholder(String(prices.day||0)).setRequired(true);
      const week = new TextInputBuilder().setCustomId('week').setLabel('Prix 7 jours').setStyle(TextInputStyle.Short).setPlaceholder(String(prices.week||0)).setRequired(true);
      const month = new TextInputBuilder().setCustomId('month').setLabel('Prix 30 jours').setStyle(TextInputStyle.Short).setPlaceholder(String(prices.month||0)).setRequired(true);
      modal.addComponents(
        new ActionRowBuilder().addComponents(day),
        new ActionRowBuilder().addComponents(week),
        new ActionRowBuilder().addComponents(month),
      );
      await interaction.showModal(modal);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === 'suites_prices_modal') {
      await interaction.deferReply({ ephemeral: true });
      const day = Math.max(0, Number((interaction.fields.getTextInputValue('day')||'0').trim()));
      const week = Math.max(0, Number((interaction.fields.getTextInputValue('week')||'0').trim()));
      const month = Math.max(0, Number((interaction.fields.getTextInputValue('month')||'0').trim()));
      if (!Number.isFinite(day) || !Number.isFinite(week) || !Number.isFinite(month)) {
        return interaction.editReply({ content: '❌ Valeurs invalides.' });
      }
      const eco = await getEconomyConfig(interaction.guild.id);
      const suites = { ...(eco.suites || {}), prices: { day, week, month } };
      await updateEconomyConfig(interaction.guild.id, { suites });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = [buildEconomyMenuSelect('suites'), ...(await buildSuitesRows(interaction.guild))];
      await interaction.editReply({ content: '✅ Tarifs des suites mis à jour.' });
      try { await interaction.followUp({ embeds: [embed], components: [...rows], ephemeral: true }); } catch (_) {}
      return;
    }
    if (interaction.isButton() && interaction.customId === 'config_back_home') {
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = buildTopSectionRow();
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    // Economy diagnostic button
    if (interaction.isButton() && interaction.customId === 'config_economy_diagnostic') {
      try {
        await interaction.deferReply({ ephemeral: true });
        
        const diagnostic = await diagnoseEconomyKarmaIssues(interaction.guild.id);
        
        let diagnosticText = '🔧 **Diagnostic Économie/Karma**\n\n';
        
        if (diagnostic.issues.length === 0) {
          diagnosticText += '✅ Aucun problème détecté dans la structure économie/karma.\n\n';
        } else {
          diagnosticText += '❌ **Problèmes détectés:**\n';
          diagnostic.issues.forEach(issue => {
            diagnosticText += `• ${issue}\n`;
          });
          diagnosticText += '\n';
        }
        
        diagnosticText += '📊 **État des caches:**\n';
        diagnosticText += `• Types karma: ${diagnostic.cacheInfo.karmaType} entrées\n`;
        diagnosticText += `• Sélections karma: ${diagnostic.cacheInfo.karmaSel} entrées\n`;
        diagnosticText += `• Actions courantes: ${diagnostic.cacheInfo.actionCurrent} entrées\n\n`;
        
        diagnosticText += '🔄 **Actions de réparation effectuées:**\n';
        diagnosticText += '• Validation et nettoyage des caches\n';
        diagnosticText += '• Vérification de la structure des données\n';
        diagnosticText += '• Initialisation des structures manquantes\n\n';
        
        diagnosticText += '💡 **Recommandations:**\n';
        if (diagnostic.issues.length > 0) {
          diagnosticText += '• Redémarrez le bot si les problèmes persistent\n';
          diagnosticText += '• Vérifiez les logs pour plus de détails\n';
        } else {
          diagnosticText += '• Le système semble fonctionnel\n';
          diagnosticText += '• Si vous rencontrez encore des problèmes, contactez le support\n';
        }
        
        // Clear caches as part of diagnostic
        clearKarmaCache(interaction.guild.id);
        initializeEconomyCaches();
        
        return interaction.editReply({ content: diagnosticText });
      } catch (error) {
        console.error('[Diagnostic] Failed:', error.message);
        return interaction.editReply({ content: '❌ Erreur lors du diagnostic. Consultez les logs.' }).catch(() => {});
      }
    }
    // Karma error retry handler
    if (interaction.isButton() && interaction.customId === 'karma_error_retry') {
      try {
        // Clear all karma-related cache for this guild
        clearKarmaCache(interaction.guild.id);
        
        // Validate guild and interaction
        if (!interaction.guild || !interaction.guild.id) {
          throw new Error('Invalid guild in interaction');
        }
        
        // Run diagnostic to identify issues
        await diagnoseEconomyKarmaIssues(interaction.guild.id);
        
        const embed = await buildConfigEmbed(interaction.guild);
        const rows = await buildEconomyMenuRows(interaction.guild, 'karma');
        return interaction.update({ embeds: [embed], components: [...rows] });
      } catch (error) {
        console.error('[Karma] Retry failed:', error.message);
        console.error('[Karma] Retry stack trace:', error.stack);
        
        // Try to provide a fallback interface
        try {
          const embed = await buildConfigEmbed(interaction.guild);
          const backRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('config_back_home')
              .setLabel('← Retour config principale')
              .setStyle(ButtonStyle.Secondary)
          );
          return interaction.update({ 
            embeds: [embed], 
            components: [backRow],
            content: '❌ Erreur persistante avec la configuration karma. Retournez au menu principal et réessayez.'
          });
        } catch (fallbackError) {
          console.error('[Karma] Fallback failed:', fallbackError.message);
          return interaction.reply({ content: '❌ Impossible de charger la configuration karma. Contactez un administrateur.', ephemeral: true }).catch(() => {});
        }
      }
    }
    // Karma type switch
    if (interaction.isStringSelectMenu() && interaction.customId === 'eco_karma_type') {
      try {
        const type = interaction.values[0];
        
        // Validate type
        if (!['shop', 'actions', 'grants'].includes(type)) {
          return interaction.reply({ content: '❌ Type de karma invalide.', ephemeral: true });
        }
        
        initializeEconomyCaches();
        client._ecoKarmaType.set(interaction.guild.id, type);
        
        // Clear previous selections for this guild when switching types
        clearKarmaCache(interaction.guild.id);
        client._ecoKarmaType.set(interaction.guild.id, type); // Reset the type after clearing
        
        const embed = await buildConfigEmbed(interaction.guild);
        const rows = await buildEconomyMenuRows(interaction.guild, 'karma');
        return interaction.update({ embeds: [embed], components: [...rows] });
      } catch (error) {
        console.error('[Karma] Type switch failed:', error.message);
        return interaction.reply({ content: '❌ Erreur lors du changement de type karma.', ephemeral: true }).catch(() => {});
      }
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
    if (interaction.isRoleSelectMenu && interaction.isRoleSelectMenu() && interaction.customId === 'booster_roles_add') {
      const eco = await getEconomyConfig(interaction.guild.id);
      const b = eco.booster || {};
      const current = new Set(Array.isArray(b.roles) ? b.roles : []);
      for (const rid of interaction.values) current.add(rid);
      b.roles = Array.from(current);
      await updateEconomyConfig(interaction.guild.id, { booster: b });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildBoosterRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'booster_roles_remove') {
      const eco = await getEconomyConfig(interaction.guild.id);
      const b = eco.booster || {};
      const current = new Set(Array.isArray(b.roles) ? b.roles : []);
      for (const rid of interaction.values) current.delete(rid);
      b.roles = Array.from(current);
      await updateEconomyConfig(interaction.guild.id, { booster: b });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildBoosterRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    // Karma delete selected
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('eco_karma_rules:')) {
      try {
        // Validate interaction state
        if (!interaction.guild || !interaction.guild.id) {
          throw new Error('Invalid guild in karma rules interaction');
        }
        
        if (!interaction.values || !Array.isArray(interaction.values)) {
          throw new Error('Invalid values in karma rules interaction');
        }
        
        // store selection in memory until delete click
        const type = interaction.customId.split(':')[1] || 'shop';
        
        // Validate type
        if (!['shop', 'actions', 'grants'].includes(type)) {
          return interaction.reply({ content: '❌ Type de règle karma invalide.', ephemeral: true });
        }
        
        // Filter out 'none' values and validate indices
        const validValues = interaction.values.filter(v => v !== 'none' && !isNaN(Number(v)));
        
        if (!client._ecoKarmaSel) client._ecoKarmaSel = new Map();
        client._ecoKarmaSel.set(`${interaction.guild.id}:${type}`, validValues);
        
        await interaction.deferUpdate(); 
      } catch (error) { 
        console.error('[Karma] Failed to process karma rules selection:', error.message);
        console.error('[Karma] Selection stack trace:', error.stack);
        
        // Try to reply with error if defer failed
        try {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Erreur lors de la sélection des règles karma.', ephemeral: true });
          } else {
            await interaction.followUp({ content: '❌ Erreur lors de la sélection des règles karma.', ephemeral: true });
          }
        } catch (replyError) {
          console.error('[Karma] Failed to send error message:', replyError.message);
        }
      }
    }
    if (interaction.isButton() && interaction.customId === 'eco_karma_delete') {
      try {
        await interaction.deferReply({ ephemeral: true });
        
        const type = (client._ecoKarmaType?.get?.(interaction.guild.id)) || 'shop';
        const key = `${interaction.guild.id}:${type}`;
        const sel = client._ecoKarmaSel?.get?.(key) || [];
        
        if (!sel.length) {
          return interaction.editReply({ content: '❌ Aucune règle sélectionnée pour suppression.' });
        }
        
        const eco = await getEconomyConfig(interaction.guild.id);
        
        // Ensure karmaModifiers structure exists
        if (!eco.karmaModifiers || typeof eco.karmaModifiers !== 'object') {
          eco.karmaModifiers = { shop: [], actions: [], grants: [] };
        }
        
        let list = Array.isArray(eco.karmaModifiers?.[type]) ? eco.karmaModifiers[type] : [];
        const idxs = new Set(sel.map(v => Number(v)).filter(n => !isNaN(n)));
        
        const originalLength = list.length;
        list = list.filter((_, i) => !idxs.has(i));
        const deletedCount = originalLength - list.length;
        
        eco.karmaModifiers = { ...(eco.karmaModifiers||{}), [type]: list };
        await updateEconomyConfig(interaction.guild.id, eco);
        
        // Clear selection after successful deletion
        client._ecoKarmaSel?.delete?.(key);
        
        const embed = await buildConfigEmbed(interaction.guild);
        const rows = await buildEconomyMenuRows(interaction.guild, 'karma');
        
        await interaction.editReply({ content: `✅ ${deletedCount} règle(s) supprimée(s).` });
        return interaction.followUp({ embeds: [embed], components: [...rows], ephemeral: true });
      } catch (error) {
        console.error('[Karma] Delete failed:', error.message);
        return interaction.editReply({ content: '❌ Erreur lors de la suppression des règles karma.' }).catch(() => {});
      }
    }
    if (interaction.isButton() && interaction.customId === 'eco_karma_edit') {
      try {
        const type = (client._ecoKarmaType?.get?.(interaction.guild.id)) || 'shop';
        const sel = client._ecoKarmaSel?.get?.(`${interaction.guild.id}:${type}`) || [];
        
        if (!sel.length) {
          return interaction.reply({ content: 'Sélectionnez d\'abord une règle à modifier.', ephemeral: true });
        }
        
        const idx = Number(sel[0]);
        if (isNaN(idx)) {
          return interaction.reply({ content: '❌ Index de règle invalide.', ephemeral: true });
        }
        
        const eco = await getEconomyConfig(interaction.guild.id);
        
        // Ensure karmaModifiers structure exists
        if (!eco.karmaModifiers || typeof eco.karmaModifiers !== 'object') {
          eco.karmaModifiers = { shop: [], actions: [], grants: [] };
        }
        
        const list = Array.isArray(eco.karmaModifiers?.[type]) ? eco.karmaModifiers[type] : [];
        const rule = list[idx];
        
        if (!rule) {
          return interaction.reply({ content: '❌ Règle introuvable. La liste a peut-être été modifiée.', ephemeral: true });
        }
        
        if (type === 'grants') {
          const modal = new ModalBuilder().setCustomId(`eco_karma_edit_grant:${idx}`).setTitle('Modifier grant');
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nom de la règle (optionnel)').setStyle(TextInputStyle.Short).setRequired(false).setValue(String(rule.name||''))),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('condition').setLabel('Condition (ex: charm>10)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(rule.condition||''))),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('money').setLabel('Montant (+/-)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(rule.money||0)))
          );
          try { 
            return await interaction.showModal(modal); 
          } catch (error) { 
            console.error('[Karma] Failed to show karma grant edit modal:', error.message);
            return interaction.reply({ content: '❌ Erreur lors de l\'ouverture du formulaire d\'édition grant karma.', ephemeral: true }).catch(() => {});
          }
        } else {
          const modal = new ModalBuilder().setCustomId(`eco_karma_edit_perc:${type}:${idx}`).setTitle('Modifier règle (%)');
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nom de la règle (optionnel)').setStyle(TextInputStyle.Short).setRequired(false).setValue(String(rule.name||''))),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('condition').setLabel('Condition (ex: charm>10)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(rule.condition||''))),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('percent').setLabel('Pourcentage (+/-)').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(rule.percent||0)))
          );
          try { 
            return await interaction.showModal(modal); 
          } catch (error) { 
            console.error('[Karma] Failed to show karma percentage edit modal:', error.message);
            return interaction.reply({ content: '❌ Erreur lors de l\'ouverture du formulaire d\'édition règle karma.', ephemeral: true }).catch(() => {});
          }
        }
      } catch (error) {
        console.error('[Karma] Edit button failed:', error.message);
        return interaction.reply({ content: '❌ Erreur lors de l\'édition des règles karma.', ephemeral: true }).catch(() => {});
      }
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('eco_karma_edit_grant:')) {
      try {
        await interaction.deferReply({ ephemeral: true });
        
        const idx = Number(interaction.customId.split(':')[1]);
        if (isNaN(idx)) {
          return interaction.editReply({ content: '❌ Index de règle invalide.' });
        }
        
        const name = (interaction.fields.getTextInputValue('name')||'').trim();
        const condition = (interaction.fields.getTextInputValue('condition')||'').trim();
        const money = Number((interaction.fields.getTextInputValue('money')||'0').trim());
        
        // Validate inputs
        if (!condition) {
          return interaction.editReply({ content: '❌ La condition est requise.' });
        }
        
        if (isNaN(money)) {
          return interaction.editReply({ content: '❌ Montant invalide.' });
        }
        
        const eco = await getEconomyConfig(interaction.guild.id);
        
        // Ensure structure exists
        if (!eco.karmaModifiers || typeof eco.karmaModifiers !== 'object') {
          eco.karmaModifiers = { shop: [], actions: [], grants: [] };
        }
        
        const list = Array.isArray(eco.karmaModifiers?.grants) ? eco.karmaModifiers.grants : [];
        
        if (idx < 0 || idx >= list.length || !list[idx]) {
          return interaction.editReply({ content: '❌ Règle introuvable. La liste a peut-être été modifiée.' });
        }
        
        list[idx] = { name: name || null, condition, money };
        eco.karmaModifiers = { ...(eco.karmaModifiers||{}), grants: list };
        await updateEconomyConfig(interaction.guild.id, eco);
        return interaction.editReply({ content: '✅ Grant modifié avec succès.' });
      } catch (error) {
        console.error('[Karma] Grant edit submission failed:', error.message);
        return interaction.editReply({ content: '❌ Erreur lors de la modification du grant.' }).catch(() => {});
      }
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('eco_karma_edit_perc:')) {
      try {
        await interaction.deferReply({ ephemeral: true });
        
        const [, type, idxStr] = interaction.customId.split(':');
        const idx = Number(idxStr);
        
        // Validate inputs
        if (!type || !['shop', 'actions'].includes(type)) {
          return interaction.editReply({ content: '❌ Type de règle invalide.' });
        }
        
        if (isNaN(idx)) {
          return interaction.editReply({ content: '❌ Index de règle invalide.' });
        }
        
        const name = (interaction.fields.getTextInputValue('name')||'').trim();
        const condition = (interaction.fields.getTextInputValue('condition')||'').trim();
        const percent = Number((interaction.fields.getTextInputValue('percent')||'0').trim());
        
        // Validate inputs
        if (!condition) {
          return interaction.editReply({ content: '❌ La condition est requise.' });
        }
        
        if (isNaN(percent)) {
          return interaction.editReply({ content: '❌ Pourcentage invalide.' });
        }
        
        const eco = await getEconomyConfig(interaction.guild.id);
        
        // Ensure structure exists
        if (!eco.karmaModifiers || typeof eco.karmaModifiers !== 'object') {
          eco.karmaModifiers = { shop: [], actions: [], grants: [] };
        }
        
        const list = Array.isArray(eco.karmaModifiers?.[type]) ? eco.karmaModifiers[type] : [];
        
        if (idx < 0 || idx >= list.length || !list[idx]) {
          return interaction.editReply({ content: '❌ Règle introuvable. La liste a peut-être été modifiée.' });
        }
        
        list[idx] = { name: name || null, condition, percent };
        eco.karmaModifiers = { ...(eco.karmaModifiers||{}), [type]: list };
        await updateEconomyConfig(interaction.guild.id, eco);
        return interaction.editReply({ content: '✅ Règle modifiée avec succès.' });
      } catch (error) {
        console.error('[Karma] Percentage edit submission failed:', error.message);
        return interaction.editReply({ content: '❌ Erreur lors de la modification de la règle.' }).catch(() => {});
      }
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
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nom de la règle (optionnel)').setStyle(TextInputStyle.Short).setRequired(false)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('condition').setLabel('Condition (ex: charm>=50)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('percent').setLabel('Pourcentage (ex: -10)').setStyle(TextInputStyle.Short).setRequired(true))
      );
      try { 
        return await interaction.showModal(modal); 
      } catch (error) { 
        console.error('[Karma] Failed to show karma shop add modal:', error.message);
        return interaction.reply({ content: '❌ Erreur lors de l\'ouverture du formulaire d\'ajout de règle boutique karma.', ephemeral: true }).catch(() => {});
      }
    }
    if (interaction.isModalSubmit() && interaction.customId === 'eco_karma_add_shop') {
      await interaction.deferReply({ ephemeral: true });
      const name = (interaction.fields.getTextInputValue('name')||'').trim();
      const condition = (interaction.fields.getTextInputValue('condition')||'').trim();
      const percent = Number((interaction.fields.getTextInputValue('percent')||'0').trim());
      const eco = await getEconomyConfig(interaction.guild.id);
      const list = Array.isArray(eco.karmaModifiers?.shop) ? eco.karmaModifiers.shop : [];
      list.push({ name: name || null, condition, percent });
      eco.karmaModifiers = { ...(eco.karmaModifiers||{}), shop: list };
      await updateEconomyConfig(interaction.guild.id, eco);
      return interaction.editReply({ content: '✅ Règle boutique ajoutée.' });
    }
    // Karma rules creation: actions
    if (interaction.isButton() && interaction.customId === 'eco_karma_add_action') {
      const modal = new ModalBuilder().setCustomId('eco_karma_add_action').setTitle('Règle actions (karma)');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nom de la règle (optionnel)').setStyle(TextInputStyle.Short).setRequired(false)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('condition').setLabel('Condition (ex: charm>=50)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('percent').setLabel('Pourcentage gains/pertes (ex: +15)').setStyle(TextInputStyle.Short).setRequired(true))
      );
      try { return await interaction.showModal(modal); } catch (error) { 
        console.error('[Modal Error]', error.message);
        return interaction.reply({ content: '❌ Erreur lors de l\'ouverture du formulaire. Veuillez réessayer.', ephemeral: true }).catch(() => {});
      }
    }
    if (interaction.isModalSubmit() && interaction.customId === 'eco_karma_add_action') {
      await interaction.deferReply({ ephemeral: true });
      const name = (interaction.fields.getTextInputValue('name')||'').trim();
      const condition = (interaction.fields.getTextInputValue('condition')||'').trim();
      const percent = Number((interaction.fields.getTextInputValue('percent')||'0').trim());
      const eco = await getEconomyConfig(interaction.guild.id);
      const list = Array.isArray(eco.karmaModifiers?.actions) ? eco.karmaModifiers.actions : [];
      list.push({ name: name || null, condition, percent });
      eco.karmaModifiers = { ...(eco.karmaModifiers||{}), actions: list };
      await updateEconomyConfig(interaction.guild.id, eco);
      return interaction.editReply({ content: '✅ Règle actions ajoutée.' });
    }
    // Karma grants
    if (interaction.isButton() && interaction.customId === 'eco_karma_add_grant') {
      const modal = new ModalBuilder().setCustomId('eco_karma_add_grant').setTitle('Grant direct (karma)');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nom de la règle (optionnel)').setStyle(TextInputStyle.Short).setRequired(false)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('condition').setLabel('Condition (ex: charm>=100)').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('money').setLabel('Montant (ex: +500)').setStyle(TextInputStyle.Short).setRequired(true))
      );
      try { return await interaction.showModal(modal); } catch (error) { 
        console.error('[Modal Error]', error.message);
        return interaction.reply({ content: '❌ Erreur lors de l\'ouverture du formulaire. Veuillez réessayer.', ephemeral: true }).catch(() => {});
      }
    }
    if (interaction.isModalSubmit() && interaction.customId === 'eco_karma_add_grant') {
      await interaction.deferReply({ ephemeral: true });
      const name = (interaction.fields.getTextInputValue('name')||'').trim();
      const condition = (interaction.fields.getTextInputValue('condition')||'').trim();
      const money = Number((interaction.fields.getTextInputValue('money')||'0').trim());
      const eco = await getEconomyConfig(interaction.guild.id);
      const list = Array.isArray(eco.karmaModifiers?.grants) ? eco.karmaModifiers.grants : [];
      list.push({ name: name || null, condition, money });
      eco.karmaModifiers = { ...(eco.karmaModifiers||{}), grants: list };
      await updateEconomyConfig(interaction.guild.id, eco);
      return interaction.editReply({ content: '✅ Grant direct ajouté.' });
    }
    // Karma reset menu handler
    if (interaction.isStringSelectMenu() && interaction.customId === 'eco_karma_reset_menu') {
      const action = interaction.values[0];
      
      if (action === 'toggle') {
        const eco = await getEconomyConfig(interaction.guild.id);
        const currentEnabled = eco.karmaReset?.enabled || false;
        eco.karmaReset = { ...(eco.karmaReset||{}), enabled: !currentEnabled };
        await updateEconomyConfig(interaction.guild.id, eco);
        const embed = await buildConfigEmbed(interaction.guild);
        const rows = await buildEconomyMenuRows(interaction.guild, 'karma');
        return interaction.update({ embeds: [embed], components: [...rows] });
      } else if (action === 'now') {
        await interaction.deferReply({ ephemeral: true });
        const eco = await getEconomyConfig(interaction.guild.id);
        const balances = eco.balances || {};
        let resetCount = 0;
        
        for (const userId in balances) {
          const user = balances[userId];
          if (user.charm > 0 || user.perversion > 0) {
            user.charm = 0;
            user.perversion = 0;
            resetCount++;
          }
        }
        
        if (resetCount > 0) {
          eco.balances = balances;
          await updateEconomyConfig(interaction.guild.id, eco);
          
          // Log the manual reset
          const cfg = await getLogsConfig(interaction.guild.id);
          if (cfg?.channels?.economy) {
            const channel = interaction.guild.channels.cache.get(cfg.channels.economy);
            if (channel) {
              const embed = new EmbedBuilder()
                .setTitle('🔄 Reset Manuel du Karma')
                .setDescription(`Le karma de ${resetCount} utilisateur(s) a été remis à zéro par ${interaction.user}.`)
                .setColor(0xff9900)
                .setTimestamp();
              try {
                await channel.send({ embeds: [embed] });
              } catch (_) {}
            }
          }
          
          return interaction.editReply({ content: `✅ Karma remis à zéro pour ${resetCount} utilisateur(s).` });
        } else {
          return interaction.editReply({ content: 'Aucun utilisateur avec du karma à remettre à zéro.' });
        }
      } else if (action.startsWith('day:')) {
        const day = Number(action.split(':')[1]);
        if (!Number.isFinite(day) || day < 0 || day > 6) {
          return interaction.reply({ content: '❌ Jour invalide. Veuillez choisir un jour via le sélecteur.', ephemeral: true });
        }
        const eco = await getEconomyConfig(interaction.guild.id);
        const previous = typeof eco.karmaReset?.day === 'number' ? eco.karmaReset.day : null;
        eco.karmaReset = { ...(eco.karmaReset||{}), day };
        await updateEconomyConfig(interaction.guild.id, eco);
        const embed = await buildConfigEmbed(interaction.guild);
        const rows = await buildEconomyMenuRows(interaction.guild, 'karma');
        await interaction.update({ embeds: [embed], components: [...rows] });
        try {
          const dayLabels = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
          const msg = previous === day
            ? `ℹ️ Jour de reset déjà défini: ${dayLabels[day]} (UTC 00:00).`
            : `✅ Jour de reset défini sur ${dayLabels[day]} (UTC 00:00).`;
          await interaction.followUp({ content: msg, ephemeral: true });
        } catch (_) {}
        return;
      }
    }

    // Confess config handlers
    if (interaction.isStringSelectMenu() && interaction.customId === 'confess_mode') {
      try {
        const mode = interaction.values[0];
        const embed = await buildConfigEmbed(interaction.guild);
        const rows = await buildConfessRows(interaction.guild, mode);
        return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
      } catch (error) {
        console.error('Error in confess_mode:', error);
        return interaction.reply({ content: '❌ Erreur lors du changement de mode confessions.', ephemeral: true });
      }
    }
    if (interaction.isChannelSelectMenu() && interaction.customId.startsWith('confess_channels_add:')) {
      try {
        const mode = interaction.customId.split(':')[1] || 'sfw';
        await addConfessChannels(interaction.guild.id, interaction.values, mode);
        const embed = await buildConfigEmbed(interaction.guild);
        const rows = await buildConfessRows(interaction.guild, mode);
        return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
      } catch (error) {
        console.error('Error in confess_channels_add:', error);
        return interaction.reply({ content: '❌ Erreur lors de l\'ajout des canaux confessions.', ephemeral: true });
      }
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('confess_channels_remove:')) {
      try {
        const mode = interaction.customId.split(':')[1] || 'sfw';
        if (interaction.values.includes('none')) return interaction.deferUpdate();
        await removeConfessChannels(interaction.guild.id, interaction.values, mode);
        const embed = await buildConfigEmbed(interaction.guild);
        const rows = await buildConfessRows(interaction.guild, mode);
        return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
      } catch (error) {
        console.error('Error in confess_channels_remove:', error);
        return interaction.reply({ content: '❌ Erreur lors de la suppression des canaux confessions.', ephemeral: true });
      }
    }
    // Sous-menu éphémère pour choisir le salon de logs
    if (interaction.isButton() && interaction.customId === 'confess_logs_open') {
      const cf = await getConfessConfig(interaction.guild.id);
      const logSelect = new ChannelSelectMenuBuilder().setCustomId('confess_log_select_ephemeral').setPlaceholder(cf.logChannelId ? `Salon de logs actuel: <#${cf.logChannelId}>` : 'Choisir le salon de logs…').setMinValues(1).setMaxValues(1).addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
      return interaction.reply({ components: [new ActionRowBuilder().addComponents(logSelect)], ephemeral: true });
    }
    if (interaction.isChannelSelectMenu() && interaction.customId === 'confess_log_select_ephemeral') {
      try {
        const channelId = interaction.values[0];
        await updateConfessConfig(interaction.guild.id, { logChannelId: String(channelId||'') });
        const embed = await buildConfigEmbed(interaction.guild);
        const rows = await buildConfessRows(interaction.guild, 'sfw');
        try { await interaction.update({ content: '✅ Salon de logs mis à jour.', components: [] }); } catch (_) {}
        try { return await interaction.followUp({ embeds: [embed], components: [buildBackRow(), ...rows], ephemeral: true }); } catch (_) { return; }
      } catch (error) {
        console.error('Error in confess_log_select_ephemeral:', error);
        return interaction.reply({ content: '❌ Erreur lors de la configuration du salon de logs confessions.', ephemeral: true });
      }
    }

    // Logs config handlers
    if (interaction.isButton() && interaction.customId === 'logs_toggle') {
      const cfg = await getLogsConfig(interaction.guild.id);
      await updateLogsConfig(interaction.guild.id, { enabled: !cfg.enabled });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildLogsRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
    }
    if (interaction.isButton() && interaction.customId === 'logs_pseudo') {
      const cfg = await getLogsConfig(interaction.guild.id);
      await updateLogsConfig(interaction.guild.id, { pseudo: !cfg.pseudo });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildLogsRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
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
      return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
    }
    if (interaction.isChannelSelectMenu() && interaction.customId === 'logs_channel') {
      const id = interaction.values?.[0] || '';
      await updateLogsConfig(interaction.guild.id, { channelId: id });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildLogsRows(interaction.guild);
      await interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
      try { await interaction.followUp({ content: id ? `✅ Salon global: <#${id}>` : '✅ Salon global effacé', ephemeral: true }); } catch (_) {}
      return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'logs_channel_percat') {
      if (!client._logsPerCat) client._logsPerCat = new Map();
      client._logsPerCat.set(interaction.guild.id, interaction.values[0]);
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildLogsRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
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
      await interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
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
      return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
    }
    // Gestionnaire logs_cats_toggle supprimé car le SelectMenu a été retiré pour respecter les limites Discord
    if (interaction.isButton() && interaction.customId === 'confess_toggle_replies') {
      try {
        const cf = await getConfessConfig(interaction.guild.id);
        const allow = !cf.allowReplies;
        await updateConfessConfig(interaction.guild.id, { allowReplies: allow });
        const embed = await buildConfigEmbed(interaction.guild);
        const rows = await buildConfessRows(interaction.guild, 'sfw');
        return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
      } catch (error) {
        console.error('Error in confess_toggle_replies:', error);
        return interaction.reply({ content: '❌ Erreur lors du toggle des réponses confessions.', ephemeral: true });
      }
    }
    if (interaction.isButton() && interaction.customId === 'confess_toggle_naming') {
      try {
        const cf = await getConfessConfig(interaction.guild.id);
        const next = cf.threadNaming === 'nsfw' ? 'normal' : 'nsfw';
        await updateConfessConfig(interaction.guild.id, { threadNaming: next });
        const embed = await buildConfigEmbed(interaction.guild);
        const rows = await buildConfessRows(interaction.guild, 'sfw');
        return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
      } catch (error) {
        console.error('Error in confess_toggle_naming:', error);
        return interaction.reply({ content: '❌ Erreur lors du toggle du nommage confessions.', ephemeral: true });
      }
    }
    if (interaction.isButton() && interaction.customId === 'confess_nsfw_add') {
      const modal = new ModalBuilder().setCustomId('confess_nsfw_add_modal').setTitle('Ajouter noms NSFW');
      const input = new TextInputBuilder().setCustomId('names').setLabel('Noms (un par ligne)').setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      await interaction.showModal(modal);
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === 'confess_nsfw_add_modal') {
      await interaction.deferReply({ ephemeral: true });
      const text = interaction.fields.getTextInputValue('names') || '';
      const add = text.split('\n').map(s => s.trim()).filter(Boolean);
      const cf = await getConfessConfig(interaction.guild.id);
      const set = new Set([...(cf.nsfwNames||[]), ...add]);
      await updateConfessConfig(interaction.guild.id, { nsfwNames: Array.from(set) });
      return interaction.editReply({ content: `✅ Ajouté ${add.length} nom(s) NSFW pour les confessions.` });
    }
    if (interaction.isButton() && interaction.customId === 'confess_nsfw_remove') {
      const cf = await getConfessConfig(interaction.guild.id);
      const list = (cf.nsfwNames||[]).slice(0,25);
      const sel = new StringSelectMenuBuilder().setCustomId('confess_nsfw_remove_select').setPlaceholder('Supprimer des noms NSFW…').setMinValues(1).setMaxValues(Math.max(1, list.length || 1));
      if (list.length) sel.addOptions(...list.map((n,i)=>({ label: n.slice(0,80), value: String(i) })));
      else sel.addOptions({ label: 'Aucun', value: 'none' }).setDisabled(true);
      return interaction.reply({ components: [new ActionRowBuilder().addComponents(sel)], ephemeral: true });
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'confess_nsfw_remove_select') {
      if (interaction.values.includes('none')) return interaction.deferUpdate();
      const cf = await getConfessConfig(interaction.guild.id);
      const idxs = new Set(interaction.values.map(v=>Number(v)).filter(n=>Number.isFinite(n)));
      const next = (cf.nsfwNames||[]).filter((_,i)=>!idxs.has(i));
      await updateConfessConfig(interaction.guild.id, { nsfwNames: next });
      return interaction.update({ content: '✅ Noms NSFW supprimés.', components: [] });
    }

    // Truth/Dare config handlers
    if (interaction.isStringSelectMenu() && interaction.customId === 'td_mode') {
      const mode = interaction.values[0];
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTruthDareRows(interaction.guild, mode);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isChannelSelectMenu() && interaction.customId.startsWith('td_channels_add:')) {
      const mode = interaction.customId.split(':')[1] || 'sfw';
      await addTdChannels(interaction.guild.id, interaction.values, mode);
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTruthDareRows(interaction.guild, mode);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('td_channels_remove:')) {
      const mode = interaction.customId.split(':')[1] || 'sfw';
      if (interaction.values.includes('none')) return interaction.deferUpdate();
      await removeTdChannels(interaction.guild.id, interaction.values, mode);
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTruthDareRows(interaction.guild, mode);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isButton() && interaction.customId.startsWith('td_prompts_add_action:')) {
      const mode = interaction.customId.split(':')[1] || 'sfw';
      const modal = new ModalBuilder().setCustomId('td_prompts_add:action:' + mode).setTitle('Ajouter des ACTIONS');
      const input = new TextInputBuilder().setCustomId('texts').setLabel('Une par ligne').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2000);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      try { return await interaction.showModal(modal); } catch (error) { 
        console.error('[Modal Error]', error.message);
        return interaction.reply({ content: '❌ Erreur lors de l\'ouverture du formulaire. Veuillez réessayer.', ephemeral: true }).catch(() => {});
      }
    }
    if (interaction.isButton() && interaction.customId.startsWith('td_prompts_add_verite:')) {
      const mode = interaction.customId.split(':')[1] || 'sfw';
      const modal = new ModalBuilder().setCustomId('td_prompts_add:verite:' + mode).setTitle('Ajouter des VÉRITÉS');
      const input = new TextInputBuilder().setCustomId('texts').setLabel('Une par ligne').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2000);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      try { return await interaction.showModal(modal); } catch (error) { 
        console.error('[Modal Error]', error.message);
        return interaction.reply({ content: '❌ Erreur lors de l\'ouverture du formulaire. Veuillez réessayer.', ephemeral: true }).catch(() => {});
      }
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
      return interaction.reply({ content: '✅ Ajouté.', ephemeral: true }).then(async ()=>{ try { await interaction.followUp({ embeds: [embed], components: [...rows] }); } catch (_) {} });
    }
    if (interaction.isButton() && interaction.customId.startsWith('td_prompts_delete_all:')) {
      const mode = interaction.customId.split(':')[1] || 'sfw';
      const td = await getTruthDareConfig(interaction.guild.id);
      const ids = (td?.[mode]?.prompts || []).map(p => p.id);
      await deleteTdPrompts(interaction.guild.id, ids, mode);
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildTruthDareRows(interaction.guild, mode);
      return interaction.update({ embeds: [embed], components: [...rows] });
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
      try { await interaction.followUp({ embeds: [embed], components: [...rows], ephemeral: true }); } catch (_) {}
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith('td_prompts_delete_page:')) {
      const parts = interaction.customId.split(':');
      const mode = parts[1] || 'sfw';
      const offset = Number(parts[2]) || 0;
      const { rows, pageText } = await buildTdDeleteComponents(interaction.guild, mode, offset);
      try { return await interaction.update({ content: 'Sélectionnez les prompts à supprimer • ' + pageText, components: rows }); } catch (_) { return; }
    }

    if (interaction.isButton() && interaction.customId.startsWith('td_prompts_edit:')) {
      const mode = interaction.customId.split(':')[1] || 'sfw';
      const { rows, pageText } = await buildTdEditComponents(interaction.guild, mode, 0);
      try { return await interaction.reply({ content: 'Choisissez un prompt à modifier • ' + pageText, components: rows, ephemeral: true }); } catch (_) { return; }
    }
    if (interaction.isButton() && interaction.customId.startsWith('td_prompts_edit_page:')) {
      const parts = interaction.customId.split(':');
      const mode = parts[1] || 'sfw';
      const offset = Number(parts[2]) || 0;
      const { rows, pageText } = await buildTdEditComponents(interaction.guild, mode, offset);
      try { return await interaction.update({ content: 'Choisissez un prompt à modifier • ' + pageText, components: rows }); } catch (_) { return; }
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('td_prompts_edit_select:')) {
      const parts = interaction.customId.split(':');
      const mode = parts[1] || 'sfw';
      const offset = Number(parts[2]) || 0;
      if (interaction.values.includes('none')) return interaction.deferUpdate();
      const id = interaction.values[0];
      const modal = new ModalBuilder().setCustomId('td_prompts_edit_modal:' + mode + ':' + id + ':' + offset).setTitle('Modifier le prompt #' + id);
      const td = await getTruthDareConfig(interaction.guild.id);
      const existing = (td?.[mode]?.prompts || []).find(p => String(p.id) === String(id));
      const input = new TextInputBuilder().setCustomId('text').setLabel('Texte du prompt').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2000);
      if (existing && existing.text) input.setValue(String(existing.text).slice(0, 2000));
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      try { await interaction.showModal(modal); } catch (_) { try { await interaction.reply({ content: '❌ Erreur ouverture du formulaire.', ephemeral: true }); } catch (_) {} }
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('td_prompts_edit_modal:')) {
      const parts = interaction.customId.split(':');
      const mode = parts[1] || 'sfw';
      const id = parts[2];
      const offset = Number(parts[3]) || 0;
      const text = String(interaction.fields.getTextInputValue('text') || '').trim();
      if (!text) return interaction.reply({ content: 'Texte vide.', ephemeral: true });
      const updated = await editTdPrompt(interaction.guild.id, id, text, mode);
      if (!updated) return interaction.reply({ content: '❌ Prompt introuvable.', ephemeral: true });
      const { rows, pageText } = await buildTdEditComponents(interaction.guild, mode, offset);
      try { await interaction.reply({ content: '✅ Modifié. ' + 'Choisissez un prompt à modifier • ' + pageText, components: rows, ephemeral: true }); } catch (_) {}
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('levels_page:')) {
      const page = interaction.customId.split(':')[1];
      const embed = await buildConfigEmbed(interaction.guild);
      let rows;
      if (page === 'cards') rows = await buildLevelsCardsRows(interaction.guild);
      else if (page === 'rewards') rows = await buildLevelsRewardsRows(interaction.guild);
      else rows = await buildLevelsGeneralRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'config_staff_action') {
      const action = interaction.values[0];
      const embed = await buildConfigEmbed(interaction.guild);
      const topRows = buildTopSectionRow();
      const staffAction = buildStaffActionRow();
      if (action === 'add') {
        const addRows = buildStaffAddRows();
        await interaction.update({ embeds: [embed], components: [...topRows, staffAction, ...addRows] });
      } else if (action === 'remove') {
        const removeRows = await buildStaffRemoveRows(interaction.guild);
        await interaction.update({ embeds: [embed], components: [...topRows, staffAction, ...removeRows] });
      } else {
        await interaction.update({ embeds: [embed], components: [...topRows, staffAction] });
      }
      return;
    }

    if (interaction.isRoleSelectMenu() && interaction.customId === 'staff_add_roles') {
      await ensureStorageExists();
      const current = await getGuildStaffRoleIds(interaction.guild.id);
      const next = Array.from(new Set([...current, ...interaction.values]));
      await setGuildStaffRoleIds(interaction.guild.id, next);
      const embed = await buildConfigEmbed(interaction.guild);
      const topRows = buildTopSectionRow();
      const staffAction = buildStaffActionRow();
      await interaction.update({ embeds: [embed], components: [...topRows, staffAction] });
      return;
    }

    if (interaction.isRoleSelectMenu() && interaction.customId === 'staff_remove_roles') {
      const selected = new Set(interaction.values);
      const current = await getGuildStaffRoleIds(interaction.guild.id);
      const next = current.filter((id) => !selected.has(id));
      await setGuildStaffRoleIds(interaction.guild.id, next);
      const embed = await buildConfigEmbed(interaction.guild);
      const topRows = buildTopSectionRow();
      const staffAction = buildStaffActionRow();
      await interaction.update({ embeds: [embed], components: [...topRows, staffAction] });
      return;
    }

    if (interaction.isRoleSelectMenu() && interaction.customId === 'autokick_required_role') {
      const selected = interaction.values[0];
      const role = interaction.guild.roles.cache.get(selected) || await interaction.guild.roles.fetch(selected).catch(() => null);
      if (!role) {
        return interaction.reply({ content: '❌ Rôle invalide ou introuvable.', ephemeral: true });
      }
      if (selected === interaction.guild.id) {
        return interaction.reply({ content: '❌ Le rôle @everyone ne peut pas être utilisé pour l\'AutoKick.', ephemeral: true });
      }
      await updateAutoKickConfig(interaction.guild.id, { roleId: selected });
      const embed = await buildConfigEmbed(interaction.guild);
      const topRows = buildTopSectionRow();
      const akRows = await buildAutokickRows(interaction.guild);
      await interaction.update({ embeds: [embed], components: [...topRows, ...akRows] });
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
        const allowed = DELAY_OPTIONS.some(o => String(o.ms) === value);
        if (!Number.isFinite(delayMs) || !allowed) {
          return interaction.reply({ content: '❌ Valeur de délai invalide.', ephemeral: true });
        }
        await updateAutoKickConfig(interaction.guild.id, { delayMs });
        const embed = await buildConfigEmbed(interaction.guild);
        const topRows = buildTopSectionRow();
        const akRows = await buildAutokickRows(interaction.guild);
        await interaction.update({ embeds: [embed], components: [...topRows, ...akRows] });
        return;
      }
    }

    if (interaction.isButton() && (interaction.customId === 'autokick_enable' || interaction.customId === 'autokick_disable')) {
      const enable = interaction.customId === 'autokick_enable';
      if (enable) {
        const ak = await getAutoKickConfig(interaction.guild.id);
        const roleId = String(ak?.roleId || '');
        const role = roleId ? (interaction.guild.roles.cache.get(roleId) || await interaction.guild.roles.fetch(roleId).catch(() => null)) : null;
        const validDelay = Number.isFinite(ak?.delayMs) && ak.delayMs >= MIN_DELAY_MS && ak.delayMs <= MAX_DELAY_MS;
        if (!role || role.id === interaction.guild.id || !validDelay) {
          return interaction.reply({ content: '❌ Configuration incomplète: choisissez un rôle valide (≠ @everyone) et un délai entre ' + formatDuration(MIN_DELAY_MS) + ' et ' + formatDuration(MAX_DELAY_MS) + '.', ephemeral: true });
        }
      }
      await updateAutoKickConfig(interaction.guild.id, { enabled: enable });
      const embed = await buildConfigEmbed(interaction.guild);
      const topRows = buildTopSectionRow();
      const akRows = await buildAutokickRows(interaction.guild);
      await interaction.update({ embeds: [embed], components: [...topRows, ...akRows] });
      return;
    }
    if (interaction.isModalSubmit() && interaction.customId === 'autokick_delay_custom_modal') {
      const text = interaction.fields.getTextInputValue('minutes');
      const minutes = Number(text);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        return interaction.reply({ content: '❌ Veuillez entrer un nombre de minutes valide (> 0).', ephemeral: true });
      }
      const delayMs = Math.round(minutes * 60 * 1000);
      if (delayMs < MIN_DELAY_MS || delayMs > MAX_DELAY_MS) {
        return interaction.reply({ content: '❌ Le délai doit être compris entre ' + formatDuration(MIN_DELAY_MS) + ' et ' + formatDuration(MAX_DELAY_MS) + '.', ephemeral: true });
      }
      await updateAutoKickConfig(interaction.guild.id, { delayMs });
      try { await interaction.deferUpdate(); } catch (_) {}
      const embed = await buildConfigEmbed(interaction.guild);
      const topRows = buildTopSectionRow();
      const akRows = await buildAutokickRows(interaction.guild);
      try { await interaction.editReply({ embeds: [embed], components: [...topRows, ...akRows] }); } catch (_) {}
      return;
    }
    // AutoThread config handlers
    if (interaction.isChannelSelectMenu() && interaction.customId === 'autothread_channels_add') {
      try {
        const cfg = await getAutoThreadConfig(interaction.guild.id);
        const set = new Set(cfg.channels || []);
        
        // Validate that selected channels are text channels
        for (const id of interaction.values) {
          const channel = interaction.guild.channels.cache.get(id);
          if (channel && channel.type === ChannelType.GuildText) {
            set.add(String(id));
          }
        }
        
        await updateAutoThreadConfig(interaction.guild.id, { channels: Array.from(set) });
        const embed = await buildConfigEmbed(interaction.guild);
        const rows = await buildAutoThreadRows(interaction.guild);
        return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
      } catch (error) {
        console.error('Error in autothread_channels_add:', error);
        return interaction.reply({ content: '❌ Erreur lors de l\'ajout des canaux autothread.', ephemeral: true });
      }
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('autothread_channels_remove')) {
      try {
        if (interaction.values.includes('none')) return interaction.deferUpdate();
        const [, , , pageStr] = interaction.customId.split(':');
        const currentPage = parseInt(pageStr) || 0;
        const cfg = await getAutoThreadConfig(interaction.guild.id);
        const remove = new Set(interaction.values.map(String));
        const next = (cfg.channels||[]).filter(id => !remove.has(String(id)));
        await updateAutoThreadConfig(interaction.guild.id, { channels: next });
        const embed = await buildConfigEmbed(interaction.guild);
        // Recalculer la page après suppression
        const newTotalPages = Math.ceil(next.length / 25);
        const newPage = Math.min(currentPage, Math.max(0, newTotalPages - 1));
        const rows = await buildAutoThreadRows(interaction.guild, newPage);
        return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
      } catch (error) {
        console.error('Error in autothread_channels_remove:', error);
        return interaction.reply({ content: '❌ Erreur lors de la suppression des canaux autothread.', ephemeral: true });
      }
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'autothread_naming') {
      try {
        const mode = interaction.values[0];
        const cfg = await getAutoThreadConfig(interaction.guild.id);
        await updateAutoThreadConfig(interaction.guild.id, { naming: { ...(cfg.naming||{}), mode } });
        const embed = await buildConfigEmbed(interaction.guild);
        const rows = await buildAutoThreadRows(interaction.guild);
        return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
      } catch (error) {
        console.error('Error in autothread_naming:', error);
        return interaction.reply({ content: '❌ Erreur lors de la mise à jour du mode de nommage.', ephemeral: true });
      }
    }
    // Ouvre un sous-menu éphémère pour choisir l'archivage sans dépasser 5 rows
    if (interaction.isButton() && interaction.customId === 'autothread_archive_open') {
      const cfg = await getAutoThreadConfig(interaction.guild.id);
      const archive = new StringSelectMenuBuilder().setCustomId('autothread_archive_select').setPlaceholder('Délai d\'archivage…').addOptions(
        { label: '1 jour', value: '1d', default: cfg.archive?.policy === '1d' },
        { label: '7 jours', value: '7d', default: cfg.archive?.policy === '7d' },
        { label: '1 mois', value: '1m', default: cfg.archive?.policy === '1m' },
        { label: 'Illimité', value: 'max', default: cfg.archive?.policy === 'max' },
      );
      return interaction.reply({ components: [new ActionRowBuilder().addComponents(archive)], ephemeral: true });
    }
    if (interaction.isStringSelectMenu() && interaction.customId === 'autothread_archive_select') {
      try {
        const policy = interaction.values[0];
        const cfg = await getAutoThreadConfig(interaction.guild.id);
        await updateAutoThreadConfig(interaction.guild.id, { archive: { ...(cfg.archive||{}), policy } });
        const embed = await buildConfigEmbed(interaction.guild);
        const rows = await buildAutoThreadRows(interaction.guild);
        // Fermer le menu éphémère et rafraîchir la vue
        try { await interaction.update({ content: '✅ Archivage mis à jour.', components: [] }); } catch (_) {}
        try { return await interaction.followUp({ embeds: [embed], components: [buildBackRow(), ...rows], ephemeral: true }); } catch (_) { return; }
      } catch (error) {
        console.error('Error in autothread_archive_select:', error);
        return interaction.reply({ content: '❌ Erreur lors de la mise à jour de la politique d\'archivage.', ephemeral: true });
      }
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
    if (interaction.isButton() && interaction.customId === 'counting_reset_trophies') {
      await updateCountingConfig(interaction.guild.id, { achievedNumbers: [] });
      await setCountingState(interaction.guild.id, { current: 0, lastUserId: '' });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildCountingRows(interaction.guild);
      return interaction.update({ embeds: [embed], components: [...rows] });
    }
    if (interaction.isButton() && interaction.customId.startsWith('autothread_page:')) {
      try {
        const [, , pageStr] = interaction.customId.split(':');
        const page = parseInt(pageStr) || 0;
        const embed = await buildConfigEmbed(interaction.guild);
        const rows = await buildAutoThreadRows(interaction.guild, page);
        return interaction.update({ embeds: [embed], components: [buildBackRow(), ...rows] });
      } catch (error) {
        console.error('Error in autothread_page:', error);
        return interaction.reply({ content: '❌ Erreur lors de la navigation des pages autothread.', ephemeral: true });
      }
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
    if (interaction.isModalSubmit() && interaction.customId === 'levels_reward_add_modal') {
      const roleId = interaction.fields.getTextInputValue('roleId');
      const lvl = Number(interaction.fields.getTextInputValue('level'));
      if (!Number.isFinite(lvl) || lvl < 1) return interaction.reply({ content: 'Niveau invalide (>=1).', ephemeral: true });
      const cfg = await getLevelsConfig(interaction.guild.id);
      const rewards = { ...(cfg.rewards || {}) };
      rewards[String(Math.round(lvl))] = roleId;
      await updateLevelsConfig(interaction.guild.id, { rewards });
      try { await interaction.deferReply({ ephemeral: true }); } catch (_) {}
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildLevelsRewardsRows(interaction.guild);
      try { await interaction.editReply({ embeds: [embed], components: [...rows] }); } catch (_) {
        try { await interaction.followUp({ embeds: [embed], components: [...rows], ephemeral: true }); } catch (_) {}
      }
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
      if (target?.bot) return interaction.reply({ content: '⛔ Cible invalide: les bots sont exclus.', ephemeral: true });
      const targetMember = interaction.guild.members.cache.get(target.id);
      try { await interaction.deferReply({ ephemeral: true }); } catch (_) {}
      let levels;
      try { levels = await getLevelsConfig(interaction.guild.id); }
      catch (e) {
        try { await ensureStorageExists(); levels = await getLevelsConfig(interaction.guild.id); }
        catch (e2) { return interaction.editReply({ content: `Erreur de stockage: ${e2?.code||'inconnue'}` }); }
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
        return interaction.editReply({ content: `Ajouté ${amount} XP à ${target}. Niveau: ${stats.level}` });
      }

      if (action === 'removexp') {
        const amount = interaction.options.getInteger('valeur', true);
        const newTotal = Math.max(0, (stats.xp || 0) - amount);
        const norm = xpToLevel(newTotal, levels.levelCurve);
        stats.xp = newTotal;
        stats.level = norm.level;
        stats.xpSinceLevel = norm.xpSinceLevel;
        await setUserStats(interaction.guild.id, target.id, stats);
        return interaction.editReply({ content: `Retiré ${amount} XP à ${target}. Niveau: ${stats.level}` });
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
        return interaction.editReply({ content: `Ajouté ${n} niveaux à ${target}. Niveau: ${stats.level}` });
      }

      if (action === 'removelevel') {
        const n = interaction.options.getInteger('valeur', true);
        stats.level = Math.max(0, stats.level - n);
        stats.xpSinceLevel = 0;
        await setUserStats(interaction.guild.id, target.id, stats);
        return interaction.editReply({ content: `Retiré ${n} niveaux à ${target}. Niveau: ${stats.level}` });
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
        return interaction.editReply({ content: `Niveau de ${target} défini à ${stats.level}` });
      }

      return interaction.editReply({ content: 'Action inconnue.' });
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'adminkarma') {
      const hasManageGuild = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild) || interaction.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild);
      if (!hasManageGuild) return interaction.reply({ content: '⛔ Permission requise.', ephemeral: true });
      const type = interaction.options.getString('type', true); // 'charm' | 'perversion'
      const action = interaction.options.getString('action', true); // add | remove | set
      const member = interaction.options.getUser('membre', true);
      if (member?.bot) return interaction.reply({ content: '⛔ Cible invalide: les bots sont exclus.', ephemeral: true });
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
        if (member?.bot) return interaction.reply({ content: '⛔ Cible invalide: les bots sont exclus.', ephemeral: true });
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
      if (member?.bot) return interaction.reply({ content: '⛔ Cible invalide: les bots sont exclus.', ephemeral: true });
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
    // /niveau (FR) and /level (EN alias): show user's level with prestige-style landscape card
    if (interaction.isChatInputCommand() && (interaction.commandName === 'niveau' || interaction.commandName === 'level')) {
      try { await interaction.deferReply(); } catch (_) {}
      try {
        const { renderLevelCardLandscape } = require('./level-landscape');
        const { renderPrestigeCardRoseGoldLandscape } = require('./prestige-rose-gold-landscape');
        const { renderPrestigeCardBlueLandscape } = require('./prestige-blue-landscape');
        const levels = await getLevelsConfig(interaction.guild.id);
        const userFr = interaction.options.getUser?.('membre');
        const userEn = interaction.options.getUser?.('member');
        const targetUser = userFr || userEn || interaction.user;
        const member = await fetchMember(interaction.guild, targetUser.id);
        const stats = await getUserStats(interaction.guild.id, targetUser.id);
        const lastReward = getLastRewardForLevel(levels, stats.level);
        const roleName = lastReward ? (interaction.guild.roles.cache.get(lastReward.roleId)?.name || `Rôle ${lastReward.roleId}`) : null;
        const name = memberDisplayName(interaction.guild, member, targetUser.id);
        const logoUrl = LEVEL_CARD_LOGO_URL || CERTIFIED_LOGO_URL || undefined;
        const isCertified = memberHasCertifiedRole(member, levels);
        const isFemale = memberHasFemaleRole(member, levels);
        
        // Calculer les informations de progression pour la barre circulaire
        const xpSinceLevel = stats.xpSinceLevel || 0;
        const xpRequiredForNextLevel = xpRequiredForNext(stats.level || 0, levels.levelCurve || { base: 100, factor: 1.2 });
        
        let png;
        if (isCertified) {
          png = await renderLevelCardLandscape({ 
            memberName: name, 
            level: stats.level, 
            roleName: roleName || '—', 
            logoUrl, 
            isCertified: true,
            xpSinceLevel,
            xpRequiredForNext: xpRequiredForNextLevel
          });
        } else if (isFemale) {
          png = await renderPrestigeCardRoseGoldLandscape({
            memberName: name,
            level: stats.level,
            lastRole: roleName || '—',
            logoUrl: CERTIFIED_LOGO_URL || LEVEL_CARD_LOGO_URL || undefined,
            bgLogoUrl: CERTIFIED_LOGO_URL || LEVEL_CARD_LOGO_URL || undefined,
            xpSinceLevel,
            xpRequiredForNext: xpRequiredForNextLevel
          });
        } else {
          png = await renderPrestigeCardBlueLandscape({
            memberName: name,
            level: stats.level,
            lastRole: roleName || '—',
            logoUrl: LEVEL_CARD_LOGO_URL || undefined,
            bgLogoUrl: LEVEL_CARD_LOGO_URL || undefined,
            xpSinceLevel,
            xpRequiredForNext: xpRequiredForNextLevel
          });
        }
        const mention = targetUser && targetUser.id !== interaction.user.id ? `<@${targetUser.id}>` : '';
        return interaction.editReply({ content: mention || undefined, files: [{ attachment: png, name: 'level.png' }] });
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
      } else if (sub === 'économie') {
        const limit = Math.max(1, Math.min(25, interaction.options.getInteger('limite') || 10));
        const eco = await getEconomyConfig(interaction.guild.id);
        const entries = Object.entries(eco.balances || {});
        if (!entries.length) return interaction.reply({ content: 'Aucune donnée économique pour le moment.', ephemeral: true });
        entries.sort((a, b) => (b[1]?.amount || 0) - (a[1]?.amount || 0));
        const { embed, components } = await buildTopEconomieEmbed(interaction.guild, entries, 0, limit);
        return interaction.reply({ embeds: [embed], components });
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

    if (interaction.isButton() && interaction.customId.startsWith('top_economie_page:')) {
      const parts = interaction.customId.split(':');
      const offset = Number(parts[1]) || 0;
      const limit = Number(parts[2]) || 10;
      const eco = await getEconomyConfig(interaction.guild.id);
      const entries = Object.entries(eco.balances || {});
      entries.sort((a, b) => (b[1]?.amount || 0) - (a[1]?.amount || 0));
      const { embed, components } = await buildTopEconomieEmbed(interaction.guild, entries, offset, Math.min(25, Math.max(1, limit)));
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

    if (interaction.isButton() && interaction.customId === 'economy_message_money') {
      const modal = new ModalBuilder().setCustomId('economy_message_money_modal').setTitle('Argent par message');
      const minInput = new TextInputBuilder().setCustomId('min').setLabel('Montant minimum').setStyle(TextInputStyle.Short).setPlaceholder('1').setRequired(true);
      const maxInput = new TextInputBuilder().setCustomId('max').setLabel('Montant maximum').setStyle(TextInputStyle.Short).setPlaceholder('3').setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(minInput), new ActionRowBuilder().addComponents(maxInput));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isButton() && interaction.customId === 'economy_voice_money') {
      const modal = new ModalBuilder().setCustomId('economy_voice_money_modal').setTitle('Argent en vocal');
      const minInput = new TextInputBuilder().setCustomId('min').setLabel('Montant minimum').setStyle(TextInputStyle.Short).setPlaceholder('2').setRequired(true);
      const maxInput = new TextInputBuilder().setCustomId('max').setLabel('Montant maximum').setStyle(TextInputStyle.Short).setPlaceholder('5').setRequired(true);
      const intervalInput = new TextInputBuilder().setCustomId('interval').setLabel('Intervalle (minutes)').setStyle(TextInputStyle.Short).setPlaceholder('5').setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(minInput), new ActionRowBuilder().addComponents(maxInput), new ActionRowBuilder().addComponents(intervalInput));
      await interaction.showModal(modal);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'economy_message_money_modal') {
      await interaction.deferReply({ ephemeral: true });
      const min = parseInt(interaction.fields.getTextInputValue('min')) || 1;
      const max = parseInt(interaction.fields.getTextInputValue('max')) || 3;
      if (min > max) return interaction.editReply({ content: `❌ Le montant minimum ne peut pas être supérieur au maximum.` });
      const eco = await getEconomyConfig(interaction.guild.id);
      await updateEconomyConfig(interaction.guild.id, { rewards: { ...eco.rewards, message: { ...eco.rewards.message, min, max } } });
      return interaction.editReply({ content: `✅ Récompense message mise à jour: ${min}-${max} ${eco.currency?.symbol || '🪙'}` });
    }

    if (interaction.isModalSubmit() && interaction.customId === 'economy_voice_money_modal') {
      await interaction.deferReply({ ephemeral: true });
      const min = parseInt(interaction.fields.getTextInputValue('min')) || 2;
      const max = parseInt(interaction.fields.getTextInputValue('max')) || 5;
      const interval = parseInt(interaction.fields.getTextInputValue('interval')) || 5;
      if (min > max) return interaction.editReply({ content: `❌ Le montant minimum ne peut pas être supérieur au maximum.` });
      if (interval < 1) return interaction.editReply({ content: `❌ L'intervalle doit être d'au moins 1 minute.` });
      const eco = await getEconomyConfig(interaction.guild.id);
      await updateEconomyConfig(interaction.guild.id, { rewards: { ...eco.rewards, voice: { ...eco.rewards.voice, min, max, intervalMinutes: interval } } });
      return interaction.editReply({ content: `✅ Récompense vocal mise à jour: ${min}-${max} ${eco.currency?.symbol || '🪙'} toutes les ${interval} minutes` });
    }

    // removed economy_set_base and economy_set_cooldowns

    if (interaction.isButton() && interaction.customId === 'economy_gifs') {
      try {
        const embed = await buildConfigEmbed(interaction.guild);
        const rows = await buildEconomyGifRows(interaction.guild, 'work');
        await interaction.update({ embeds: [embed], components: [...rows] });
        return;
      } catch (error) {
        console.error('Erreur economy_gifs:', error);
        console.error('Stack trace:', error.stack);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Erreur lors de l\'affichage des GIFs.', ephemeral: true });
        } else if (interaction.deferred) {
          await interaction.editReply({ content: '❌ Erreur lors de l\'affichage des GIFs.' });
        }
        return;
      }
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('economy_gifs_action')) {
      try {
        const key = interaction.values[0];
        const embed = await buildConfigEmbed(interaction.guild);
        const rows = await buildEconomyGifRows(interaction.guild, key);
        await interaction.update({ embeds: [embed], components: [...rows] });
        return;
      } catch (error) {
        console.error('Erreur economy_gifs_action:', error);
        console.error('Stack trace:', error.stack);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: '❌ Erreur lors de la sélection d\'action GIF.', ephemeral: true });
        } else if (interaction.deferred) {
          await interaction.editReply({ content: '❌ Erreur lors de la sélection d\'action GIF.' });
        }
        return;
      }
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
      const rawUrls = text.split('\n').map(s => s.trim()).filter(u => /^https?:\/\//i.test(u));
      // Normalize and try to resolve to direct media URLs for better Discord embedding
      let urls = rawUrls.map(u => normalizeGifUrlBasic(u));
      try {
        urls = await Promise.all(urls.map(async (u) => {
          try { return await resolveGifUrl(u, { timeoutMs: 2000 }); } catch (_) { return u; }
        }));
      } catch (_) {}
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
      if (interaction.values.includes('none')) return;
      const idxs = interaction.values.map(v => Number(v)).filter(n => Number.isFinite(n));
      const eco = await getEconomyConfig(interaction.guild.id);
      const gifs = { ...(eco.actions?.gifs || {}) };
      const entry = gifs[key] || { success: [], fail: [] };
      entry.success = (entry.success||[]).filter((_, i) => !idxs.includes(i));
      gifs[key] = entry;
      await updateEconomyConfig(interaction.guild.id, { actions: { ...(eco.actions||{}), gifs } });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildEconomyGifRows(interaction.guild, key);
      await interaction.update({ embeds: [embed], components: [...rows] });
      return;
    }
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('economy_gifs_remove_fail:')) {
      const key = interaction.customId.split(':')[1];
      if (interaction.values.includes('none')) return;
      const idxs = interaction.values.map(v => Number(v)).filter(n => Number.isFinite(n));
      const eco = await getEconomyConfig(interaction.guild.id);
      const gifs = { ...(eco.actions?.gifs || {}) };
      const entry = gifs[key] || { success: [], fail: [] };
      entry.fail = (entry.fail||[]).filter((_, i) => !idxs.includes(i));
      gifs[key] = entry;
      await updateEconomyConfig(interaction.guild.id, { actions: { ...(eco.actions||{}), gifs } });
      const embed = await buildConfigEmbed(interaction.guild);
      const rows = await buildEconomyGifRows(interaction.guild, key);
      await interaction.update({ embeds: [embed], components: [...rows] });
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
    if (interaction.isChatInputCommand() && interaction.commandName === 'daily') {
      return handleEconomyAction(interaction, 'daily');
    }
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
    if (interaction.isChatInputCommand() && interaction.commandName === 'sodo') {
      return handleEconomyAction(interaction, 'sodo');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'orgasme') {
      return handleEconomyAction(interaction, 'orgasme');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'branler') {
      return handleEconomyAction(interaction, 'branler');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'doigter') {
      return handleEconomyAction(interaction, 'doigter');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'tirercheveux') {
      return handleEconomyAction(interaction, 'hairpull');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'caresser') {
      return handleEconomyAction(interaction, 'caress');
    }
    if (interaction.isChatInputCommand() && (interaction.commandName === 'lécher' || interaction.commandName === 'lecher')) {
      return handleEconomyAction(interaction, 'lick');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'sucer') {
      return handleEconomyAction(interaction, 'suck');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'mordre') {
      return handleEconomyAction(interaction, 'nibble');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'chatouiller') {
      return handleEconomyAction(interaction, 'tickle');
    }
    if (interaction.isChatInputCommand() && (interaction.commandName === 'réanimer' || interaction.commandName === 'reanimer')) {
      return handleEconomyAction(interaction, 'revive');
    }
    if (interaction.isChatInputCommand() && (interaction.commandName === 'réconforter' || interaction.commandName === 'reconforter')) {
      return handleEconomyAction(interaction, 'comfort');
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
    // New Hot & Fun
    if (interaction.isChatInputCommand() && interaction.commandName === 'shower') {
      return handleEconomyAction(interaction, 'shower');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'wet') {
      return handleEconomyAction(interaction, 'wet');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'bed') {
      return handleEconomyAction(interaction, 'bed');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'undress') {
      return handleEconomyAction(interaction, 'undress');
    }
    // Domination / Soumission
    if (interaction.isChatInputCommand() && interaction.commandName === 'collar') {
      return handleEconomyAction(interaction, 'collar');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'leash') {
      return handleEconomyAction(interaction, 'leash');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'kneel') {
      return handleEconomyAction(interaction, 'kneel');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'order') {
      return handleEconomyAction(interaction, 'order');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'punish') {
      return handleEconomyAction(interaction, 'punish');
    }
    // Séduction & RP doux
    if (interaction.isChatInputCommand() && interaction.commandName === 'rose') {
      return handleEconomyAction(interaction, 'rose');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'wine') {
      return handleEconomyAction(interaction, 'wine');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'pillowfight') {
      return handleEconomyAction(interaction, 'pillowfight');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'sleep') {
      return handleEconomyAction(interaction, 'sleep');
    }
    // Délires / Jeux
    if (interaction.isChatInputCommand() && interaction.commandName === 'oops') {
      return handleEconomyAction(interaction, 'oops');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'caught') {
      return handleEconomyAction(interaction, 'caught');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'tromper') {
      return handleEconomyAction(interaction, 'tromper');
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'orgie') {
      return handleEconomyAction(interaction, 'orgie');
    }

    if (interaction.isChatInputCommand() && interaction.commandName === 'boutique') {
      const PAGE_SIZE = 10;
      const embed = await buildBoutiqueEmbed(interaction.guild, interaction.user, 0, PAGE_SIZE);
      const rows = await buildBoutiqueRows(interaction.guild);
      const { entriesCount } = await getBoutiqueEntriesCount(interaction.guild);
      const components = entriesCount > PAGE_SIZE ? [...rows, buildBoutiquePageRow(0, PAGE_SIZE, entriesCount)] : [...rows];
      return interaction.reply({ embeds: [embed], components, ephemeral: true });
    }
    if (interaction.isButton() && interaction.customId.startsWith('boutique_page:')) {
      const parts = interaction.customId.split(':');
      const offset = Math.max(0, Number(parts[1]) || 0);
      const limit = Math.max(1, Math.min(25, Number(parts[2]) || 10));
      const { entriesCount } = await getBoutiqueEntriesCount(interaction.guild);
      const safeOffset = Math.min(offset, Math.max(0, entriesCount - 1));
      const embed = await buildBoutiqueEmbed(interaction.guild, interaction.user, safeOffset, limit);
      const rows = await buildBoutiqueRows(interaction.guild);
      const pageRow = buildBoutiquePageRow(safeOffset, limit, entriesCount);
      return interaction.update({ embeds: [embed], components: [...rows, pageRow] });
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

    // Admin-only: /couleur (attribuer une couleur de rôle avec sélecteurs)
    if (interaction.isChatInputCommand() && interaction.commandName === 'couleur') {
      try {
        const ok = await isStaffMember(interaction.guild, interaction.member);
        if (!ok) return interaction.reply({ content: '⛔ Réservé au staff.', ephemeral: true });
        
        // Première étape : sélection du type de cible
        const targetSelect = new StringSelectMenuBuilder()
          .setCustomId('couleur_target_select')
          .setPlaceholder('Choisir le type de cible...')
          .addOptions([
            { label: '👤 Membre spécifique', value: 'user', description: 'Attribuer une couleur à un membre' },
            { label: '🎭 Rôle existant', value: 'role', description: 'Modifier la couleur d\'un rôle existant' }
          ]);

        const embed = new EmbedBuilder()
          .setColor(THEME_COLOR_PRIMARY)
          .setTitle('🎨 Attribution de couleur')
          .setDescription('Sélectionnez d\'abord le type de cible pour la couleur.')
          .setThumbnail(THEME_IMAGE)
          .setFooter({ text: 'BAG • Couleurs', iconURL: THEME_FOOTER_ICON })
          .setTimestamp();

        await interaction.reply({
          embeds: [embed],
          components: [new ActionRowBuilder().addComponents(targetSelect)],
          ephemeral: true
        });
        
      } catch (error) {
        console.error('Erreur commande couleur:', error);
        await interaction.reply({ content: '❌ Une erreur est survenue.', ephemeral: true });
      }
      return;
    }

    // Gestionnaires d'interaction pour le système de couleurs
    if (interaction.isStringSelectMenu() && interaction.customId === 'couleur_target_select') {
      const targetType = interaction.values[0];
      
      if (targetType === 'user') {
        // Sélection d'un membre
        const userSelect = new UserSelectMenuBuilder()
          .setCustomId('couleur_user_select')
          .setPlaceholder('Choisir un membre...')
          .setMinValues(1)
          .setMaxValues(1);

        const embed = new EmbedBuilder()
          .setColor(THEME_COLOR_PRIMARY)
          .setTitle('🎨 Attribution de couleur - Membre')
          .setDescription('Sélectionnez le membre qui recevra une couleur.')
          .setThumbnail(THEME_IMAGE)
          .setFooter({ text: 'BAG • Couleurs', iconURL: THEME_FOOTER_ICON })
          .setTimestamp();

        await interaction.update({
          embeds: [embed],
          components: [new ActionRowBuilder().addComponents(userSelect)]
        });
      } else if (targetType === 'role') {
        // Sélection d'un rôle
        const roleSelect = new RoleSelectMenuBuilder()
          .setCustomId('couleur_role_select')
          .setPlaceholder('Choisir un rôle...')
          .setMinValues(1)
          .setMaxValues(1);

        const embed = new EmbedBuilder()
          .setColor(THEME_COLOR_PRIMARY)
          .setTitle('🎨 Attribution de couleur - Rôle')
          .setDescription('Sélectionnez le rôle dont vous voulez modifier la couleur.')
          .setThumbnail(THEME_IMAGE)
          .setFooter({ text: 'BAG • Couleurs', iconURL: THEME_FOOTER_ICON })
          .setTimestamp();

        await interaction.update({
          embeds: [embed],
          components: [new ActionRowBuilder().addComponents(roleSelect)]
        });
      }
      return;
    }

    if (interaction.isUserSelectMenu() && interaction.customId === 'couleur_user_select') {
      const userId = interaction.values[0];
      const user = await interaction.guild.members.fetch(userId).catch(() => null);
      if (!user) return interaction.update({ content: '❌ Membre introuvable.', embeds: [], components: [] });

      // Étape 2 : sélection de la catégorie de couleur
      const categorySelect = new StringSelectMenuBuilder()
        .setCustomId(`couleur_category_select:user:${userId}`)
        .setPlaceholder('Choisir une catégorie de couleur...')
        .addOptions([
          { label: '🌸 Couleurs Pastel', value: 'pastel', description: 'Couleurs douces et apaisantes' },
          { label: '🔥 Couleurs Vives', value: 'vif', description: 'Couleurs éclatantes et énergiques' },
          { label: '🌙 Couleurs Sombres', value: 'sombre', description: 'Couleurs profondes et mystérieuses' }
        ]);

      const embed = new EmbedBuilder()
        .setColor(THEME_COLOR_PRIMARY)
        .setTitle('🎨 Attribution de couleur - Catégorie')
        .setDescription(`**Membre sélectionné:** ${user.user.tag}\n\nChoisissez maintenant une catégorie de couleur.`)
        .setThumbnail(user.user.displayAvatarURL())
        .setFooter({ text: 'BAG • Couleurs', iconURL: THEME_FOOTER_ICON })
        .setTimestamp();

      await interaction.update({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(categorySelect)]
      });
      return;
    }

    if (interaction.isRoleSelectMenu() && interaction.customId === 'couleur_role_select') {
      const roleId = interaction.values[0];
      const role = interaction.guild.roles.cache.get(roleId);
      if (!role) return interaction.update({ content: '❌ Rôle introuvable.', embeds: [], components: [] });

      // Étape 2 : sélection de la catégorie de couleur
      const categorySelect = new StringSelectMenuBuilder()
        .setCustomId(`couleur_category_select:role:${roleId}`)
        .setPlaceholder('Choisir une catégorie de couleur...')
        .addOptions([
          { label: '🌸 Couleurs Pastel', value: 'pastel', description: 'Couleurs douces et apaisantes' },
          { label: '🔥 Couleurs Vives', value: 'vif', description: 'Couleurs éclatantes et énergiques' },
          { label: '🌙 Couleurs Sombres', value: 'sombre', description: 'Couleurs profondes et mystérieuses' }
        ]);

      const embed = new EmbedBuilder()
        .setColor(role.color || THEME_COLOR_PRIMARY)
        .setTitle('🎨 Attribution de couleur - Catégorie')
        .setDescription(`**Rôle sélectionné:** ${role.name}\n\nChoisissez maintenant une catégorie de couleur.`)
        .setThumbnail(THEME_IMAGE)
        .setFooter({ text: 'BAG • Couleurs', iconURL: THEME_FOOTER_ICON })
        .setTimestamp();

      await interaction.update({
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(categorySelect)]
      });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('couleur_category_select:')) {
      const [, targetType, targetId] = interaction.customId.split(':');
      const category = interaction.values[0];

      const view = buildColorSelectView(targetType, targetId, category, 0);
      await interaction.update({ embeds: [view.embed], components: view.rows, files: view.files });
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('couleur_final_select:')) {
      const [, targetType, targetId, category] = interaction.customId.split(':');
      const colorHex = interaction.values[0];
      const colorInt = parseInt(colorHex, 16);
      
      await interaction.deferUpdate();

      try {
        if (targetType === 'user') {
          // Attribution à un membre
          const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);
          if (!targetMember) {
            return interaction.editReply({ content: '❌ Membre introuvable.', embeds: [], components: [] });
          }

          // Chercher un rôle de couleur existant
          const existingColorRole = targetMember.roles.cache.find(role => 
            role.name.startsWith('Couleur-') && role.managed === false
          );

          let colorRole;
          if (existingColorRole) {
            // Modifier le rôle existant
            colorRole = await existingColorRole.edit({ color: colorInt });
          } else {
            // Créer un nouveau rôle de couleur
            colorRole = await interaction.guild.roles.create({
              name: `Couleur-${targetMember.user.username}`,
              color: colorInt,
              permissions: [],
              reason: `Rôle de couleur créé par ${interaction.user.tag}`
            });
            
            // Placer le rôle tout en haut de la hiérarchie (juste sous le rôle du bot)
            try {
              const botRole = interaction.guild.members.me?.roles.highest;
              const targetPosition = botRole ? botRole.position - 1 : interaction.guild.roles.cache.size - 1;
              await colorRole.setPosition(Math.max(1, targetPosition));
            } catch (posError) {
              console.log('Impossible de repositionner le rôle:', posError.message);
            }
            
            // Attribuer le rôle au membre
            await targetMember.roles.add(colorRole);
          }

          const selectedColor = Object.values(COLOR_PALETTES).flat().find(c => c.hex === colorHex);
          const embed = new EmbedBuilder()
            .setColor(colorInt)
            .setTitle('🎨 Couleur attribuée avec succès !')
            .setDescription(`**${targetMember.user.tag}** a reçu la couleur **${selectedColor?.name || colorHex}**`)
            .addFields([
              { name: 'Rôle', value: colorRole.name, inline: true },
              { name: 'Couleur', value: `\`#${colorHex}\``, inline: true },
              { name: 'Catégorie', value: category.charAt(0).toUpperCase() + category.slice(1), inline: true }
            ])
            .setThumbnail(targetMember.user.displayAvatarURL())
            .setFooter({ text: 'BAG • Couleurs', iconURL: THEME_FOOTER_ICON })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed], components: [] });
        } else if (targetType === 'role') {
          // Modification d'un rôle existant
          const role = interaction.guild.roles.cache.get(targetId);
          if (!role) {
            return interaction.editReply({ content: '❌ Rôle introuvable.', embeds: [], components: [] });
          }

          await role.edit({ color: colorInt });

          const selectedColor = Object.values(COLOR_PALETTES).flat().find(c => c.hex === colorHex);
          const embed = new EmbedBuilder()
            .setColor(colorInt)
            .setTitle('🎨 Couleur de rôle modifiée !')
            .setDescription(`Le rôle **${role.name}** a reçu la couleur **${selectedColor?.name || colorHex}**`)
            .addFields([
              { name: 'Rôle', value: role.name, inline: true },
              { name: 'Couleur', value: `\`#${colorHex}\``, inline: true },
              { name: 'Catégorie', value: category.charAt(0).toUpperCase() + category.slice(1), inline: true }
            ])
            .setThumbnail(THEME_IMAGE)
            .setFooter({ text: 'BAG • Couleurs', iconURL: THEME_FOOTER_ICON })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed], components: [] });
        }

      } catch (error) {
        console.error('Erreur attribution couleur:', error);
        await interaction.editReply({ 
          content: '❌ Erreur lors de l\'attribution de la couleur. Vérifiez les permissions du bot.',
          embeds: [], 
          components: [] 
        });
      }
      return;
    }

    // Pagination des palettes de couleurs
    if (interaction.isButton() && interaction.customId.startsWith('couleur_palette_page:')) {
      const [, targetType, targetId, category, offsetStr] = interaction.customId.split(':');
      const offset = Number(offsetStr) || 0;
      const view = buildColorSelectView(targetType, targetId, category, offset);
      await interaction.update({ embeds: [view.embed], components: view.rows, files: view.files });
      return;
    }

    // Retour à la sélection de catégorie
    if (interaction.isButton() && interaction.customId.startsWith('couleur_back_to_category:')) {
      const [, targetType, targetId] = interaction.customId.split(':');
      if (targetType === 'user') {
        const user = await interaction.guild.members.fetch(targetId).catch(() => null);
        if (!user) return interaction.update({ content: '❌ Membre introuvable.', embeds: [], components: [] });

        const categorySelect = new StringSelectMenuBuilder()
          .setCustomId(`couleur_category_select:user:${targetId}`)
          .setPlaceholder('Choisir une catégorie de couleur...')
          .addOptions([
            { label: '🌸 Couleurs Pastel', value: 'pastel', description: 'Couleurs douces et apaisantes' },
            { label: '🔥 Couleurs Vives', value: 'vif', description: 'Couleurs éclatantes et énergiques' },
            { label: '🌙 Couleurs Sombres', value: 'sombre', description: 'Couleurs profondes et mystérieuses' }
          ]);

        const embed = new EmbedBuilder()
          .setColor(THEME_COLOR_PRIMARY)
          .setTitle('🎨 Attribution de couleur - Catégorie')
          .setDescription(`**Membre sélectionné:** ${user.user.tag}\n\nChoisissez maintenant une catégorie de couleur.`)
          .setThumbnail(user.user.displayAvatarURL())
          .setFooter({ text: 'BAG • Couleurs', iconURL: THEME_FOOTER_ICON })
          .setTimestamp();

        await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(categorySelect)], files: [] });
        return;
      } else if (targetType === 'role') {
        const role = interaction.guild.roles.cache.get(targetId);
        if (!role) return interaction.update({ content: '❌ Rôle introuvable.', embeds: [], components: [] });

        const categorySelect = new StringSelectMenuBuilder()
          .setCustomId(`couleur_category_select:role:${targetId}`)
          .setPlaceholder('Choisir une catégorie de couleur...')
          .addOptions([
            { label: '🌸 Couleurs Pastel', value: 'pastel', description: 'Couleurs douces et apaisantes' },
            { label: '🔥 Couleurs Vives', value: 'vif', description: 'Couleurs éclatantes et énergiques' },
            { label: '🌙 Couleurs Sombres', value: 'sombre', description: 'Couleurs profondes et mystérieuses' }
          ]);

        const embed = new EmbedBuilder()
          .setColor(role.color || THEME_COLOR_PRIMARY)
          .setTitle('🎨 Attribution de couleur - Catégorie')
          .setDescription(`**Rôle sélectionné:** ${role.name}\n\nChoisissez maintenant une catégorie de couleur.`)
          .setThumbnail(THEME_IMAGE)
          .setFooter({ text: 'BAG • Couleurs', iconURL: THEME_FOOTER_ICON })
          .setTimestamp();

        await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(categorySelect)], files: [] });
        return;
      }
    }

    // Admin-only: /backup (export config + force snapshot)
    if (interaction.isChatInputCommand() && interaction.commandName === 'backup') {
      try {
        const ok = await isStaffMember(interaction.guild, interaction.member);
        if (!ok) return interaction.reply({ content: '⛔ Réservé au staff.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const { readConfig, backupNow } = require('./storage/jsonStore');
        const info = await backupNow();
        const cfg = await readConfig();
        const json = Buffer.from(JSON.stringify(cfg, null, 2), 'utf8');
        const file = { attachment: json, name: 'bag-backup.json' };
        try {
          await sendDetailedBackupLog(interaction.guild, info, 'slash', interaction.user);
        } catch (_) {}
        return interaction.editReply({ content: '📦 Sauvegarde générée.', files: [file] });
      } catch (e) {
        try {
          const lc = await getLogsConfig(interaction.guild.id);
          const errorInfo = {
            local: { success: false, error: String(e?.message || e) },
            github: { success: false, configured: false, error: 'Échec avant sauvegarde' },
            details: { timestamp: new Date().toISOString() }
          };
          await sendDetailedBackupLog(interaction.guild, errorInfo, 'slash', interaction.user);
        } catch (_) {}
        return interaction.reply({ content: 'Erreur export.', ephemeral: true });
      }
    }

    // Admin-only: /restore (restaure le dernier snapshot disponible)
    if (interaction.isChatInputCommand() && interaction.commandName === 'restore') {
      try {
        const ok = await isStaffMember(interaction.guild, interaction.member);
        if (!ok) return interaction.reply({ content: '⛔ Réservé au staff.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        const { restoreLatest } = require('./storage/jsonStore');
        const result = await restoreLatest();
        try {
          await sendDetailedRestoreLog(interaction.guild, result, 'slash', interaction.user);
        } catch (_) {}
        return interaction.editReply({ content: '✅ Restauration depuis le dernier snapshot effectuée.' });
      } catch (e) {
        try {
          const errorResult = {
            ok: false,
            source: 'unknown',
            error: String(e?.message || e)
          };
          await sendDetailedRestoreLog(interaction.guild, errorResult, 'slash', interaction.user);
        } catch (_) {}
        return interaction.reply({ content: 'Erreur restauration.', ephemeral: true });
      }
    }
    // Admin-only: /github-backup (gestion des sauvegardes GitHub)
    if (interaction.isChatInputCommand() && interaction.commandName === 'github-backup') {
      try {
        const ok = await isStaffMember(interaction.guild, interaction.member);
        if (!ok) return interaction.reply({ content: '⛔ Réservé aux administrateurs.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        
        const action = interaction.options.getString('action', true);
        const GitHubBackup = require('./storage/githubBackup');
        const github = new GitHubBackup();

        switch (action) {
          case 'test':
            const testResult = await github.testConnection();
            if (testResult.success) {
              return interaction.editReply({ 
                content: `✅ **Connexion GitHub OK**\n🔗 Dépôt: \`${testResult.repo}\`\n📝 Push: ${testResult.permissions.push ? '✅' : '❌'}\n👑 Admin: ${testResult.permissions.admin ? '✅' : '❌'}` 
              });
            } else {
              return interaction.editReply({ content: `❌ **Erreur GitHub**\n${testResult.error}` });
            }

          case 'list':
            if (!github.isConfigured()) {
              return interaction.editReply({ content: '❌ GitHub non configuré (variables GITHUB_TOKEN et GITHUB_REPO requises)' });
            }
            const backups = await github.listBackups(10);
            if (backups.length === 0) {
              return interaction.editReply({ content: '📭 Aucune sauvegarde GitHub trouvée.' });
            }
            const list = backups.map((b, i) => {
              const when = new Date(b.date).toLocaleString('fr-FR');
              const short = b.sha.substring(0,7);
              return `${i+1}. ${when} — ref: \`${short}\`\n${b.message}\n   ➡️ Restaurer: \`/github-backup force-restore ref:${b.sha}\``;
            }).join('\n\n');
            return interaction.editReply({ content: `📋 **Dernières sauvegardes GitHub:**\n\n${list}` });

          case 'force-backup':
            if (!github.isConfigured()) {
              return interaction.editReply({ content: '❌ GitHub non configuré' });
            }
            const { readConfig } = require('./storage/jsonStore');
            const cfg = await readConfig();
            const backupResult = await github.backup(cfg);
            
            // Envoyer un log détaillé
            const forceBackupInfo = {
              storage: 'github-force',
              local: { success: true },
              github: { ...backupResult, configured: true },
              details: {
                dataSize: JSON.stringify(cfg).length,
                guildsCount: Object.keys(cfg.guilds || {}).length,
                usersCount: 0,
                timestamp: backupResult.timestamp
              }
            };
            
            // Compter les utilisateurs
            for (const guildId in cfg.guilds || {}) {
              const guild = cfg.guilds[guildId];
              if (guild.levels?.users) forceBackupInfo.details.usersCount += Object.keys(guild.levels.users).length;
              if (guild.economy?.balances) forceBackupInfo.details.usersCount += Object.keys(guild.economy.balances).length;
            }
            
            await sendDetailedBackupLog(interaction.guild, forceBackupInfo, 'force-github', interaction.user);
            
            return interaction.editReply({ 
              content: `✅ **Sauvegarde GitHub forcée**\n🔗 Commit: \`${backupResult.commit_sha.substring(0,7)}\`\n⏰ ${new Date(backupResult.timestamp).toLocaleString('fr-FR')}` 
            });

          case 'force-restore':
            if (!github.isConfigured()) {
              return interaction.editReply({ content: '❌ GitHub non configuré' });
            }
            const ref = interaction.options.getString('ref', false) || null;
            const restoreResult = await github.restore(ref);
            if (restoreResult.success) {
              const { writeConfig } = require('./storage/jsonStore');
              await writeConfig(restoreResult.data);
              
              // Envoyer un log détaillé
              const forceRestoreResult = {
                ok: true,
                source: 'github',
                metadata: restoreResult.metadata
              };
              await sendDetailedRestoreLog(interaction.guild, forceRestoreResult, 'force-github', interaction.user);
              
              const refInfo = ref ? `\n🔖 Ref: \`${ref}\`` : '';
              return interaction.editReply({ 
                content: `✅ **Restauration GitHub forcée**\n⏰ Depuis: ${new Date(restoreResult.metadata.timestamp).toLocaleString('fr-FR')}${refInfo}` 
              });
            } else {
              // Log d'échec
              const failedRestoreResult = {
                ok: false,
                source: 'github',
                error: 'Échec de la restauration GitHub'
              };
              await sendDetailedRestoreLog(interaction.guild, failedRestoreResult, 'force-github', interaction.user);
              
              return interaction.editReply({ content: '❌ Échec de la restauration GitHub' });
            }

          default:
            return interaction.editReply({ content: '❌ Action inconnue' });
        }

      } catch (e) {
        console.error('[GitHub-Backup] Erreur:', e);
        return interaction.reply({ content: `❌ Erreur: ${e.message}`, ephemeral: true });
      }
    }
    // Lecteur manuel supprimé: UI s'ouvrira automatiquement au /play
    // Basic /play (join + search + play)
    if (interaction.isChatInputCommand() && interaction.commandName === 'play') {
      try {
        await interaction.deferReply();
        const query = interaction.options.getString('recherche', true);
        if (!interaction.member?.voice?.channel) return interaction.editReply('Rejoignez un salon vocal.');
        if (!client.music || !ErelaManager) return interaction.editReply('🚫 Lecteur indisponible pour le moment (module non chargé).');
        
        const getNodeStatus = () => {
          try { 
            const nodes = Array.from(client.music.nodes.values());
            const connectedNodes = nodes.filter(n => n.connected);
            return { total: nodes.length, connected: connectedNodes.length, nodes: connectedNodes };
          } catch (_) { 
            return { total: 0, connected: 0, nodes: [] }; 
          }
        };
        
        const nodeStatus = getNodeStatus();
        if (nodeStatus.connected === 0) {
          const statusMsg = nodeStatus.total > 0 
            ? `🔄 Lecteur temporairement indisponible (${nodeStatus.connected}/${nodeStatus.total} nœuds connectés). Reconnexion en cours...`
            : '⚠️ Aucun serveur audio configuré. Contactez un administrateur.';
          return interaction.editReply(statusMsg);
        }
        // Timeout + multi-source fallback with better error handling
        const searchWithTimeout = (q, user, ms = 15000) => {
          const timeoutPromise = new Promise((_, rej) => 
            setTimeout(() => rej(new Error('Recherche musicale expirée')), ms)
          );
          return Promise.race([client.music.search(q, user), timeoutPromise]);
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
          } catch (error) { 
            console.log(`[Music] Search attempt failed for ${JSON.stringify(attempt)}:`, error.message);
          }
        }
        if (!res || !res.tracks?.length) {
          return interaction.editReply({
            content: '❌ Impossible de trouver cette musique. Vérifiez le lien ou essayez un autre terme de recherche.\n*Astuce: Utilisez un lien YouTube complet (www.youtube.com)*',
            ephemeral: true
          });
        }
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
        if (!client.music || !ErelaManager) return interaction.editReply('🚫 Lecteur indisponible (module non chargé).');
        
        const nodeStatus = (() => {
          try { 
            const nodes = Array.from(client.music.nodes.values());
            const connectedNodes = nodes.filter(n => n.connected);
            return { total: nodes.length, connected: connectedNodes.length };
          } catch (_) { 
            return { total: 0, connected: 0 }; 
          }
        })();
        
        if (nodeStatus.connected === 0) {
          const statusMsg = nodeStatus.total > 0 
            ? `🔄 Lecteur temporairement indisponible (${nodeStatus.connected}/${nodeStatus.total} nœuds connectés). Reconnexion en cours...`
            : '⚠️ Aucun serveur audio configuré. Contactez un administrateur.';
          return interaction.editReply(statusMsg);
        }
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
    // Music status command
    if (interaction.isChatInputCommand() && interaction.commandName === 'music-status') {
      try {
        await interaction.deferReply();
        if (!client.music || !ErelaManager) {
          return interaction.editReply('🚫 Module musique non chargé.');
        }
        
        const nodes = Array.from(client.music.nodes.values());
        const connectedNodes = nodes.filter(n => n.connected);
        const players = client.music.players.size;
        
        let statusEmbed = {
          title: '🎵 Statut du Système Musique',
          color: connectedNodes.length > 0 ? 0x00ff00 : 0xff0000,
          fields: [
            {
              name: '📡 Nœuds Lavalink',
              value: `**${connectedNodes.length}/${nodes.length}** connectés`,
              inline: true
            },
            {
              name: '🎧 Lecteurs Actifs',
              value: `**${players}** serveur(s)`,
              inline: true
            },
            {
              name: '📊 Détails des Nœuds',
              value: nodes.length > 0 ? nodes.map(node => {
                const status = node.connected ? '✅' : '❌';
                const id = node.options.identifier || `${node.options.host}:${node.options.port}`;
                const ping = node.connected ? `${node.ping || 'N/A'}ms` : 'Déconnecté';
                return `${status} **${id}** - ${ping}`;
              }).join('\n') : 'Aucun nœud configuré',
              inline: false
            }
          ],
          timestamp: new Date().toISOString(),
          footer: { text: 'BAG Music System' }
        };
        
        if (connectedNodes.length === 0) {
          statusEmbed.description = '⚠️ Aucun nœud connecté. Le système musique est indisponible.';
        } else if (connectedNodes.length < nodes.length) {
          statusEmbed.description = '🔄 Certains nœuds sont déconnectés. Reconnexion automatique en cours.';
        } else {
          statusEmbed.description = '✅ Tous les nœuds sont opérationnels.';
        }
        
        return interaction.editReply({ embeds: [statusEmbed] });
      } catch (e) {
        console.error('Music status error:', e);
        return interaction.editReply('❌ Erreur lors de la récupération du statut.');
      }
    }

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
        const hasAction = (td?.[mode]?.prompts || []).some(p => (p?.type||'').toLowerCase() === 'action');
        const hasTruth = (td?.[mode]?.prompts || []).some(p => (p?.type||'').toLowerCase() === 'verite');
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('td_game:' + mode + ':action').setLabel('ACTION').setStyle(ButtonStyle.Primary).setDisabled(!hasAction),
          new ButtonBuilder().setCustomId('td_game:' + mode + ':verite').setLabel('VÉRITÉ').setStyle(ButtonStyle.Success).setDisabled(!hasTruth),
        );
        try { await interaction.followUp({ embeds: [embed], components: [row] }); } catch (_) {}
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
        
        const basePrice = Number(it.price || 0);
        const finalPrice = await calculateShopPrice(interaction.guild, interaction.user, basePrice);
        
        if ((u.amount || 0) < finalPrice) return interaction.reply({ content: 'Solde insuffisant.', ephemeral: true });
        
        u.amount = (u.amount || 0) - finalPrice;
        await setEconomyUser(interaction.guild.id, interaction.user.id, u);
        
        const priceText = finalPrice === basePrice ? `${finalPrice}` : `${finalPrice} (au lieu de ${basePrice})`;
        const embed = buildEcoEmbed({ 
          title: 'Achat réussi', 
          description: `Vous avez acheté: ${it.name || it.id} pour ${priceText} ${eco.currency?.name || 'BAG$'}`, 
          fields: [{ name: 'Solde', value: String(u.amount), inline: true }] 
        });
        return interaction.update({ embeds: [embed], components: [] });
      }
      if (choice.startsWith('role:')) {
        const [, roleId, durStr] = choice.split(':');
        const entry = (eco.shop?.roles || []).find(r => String(r.roleId) === String(roleId) && String(r.durationDays||0) === String(Number(durStr)||0));
        if (!entry) return interaction.reply({ content: 'Rôle indisponible.', ephemeral: true });
        
        const basePrice = Number(entry.price || 0);
        const finalPrice = await calculateShopPrice(interaction.guild, interaction.user, basePrice);
        
        if ((u.amount || 0) < finalPrice) return interaction.reply({ content: 'Solde insuffisant.', ephemeral: true });
        u.amount = (u.amount||0) - finalPrice;
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
        const priceText = finalPrice === basePrice ? `${finalPrice}` : `${finalPrice} (au lieu de ${basePrice})`;
        const embed = buildEcoEmbed({ 
          title: 'Achat réussi', 
          description: `Rôle attribué: ${label} (${entry.durationDays?`${entry.durationDays}j`:'permanent'}) pour ${priceText} ${eco.currency?.name || 'BAG$'}`, 
          fields: [{ name: 'Solde', value: String(u.amount), inline: true }] 
        });
        return interaction.update({ embeds: [embed], components: [] });
      }
      if (choice.startsWith('suite:')) {
        const key = choice.split(':')[1];
        const prices = eco.suites?.prices || { day:0, week:0, month:0 };
        const daysMap = { day: eco.suites?.durations?.day || 1, week: eco.suites?.durations?.week || 7, month: eco.suites?.durations?.month || 30 };
        
        const basePrice = Number(prices[key] || 0);
        const finalPrice = await calculateShopPrice(interaction.guild, interaction.user, basePrice);
        
        if ((u.amount || 0) < finalPrice) return interaction.reply({ content: 'Solde insuffisant.', ephemeral: true });
        
        const categoryId = eco.suites?.categoryId || '';
        if (!categoryId) return interaction.reply({ content: 'Catégorie des suites non définie. Configurez-la dans /config → Économie → Suites.', ephemeral: true });
        
        u.amount = (u.amount || 0) - finalPrice;
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
        const now = Date.now();
        const ms = (daysMap[key] || 1) * 24 * 60 * 60 * 1000;
        const until = now + ms;
        
        // Créer les canaux
        const text = await interaction.guild.channels.create({ name: `${nameBase}-txt`, type: ChannelType.GuildText, parent: parent.id, permissionOverwrites: overwrites });
        const voice = await interaction.guild.channels.create({ name: `${nameBase}-vc`, type: ChannelType.GuildVoice, parent: parent.id, permissionOverwrites: overwrites });
        
        // Sauvegarder les données de la suite AVANT que l'event ChannelCreate ne se déclenche
        const cfg = await getEconomyConfig(interaction.guild.id);
        cfg.suites = { ...(cfg.suites||{}), active: { ...(cfg.suites?.active||{}), [member.id]: { textId: text.id, voiceId: voice.id, expiresAt: until } } };
        await updateEconomyConfig(interaction.guild.id, cfg);
        
        console.log(`[Suite] Suite créée pour ${member.user.username}: textId=${text.id}, voiceId=${voice.id}`);
        
        // Envoyer immédiatement le message de bienvenue dans le canal texte
        const embed = new EmbedBuilder()
          .setTitle('🏠 Suite Privée - Gestion des Membres')
          .setDescription(`Bienvenue dans votre suite privée !\n\nUtilisez les boutons ci-dessous pour gérer l'accès à vos canaux de suite.`)
          .addFields([
            { name: '📝 Canal Texte', value: `<#${text.id}>`, inline: true },
            { name: '🔊 Canal Vocal', value: `<#${voice.id}>`, inline: true },
            { name: '⏰ Expiration', value: `<t:${Math.floor(until/1000)}:R>`, inline: true }
          ])
          .setColor(0x7289DA)
          .setFooter({ text: 'Cliquez sur les boutons pour inviter ou retirer des membres' });
        
        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`suite_invite_${member.id}`)
              .setLabel('➕ Inviter un membre')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`suite_remove_${member.id}`)
              .setLabel('➖ Retirer un membre')
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`suite_list_${member.id}`)
              .setLabel('📋 Liste des membres')
              .setStyle(ButtonStyle.Secondary)
          );
        
        // Envoyer le message de bienvenue avec ping
        try {
          await text.send({
            content: `<@${member.id}> Votre suite privée est maintenant active !`,
            embeds: [embed],
            components: [row]
          });
          console.log(`[Suite] Message de bienvenue envoyé avec succès dans ${text.name}`);
        } catch (messageError) {
          console.error(`[Suite] Erreur lors de l'envoi du message de bienvenue:`, messageError);
          // Essayer d'envoyer un message simplifié en cas d'erreur
          try {
            await text.send({
              content: `<@${member.id}> Votre suite privée est maintenant active ! Utilisez les commandes slash pour gérer les invitations.`
            });
          } catch (fallbackError) {
            console.error(`[Suite] Erreur même avec le message simplifié:`, fallbackError);
          }
        }
        
        const priceText = finalPrice === basePrice ? `${finalPrice}` : `${finalPrice} (au lieu de ${basePrice})`;
        const responseEmbed = buildEcoEmbed({ 
          title: 'Suite privée créée', 
          description: `Vos salons privés ont été créés pour ${daysMap[key]} jour(s) pour ${priceText} ${eco.currency?.name || 'BAG$'}.`, 
          fields: [ 
            { name: 'Texte', value: `<#${text.id}>`, inline: true }, 
            { name: 'Vocal', value: `<#${voice.id}>`, inline: true }, 
            { name: 'Expiration', value: `<t:${Math.floor(until/1000)}:R>`, inline: true },
            { name: 'Solde', value: String(u.amount), inline: true }
          ] 
        });
        return interaction.update({ embeds: [responseEmbed], components: [] });
      }
      return interaction.reply({ content: 'Choix invalide.', ephemeral: true });
    }
    // Gestion des interactions pour les suites privées
    if (interaction.isButton() && interaction.customId.startsWith('suite_invite_')) {
      const ownerId = interaction.customId.split('_')[2];
      if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: '⛔ Seul le propriétaire de la suite peut gérer les membres.', ephemeral: true });
      }
      
      const eco = await getEconomyConfig(interaction.guild.id);
      const suiteInfo = eco.suites?.active?.[ownerId];
      if (!suiteInfo) {
        return interaction.reply({ content: '❌ Suite privée introuvable ou expirée.', ephemeral: true });
      }
      
      const row = new ActionRowBuilder()
        .addComponents(
          new UserSelectMenuBuilder()
            .setCustomId(`suite_invite_select_${ownerId}`)
            .setPlaceholder('Sélectionnez un membre à inviter...')
            .setMaxValues(1)
        );
      
      return interaction.reply({
        content: '👥 Sélectionnez le membre que vous souhaitez inviter dans votre suite privée :',
        components: [row],
        ephemeral: true
      });
    }
    
    if (interaction.isButton() && interaction.customId.startsWith('suite_remove_')) {
      const ownerId = interaction.customId.split('_')[2];
      if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: '⛔ Seul le propriétaire de la suite peut gérer les membres.', ephemeral: true });
      }
      
      const eco = await getEconomyConfig(interaction.guild.id);
      const suiteInfo = eco.suites?.active?.[ownerId];
      if (!suiteInfo) {
        return interaction.reply({ content: '❌ Suite privée introuvable ou expirée.', ephemeral: true });
      }
      
      // Récupérer les membres ayant accès aux canaux
      const textChannel = interaction.guild.channels.cache.get(suiteInfo.textId);
      const voiceChannel = interaction.guild.channels.cache.get(suiteInfo.voiceId);
      
      const membersWithAccess = new Set();
      if (textChannel) {
        textChannel.permissionOverwrites.cache.forEach((overwrite, id) => {
          if (id !== interaction.guild.roles.everyone.id && id !== ownerId && overwrite.type === 1) {
            if (overwrite.allow.has('ViewChannel')) {
              membersWithAccess.add(id);
            }
          }
        });
      }
      
      if (membersWithAccess.size === 0) {
        return interaction.reply({ content: '📭 Aucun membre invité dans votre suite privée.', ephemeral: true });
      }
      
      const row = new ActionRowBuilder()
        .addComponents(
          new UserSelectMenuBuilder()
            .setCustomId(`suite_remove_select_${ownerId}`)
            .setPlaceholder('Sélectionnez un membre à retirer...')
            .setMaxValues(1)
        );
      
      return interaction.reply({
        content: '👥 Sélectionnez le membre que vous souhaitez retirer de votre suite privée :',
        components: [row],
        ephemeral: true
      });
    }
    
    if (interaction.isButton() && interaction.customId.startsWith('suite_list_')) {
      const ownerId = interaction.customId.split('_')[2];
      if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: '⛔ Seul le propriétaire de la suite peut voir cette liste.', ephemeral: true });
      }
      
      const eco = await getEconomyConfig(interaction.guild.id);
      const suiteInfo = eco.suites?.active?.[ownerId];
      if (!suiteInfo) {
        return interaction.reply({ content: '❌ Suite privée introuvable ou expirée.', ephemeral: true });
      }
      
      // Récupérer les membres ayant accès aux canaux
      const textChannel = interaction.guild.channels.cache.get(suiteInfo.textId);
      const membersWithAccess = [];
      
      if (textChannel) {
        for (const [id, overwrite] of textChannel.permissionOverwrites.cache) {
          if (id !== interaction.guild.roles.everyone.id && id !== ownerId && overwrite.type === 1) {
            if (overwrite.allow.has('ViewChannel')) {
              try {
                const member = await interaction.guild.members.fetch(id);
                membersWithAccess.push(`• <@${id}> (${member.user.username})`);
              } catch (_) {
                membersWithAccess.push(`• <@${id}> (membre introuvable)`);
              }
            }
          }
        }
      }
      
      const embed = new EmbedBuilder()
        .setTitle('📋 Membres de votre Suite Privée')
        .setDescription(membersWithAccess.length > 0 ? 
          `**Propriétaire:** <@${ownerId}>\n\n**Membres invités:**\n${membersWithAccess.join('\n')}` :
          `**Propriétaire:** <@${ownerId}>\n\n*Aucun membre invité*`)
        .addFields([
          { name: '📝 Canal Texte', value: `<#${suiteInfo.textId}>`, inline: true },
          { name: '🔊 Canal Vocal', value: `<#${suiteInfo.voiceId}>`, inline: true },
          { name: '⏰ Expiration', value: `<t:${Math.floor(suiteInfo.expiresAt/1000)}:R>`, inline: true }
        ])
        .setColor(0x7289DA);
      
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
    if (interaction.isUserSelectMenu() && interaction.customId.startsWith('suite_invite_select_')) {
      const ownerId = interaction.customId.split('_')[3];
      if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: '⛔ Seul le propriétaire de la suite peut gérer les membres.', ephemeral: true });
      }
      
      const eco = await getEconomyConfig(interaction.guild.id);
      const suiteInfo = eco.suites?.active?.[ownerId];
      if (!suiteInfo) {
        return interaction.reply({ content: '❌ Suite privée introuvable ou expirée.', ephemeral: true });
      }
      
      const targetUserId = interaction.values[0];
      const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
      if (!targetMember) {
        return interaction.reply({ content: '❌ Membre introuvable.', ephemeral: true });
      }
      
      // Ajouter les permissions au membre pour les deux canaux
      const textChannel = interaction.guild.channels.cache.get(suiteInfo.textId);
      const voiceChannel = interaction.guild.channels.cache.get(suiteInfo.voiceId);
      
      try {
        if (textChannel) {
          await textChannel.permissionOverwrites.create(targetUserId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
          });
        }
        
        if (voiceChannel) {
          await voiceChannel.permissionOverwrites.create(targetUserId, {
            ViewChannel: true,
            Connect: true,
            Speak: true
          });
        }
        
        const embed = new EmbedBuilder()
          .setTitle('✅ Membre Invité')
          .setDescription(`${targetMember.user.username} a été invité dans votre suite privée !`)
          .addFields([
            { name: '👤 Membre', value: `<@${targetUserId}>`, inline: true },
            { name: '📝 Accès Texte', value: textChannel ? '✅' : '❌', inline: true },
            { name: '🔊 Accès Vocal', value: voiceChannel ? '✅' : '❌', inline: true }
          ])
          .setColor(0x00FF00);
        
        // Notifier le membre invité dans le canal texte
        if (textChannel) {
          try {
            await textChannel.send({
              content: `🎉 <@${targetUserId}> a été invité dans la suite privée par <@${ownerId}> !`,
              embeds: [new EmbedBuilder()
                .setDescription('Vous avez maintenant accès aux canaux texte et vocal de cette suite privée.')
                .setColor(0x00FF00)]
            });
            console.log(`[Suite] Message d'invitation envoyé pour ${targetMember.user.username}`);
          } catch (messageError) {
            console.error(`[Suite] Erreur lors de l'envoi du message d'invitation:`, messageError);
          }
        }
        
        return interaction.update({ embeds: [embed], components: [] });
      } catch (error) {
        console.error('Erreur lors de l\'invitation:', error);
        return interaction.reply({ content: '❌ Erreur lors de l\'invitation du membre.', ephemeral: true });
      }
    }
    
    if (interaction.isUserSelectMenu() && interaction.customId.startsWith('suite_remove_select_')) {
      const ownerId = interaction.customId.split('_')[3];
      if (interaction.user.id !== ownerId) {
        return interaction.reply({ content: '⛔ Seul le propriétaire de la suite peut gérer les membres.', ephemeral: true });
      }
      
      const eco = await getEconomyConfig(interaction.guild.id);
      const suiteInfo = eco.suites?.active?.[ownerId];
      if (!suiteInfo) {
        return interaction.reply({ content: '❌ Suite privée introuvable ou expirée.', ephemeral: true });
      }
      
      const targetUserId = interaction.values[0];
      const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
      
      // Retirer les permissions du membre pour les deux canaux
      const textChannel = interaction.guild.channels.cache.get(suiteInfo.textId);
      const voiceChannel = interaction.guild.channels.cache.get(suiteInfo.voiceId);
      
      try {
        if (textChannel) {
          await textChannel.permissionOverwrites.delete(targetUserId);
        }
        
        if (voiceChannel) {
          await voiceChannel.permissionOverwrites.delete(targetUserId);
          // Déconnecter le membre s'il est dans le canal vocal
          if (targetMember && targetMember.voice?.channelId === voiceChannel.id) {
            await targetMember.voice.disconnect('Retiré de la suite privée');
          }
        }
        
        const embed = new EmbedBuilder()
          .setTitle('✅ Membre Retiré')
          .setDescription(`${targetMember?.user.username || 'Le membre'} a été retiré de votre suite privée !`)
          .addFields([
            { name: '👤 Membre', value: `<@${targetUserId}>`, inline: true },
            { name: '📝 Accès Texte', value: '❌ Retiré', inline: true },
            { name: '🔊 Accès Vocal', value: '❌ Retiré', inline: true }
          ])
          .setColor(0xFF4444);
        
        // Notifier dans le canal texte
        if (textChannel) {
          try {
            await textChannel.send({
              content: `👋 <@${targetUserId}> a été retiré de la suite privée par <@${ownerId}>.`,
              embeds: [new EmbedBuilder()
                .setDescription('Votre accès aux canaux de cette suite privée a été révoqué.')
                .setColor(0xFF4444)]
            });
            console.log(`[Suite] Message de retrait envoyé pour ${targetMember?.user.username || targetUserId}`);
          } catch (messageError) {
            console.error(`[Suite] Erreur lors de l'envoi du message de retrait:`, messageError);
          }
        }
        
        return interaction.update({ embeds: [embed], components: [] });
      } catch (error) {
        console.error('Erreur lors du retrait:', error);
        return interaction.reply({ content: '❌ Erreur lors du retrait du membre.', ephemeral: true });
      }
    }

    // French economy top-level commands
    if (interaction.isChatInputCommand() && interaction.commandName === 'solde') {
      const eco = await getEconomyConfig(interaction.guild.id);
      const target = interaction.options.getUser('membre', false) || interaction.user;
      const u = await getEconomyUser(interaction.guild.id, target.id);
      const isSelf = target.id === interaction.user.id;
      // Log debug
      console.log(`[ECONOMY DEBUG] Balance check: User ${target.id} in guild ${interaction.guild.id}: amount=${u.amount}, money=${u.money}`);
      const title = isSelf ? 'Votre solde' : `Solde de ${target.username}`;
      const embed = buildEcoEmbed({
        title,
        description: `\n**Montant**: ${u.amount || 0} ${eco.currency?.name || 'BAG$'}\n**Karma charme**: ${u.charm || 0} • **Karma perversion**: ${u.perversion || 0}\n`,
      });
      return interaction.reply({ embeds: [embed] });
    }
    // removed /economie command
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
      'https://media.giphy.com/media/3o6Zt8j0Yk6y3o5cQg/giphy.gif',
      'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif'
  },
  fuck: {
    success: [
      'https://media.giphy.com/media/3o6ZsY3qZKqRR3YK9m/giphy.gif',
      'https://media.giphy.com/media/3oEduW2X6y83L1ZyBG/giphy.gif',
      'https://media.giphy.com/media/3o6Zt8j0Yk6y3o5cQg/giphy.gif'
    ],
    fail: [
      'https://media.giphy.com/media/3oEduW2X6y83L1ZyBG/giphy.gif',
      'https://media.giphy.com/media/3o6Zt8zb1hQv5nYVxe/giphy.gif'
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
    if (!message.guild) return;
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
    if (message.author?.bot) return; // exclude bots from XP and economy rewards
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
        // Keep only digits, operators, parentheses, spaces, caret, sqrt symbol, and mathematical symbols × ÷
        let onlyDigitsAndOps = raw.replace(/[^0-9+\-*\/().\s^√×÷]/g, '');
        // Remplacer les symboles mathématiques par leurs équivalents
        onlyDigitsAndOps = onlyDigitsAndOps.replace(/×/g, '*').replace(/÷/g, '/');
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
            
            // Vérifier si c'est la première fois que ce nombre est atteint
            const isFirstTime = !cfg.achievedNumbers || !cfg.achievedNumbers.includes(next);
            if (isFirstTime) {
              // Ajouter le nombre à la liste des nombres atteints
              const updatedAchieved = [...(cfg.achievedNumbers || []), next];
              await updateCountingConfig(message.guild.id, { achievedNumbers: updatedAchieved });
              
              // Ajouter les réactions : trophée + check
              try { 
                await message.react('🏆'); 
                await message.react('✅'); 
              } catch (_) {}
            } else {
              // Juste le check habituel
              try { await message.react('✅'); } catch (_) {}
            }
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

    // Système de récompenses économiques pour les messages
    try {
      const eco = await getEconomyConfig(message.guild.id);
      if (eco.rewards?.message?.enabled) {
        const { min, max } = eco.rewards.message;
        const reward = Math.floor(Math.random() * (max - min + 1)) + min;
        
        // Récupérer le solde actuel de l'utilisateur
        const userEco = await getEconomyUser(message.guild.id, message.author.id);
        const beforeAmount = userEco.amount || 0;
        userEco.amount = beforeAmount + reward;
        userEco.money = userEco.amount; // Synchroniser pour compatibilité
        await setEconomyUser(message.guild.id, message.author.id, userEco);
        
        // Log de debug pour diagnostiquer le problème
        console.log(`[ECONOMY DEBUG] Message reward: User ${message.author.id} in guild ${message.guild.id}: ${beforeAmount} + ${reward} = ${userEco.amount}`);
      }
    } catch (_) {}
  } catch (_) {}
});
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    const guild = newState.guild || oldState.guild;
    if (!guild) return;
    const userId = newState.id || oldState.id;
    try { const m = await guild.members.fetch(userId).catch(()=>null); if (m?.user?.bot) return; } catch (_) {}
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
        // Système de récompenses économiques pour le vocal (lors de la sortie)
        try {
          const eco = await getEconomyConfig(guild.id);
          if (eco.rewards?.voice?.enabled) {
            const { min, max, intervalMinutes } = eco.rewards.voice;
            const intervals = Math.floor(minutes / intervalMinutes);
            if (intervals > 0) {
              const totalReward = intervals * (Math.floor(Math.random() * (max - min + 1)) + min);
              const userEco = await getEconomyUser(guild.id, userId);
              const beforeAmount = userEco.amount || 0;
              userEco.amount = beforeAmount + totalReward;
              userEco.money = userEco.amount; // Synchroniser pour compatibilité
              await setEconomyUser(guild.id, userId, userEco);
              
              // Log de debug pour diagnostiquer le problème
              console.log(`[ECONOMY DEBUG] Voice session reward: User ${userId} in guild ${guild.id}: ${beforeAmount} + ${totalReward} = ${userEco.amount}`);
            }
          }
        } catch (_) {}

        await setUserStats(guild.id, userId, stats);
      }
    }
  } catch (_) {}
});
// Note: automatic booster role assignment removed per request

// Système de récompenses vocales périodiques
setInterval(async () => {
  try {
    for (const [guildId, guild] of client.guilds.cache) {
      try {
        const eco = await getEconomyConfig(guildId);
        if (!eco.rewards?.voice?.enabled) continue;
        
        const { min, max, intervalMinutes } = eco.rewards.voice;
        const intervalMs = intervalMinutes * 60 * 1000;
        const now = Date.now();
        
        // Parcourir tous les canaux vocaux du serveur
        for (const [channelId, channel] of guild.channels.cache) {
          if (channel.type === ChannelType.GuildVoice && channel.members.size > 0) {
            for (const [userId, member] of channel.members) {
              if (member.user.bot) continue;
              // Skip if member is a bot or self-bot-like
              if (member?.user?.bot) continue;
              
              try {
                const userEco = await getEconomyUser(guildId, userId);
                const lastVoiceReward = userEco.lastVoiceReward || 0;
                
                // Vérifier si assez de temps s'est écoulé depuis la dernière récompense
                if (now - lastVoiceReward >= intervalMs) {
                  const reward = Math.floor(Math.random() * (max - min + 1)) + min;
                  const beforeAmount = userEco.amount || 0;
                  userEco.amount = beforeAmount + reward;
                  userEco.money = userEco.amount; // Synchroniser pour compatibilité
                  userEco.lastVoiceReward = now;
                  await setEconomyUser(guildId, userId, userEco);
                  
                  // Log de debug pour diagnostiquer le problème
                  console.log(`[ECONOMY DEBUG] Voice reward: User ${userId} in guild ${guildId}: ${beforeAmount} + ${reward} = ${userEco.amount}`);
                }
              } catch (_) {}
            }
          }
        }
      } catch (_) {}
    }
  } catch (_) {}
}, 60 * 1000); // Vérifier toutes les minutes

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

// Palettes de couleurs pour la commande /couleur
const COLOR_PALETTES = {
  pastel: [
    { name: 'Rose Pastel', hex: 'FFB3BA', emoji: '🌸' },
    { name: 'Pêche Pastel', hex: 'FFDFBA', emoji: '🍑' },
    { name: 'Jaune Pastel', hex: 'FFFFBA', emoji: '🌻' },
    { name: 'Vert Pastel', hex: 'BAFFC9', emoji: '🌿' },
    { name: 'Bleu Pastel', hex: 'BAE1FF', emoji: '💙' },
    { name: 'Violet Pastel', hex: 'D4BAFF', emoji: '💜' },
    { name: 'Lavande', hex: 'E6E6FA', emoji: '🪻' },
    { name: 'Menthe', hex: 'AAFFEE', emoji: '🌱' },
    { name: 'Corail Pastel', hex: 'FFB5B5', emoji: '🐚' },
    { name: 'Lilas', hex: 'DDA0DD', emoji: '🌺' },
    { name: 'Aqua Pastel', hex: 'B0E0E6', emoji: '🌊' },
    { name: 'Vanille', hex: 'F3E5AB', emoji: '🍦' },
    { name: 'Rose Poudré', hex: 'F8BBD9', emoji: '🎀' },
    { name: 'Ciel Pastel', hex: 'C7CEEA', emoji: '☁️' },
    { name: 'Saumon Pastel', hex: 'FFB07A', emoji: '🐟' }
  ],
  vif: [
    { name: 'Rouge Vif', hex: 'FF0000', emoji: '❤️' },
    { name: 'Orange Vif', hex: 'FF8C00', emoji: '🧡' },
    { name: 'Jaune Vif', hex: 'FFD700', emoji: '💛' },
    { name: 'Vert Vif', hex: '00FF00', emoji: '💚' },
    { name: 'Bleu Vif', hex: '0080FF', emoji: '💙' },
    { name: 'Violet Vif', hex: '8A2BE2', emoji: '💜' },
    { name: 'Rose Vif', hex: 'FF1493', emoji: '💖' },
    { name: 'Cyan Vif', hex: '00FFFF', emoji: '🩵' },
    { name: 'Magenta', hex: 'FF00FF', emoji: '🩷' },
    { name: 'Lime', hex: '32CD32', emoji: '🍋' },
    { name: 'Turquoise', hex: '40E0D0', emoji: '🌀' },
    { name: 'Corail Vif', hex: 'FF7F50', emoji: '🔥' },
    { name: 'Indigo', hex: '4B0082', emoji: '🌌' },
    { name: 'Écarlate', hex: 'DC143C', emoji: '⭐' },
    { name: 'Émeraude', hex: '50C878', emoji: '💎' }
  ],
  sombre: [
    { name: 'Rouge Sombre', hex: '8B0000', emoji: '🍎' },
    { name: 'Orange Sombre', hex: 'CC5500', emoji: '🍊' },
    { name: 'Jaune Sombre', hex: 'B8860B', emoji: '🟨' },
    { name: 'Vert Sombre', hex: '006400', emoji: '🌲' },
    { name: 'Bleu Sombre', hex: '000080', emoji: '🌀' },
    { name: 'Violet Sombre', hex: '4B0082', emoji: '🍇' },
    { name: 'Rose Sombre', hex: 'C71585', emoji: '🌹' },
    { name: 'Brun Chocolat', hex: '7B3F00', emoji: '🍫' },
    { name: 'Bordeaux', hex: '722F37', emoji: '🍷' },
    { name: 'Vert Forêt', hex: '228B22', emoji: '🌳' },
    { name: 'Bleu Marine', hex: '191970', emoji: '🌊' },
    { name: 'Prune', hex: '663399', emoji: '🟣' },
    { name: 'Anthracite', hex: '36454F', emoji: '⚫' },
    { name: 'Olive', hex: '808000', emoji: '🫒' },
    { name: 'Acajou', hex: 'C04000', emoji: '🪵' }
  ]
};

function getTextColorForBackground(hex) {
  try {
    const h = hex.startsWith('#') ? hex.slice(1) : hex;
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    const [R, G, B] = [r, g, b].map(c => {
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    const luminance = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    return luminance > 0.5 ? '#000000' : '#FFFFFF';
  } catch (_) { return '#000000'; }
}

function buildPalettePreviewAttachment(colors, category, offset) {
  const cols = 5;
  const rows = 3;
  const tileW = 220;
  const tileH = 120;
  const padding = 20;
  const width = cols * tileW + (padding * 2);
  const height = rows * tileH + (padding * 2);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;

  // Background
  ctx.fillStyle = '#141414';
  ctx.fillRect(0, 0, width, height);

  const startX = padding;
  const startY = padding;
  for (let index = 0; index < colors.length && index < cols * rows; index++) {
    const color = colors[index];
    const c = index % cols;
    const r = Math.floor(index / cols);
    const x = startX + c * tileW;
    const y = startY + r * tileH;

    // Tile background color
    ctx.fillStyle = '#' + color.hex;
    ctx.fillRect(x + 8, y + 8, tileW - 16, tileH - 16);

    // Border
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 8, y + 8, tileW - 16, tileH - 16);

    // Text (name and hex)
    const txtColor = getTextColorForBackground(color.hex);
    ctx.fillStyle = txtColor;
    ctx.font = 'bold 22px Sans';
    ctx.textBaseline = 'top';
    ctx.fillText(color.emoji + ' ' + color.name, x + 18, y + 16, tileW - 36);
    ctx.font = 'bold 20px Sans';
    ctx.fillText('#' + color.hex, x + 18, y + tileH - 42, tileW - 36);
  }

  const filename = `palette_${category}_${offset||0}.png`;
  const buffer = canvas.toBuffer('image/png');
  const attachment = new AttachmentBuilder(buffer, { name: filename });
  return { attachment, filename };
}

function clampPaletteOffset(total, offset, limit) {
  if (total <= 0) return 0;
  const last = Math.max(0, (Math.ceil(total / limit) - 1) * limit);
  if (!Number.isFinite(offset) || offset < 0) return 0;
  if (offset > last) return last;
  return Math.floor(offset / limit) * limit;
}

function buildColorSelectView(targetType, targetId, category, offset = 0) {
  const colorsAll = COLOR_PALETTES[category] || [];
  const limit = 15;
  const total = colorsAll.length;
  const off = clampPaletteOffset(total, Number(offset) || 0, limit);
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const pageIndex = total === 0 ? 1 : Math.floor(off / limit) + 1;
  const colors = colorsAll.slice(off, off + limit);

  const colorSelect = new StringSelectMenuBuilder()
    .setCustomId(`couleur_final_select:${targetType}:${targetId}:${category}`)
    .setPlaceholder('Choisir une couleur…')
    .setMinValues(1)
    .setMaxValues(1);
  colors.forEach(color => {
    colorSelect.addOptions({ label: `${color.emoji} ${color.name}`, value: color.hex, description: `#${color.hex}` });
  });

  const prevBtn = new ButtonBuilder()
    .setCustomId(`couleur_palette_page:${targetType}:${targetId}:${category}:${Math.max(0, off - limit)}`)
    .setLabel('⟨ Précédent')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(off <= 0);
  const nextBtn = new ButtonBuilder()
    .setCustomId(`couleur_palette_page:${targetType}:${targetId}:${category}:${off + limit}`)
    .setLabel('Suivant ⟩')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(off + limit >= total);
  const backBtn = new ButtonBuilder()
    .setCustomId(`couleur_back_to_category:${targetType}:${targetId}`)
    .setLabel('↩️ Retour')
    .setStyle(ButtonStyle.Secondary);

  const categoryNames = { pastel: 'Pastel', vif: 'Vives', sombre: 'Sombres' };
  const fields = colors.map(color => ({ name: `${color.emoji} ${color.name}`, value: `#${color.hex}`, inline: true }));
  const embed = new EmbedBuilder()
    .setColor(THEME_COLOR_PRIMARY)
    .setTitle(`🎨 Attribution de couleur — ${categoryNames[category]}`)
    .setDescription(`Sélectionnez une couleur (${pageIndex}/${pageCount}). Utilisez les boutons pour naviguer.`)
    .setThumbnail(THEME_IMAGE)
    .setFooter({ text: 'BAG • Couleurs', iconURL: THEME_FOOTER_ICON })
    .setTimestamp()
    .addFields(fields);

  const { attachment, filename } = buildPalettePreviewAttachment(colors, category, off);
  embed.setImage(`attachment://${filename}`);

  const rows = [
    new ActionRowBuilder().addComponents(colorSelect),
    new ActionRowBuilder().addComponents(backBtn, prevBtn, nextBtn),
  ];

  return { embed, rows, files: [attachment] };
}

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
  const promptsEditBtn = new ButtonBuilder().setCustomId('td_prompts_edit:' + mode).setLabel('Modifier prompt').setStyle(ButtonStyle.Secondary);
  return [
    new ActionRowBuilder().addComponents(modeSelect),
    new ActionRowBuilder().addComponents(channelAdd),
    new ActionRowBuilder().addComponents(channelRemove),
    new ActionRowBuilder().addComponents(addActionBtn, addTruthBtn, promptsDelBtn, promptsDelAllBtn, promptsEditBtn),
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
async function buildTdEditComponents(guild, mode = 'sfw', offset = 0) {
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
    .setCustomId('td_prompts_edit_select:' + mode + ':' + off)
    .setPlaceholder(total ? ('Choisir un prompt à modifier • ' + pageText) : 'Aucun prompt')
    .setMinValues(1)
    .setMaxValues(1);
  if (view.length) select.addOptions(...view.map(p => ({ label: `#${p.id} ${String(p.text||'').slice(0,80)}`, value: String(p.id) })));
  else select.addOptions({ label: 'Aucun', value: 'none' }).setDisabled(true);

  const hasPrev = off > 0;
  const hasNext = off + limit < total;
  const prevBtn = new ButtonBuilder().setCustomId(`td_prompts_edit_page:${mode}:${Math.max(0, off - limit)}`).setLabel('⟨ Précédent').setStyle(ButtonStyle.Secondary).setDisabled(!hasPrev);
  const nextBtn = new ButtonBuilder().setCustomId(`td_prompts_edit_page:${mode}:${off + limit}`).setLabel('Suivant ⟩').setStyle(ButtonStyle.Primary).setDisabled(!hasNext);

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

// Calculate karma modifier percentage for shop prices
function calculateKarmaShopModifier(karmaModifiers, userCharm, userPerversion) {
  if (!Array.isArray(karmaModifiers)) return 0;
  
  return karmaModifiers.reduce((acc, rule) => {
    try {
      const expr = String(rule.condition || '')
        .toLowerCase()
        .replace(/charm/g, String(userCharm))
        .replace(/perversion/g, String(userPerversion));
      
      // Security check - only allow safe mathematical expressions
      if (!/^[0-9+\-*/%<>=!&|().\s]+$/.test(expr)) return acc;
      
      // eslint-disable-next-line no-eval
      const conditionMet = !!eval(expr);
      return conditionMet ? acc + Number(rule.percent || 0) : acc;
    } catch (_) {
      return acc;
    }
  }, 0);
}

// Calculate final shop price with cumulative booster and karma modifiers
async function calculateShopPrice(guild, user, basePrice) {
  const eco = await getEconomyConfig(guild.id);
  const userEco = await getEconomyUser(guild.id, user.id);
  
  // totalDeltaPercent: positif = augmente le prix, négatif = baisse le prix
  let totalDeltaPercent = 0;
  
  // Add booster discount
  try {
    const b = eco.booster || {};
    const member = await guild.members.fetch(user.id).catch(() => null);
    const isNitroBooster = Boolean(member?.premiumSince || member?.premiumSinceTimestamp);
    const boosterRoleIds = Array.isArray(b.roles) ? b.roles.map(String) : [];
    const hasBoosterRole = member ? boosterRoleIds.some((rid) => member.roles?.cache?.has(rid)) : false;
    const isBooster = isNitroBooster || hasBoosterRole;
    if (b.enabled && isBooster && Number(b.shopPriceMult) > 0) {
      const boosterMult = Number(b.shopPriceMult);
      const boosterDeltaPercent = -((1 - boosterMult) * 100); // remise → delta négatif
      totalDeltaPercent += boosterDeltaPercent;
    }
  } catch (_) {}
  
  // Add karma discount
  const karmaPercent = calculateKarmaShopModifier(eco.karmaModifiers?.shop, userEco.charm || 0, userEco.perversion || 0);
  totalDeltaPercent += karmaPercent; // positif = augmentation, négatif = remise
  
  // Apply cumulative discount
  const finalMultiplier = Math.max(0, 1 + totalDeltaPercent / 100);
  return Math.max(0, Math.floor(basePrice * finalMultiplier));
}
// Build detailed boutique embed showing base prices and karma-modified prices
async function buildBoutiqueEmbed(guild, user, offset = 0, limit = 25) {
  const eco = await getEconomyConfig(guild.id);
  const userEco = await getEconomyUser(guild.id, user.id);
  const userCharm = userEco.charm || 0;
  const userPerversion = userEco.perversion || 0;
  const currency = eco.currency?.name || 'BAG$';
  
  // Check if user is a booster
  let isBooster = false;
  let boosterMult = 1;
  try {
    const b = eco.booster || {};
    const member = await guild.members.fetch(user.id).catch(() => null);
    const isNitroBooster = Boolean(member?.premiumSince || member?.premiumSinceTimestamp);
    const boosterRoleIds = Array.isArray(b.roles) ? b.roles.map(String) : [];
    const hasBoosterRole = member ? boosterRoleIds.some((rid) => member.roles?.cache?.has(rid)) : false;
    isBooster = isNitroBooster || hasBoosterRole;
    if (b.enabled && isBooster && Number(b.shopPriceMult) > 0) {
      boosterMult = Number(b.shopPriceMult);
    }
  } catch (_) {}
  
  // Calculate karma modifier percentage
  const karmaPercent = calculateKarmaShopModifier(eco.karmaModifiers?.shop, userCharm, userPerversion);
  const karmaFactor = Math.max(0, 1 + karmaPercent / 100);
  
  const embed = new EmbedBuilder()
    .setColor(THEME_COLOR_PRIMARY)
    .setTitle('🛍️ Boutique BAG')
    .setThumbnail(THEME_IMAGE)
    .setFooter({ text: 'Boy and Girls (BAG)', iconURL: THEME_FOOTER_ICON });
  
  // Calculate total delta for display (positif = augmente, négatif = baisse)
  let totalDeltaPercent = 0;
  if (isBooster && boosterMult !== 1) {
    totalDeltaPercent += -((1 - boosterMult) * 100);
  }
  totalDeltaPercent += karmaPercent;
  
  // User info
  let description = `💰 **Votre solde :** ${userEco.amount || 0} ${currency}\n`;
  description += `✨ **Charme :** ${userCharm} | 😈 **Perversion :** ${userPerversion}\n`;
  
  // Show individual modifiers
  if (isBooster && boosterMult !== 1) {
    const boosterDiscount = (1 - boosterMult) * 100;
    description += `🚀 **Bonus booster :** ${Math.round(-boosterDiscount)}%\n`;
  }
  if (karmaPercent !== 0) {
    const sign = karmaPercent > 0 ? '+' : '';
    description += `🎯 **Modification karma :** ${sign}${karmaPercent}%\n`;
  }
  
  // Show total cumulative delta
  if (totalDeltaPercent !== 0) {
    const sign = totalDeltaPercent > 0 ? '+' : '';
    const totalText = totalDeltaPercent <= -100 ? '**ARTICLES GRATUITS!** 🎉' : `**Total : ${sign}${Math.round(totalDeltaPercent)}%**`;
    description += `💸 **Impact cumulé :** ${totalText}\n`;
  }
  
  description += '\n**Articles disponibles :**';
  
  embed.setDescription(description);
  
  const fields = [];
  
  // Helper function to calculate final price with cumulative modifiers (positive = augmente, négatif = baisse)
  const calculateFinalPrice = (basePrice) => {
    let price = basePrice;
    
    let totalDeltaPercent = 0;
    
    // Booster delta (multiplier < 1 => remise négative)
    if (isBooster && boosterMult !== 1) {
      const boosterDiscountPercent = (1 - boosterMult) * 100;
      totalDeltaPercent += -boosterDiscountPercent;
    }
    
    // Karma delta (déjà signé)
    totalDeltaPercent += karmaPercent;
    
    const finalMultiplier = Math.max(0, 1 + totalDeltaPercent / 100);
    price = Math.max(0, Math.floor(basePrice * finalMultiplier));
    
    return { finalPrice: price, totalDeltaPercent };
  };
  
  // Helper function to format price display with discount info
  const formatPrice = (basePrice) => {
    const { finalPrice, totalDeltaPercent } = calculateFinalPrice(basePrice);
    
    if (finalPrice === basePrice) {
      return `**${finalPrice}** ${currency}`;
    } else {
      const suffix = totalDeltaPercent <= -100 ? ' (GRATUIT!)' : ` (${totalDeltaPercent>0?'+':''}${Math.round(totalDeltaPercent)}%)`;
      return `~~${basePrice}~~ **${finalPrice}** ${currency}${suffix}`;
    }
  };
  
  // Pagination des entrées: concaténer items + roles + suites comme une liste linéaire
  const entries = [];
  if (Array.isArray(eco.shop?.items)) {
    for (const item of eco.shop.items) entries.push({ type: 'item', data: item });
  }
  if (Array.isArray(eco.shop?.roles)) {
    for (const role of eco.shop.roles) entries.push({ type: 'role', data: role });
  }
  if (eco.suites) {
    const prices = eco.suites.prices || { day: 0, week: 0, month: 0 };
    const durations = [
      { key: 'day', name: 'Suite privée (1 jour)', emoji: '🏠' },
      { key: 'week', name: 'Suite privée (7 jours)', emoji: '🏡' },
      { key: 'month', name: 'Suite privée (30 jours)', emoji: '🏰' }
    ];
    for (const dur of durations) entries.push({ type: 'suite', data: { key: dur.key, name: dur.name, emoji: dur.emoji, price: Number(prices[dur.key] || 0) } });
  }
  const total = entries.length;
  const slice = entries.slice(offset, offset + limit);
  
  // Regrouper par sections pour l'embed (Discord limite 25 fields et la taille globale)
  // On reconstruit des champs pour les éléments affichés uniquement
  const itemsShown = slice.filter(e => e.type === 'item').map(e => e.data);
  const rolesShown = slice.filter(e => e.type === 'role').map(e => e.data);
  const suitesShown = slice.filter(e => e.type === 'suite').map(e => e.data);

  // Objets
  if (itemsShown.length) {
    let itemsText = '';
    for (const item of itemsShown) {
      const basePrice = item.price || 0;
      itemsText += `• ${item.name || item.id} - ${formatPrice(basePrice)}\n`;
    }
    if (itemsText) fields.push({ name: '🎁 Objets', value: itemsText, inline: false });
  }
  
  // Rôles
  if (rolesShown.length) {
    let rolesText = '';
    for (const role of rolesShown) {
      const roleName = guild.roles.cache.get(role.roleId)?.name || role.name || role.roleId;
      const duration = role.durationDays ? ` (${role.durationDays}j)` : ' (permanent)';
      const basePrice = role.price || 0;
      rolesText += `• ${roleName}${duration} - ${formatPrice(basePrice)}\n`;
    }
    if (rolesText) fields.push({ name: '🎭 Rôles', value: rolesText, inline: false });
  }
  
  // Suites privées
  if (suitesShown.length) {
    let suitesText = '';
    for (const s of suitesShown) {
      suitesText += `${s.emoji} ${s.name} - ${formatPrice(s.price)}\n`;
    }
    if (suitesText) fields.push({ name: `${eco.suites.emoji || '💞'} Suites Privées`, value: suitesText, inline: false });
  }
  
  if (fields.length === 0) {
    embed.setDescription(description + '\n*Aucun article disponible pour le moment.*');
  } else {
    embed.addFields(...fields);
  }
  
  // Footer pagination
  if (total > limit) {
    const from = Math.min(total, offset + 1);
    const to = Math.min(total, offset + limit);
    embed.setFooter({ text: `Boy and Girls (BAG) • ${from}-${to} sur ${total}`, iconURL: THEME_FOOTER_ICON });
  }
  return embed;
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

function buildBoutiquePageRow(offset, limit, total) {
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;
  const prevOffset = Math.max(0, offset - limit);
  const nextOffset = offset + limit;
  const prevBtn = new ButtonBuilder().setCustomId(`boutique_page:${prevOffset}:${limit}`).setLabel('⟨ Précédent').setStyle(ButtonStyle.Secondary).setDisabled(!hasPrev);
  const nextBtn = new ButtonBuilder().setCustomId(`boutique_page:${nextOffset}:${limit}`).setLabel('Suivant ⟩').setStyle(ButtonStyle.Primary).setDisabled(!hasNext);
  return new ActionRowBuilder().addComponents(prevBtn, nextBtn);
}

async function getBoutiqueEntriesCount(guild) {
  const eco = await getEconomyConfig(guild.id);
  let count = 0;
  count += Array.isArray(eco.shop?.items) ? eco.shop.items.length : 0;
  count += Array.isArray(eco.shop?.roles) ? eco.shop.roles.length : 0;
  if (eco.suites) count += 3; // day/week/month
  return { entriesCount: count };
}

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const ak = await getAutoKickConfig(member.guild.id);
    if (!ak?.enabled) return;
    await addPendingJoiner(member.guild.id, member.id, Date.now());
  } catch (_) {}
});
// Note: no automatic booster role assignment on join