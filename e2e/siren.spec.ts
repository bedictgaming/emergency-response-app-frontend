import { expect, test, type Page } from '@playwright/test';

interface AudioProbe {
  contexts: number;
  starts: number;
  resumes: number;
  ready?: () => boolean;
  release?: () => void;
  suspend?: () => Promise<void>;
}
declare global {
  interface Window { audioProbe: AudioProbe; }
}
type ProbedWindow = Window & { audioProbe: AudioProbe };

// Playwright's ordinary evaluation can carry CDP userGesture=true. Read probes
// and dispatch synthetic lifecycle events without manufacturing autoplay consent.
async function inspectPage<T>(page: Page, expression: () => T): Promise<Awaited<T>> {
  const session = await page.context().newCDPSession(page);
  try {
    const result = await session.send('Runtime.evaluate', {
      expression: `(${expression.toString()})()`, returnByValue: true, awaitPromise: true, userGesture: false,
    });
    if (result.exceptionDetails) throw new Error('Synthetic audio inspection failed');
    return result.result.value as Awaited<T>;
  } finally { await session.detach(); }
}

async function setup(page: Page, mode: 'native' | 'reject' | 'held' | 'unsupported' = 'native', saved = false, activateBeforeGuard = false) {
  await page.addInitScript(({ mode, saved }) => {
    // Even locator observations in the installed Playwright bundle use
    // userGesture=true. Model a cold document until real input, while retaining
    // native Web Audio and genuine trusted click/keyboard events for activation.
    const browserActivation = navigator.userActivation;
    let interacted = false;
    Object.defineProperty(navigator, 'userActivation', { configurable: true, value: {
      get hasBeenActive() { return interacted; },
      get isActive() { return browserActivation?.isActive ?? false; },
    } });
    const rememberInteraction = (event: Event) => {
      if (!event.isTrusted) return;
      if (event instanceof KeyboardEvent
        && (event.repeat || event.ctrlKey || event.metaKey || event.altKey
          || ['Escape', 'Shift', 'Control', 'Alt', 'Meta'].includes(event.key))) return;
      interacted = true;
    };
    document.addEventListener('click', rememberInteraction, true);
    document.addEventListener('keydown', rememberInteraction, true);
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
          probe.ready = () => this.state === 'running';
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
  let releaseGuard!: () => void;
  const guardGate = new Promise<void>(resolve => { releaseGuard = resolve; });
  await page.route('**/api/auth/v1/me', async route => {
    if (activateBeforeGuard) await guardGate;
    return route.fulfill({ json: { data: { user: {
      id: 'admin', role: 'ADMIN', department: 'MAIN', isMainAdmin: true,
    } } } });
  });
  let showReport = false;
  let acknowledged = false;
  let queueUnavailable = false;
  let monitorReads = 0;
  let reportNumber = 0;
  await page.route('**/api/incidents/v1/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/review-flags')) return route.fulfill({ json: { data: {
      flags: [], pagination: { page: 1, limit: 20, total: 0, pages: 0 },
    } } });
    if (url.pathname.endsWith('/attention/acknowledge')) throw new Error('Main Admin must not acknowledge its own queue');
    if (url.pathname.endsWith('/attention')) {
      monitorReads += 1;
      if (queueUnavailable) return route.fulfill({ status: 503, json: { message: 'Synthetic queue outage' } });
      return route.fulfill({ json: { data: { observedAt: '2026-09-01T00:00:00.000Z', hasMore: false, acknowledgementMode: 'DEPARTMENT_HANDOFF', items: showReport && !acknowledged ? [{
        incidentId: `audio-test-report-${reportNumber}`, title: `SYNTHETIC AUDIO TEST ${reportNumber}`, description: 'No emergency', version: 1, scope: 'MAIN',
        status: 'RESPONDING', reportedAt: new Date().toISOString(), type: { typeName: 'Fire' }, reporter: { name: 'Test Citizen' }, location: { locationName: 'Poblacion' },
      }] : [] } } });
    }
    return route.fulfill({ json: { data: { incidents: showReport ? [{
      incidentId: `audio-test-report-${reportNumber}`, title: `SYNTHETIC AUDIO TEST ${reportNumber}`, description: 'No emergency',
      status: 'RESPONDING', verificationStatus: 'VERIFIED', reportedBy: 'citizen',
      reportedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      type: { typeId: 'fire', typeName: 'Fire' }, reporter: { id: 'citizen', name: 'Test Citizen' },
      location: { locationId: 'loc', locationName: 'Poblacion' }, attachments: [], serviceResponses: [],
    }] : [] } } });
  });
  await page.goto('/admin/main-dashboard');
  if (activateBeforeGuard) {
    await page.mouse.click(10, 10);
    expect(await inspectPage(page, () => window.audioProbe.contexts)).toBe(0);
    releaseGuard();
  }
  await expect(page.getByRole('button', { name: 'Outstanding alerts: 0', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^(Enable sound|Resume sound|Test)$/ })).toHaveCount(0);
  await expect(page.getByText('Siren Armed', { exact: true })).toHaveCount(0);
  await expect.poll(() => monitorReads).toBeGreaterThan(0);
  // Let the initial empty monitoring read settle before introducing a new ID.
  await expect(page.getByRole('button', { name: 'All (0)' })).toBeVisible();
  const arrive = async () => {
    showReport = true;
    // A focus refresh can be coalesced while the initial mocked read is still
    // settling. Exercise the recovery trigger until the visual alert appears;
    // this suite tests audio activation, not live SSE delivery.
    await expect.poll(async () => {
      await inspectPage(page, () => window.dispatchEvent(new Event('focus')));
      return page.getByRole('dialog').filter({ hasText: 'SYNTHETIC AUDIO TEST' }).isVisible();
    }).toBe(true);
  };
  return Object.assign(arrive, { next: async () => {
    reportNumber++;
    await inspectPage(page, () => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('dialog')).toContainText(`SYNTHETIC AUDIO TEST ${reportNumber}`);
  }, recover: async () => {
    queueUnavailable = false;
    await inspectPage(page, () => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('dialog')).not.toContainText('Alert queue unavailable');
  }, outage: async () => {
    queueUnavailable = true;
    await inspectPage(page, () => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('dialog')).toContainText('Alert queue unavailable');
  }, clear: async () => {
    acknowledged = true; // Synthetic server state after department-admin acknowledgement.
    await inspectPage(page, () => window.dispatchEvent(new Event('focus')));
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } });
}

