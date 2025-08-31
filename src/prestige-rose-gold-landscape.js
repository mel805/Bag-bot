// prestige-rose-gold-landscape.js
// npm i @napi-rs/canvas
// (optionnel) npm i discord.js

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { ensurePrestigeFontsRegistered } = require('./utils/canvasFonts');
let AttachmentBuilder;
try { ({ AttachmentBuilder } = require('discord.js')); } catch (_) {}

// Enregistre les polices si disponibles
ensurePrestigeFontsRegistered();

function roseGold(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0.00, '#ffd6c8');
  g.addColorStop(0.18, '#e7a58e');
  g.addColorStop(0.38, '#f3c3b3');
  g.addColorStop(0.60, '#c57d68');
  g.addColorStop(0.80, '#f1b7a6');
  g.addColorStop(1.00, '#b36b59');
  return g;
}

function setSerif(ctx, weight, sizePx) {
  const fam = '"Cinzel","CormorantGaramond","Cormorant","Times New Roman",serif';
  ctx.font = `${weight} ${sizePx}px ${fam}`;
}

function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function fitCentered(ctx, text, y, weight, startPx, maxW) {
  let size = startPx;
  do {
    setSerif(ctx, weight, size);
    if (measureTextWithEmoji(ctx, text, size) <= maxW) break;
    size -= 2;
  } while (size >= 18);
  // drawing is handled by drawTextWithEmoji where used
  return size;
}

// Twemoji helpers for rendering colored emojis on Canvas
const EMOJI_URLS = {
  '💎': 'https://twemoji.maxcdn.com/v/latest/72x72/1f48e.png',
  '🔥': 'https://twemoji.maxcdn.com/v/latest/72x72/1f525.png',
  '🎉': 'https://twemoji.maxcdn.com/v/latest/72x72/1f389.png',
  '👑': 'https://twemoji.maxcdn.com/v/latest/72x72/1f451.png',
};

const __twemojiCache = new Map();

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
 * Rend la carte ROSE GOLD (paysage)
 * @param {Object} opts
 * @param {string} opts.memberName      Nom du membre
 * @param {number} opts.level           Niveau
 * @param {string} opts.lastRole        Dernière distinction
 * @param {string} [opts.logoUrl]       Logo rond BAG (petit au centre)
 * @param {string} [opts.bgLogoUrl]     Logo BAG grand pour le filigrane
 * @param {number} [opts.width=1600]
 * @param {number} [opts.height=900]
 * @returns {Promise<Buffer>}
 */
