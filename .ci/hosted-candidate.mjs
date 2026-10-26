// Exact pinned assertions on hosted assets/CSP; ALL private API and socket
// traffic is synthetic. Never qualifies real provider/device/backend delivery.
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
const git = 'git';
const must = (value, code) => { if (!value) throw Error(code); };
const cmd = async (program, args, options = {}) => {
  const result = spawnSync(program, args, { cwd: options.cwd, encoding: 'utf8', maxBuffer: 8_000_000 });
  must(result.status === 0, 'PINNED_GIT_SOURCE_READ_FAILED'); return result.stdout;
};
const root = process.cwd();
const runtime = root;
const applicationSha = 'c13393e5466aa49d14b8e0eeb8102cdd2c0b9e89';
const site = 'https://cordova-emergency-response.site';
const hash = value => createHash('sha256').update(value).digest('hex');
let phase = 'START';
try {
  const mode = process.argv[2]; must(['candidate', 'production'].includes(mode), 'PINNED_HOSTED_MODE_REQUIRED');
  const validationSha = (await cmd(git, ['rev-parse', 'HEAD'])).trim();
  const changed = (await cmd(git, ['diff', '--name-only', applicationSha, 'HEAD'])).trim().split('\n').sort();
  must(JSON.stringify(changed) === JSON.stringify(['.ci/hosted-candidate.mjs', '.ci/hosted-public-forwarder.mjs', '.github/workflows/ci.yml', '.github/workflows/hosted-candidate-validation.yml']), 'VALIDATION_BRANCH_APPLICATION_BYTES_MUST_BE_UNCHANGED');
  const data = { candidate: { id: 'dpl_AP6GoMfgAgGkZzcHJMX6k7X6o5WN', url: 'https://emergency-response-e8plvt0dk-benedict-mequiabas-projects.vercel.app' }, shas: { frontend: applicationSha } };
  must(data.candidate.id === 'dpl_AP6GoMfgAgGkZzcHJMX6k7X6o5WN', 'EXACT_CANDIDATE_REQUIRED');
  const origin = mode === 'candidate' ? data.candidate.url : site;
  if (mode === 'production') {
    const paths = ['/dashboard', '/admin/users', '/admin/fire-dashboard', '/privacy', '/settings'];
    for (const path of paths) {
      const assets = async host => {
        const response = await fetch(host + path, { redirect: 'error', signal: AbortSignal.timeout(20000) });
        must(response.status === 200 && response.headers.get('content-security-policy')?.includes("connect-src 'self'"), 'CANONICAL_PUBLIC_CSP_REQUIRED');
        const html = await response.text();
        return [...new Set([...html.matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]+)"/g)].map(row => new URL(row[1], host).pathname))].sort();
      };
      must(JSON.stringify(await assets(site)) === JSON.stringify(await assets(data.candidate.url)), 'CANONICAL_MUST_MATCH_PINNED_CANDIDATE');
    }
  }
  must(/^https:\/\/emergency-response-[a-z0-9]+-benedict-mequiabas-projects\.vercel\.app$/.test(data.candidate.url), 'EXACT_CANDIDATE_HOST_REQUIRED');
  const installed = JSON.parse(await readFile(runtime + '/node_modules/@playwright/test/package.json', 'utf8'));
  const lock = JSON.parse(await readFile(root + '/package-lock.json', 'utf8'));
  must(installed.version === lock.packages['node_modules/@playwright/test'].version
    && hash(await readFile(runtime + '/package-lock.json')) === hash(await readFile(root + '/package-lock.json')), 'EXACT_QUALIFIED_BROWSER_RUNTIME_REQUIRED');
  await mkdir(root + '/.hosted-validation', { recursive: false });
  const folder = await mkdtemp(root + '/.hosted-validation/' + mode + '-'), proof = [];
  const setup = `
import { forwardHostedRead } from '${root}/.ci/hosted-public-forwarder.mjs';
const assetForwarders = new WeakMap();
test.beforeEach(async ({ context }) => {
  const pending = new Set(); const state = { pending, closed: false };
  assetForwarders.set(context, state); context.on('close', () => { state.closed = true; });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== '${site}' || !['GET', 'HEAD'].includes(request.method())
      || /^\\/api(?:\\/|$)/i.test(decodeURIComponent(url.pathname))) return route.abort();
    const operation = (async () => {
      await forwardHostedRead(route, '${origin}' + url.pathname + url.search, '${origin}', 20000);
    })();
    pending.add(operation); try { await operation; } finally { pending.delete(operation); }
  });
  await context.routeWebSocket('**/*', peer => peer.close());
});
test.afterEach(async ({ context }) => {
  const state = assetForwarders.get(context); if (!state || state.closed) return;
  // Keep a fail-closed barrier while draining already-started public requests.
  // Do not ignore route errors, release API traffic or change test deadlines.
  await context.route('**/*', blocked => blocked.abort());
  await Promise.all([...state.pending]);
  await context.close();
});
`;
  const specs = ['nearby-intake.spec.ts', 'citizen-presence.spec.ts', 'account-safety.spec.ts', 'privacy-notice.spec.ts',
    'citizen-review-notifications.spec.ts', 'history-pagination.spec.ts', 'monthly-history.spec.ts'];
  const helpers = ['synthetic-event-stream.ts', 'quiet-event-stream.ts'];
  phase = 'EXACT_PINNED_SOURCE_BINDINGS';
  await mkdir(folder + '/helpers');
  for (const file of [...specs, ...helpers.map(file => 'helpers/' + file)]) {
    const source = await cmd(git, ['show', data.shas.frontend + ':e2e/' + file], { cwd: root });
    must(source.split("from '@playwright/test';").length === 2, 'SINGLE_TEST_RUNNER_BINDING_REQUIRED');
    let generated = source.replace("from '@playwright/test';", "from '" + runtime + "/node_modules/@playwright/test/index.js';" + (specs.includes(file) ? setup : ''));
    generated = generated.replaceAll("route => route.request().url().includes('tile.openstreetmap.org')", "route => new URL(route.request().url()).origin === '" + site + "' ? route.fallback() : route.request().url().includes('tile.openstreetmap.org')")
      .replaceAll("route => route.abort()", "route => new URL(route.request().url()).origin === '" + site + "' ? route.fallback() : route.abort()")
      .replaceAll('http://localhost:8000/api/attachments/', site + '/api/attachments/');
    await writeFile(folder + '/' + file, generated, { flag: 'wx' }); proof.push({ file, originalSha256: hash(source), generatedSha256: hash(generated) });
  }
  const config = `import { createRequire } from 'node:module';
const { defineConfig, devices } = createRequire('${runtime}/package.json')('@playwright/test');
export default defineConfig({ testDir: '${folder}', fullyParallel: false, retries: 0, workers: 1,
 reporter: [['list'], ['json', { outputFile: '${folder}/results.json' }]], outputDir: '${folder}/test-results',
 use: { baseURL: '${site}', serviceWorkers: 'block', trace: 'retain-on-failure' },
 projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }] });`;
  await writeFile(folder + '/playwright.config.mjs', config, { flag: 'wx' });
  const env = {};
  for (const key of ['PATH', 'HOME', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'XDG_CACHE_HOME']) if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, { NEXT_PUBLIC_NEARBY_REVIEW_ENABLED: 'true',
    NEXT_PUBLIC_CITIZEN_PRESENCE_ENABLED: 'true', NEXT_PUBLIC_EMERGENCY_TRANSPORT: 'socket.io', NEXT_PUBLIC_EMERGENCY_CANARY: 'false', CI: '', NODE_OPTIONS: '--max-old-space-size=2048' });
  const run = args => new Promise((accept, reject) => {
    const child = spawn(process.execPath, [runtime + '/node_modules/@playwright/test/cli.js', 'test', '--config', folder + '/playwright.config.mjs', ...args],
      { cwd: runtime, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', progress = '', completedCases = 0;
    child.stdout.on('data', part => {
      output += part; progress += part;
      const lines = progress.split('\n'); progress = lines.pop() ?? '';
      for (const line of lines) if (/^\s*(?:ok|x)\s+\d+\s+\[chromium\]/.test(line)) {
        completedCases++; if (completedCases % 10 === 0 || /^\s*x\s/.test(line))
          console.log(JSON.stringify({ mode, completedCases, result: line.trim().slice(0, 250) }));
      }
    });
    child.stderr.on('data', part => { output += part; });
    child.on('error', () => reject(Error('HOSTED_TEST_RUNNER_UNAVAILABLE'))); child.on('close', code => accept({ code, output }));
  });
  const listed = await run(['--list', '--reporter=list']);
  const expected = Number(listed.output.match(/Total: (\d+) tests? in \d+ files?/)?.[1]);
  must(listed.code === 0 && expected > 56, 'COMPLETE_EXPANDED_PINNED_TEST_PLAN_REQUIRED');
  await writeFile(folder + '/source-bindings.json', JSON.stringify({ mode, origin, candidate: data.candidate.id, sha: data.shas.frontend,
    expectedCases: expected, unchangedAssertions: true, originalSpecs: proof, noApiForwarding: true, noPrivateProductionWrites: true,
    onlyBindings: ['qualified runner path', 'strict first-party GET/HEAD asset forwarding with unchanged CSP', 'synthetic attachment origin',
      'drain active public asset forwarders before context teardown with a new-request abort barrier; no ignored errors',
      'memory reuse of hosted200 immutable cookie-free /_next/static bytes only; no HTML/API/private caching or CSP changes'] }, null, 2), { flag: 'wx' });
  phase = 'HOSTED_PINNED_FEATURE_ASSERTIONS'; console.log(JSON.stringify({ started: true, mode, expected, folder, privateProductionWrites: false }));
  const execution = await run([]); await writeFile(folder + '/confirmation.log', execution.output, { flag: 'wx' });
  const results = JSON.parse(await readFile(folder + '/results.json', 'utf8'));
  const result = { passed: execution.code === 0 && results.stats.expected === expected && results.stats.unexpected === 0 && results.stats.flaky === 0 && results.stats.skipped === 0,
    mode, candidate: data.candidate.id, sha: data.shas.frontend, validationSha, planned: expected, expected: results.stats.expected, unexpected: results.stats.unexpected,
    flaky: results.stats.flaky, skipped: results.stats.skipped, allSyntheticApiAndSocketFixtures: true, hostedAssetCspUnchanged: true,
    privateProductionWrites: false, actualDeviceGpsCertified: false, folder };
  await writeFile(folder + '/acceptance.json', JSON.stringify(result, null, 2), { flag: 'wx' });
  if (result.passed) await writeFile(root + '/.hosted-validation/acceptance.json', JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(result)); if (!result.passed) process.exitCode = 1;
} catch (error) { console.error(JSON.stringify({ failed: true, phase, reason: /^[A-Z_]{1,100}$/.test(error?.message || '') ? error.message : 'SANITIZED_HOSTED_SUITE_FAILURE' })); process.exitCode = 1; }


