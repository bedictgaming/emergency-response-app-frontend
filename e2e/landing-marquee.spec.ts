import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
});

const names = ['Fire', 'Medical', 'Police', 'DRRMO'];

for (const width of [320, 375, 1365, 1440]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`service strip moves seamlessly without overflow at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 667 : 900 });
      await page.addInitScript(theme => localStorage.setItem('emergency-response-theme', theme), theme);
      await page.goto('/');
      const strip = page.getByRole('region', { name: 'Response services', exact: true });
      await strip.scrollIntoViewIfNeeded();
      await expect(strip).toHaveAttribute('data-running', 'true');
      await expect(strip.getByRole('listitem')).toHaveText(names);
      await expect(strip.locator('ul[aria-hidden=true]')).toHaveCount(1);
      const track = page.getByTestId('service-marquee-track');
      const transform = () => track.evaluate(el => getComputedStyle(el).transform);
      const before = await transform();
      await expect.poll(transform).not.toBe(before);
      expect(await track.evaluate(el => getComputedStyle(el).animationIterationCount)).toBe('infinite');
      const loop = await track.evaluate(el => {
        const groups = Array.from(el.querySelectorAll('ul'));
        const animation = el.getAnimations()[0];
        animation.pause();
        animation.currentTime = 0;
        const start = groups[0].firstElementChild!.getBoundingClientRect().x;
        const groupWidth = groups[0].getBoundingClientRect().width;
        const trackWidth = el.getBoundingClientRect().width;
        animation.currentTime = 27_999.99;
        const end = groups[1].firstElementChild!.getBoundingClientRect().x;
        animation.currentTime = 0;
        animation.play();
        return { start, end, groupWidth, trackWidth };
      });
      expect(loop.groupWidth).toBeGreaterThanOrEqual(width);
      expect(loop.trackWidth).toBeCloseTo(loop.groupWidth * 2, 1);
      expect(Math.abs(loop.start - loop.end)).toBeLessThan(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (process.env.MARQUEE_CAPTURE === 'true' && [375, 1440].includes(width)) {
        await strip.evaluate(el => window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 180, behavior: 'instant' }));
        await page.screenshot({ path: `.impeccable/review/marquee-${width}-${theme}.png` });
      }
    });
  }
}

test('service motion freezes offscreen and hidden, then resumes', async ({ page }) => {
  await page.goto('/');
  const strip = page.getByRole('region', { name: 'Response services', exact: true });
  const track = page.getByTestId('service-marquee-track');
  const time = () => track.evaluate(el => Number(el.getAnimations()[0]?.currentTime ?? 0));
  await strip.scrollIntoViewIfNeeded();
  await expect(strip).toHaveAttribute('data-running', 'true');
  await page.locator('footer').scrollIntoViewIfNeeded();
  await expect(strip).toHaveAttribute('data-running', 'false');
  const paused = await time();
  await page.waitForTimeout(150);
  expect(await time()).toBe(paused);
  await strip.scrollIntoViewIfNeeded();
  await expect(strip).toHaveAttribute('data-running', 'true');
  await expect.poll(time).toBeGreaterThan(paused);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(strip).toHaveAttribute('data-running', 'false');
  const hidden = await time();
  await page.waitForTimeout(150);
  expect(await time()).toBe(hidden);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(strip).toHaveAttribute('data-running', 'true');
  await expect.poll(time).toBeGreaterThan(hidden);
});

test('reduced motion keeps all four services static, including live changes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 667 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const strip = page.getByRole('region', { name: 'Response services', exact: true });
  await strip.scrollIntoViewIfNeeded();
  await expect(strip).toHaveAttribute('data-motion', 'false');
  await expect(strip.getByRole('listitem')).toHaveText(names);
  await expect(strip.locator('ul[aria-hidden=true]')).toBeHidden();
  expect(await page.getByTestId('service-marquee-track').evaluate(el => el.getAnimations().length)).toBe(0);
  for (const item of await strip.getByRole('listitem').all()) {
    const box = (await item.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(strip).toHaveAttribute('data-running', 'true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(strip).toHaveAttribute('data-running', 'false');
  await expect(strip.locator('ul[aria-hidden=true]')).toBeHidden();
});

test('without IntersectionObserver services fall back to a complete static list', async ({ page }) => {
  await page.addInitScript(() => {
    // Isolate the new strip's fallback from the incumbent canvas observer.
    HTMLCanvasElement.prototype.getContext = () => null;
    Reflect.deleteProperty(window, 'IntersectionObserver');
  });
  await page.goto('/');
  const strip = page.getByRole('region', { name: 'Response services', exact: true });
  await expect(strip).toHaveAttribute('data-motion', 'false');
  await expect(strip.getByRole('listitem')).toHaveText(names);
  await expect(strip.locator('ul[aria-hidden=true]')).toBeHidden();
});

test('JavaScript-disabled export retains services and emergency actions', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 667 }, serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:3100/');
    const strip = page.getByRole('region', { name: 'Response services', exact: true });
    await expect(strip.getByRole('listitem')).toHaveText(names);
    await expect(strip.locator('ul[aria-hidden=true]')).toBeHidden();
    await expect(page.getByRole('region', { name: /Report an emergency/ }).getByRole('link', { name: 'Call 911' })).toHaveAttribute('href', 'tel:911');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await context.close();
  }
});
