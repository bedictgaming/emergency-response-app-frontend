import type { Page } from '@playwright/test';

/** Healthy idle stream for non-transport tests, not a finite SSE body/EOF. */
export async function installQuietEventStream(page: Page) {
  await page.addInitScript(() => {
    class QuietEventStream extends EventTarget {
      onopen: (() => void) | null = null; onerror: (() => void) | null = null; closed = false;
      constructor() { super(); setTimeout(() => { if (!this.closed) this.onopen?.(); }, 0); }
      close() { this.closed = true; }
    }
    Object.defineProperty(window, 'EventSource', { configurable: true, value: QuietEventStream });
  });
}
