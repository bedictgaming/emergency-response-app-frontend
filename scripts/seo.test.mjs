import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SEO_ORIGIN, SEO_IMAGE, SEO_NAME, shouldIndexPublicSite, robotsPolicy, sitemapPolicy, websiteSchema, serializeJsonLd } from '../src/lib/seo-policy.mjs';

const publicBuild = {
  NODE_ENV: 'production', NEXT_PUBLIC_API_URL: SEO_ORIGIN,
  NEXT_PUBLIC_PUBLIC_LAUNCH: 'true', NEXT_PUBLIC_PRODUCTION_VALIDATION: 'false',
  NEXT_PUBLIC_PREVIEW_ONLY: 'false', NEXT_PUBLIC_STAGING_TEST: 'false',
};
test('only explicit canonical public production builds opt into indexing', () => {
  assert.equal(shouldIndexPublicSite(publicBuild), true);
  assert.equal(shouldIndexPublicSite({ ...publicBuild, NEXT_PUBLIC_API_URL: SEO_ORIGIN + '/' }), true);
  assert.equal(shouldIndexPublicSite({}), false);
  for (const key of Object.keys(publicBuild)) {
    const env = { ...publicBuild }; delete env[key];
    assert.equal(shouldIndexPublicSite(env), false, key);
  }
});
for (const [name, change] of [
  ['local', { NODE_ENV: 'development' }], ['private', { NEXT_PUBLIC_PUBLIC_LAUNCH: 'false' }],
  ['validation', { NEXT_PUBLIC_PRODUCTION_VALIDATION: 'true' }], ['staging', { NEXT_PUBLIC_STAGING_TEST: 'true' }],
  ['preview-flag', { NEXT_PUBLIC_PREVIEW_ONLY: 'true' }], ['preview-host', { VERCEL_ENV: 'preview' }],
  ['preview-client', { NEXT_PUBLIC_VERCEL_ENV: 'preview' }], ['foreign-origin', { NEXT_PUBLIC_API_URL: 'https://example.test' }],
  ['legacy-origin', { NEXT_PUBLIC_API_URL: 'https://cordova-emergency-response.vercel.app' }],
  ['query-origin', { NEXT_PUBLIC_API_URL: SEO_ORIGIN + '/?resetToken=synthetic' }],
]) test(`${name} build publishes no sitemap entries or structured site data`, () => {
  const env = { ...publicBuild, ...change };
  assert.equal(shouldIndexPublicSite(env), false);
  assert.deepEqual(sitemapPolicy(env), []);
  assert.equal(robotsPolicy(env).sitemap, undefined);
  assert.equal(websiteSchema(env), null);
});
test('sitemap is the exact anonymous homepage allowlist, with no fake timestamps', () => {
  assert.deepEqual(sitemapPolicy(publicBuild), [{ url: 'https://cordova-emergency-response.site/' }]);
  assert.deepEqual(Object.keys(sitemapPolicy(publicBuild)[0]), ['url']);
});
test('robots leaves noindex HTML crawlable and blocks all API prefix casing', () => {
  for (const env of [publicBuild, {}]) {
    const robots = robotsPolicy(env);
    assert.equal(robots.rules.allow, '/');
    assert.equal(robots.rules.disallow.length, 8);
    for (const path of ['/login', '/settings', '/dashboard', '/admin/main-dashboard', '/_next/static/']) {
      assert.ok(!robots.rules.disallow.some(prefix => path.startsWith(prefix)));
    }
  }
  assert.equal(robotsPolicy(publicBuild).sitemap, SEO_ORIGIN + '/sitemap.xml');
});
test('structured data describes only the real public website, not an official agency', () => {
  const schema = websiteSchema(publicBuild);
  assert.equal(schema['@type'], 'WebSite');
  assert.equal(schema.name, SEO_NAME);
  assert.equal(schema.url, SEO_ORIGIN + '/');
  for (const key of ['aggregateRating', 'review', 'address', 'telephone', 'potentialAction', 'location', 'email', 'author']) assert.equal(schema[key], undefined);
});
test('JSON-LD cannot terminate its script element', () => {
  const value = { text: '</script><img src=x onerror=alert(1)>' };
  const encoded = serializeJsonLd(value);
  assert.ok(!encoded.includes('<'));
  assert.deepEqual(JSON.parse(encoded), value);
});
test('the social card is a public PNG with the declared 1200 by 630 size', () => {
  const bytes = readFileSync(new URL('../public' + SEO_IMAGE, import.meta.url));
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16), 1200); assert.equal(bytes.readUInt32BE(20), 630);
  assert.ok(bytes.length < 1_000_000);
});
test('Vercel excludes noncanonical hosts and reset-token URLs without weakening security', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.public.json', import.meta.url)));
  const noindex = rule => rule.headers.some(header => header.key === 'X-Robots-Tag' && header.value.includes('noindex'));
  const host = config.headers.find(rule => rule.missing?.some(item => item.type === 'host'));
  assert.ok(noindex(host));
  const match = new RegExp('^(?:' + host.missing[0].value + ')$');
  assert.ok(match.test(new URL(SEO_ORIGIN).hostname));
  for (const value of ['localhost', 'emergency-response-preview.vercel.app', 'cordova-emergency-response.vercel.app', 'cordova-emergency-responseXsite']) assert.ok(!match.test(value));
  assert.ok(config.headers.some(rule => rule.has?.some(item => item.type === 'query' && item.key === 'resetToken') && noindex(rule)));
  const global = config.headers.find(rule => rule.source === '/(.*)' && !rule.has && !rule.missing);
  assert.ok(global.headers.some(header => header.key === 'Content-Security-Policy' && header.value.includes("connect-src 'self'")));
  assert.ok(config.headers.find(rule => rule.source === '/api/:path*').headers.some(header => header.key === 'Cache-Control' && header.value === 'no-store'));
});
