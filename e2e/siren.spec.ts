import { expect, test, type Page } from '@playwright/test';

interface AudioProbe {
  contexts: number;
  starts: number;
  resumes: number;
  release?: () => void;
  suspend?: () => Promise<void>;
}
declare global {
  interface Window { audioProbe: AudioProbe; }
}
type ProbedWindow = Window & { audioProbe: AudioProbe };

async function setup(page: Page, mode: 'native' | 'reject' | 'held' | 'unsupported' = 'native') {
  await page.addInitScript((mode) => {
    localStorage.setItem('user', JSON.stringify({ id: 'admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true }));
    const probe: AudioProbe = { contexts: 0, starts: 0, resumes: 0 };
    (window as ProbedWindow).audioProbe = probe;
    const Native = window.AudioContext;
    if (mode === 'unsupported') {
      Object.defineProperty(window, 'AudioContext', { value: undefined });
      Object.defineProperty(window, 'webkitAudioContext', { value: undefined });
    } else {
      class ProbedAudioContext extends Native {
        private unlocked = false;
        constructor() {
          super();
          probe.contexts += 1;
          probe.suspend = () => this.suspend();
        }
        override get state(): AudioContextState {
          if (mode === 'reject' || (mode === 'held' && !this.unlocked)) return 'suspended';
          return super.state;
        }
        override resume(): Promise<void> {
          probe.resumes += 1;
          if (mode === 'reject') return Promise.reject(new DOMException('Blocked audio', 'NotAllowedError'));
          if (mode === 'held') return new Promise<void>((resolve, reject) => {
            probe.release = () => {
              this.unlocked = true;
              void super.resume().then(() => {
                this.dispatchEvent(new Event('statechange'));
                resolve();
              }, reject);
            };
          });
          return super.resume();
        }
        override createOscillator(): OscillatorNode {
          const oscillator = super.createOscillator();
          const start = oscillator.start.bind(oscillator);
          oscillator.start = (when?: number) => { probe.starts += 1; start(when); };
          return oscillator;
        }
      }
      Object.defineProperty(window, 'AudioContext', { value: ProbedAudioContext });
    }
    // API traffic is mocked; this suite validates browser audio, not live report delivery.
    class QuietEventSource { addEventListener() {} close() {} }
    Object.defineProperty(window, 'EventSource', { value: QuietEventSource });
  }, mode);
  await page.route('**/api/auth/v1/me', route => route.fulfill({ json: { data: { user: {
    id: 'admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true,
  } } } }));
  let showReport = false;
  let monitorReads = 0;
  await page.route('**/api/incidents/v1/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/review-flags')) return route.fulfill({ json: { data: {
      flags: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 },
    } } });
    if (url.searchParams.get('includeTotal') === 'false') monitorReads += 1;
    return route.fulfill({ json: { data: { incidents: showReport ? [{
      incidentId: 'audio-test-report', title: 'SYNTHETIC AUDIO TEST', description: 'No emergency',
      status: 'RESPONDING', verificationStatus: 'VERIFIED', reportedBy: 'citizen',
      reportedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      type: { typeId: 'fire', typeName: 'Fire' }, reporter: { id: 'citizen', name: 'Test Citizen' },
      location: { locationId: 'loc', locationName: 'Poblacion' }, attachments: [], serviceResponses: [],
    }] : [] } } });
  });
  await page.goto('/admin/main-dashboard');
  await expect(page.getByText('Sound not enabled', { exact: true })).toBeVisible();
  await expect.poll(() => monitorReads).toBeGreaterThan(0);
  // Let the initial empty monitoring read settle before introducing a new ID.
  await expect(page.getByRole('button', { name: 'All (0)' })).toBeVisible();
  return async () => {
    showReport = true;
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('dialog')).toContainText('SYNTHETIC AUDIO TEST');
  };
}

