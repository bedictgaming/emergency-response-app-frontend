import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { deploymentBuildEnvironment, deploymentFailures, stagingGatewayOrigin, FIRST_PARTY_ORIGIN } from './deployment-policy.mjs';

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
const gatewayStage = {
  ...publicEnv, NEXT_PUBLIC_API_URL: '', NEXT_PUBLIC_PUBLIC_LAUNCH: 'false',
  NEXT_PUBLIC_STAGING_TEST: 'true', NEXT_PUBLIC_PREVIEW_ONLY: 'true', EMERGENCY_STAGING_GATEWAY: 'true',
  VERCEL: '1', VERCEL_ENV: 'preview', VERCEL_PROJECT_ID: 'prj_EoB1SDCIdo2thmzHpsJb1kQmuDtO',
  VERCEL_URL: 'emergency-response-synthetic-benedict-mequiabas-projects.vercel.app',
  API_GATEWAY_UPSTREAM: 'https://api-staging-staging-86d9.up.railway.app',
  API_GATEWAY_AUDIENCE: 'emergency-response-staging-v1',
};
test('first-party staging freezes only its own deployment origin with explicit isolated identity', () => {
  const env = deploymentBuildEnvironment(gatewayStage);
  assert.equal(env.NEXT_PUBLIC_API_URL, `https://${gatewayStage.VERCEL_URL}`);
  assert.equal(gatewayStage.NEXT_PUBLIC_API_URL, '');
  assert.deepEqual(deploymentFailures(env, { allowStaging: true }), []);
  assert.ok(deploymentFailures(env).length);
  assert.deepEqual(deploymentBuildEnvironment(publicEnv), publicEnv);
  assert.deepEqual(deploymentBuildEnvironment({ ...publicEnv, EMERGENCY_STAGING_GATEWAY: 'false' }), { ...publicEnv, EMERGENCY_STAGING_GATEWAY: 'false' });
});
test('staging origin derivation rejects other projects, production, missing identity and external hosts', () => {
  for (const patch of [
    { VERCEL: '' }, { VERCEL_ENV: 'production' }, { VERCEL_PROJECT_ID: 'another-project' },
    { VERCEL_URL: 'cordova-emergency-response.vercel.app' }, { VERCEL_URL: 'attacker.vercel.app' },
    { VERCEL_URL: gatewayStage.VERCEL_URL + '/path' }, { VERCEL_URL: gatewayStage.VERCEL_URL + '?x=1' },
    { VERCEL_URL: 'https://' + gatewayStage.VERCEL_URL }, { VERCEL_URL: '' },
    { API_GATEWAY_UPSTREAM: 'https://api-production-49dea.up.railway.app' },
    { API_GATEWAY_AUDIENCE: 'emergency-response-production-v1' },
  ]) {
    const env = { ...gatewayStage, ...patch };
    assert.equal(stagingGatewayOrigin(env), undefined);
    assert.throws(() => deploymentBuildEnvironment(env));
    assert.ok(deploymentFailures(env, { allowStaging: true }).length);
  }
});
test('staging flags never relax production or legacy direct-API origin checks', () => {
  const env = deploymentBuildEnvironment(gatewayStage);
  for (const patch of [
    { NEXT_PUBLIC_API_URL: FIRST_PARTY_ORIGIN },
    { NEXT_PUBLIC_API_URL: gatewayStage.API_GATEWAY_UPSTREAM },
    { NEXT_PUBLIC_PUBLIC_LAUNCH: 'true' }, { NEXT_PUBLIC_PRODUCTION_VALIDATION: 'true' },
    { NEXT_PUBLIC_PREVIEW_ONLY: 'false' }, { NEXT_PUBLIC_STAGING_TEST: 'false' },
    { EMERGENCY_STAGING_GATEWAY: 'TRUE' },
  ]) assert.ok(deploymentFailures({ ...env, ...patch }, { allowStaging: true }).length);
  assert.ok(deploymentFailures({ ...publicEnv, EMERGENCY_STAGING_GATEWAY: 'true' }, { allowStaging: true }).length);
});
test('the build wrapper blocks invalid configuration before any build process starts', () => {
  const invalid = runGate('scripts/deploy-build.mjs', { ...publicEnv, NEXT_PUBLIC_PUBLIC_LAUNCH: '' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Deployment blocked/);
  const code = readFileSync(new URL('./deploy-build.mjs', import.meta.url), 'utf8');
  assert.match(code, /scripts\/deployment-preflight\.mjs/);
  assert.match(code, /scripts\/validation-preflight\.mjs/);
  assert.match(code, /node_modules\/next\/dist\/bin\/next/);
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