async function renderPrestigeCardRoseGoldLandscape({
  memberName,
  level,
  lastRole,
  logoUrl,
  bgLogoUrl,
  isRoleAward = false,
  width = 1600,
  height = 900,
}) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Fond sombre + vignette
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, '#0d0b0b');
  bg.addColorStop(1, '#070606');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const vign = ctx.createRadialGradient(width/2, height/2, Math.min(width,height)/2.2, width/2, height/2, Math.max(width,height));
  vign.addColorStop(0, 'rgba(0,0,0,0)');
  vign.addColorStop(1, 'rgba(0,0,0,0.60)');
  ctx.fillStyle = vign;
  ctx.fillRect(0, 0, width, height);

  // Filigrane BAG géant
  if (bgLogoUrl) {
    try {
      const img = await loadImage(bgLogoUrl);
      const target = Math.min(width, height) * 1.2;
      const x = (width - target) / 2;
      const y = (height - target) / 2 + 20;
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.drawImage(img, x, y, target, target);
      ctx.restore();
    } catch {}
  }

  // Cadre rose gold + coins
  const m = 22;
  ctx.lineWidth = 3;
  ctx.strokeStyle = roseGold(ctx, m, m, width-2*m, height-2*m);
  roundedRect(ctx, m, m, width - 2*m, height - 2*m, 18);
  ctx.stroke();

  ctx.fillStyle = ctx.strokeStyle;
  setSerif(ctx, '700', 32);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  await drawTextWithEmoji(ctx, '👑', m + 18, m + 18, 'left', 'top', 32);
  ctx.textAlign = 'right';
  await drawTextWithEmoji(ctx, '👑', width - m - 18, m + 18, 'right', 'top', 32);

  // Titre
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = roseGold(ctx, 0, 0, width, 140);
  let titleSize = 100;
  setSerif(ctx, '800', titleSize);
  while (ctx.measureText('PROMOTION DE PRESTIGE').width > width - 260 && titleSize > 56) {
    titleSize -= 2;
    setSerif(ctx, '800', titleSize);
  }
  ctx.shadowColor = '#00000080';
  ctx.shadowBlur = 10;
  await drawTextWithEmoji(ctx, 'PROMOTION DE PRESTIGE', width/2, 72, 'center', 'top', titleSize);
  ctx.shadowBlur = 0;

  // Bloc central
  const maxW = Math.min(1200, width - 260);
  let y = 210;

  // Nom membre
  ctx.fillStyle = roseGold(ctx, 0, y, width, 70);
  {
    const t = String(memberName || 'Membre');
    const sz = fitCentered(ctx, t, y, '700', 78, maxW);
    setSerif(ctx, '700', sz);
    await drawTextWithEmoji(ctx, t, width/2, y, 'center', 'top', sz);
    y += sz + 14;
  }

  if (isRoleAward) {
    // Texte simplifié pour annonce de rôle
    ctx.fillStyle = roseGold(ctx, 0, y, width, 60);
    {
      const t = 'Félicitations !';
      const sz = fitCentered(ctx, t, y, '800', 72, maxW);
      setSerif(ctx, '800', sz);
      await drawTextWithEmoji(ctx, t, width/2, y, 'center', 'top', sz);
      y += sz + 18;
    }

    ctx.fillStyle = roseGold(ctx, 0, y, width, 56);
    {
      const t = 'Tu as obtenue le rôle';
      const sz = fitCentered(ctx, t, y, '700', 56, maxW);
      setSerif(ctx, '700', sz);
      await drawTextWithEmoji(ctx, t, width/2, y, 'center', 'top', sz);
      y += sz + 14;
    }

    ctx.fillStyle = roseGold(ctx, 0, y, width, 56);
    {
      const t = `(${String(lastRole || '—')})`;
      const sz = fitCentered(ctx, t, y, '700', 56, maxW);
      setSerif(ctx, '700', sz);
      await drawTextWithEmoji(ctx, t, width/2, y, 'center', 'top', sz);
      y += sz + 24;
    }
  } else {
    // Sous-texte
    ctx.fillStyle = roseGold(ctx, 0, y, width, 50);
    {
      const t = 'vient de franchir un nouveau cap !';
      const sz = fitCentered(ctx, t, y, '600', 50, maxW);
      setSerif(ctx, '600', sz);
      await drawTextWithEmoji(ctx, t, width/2, y, 'center', 'top', sz);
      y += sz + 14;
    }

    // Niveau
    ctx.fillStyle = roseGold(ctx, 0, y, width, 50);
    {
      const t = `Niveau atteint : ${Number(level || 0)}`;
      const sz = fitCentered(ctx, t, y, '700', 58, maxW);
      setSerif(ctx, '700', sz);
      await drawTextWithEmoji(ctx, t, width/2, y, 'center', 'top', sz);
      y += sz + 12;
    }

    // Distinction
    ctx.fillStyle = roseGold(ctx, 0, y, width, 50);
    {
      const t = `Dernière distinction : ${String(lastRole || '—')}`;
      const sz = fitCentered(ctx, t, y, '700', 58, maxW);
      setSerif(ctx, '700', sz);
      await drawTextWithEmoji(ctx, t, width/2, y, 'center', 'top', sz);
      y += sz + 24;
    }
  }

  // Logo rond centré
  const logoSize = 210;
  const logoY = y;
  if (logoUrl) {
    try {
      const img = await loadImage(logoUrl);
      ctx.beginPath();
      ctx.arc(width/2, logoY + logoSize/2, logoSize/2 + 9, 0, Math.PI*2);
      ctx.strokeStyle = roseGold(ctx, width/2 - logoSize/2, logoY, logoSize, logoSize);
      ctx.lineWidth = 7;
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.arc(width/2, logoY + logoSize/2, logoSize/2, 0, Math.PI*2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, width/2 - logoSize/2, logoY, logoSize, logoSize);
      ctx.restore();
    } catch {}
  }

  // Félicitations (affiché uniquement pour annonce de niveau)
  const congratsY = logoY + logoSize + 22;
  if (!isRoleAward) {
    ctx.fillStyle = roseGold(ctx, 0, congratsY, width, 40);
    setSerif(ctx, '800', 80);
    await drawTextWithEmoji(ctx, 'Félicitations !', width/2, congratsY, 'center', 'top', 80);
  }

  // Ligne "élite"
  const eliteY = congratsY + (isRoleAward ? 0 : 86);
  if (!isRoleAward) {
    ctx.fillStyle = roseGold(ctx, 0, eliteY, width, 36);
    setSerif(ctx, '700', 50);
    fitCentered(ctx, 'Tu rejoins l’élite de Boys and Girls. 🔥', eliteY, '700', 50, maxW);
  }

  // Baseline finale + diamants (une seule ligne comme demandé)
  if (!isRoleAward) {
    const baseY = eliteY + 68;
    ctx.fillStyle = roseGold(ctx, 0, baseY, width, 30);
    let base = '💎 continue ton ascension vers les récompenses ultimes 💎';
    // taille de départ et ajustement au conteneur
    let baseSize = 42;
    setSerif(ctx, '700', baseSize);
    while (measureTextWithEmoji(ctx, base, baseSize) > width - 200) {
      baseSize -= 2;
      if (baseSize <= 30) break;
      setSerif(ctx, '700', baseSize);
    }
    await drawTextWithEmoji(ctx, base, width/2, baseY, 'center', 'top', baseSize);
  }

  return canvas.toBuffer('image/png');
}

// Helper Discord (optionnel)
async function sendPrestigeRoseGoldLandscape(interaction, data) {
  const png = await renderPrestigeCardRoseGoldLandscape(data);
  if (!AttachmentBuilder) throw new Error('discord.js non installé');
  const file = new AttachmentBuilder(png, { name: 'promotion-prestige-rose-gold.png' });
  if (interaction.deferred || interaction.replied) return interaction.followUp({ files: [file] });
  return interaction.reply({ files: [file] });
}

module.exports = {
  renderPrestigeCardRoseGoldLandscape,
  sendPrestigeRoseGoldLandscape,
};

