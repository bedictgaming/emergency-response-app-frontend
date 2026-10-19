import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import WebSocket, { WebSocketServer } from 'ws';
import { signGatewayRequest } from './sign-request.mjs';
import { bridgeRequest, createWebSocketBridge, SOCKET_PATH } from './websocket-bridge.mjs';

const secret = 'synthetic-bridge-test-secret-not-a-credential';
const audience = 'emergency-response-staging-v1';
const path = SOCKET_PATH + '/?EIO=4&transport=websocket';
const origin = 'https://example.invalid';
function signed(url = path, changes = {}, now = Date.now()) {
  const request = new Request(origin + url, { headers: { origin, cookie: 'synthetic-session', 'sec-fetch-site': 'same-origin', ...changes } });
  return { method: 'GET', url, headers: Object.fromEntries(signGatewayRequest(request, { secret, audience, ip: '192.0.2.10', now })) };
}
const policy = { secret, audience, upstream: 'https://upstream.invalid' };

test('bridge preserves the exact HMAC path, credentials and approved upstream only', () => {
  const request = signed(); request.headers['x-forwarded-for'] = 'forged';
  request.headers.host = 'evil.invalid'; request.headers['sec-websocket-key'] = 'synthetic';
  const result = bridgeRequest(request, policy);
  assert.equal(result.url.href, 'wss://upstream.invalid' + path);
  assert.equal(result.headers.cookie, 'synthetic-session');
  assert.equal(result.headers['x-er-gateway-signature'], request.headers['x-er-gateway-signature']);
  for (const name of ['host', 'x-forwarded-for', 'sec-websocket-key']) assert.equal(result.headers[name], undefined);
});

test('bridge fails closed on changed proof, origin, path, cookie, method, time, audience and IP', () => {
  for (const change of [
    row => { row.headers.cookie = 'another-session'; },
    row => { row.headers.origin = 'https://other.invalid'; },
    row => { row.headers['x-er-gateway-origin'] = 'https://other.invalid'; },
    row => { row.headers['x-er-gateway-signature'] = '0'.repeat(64); },
    row => { row.headers['x-er-gateway-signature'] = ['0'.repeat(64)]; },
    row => { row.headers['x-er-gateway-ip'] = '192.0.2.1, 192.0.2.2'; },
    row => { row.method = 'POST'; },
    row => { row.url = '/api/auth/v1/me?EIO=4&transport=websocket'; },
    row => { row.headers.cookie = 'x'.repeat(17_000); },
  ]) { const row = signed(); change(row); assert.throws(() => bridgeRequest(row, policy)); }
  assert.throws(() => bridgeRequest(signed(path, {}, Date.now() - 61_000), policy));
  assert.throws(() => bridgeRequest(signed(path, {}, Date.now() + 6_000), policy));
  assert.throws(() => bridgeRequest(signed(), { ...policy, audience: 'other-audience' }));
  assert.throws(() => bridgeRequest(signed(), { ...policy, secret: 'short' }));
});

test('no polling, sid continuation, query credentials, destinations, duplicates or unknown fields', () => {
  for (const query of ['EIO=4&transport=polling', 'EIO=3&transport=websocket',
    'EIO=4&transport=websocket&sid=synthetic', 'EIO=4&transport=websocket&token=synthetic',
    'EIO=4&transport=websocket&target=https://evil.invalid',
    'EIO=4&EIO=4&transport=websocket', 'EIO=4&transport=websocket&transport=websocket']) {
    assert.throws(() => bridgeRequest(signed(SOCKET_PATH + '/?' + query), policy));
  }
  assert.equal(bridgeRequest(signed(SOCKET_PATH + '?EIO=4&transport=websocket'), policy).url.pathname, SOCKET_PATH);
});

