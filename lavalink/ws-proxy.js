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
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', () => {
    res.statusCode = 502;
    res.end('Bad Gateway');
  });
  req.pipe(proxyReq);
});

const wsServer = new WebSocket.Server({ noServer: true });

wsServer.on('connection', (client, req) => {
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
    client.on('message', (data) => { if (upstream.readyState === WebSocket.OPEN) upstream.send(data); });
    upstream.on('message', (data) => {
      try {
        const text = data.toString();
        const json = JSON.parse(text);
        if (json && json.op === 'ready') {
          // Drop v4 'ready' op that Erela.js does not understand
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