for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
  test(`incoming alert does not create audio before activation (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const arrive = await setup(page);
    await arrive();
    await expect(page.getByRole('dialog')).toContainText('Browser sound is waiting for a click or keypress');
    expect(await inspectPage(page, () => (window as ProbedWindow).audioProbe.contexts)).toBe(0);
    await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath(`blocked-${viewport.width}.png`) });
    await page.getByRole('heading', { name: 'Outstanding report', exact: true }).click();
    await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toBeVisible();
    expect(await inspectPage(page, () => (window as ProbedWindow).audioProbe.starts)).toBe(2);
    await arrive.clear();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await inspectPage(page, () => window.audioProbe.ready?.())).toBe(true);
    await expect(page.getByText('Siren Armed', { exact: true })).toHaveCount(0);
  });
}

test('rejected audio activation keeps the visual alert and offers recovery', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const arrive = await setup(page, 'reject');
  await arrive();
  await page.getByRole('heading', { name: 'Outstanding report', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Browser sound could not start');
  await expect(page.getByRole('button', { name: /^(Enable sound|Resume sound|Test)$/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toHaveCount(0);
  expect(await inspectPage(page, () => (window as ProbedWindow).audioProbe.starts)).toBe(0);
  expect(errors).toEqual([]);
});

test('a normal dashboard click arms without a test sound and later reports ring automatically', async ({ page }) => {
  const arrive = await setup(page);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => inspectPage(page, () => window.audioProbe.ready?.())).toBe(true);
  expect(await inspectPage(page, () => window.audioProbe.starts)).toBe(0);
  await arrive();
  // Arming never schedules a speaker test or its short automatic stop timer.
  await page.waitForTimeout(3800);
  await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mute alert', exact: true }).click();
  await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.mouse.click(2, 2);
  await expect(page.getByRole('dialog')).toBeVisible();
  const starts = await inspectPage(page, () => window.audioProbe.starts);
  await inspectPage(page, () => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: 'Unmute alert', exact: true })).toBeVisible();
  expect(await inspectPage(page, () => window.audioProbe.starts)).toBe(starts);
  await page.getByRole('button', { name: 'Unmute alert', exact: true }).click();
  await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toBeVisible();
  expect(await inspectPage(page, () => window.audioProbe.starts)).toBe(starts + 2);
  await arrive.clear();
  await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toHaveCount(0);
});

test('muting while audio activation is pending cancels playback without dismissing Main alert', async ({ page }) => {
  const arrive = await setup(page, 'held');
  await arrive();
  await page.getByRole('heading', { name: 'Outstanding report', exact: true }).click();
  await expect.poll(() => inspectPage(page, () => window.audioProbe.resumes)).toBe(1);
  await page.getByRole('button', { name: 'Mute alert', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unmute alert', exact: true })).toBeDisabled();
  await inspectPage(page, () => window.audioProbe.release?.());
  await expect(page.getByRole('button', { name: 'Unmute alert', exact: true })).toBeEnabled();
  expect(await inspectPage(page, () => window.audioProbe.starts)).toBe(0);
  await expect(page.getByRole('dialog')).toBeVisible();
  await arrive.clear();
});

test('account switch cancels pending audio and unmounts the old alert', async ({ page }) => {
  const arrive = await setup(page, 'held');
  await arrive();
  await page.getByRole('heading', { name: 'Outstanding report', exact: true }).click();
  await expect.poll(() => inspectPage(page, () => (window as ProbedWindow).audioProbe.resumes)).toBe(1);
  await inspectPage(page, () => {
    const next = JSON.stringify({ id: 'other-admin', role: 'ADMIN', department: 'MEDICAL', isMainAdmin: false });
    localStorage.setItem('user', next);
    window.dispatchEvent(new StorageEvent('storage', { key: 'user', newValue: next }));
  });
  await expect(page.getByText('Another account signed in to this browser.', { exact: true })).toBeVisible();
  await inspectPage(page, () => (window as ProbedWindow).audioProbe.release?.());
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Settle the held promise; the snapshot and unmount guards must reject its playback.
  await page.waitForTimeout(150);
  expect(await inspectPage(page, () => (window as ProbedWindow).audioProbe.starts)).toBe(0);
});

test('department handoff during Main audio activation cannot start a stale siren', async ({ page }) => {
  const arrive = await setup(page, 'held');
  await arrive();
  await page.getByRole('heading', { name: 'Outstanding report', exact: true }).click();
  await expect.poll(() => inspectPage(page, () => (window as ProbedWindow).audioProbe.resumes)).toBe(1);
  await arrive.clear();
  await inspectPage(page, () => (window as ProbedWindow).audioProbe.release?.());
  await expect.poll(() => inspectPage(page, () => window.audioProbe.ready?.())).toBe(true);
  await expect(page.getByRole('button', { name: 'Test', exact: true })).toHaveCount(0);
  expect(await inspectPage(page, () => (window as ProbedWindow).audioProbe.starts)).toBe(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('hung audio activation times out instead of claiming playback', async ({ page }) => {
  const arrive = await setup(page, 'held');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await arrive();
  await expect(page.getByRole('dialog')).toContainText('Browser sound could not start', { timeout: 6000 });
  await expect(page.getByRole('button', { name: /^(Enable sound|Resume sound|Test)$/ })).toHaveCount(0);
  expect(await inspectPage(page, () => (window as ProbedWindow).audioProbe.starts)).toBe(0);
});

test('unsupported audio does not prevent incident monitoring', async ({ page }) => {
  const arrive = await setup(page, 'unsupported');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await arrive();
  await expect(page.getByRole('dialog')).toContainText('SYNTHETIC AUDIO TEST');
  await expect(page.getByRole('dialog')).toContainText('Browser sound could not start');
});

test('explicit mute/unmute works but foreground recovery cannot replay an already sounded report', async ({ page }) => {
  const arrive = await setup(page);
  await arrive();
  await page.getByRole('heading', { name: 'Outstanding report', exact: true }).click();
  const mute = page.getByRole('button', { name: 'MUTE SIREN', exact: true });
  await expect(mute).toBeVisible();
  // Main's persistent modal intentionally makes header controls inert.
  await page.getByRole('button', { name: 'Mute alert', exact: true }).click();
  await page.getByRole('button', { name: 'Unmute alert', exact: true }).click();
  await expect(mute).toBeVisible();
  // Old fade-out cleanup must not disconnect this new playback.
  await page.waitForTimeout(150);
  await expect(mute).toBeVisible();
  expect(await inspectPage(page, () => (window as ProbedWindow).audioProbe.starts)).toBe(4);
  await inspectPage(page, () => (window as ProbedWindow).audioProbe.suspend?.());
  await expect(page.getByRole('dialog')).toContainText('No new report is waiting to sound');
  await expect(mute).toHaveCount(0);
  await inspectPage(page, () => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => inspectPage(page, () => window.audioProbe.ready?.())).toBe(true);
  await expect(mute).toHaveCount(0);
  expect(await inspectPage(page, () => window.audioProbe.starts)).toBe(4);
  await arrive.next();
  await expect(mute).toBeVisible();
  expect(await inspectPage(page, () => window.audioProbe.starts)).toBe(6);
  await arrive.clear();
  await expect(mute).toHaveCount(0);
});

test('polling and outage recovery cannot restart already played work; another report still can', async ({ page }) => {
  const arrive = await setup(page);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await arrive();
  await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toBeVisible();
  const starts = await inspectPage(page, () => window.audioProbe.starts);
  await inspectPage(page, () => window.dispatchEvent(new Event('focus')));
  expect(await inspectPage(page, () => window.audioProbe.starts)).toBe(starts);
  await arrive.outage(); await arrive.recover();
  await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toHaveCount(0);
  expect(await inspectPage(page, () => window.audioProbe.starts)).toBe(starts);
  await arrive.next();
  await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toBeVisible();
  expect(await inspectPage(page, () => window.audioProbe.starts)).toBe(starts + 2);
});

for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
  test(`sound preference survives reload without another Enable click (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const arrive = await setup(page);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect.poll(() => inspectPage(page, () => window.audioProbe.ready?.())).toBe(true);
    expect(await inspectPage(page, () => window.audioProbe.starts)).toBe(0);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Outstanding alerts: 0', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enable sound', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'All (0)' })).toBeVisible();
    expect(await inspectPage(page, () => window.audioProbe.contexts)).toBe(0);
    // Programmatic clicks cannot unlock saved sound.
    await inspectPage(page, () => document.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(await inspectPage(page, () => window.audioProbe.contexts)).toBe(0);
    await page.screenshot({ path: test.info().outputPath(`saved-sound-${viewport.width}.png`) });
    expect(await inspectPage(page, () => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect.poll(() => inspectPage(page, () => window.audioProbe.ready?.())).toBe(true);
    // Restoring consent does not replay the previous speaker test.
    expect(await inspectPage(page, () => window.audioProbe.starts)).toBe(0);
    await arrive();
    await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toBeVisible();
    expect(await inspectPage(page, () => window.audioProbe.starts)).toBe(2);
  });
}

