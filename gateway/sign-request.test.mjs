import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { signGatewayRequest } from './sign-request.mjs';
import proxy from './proxy.js';
import { gatewayTarget } from './runtime-policy.mjs';

const secret = 'gateway-unit-test-secret-not-a-credential';
const audience = 'emergency-response-staging-v1';
const now = 1790800000000;
const nonce = '1'.repeat(32);
test('canonical signature preserves raw API query, credentials and origin; replaces supplied proof', () => {
  const request = new Request('https://example.invalid/api/incidents/v1/?limit=5&x=a%2Fb', {
    headers: { cookie: 'synthetic-session', origin: 'https://example.invalid', 'x-er-gateway-signature': 'forged', 'x-er-gateway-extra': 'forged' },
  });
  const signed = signGatewayRequest(request, { secret, audience, ip: '192.0.2.10', now, nonce });
  const payload = JSON.stringify(['er-api-gateway-v1', audience, String(now), nonce, 'GET',
    '/api/incidents/v1/?limit=5&x=a%2Fb', '192.0.2.10', 'synthetic-session', '', 'https://example.invalid', '', '']);
  assert.equal(signed.get('x-er-gateway-signature'), createHmac('sha256', secret).update(payload).digest('hex'));
  assert.equal(signed.has('x-er-gateway-extra'), false);
  assert.equal(signed.get('cookie'), 'synthetic-session');
  assert.equal(request.headers.get('x-er-gateway-signature'), 'forged');
});
test('refuses invalid client IPs, weak configuration and non-API paths', () => {
  const req = new Request('https://example.invalid/api/check');
  for (const patch of [{ secret: 'short' }, { audience: '' }, { ip: '192.0.2.1, 192.0.2.2' }, { ip: undefined }]) {
    assert.throws(() => signGatewayRequest(req, { secret, audience, ip: '192.0.2.10', now, nonce, ...patch }));
  }
  assert.throws(() => signGatewayRequest(new Request('https://example.invalid/'), { secret, audience, ip: '192.0.2.10', now, nonce }));
});
test('uses a fresh nonce for every invocation', () => {
  const req = new Request('https://example.invalid/api/check');
  const opts = { secret, audience, ip: '192.0.2.10' };
  assert.notEqual(signGatewayRequest(req, opts).get('x-er-gateway-nonce'), signGatewayRequest(req, opts).get('x-er-gateway-nonce'));
});
test('staging entrypoint refuses localhost or missing platform configuration', () => {
  const res = proxy(new Request('https://example.invalid/api/check'));
  assert.equal(res.status, 503); assert.equal(res.headers.get('cache-control'), 'no-store');
});
test('runtime policy binds production and staging destinations to their deployment identities', () => {
  const stage = { VERCEL: '1', VERCEL_ENV: 'preview', API_GATEWAY_UPSTREAM: 'https://api-staging-staging-86d9.up.railway.app', API_GATEWAY_AUDIENCE: audience };
  const prod = { VERCEL: '1', VERCEL_ENV: 'production', API_GATEWAY_UPSTREAM: 'https://api-production-49dea.up.railway.app', API_GATEWAY_AUDIENCE: 'emergency-response-production-v1' };
  assert.equal(gatewayTarget(stage).audience, audience);
  assert.equal(gatewayTarget(prod).audience, prod.API_GATEWAY_AUDIENCE);
  for (const invalid of [
    { ...prod, VERCEL_ENV: 'preview' }, { ...stage, VERCEL_ENV: 'production' },
    { ...prod, VERCEL: '' }, { ...stage, API_GATEWAY_AUDIENCE: prod.API_GATEWAY_AUDIENCE },
    { ...prod, API_GATEWAY_UPSTREAM: 'https://example.invalid' },
    { ...prod, API_GATEWAY_UPSTREAM: prod.API_GATEWAY_UPSTREAM + '/api' },
    { ...prod, API_GATEWAY_UPSTREAM: prod.API_GATEWAY_UPSTREAM + '?target=other' },
  ]) assert.throws(() => gatewayTarget(invalid));
});
