import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { prepareSubmission, submissionFixture, submittedIncident } from './helpers/report-submission';
test.use({ serviceWorkers: 'block' });

test('controlled pre-change baseline: confirmed save still waits for the list refresh', async ({ page }, info) => {
  test.skip(process.env.REPORT_SUBMISSION_BASELINE !== '1', 'Pre-change diagnostic only, not the optimized behavior.');
  const state = await submissionFixture(page); await prepareSubmission(page);
  await page.getByRole('button', { name: 'Submit Report', exact: true }).click();
  await expect.poll(() => state.created && state.refreshStarted).toBe(true);
  await expect(page.getByRole('dialog', { name: 'Report Emergency', exact: true })).toBeVisible();
  // Deliberate diagnostic hold, not a production performance claim.
  await new Promise(resolve => setTimeout(resolve, 1500));
  await expect(page.getByRole('dialog', { name: 'Report Emergency', exact: true })).toBeVisible();
  state.releaseRefresh(); await expect(page.getByRole('dialog', { name: 'Report Emergency', exact: true })).toHaveCount(0);
  await info.attach('controlled-baseline', { body: JSON.stringify({ blockedByRefresh: true, artificialHoldMs: 1500, confirmationToCloseMs: Date.now() - state.commitAt }), contentType: 'application/json' });
  expect(state.createCalls).toBe(1);
});

const dialogName = { name: 'Report Emergency', exact: true } as const;
const successText = 'Report received. Check Your reports for department updates.';

