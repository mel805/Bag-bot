(function(){
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const state = {
    key: localStorage.getItem('dashKey') || '',
    ws: null,
    wsTimer: null,
  };

  function formatBytes(n){
    if (!Number.isFinite(n)) return '—';
    const units = ['B','KB','MB','GB','TB'];
    let i = 0; let v = n;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return v.toFixed(v >= 10 ? 0 : 1) + ' ' + units[i];
  }
  function formatUptime(sec){
    if (!Number.isFinite(sec)) return '—';
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const parts = [];
    if (d) parts.push(d + 'j');
    if (h) parts.push(h + 'h');
    if (m) parts.push(m + 'm');
    parts.push(s + 's');
    return parts.join(' ');
  }

  function setActiveView(view){
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
    // toggle submenu visibility
    $$('.submenu').forEach(s => s.style.display = (s.dataset.for === view ? 'block' : 'none'));
    // default first slide
    const slides = $$('#view-' + view + ' .slide');
    slides.forEach((s,i) => s.style.display = i === 0 ? 'block' : 'none');
  }

  async function fetchJson(path){
    const url = new URL(path, window.location.origin);
    if (state.key) url.searchParams.set('key', state.key);
    const res = await fetch(url.toString(), { headers: state.key ? { Authorization: 'Bearer ' + state.key } : {} });
    if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
    return res.json();
  }

  async function loadConfigs(){
    try {
      $('#apiState').textContent = 'API: chargement…';
      const data = await fetchJson('/api/configs');
      $('#configs').textContent = JSON.stringify(data, null, 2);
      $('#apiState').textContent = 'API: OK';
    } catch (e) {
      $('#apiState').textContent = 'API: erreur';
    }
  }

  function applyStats(d){
    if (!d) return;
    $('#guildName').textContent = d.guildName || d.guildId || '—';
    $('#memberCount').textContent = '👥 ' + (Number.isFinite(d.memberCount) ? d.memberCount : '—') + ' membres';
    $('#channelCount').textContent = '💬 ' + (Number.isFinite(d.channels) ? d.channels : '—') + ' salons';
    $('#uptime').textContent = '⏱ ' + formatUptime(d.uptimeSec || 0);
    $('#memRss').textContent = formatBytes(d.memory?.rss);
    $('#memHeap').textContent = formatBytes(d.memory?.heapUsed) + ' / ' + formatBytes(d.memory?.heapTotal);
    $('#botTag').textContent = d.botUser?.tag || '—';
    $('#botId').textContent = d.botUser?.id || '—';
  }

  async function pollStats(){
    try {
      const data = await fetchJson('/api/stats');
      applyStats(data);
      $('#wsState').textContent = 'WS: inactif (poll)';
    } catch (_) {
      $('#wsState').textContent = 'WS: inactif (erreur)';
    }
  }

  function connectWs(){
    try { if (state.ws) { try { state.ws.close(); } catch (_) {} state.ws = null; } } catch (_) {}
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = new URL(proto + '://' + location.host + '/');
    if (state.key) url.searchParams.set('key', state.key);
    let ws;
    try { ws = new WebSocket(url.toString()); } catch (_) { ws = null; }
    if (!ws) { $('#wsState').textContent = 'WS: indisponible'; return; }
    state.ws = ws;
    ws.onopen = () => { $('#wsState').textContent = 'WS: connecté'; };
    ws.onclose = () => { $('#wsState').textContent = 'WS: fermé'; };
    ws.onerror = () => { $('#wsState').textContent = 'WS: erreur'; };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg && msg.t === 'stats') applyStats(msg.d);
      } catch (_) {}
    };
  }

  function initUI(){
    // Views
    $$('.nav-item').forEach(b => b.addEventListener('click', () => setActiveView(b.dataset.view)));
    $$('.submenu .sub-item').forEach(b => b.addEventListener('click', () => {
      const sub = b.dataset.subview;
      const container = b.closest('.view');
      if (!container) return;
      container.querySelectorAll('.slide').forEach(s => s.style.display = (s.id === sub ? 'block' : 'none'));
    }));

    // Auth key
    if (state.key) $('#dashKey').value = state.key;
    $('#applyKey').addEventListener('click', () => {
      state.key = $('#dashKey').value.trim();
      localStorage.setItem('dashKey', state.key);
      connectWs();
      loadConfigs();
    });

    // Save currency
    $('#saveCurrency').addEventListener('click', async () => {
      const name = $('#currencyName').value.trim();
      $('#saveCurrencyState').textContent = '…';
      try {
        await fetch('/api/configs/economy' + (state.key ? ('?key=' + encodeURIComponent(state.key)) : ''), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(state.key ? { Authorization: 'Bearer ' + state.key } : {}) },
          body: JSON.stringify({ currency: { name } })
        });
        $('#saveCurrencyState').textContent = 'Enregistré ✓';
        setTimeout(()=> $('#saveCurrencyState').textContent = '', 1200);
        loadConfigs();
      } catch (_) {
        $('#saveCurrencyState').textContent = 'Erreur';
      }
    });
  }

  async function boot(){
    initUI();
    connectWs();
    await loadConfigs();
    // Poll as fallback
    clearInterval(state.wsTimer);
    state.wsTimer = setInterval(pollStats, 7000);
  }

  boot();
})();

