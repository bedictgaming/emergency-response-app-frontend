import { expect, type Page } from '@playwright/test';

const connections = new WeakMap<Page, { socketConnected: boolean }>();

/** Healthy idle stream for either export transport; never contacts a real WS. */
export async function installQuietEventStream(page: Page) {
  const connection = { socketConnected: false }; connections.set(page, connection);
  await page.routeWebSocket('**/api/events/v1/socket.io/**', peer => {
    peer.onMessage(message => {
      if (message === '40') {
        peer.send('40{"sid":"quiet-synthetic-namespace"}');
        connection.socketConnected = true;
      }
    });
    peer.onClose(() => { connection.socketConnected = false; });
    peer.send('0{"sid":"quiet-synthetic-engine","upgrades":[],"pingInterval":25000,"pingTimeout":20000,"maxPayload":1024}');
  });
  await page.addInitScript(() => {
    let opened = false;
    class QuietEventStream extends EventTarget {
      onopen: (() => void) | null = null; onerror: (() => void) | null = null; closed = false;
      constructor() { super(); setTimeout(() => { if (!this.closed) { this.onopen?.(); opened = true; } }, 0); }
      close() { this.closed = true; }
    }
    Object.defineProperty(window, 'EventSource', { configurable: true, value: QuietEventStream });
    Object.defineProperty(window, '__quietStreamOpened', { configurable: true, get: () => opened });
  });
}

export async function waitForQuietEventStream(page: Page) {
  await expect.poll(async () => {
    if (connections.get(page)?.socketConnected) return true;
    // An explicitly Socket.IO build must complete its namespace handshake, not
    // pass on a synthetic EventSource marker from an unintended fallback.
    if (process.env.NEXT_PUBLIC_EMERGENCY_TRANSPORT === 'socket.io') return false;
    return page.evaluate(() => Boolean((window as typeof window & { __quietStreamOpened?: boolean }).__quietStreamOpened));
  }).toBe(true);
}

/** Finish initial HTTP catch-up and its paint before measuring filter isolation. */
export async function waitForInitialLiveReads(page: Page, completed: () => number, expected: number) {
  await expect.poll(completed).toBe(expected);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
