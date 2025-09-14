// prestige-blue-landscape.js
// npm i @napi-rs/canvas
// (optionnel) npm i discord.js

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { ensurePrestigeFontsRegistered } = require('./utils/canvasFonts');
let AttachmentBuilder;
try { ({ AttachmentBuilder } = require('discord.js')); } catch (_) {}

ensurePrestigeFontsRegistered();

function blueGradient(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0.00, '#b3d4ff');
  g.addColorStop(0.18, '#6aa6ff');
  g.addColorStop(0.38, '#8bbcff');
  g.addColorStop(0.60, '#2f6bd6');
  g.addColorStop(0.80, '#7fb2ff');
  g.addColorStop(1.00, '#1b4ea3');
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
  // drawing is handled by drawTextWithEmoji at call-sites to render emojis in color
  return size;
}

/**
 * Dessine une barre de progression circulaire autour d'un point central (version bleue)
 * @param {CanvasRenderingContext2D} ctx 
 * @param {number} centerX Centre X
 * @param {number} centerY Centre Y
 * @param {number} radius Rayon du cercle de progression
 * @param {number} progress Progression (0.0 à 1.0)
 * @param {number} strokeWidth Épaisseur du trait
 */
function drawCircularProgressBlue(ctx, centerX, centerY, radius, progress, strokeWidth = 8) {
  // Fond du cercle de progression
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(179,212,255,0.2)';
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Progression (commence en haut et va dans le sens horaire)
  if (progress > 0) {
    ctx.beginPath();
    const startAngle = -Math.PI / 2; // Commence en haut
    const endAngle = startAngle + (2 * Math.PI * Math.min(1, Math.max(0, progress)));
    ctx.arc(centerX, centerY, radius, startAngle, endAngle);
    
    // Créer un gradient bleu pour la progression
    const progressGradient = ctx.createLinearGradient(
      centerX - radius, centerY - radius,
      centerX + radius, centerY + radius
    );
    progressGradient.addColorStop(0, '#b3d4ff');
    progressGradient.addColorStop(0.5, '#6aa6ff');
    progressGradient.addColorStop(1, '#2f6bd6');
    
    ctx.strokeStyle = progressGradient;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

// Twemoji helpers for rendering colored emojis on Canvas
const EMOJI_URLS = {
  '💎': 'https://twemoji.maxcdn.com/v/latest/72x72/1f48e.png',
  '🔥': 'https://twemoji.maxcdn.com/v/latest/72x72/1f525.png',
  '🎉': 'https://twemoji.maxcdn.com/v/latest/72x72/1f389.png',
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

async function renderPrestigeCardBlueLandscape({
  memberName,
  level,
  lastRole,
  logoUrl,
  bgLogoUrl,
  isRoleAward = false,
  width = 1600,
  height = 900,
  xpSinceLevel = 0,
  xpRequiredForNext = 100,
  texts = {},
}) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, '#0b0f14');
  bg.addColorStop(1, '#070a0f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const vign = ctx.createRadialGradient(width/2, height/2, Math.min(width,height)/2.2, width/2, height/2, Math.max(width,height));
  vign.addColorStop(0, 'rgba(0,0,0,0)');
  vign.addColorStop(1, 'rgba(0,0,0,0.60)');
  ctx.fillStyle = vign;
  ctx.fillRect(0, 0, width, height);

  // Watermark (optional)
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

  // Border + corners
  const m = 22;
  ctx.lineWidth = 3;
  ctx.strokeStyle = blueGradient(ctx, m, m, width-2*m, height-2*m);
  roundedRect(ctx, m, m, width - 2*m, height - 2*m, 18);
  ctx.stroke();

  ctx.fillStyle = ctx.strokeStyle;
  setSerif(ctx, '700', 32);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('♕', m + 18, m + 18);
  ctx.textAlign = 'right';
  ctx.fillText('♕', width - m - 18, m + 18);

  // Title (default card for non-certifiés)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = blueGradient(ctx, 0, 0, width, 140);
  let titleSize = 100;
  setSerif(ctx, '800', titleSize);
  while (ctx.measureText('ANNONCE DE PRESTIGE').width > width - 260 && titleSize > 56) {
    titleSize -= 2;
    setSerif(ctx, '800', titleSize);
  }
  ctx.shadowColor = '#00000080';
  ctx.shadowBlur = 10;
  await drawTextWithEmoji(ctx, String(texts.title || 'ANNONCE DE PRESTIGE'), width/2, 72, 'center', 'top', titleSize);
  ctx.shadowBlur = 0;

  // Center block (default reference sizes already used)
  const maxW = Math.min(1200, width - 260);
  let y = 210;

  ctx.fillStyle = blueGradient(ctx, 0, y, width, 70);
  {
    const sz = fitCentered(ctx, String(memberName || 'Membre'), y, '700', 78, maxW);
    setSerif(ctx, '700', sz);
    await drawTextWithEmoji(ctx, String(memberName || 'Membre'), width/2, y, 'center', 'top', sz);
    y += sz + 16;
  }

  if (isRoleAward) {
    // Texte simplifié pour l'annonce de rôle
    ctx.fillStyle = blueGradient(ctx, 0, y, width, 60);
    {
      const t = String(texts.congrats || 'Félicitations !');
      const sz = fitCentered(ctx, t, y, '800', 72, maxW);
      setSerif(ctx, '800', sz);
      await drawTextWithEmoji(ctx, t, width/2, y, 'center', 'top', sz);
      y += sz + 18;
    }

    ctx.fillStyle = blueGradient(ctx, 0, y, width, 56);
    {
      const t = String(texts.subtitle || 'Tu as obtenue le rôle');
      const sz = fitCentered(ctx, t, y, '700', 56, maxW);
      setSerif(ctx, '700', sz);
      await drawTextWithEmoji(ctx, t, width/2, y, 'center', 'top', sz);
      y += sz + 14;
    }

    ctx.fillStyle = blueGradient(ctx, 0, y, width, 56);
    {
      const t = String(texts.roleLine || `(${String(lastRole || '—')})`);
      const sz = fitCentered(ctx, t, y, '700', 56, maxW);
      setSerif(ctx, '700', sz);
      await drawTextWithEmoji(ctx, t, width/2, y, 'center', 'top', sz);
      y += sz + 24;
    }
  } else {
    ctx.fillStyle = blueGradient(ctx, 0, y, width, 50);
    {
      const t = String(texts.subtitle || 'vient de franchir un nouveau cap !');
      const sz = fitCentered(ctx, t, y, '600', 50, maxW);
      setSerif(ctx, '600', sz);
      await drawTextWithEmoji(ctx, t, width/2, y, 'center', 'top', sz);
      y += sz + 14;
    }

    ctx.fillStyle = blueGradient(ctx, 0, y, width, 50);
    {
      const t = String(texts.levelLine || `Niveau atteint : ${Number(level || 0)}`);
      const sz = fitCentered(ctx, t, y, '700', 58, maxW);
      setSerif(ctx, '700', sz);
      await drawTextWithEmoji(ctx, t, width/2, y, 'center', 'top', sz);
      y += sz + 12;
    }

    ctx.fillStyle = blueGradient(ctx, 0, y, width, 50);
    {
      const t = String(texts.roleLine || `Dernière distinction : ${String(lastRole || '—')}`);
      const sz = fitCentered(ctx, t, y, '700', 58, maxW);
      setSerif(ctx, '700', sz);
      await drawTextWithEmoji(ctx, t, width/2, y, 'center', 'top', sz);
      y += sz + 24;
    }
  }

  // Logo central (bag.png) avec barre de progression circulaire (version bleue)
  const logoSize = 210;
  const logoY = y;
  const centerX = width / 2;
  const centerY = logoY + logoSize / 2;
  const progressRadius = logoSize / 2 + 20;
  
  // Calculer la progression (0.0 à 1.0)
  const progress = xpRequiredForNext > 0 ? Math.min(1, Math.max(0, xpSinceLevel / xpRequiredForNext)) : 0;
  
  // Dessiner la barre de progression circulaire bleue
  drawCircularProgressBlue(ctx, centerX, centerY, progressRadius, progress, 12);
  
  // Essayer de charger le logo bag.png
  let bagLogoLoaded = false;
  const bagPaths = ['./bag.png', './Bag.png', './BAG.png'];
  
  for (const bagPath of bagPaths) {
    try {
      console.log('[PrestigeBlue] Tentative de chargement du logo bag:', bagPath);
      const bagImg = await loadImage(bagPath);
      console.log('[PrestigeBlue] Logo bag chargé avec succès, dimensions:', bagImg.width, 'x', bagImg.height);
      
      // Anneau bleu autour du logo
      ctx.beginPath();
      ctx.arc(centerX, centerY, logoSize/2 + 6, 0, Math.PI*2);
      ctx.strokeStyle = blueGradient(ctx, width/2 - logoSize/2, logoY, logoSize, logoSize);
      ctx.lineWidth = 4;
      ctx.stroke();

      // Afficher le logo bag dans un cercle
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, logoSize/2, 0, Math.PI*2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(bagImg, centerX - logoSize/2, logoY, logoSize, logoSize);
      ctx.restore();
      
      bagLogoLoaded = true;
      console.log('[PrestigeBlue] Logo bag affiché avec succès');
      break;
    } catch (error) {
      console.log('[PrestigeBlue] Impossible de charger:', bagPath, error.message);
      continue;
    }
  }
  
  // Si aucun logo bag n'a été chargé, essayer le logoUrl fourni ou utiliser un fallback
  if (!bagLogoLoaded) {
    if (logoUrl) {
      try {
        console.log('[PrestigeBlue] Tentative de chargement du logo fourni:', logoUrl);
        const img = await loadImage(logoUrl);
        console.log('[PrestigeBlue] Logo fourni chargé avec succès');
        
        // Anneau bleu
        ctx.beginPath();
        ctx.arc(centerX, centerY, logoSize/2 + 6, 0, Math.PI*2);
        ctx.strokeStyle = blueGradient(ctx, width/2 - logoSize/2, logoY, logoSize, logoSize);
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.save();
        ctx.beginPath();
        ctx.arc(centerX, centerY, logoSize/2, 0, Math.PI*2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(img, centerX - logoSize/2, logoY, logoSize, logoSize);
        ctx.restore();
        console.log('[PrestigeBlue] Logo fourni affiché avec succès');
      } catch (error) {
        console.error('[PrestigeBlue] Erreur logo fourni:', error.message);
        bagLogoLoaded = false;
      }
    }
    
    // Fallback final
    if (!bagLogoLoaded && !logoUrl) {
      console.log('[PrestigeBlue] Utilisation du fallback BAG');
      ctx.beginPath();
      ctx.arc(centerX, centerY, logoSize/2, 0, Math.PI*2);
      ctx.fillStyle = blueGradient(ctx, width/2 - logoSize/2, logoY, logoSize, logoSize);
      ctx.fill();
      setSerif(ctx, '800', 72);
      ctx.fillStyle = '#0a0a0a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('BAG', centerX, centerY);
    }
  }
  
  // Afficher le pourcentage de progression
  ctx.fillStyle = blueGradient(ctx, centerX - 50, centerY + logoSize/2 + 35, 100, 30);
  setSerif(ctx, '600', 28);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`${Math.round(progress * 100)}%`, centerX, centerY + logoSize/2 + 35);

  // Félicitations (affiché uniquement pour annonce de niveau)
  const congratsY = logoY + logoSize + 22;
  if (!isRoleAward) {
    ctx.fillStyle = blueGradient(ctx, 0, congratsY, width, 40);
    setSerif(ctx, '800', 80);
    await drawTextWithEmoji(ctx, String(texts.congrats || 'Félicitations !'), width/2, congratsY, 'center', 'top', 80);
  }

  // Baseline (inchangée mais harmonisée en logique de sizing)
  const baseY = congratsY + (isRoleAward ? 0 : 86);
  ctx.fillStyle = blueGradient(ctx, 0, baseY, width, 30);
  let baseSize = 42;
  setSerif(ctx, '700', baseSize);
  const base = String(texts.baseline || '💎 CONTINUE TON ASCENSION VERS LES RÉCOMPENSES ULTIMES 💎');
  while (measureTextWithEmoji(ctx, base, baseSize) > width - 180) {
    baseSize -= 2;
    if (baseSize <= 30) break;
    setSerif(ctx, '700', baseSize);
  }
  await drawTextWithEmoji(ctx, base, width/2, baseY, 'center', 'top', baseSize);

  return canvas.toBuffer('image/png');
}

async function sendPrestigeBlueLandscape(interaction, data) {
  const png = await renderPrestigeCardBlueLandscape(data);
  if (!AttachmentBuilder) throw new Error('discord.js non installé');
  const file = new AttachmentBuilder(png, { name: 'promotion-prestige-blue.png' });
  if (interaction.deferred || interaction.replied) return interaction.followUp({ files: [file] });
  return interaction.reply({ files: [file] });
}

module.exports = {
  renderPrestigeCardBlueLandscape,
  sendPrestigeBlueLandscape,
};

