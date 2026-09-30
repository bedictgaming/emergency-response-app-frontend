// Vercel project settings may override a local config's buildCommand. Ensure
// both live-data builds still run their explicit origin/mode gate.
if (process.env.NEXT_PUBLIC_PRODUCTION_VALIDATION === 'true' || process.env.NEXT_PUBLIC_PUBLIC_LAUNCH === 'true') {
  await import('./release-preflight.mjs');
}
