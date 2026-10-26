import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
test('root layout exclusively owns recovery CSS; the client entry cannot create a second CSS chunk', async () => {
  const layout = await read('src/app/layout.tsx'), component = await read('src/components/ui/page-not-found.tsx');
  assert.match(layout, /import ["']@\/components\/ui\/page-not-found\.css["']/);
  assert.doesNotMatch(component, /import\b[^;]*\.css["']/);
  assert.doesNotMatch(layout, /page-not-found\.module\.css/);
});
test('all recovery classes/keyframes stay namespaced without changing reduced-motion or dark-mode support', async () => {
  const component = await read('src/components/ui/page-not-found.tsx'), css = await read('src/components/ui/page-not-found.css');
  const names = [...component.matchAll(/:\s*"(er-not-found-[a-z-]+)"/g)].map(match => match[1]);
  assert.equal(names.length, 12);
  for (const name of names) assert.ok(css.includes(`.${name}`), `${name} needs its stylesheet rule`);
  const classes = [...css.matchAll(/\.([a-zA-Z_-][a-zA-Z0-9_-]*)/g)].map(match => match[1]);
  assert.ok(classes.every(name => name === 'dark' || name.startsWith('er-not-found-')));
  assert.match(css, /@keyframes er-not-found-cross/); assert.doesNotMatch(css, /:global\(/);
  assert.match(css, /\.dark \.er-not-found-traveler/); assert.match(css, /prefers-reduced-motion: reduce/);
});
