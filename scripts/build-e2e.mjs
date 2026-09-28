import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const result = spawnSync(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'build'], {
  stdio: 'inherit',
  env: { ...process.env, EMERGENCY_E2E_DIST_DIR: process.env.EMERGENCY_E2E_DIST_DIR || '.next-e2e' },
});
process.exit(result.status ?? 1);
