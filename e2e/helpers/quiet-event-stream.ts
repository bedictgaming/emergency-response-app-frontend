import { expect, type Page } from '@playwright/test';

/** Healthy idle stream for non-transport tests, not a finite SSE body/EOF. */
export async function installQuietEventStream(page: Page) {
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
  await expect.poll(() => page.evaluate(() => Boolean((window as typeof window & { __quietStreamOpened?: boolean }).__quietStreamOpened))).toBe(true);
}

/** Finish initial HTTP catch-up and its paint before measuring filter isolation. */
export async function waitForInitialLiveReads(page: Page, completed: () => number, expected: number) {
  await expect.poll(completed).toBe(expected);
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
