import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import adapter from '../vendor/eslint-plugin-next/dist/utils/native-root-glob.cjs';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('..', import.meta.url));
const slash = value => value.replaceAll('\\', '/');

test('directory glob preserves literal, wildcard, brace, array and default Next roots', async t => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'next-root-glob-test-'));
  t.after(async () => {
    assert.equal(path.dirname(temporary), path.resolve(os.tmpdir()));
    assert.ok(path.basename(temporary).startsWith('next-root-glob-test-'));
    await rm(temporary, { recursive: true });
  });
  const a = path.join(temporary, 'apps', 'one'), b = path.join(temporary, 'apps', 'two');
  await mkdir(a, { recursive: true }); await mkdir(b, { recursive: true });
  await writeFile(path.join(temporary, 'apps', 'not-a-directory'), 'synthetic');
  const options = { onlyDirectories: true };
  assert.deepEqual(adapter.globSync(a, options), [slash(a)]);
  assert.deepEqual(adapter.globSync(path.join(temporary, 'apps', '*'), options).sort(), [slash(a), slash(b)].sort());
  assert.deepEqual(adapter.globSync(slash(path.join(temporary, 'apps')) + '/{one,two}', options).sort(), [slash(a), slash(b)].sort());
  const { getRootDirs } = require('@next/eslint-plugin-next/dist/utils/get-root-dirs.js');
  assert.deepEqual(getRootDirs({ cwd: temporary, settings: {} }), [temporary]);
  assert.deepEqual(getRootDirs({ cwd: temporary, settings: { next: { rootDir: [a, b, 123] } } }), [slash(a), slash(b)]);
  assert.deepEqual(getRootDirs({ cwd: temporary, settings: { next: { rootDir: path.join(temporary, 'apps', '*') } } }).sort(), [slash(a), slash(b)].sort());
});

test('rejects unsupported glob APIs/options and excessive nesting rather than disabling lint', () => {
  assert.throws(() => adapter.globSync('*', {}), /OPTIONS_UNSUPPORTED/);
  assert.throws(() => adapter.globSync('*', { onlyDirectories: true, cwd: '/' }), /OPTIONS_UNSUPPORTED/);
  assert.throws(() => adapter.globSync('{'.repeat(33) + 'a' + '}'.repeat(33), { onlyDirectories: true }), /DEPTH_EXCEEDED/);
  assert.throws(() => adapter.globSync('x'.repeat(4097), { onlyDirectories: true }), /PATTERN_INVALID/);
  assert.deepEqual(Object.keys(adapter), ['globSync']);
});

test('pins the upstream consumer and resolves its override to the reviewed project adapter', async () => {
  const manifest = require('@next/eslint-plugin-next/package.json');
  assert.equal(manifest.version, '16.3.8-cordova-native.1');
  assert.equal(manifest.dependencies['fast-glob'], undefined);
  const consumer = require.resolve('@next/eslint-plugin-next/dist/utils/get-root-dirs.js');
  const source = await readFile(consumer, 'utf8');
  assert.ok(source.includes('require("./native-root-glob.cjs")'));
  assert.ok(source.includes('onlyDirectories: true'));
  const installed = createRequire(consumer)('./native-root-glob.cjs');
  assert.equal(installed.globSync.toString(), adapter.globSync.toString());
  const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json'), 'utf8'));
  assert.ok(!Object.keys(lock.packages).some(key => key.endsWith('/braces') || key.endsWith('/micromatch') || key.endsWith('/fast-glob')));
  assert.equal(lock.packages['node_modules/follow-redirects'].version, '1.16.1');
});

test('every upstream rule/config byte is preserved in the installed local fork', async () => {
  const provenance = JSON.parse(await readFile(path.join(root, 'vendor/eslint-plugin-next/UPSTREAM.json'), 'utf8'));
  assert.equal(provenance.version, '16.3.8');
  assert.equal(provenance.integrity, 'sha512-eCR9RcLTZrVS+K3+VOhi0xMdUUGNuriCHHhU1ZoABC/QQ/Gp0OWbLKQxV2/9DkmihYdYRcQWFmZXW8M1AMUXYw==');
  const installed = path.dirname(require.resolve('@next/eslint-plugin-next/package.json'));
  for (const row of provenance.files) {
    if (row.file === 'package.json') continue; // explicit local version/dependency changes
    let bytes = await readFile(path.join(installed, row.file));
    if (row.file === 'dist/utils/get-root-dirs.js') bytes = Buffer.from(bytes.toString('utf8').replace('require("./native-root-glob.cjs")', 'require("fast-glob")'));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256, row.file);
  }
});

test('all effective ESLint rule severities/options, plugins and parsers match the original toolchain', async () => {
  const { ESLint } = require('eslint'); const lint = new ESLint({ cwd: root });
  const plugins = ['@', '@next/next', '@typescript-eslint', 'import', 'jsx-a11y', 'react', 'react-hooks'];
  for (const [file, count, sha] of [
    ['src/app/page.tsx', 113, '0ffe7eec3e37daca318b271e06d5bc631decd391478d768d625487ea4ea276fe'],
    ['src/lib/apiClient.ts', 113, '0ffe7eec3e37daca318b271e06d5bc631decd391478d768d625487ea4ea276fe'],
    ['gateway/proxy.js', 90, '338ebee4371680f9634f1ed76d0802d8fb92988a0f011ef10a0fea618fdd0fb5'],
    ['scripts/check-dependency-audit.mjs', 90, '338ebee4371680f9634f1ed76d0802d8fb92988a0f011ef10a0fea618fdd0fb5'],
  ]) {
    const config = await lint.calculateConfigForFile(file);
    const rules = Object.fromEntries(Object.entries(config.rules).sort(([a], [b]) => a.localeCompare(b)));
    assert.equal(Object.keys(rules).length, count, file);
    assert.equal(createHash('sha256').update(JSON.stringify(rules)).digest('hex'), sha, file);
    assert.deepEqual(Object.keys(config.plugins).sort(), plugins, file);
    assert.equal(config.languageOptions.parser.meta.name, 'typescript-eslint/parser', file);
  }
});

test('the unchanged Next internal-link rule still flags a real App Router internal anchor', async () => {
  const { ESLint } = require('eslint'); const lint = new ESLint({ cwd: root });
  const [result] = await lint.lintText('export default function Example(){return <a href="/">Home</a>}', { filePath: 'src/components/LintGuardFixture.tsx' });
  assert.ok(result.messages.some(message => message.ruleId === '@next/next/no-html-link-for-pages'), JSON.stringify(result.messages));
});
