import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import WebSocket, { WebSocketServer } from 'ws';
import { gatewayTarget } from './runtime-policy.mjs';

export const SOCKET_PATH = '/api/events/v1/socket.io';
const FORWARDED = ['cookie', 'authorization', 'origin', 'referer', 'sec-fetch-site',
  'x-er-gateway-ip', 'x-er-gateway-time', 'x-er-gateway-nonce', 'x-er-gateway-origin', 'x-er-gateway-signature'];
const LIMITS = Object.freeze({ handshake: 8_000, lifetime: 60_000, connections: 256, buffer: 16_384 });

/** Absence-only rejection, never authorization or JWT validation. Engine.IO's
 * upgrade response destroys a denied socket, which an upstream edge reports as
 * 502. Missing credentials can be denied explicitly before opening that socket. */
export function hasAccessCredential(headers) {
  const [scheme, token] = (headers.authorization ?? '').split(' ');
  if (scheme?.toLowerCase() === 'bearer' && token?.trim()) return true;
  return (headers.cookie ?? '').split(';').some(part => {
    const equals = part.indexOf('=');
    if (equals < 0 || part.slice(0, equals).trim() !== 'accessToken') return false;
    const value = part.slice(equals + 1).trim();
    return Boolean(value && value !== '""');
  });
}

/** Verify transport attestation, NOT login. Backend still consumes the nonce,
 * authenticates the cookie, and rechecks the current session/account/RBAC. */
export function bridgeRequest(request, { secret, audience, upstream }, now = Date.now()) {
  const headers = request.headers;
  if (request.method !== 'GET' || Object.entries(headers).some(([name, value]) =>
    FORWARDED.includes(name) && typeof value !== 'string')) throw new Error('Denied');
  if (FORWARDED.reduce((size, name) => size + (headers[name]?.length ?? 0), 0) > 16_384) throw new Error('Denied');
  const origin = headers['x-er-gateway-origin'];
  const url = new URL(request.url, origin);
  if (!origin || url.origin !== origin || url.protocol !== 'https:' || url.username || url.password || url.hash
    || ![SOCKET_PATH, SOCKET_PATH + '/'].includes(url.pathname) || url.href.length > 2048
    || headers.origin !== origin) throw new Error('Denied');
  const pairs = [...url.searchParams];
  if (pairs.length !== 2 || url.searchParams.getAll('EIO').length !== 1
    || url.searchParams.getAll('transport').length !== 1
    || url.searchParams.get('EIO') !== '4' || url.searchParams.get('transport') !== 'websocket') throw new Error('Denied');
  const ip = headers['x-er-gateway-ip'], time = headers['x-er-gateway-time'];
  const nonce = headers['x-er-gateway-nonce'], signature = headers['x-er-gateway-signature'];
  if (typeof secret !== 'string' || secret.length < 32 || !/^[a-z0-9-]{1,80}$/.test(audience)
    || !isIP(ip ?? '') || !/^\d{13}$/.test(time ?? '') || !/^[a-f0-9]{32}$/.test(nonce ?? '')
    || !/^[a-f0-9]{64}$/.test(signature ?? '') || now - Number(time) > 60_000 || Number(time) - now > 5_000) throw new Error('Denied');
  const payload = JSON.stringify(['er-api-gateway-v2', audience, time, nonce, 'GET',
    url.pathname + url.search, ip, headers.cookie || '', headers.authorization || '',
    headers.origin || '', headers.referer || '', headers['sec-fetch-site'] || '', origin]);
  const expected = createHmac('sha256', secret).update(payload).digest();
  if (!timingSafeEqual(Buffer.from(signature, 'hex'), expected)) throw new Error('Denied');
  const target = new URL(upstream);
  target.protocol = target.protocol === 'https:' ? 'wss:' : 'ws:';
  target.pathname = url.pathname; target.search = url.search;
  // ws generates fresh hop-by-hop upgrade headers; never forward caller Host,
  // WebSocket keys/extensions/subprotocols, X-Forwarded-* or arbitrary headers.
  return { url: target, headers: Object.fromEntries(FORWARDED.filter(name => headers[name] !== undefined).map(name => [name, headers[name]])) };
}

