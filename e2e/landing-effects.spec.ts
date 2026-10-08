import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
});

for (const width of [375, 1024, 1440]) {
  test(`scroll direction hides and restores the header at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 667 });
    await page.goto('/');
    const header = page.locator('header');
    await expect(header).toHaveAttribute('data-hidden', 'false');
    await page.evaluate(() => window.scrollTo({ top: 650, behavior: 'instant' }));
    await expect(header).toHaveAttribute('data-hidden', 'true');
    await expect.poll(async () => (await header.boundingBox())!.y + (await header.boundingBox())!.height).toBeLessThanOrEqual(0);
    await page.evaluate(() => window.scrollTo({ top: 620, behavior: 'instant' }));
    await expect(header).toHaveAttribute('data-hidden', 'false');
    await expect.poll(async () => (await header.boundingBox())!.y).toBeGreaterThanOrEqual(-1);
    const before = await page.locator('main').evaluate(el => el.getBoundingClientRect().top + window.scrollY);
    await page.evaluate(() => window.scrollTo({ top: 700, behavior: 'instant' }));
    await expect(header).toHaveAttribute('data-hidden', 'true');
    const after = await page.locator('main').evaluate(el => el.getBoundingClientRect().top + window.scrollY);
    expect(after).toBe(before);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect(header).toHaveAttribute('data-hidden', 'false');
  });
}

test('keyboard focus restores navigation and prevents hiding an active link', async ({ page }) => {
  await page.goto('/');
  const header = page.locator('header');
  await page.evaluate(() => window.scrollTo({ top: 650, behavior: 'instant' }));
  await expect(header).toHaveAttribute('data-hidden', 'true');
  const signIn = header.getByRole('link', { name: 'Sign in' });
  await signIn.focus();
  await expect(signIn).toBeFocused();
  await expect(header).toHaveAttribute('data-hidden', 'false');
  await page.evaluate(() => window.scrollTo({ top: 750, behavior: 'instant' }));
  await expect(header).toHaveAttribute('data-hidden', 'false');
  await expect(header.getByRole('link', { name: 'Call 911' })).toHaveAttribute('href', 'tel:911');
  await header.getByRole('link', { name: 'How reporting works' }).click();
  await expect(page).toHaveURL(/#workflow$/);
});

for (const width of [375, 1440]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`page-wide background keeps moving through services and footer at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 667 : 900 });
      await page.addInitScript(theme => localStorage.setItem('emergency-response-theme', theme), theme);
      await page.goto('/');
      const canvas = page.getByTestId('landing-particles');
      const pixels = () => canvas.evaluate(el => (el as HTMLCanvasElement).toDataURL());
      await expect(canvas).toHaveAttribute('data-running', 'true');
      expect(await canvas.evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
      await expect(canvas).toHaveAttribute('aria-hidden', 'true');
      expect(await canvas.evaluate(el => getComputedStyle(el).position)).toBe('fixed');
      const moving = await pixels();
      await expect.poll(pixels).not.toBe(moving);
      await expect(page.getByRole('button', { name: /(?:Pause|Resume) (?:background|animations)/ })).toHaveCount(0);
      for (const target of ['#services', 'footer']) {
        await page.locator(target).scrollIntoViewIfNeeded();
        await expect(canvas).toHaveAttribute('data-running', 'true');
        const box = await canvas.boundingBox();
        expect(box!.x).toBe(0);
        expect(box!.y).toBe(0);
        expect(box!.width).toBe(width);
        expect(box!.height).toBe(width < 768 ? 667 : 900);
        expect(await page.locator(target).evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
        const movingBelow = await pixels();
        await expect.poll(pixels).not.toBe(movingBelow);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        if (process.env.HERO_CAPTURE === 'true') {
          await page.screenshot({ path: `.impeccable/review/particles-${width}-${theme}-${target === 'footer' ? 'footer' : 'services'}.png` });
        }
      }
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await expect(canvas).toHaveAttribute('data-running', 'true');
      if (width === 1440 && theme === 'light') {
        const signIn = page.locator('header').getByRole('link', { name: 'Sign in' });
        await signIn.focus();
        await signIn.click();
        await expect(page).toHaveURL(/\/login$/);
        await expect(canvas).toHaveCount(0);
      }
    });
  }
}

test('background honors reduced motion without blocking content', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const canvas = page.getByTestId('landing-particles');
  await expect(canvas).toHaveAttribute('data-running', 'false');
  await expect(page.getByRole('button', { name: 'Pause animations' })).toHaveCount(0);
  for (const span of await page.locator('[data-scanning]').all()) {
    await expect(span).toBeVisible();
    expect(await span.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    expect(await span.evaluate(el => getComputedStyle(el).color)).not.toBe('rgba(0, 0, 0, 0)');
  }
});

test('background stops for a simulated hidden-document event and live preference changes', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('landing-particles');
  const scanner = page.locator('[data-scanning]').first();
  await expect(canvas).toHaveAttribute('data-running', 'true');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(canvas).toHaveAttribute('data-running', 'false');
  await expect(scanner).toHaveAttribute('data-scanning', 'false');
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden');
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(canvas).toHaveAttribute('data-running', 'true');
  await expect(scanner).toHaveAttribute('data-scanning', 'true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(canvas).toHaveAttribute('data-running', 'false');
  await expect(page.getByRole('button', { name: 'Pause animations' })).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(canvas).toHaveAttribute('data-running', 'true');
  await expect(page.getByRole('button', { name: 'Pause animations' })).toHaveCount(0);
});

test('scanner stays visible and moving beyond a full cycle and stops off-screen', async ({ page }) => {
  await page.goto('/');
  const scanner = page.locator('[data-scanning]').first();
  await expect(scanner).toHaveAttribute('data-scanning', 'true');
  const highlight = scanner.locator('[aria-hidden=true]').first();
  expect(await highlight.evaluate(el => getComputedStyle(el).animationIterationCount)).toBe('infinite');
  expect(await highlight.evaluate(el => getComputedStyle(el).animationDuration)).toBe('4.4s');
  const bar = scanner.locator('[aria-hidden=true]').last();
  const animationTime = () => bar.evaluate(el => Number(el.getAnimations()[0]?.currentTime ?? 0));
  await expect.poll(animationTime, { timeout: 10_000 }).toBeGreaterThan(4600);
  expect(await bar.evaluate(el => getComputedStyle(el).opacity)).toBe('0.5');
  const transform = await bar.evaluate(el => getComputedStyle(el).transform);
  await expect.poll(() => bar.evaluate(el => getComputedStyle(el).transform)).not.toBe(transform);
  await expect(page.getByRole('button', { name: /(?:Pause|Resume) (?:background|animations)/ })).toHaveCount(0);
  await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' }));
  await expect(scanner).toHaveAttribute('data-scanning', 'false');
  expect(await highlight.evaluate(el => getComputedStyle(el).animationPlayState)).toBe('paused');
  const pausedTime = await animationTime();
  await page.waitForTimeout(180);
  expect(await animationTime()).toBe(pausedTime);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(scanner).toHaveAttribute('data-scanning', 'true');
  await expect.poll(animationTime).toBeGreaterThan(pausedTime);
});

test('no-canvas support keeps the ordinary headline and reporting actions usable', async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await page.goto('/');
  const hero = page.getByRole('region', { name: /Report an emergency/ });
  await expect(hero.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(hero.getByRole('link', { name: 'Report an emergency', exact: true })).toHaveAttribute('href', '/login');
});
