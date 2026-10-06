import { spawnSync } from 'node:child_process';
import { deploymentBuildEnvironment, deploymentFailures } from './deployment-policy.mjs';

try {
  const env = deploymentBuildEnvironment(process.env);
  const allowStaging = env.EMERGENCY_STAGING_GATEWAY === 'true';
  if (deploymentFailures(env, { allowStaging }).length) throw new Error('Invalid deployment configuration');
  const steps = [
    ['scripts/deployment-preflight.mjs', ...(allowStaging ? ['--allow-staging'] : [])],
    ['scripts/validation-preflight.mjs'],
    ['node_modules/next/dist/bin/next', 'build'],
  ];
  for (const args of steps) {
    const result = spawnSync(process.execPath, args, { env, stdio: 'inherit', windowsHide: true });
    if (result.status !== 0) { process.exitCode = result.status || 1; break; }
  }
} catch {
  console.error('Deployment blocked: invalid explicit deployment configuration.');
  process.exitCode = 1;
}
