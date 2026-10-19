import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { socketEmergencyTransport, createEmergencyTransport, emergencyTransportSelection } from '../src/lib/emergencyTransport.ts';

test('canary is an explicit WebSocket opt-in, never an origin or SSE downgrade override', () => {
  assert.deepEqual(emergencyTransportSelection(undefined, false, undefined, '?__realtime=socket.io'), { transport: 'sse', diagnostics: false });
  assert.deepEqual(emergencyTransportSelection('sse', false, 'false', '?__realtime=socket.io'), { transport: 'sse', diagnostics: false });
  assert.deepEqual(emergencyTransportSelection('sse', false, 'true', '?__realtime=socket.io'), { transport: 'socket.io', diagnostics: true });
  assert.deepEqual(emergencyTransportSelection('sse', false, 'true'), { transport: 'sse', diagnostics: false });
  for (const search of ['?__realtime=sse', '?__realtime=socket.io&__realtime=sse', '?__realtime=wss://foreign.invalid', '?__realtime=invalid']) {
    assert.deepEqual(emergencyTransportSelection('sse', false, 'true', search), { transport: 'sse', diagnostics: false });
    assert.deepEqual(emergencyTransportSelection('socket.io', false, 'false', search), { transport: 'socket.io', diagnostics: false });
  }
  assert.deepEqual(emergencyTransportSelection('socket.io', false, 'false', '?__realtime=socket.io'), { transport: 'socket.io', diagnostics: true });
  assert.deepEqual(emergencyTransportSelection(undefined, true, undefined), { transport: 'socket.io', diagnostics: false });
});

test('invalid transport or canary configuration fails closed', () => {
  assert.throws(() => emergencyTransportSelection('invalid', false, 'true', '?__realtime=socket.io'), /Unsupported emergency transport/);
  assert.throws(() => emergencyTransportSelection('sse', false, 'invalid'), /Unsupported emergency canary/);
});

function fixture() {
  const socket = new EventEmitter(); let starts = 0, closes = 0;
  socket.connect = () => { starts++; };
  socket.disconnect = () => { closes++; socket.emit('disconnect'); };
  return { socket, transport: socketEmergencyTransport(socket), counts: () => ({ starts, closes }) };
}
test('does not start a socket before listeners and lifecycle guards are ready', () => {
  const { transport, counts } = fixture();
  assert.equal(counts().starts, 0); transport.start(); assert.equal(counts().starts, 1);
});
test('connected and failed sockets expose honest shared connection states', () => {
  const { socket, transport } = fixture(); let opens = 0, failures = 0;
  transport.onopen = () => opens++; transport.onerror = () => failures++;
  socket.emit('connect'); socket.emit('connect_error'); socket.emit('disconnect');
  assert.equal(opens, 1); assert.equal(failures, 2);
});
test('only matching event types invalidate data; payloads never become report state', () => {
  const { socket, transport } = fixture(); let refreshes = 0;
  transport.addEventListener('incident.updated', () => refreshes++);
  for (const event of [null, 'incident.updated', {}, { type: 'incident.created' }]) socket.emit('emergency.event', event);
  assert.equal(refreshes, 0);
  socket.emit('emergency.event', { type: 'incident.updated', entityId: 'synthetic' });
  assert.equal(refreshes, 1);
});
test('close removes callbacks before disconnect so teardown cannot trigger a reconnect', () => {
  const { socket, transport, counts } = fixture(); let callbacks = 0;
  transport.onerror = () => callbacks++;
  transport.addEventListener('incident.updated', () => callbacks++);
  transport.close(); socket.emit('emergency.event', { type: 'incident.updated' });
  assert.equal(callbacks, 0); assert.equal(counts().closes, 1);
});
test('explicit SSE remains credentialed, without tokens or private data in the URL', async () => {
  const previous = process.env.NEXT_PUBLIC_EMERGENCY_TRANSPORT, priorSource = globalThis.EventSource;
  const sources = [];
  class FakeSource {
    constructor(url, options) { this.url = url; this.options = options; sources.push(this); }
    addEventListener() {}
    close() { this.closed = true; }
  }
  try {
    process.env.NEXT_PUBLIC_EMERGENCY_TRANSPORT = 'sse'; globalThis.EventSource = FakeSource;
    const transport = await createEmergencyTransport('https://app.example');
    const source = sources[0];
    assert.equal(source.url, 'https://app.example/api/events/v1/stream');
    assert.deepEqual(source.options, { withCredentials: true });
    transport.close(); assert.equal(source.closed, true);
  } finally {
    globalThis.EventSource = priorSource;
    if (previous === undefined) delete process.env.NEXT_PUBLIC_EMERGENCY_TRANSPORT;
    else process.env.NEXT_PUBLIC_EMERGENCY_TRANSPORT = previous;
  }
});
test('invalid transport configuration fails rather than silently claiming WebSocket', async () => {
  const previous = process.env.NEXT_PUBLIC_EMERGENCY_TRANSPORT;
  try {
    process.env.NEXT_PUBLIC_EMERGENCY_TRANSPORT = 'invalid';
    await assert.rejects(createEmergencyTransport('https://app.example'), /Unsupported/);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_EMERGENCY_TRANSPORT;
    else process.env.NEXT_PUBLIC_EMERGENCY_TRANSPORT = previous;
  }
});
