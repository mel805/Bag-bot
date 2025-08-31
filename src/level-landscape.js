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

  // petites couronnes aux coins
  ctx.fillStyle = ctx.strokeStyle;
  setFont(ctx, '700 34px');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('♕', margin + 18, margin + 18);
  ctx.textAlign = 'right';
  ctx.fillText('♕', width - margin - 18, margin + 18);

  // Titre
  ctx.fillStyle = goldGradient(ctx, 0, 0, width, 160);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const baseTitle = isCertified ? 'ANNONCE DE PRESTIGE' : 'ANNONCE DE NIVEAU';
  const displayedTitle = isCertified ? `♕ ${baseTitle} ♕` : baseTitle;
  setFont(ctx, '800 96px');
  let titleSize = 96;
  while (ctx.measureText(displayedTitle).width > width - 280 && titleSize > 48) {
    titleSize -= 2;
    setFont(ctx, `800 ${titleSize}px`);
  }
  ctx.fillText(displayedTitle, width / 2, 70);

  // Bloc central textes
  const maxW = Math.min(1200, width - 240);
  let y = 210;

  // Nom du membre (légère réduction pour éviter les débordements)
  ctx.fillStyle = goldGradient(ctx, 0, y, width, 80);
  setFont(ctx, '700 78px');
  y += fitAndDrawCentered(ctx, String(memberName || 'Nom du membre'), y, 700, 78, maxW) + 16;

  // Sous-texte
  ctx.fillStyle = goldGradient(ctx, 0, y, width, 60);
  setFont(ctx, '600 48px');
  y += fitAndDrawCentered(ctx, 'vient de franchir un nouveau cap !', y, 600, 48, maxW) + 18;

  // Niveau
  ctx.fillStyle = goldGradient(ctx, 0, y, width, 60);
  setFont(ctx, '700 56px');
  y += fitAndDrawCentered(ctx, `Niveau atteint : ${Number(level || 0)}`, y, 700, 56, maxW) + 14;

  // Rôle obtenu
  ctx.fillStyle = goldGradient(ctx, 0, y, width, 60);
  setFont(ctx, '700 56px');
  y += fitAndDrawCentered(ctx, `Rôle obtenu : ${String(roleName || '—')}`, y, 700, 56, maxW) + 26;

  // Logo central (entre role obtenu et Félicitations)
  const logoSize = 240;
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

  // Félicitations
  const congratsY = logoY + logoSize + 22;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = goldGradient(ctx, 0, congratsY, width, 50);
  setFont(ctx, '800 78px');
  ctx.fillText('Félicitations !', width/2, congratsY);

  // Baseline / slogan
  const baseY = congratsY + 96;
  ctx.fillStyle = goldGradient(ctx, 0, baseY, width, 40);
  setFont(ctx, '700 42px');
  const baseline = isCertified
    ? 'continue ton ascension vers les récompenses ultimes'
    : 'CONTINUE TON ASCENSION VERS LES RÉCOMPENSES ULTIMES';
  const left = '💎 ';
  const right = ' 💎';
  let text = left + baseline + right;
  while (ctx.measureText(text).width > width - 160) {
    const current = parseInt(ctx.font.match(/(\d+)px/)[1], 10);
    if (current <= 32) break;
    setFont(ctx, `700 ${current - 2}px`);
  }
  ctx.fillText(text, width/2, baseY);

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

