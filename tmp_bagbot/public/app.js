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
      // Pre-fill economy currency
      $('#currencyName').value = (data.economy?.currency?.name || 'BAG$');
      // Pre-fill TD channels
      $('#tdSfwChannels').value = (data.truthdare?.sfw?.channels || []).join(',');
      $('#tdNsfwChannels').value = (data.truthdare?.nsfw?.channels || []).join(',');
      // Confess
      $('#confessAllowReplies').checked = !!data.confess?.allowReplies;
      // Logs
      $('#logJoinLeave').checked = !!data.logs?.categories?.joinleave;
      $('#logMessages').checked = !!data.logs?.categories?.messages;
      $('#logThreads').checked = !!data.logs?.categories?.threads;
      $('#logBackup').checked = !!data.logs?.categories?.backup;
      // Levels
      $('#xpPerMessage').value = String(data.levels?.xpPerMessage ?? '');
      $('#xpPerVoiceMinute').value = String(data.levels?.xpPerVoiceMinute ?? '');
      $('#levelBase').value = String(data.levels?.levelCurve?.base ?? '');
      $('#levelFactor').value = String(data.levels?.levelCurve?.factor ?? '');
      // AutoThread
      $('#atChannels').value = (data.autothread?.channels || []).join(',');
      $('#atPolicy').value = String(data.autothread?.policy || '');
      $('#atArchive').value = String(data.autothread?.archivePolicy || '');
      // Counting
      $('#countingChannels').value = (data.counting?.channels || []).join(',');
      // Disboard
      $('#disboardReminders').checked = !!data.disboard?.remindersEnabled;
      $('#disboardChannel').value = String(data.disboard?.remindChannelId || '');
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

    // TD save
    $('#saveTd').addEventListener('click', async () => {
      const sfw = $('#tdSfwChannels').value.split(',').map(s=>s.trim()).filter(Boolean);
      const nsfw = $('#tdNsfwChannels').value.split(',').map(s=>s.trim()).filter(Boolean);
      $('#saveTdState').textContent = '…';
      try {
        await fetch('/api/configs/truthdare' + (state.key ? ('?key=' + encodeURIComponent(state.key)) : ''), {
          method: 'POST', headers: { 'Content-Type':'application/json', ...(state.key ? { Authorization: 'Bearer ' + state.key } : {}) },
          body: JSON.stringify({ sfwChannels: sfw, nsfwChannels: nsfw })
        });
        $('#saveTdState').textContent = 'Enregistré ✓';
        setTimeout(()=> $('#saveTdState').textContent = '', 1200);
        loadConfigs();
      } catch(_) { $('#saveTdState').textContent = 'Erreur'; }
    });

    // Confess save
    $('#saveConfess').addEventListener('click', async () => {
      const allow = $('#confessAllowReplies').checked;
      $('#saveConfessState').textContent = '…';
      try {
        await fetch('/api/configs/confess' + (state.key ? ('?key=' + encodeURIComponent(state.key)) : ''), {
          method: 'POST', headers: { 'Content-Type':'application/json', ...(state.key ? { Authorization: 'Bearer ' + state.key } : {}) },
          body: JSON.stringify({ allowReplies: allow })
        });
        $('#saveConfessState').textContent = 'Enregistré ✓';
        setTimeout(()=> $('#saveConfessState').textContent = '', 1200);
        loadConfigs();
      } catch(_) { $('#saveConfessState').textContent = 'Erreur'; }
    });

    // Logs save
    $('#saveLogs').addEventListener('click', async () => {
      const categories = {
        joinleave: $('#logJoinLeave').checked,
        messages: $('#logMessages').checked,
        threads: $('#logThreads').checked,
        backup: $('#logBackup').checked,
      };
      $('#saveLogsState').textContent = '…';
      try {
        await fetch('/api/configs/logs' + (state.key ? ('?key=' + encodeURIComponent(state.key)) : ''), {
          method: 'POST', headers: { 'Content-Type':'application/json', ...(state.key ? { Authorization: 'Bearer ' + state.key } : {}) },
          body: JSON.stringify({ categories })
        });
        $('#saveLogsState').textContent = 'Enregistré ✓';
        setTimeout(()=> $('#saveLogsState').textContent = '', 1200);
      } catch(_) { $('#saveLogsState').textContent = 'Erreur'; }
    });

    // Levels save
    $('#saveLevels').addEventListener('click', async () => {
      const xpPerMessage = Number($('#xpPerMessage').value || '0');
      const xpPerVoiceMinute = Number($('#xpPerVoiceMinute').value || '0');
      const base = Number($('#levelBase').value || '0');
      const factor = Number($('#levelFactor').value || '0');
      $('#saveLevelsState').textContent = '…';
      try {
        await fetch('/api/configs/levels' + (state.key ? ('?key=' + encodeURIComponent(state.key)) : ''), {
          method: 'POST', headers: { 'Content-Type':'application/json', ...(state.key ? { Authorization: 'Bearer ' + state.key } : {}) },
          body: JSON.stringify({ xpPerMessage, xpPerVoiceMinute, levelCurve: { base, factor } })
        });
        $('#saveLevelsState').textContent = 'Enregistré ✓';
        setTimeout(()=> $('#saveLevelsState').textContent = '', 1200);
        loadConfigs();
      } catch(_) { $('#saveLevelsState').textContent = 'Erreur'; }
    });

    // AutoThread save
    $('#saveAT').addEventListener('click', async () => {
      const channels = $('#atChannels').value.split(',').map(s=>s.trim()).filter(Boolean);
      const policy = $('#atPolicy').value.trim();
      const archivePolicy = $('#atArchive').value.trim();
      $('#saveATState').textContent = '…';
      try {
        await fetch('/api/configs/autothread' + (state.key ? ('?key=' + encodeURIComponent(state.key)) : ''), {
          method: 'POST', headers: { 'Content-Type':'application/json', ...(state.key ? { Authorization: 'Bearer ' + state.key } : {}) },
          body: JSON.stringify({ channels, policy, archivePolicy })
        });
        $('#saveATState').textContent = 'Enregistré ✓';
        setTimeout(()=> $('#saveATState').textContent = '', 1200);
        loadConfigs();
      } catch(_) { $('#saveATState').textContent = 'Erreur'; }
    });

    // Counting save
    $('#saveCounting').addEventListener('click', async () => {
      const channels = $('#countingChannels').value.split(',').map(s=>s.trim()).filter(Boolean);
      $('#saveCountingState').textContent = '…';
      try {
        await fetch('/api/configs/counting' + (state.key ? ('?key=' + encodeURIComponent(state.key)) : ''), {
          method: 'POST', headers: { 'Content-Type':'application/json', ...(state.key ? { Authorization: 'Bearer ' + state.key } : {}) },
          body: JSON.stringify({ channels })
        });
        $('#saveCountingState').textContent = 'Enregistré ✓';
        setTimeout(()=> $('#saveCountingState').textContent = '', 1200);
        loadConfigs();
      } catch(_) { $('#saveCountingState').textContent = 'Erreur'; }
    });

    // Disboard save
    $('#saveDisboard').addEventListener('click', async () => {
      const remindersEnabled = $('#disboardReminders').checked;
      const remindChannelId = $('#disboardChannel').value.trim();
      $('#saveDisboardState').textContent = '…';
      try {
        await fetch('/api/configs/disboard' + (state.key ? ('?key=' + encodeURIComponent(state.key)) : ''), {
          method: 'POST', headers: { 'Content-Type':'application/json', ...(state.key ? { Authorization: 'Bearer ' + state.key } : {}) },
          body: JSON.stringify({ remindersEnabled, remindChannelId })
        });
        $('#saveDisboardState').textContent = 'Enregistré ✓';
        setTimeout(()=> $('#saveDisboardState').textContent = '', 1200);
        loadConfigs();
      } catch(_) { $('#saveDisboardState').textContent = 'Erreur'; }
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

