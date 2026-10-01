import { ipAddress } from '@vercel/functions/headers';
import { rewrite } from '@vercel/functions/middleware';
import { signGatewayRequest } from './sign-request.mjs';
import { gatewayTarget } from './runtime-policy.mjs';

// Platform Routing Middleware, not Next's Proxy (the application remains a static export).
// Fixed, environment-bound upstreams; activation requires a paired backend gate.
export default function proxy(request) {
  try {
    const target = gatewayTarget(process.env);
    const incoming = new URL(request.url);
    const headers = signGatewayRequest(request, { secret: process.env.API_GATEWAY_SECRET,
      audience: target.audience, ip: ipAddress(request) });
    const upstream = new URL(target.upstream);
    upstream.pathname = incoming.pathname;
    upstream.search = incoming.search;
    // Forward using the existing external rewrite mechanism: do not buffer bodies,
    // follow redirects server-side, or proxy credentials to an arbitrary destination.
    return rewrite(upstream, { request: { headers }, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ code: 503, status: 'error', message: 'API gateway unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
