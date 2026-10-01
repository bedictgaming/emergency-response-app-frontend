import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { deploymentFailures, FIRST_PARTY_ORIGIN } from './deployment-policy.mjs';

const publicEnv = {
  NEXT_PUBLIC_API_URL: FIRST_PARTY_ORIGIN,
  NEXT_PUBLIC_PUBLIC_LAUNCH: 'true',
  NEXT_PUBLIC_PRODUCTION_VALIDATION: 'false',
  NEXT_PUBLIC_PREVIEW_ONLY: 'false',
  NEXT_PUBLIC_STAGING_TEST: 'false',
};
test('accepts explicit public and protected-validation first-party modes', () => {
  assert.deepEqual(deploymentFailures(publicEnv), []);
  assert.deepEqual(deploymentFailures({ ...publicEnv, NEXT_PUBLIC_PUBLIC_LAUNCH: 'false', NEXT_PUBLIC_PRODUCTION_VALIDATION: 'true', NEXT_PUBLIC_PREVIEW_ONLY: 'true' }), []);
});
test('rejects missing, conflicting and implicit mode flags', () => {
  assert.ok(deploymentFailures({}).length);
  for (const key of Object.keys(publicEnv)) {
    const env = { ...publicEnv }; delete env[key];
    assert.ok(deploymentFailures(env).length, key);
  }
  for (const [key, value] of [
    ['NEXT_PUBLIC_PUBLIC_LAUNCH', 'false'], ['NEXT_PUBLIC_PRODUCTION_VALIDATION', 'true'],
    ['NEXT_PUBLIC_PREVIEW_ONLY', 'true'], ['NEXT_PUBLIC_STAGING_TEST', 'true'],
    ['NEXT_PUBLIC_PREVIEW_ONLY', 'FALSE'],
  ]) assert.ok(deploymentFailures({ ...publicEnv, [key]: value }).length, key);
});
test('rejects alternate origins, credentials and API paths', () => {
  for (const url of ['https://api.invalid', 'http://localhost:8000', 'https://api-production-49dea.up.railway.app', `${FIRST_PARTY_ORIGIN}/api`, `${FIRST_PARTY_ORIGIN}?x=1`, `${FIRST_PARTY_ORIGIN}#x`, 'https://user:password@cordova-emergency-response.vercel.app']) {
    assert.ok(deploymentFailures({ ...publicEnv, NEXT_PUBLIC_API_URL: url }).length);
  }
});
test('explicit staging remains isolated and cannot use the default live command', () => {
  const staging = { ...publicEnv, NEXT_PUBLIC_API_URL: 'https://api-staging-staging-86d9.up.railway.app', NEXT_PUBLIC_PUBLIC_LAUNCH: 'false', NEXT_PUBLIC_STAGING_TEST: 'true', NEXT_PUBLIC_PREVIEW_ONLY: 'true' };
  assert.ok(deploymentFailures(staging).length);
  assert.deepEqual(deploymentFailures(staging, { allowStaging: true }), []);
  assert.ok(deploymentFailures({ ...staging, NEXT_PUBLIC_API_URL: FIRST_PARTY_ORIGIN }, { allowStaging: true }).length);
  assert.ok(deploymentFailures({ ...staging, NEXT_PUBLIC_PRODUCTION_VALIDATION: 'true' }, { allowStaging: true }).length);
});
test('default and explicit live configs preserve both proxy path forms, no-store and CSP', () => {
  const load = name => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));
  const config = load('vercel.json');
  assert.deepEqual(config, load('vercel.public.json'));
  assert.deepEqual(config, load('vercel.production-validation.json'));
  assert.equal(config.buildCommand, 'npm run deploy:build');
  assert.equal(config.framework, null);
  assert.equal(config.outputDirectory, 'out');
  assert.equal(config.rewrites, undefined);
  assert.deepEqual(config.proxy, { entrypoint: 'gateway/proxy.js', matcher: '/api/:path*' });
  assert.ok(config.headers.find(rule => rule.source === '/api/:path*').headers.some(header => header.key === 'Cache-Control' && header.value === 'no-store'));
  const csp = config.headers.find(rule => rule.source === '/(.*)').headers.find(header => header.key === 'Content-Security-Policy').value;
  assert.match(csp, /manifest-src 'self'/);
  assert.match(csp, /connect-src 'self' https:\/\/api.cloudinary.com https:\/\/nominatim.openstreetmap.org;/);
  assert.doesNotMatch(csp, /api.invalid|unsafe-eval/);
});
test('Vercel prebuild enforces the deployment gate even with a build-command override', () => {
  const prebuild = readFileSync(new URL('./validation-preflight.mjs', import.meta.url), 'utf8');
  assert.match(prebuild, /process\.env\.VERCEL === '1'/);
  assert.match(prebuild, /import\('\.\/deployment-policy\.mjs'\)/);
  assert.match(prebuild, /deploymentFailures\(process\.env/);
});
function runGate(script, env) {
  return spawnSync(process.execPath, [script], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    env: { ...process.env, NODE_ENV: 'test', __NEXT_PROCESSED_ENV: 'true', ...env },
    encoding: 'utf8', timeout: 10000,
  });
}
test('deployment CLI accepts both live modes', () => {
  for (const env of [publicEnv, { ...publicEnv, NEXT_PUBLIC_PUBLIC_LAUNCH: 'false', NEXT_PUBLIC_PRODUCTION_VALIDATION: 'true', NEXT_PUBLIC_PREVIEW_ONLY: 'true' }]) {
    const result = runGate('scripts/deployment-preflight.mjs', env);
    assert.equal(result.status, 0, result.stderr);
  }
});
test('deployment CLI exits nonzero for missing flags or a direct backend', () => {
  for (const env of [{ ...publicEnv, NEXT_PUBLIC_PUBLIC_LAUNCH: '' }, { ...publicEnv, NEXT_PUBLIC_API_URL: 'https://api-production-49dea.up.railway.app' }]) {
    const result = runGate('scripts/deployment-preflight.mjs', env);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Deployment blocked/);
  }
});
test('overridden Vercel build still fails closed at prebuild', () => {
  assert.equal(runGate('scripts/validation-preflight.mjs', { ...publicEnv, VERCEL: '1', NEXT_PUBLIC_PUBLIC_LAUNCH: '' }).status, 1);
  assert.equal(runGate('scripts/validation-preflight.mjs', { ...publicEnv, VERCEL: '1' }).status, 0);
});