for (const saved of [false, true]) {
  test(`trusted keyboard interaction arms sound without a dedicated button (saved=${saved})`, async ({ page }) => {
    await setup(page, 'native', saved);
    await page.keyboard.press('Enter');
    await expect.poll(() => inspectPage(page, () => window.audioProbe.ready?.())).toBe(true);
    expect(await inspectPage(page, () => window.audioProbe.starts)).toBe(0);
  });
}

test('a saved preference does not unlock background alerts or replay acknowledged reports', async ({ page }) => {
  const arrive = await setup(page, 'held', true);
  await arrive();
  expect(await inspectPage(page, () => window.audioProbe.contexts)).toBe(0);
  await arrive.clear();
  expect(await inspectPage(page, () => window.audioProbe.contexts)).toBe(0);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => inspectPage(page, () => window.audioProbe.resumes)).toBe(1);
  await inspectPage(page, () => window.audioProbe.release?.());
  await expect.poll(() => inspectPage(page, () => window.audioProbe.ready?.())).toBe(true);
  expect(await inspectPage(page, () => window.audioProbe.starts)).toBe(0);
});

test('blocked saved activation remains honest and recoverable', async ({ page }) => {
  const arrive = await setup(page, 'reject', true);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await arrive();
  await expect(page.getByRole('dialog')).toContainText('Browser sound could not start');
  await expect(page.getByRole('button', { name: 'Resume sound', exact: true })).toHaveCount(0);
  expect(await inspectPage(page, () => window.audioProbe.starts)).toBe(0);
});

