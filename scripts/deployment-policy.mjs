export const FIRST_PARTY_ORIGIN = 'https://cordova-emergency-response.vercel.app';

// A static export freezes these values into browser bundles. Never infer a live
// mode from Vercel's production target or silently supply missing mode flags.
export function deploymentFailures(env, { allowStaging = false } = {}) {
  const failures = [];
  // The legacy explicit staging config talks directly to synthetic-only staging.
  // Permit it only for the generic prebuild, never the default live deploy command.
  const stagingMode = allowStaging && env.NEXT_PUBLIC_STAGING_TEST === 'true';
  const expectedOrigin = stagingMode ? 'https://api-staging-staging-86d9.up.railway.app' : FIRST_PARTY_ORIGIN;
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
