// Minimal HTTP+WS proxy to bridge Erela.js (v3 paths) to Lavalink v4
// Listens on 127.0.0.1:2334 and forwards:
//   - WS  -> ws://127.0.0.1:2333/v4/websocket
//   - HTTP: /loadtracks -> /v4/loadtracks (and similar)
const http = require('http');
const WebSocket = require('ws');
const { URL } = require('url');

const LISTEN_HOST = process.env.LAVALINK_PROXY_HOST || '127.0.0.1';
const LISTEN_PORT = Number(process.env.LAVALINK_PROXY_PORT || 2334);
const TARGET_HOST = process.env.LAVALINK_HOST || '127.0.0.1';
const TARGET_PORT = Number(process.env.LAVALINK_PORT || 2333);
const TARGET_SECURE = String(process.env.LAVALINK_SECURE || 'false') === 'true';

function mapLoadTypeV4ToV3(v4Type) {
  switch (v4Type) {
    case 'track': return 'TRACK_LOADED';
    case 'playlist': return 'PLAYLIST_LOADED';
    case 'search': return 'SEARCH_RESULT';
    case 'empty': return 'NO_MATCHES';
    case 'error': return 'LOAD_FAILED';
    default: return v4Type || 'NO_MATCHES';
  }
}

function convertV4LoadTracksToV3(v4) {
  // v4 shapes: { loadType: 'track', data: { encoded, info } }
  //             { loadType: 'search', data: [ { encoded, info }, ... ] }
  //             { loadType: 'playlist', data: { info:{name,selectedTrack}, pluginInfo:{}, tracks:[{encoded,info},...] } }
  const loadType = mapLoadTypeV4ToV3(v4.loadType);
  const base = { loadType, tracks: [], playlistInfo: { name: '', selectedTrack: -1 } };
  if (!v4 || typeof v4 !== 'object') return base;
  const data = v4.data;
  const ensureUri = (info = {}, pluginInfo = {}) => {
    if (info.uri && typeof info.uri === 'string') return info;
    const copy = { ...info };
    try {
      // Try to infer from identifier or pluginInfo
      if (typeof copy.identifier === 'string') {
        if (/^O:https?:\/\//.test(copy.identifier)) {
          copy.uri = copy.identifier.replace(/^O:/, '');
        } else if (/^[A-Za-z0-9_-]{8,}$/.test(copy.identifier)) {
          copy.uri = `https://www.youtube.com/watch?v=${copy.identifier}`;
        }
      }
      if (!copy.uri && pluginInfo && typeof pluginInfo.url === 'string') {
        copy.uri = pluginInfo.url;
      }
    } catch (_) {}
    return copy;
  };
  if (loadType === 'TRACK_LOADED' && data && data.encoded) {
    base.tracks = [{ track: data.encoded, info: ensureUri(data.info, data.pluginInfo), pluginInfo: data.pluginInfo || {} }];
  } else if (loadType === 'SEARCH_RESULT' && Array.isArray(data)) {
    base.tracks = data.map(t => ({ track: t.encoded, info: ensureUri(t.info, t.pluginInfo), pluginInfo: t.pluginInfo || {} }));
  } else if (loadType === 'PLAYLIST_LOADED' && data && Array.isArray(data.tracks)) {
    base.playlistInfo = { name: (data.info && data.info.name) || '', selectedTrack: typeof data.info?.selectedTrack === 'number' ? data.info.selectedTrack : -1 };
    base.tracks = data.tracks.map(t => ({ track: t.encoded, info: ensureUri(t.info, t.pluginInfo), pluginInfo: t.pluginInfo || {} }));
  }
  if (loadType === 'NO_MATCHES' || loadType === 'LOAD_FAILED') {
    base.tracks = [];
  }
  return base;
}

function convertV4DecodeToV3(v4) {
  // v4 may return [{ encoded, info }, ...] or { encoded, info }
  if (Array.isArray(v4)) {
    return v4.map(t => ({ track: t.encoded, info: t.info || {} }));
  }
  if (v4 && typeof v4 === 'object' && v4.encoded) {
    return [{ track: v4.encoded, info: v4.info || {} }];
  }
  // unknown, return as-is
  return v4;
}