function deny(socket, status) {
  if (!socket.destroyed) {
    socket.setTimeout(1000, () => socket.destroy());
    socket.end(`HTTP/1.1 ${status} Request denied\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Length: 0\r\n\r\n`);
  }
}

/** Options are server construction/test dependencies, never request inputs. */
export function createWebSocketBridge({ environment = () => process.env,
  target = gatewayTarget, limits = LIMITS } = {}) {
  const server = createServer((_request, response) => {
    response.writeHead(400, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
    response.end('{"code":400,"status":"error","message":"WebSocket upgrade required"}');
  });
  const peers = new WebSocketServer({ noServer: true, clientTracking: false,
    perMessageDeflate: false, maxPayload: 1024 });
  const active = new Set();
  server.on('close', () => { for (const finish of [...active]) finish(); peers.close(); });
  server.on('upgrade', (request, socket, head) => {
    socket.on('error', () => {}); // Never emit raw provider/auth errors.
    let attested;
    try {
      const env = environment(), policy = target(env);
      attested = bridgeRequest(request, { ...policy, secret: env.API_GATEWAY_SECRET });
      if (head.length > 1024 || request.headers.upgrade?.toLowerCase() !== 'websocket'
        || request.headers['sec-websocket-version'] !== '13'
        || !/^[+/0-9A-Za-z]{22}==$/.test(request.headers['sec-websocket-key'] ?? '')
        || request.headers['sec-websocket-protocol']) throw new Error('Denied');
    } catch { deny(socket, 403); return; }
    // A signed request still needs a credential. Presence never grants a 101:
    // the unchanged backend verifies any supplied token/session/account.
    if (!hasAccessCredential(attested.headers)) { deny(socket, 401); return; }
    if (active.size >= limits.connections) { deny(socket, 503); return; }
    let upstream, downstream, ended = false, timer;
    const finish = (status = 503) => {
      if (ended) return;
      ended = true; clearTimeout(timer); active.delete(finish);
      if (upstream) upstream.terminate();
      if (downstream) downstream.terminate(); else deny(socket, status);
    };
    active.add(finish);
    socket.once('close', () => finish());
    timer = setTimeout(finish, limits.handshake); timer.unref();
    try {
      upstream = new WebSocket(attested.url, { headers: attested.headers, followRedirects: false,
        handshakeTimeout: limits.handshake, perMessageDeflate: false, maxPayload: 16_384 });
      upstream.on('error', () => finish());
      upstream.on('close', () => finish());
      upstream.on('unexpected-response', (_request, response) => {
        const status = [400, 401, 403, 429, 503].includes(response.statusCode) ? response.statusCode : 503;
        response.destroy(); finish(status); // No upstream body/header/error reaches the browser/log.
      });
      upstream.once('open', () => {
        if (ended) return;
        // Backend gateway/origin/cookie guards have accepted before browser 101.
        try {
          peers.handleUpgrade(request, socket, head, peer => {
            downstream = peer;
            peer.on('error', () => finish()); peer.on('close', () => finish());
            const forward = (destination, bytes, binary) => {
              if (ended || destination.readyState !== WebSocket.OPEN || destination.bufferedAmount + bytes.length > limits.buffer) { finish(); return; }
              destination.send(bytes, { binary }, error => { if (error) finish(); });
            };
            peer.on('message', (bytes, binary) => forward(upstream, bytes, binary));
            upstream.on('message', (bytes, binary) => forward(peer, bytes, binary));
            clearTimeout(timer); timer = setTimeout(finish, limits.lifetime); timer.unref();
          });
        } catch { finish(); }
      });
    } catch { finish(); }
  });
  return server;
}
