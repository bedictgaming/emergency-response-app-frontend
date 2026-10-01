import nextEnv from '@next/env';
import { deploymentFailures } from './deployment-policy.mjs';

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const failures = deploymentFailures(process.env, { allowStaging: process.argv.includes('--allow-staging') });
if (failures.length) {
  console.error('Deployment blocked:\n' + failures.map(reason => `- ${reason}`).join('\n'));
  process.exitCode = 1;
} else {
  await import('./release-preflight.mjs');
  if (!process.exitCode) console.log('Deployment configuration passed; platform protection and live release gates remain separate.');
}
