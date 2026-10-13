import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_ORIGINS, resolveApiOrigin, evidenceAccessPath } from '../lib/public-origins.mjs';
import { deploymentFailures } from './deployment-policy.mjs';
const mode = { NEXT_PUBLIC_PUBLIC_LAUNCH: 'true', NEXT_PUBLIC_PRODUCTION_VALIDATION: 'false', NEXT_PUBLIC_PREVIEW_ONLY: 'false', NEXT_PUBLIC_STAGING_TEST: 'false' };
test('the single approved public site uses its own API and retains strict deployment gates', () => {
  assert.deepEqual(PUBLIC_ORIGINS, ['https://cordova-emergency-response.site']);
  for (const origin of PUBLIC_ORIGINS) {
    assert.deepEqual(deploymentFailures({ ...mode, NEXT_PUBLIC_API_URL: origin }), []);
    assert.equal(resolveApiOrigin(PUBLIC_ORIGINS[0], origin, true, false), origin);
    assert.equal(resolveApiOrigin(PUBLIC_ORIGINS[0] + '/', origin, true, false), origin);
    assert.equal(evidenceAccessPath(PUBLIC_ORIGINS[0] + '/api/attachments/v1/synthetic/content', origin), '/attachments/v1/synthetic/access-url');
  }
});
test('unknown hosts and isolated/local builds cannot select a production API from location', () => {
  for (const origin of ['https://evil.invalid', 'https://cordova-emergency-response.site.evil.invalid', 'https://www.cordova-emergency-response.site', 'https://cordova-emergency-response.vercel.app']) {
    assert.equal(resolveApiOrigin(PUBLIC_ORIGINS[0], origin, true, false), PUBLIC_ORIGINS[0]);
    assert.ok(deploymentFailures({ ...mode, NEXT_PUBLIC_API_URL: origin }).length);
    // A metadata URL can never direct the cookie-bearing request off-site.
    assert.equal(evidenceAccessPath(origin + '/api/attachments/v1/synthetic/content', PUBLIC_ORIGINS[0]), '/attachments/v1/synthetic/access-url');
  }
  assert.equal(resolveApiOrigin('http://localhost:8000', PUBLIC_ORIGINS[0], false, false), 'http://localhost:8000');
  assert.equal(resolveApiOrigin('https://staging.invalid', PUBLIC_ORIGINS[0], true, true), 'https://staging.invalid');
  assert.equal(resolveApiOrigin(PUBLIC_ORIGINS[0], undefined, true, false), PUBLIC_ORIGINS[0]);
  assert.equal(evidenceAccessPath('http://localhost:8000/api/attachments/v1/viewer-photo/content', 'http://127.0.0.1:3100'), '/attachments/v1/viewer-photo/access-url');
  for (const source of ['https://evil.invalid/other', 'https://user:password@evil.invalid/api/attachments/v1/synthetic/content', 'file:///api/attachments/v1/synthetic/content'])
    assert.throws(() => evidenceAccessPath(source, PUBLIC_ORIGINS[0]));
});
