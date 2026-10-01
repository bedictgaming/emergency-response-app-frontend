import { createHmac, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';

// Never import this server-only module from app/ or browser lib/.
export function signGatewayRequest(request, { secret, audience, ip, now = Date.now(), nonce = randomBytes(16).toString('hex') }) {
  if (typeof secret !== 'string' || secret.length < 32 || !/^[a-z0-9-]{1,80}$/.test(audience)
    || !isIP(ip || '') || !/^\d{13}$/.test(String(now)) || !/^[a-f0-9]{32}$/.test(nonce)) {
    throw new Error('Invalid gateway configuration or client metadata');
  }
  const url = new URL(request.url);
  if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) throw new Error('API path required');
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (name.startsWith('x-er-gateway-')) headers.delete(name);
  const time = String(now);
  const payload = JSON.stringify(['er-api-gateway-v1', audience, time, nonce, request.method,
    url.pathname + url.search, ip, headers.get('cookie') || '', headers.get('authorization') || '',
    headers.get('origin') || '', headers.get('referer') || '', headers.get('sec-fetch-site') || '']);
  headers.set('x-er-gateway-ip', ip);
  headers.set('x-er-gateway-time', time);
  headers.set('x-er-gateway-nonce', nonce);
  headers.set('x-er-gateway-signature', createHmac('sha256', secret).update(payload).digest('hex'));
  return headers;
}
