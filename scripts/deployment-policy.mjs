export const FIRST_PARTY_ORIGIN = 'https://cordova-emergency-response.vercel.app';

export function stagingGatewayOrigin(env) {
  if (env.EMERGENCY_STAGING_GATEWAY !== 'true' || env.VERCEL !== '1' || env.VERCEL_ENV !== 'preview'
    || env.VERCEL_PROJECT_ID !== 'prj_EoB1SDCIdo2thmzHpsJb1kQmuDtO'
    || !/^emergency-response-[a-z0-9]+-benedict-mequiabas-projects\.vercel\.app$/.test(env.VERCEL_URL || '')
    || env.API_GATEWAY_UPSTREAM !== 'https://api-staging-staging-86d9.up.railway.app'
    || env.API_GATEWAY_AUDIENCE !== 'emergency-response-staging-v1') return undefined;
  return `https://${env.VERCEL_URL}`;
}

// Only the explicitly selected, environment-bound preview derives its public
// API origin. Never derive a production URL or put the signing key in this value.
export function deploymentBuildEnvironment(env) {
  const result = { ...env };
  if (env.EMERGENCY_STAGING_GATEWAY === 'true') {
    const origin = stagingGatewayOrigin(env);
    if (!origin) throw new Error('Staging gateway build identity mismatch');
    result.NEXT_PUBLIC_API_URL = origin;
  }
  return result;
}

// A static export freezes these values into browser bundles. Never infer a live
// mode from Vercel's production target or silently supply missing mode flags.
export function deploymentFailures(env, { allowStaging = false } = {}) {
  const failures = [];
  const gatewayStaging = env.EMERGENCY_STAGING_GATEWAY === 'true';
  if (env.EMERGENCY_STAGING_GATEWAY !== undefined && !['true', 'false'].includes(env.EMERGENCY_STAGING_GATEWAY)) failures.push('Invalid staging gateway flag.');
  if (gatewayStaging && (!allowStaging || !stagingGatewayOrigin(env) || env.NEXT_PUBLIC_STAGING_TEST !== 'true')) failures.push('Staging gateway requires explicit preview identity and staging mode.');
  // The legacy explicit staging config talks directly to synthetic-only staging.
  // Permit it only for the generic prebuild, never the default live deploy command.
  const stagingMode = allowStaging && env.NEXT_PUBLIC_STAGING_TEST === 'true';
  const expectedOrigin = stagingMode ? (gatewayStaging ? stagingGatewayOrigin(env) : 'https://api-staging-staging-86d9.up.railway.app') : FIRST_PARTY_ORIGIN;
  try {
    const url = new URL(env.NEXT_PUBLIC_API_URL || '');
    if (url.origin !== expectedOrigin || url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
      failures.push(stagingMode ? 'Staging requires the exact synthetic-only staging API origin.' : 'Live deployments require the exact first-party Cordova API origin.');
    }
  } catch { failures.push('Deployment API origin is missing or invalid.'); }

  const publicMode = env.NEXT_PUBLIC_PUBLIC_LAUNCH === 'true';
  const validationMode = env.NEXT_PUBLIC_PRODUCTION_VALIDATION === 'true';
  if (Number(publicMode) + Number(validationMode) + Number(stagingMode) !== 1) failures.push('Choose exactly one explicit deployment mode.');
  const expected = {
    NEXT_PUBLIC_PUBLIC_LAUNCH: publicMode ? 'true' : 'false',
    NEXT_PUBLIC_PRODUCTION_VALIDATION: validationMode ? 'true' : 'false',
    NEXT_PUBLIC_PREVIEW_ONLY: validationMode || stagingMode ? 'true' : 'false',
    NEXT_PUBLIC_STAGING_TEST: stagingMode ? 'true' : 'false',
  };
  for (const [name, value] of Object.entries(expected)) {
    if (env[name] !== value) failures.push(`${name} must explicitly be ${value} for this deployment mode.`);
  }
  return failures;
}
