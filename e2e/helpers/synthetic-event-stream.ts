import { expect, type Page, type WebSocketRoute } from '@playwright/test';

/** Both supported export transports, with explicit protocol binding. No network WS. */
export async function installSyntheticEventStream(page: Page, namespace: string) {
  const socketExpected = process.env.NEXT_PUBLIC_EMERGENCY_TRANSPORT === 'socket.io';
  const closed = new Set<WebSocketRoute>();
  const state = { joined: false, connections: 0, socketConnections: 0, sseConnections: 0, peers: [] as WebSocketRoute[] };
  await page.exposeFunction('__syntheticEmergencyStreamOpened', () => {
    state.sseConnections++;
    if (!socketExpected) { state.joined = true; state.connections++; }
  });
  await page.addInitScript(() => {
    const streams: Stream[] = [];
    class Stream extends EventTarget {
      onopen: (() => void) | null = null; onerror: (() => void) | null = null; closed = false;
      constructor() {
        super(); streams.push(this);
        setTimeout(() => {
          if (this.closed) return;
          this.onopen?.();
          void (window as unknown as { __syntheticEmergencyStreamOpened: () => Promise<void> }).__syntheticEmergencyStreamOpened().catch(() => {});
        }, 0);
      }
      close() { this.closed = true; }
    }
    Object.defineProperty(window, 'EventSource', { configurable: true, value: Stream });
    Object.assign(window, { __syntheticEmergencyStreams: streams });
  });
  await page.routeWebSocket('**/api/events/v1/socket.io/**', peer => {
    state.peers.push(peer); peer.onClose(() => closed.add(peer));
    peer.onMessage(message => {
      if (message === '40') {
        peer.send(`40${JSON.stringify({ sid: namespace })}`); state.socketConnections++;
        if (socketExpected) { state.joined = true; state.connections++; }
      }
    });
    peer.send(`0${JSON.stringify({ sid: `${namespace}-engine`, upgrades: [], pingInterval: 25000, pingTimeout: 20000, maxPayload: 1024 })}`);
  });
  return { state, async emit(type = 'incident.updated', extra: Record<string, string> = {}) {
    await expect.poll(() => state.joined).toBe(true);
    if (socketExpected) {
      expect(state.sseConnections).toBe(0);
      expect(state.socketConnections).toBeGreaterThan(0);
      for (const peer of state.peers) if (!closed.has(peer)) peer.send(`42${JSON.stringify(['emergency.event', { type, ...extra }])}`);
    } else {
      expect(state.socketConnections).toBe(0);
      expect(state.sseConnections).toBeGreaterThan(0);
      await page.evaluate(name => {
        const streams = (window as unknown as { __syntheticEmergencyStreams: (EventTarget & { closed: boolean })[] }).__syntheticEmergencyStreams;
        streams.filter(stream => !stream.closed).forEach(stream => stream.dispatchEvent(new Event(name)));
      }, type);
    }
  } };
}