const httpServer = http.createServer((req, res) => {
  const originUrl = new URL(req.url, `http://${req.headers.host}`);
  let targetPathname = originUrl.pathname;
  if (!targetPathname.startsWith('/v4/')) {
    // Map common v3 endpoints to v4
    if (targetPathname === '/' || targetPathname === '') {
      // health/info - forward as root
      targetPathname = '/';
    } else if (targetPathname.startsWith('/loadtracks') || targetPathname.startsWith('/decodetrack') || targetPathname.startsWith('/decodetracks') || targetPathname.startsWith('/sessions') || targetPathname.startsWith('/version')) {
      targetPathname = '/v4' + targetPathname;
    } else {
      targetPathname = '/v4' + targetPathname;
    }
  }
  const options = {
    host: TARGET_HOST,
    port: TARGET_PORT,
    method: req.method,
    path: targetPathname + originUrl.search,
    headers: {
      ...req.headers,
      host: `${TARGET_HOST}:${TARGET_PORT}`
    }
  };
  const proxyReq = http.request(options, (proxyRes) => {
    const needsTransform = targetPathname.startsWith('/v4/loadtracks') || targetPathname.startsWith('/v4/decodetracks') || targetPathname.startsWith('/v4/decodetrack');
    if (!needsTransform) {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      return proxyRes.pipe(res);
    }
    const chunks = [];
    proxyRes.on('data', (c) => chunks.push(c));
    proxyRes.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const json = JSON.parse(raw);
        let converted = json;
        if (targetPathname.startsWith('/v4/loadtracks')) converted = convertV4LoadTracksToV3(json);
        else converted = convertV4DecodeToV3(json);
        res.statusCode = proxyRes.statusCode || 200;
        res.setHeader('content-type', 'application/json');
        return res.end(JSON.stringify(converted));
      } catch (e) {
        try {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
        } catch (_) {}
        return res.end(Buffer.concat(chunks));
      }
    });
  });
  proxyReq.on('error', () => {
    res.statusCode = 502;
    res.end('Bad Gateway');
  });
  req.pipe(proxyReq);
});

const wsServer = new WebSocket.Server({ noServer: true });

