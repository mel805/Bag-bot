function getParams() {
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);
  const get = (key, fallback) => {
    const value = params.get(key);
    if (value === null || value.trim() === '') return fallback;
    return decodeURIComponent(value);
  };
  return {
    title: get('title', 'CERTIFICATION DE PRESTIGE'),
    name: get('name', 'Infirmière Brunette'),
    subtitle: get('subtitle', 'obtient le statut officiel de'),
    level: get('level', '9'),
    distinction: get('distinction', 'Certifié Or'),
    status: get('status', 'CERTIFIÉ'),
    tagline: get('tagline', 'CONTINUE TON ASCENSION VERS LES RÉCOMPENSES ULTIMES')
  };
}

function applyContent() {
  const cfg = getParams();
  const byId = (id) => document.getElementById(id);

  byId('title').textContent = cfg.title.toUpperCase();
  byId('displayName').textContent = cfg.name;
  byId('subtitle').textContent = cfg.subtitle;
  byId('level').textContent = cfg.level;
  byId('distinction').textContent = cfg.distinction;
  byId('status').textContent = cfg.status.toUpperCase();
  byId('tagline').textContent = cfg.tagline.toUpperCase();
}

document.addEventListener('DOMContentLoaded', applyContent);

