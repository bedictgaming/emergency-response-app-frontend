// Render public branding only, with no provider, font or evidence downloads.
import { createElement as h } from 'react';
import { ImageResponse } from 'next/og.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SEO_NAME } from '../src/lib/seo-policy.mjs';

const root = resolve(import.meta.dirname, '..');
const logo = 'data:image/png;base64,' + (await readFile(resolve(root, 'public/emergency-icon.png'))).toString('base64');
const image = new ImageResponse(h('div', {
  style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '64px 72px', background: '#ffffff', color: '#171b22' },
},
  h('div', { style: { display: 'flex', alignItems: 'center', gap: 24 } },
    h('img', { src: logo, alt: '', width: 76, height: 76 }),
    h('span', { style: { fontSize: 34, fontWeight: 700 } }, SEO_NAME)),
  h('div', { style: { display: 'flex', flexDirection: 'column', marginTop: 56, fontSize: 70, fontWeight: 700, lineHeight: 1.12 } },
    h('span', null, 'Report an emergency.'),
    h('span', { style: { color: '#bd161c', fontSize: 48, marginTop: 18 } }, 'Share the details teams need.')),
  h('div', { style: { fontSize: 28, marginTop: 36, lineHeight: 1.5, maxWidth: 920 } }, 'Location, current photo and report tracking for Cordova, Cebu.'),
  h('div', { style: { display: 'flex', justifyContent: 'space-between', marginTop: 'auto', fontSize: 24, borderTop: '1px solid #d9dce2', paddingTop: 20 } },
    h('span', null, 'cordova-emergency-response.site'),
    h('span', { style: { color: '#bd161c', fontWeight: 700 } }, 'For immediate danger, call 911')),
), { width: 1200, height: 630 });
await mkdir(resolve(root, 'public/images'), { recursive: true });
const bytes = Buffer.from(await image.arrayBuffer());
await writeFile(resolve(root, 'public/images/seo-share-card.png'), bytes);
console.log(JSON.stringify({ generated: 'public/images/seo-share-card.png', width: 1200, height: 630, bytes: bytes.length, privateData: false }));
