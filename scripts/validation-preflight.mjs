// Vercel project settings may override a local config's buildCommand. Ensure
// both live-data builds still run their explicit origin/mode gate.
if (process.env.VERCEL === '1') {
  // This prebuild also serves the explicit legacy staging configuration. The
  // default deploy:build still rejects staging before this lifecycle is reached.
  const { deploymentFailures } = await import('./deployment-policy.mjs');
  const failures = deploymentFailures(process.env, { allowStaging: true });
  if (failures.length) {
    console.error('Deployment blocked:\n' + failures.map(reason => `- ${reason}`).join('\n'));
    process.exitCode = 1;
  } else {
    await import('./release-preflight.mjs');
  }
} else if (process.env.NEXT_PUBLIC_PRODUCTION_VALIDATION === 'true' || process.env.NEXT_PUBLIC_PUBLIC_LAUNCH === 'true') {
  await import('./release-preflight.mjs');
}
