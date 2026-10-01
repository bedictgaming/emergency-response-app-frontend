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

async function setup(page: Page, mode: 'native' | 'reject' | 'held' | 'unsupported' = 'native', saved = false) {
  await page.addInitScript(({ mode, saved }) => {
    localStorage.setItem('user', JSON.stringify({ id: 'admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true }));
    if (saved) localStorage.setItem('emergency-admin-sound-v1:admin:ADMIN:MAIN', 'enabled');
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
  }, { mode, saved });
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
  await expect(page.getByText(saved ? 'Sound saved · click to arm' : 'Sound not enabled', { exact: true })).toBeVisible();
  await expect.poll(() => monitorReads).toBeGreaterThan(0);
  // Let the initial empty monitoring read settle before introducing a new ID.
  await expect(page.getByRole('button', { name: 'All (0)' })).toBeVisible();
  return async () => {
    showReport = true;
    // A focus refresh can be coalesced while the initial mocked read is still
    // settling. Exercise the recovery trigger until the visual alert appears;
    // this suite tests audio activation, not live SSE delivery.
    await expect.poll(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      return page.getByRole('dialog').filter({ hasText: 'SYNTHETIC AUDIO TEST' }).isVisible();
    }).toBe(true);
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
  await expect(page.getByText('Sound saved · click to arm', { exact: true })).toBeVisible();
  await expect(mute).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume sound', exact: true }).click();
  await expect(mute).toBeVisible();
  await expect(mute).toHaveCount(0, { timeout: 6000 });
  await expect(page.getByText('Siren Armed', { exact: true })).toBeVisible();
});

for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
  test(`sound preference survives reload without another Enable click (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const arrive = await setup(page);
    await page.getByRole('button', { name: 'Enable sound', exact: true }).click();
    await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'MUTE SIREN', exact: true }).click();
    await page.reload();
    await expect(page.getByText('Sound saved · click to arm', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enable sound', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'All (0)' })).toBeVisible();
    expect(await page.evaluate(() => window.audioProbe.contexts)).toBe(0);
    // Programmatic clicks cannot unlock saved sound.
    await page.evaluate(() => document.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(await page.evaluate(() => window.audioProbe.contexts)).toBe(0);
    await page.screenshot({ path: test.info().outputPath(`saved-sound-${viewport.width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.getByText('Siren Armed', { exact: true })).toBeVisible();
    // Restoring consent does not replay the previous speaker test.
    expect(await page.evaluate(() => window.audioProbe.starts)).toBe(0);
    await arrive();
    await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.audioProbe.starts)).toBe(2);
  });
}

test('saved sound arms on a trusted keyboard gesture', async ({ page }) => {
  await setup(page, 'native', true);
  await page.keyboard.press('Enter');
  await expect(page.getByText('Siren Armed', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.audioProbe.starts)).toBe(0);
});

test('a saved preference does not unlock background alerts or replay acknowledged reports', async ({ page }) => {
  const arrive = await setup(page, 'held', true);
  await arrive();
  expect(await page.evaluate(() => window.audioProbe.contexts)).toBe(0);
  await page.getByRole('button', { name: 'Acknowledge & Respond' }).click();
  expect(await page.evaluate(() => window.audioProbe.contexts)).toBe(0);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.audioProbe.resumes)).toBe(1);
  await page.evaluate(() => window.audioProbe.release?.());
  await expect(page.getByText('Siren Armed', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.audioProbe.starts)).toBe(0);
});

test('blocked saved activation remains honest and recoverable', async ({ page }) => {
  const arrive = await setup(page, 'reject', true);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('Sound unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume sound', exact: true })).toBeEnabled();
  await arrive();
  await expect(page.getByRole('dialog')).toContainText('Sound could not start');
  expect(await page.evaluate(() => window.audioProbe.starts)).toBe(0);
});

test('another admin cannot inherit saved consent', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('emergency-admin-sound-v1:other-admin:ADMIN:MAIN', 'enabled'));
  await setup(page);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('Sound not enabled', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.audioProbe.contexts)).toBe(0);
});

test('denied preference storage does not prevent explicit sound activation', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('emergency-admin-sound-v1:')) throw new DOMException('Storage denied', 'SecurityError');
      original.call(this, key, value);
    };
  });
  await setup(page);
  await page.getByRole('button', { name: 'Enable sound', exact: true }).click();
  await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'MUTE SIREN', exact: true }).click();
  await page.reload();
  await expect(page.getByText('Sound not enabled', { exact: true })).toBeVisible();
});

test('account switching during saved restoration cannot ring an old alert', async ({ page }) => {
  await setup(page, 'held', true);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.audioProbe.resumes)).toBe(1);
  await page.evaluate(() => {
    const next = JSON.stringify({ id: 'other-admin', role: 'ADMIN', department: 'MEDICAL', isMainAdmin: false });
    localStorage.setItem('user', next);
    window.dispatchEvent(new StorageEvent('storage', { key: 'user', newValue: next }));
  });
  await expect(page.getByText('Another account signed in to this browser.', { exact: true })).toBeVisible();
  await page.evaluate(() => window.audioProbe.release?.());
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.audioProbe.starts)).toBe(0);
});
