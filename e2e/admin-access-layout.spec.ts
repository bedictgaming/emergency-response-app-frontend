import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 844, height: 390 },
  { width: 1365, height: 640 },
]) {
  test(`authorization loading group is centered at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/**', async route => {
      // Keep authorization pending, never contact a real backend or mount private data.
      await pending;
      await route.fulfill({ status: 503, json: { message: 'Synthetic unavailable service' } });
    });
    await page.goto('/admin/main-dashboard');
    try {
      const status = page.getByRole('status', { name: 'Verifying authorized access…' });
      await expect(status).toBeVisible();
      await expect(status).toHaveAttribute('aria-live', 'polite');
      await expect(status).toHaveAttribute('aria-busy', 'true');
      await expect(page.getByRole('heading', { name: /Main Emergency Dashboard/ })).toHaveCount(0);
      await expect(status.locator('[data-loader-skeleton]')).toHaveCount(4);
      await expect(status.locator('[data-skeleton-shimmer]')).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      const group = (await status.boundingBox())!;
      expect(Math.abs(group.x + group.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(group.y + group.height / 2 - viewport.height / 2)).toBeLessThanOrEqual(1);
      await expect(status.locator('p')).toHaveCSS('text-align', 'center');
      for (const bar of await status.locator('[data-loader-skeleton]').all()) {
        const box = (await bar.boundingBox())!;
        expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`access-${viewport.width}.png`) });
    } finally {
      release();
    }
    await expect(page.getByText('Authorization service is temporarily unavailable.')).toBeVisible();
    await expect(page.getByRole('status', { name: 'Verifying authorized access…' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });
}
