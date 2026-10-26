// Test adapter only. Actual HTTPS bytes/headers from the exact candidate or
// canonical host; no private API, cookies, credentials, writes or redirects.
const immutable = new Map();
const allowedHeaders = new Set(['accept', 'accept-language', 'user-agent', 'rsc', 'next-router-prefetch',
  'next-router-state-tree', 'next-router-segment-prefetch', 'next-url', 'purpose', 'sec-purpose']);
export async function forwardHostedRead(route, target, allowedOrigin, timeout = 20000) {
  const request = route.request(), url = new URL(target), method = request.method();
  if (!(allowedOrigin === 'https://cordova-emergency-response.site'
    || /^https:\/\/emergency-response-[a-z0-9]+-benedict-mequiabas-projects\.vercel\.app$/.test(allowedOrigin))
    || url.origin !== allowedOrigin || url.username || url.password || !['GET', 'HEAD'].includes(method)
    || /^\/api(?:\/|$)/i.test(decodeURIComponent(url.pathname))) throw Error('EXACT_PUBLIC_READ_ONLY_HOSTED_TARGET_REQUIRED');
  const clientAborted = () => !request.isNavigationRequest() && request.failure()?.errorText === 'net::ERR_ABORTED';
  try {
    let response = method === 'GET' ? immutable.get(url.href) : undefined;
    if (!response) {
      const headers = Object.fromEntries(Object.entries(request.headers()).filter(([name]) => allowedHeaders.has(name.toLowerCase())));
      const fetched = await fetch(url, { method, headers, redirect: 'manual', signal: AbortSignal.timeout(timeout) });
      // Cookie-bearing public responses keep the original browser-aware path;
      // they are never cached, copied into private requests or printed.
      if (fetched.headers.has('set-cookie')) {
        await fetched.body?.cancel();
        const original = await route.fetch({ url: url.href, maxRedirects: 0, timeout });
        if (!clientAborted()) await route.fulfill({ response: original });
        return;
      }
      const bytes = Buffer.from(await fetched.arrayBuffer());
      if (bytes.length > 4_000_000) throw Error('HOSTED_PUBLIC_ASSET_SIZE_EXCEEDED');
      const responseHeaders = Object.fromEntries(fetched.headers);
      // fetch decoded the transport. Preserve all CSP/cache/security headers;
      // only framing/encoding is recalculated for identical decoded bytes.
      delete responseHeaders['content-encoding']; delete responseHeaders['content-length']; delete responseHeaders['transfer-encoding'];
      response = { status: fetched.status, headers: responseHeaders, body: bytes };
      if (method === 'GET' && url.pathname.startsWith('/_next/static/') && response.status === 200
        && fetched.headers.get('cache-control')?.includes('immutable')) immutable.set(url.href, response);
    }
    if (!clientAborted()) await route.fulfill(response);
  } catch (error) {
    // Explicitly cancelled non-navigation PUBLIC reads have no consumer. Do
    // not suppress active errors, navigation failures or any private API error.
    if (clientAborted()) return;
    throw error;
  }
}


