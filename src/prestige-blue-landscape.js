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
    if (ctx.measureText(text).width <= maxW) break;
    size -= 2;
  } while (size >= 18);
  ctx.fillText(text, ctx.canvas.width / 2, y);
  return size;
}

async function renderPrestigeCardBlueLandscape({
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
  let titleSize = 106;
  setSerif(ctx, '800', titleSize);
  while (ctx.measureText('ANNONCE DE NIVEAU').width > width - 240 && titleSize > 60) {
    titleSize -= 2;
    setSerif(ctx, '800', titleSize);
  }
  ctx.shadowColor = '#00000080';
  ctx.shadowBlur = 10;
  ctx.fillText('ANNONCE DE NIVEAU', width/2, 72);
  ctx.shadowBlur = 0;

  // Center block
  const maxW = Math.min(1200, width - 260);
  let y = 210;

  ctx.fillStyle = blueGradient(ctx, 0, y, width, 70);
  y += fitCentered(ctx, String(memberName || 'Membre'), y, '700', 82, maxW) + 16;

  ctx.fillStyle = blueGradient(ctx, 0, y, width, 50);
  y += fitCentered(ctx, 'vient de franchir un nouveau cap !', y, '600', 54, maxW) + 16;

  ctx.fillStyle = blueGradient(ctx, 0, y, width, 50);
  y += fitCentered(ctx, `Niveau atteint : ${Number(level || 0)}`, y, '700', 62, maxW) + 12;

  ctx.fillStyle = blueGradient(ctx, 0, y, width, 50);
  y += fitCentered(ctx, `Dernière distinction : ${String(lastRole || '—')}`, y, '700', 62, maxW) + 28;

  // Center logo
  const logoSize = 220;
  const logoY = y;
  if (logoUrl) {
    try {
      const img = await loadImage(logoUrl);
      ctx.beginPath();
      ctx.arc(width/2, logoY + logoSize/2, logoSize/2 + 9, 0, Math.PI*2);
      ctx.strokeStyle = blueGradient(ctx, width/2 - logoSize/2, logoY, logoSize, logoSize);
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
  ctx.fillStyle = blueGradient(ctx, 0, congratsY, width, 40);
  setSerif(ctx, '800', 86);
  ctx.fillText('Félicitations !', width/2, congratsY);

  // Baseline
  const baseY = congratsY + 86;
  ctx.fillStyle = blueGradient(ctx, 0, baseY, width, 30);
  setSerif(ctx, '700', 46);
  const diamonds = '💎 ';
  let base = `${diamonds}CONTINUE TON ASCENSION VERS LES RÉCOMPENSES ULTIMES${diamonds}`;
  while (ctx.measureText(base).width > width - 160) {
    const cur = parseInt(ctx.font.match(/(\d+)px/)[1], 10);
    if (cur <= 32) break;
    setSerif(ctx, '700', cur - 2);
  }
  ctx.fillText(base, width/2, baseY);

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

