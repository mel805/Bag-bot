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
    if (ctx.measureText(text).width <= maxW) break;
    size -= 2;
  } while (size >= 18);
  ctx.fillText(text, ctx.canvas.width / 2, y);
  return size;
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
  ctx.fillText('♕', m + 18, m + 18);
  ctx.textAlign = 'right';
  ctx.fillText('♕', width - m - 18, m + 18);

  // Titre
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = roseGold(ctx, 0, 0, width, 140);
  let titleSize = 106;
  setSerif(ctx, '800', titleSize);
  while (ctx.measureText('PROMOTION DE PRESTIGE').width > width - 240 && titleSize > 60) {
    titleSize -= 2;
    setSerif(ctx, '800', titleSize);
  }
  ctx.shadowColor = '#00000080';
  ctx.shadowBlur = 10;
  ctx.fillText('PROMOTION DE PRESTIGE', width/2, 72);
  ctx.shadowBlur = 0;

  // Bloc central
  const maxW = Math.min(1200, width - 260);
  let y = 210;

  // Nom membre
  ctx.fillStyle = roseGold(ctx, 0, y, width, 70);
  y += fitCentered(ctx, String(memberName || 'Membre'), y, '700', 82, maxW) + 16;

  // Sous-texte
  ctx.fillStyle = roseGold(ctx, 0, y, width, 50);
  y += fitCentered(ctx, 'vient de franchir un nouveau cap !', y, '600', 54, maxW) + 16;

  // Niveau
  ctx.fillStyle = roseGold(ctx, 0, y, width, 50);
  y += fitCentered(ctx, `Niveau atteint : ${Number(level || 0)}`, y, '700', 62, maxW) + 12;

  // Distinction
  ctx.fillStyle = roseGold(ctx, 0, y, width, 50);
  y += fitCentered(ctx, `Dernière distinction : ${String(lastRole || '—')}`, y, '700', 62, maxW) + 28;

  // Logo rond centré
  const logoSize = 220;
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

  // Félicitations
  const congratsY = logoY + logoSize + 22;
  ctx.fillStyle = roseGold(ctx, 0, congratsY, width, 40);
  setSerif(ctx, '800', 86);
  ctx.fillText('Félicitations !', width/2, congratsY);

  // Ligne "élite"
  const eliteY = congratsY + 86;
  ctx.fillStyle = roseGold(ctx, 0, eliteY, width, 36);
  setSerif(ctx, '700', 54);
  fitCentered(ctx, 'Tu rejoins l’élite de Boys and Girls. 🔥', eliteY, '700', 54, maxW);

  // Baseline finale + diamants
  const baseY = eliteY + 68;
  ctx.fillStyle = roseGold(ctx, 0, baseY, width, 30);
  setSerif(ctx, '700', 46);
  let base = 'CONTINUE TON ASCENSION VERS LES RÉCOMPENSES';
  const line2 = 'ULTIMES';
  const leftDiamond = '💎 ';
  const rightDiamond = ' 💎';

  // Ligne 1
  let s1 = leftDiamond + base + rightDiamond;
  while (ctx.measureText(s1).width > width - 160) {
    const cur = parseInt(ctx.font.match(/(\d+)px/)[1], 10);
    if (cur <= 34) break;
    setSerif(ctx, '700', cur - 2);
  }
  ctx.fillText(s1, width/2, baseY);

  // Ligne 2
  const line2Y = baseY + 48;
  setSerif(ctx, '700', 46);
  let s2 = line2;
  while (ctx.measureText(s2).width > width - 240) {
    const cur = parseInt(ctx.font.match(/(\d+)px/)[1], 10);
    if (cur <= 30) break;
    setSerif(ctx, '700', cur - 2);
  }
  ctx.fillText(s2, width/2, line2Y);

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

