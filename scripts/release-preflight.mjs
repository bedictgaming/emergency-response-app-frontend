import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const failures = [];
try {
  const url = new URL(process.env.NEXT_PUBLIC_API_URL || '');
  if (url.protocol !== 'https:' || /(^localhost$|^127\.|^0\.|^192\.168\.|^10\.|\.invalid$|\.test$|example\.)/i.test(url.hostname)) failures.push('NEXT_PUBLIC_API_URL must be a real, device-reachable HTTPS API endpoint.');
} catch { failures.push('NEXT_PUBLIC_API_URL is missing or invalid.'); }
if (failures.length) {
  console.error('Release blocked:\n' + failures.map(reason => `- ${reason}`).join('\n'));
  process.exitCode = 1;
} else console.log('PWA configuration gate passed. This does not validate deployment or live integrations.');