wsServer.on('connection', (client, req) => {
  let lavaSessionId = null;
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const httpBase = `http://${TARGET_HOST}:${TARGET_PORT}`;
  const pendingVoiceByGuild = new Map();
  const patchPlayer = (guildId, body) => new Promise((resolve) => {
    if (!lavaSessionId) return resolve(false);
    try {
      const data = Buffer.from(JSON.stringify(body));
      const options = {
        host: TARGET_HOST,
        port: TARGET_PORT,
        method: 'PATCH',
        path: `/v4/sessions/${lavaSessionId}/players/${guildId}`,
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      };
      const r = http.request(options, (pr) => { pr.on('data', ()=>{}); pr.on('end', ()=>resolve(true)); });
      r.on('error', ()=>resolve(false));
      r.write(data);
      r.end();
    } catch (_) { resolve(false); }
  });
  const deletePlayer = (guildId) => new Promise((resolve) => {
    if (!lavaSessionId) return resolve(false);
    try {
      const options = {
        host: TARGET_HOST,
        port: TARGET_PORT,
        method: 'DELETE',
        path: `/v4/sessions/${lavaSessionId}/players/${guildId}`,
        headers: { Authorization: authHeader }
      };
      const r = http.request(options, (pr) => { pr.on('data', ()=>{}); pr.on('end', ()=>resolve(true)); });
      r.on('error', ()=>resolve(false));
      r.end();
    } catch (_) { resolve(false); }
  });
  const headers = {
    Authorization: req.headers['authorization'] || req.headers['Authorization'],
    'Num-Shards': req.headers['num-shards'] || req.headers['Num-Shards'] || '1',
    'User-Id': req.headers['user-id'] || req.headers['User-Id'] || '0',
    'Client-Name': req.headers['client-name'] || req.headers['Client-Name'] || 'Erela.js-Proxy'
  };
  const targetUrl = `${TARGET_SECURE ? 'wss' : 'ws'}://${TARGET_HOST}:${TARGET_PORT}/v4/websocket`;
  const upstream = new WebSocket(targetUrl, { headers });
  const closeBoth = (code, reason) => {
    try { if (upstream.readyState === WebSocket.OPEN) upstream.close(code, reason); } catch (_) {}
    try { if (client.readyState === WebSocket.OPEN) client.close(code, reason); } catch (_) {}
  };
  upstream.on('open', () => {
    client.on('message', async (data) => {
      try {
        const text = data.toString();
        const json = JSON.parse(text);
        if (json && typeof json === 'object' && json.op) {
          // Translate v3 WS ops to v4 REST where needed
          if (json.op === 'voiceUpdate' && json.guildId && json.event && json.sessionId) {
            const voice = { token: json.event.token, endpoint: json.event.endpoint, sessionId: json.sessionId };
            if (!lavaSessionId) {
              pendingVoiceByGuild.set(json.guildId, voice);
            } else {
              await patchPlayer(json.guildId, { voice });
            }
            return; // do not forward
          }
          if (json.op === 'play' && json.guildId && json.track) {
            const body = { encodedTrack: (typeof json.track === 'string' ? json.track : json.track.track) };
            if (typeof json.startTime === 'number') body.position = json.startTime;
            if (typeof json.endTime === 'number') body.endTime = json.endTime;
            if (typeof json.volume === 'number') body.volume = json.volume;
            const pv = pendingVoiceByGuild.get(json.guildId);
            if (pv && lavaSessionId) {
              await patchPlayer(json.guildId, { voice: pv });
              pendingVoiceByGuild.delete(json.guildId);
            }
            await patchPlayer(json.guildId, body);
            return;
          }
          if (json.op === 'pause' && json.guildId && typeof json.pause === 'boolean') {
            await patchPlayer(json.guildId, { paused: json.pause });
            return;
          }
          if (json.op === 'stop' && json.guildId) {
            await patchPlayer(json.guildId, { encodedTrack: null });
            return;
          }
          if (json.op === 'seek' && json.guildId && typeof json.position === 'number') {
            await patchPlayer(json.guildId, { position: json.position });
            return;
          }
          if (json.op === 'volume' && json.guildId && typeof json.volume === 'number') {
            await patchPlayer(json.guildId, { volume: json.volume });
            return;
          }
          if (json.op === 'destroy' && json.guildId) {
            await deletePlayer(json.guildId);
            return;
          }
        }
      } catch (_) {}
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data);
    });
    upstream.on('message', (data) => {
      try {
        const text = data.toString();
        const json = JSON.parse(text);
        if (json && json.op === 'ready') {
          // Capture v4 session id, drop for client compatibility
          if (json.sessionId) lavaSessionId = json.sessionId;
          return;
        }
      } catch (_) {}
      if (client.readyState === WebSocket.OPEN) client.send(data);
    });
  });
  upstream.on('close', (code, reason) => closeBoth(code, reason));
  client.on('close', (code, reason) => closeBoth(code, reason));
  upstream.on('error', () => closeBoth(1011, 'upstream error'));
  client.on('error', () => closeBoth(1011, 'client error'));
});

httpServer.on('upgrade', (request, socket, head) => {
  wsServer.handleUpgrade(request, socket, head, (ws) => {
    wsServer.emit('connection', ws, request);
  });
});

httpServer.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`[LL-Proxy] Listening on http+ws://${LISTEN_HOST}:${LISTEN_PORT} -> http+ws${TARGET_SECURE ? 's' : ''}://${TARGET_HOST}:${TARGET_PORT}`);
});

httpServer.on('error', (err) => {
  console.error('[LL-Proxy] Server error', err && err.message ? err.message : err);
});

