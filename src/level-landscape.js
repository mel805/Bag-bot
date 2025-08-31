// level-landscape.js
// Annonce de niveau — format paysage, style doré prestige
// Dépendances: npm i @napi-rs/canvas
// (optionnel) pour Discord: npm i discord.js

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { ensurePrestigeFontsRegistered } = require('./utils/canvasFonts');
let AttachmentBuilder;
try { ({ AttachmentBuilder } = require('discord.js')); } catch (_) { /* optionnel */ }

// Enregistrement de polices (une seule fois via helper)
ensurePrestigeFontsRegistered();

function goldGradient(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0.00, '#f8e7a1');
  g.addColorStop(0.18, '#d6b25e');
  g.addColorStop(0.36, '#f5d98c');
  g.addColorStop(0.58, '#b98a3e');
  g.addColorStop(0.78, '#e9c66f');
  g.addColorStop(1.00, '#a77a33');
  return g;
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function setFont(ctx, weightPx, familySerif = true) {
  const fam = familySerif
    ? '"Cinzel","CormorantGaramond","Cormorant","Times New Roman",serif'
    : '"Cinzel","CormorantGaramond","Cormorant","Times New Roman",serif';
  ctx.font = `${weightPx} ${fam}`;
}

function fitAndDrawCentered(ctx, text, y, weight, startSize, maxWidth) {
  let size = startSize;
  do {
    setFont(ctx, `${weight} ${size}px`);
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  } while (size >= 16);
  ctx.fillText(text, ctx.canvas.width / 2, y);
  return size;
}

// Twemoji helpers for rendering colored emojis on Canvas
const EMOJI_URLS = {
  '💎': 'https://twemoji.maxcdn.com/v/latest/72x72/1f48e.png',
  '🔥': 'https://twemoji.maxcdn.com/v/latest/72x72/1f525.png',
  '🎉': 'https://twemoji.maxcdn.com/v/latest/72x72/1f389.png',
  '👑': 'https://twemoji.maxcdn.com/v/latest/72x72/1f451.png',
};

const __twemojiCache = new Map(); // url -> Image

function __parseFontPx(font) {
  const m = String(font || '').match(/(\d+)px/);
  return m ? parseInt(m[1], 10) : 16;
}

function __emojiUrlForChar(ch) {
  return EMOJI_URLS[ch] || null;
}

async function __getEmojiImage(ch) {
  const url = __emojiUrlForChar(ch);
  if (!url) return null;
  let img = __twemojiCache.get(url);
  if (img) return img;
  try {
    img = await loadImage(url);
    __twemojiCache.set(url, img);
    return img;
  } catch {
    return null;
  }
}

function measureTextWithEmoji(ctx, text, emojiSizePx) {
  let w = 0;
  const emSize = Math.max(8, Math.round(emojiSizePx || __parseFontPx(ctx.font)));
  for (const ch of String(text || '')) {
    if (__emojiUrlForChar(ch)) w += emSize; else w += ctx.measureText(ch).width;
  }
  return w;
}

async function drawTextWithEmoji(ctx, text, x, y, align = 'left', baseline = 'top', emojiSizePx) {
  const prevAlign = ctx.textAlign;
  const prevBaseline = ctx.textBaseline;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const emSize = Math.max(8, Math.round(emojiSizePx || __parseFontPx(ctx.font)));
  const total = measureTextWithEmoji(ctx, text, emSize);
  let cx = x;
  if (align === 'center') cx = x - total / 2;
  else if (align === 'right') cx = x - total;
  let cy = y;
  if (baseline === 'middle') cy = y - emSize / 2;
  else if (baseline === 'bottom') cy = y - emSize;
  let buffer = '';
  const flush = () => {
    if (!buffer) return;
    ctx.fillText(buffer, cx, cy);
    cx += ctx.measureText(buffer).width;
    buffer = '';
  };
  for (const ch of String(text || '')) {
    if (__emojiUrlForChar(ch)) {
      flush();
      const img = await __getEmojiImage(ch);
      if (img) {
        ctx.drawImage(img, cx, cy, emSize, emSize);
        cx += emSize;
      } else {
        ctx.fillText(ch, cx, cy);
        cx += ctx.measureText(ch).width;
      }
    } else {
      buffer += ch;
    }
  }
  flush();
  ctx.textAlign = prevAlign;
  ctx.textBaseline = prevBaseline;
}