async function fixture(t, { limits, denyStatus, stalled = false, echo = true } = {}) {
  const upstream = createServer(), peers = new WebSocketServer({ noServer: true });
  const received = [], accepted = [], nonces = new Set(), clients = [];
  upstream.on('upgrade', (request, socket, head) => {
    received.push(request);
    if (stalled) { socket.on('error', () => {}); return; }
    let status = denyStatus;
    try {
      bridgeRequest(request, policy);
      const nonce = request.headers['x-er-gateway-nonce'];
      if (request.headers.cookie !== 'synthetic-session') status = 401;
      else if (nonces.has(nonce)) status = 403;
      nonces.add(nonce);
    } catch { status = 403; }
    if (status) { socket.end(`HTTP/1.1 ${status} Denied\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); return; }
    peers.handleUpgrade(request, socket, head, peer => {
      accepted.push(peer);
      if (echo) peer.on('message', (data, binary) => peer.send(data, { binary }));
      peer.on('error', () => {});
    });
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const bridge = createWebSocketBridge({
    environment: () => ({ API_GATEWAY_SECRET: secret }),
    target: () => ({ audience, upstream: 'http://127.0.0.1:' + upstream.address().port }),
    limits: { handshake: 800, lifetime: 5_000, connections: 8, buffer: 16_384, ...limits },
  });
  await new Promise(resolve => bridge.listen(0, '127.0.0.1', resolve));
  const url = 'ws://127.0.0.1:' + bridge.address().port;
  t.after(() => {
    clients.forEach(client => client.terminate()); accepted.forEach(peer => peer.terminate());
    bridge.close(); upstream.close(); peers.close();
    // Only the synthetic stalled handshakes lack a WebSocket peer.
    received.forEach(request => request.socket.destroy());
  });
  const connect = (row = signed(), extra = {}) => {
    const client = new WebSocket(url + row.url, { headers: row.headers, ...extra });
    client.on('error', () => {}); clients.push(client); return client;
  };
  return { bridge, upstream, received, accepted, connect, url };
}

function rejected(client) {
  return new Promise((resolve, reject) => {
    client.once('open', () => reject(new Error('Unexpected browser upgrade')));
    client.once('unexpected-response', (_request, response) => {
      response.resume(); client.terminate(); resolve(response.statusCode);
    });
    client.once('error', () => {});
  });
}

test('real native upgrade relays Engine.IO text and binary frames without parsing/private logging', async t => {
  const fx = await fixture(t), client = fx.connect(); await once(client, 'open');
  assert.equal(fx.accepted.length, 1);
  const text = once(client, 'message'); client.send('40');
  const [message, binary] = await text; assert.equal(message.toString(), '40'); assert.equal(binary, false);
  const data = once(client, 'message'); client.send(Buffer.from([1, 2, 3]));
  const [bytes, isBinary] = await data; assert.deepEqual([...bytes], [1, 2, 3]); assert.equal(isBinary, true);
  const heartbeat = once(client, 'message'); fx.accepted[0].send('2');
  assert.equal((await heartbeat)[0].toString(), '2');
  const hint = once(client, 'message'); fx.accepted[0].send('42["emergency.event",{"type":"nearby.changed"}]');
  assert.match((await hint)[0].toString(), /nearby.changed/);
});

for (const status of [401, 403, 429, 503]) test(`upstream ${status} stays HTTP denial, never a browser 101`, async t => {
  const fx = await fixture(t, { denyStatus: status });
  assert.equal(await rejected(fx.connect()), status); assert.equal(fx.accepted.length, 0);
});

test('upstream redirect is not followed and becomes a sanitized service denial', async t => {
  const fx = await fixture(t, { denyStatus: 302 });
  assert.equal(await rejected(fx.connect()), 503); assert.equal(fx.received.length, 1);
});

test('browser closure promptly tears down upstream instead of retaining its subscription', async t => {
  const fx = await fixture(t), client = fx.connect(); await once(client, 'open');
  const closed = once(fx.accepted[0], 'close'); client.close(); await closed;
});

test('no backend connection for forged attestation, polling, foreign origin or subprotocol', async t => {
  const fx = await fixture(t);
  const forged = signed(); forged.headers.cookie = 'forged';
  assert.equal(await rejected(fx.connect(forged)), 403);
  assert.equal(await rejected(fx.connect(signed(SOCKET_PATH + '/?EIO=4&transport=polling'))), 403);
  assert.equal(await rejected(fx.connect(signed(path, { origin: 'https://evil.invalid' }))), 403);
  assert.equal(await rejected(fx.connect(signed(), { headers: { ...signed().headers, 'sec-websocket-protocol': 'unapproved' } })), 403);
  assert.equal(fx.received.length, 0);
});

test('backend receives original nonce and remains authoritative for session/replay denial', async t => {
  const fx = await fixture(t), row = signed();
  const client = fx.connect(row); await once(client, 'open');
  assert.equal(fx.received[0].headers['x-er-gateway-nonce'], row.headers['x-er-gateway-nonce']);
  assert.equal(await rejected(fx.connect(row)), 403);
  assert.equal(await rejected(fx.connect(signed(path, { cookie: 'not-a-session' }))), 401);
});

test('connection capacity and handshake timeout fail closed', async t => {
  const fx = await fixture(t, { stalled: true, limits: { connections: 1, handshake: 150 } });
  const first = rejected(fx.connect());
  // Observe the actual upstream request, not an arbitrary sleep.
  while (!fx.received.length) await new Promise(resolve => setImmediate(resolve));
  assert.equal(await rejected(fx.connect()), 503);
  assert.equal(await first, 503);
});

test('bounded lifetime closes both peers; upstream disconnect also closes the browser', async t => {
  const fx = await fixture(t, { limits: { lifetime: 100 } });
  const client = fx.connect(); await once(client, 'open');
  const upstreamClosed = once(fx.accepted[0], 'close'); await once(client, 'close'); await upstreamClosed;
  const next = fx.connect(); await once(next, 'open');
  const closed = once(next, 'close'); fx.accepted[1].terminate(); await closed;
});

test('frame size and downstream buffer bounds close rather than accumulate/replay', async t => {
  const fx = await fixture(t), client = fx.connect(); await once(client, 'open');
  const closed = once(client, 'close'); client.send('x'.repeat(1025)); await closed;
  const tight = await fixture(t, { limits: { buffer: 8 } }), second = tight.connect(); await once(second, 'open');
  const bounded = once(second, 'close'); tight.accepted[0].send('x'.repeat(9)); await bounded;
});

test('ordinary HTTP does not open upstream and all live configs bound native function duration', async t => {
  const fx = await fixture(t);
  const response = await fetch(fx.url.replace('ws:', 'http:') + path);
  assert.equal(response.status, 400); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(fx.received.length, 0);
  for (const name of ['vercel.json', 'vercel.public.json', 'vercel.production-validation.json']) {
    const config = JSON.parse(readFileSync(new URL('../' + name, import.meta.url)));
    assert.deepEqual(config.functions, { 'api/events/v1/socket.io.mjs': { maxDuration: 75 } });
  }
});

test('native function is an explicit ESM server export, never a CommonJS require of .mjs', async () => {
  const { default: server } = await import('../api/events/v1/socket.io.mjs');
  assert.equal(typeof server.listen, 'function'); assert.equal(server.listenerCount('upgrade'), 1);
  assert.equal(server.listening, false); server.close();
});
