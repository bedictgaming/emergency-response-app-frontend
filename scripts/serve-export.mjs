import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

// A normal verified production build is exported to ./out. The isolated E2E
// build writes directly to ./.next-e2e. Never serve an older isolated build
// when the caller explicitly selected the prebuilt production export.
const defaultRoot = process.env.EMERGENCY_E2E_PREBUILT_EXPORT ? 'out' : '.next-e2e';
const root = resolve(process.env.NEXT_EXPORT_DIR || defaultRoot);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
createServer(async (req, res) => {
  try {
    const path = resolve(root, `.${decodeURIComponent(new URL(req.url, 'http://localhost').pathname)}`);
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    for (const candidate of [path, path + '.html', resolve(path, 'index.html')]) {
      if (!(await stat(candidate).catch(() => null))?.isFile()) continue;
      res.writeHead(200, { 'Content-Type': mime[extname(candidate)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(await readFile(candidate));
      return;
    }
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const isApi = pathname === '/api' || pathname.startsWith('/api/');
    const notFound = isApi ? null : await readFile(resolve(root, '404.html')).catch(() => null);
    res.writeHead(404, { 'Content-Type': notFound ? 'text/html' : 'text/plain', 'Cache-Control': 'no-store' }).end(notFound || 'Not found');
  } catch { res.writeHead(400).end('Bad request'); }
}).listen(Number(process.env.PORT || 3100), '127.0.0.1');
