import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SEO_ORIGIN, SEO_NAME, SEO_TITLE, SEO_DESCRIPTION, SEO_IMAGE } from '../src/lib/seo-policy.mjs';

function meta(html, key) {
  return [...html.matchAll(/<meta\b[^>]*>/g)].filter(match => match[0].includes(`name="${key}"`) || match[0].includes(`property="${key}"`))
    .map(match => match[0].match(/content="([^"]*)"/)?.[1]);
}
export async function checkSeoExport(folder, mode) {
  assert.ok(['public', 'private'].includes(mode), 'Specify public or private indexing mode');
  const root = resolve(folder), html = await readFile(resolve(root, 'index.html'), 'utf8');
  assert.ok(html.includes(`<title>${SEO_TITLE}</title>`));
  assert.deepEqual(meta(html, 'description'), [SEO_DESCRIPTION]);
  const canonical = [...html.matchAll(/<link\b[^>]*rel="canonical"[^>]*>/g)].map(match => new URL(match[0].match(/href="([^"]*)"/)[1]).href);
  // Next normalizes the homepage slash; compare full URL semantics, not markup.
  assert.deepEqual(canonical, [SEO_ORIGIN + '/']);
  assert.deepEqual(meta(html, 'og:url').map(value => new URL(value).href), [SEO_ORIGIN + '/']);
  assert.deepEqual(meta(html, 'og:site_name'), [SEO_NAME]);
  assert.deepEqual(meta(html, 'og:image'), [SEO_ORIGIN + SEO_IMAGE]);
  assert.deepEqual(meta(html, 'twitter:image'), [SEO_ORIGIN + SEO_IMAGE]);
  assert.deepEqual(meta(html, 'twitter:card'), ['summary_large_image']);
  const directives = meta(html, 'robots');
  assert.equal(directives.length, 1);
  assert.equal(directives[0].includes('noindex'), mode !== 'public');
  const schemas = [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs)].map(match => JSON.parse(match[1]));
  assert.equal(schemas.length, mode === 'public' ? 1 : 0);
  if (schemas.length) { assert.equal(schemas[0]['@type'], 'WebSite'); assert.equal(schemas[0].url, SEO_ORIGIN + '/'); }
  const sitemap = await readFile(resolve(root, 'sitemap.xml'), 'utf8');
  assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => match[1]), mode === 'public' ? [SEO_ORIGIN + '/'] : []);
  assert.ok(!sitemap.includes('<lastmod>'));
  const robots = await readFile(resolve(root, 'robots.txt'), 'utf8');
  assert.ok(robots.includes('Allow: /'));
  assert.equal(robots.includes(`Sitemap: ${SEO_ORIGIN}/sitemap.xml`), mode === 'public');
  for (const path of ['login', 'dashboard', 'settings', 'admin/main-dashboard', 'admin/fire-dashboard', 'admin/medical-dashboard', 'admin/police-dashboard', 'admin/drrmo-dashboard', 'admin/analytics', 'admin/alerts', 'admin/operations', 'admin/users', 'admin/barangay-history', '404']) {
    const shell = await readFile(resolve(root, path + '.html'), 'utf8');
    assert.ok(meta(shell, 'robots').some(value => value.includes('noindex')), path);
    assert.ok(!shell.includes('application/ld+json'), path);
    assert.ok(!shell.includes('rel="canonical"'), path);
  }
  const bytes = await readFile(resolve(root, '.' + SEO_IMAGE));
  assert.equal(bytes.readUInt32BE(16), 1200); assert.equal(bytes.readUInt32BE(20), 630);
  // Every shipped page other than the explicit public homepage is fail-closed.
  const pages = [];
  async function scan(dir) { for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== '_next') await scan(resolve(dir, entry.name));
    else if (entry.isFile() && entry.name.endsWith('.html')) pages.push(resolve(dir, entry.name));
  } }
  await scan(root);
  for (const path of pages.filter(path => path !== resolve(root, 'index.html'))) {
    const page = await readFile(path, 'utf8');
    assert.ok(meta(page, 'robots').some(value => value.includes('noindex')), relative(root, path));
  }
  return { passed: true, mode, checkedProtectedRoutes: 14, exportedHtml: pages.length, privateData: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(await checkSeoExport(process.argv[2] || 'out', process.argv[3]))); }
  catch (error) { console.error('SEO export check failed: ' + error.message); process.exitCode = 1; }
}
