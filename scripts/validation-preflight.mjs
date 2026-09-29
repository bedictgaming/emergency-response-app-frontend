// Vercel project settings may override a local config's buildCommand. Ensure
// the protected live-data build still runs its explicit origin/warning gate.
if (process.env.NEXT_PUBLIC_PRODUCTION_VALIDATION === 'true') {
  await import('./release-preflight.mjs');
}
