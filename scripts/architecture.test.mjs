import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
function files(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap(item => {
    const path = resolve(folder, item.name);
    return item.isDirectory() ? files(path) : [path];
  });
}
test('frontend has one src app/components/hooks/types/lib tree and src aliases', () => {
  for (const folder of ['app', 'components', 'hooks', 'types', 'lib']) assert.ok(existsSync(resolve(root, 'src', folder)));
  for (const folder of ['app', 'components', 'lib']) assert.equal(existsSync(resolve(root, folder)), false);
  const config = JSON.parse(readFileSync(resolve(root, 'tsconfig.json')));
  assert.deepEqual(config.compilerOptions.paths['@/*'], ['./src/*']);
  assert.equal(JSON.parse(readFileSync(resolve(root, 'components.json'))).tailwind.css, 'src/app/globals.css');
});
test('route groups preserve the exact public URL inventory', () => {
  const routes = files(resolve(root, 'src/app')).filter(file => /[/\\]page\.tsx$/.test(file)).map(file => {
    const parts = relative(resolve(root, 'src/app'), file).replaceAll('\\', '/').split('/');
    return '/' + parts.slice(0, -1).filter(part => !/^\(.*\)$/.test(part)).join('/');
  }).sort();
  assert.deepEqual(routes, ['/', '/admin/alerts', '/admin/analytics', '/admin/barangay-history', '/admin/drrmo-dashboard', '/admin/fire-dashboard', '/admin/main-dashboard', '/admin/medical-dashboard', '/admin/operations', '/admin/police-dashboard', '/admin/users', '/dashboard', '/login', '/settings']);
  assert.equal(new Set(routes).size, routes.length);
  assert.ok(existsSync(resolve(root, 'src/app/layout.tsx')));
  assert.ok(existsSync(resolve(root, 'src/app/not-found.tsx')));
});
test('components/hooks/client utilities cannot import route implementation or server transport', () => {
  for (const folder of ['components', 'hooks', 'lib', 'types']) {
    for (const file of files(resolve(root, 'src', folder)).filter(file => /\.(?:tsx?|mjs)$/.test(file))) {
      const text = readFileSync(file, 'utf8');
      const refs = ts.preProcessFile(text, true, true).importedFiles;
      for (const ref of refs) {
        assert.doesNotMatch(ref.fileName, /^@\/(?:app|server|gateway|api)(?:\/|$)/, relative(root, file));
        const path = ref.fileName.startsWith('.') ? resolve(file, '..', ref.fileName) : ref.fileName.startsWith('@/') ? resolve(root, 'src', ref.fileName.slice(2)) : undefined;
        if (path) assert.ok(!path.startsWith(resolve(root, 'src/app') + '/') && !path.startsWith(resolve(root, 'src/app') + '\\'), relative(root, file));
      }
    }
  }
});
test('App Router stays static; platform gateway and worker stay outside browser source', () => {
  assert.match(readFileSync(resolve(root, 'next.config.ts'), 'utf8'), /output:\s*["']export["']/);
  assert.ok(existsSync(resolve(root, 'gateway/proxy.js')));
  assert.ok(existsSync(resolve(root, 'public/sw.js')));
  assert.equal(files(resolve(root, 'src/app')).some(file => /[/\\]route\.[jt]s$/.test(file)), false);
});
test('the admin layout still mounts the authoritative shared access boundary', () => {
  const source = readFileSync(resolve(root, 'src/app/(admin)/admin/layout.tsx'), 'utf8');
  assert.match(source, /AdminAccessBoundary/);
  assert.match(source, /<AdminAccessBoundary>\{children\}<\/AdminAccessBoundary>/);
});