test('another account preference cannot arm audio without a fresh trusted interaction', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('emergency-admin-sound-v1:other-admin:ADMIN:MAIN', 'enabled'));
  await setup(page);
  expect(await inspectPage(page, () => window.audioProbe.contexts)).toBe(0);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => inspectPage(page, () => window.audioProbe.ready?.())).toBe(true);
  expect(await inspectPage(page, () => localStorage.getItem('emergency-admin-sound-v1:admin:ADMIN:MAIN'))).toBe('enabled');
});

test('denied preference storage does not prevent normal-interaction sound arming', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('emergency-admin-sound-v1:')) throw new DOMException('Storage denied', 'SecurityError');
      original.call(this, key, value);
    };
  });
  await setup(page);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => inspectPage(page, () => window.audioProbe.ready?.())).toBe(true);
  expect(await inspectPage(page, () => window.audioProbe.starts)).toBe(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Outstanding alerts: 0', exact: true })).toBeVisible();
  expect(await inspectPage(page, () => window.audioProbe.contexts)).toBe(0);
});

test('account switching during saved restoration cannot ring an old alert', async ({ page }) => {
  await setup(page, 'held', true);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => inspectPage(page, () => window.audioProbe.resumes)).toBe(1);
  await inspectPage(page, () => {
    const next = JSON.stringify({ id: 'other-admin', role: 'ADMIN', department: 'MEDICAL', isMainAdmin: false });
    localStorage.setItem('user', next);
    window.dispatchEvent(new StorageEvent('storage', { key: 'user', newValue: next }));
  });
  await expect(page.getByText('Another account signed in to this browser.', { exact: true })).toBeVisible();
  await inspectPage(page, () => window.audioProbe.release?.());
  await page.waitForTimeout(150);
  expect(await inspectPage(page, () => window.audioProbe.starts)).toBe(0);
});

