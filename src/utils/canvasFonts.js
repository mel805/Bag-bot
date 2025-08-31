// utils/canvasFonts.js
// Enregistrement centralisé des polices pour @napi-rs/canvas

const { GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs');

let alreadyRegistered = false;

function tryRegisterFont(path, familyName) {
  try {
    if (!path) return false;
    if (!fs.existsSync(path)) return false;
    GlobalFonts.registerFromPath(path, familyName);
    return true;
  } catch (_) {
    return false;
  }
}

function registerPrestigeFonts() {
  // Cherche différentes variantes de fichiers si disponibles
  const candidates = {
    Cinzel: [
      '/workspace/assets/fonts/Cinzel-VariableFont_wght.ttf',
      '/workspace/assets/fonts/Cinzel.ttf',
    ],
    CormorantGaramond: [
      '/workspace/assets/fonts/CormorantGaramond-SemiBold.ttf',
      '/workspace/assets/fonts/CormorantGaramond.ttf',
    ],
  };

  let ok = true;
  for (const [family, paths] of Object.entries(candidates)) {
    let registeredFamily = false;
    for (const p of paths) {
      if (tryRegisterFont(p, family)) { registeredFamily = true; break; }
    }
    ok = ok && registeredFamily;
  }
  return ok;
}

function ensurePrestigeFontsRegistered() {
  if (alreadyRegistered) return true;
  alreadyRegistered = registerPrestigeFonts();
  return alreadyRegistered;
}

module.exports = {
  ensurePrestigeFontsRegistered,
  registerPrestigeFonts,
};

