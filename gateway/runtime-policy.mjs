const TARGETS = Object.freeze({
  preview: Object.freeze({ upstream: 'https://api-staging-staging-86d9.up.railway.app', audience: 'emergency-response-staging-v1' }),
  production: Object.freeze({ upstream: 'https://api-production-49dea.up.railway.app', audience: 'emergency-response-production-v1' }),
});

// Deployment identity, fixed upstream and audience must agree. Preview secrets
// can never authenticate production, and no caller controls the destination.
export function gatewayTarget(env) {
  const target = TARGETS[env.VERCEL_ENV];
  if (env.VERCEL !== '1' || !target || env.API_GATEWAY_UPSTREAM !== target.upstream
    || env.API_GATEWAY_AUDIENCE !== target.audience) throw new Error('Gateway environment mismatch');
  return target;
}
