import { expect, type Locator, type Page } from '@playwright/test';

// Inspect rendered geometry, not a test-only map instance or application seam.
export async function expectPinOnRadius(map: Locator) {
  await expect.poll(async () => {
    const [pin, circle] = await Promise.all([
      map.getByTitle('Emergency location pin', { exact: true }).boundingBox(),
      map.locator('.incident-reference-radius').boundingBox(),
    ]);
    if (!pin || !circle) return Infinity;
    return Math.max(
      Math.abs(circle.x + circle.width / 2 - pin.x - 18),
      Math.abs(circle.y + circle.height / 2 - pin.y - 42),
    );
  }).toBeLessThanOrEqual(2);
}

export async function expectZoomAndPan(page: Page, map: Locator) {
  const circle = map.locator('.incident-reference-radius');
  await expectPinOnRadius(map);
  const before = (await circle.boundingBox())!.width;
  await map.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(async () => (await circle.boundingBox())!.width).toBeGreaterThan(before * 1.9);
  await expect(map).not.toHaveClass(/leaflet-zoom-anim/);
  await expectPinOnRadius(map);
  await map.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect.poll(async () => Math.abs((await circle.boundingBox())!.width - before)).toBeLessThan(2);
  await expect(map).not.toHaveClass(/leaflet-zoom-anim/);

  const startX = (await circle.boundingBox())!.x;
  const box = (await map.boundingBox())!;
  const x = box.x + box.width * 0.7, y = box.y + box.height * 0.7;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - Math.min(80, box.width * 0.2), y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await circle.boundingBox())!.x - startX)).toBeGreaterThan(20);
  await expectPinOnRadius(map);
  await expect.poll(async () => Math.abs((await circle.boundingBox())!.width - before)).toBeLessThan(2);
}