/**
 * Rend la carte d'annonce de niveau (paysage)
 * @param {Object} opts
 * @param {string} opts.memberName            Nom du membre
 * @param {number|string} opts.level          Niveau atteint
 * @param {string} opts.roleName              Rôle obtenu
 * @param {string} [opts.logoUrl]             URL d'un logo PNG/JPG à afficher au centre
 * @param {number} [opts.width=1600]          Largeur
 * @param {number} [opts.height=900]          Hauteur
 * @returns {Promise<Buffer>}                 Buffer PNG
 */
async function renderLevelCardLandscape({
  memberName,
  level,
  roleName,
  logoUrl,
  isCertified = false,
  isRoleAward = false,
  width = 1600,
  height = 900,
}) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Fond noir luxe + vignette
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, '#121212');
  bg.addColorStop(1, '#0a0a0a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const vign = ctx.createRadialGradient(width/2, height/2, Math.min(width, height)/3, width/2, height/2, Math.max(width, height));
  vign.addColorStop(0, 'rgba(0,0,0,0)');
  vign.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vign;
  ctx.fillRect(0, 0, width, height);

  // Cadre doré
  const margin = 22;
  ctx.lineWidth = 3;
  ctx.strokeStyle = goldGradient(ctx, margin, margin, width - 2*margin, height - 2*margin);
  drawRoundedRect(ctx, margin, margin, width - 2*margin, height - 2*margin, 18);
  ctx.stroke();

  // petites couronnes aux coins (utilise Twemoji 👑 pour un rendu fiable)
  ctx.fillStyle = ctx.strokeStyle;
  setFont(ctx, '700 34px');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  await drawTextWithEmoji(ctx, '👑', margin + 18, margin + 18, 'left', 'top', 34);
  ctx.textAlign = 'right';
  await drawTextWithEmoji(ctx, '👑', width - margin - 18, margin + 18, 'right', 'top', 34);

  // Titre
  ctx.fillStyle = goldGradient(ctx, 0, 0, width, 160);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const baseTitle = isCertified ? 'ANNONCE DE PRESTIGE' : 'ANNONCE DE NIVEAU';
  const displayedTitle = isCertified ? `👑 ${baseTitle} 👑` : baseTitle;
  // Réduit légèrement la taille de départ et resserre le cadre utile pour éviter les débordements
  let titleSize = isCertified ? 92 : 96;
  setFont(ctx, `800 ${titleSize}px`);
  const titleMaxW = width - 300; // marge un peu plus large
  while (measureTextWithEmoji(ctx, displayedTitle, titleSize) > titleMaxW && titleSize > 46) {
    titleSize -= 2;
    setFont(ctx, `800 ${titleSize}px`);
  }
  await drawTextWithEmoji(ctx, displayedTitle, width / 2, 70, 'center', 'top', titleSize);

  // Bloc central textes
  const maxW = Math.min(1180, width - 260);
  let y = 206;

  // Nom du membre (légère réduction pour éviter les débordements)
  ctx.fillStyle = goldGradient(ctx, 0, y, width, 80);
  setFont(ctx, '700 74px');
  y += fitAndDrawCentered(ctx, String(memberName || 'Nom du membre'), y, 700, 74, maxW) + 14;

  if (isRoleAward) {
    // Texte simplifié pour annonce de rôle
    ctx.fillStyle = goldGradient(ctx, 0, y, width, 60);
    setFont(ctx, '800 68px');
    y += fitAndDrawCentered(ctx, 'Félicitations !', y, 800, 68, maxW) + 16;

    ctx.fillStyle = goldGradient(ctx, 0, y, width, 56);
    setFont(ctx, '700 52px');
    y += fitAndDrawCentered(ctx, 'Tu as obtenue le rôle', y, 700, 52, maxW) + 12;

    ctx.fillStyle = goldGradient(ctx, 0, y, width, 56);
    setFont(ctx, '700 52px');
    y += fitAndDrawCentered(ctx, `(${String(roleName || '—')})`, y, 700, 52, maxW) + 22;
  } else {
    // Sous-texte
    ctx.fillStyle = goldGradient(ctx, 0, y, width, 60);
    setFont(ctx, '600 46px');
    y += fitAndDrawCentered(ctx, 'vient de franchir un nouveau cap !', y, 600, 46, maxW) + 16;

    // Niveau
    ctx.fillStyle = goldGradient(ctx, 0, y, width, 60);
    setFont(ctx, '700 54px');
    y += fitAndDrawCentered(ctx, `Niveau atteint : ${Number(level || 0)}`, y, 700, 54, maxW) + 12;

    // Rôle obtenu
    ctx.fillStyle = goldGradient(ctx, 0, y, width, 60);
    setFont(ctx, '700 54px');
    y += fitAndDrawCentered(ctx, `Rôle obtenu : ${String(roleName || '—')}`, y, 700, 54, maxW) + 22;
  }

  // Logo central (entre role obtenu et Félicitations)
  const logoSize = 220;
  const logoY = y;
  if (logoUrl) {
    try {
      const img = await loadImage(logoUrl);
      // anneau doré
      ctx.beginPath();
      ctx.arc(width/2, logoY + logoSize/2, logoSize/2 + 10, 0, Math.PI*2);
      ctx.strokeStyle = goldGradient(ctx, width/2 - logoSize/2, logoY, logoSize, logoSize);
      ctx.lineWidth = 8;
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.arc(width/2, logoY + logoSize/2, logoSize/2, 0, Math.PI*2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, width/2 - logoSize/2, logoY, logoSize, logoSize);
      ctx.restore();
    } catch {
      // fallback rond doré
      ctx.beginPath();
      ctx.arc(width/2, logoY + logoSize/2, logoSize/2, 0, Math.PI*2);
      ctx.fillStyle = goldGradient(ctx, width/2 - logoSize/2, logoY, logoSize, logoSize);
      ctx.fill();
      setFont(ctx, '800 72px');
      ctx.fillStyle = '#111';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BAG', width/2, logoY + logoSize/2);
    }
  }

  // Félicitations (seulement pour annonces de niveau)
  const congratsY = logoY + logoSize + 18;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  if (!isRoleAward) {
    ctx.fillStyle = goldGradient(ctx, 0, congratsY, width, 50);
    setFont(ctx, '800 74px');
    ctx.fillText('Félicitations !', width/2, congratsY);
  }

  // Baseline / slogan (with Twemoji)
  const baseY = congratsY + (isRoleAward ? 0 : 88);
  ctx.fillStyle = goldGradient(ctx, 0, baseY, width, 40);
  let sizePx = 40;
  setFont(ctx, `700 ${sizePx}px`);
  const baseline = isCertified
    ? 'continue ton ascension vers les récompenses ultimes'
    : 'CONTINUE TON ASCENSION VERS LES RÉCOMPENSES ULTIMES';
  const left = '💎 ';
  const right = ' 💎';
  const text = left + baseline + right;
  while (measureTextWithEmoji(ctx, text, sizePx) > width - 160) {
    sizePx -= 2;
    if (sizePx <= 32) break;
    setFont(ctx, `700 ${sizePx}px`);
  }
  await drawTextWithEmoji(ctx, text, width/2, baseY, 'center', 'top', sizePx);

  return canvas.toBuffer('image/png');
}

// Helper Discord (optionnel)
async function sendLevelCardLandscape(interaction, { memberName, level, roleName, logoUrl }) {
  const png = await renderLevelCardLandscape({ memberName, level, roleName, logoUrl });
  if (!AttachmentBuilder) throw new Error('discord.js non installé');
  const file = new AttachmentBuilder(png, { name: 'annonce-niveau.png' });
  if (interaction.deferred || interaction.replied) return interaction.followUp({ files: [file] });
  return interaction.reply({ files: [file] });
}

module.exports = {
  renderLevelCardLandscape,
  sendLevelCardLandscape,
};

