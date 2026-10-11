import { expect, type Page } from '@playwright/test';

// Controlled browser fixture only: this does not certify a physical camera.
export async function installFakeIncidentCamera(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        sessionStorage.setItem('cameraStarts', String(Number(sessionStorage.getItem('cameraStarts') || 0) + 1));
        const stream = new MediaStream();
        Object.defineProperty(stream, 'getTracks', {
          value: () => [{ stop: () => sessionStorage.setItem('cameraStops', String(Number(sessionStorage.getItem('cameraStops') || 0) + 1)) }],
        });
        return stream;
      },
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => 640 });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 480 });
    CanvasRenderingContext2D.prototype.drawImage = () => {};
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      originalToBlob.call(this, blob => {
        const bytes = Number(sessionStorage.getItem('testCameraBytes') || 0);
        callback(blob && bytes > blob.size
          ? new Blob([blob, new Uint8Array(bytes - blob.size)], { type: blob.type })
          : blob);
      }, type, quality);
    };
  });
}

export async function captureIncidentPhoto(page: Page, bytes = 0) {
  await page.evaluate(value => sessionStorage.setItem('testCameraBytes', String(value)), bytes);
  await page.getByRole('button', { name: 'Use camera', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Camera preview', exact: true })).toBeVisible();
  await page.getByLabel('Live camera view').dispatchEvent('canplay');
  await page.getByRole('button', { name: 'Take picture', exact: true }).click();
  await expect(page.getByAltText('Incident evidence preview')).toBeVisible();
}