test('untrusted events and modifier keys cannot arm an unactivated document', async ({ page }) => {
  await setup(page);
  await inspectPage(page, () => {
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await page.keyboard.press('Control');
  await page.keyboard.press('Escape');
  expect(await inspectPage(page, () => window.audioProbe.contexts)).toBe(0);
});

test('normal activation before session verification is reused only after the admin guard mounts', async ({ page }) => {
  await setup(page, 'native', false, true);
  await expect.poll(() => inspectPage(page, () => window.audioProbe.ready?.())).toBe(true);
  expect(await inspectPage(page, () => window.audioProbe.starts)).toBe(0);
  await expect(page.getByRole('button', { name: /^(Enable sound|Resume sound|Test)$/ })).toHaveCount(0);
});

test('an ordinary gesture cannot start retained work during a queue outage', async ({ page }) => {
  const arrive = await setup(page);
  await arrive();
  await arrive.outage();
  await page.getByRole('heading', { name: 'Outstanding report', exact: true }).click();
  await expect.poll(() => inspectPage(page, () => window.audioProbe.ready?.())).toBe(true);
  expect(await inspectPage(page, () => window.audioProbe.starts)).toBe(0);
  await expect(page.getByRole('button', { name: 'MUTE SIREN', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toContainText('SYNTHETIC AUDIO TEST');
});

test('a queue outage cancels a pending ordinary-gesture activation', async ({ page }) => {
  const arrive = await setup(page, 'held');
  await arrive();
  await page.getByRole('heading', { name: 'Outstanding report', exact: true }).click();
  await expect.poll(() => inspectPage(page, () => window.audioProbe.resumes)).toBe(1);
  await arrive.outage();
  await inspectPage(page, () => window.audioProbe.release?.());
  await expect.poll(() => inspectPage(page, () => window.audioProbe.ready?.())).toBe(true);
  expect(await inspectPage(page, () => window.audioProbe.starts)).toBe(0);
});

test('muting and Logout do not themselves arm audio', async ({ page }) => {
  const arrive = await setup(page);
  await arrive();
  await page.getByRole('button', { name: 'Mute alert', exact: true }).click();
  expect(await inspectPage(page, () => window.audioProbe.contexts)).toBe(0);
  await arrive.clear();
  await page.route('**/api/auth/v1/logout', route => route.fulfill({ json: { message: 'Synthetic logout' } }));
  await page.getByRole('button', { name: 'Logout', exact: true }).click();
  await expect(page).not.toHaveURL(/\/admin\/main-dashboard/);
  expect(await inspectPage(page, () => localStorage.getItem('emergency-admin-sound-v1:admin:ADMIN:MAIN'))).toBeNull();
});

test('hidden interaction stays unarmed until the already activated document is visible', async ({ page }) => {
  await setup(page);
  await inspectPage(page, () => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await inspectPage(page, () => document.dispatchEvent(new Event('visibilitychange')));
  expect(await inspectPage(page, () => window.audioProbe.contexts)).toBe(0);
  await inspectPage(page, () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => inspectPage(page, () => window.audioProbe.ready?.())).toBe(true);
  expect(await inspectPage(page, () => window.audioProbe.starts)).toBe(0);
});