for (const device of [{ width: 1280, theme: 'light' }, { width: 390, theme: 'dark' }]) {
  test(`confirmed receipt closes before the held refresh, ${device.width}px ${device.theme}`, async ({ page }, info) => {
    await page.setViewportSize({ width: device.width, height: 900 });
    const state = await submissionFixture(page); state.holdUpload = true; state.holdCreate = true;
    await page.addInitScript(theme => localStorage.setItem('emergency-response-theme', theme), device.theme);
    await prepareSubmission(page);
    const submit = page.getByRole('button', { name: 'Submit Report', exact: true });
    await submit.click();
    await expect(page.getByText('Uploading your proof photo…', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Report Emergency', exact: true })).toBeVisible();
    const close = await page.getByRole('dialog', dialogName).getByRole('button', { name: 'Close', exact: true }).boundingBox();
    const progress = await page.getByRole('status').filter({ hasText: 'Uploading your proof photo' }).boundingBox();
    expect(close && progress && close.y + close.height <= progress.y).toBeTruthy();
    expect(state.createCalls).toBe(0);
    await expect(submit).toBeDisabled();
    await page.screenshot({ path: info.outputPath(`upload-${device.width}.png`) });
    state.releaseUpload();
    await expect(page.getByText('Verifying the photo and saving your report…', { exact: true })).toBeVisible();
    await expect(page.getByText(successText, { exact: true })).toHaveCount(0);
    expect(state.createCalls).toBe(1);
    state.releaseCreate();
    await expect(page.getByRole('dialog', dialogName)).toHaveCount(0);
    const confirmationToCloseMs = Date.now() - state.commitAt;
    await expect(page.getByText(successText, { exact: true })).toBeVisible();
    await expect(page.getByText(successText, { exact: true })).toBeFocused();
    await expect(page.locator(`#citizen-report-${submittedIncident.incidentId}`)).toHaveCount(1);
    await expect.poll(() => state.refreshStarted).toBe(true);
    // Background GET remains held: the receipt is already visible and no POST is replayed.
    await page.screenshot({ path: info.outputPath(`receipt-${device.width}.png`) });
    await writeFile(info.outputPath('controlled-after.json'), JSON.stringify({ blockedByRefresh: false, confirmationToCloseMs }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    state.releaseRefresh();
    await expect(page.locator(`#citizen-report-${submittedIncident.incidentId}`)).toHaveCount(1);
    expect(state.order).toEqual(['nearby', 'signature', 'upload', 'save']);
    expect(state.createCalls).toBe(1);
    const measures = await page.evaluate(() => performance.getEntriesByType('measure').filter(item => item.name.startsWith('citizen-report:')).map(item => ({ name: item.name, duration: item.duration, detail: (item as PerformanceMeasure).detail })));
    expect(measures.some(item => item.name === 'citizen-report:submit-to-confirm')).toBe(true);
    expect(measures.every(item => item.duration >= 0 && item.detail === null)).toBe(true);
  });
}

test('failed background refresh keeps the confirmed receipt, without retrying creation', async ({ page }) => {
  const state = await submissionFixture(page); state.holdRefresh = false; state.refreshFailed = true;
  await prepareSubmission(page); await page.getByRole('button', { name: 'Submit Report', exact: true }).click();
  await expect(page.getByText(successText, { exact: true })).toBeVisible();
  await expect(page.locator(`#citizen-report-${submittedIncident.incidentId}`)).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Retry reports', exact: true })).toBeVisible();
  expect(state.createCalls).toBe(1);
});

test('late pre-save read cannot erase the server-confirmed receipt', async ({ page }) => {
  const state = await submissionFixture(page); state.holdOldRead = true;
  await prepareSubmission(page); await expect.poll(() => state.oldReadStarted).toBe(true);
  await page.getByRole('button', { name: 'Submit Report', exact: true }).click();
  await expect(page.getByText(successText, { exact: true })).toBeVisible();
  await expect.poll(() => state.refreshStarted).toBe(true);
  state.releaseOld();
  await expect(page.locator(`#citizen-report-${submittedIncident.incidentId}`)).toHaveCount(1);
  state.releaseRefresh();
});

test('failed upload preserves the draft and the retry submits exactly once', async ({ page }) => {
  const state = await submissionFixture(page); state.uploadFailed = true;
  await prepareSubmission(page); await page.getByRole('button', { name: 'Submit Report', exact: true }).click();
  await expect(page.getByText('Photo upload failed: Secure image upload failed', { exact: true })).toBeVisible();
  expect(state.createCalls).toBe(0); expect(state.fallbackCalls).toBe(0);
  await expect(page.getByLabel('Description of Incident')).toHaveValue('Synthetic controlled report, not a real emergency.');
  state.uploadFailed = false;
  await page.getByRole('button', { name: 'Submit Report', exact: true }).click();
  await expect(page.getByText(successText, { exact: true })).toBeVisible();
  expect(state.createCalls).toBe(1); state.releaseRefresh();
});

for (const failure of ['conflict', 'unconfirmed', 'network'] as const) {
  test(`${failure} creation response never invents success or retries POST`, async ({ page }) => {
    const state = await submissionFixture(page);
    state.createFailed = failure === 'conflict'; state.invalidReceipt = failure === 'unconfirmed'; state.networkCreateFailed = failure === 'network';
    await prepareSubmission(page); await page.getByRole('button', { name: 'Submit Report', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: failure === 'conflict' ? 'Synthetic conflict' : 'Check Your reports' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit Report', exact: true })).toBeEnabled();
    await expect(page.getByText(successText, { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Description of Incident')).toHaveValue('Synthetic controlled report, not a real emergency.');
    expect(state.createCalls).toBe(1); state.releaseRefresh();
  });
}

test('account change during upload aborts without fallback, creation or a stale receipt', async ({ page }) => {
  const state = await submissionFixture(page); state.holdUpload = true;
  await prepareSubmission(page); await page.getByRole('button', { name: 'Submit Report', exact: true }).click();
  await expect.poll(() => state.uploaded).toBe(1);
  await page.evaluate(() => {
    localStorage.setItem('user', JSON.stringify({ id: 'another-account', role: 'USER' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'user', newValue: localStorage.getItem('user') }));
  });
  await expect(page.getByRole('button', { name: 'Submit Report', exact: true })).toBeEnabled();
  state.releaseUpload();
  await expect(page.getByText(successText, { exact: true })).toHaveCount(0);
  expect(state.createCalls).toBe(0); expect(state.fallbackCalls).toBe(0);
});

test('late save after a session-generation change cannot insert a stale receipt', async ({ page }) => {
  const state = await submissionFixture(page); state.holdCreate = true;
  await prepareSubmission(page); await page.getByRole('button', { name: 'Submit Report', exact: true }).click();
  await expect.poll(() => state.createCalls).toBe(1);
  await page.evaluate(() => {
    localStorage.setItem('emergency-session-generation', 'replacement-generation');
    window.dispatchEvent(new StorageEvent('storage', { key: 'emergency-session-generation', newValue: 'replacement-generation' }));
  });
  await expect(page.getByRole('button', { name: 'Submit Report', exact: true })).toBeEnabled();
  state.releaseCreate();
  await expect.poll(() => state.created).toBe(true);
  await expect(page.getByText(successText, { exact: true })).toHaveCount(0);
  await expect(page.locator(`#citizen-report-${submittedIncident.incidentId}`)).toHaveCount(0);
  expect(state.refreshStarted).toBe(false);
});

test('third-report deactivation keeps the existing logout outcome without post-save reads', async ({ page }) => {
  const state = await submissionFixture(page); state.deactivate = true;
  await prepareSubmission(page); await page.getByRole('button', { name: 'Submit Report', exact: true }).click();
  await expect(page).toHaveURL(/login\?error=report_sequence_limit/);
  expect(state.created).toBe(true); expect(state.createCalls).toBe(1); expect(state.refreshStarted).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('user'))).toBeNull();
});

test('direct upload deadline releases the form without a fallback or report creation', async ({ page }) => {
  const state = await submissionFixture(page); state.holdUpload = true;
  await prepareSubmission(page); await page.clock.install();
  await page.getByRole('button', { name: 'Submit Report', exact: true }).click();
  await expect.poll(() => state.uploaded).toBe(1);
  await page.clock.runFor(60_100);
  await expect(page.getByRole('alert').filter({ hasText: 'Photo upload timed out' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit Report', exact: true })).toBeEnabled();
  expect(state.createCalls).toBe(0); expect(state.fallbackCalls).toBe(0); state.releaseUpload();
});