for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
  test(`incoming alert does not create audio before activation (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const arrive = await setup(page);
    await arrive();
    await expect(page.getByRole('dialog')).toContainText('Sound is not enabled');
    expect(await page.evaluate(() => (window as ProbedWindow).audioProbe.contexts)).toBe(0);
    await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath(`blocked-${viewport.width}.png`) });
    await page.getByRole('dialog').getByRole('button', { name: 'Enable sound', exact: true }).click();
    await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as ProbedWindow).audioProbe.starts)).toBe(2);
    await page.getByRole('button', { name: 'Acknowledge & Respond' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Siren Armed', { exact: true })).toBeVisible();
  });
}

test('rejected audio activation keeps the visual alert and offers recovery', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const arrive = await setup(page, 'reject');
  await arrive();
  await page.getByRole('dialog').getByRole('button', { name: 'Enable sound', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Sound could not start');
  await expect(page.getByText('Sound unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as ProbedWindow).audioProbe.starts)).toBe(0);
  expect(errors).toEqual([]);
});

test('an enabled siren automatically sounds for a new report and replaces the test timer', async ({ page }) => {
  const arrive = await setup(page);
  await page.getByRole('button', { name: 'Enable sound', exact: true }).click();
  await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toBeVisible();
  await arrive();
  // A real alert must not be silenced by the earlier 3.5-second speaker-test timer.
  await page.waitForTimeout(3800);
  await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Silence Loud Siren', exact: true }).click();
  await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('account switch cancels pending audio and unmounts the old alert', async ({ page }) => {
  const arrive = await setup(page, 'held');
  await arrive();
  await page.getByRole('dialog').getByRole('button', { name: 'Enable sound', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as ProbedWindow).audioProbe.resumes)).toBe(1);
  await page.evaluate(() => {
    const next = JSON.stringify({ id: 'other-admin', role: 'ADMIN', department: 'MEDICAL', isMainAdmin: false });
    localStorage.setItem('user', next);
    window.dispatchEvent(new StorageEvent('storage', { key: 'user', newValue: next }));
  });
  await expect(page.getByText('Another account signed in to this browser.', { exact: true })).toBeVisible();
  await page.evaluate(() => (window as ProbedWindow).audioProbe.release?.());
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Settle the held promise; the snapshot and unmount guards must reject its playback.
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as ProbedWindow).audioProbe.starts)).toBe(0);
});

test('acknowledging during audio activation cannot start a stale siren', async ({ page }) => {
  const arrive = await setup(page, 'held');
  await arrive();
  await page.getByRole('dialog').getByRole('button', { name: 'Enable sound', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as ProbedWindow).audioProbe.resumes)).toBe(1);
  await page.getByRole('button', { name: 'Acknowledge & Respond' }).click();
  await page.evaluate(() => (window as ProbedWindow).audioProbe.release?.());
  await expect(page.getByText('Siren Armed', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Test', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as ProbedWindow).audioProbe.starts)).toBe(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('hung audio activation times out instead of claiming playback', async ({ page }) => {
  await setup(page, 'held');
  await page.getByRole('button', { name: 'Enable sound', exact: true }).click();
  await expect(page.getByText('Sound unavailable', { exact: true })).toBeVisible({ timeout: 6000 });
  await expect(page.getByRole('button', { name: 'Enable sound', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as ProbedWindow).audioProbe.starts)).toBe(0);
});

test('unsupported audio does not prevent incident monitoring', async ({ page }) => {
  const arrive = await setup(page, 'unsupported');
  await page.getByRole('button', { name: 'Enable sound', exact: true }).click();
  await expect(page.getByText('Sound unavailable', { exact: true })).toBeVisible();
  await arrive();
  await expect(page.getByRole('dialog')).toContainText('SYNTHETIC AUDIO TEST');
});

test('testing, immediate stop/restart, and interruption report actual audio state', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Enable sound', exact: true }).click();
  const mute = page.getByRole('button', { name: 'MUTE SIREN', exact: true });
  await expect(mute).toBeVisible();
  await mute.click();
  await page.getByRole('button', { name: 'Test', exact: true }).click();
  await expect(mute).toBeVisible();
  // Old fade-out cleanup must not disconnect this new playback.
  await page.waitForTimeout(150);
  await expect(mute).toBeVisible();
  expect(await page.evaluate(() => (window as ProbedWindow).audioProbe.starts)).toBe(4);
  await page.evaluate(() => (window as ProbedWindow).audioProbe.suspend?.());
  await expect(page.getByText('Sound not enabled', { exact: true })).toBeVisible();
  await expect(mute).toHaveCount(0);
  await page.getByRole('button', { name: 'Enable sound', exact: true }).click();
  await expect(mute).toBeVisible();
  await expect(mute).toHaveCount(0, { timeout: 6000 });
  await expect(page.getByText('Siren Armed', { exact: true })).toBeVisible();
});
