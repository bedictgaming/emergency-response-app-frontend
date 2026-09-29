import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const failures = [];
try {
  const url = new URL(process.env.NEXT_PUBLIC_API_URL || '');
  if (url.protocol !== 'https:' || /(^localhost$|^127\.|^0\.|^192\.168\.|^10\.|\.invalid$|\.test$|example\.)/i.test(url.hostname)) failures.push('NEXT_PUBLIC_API_URL must be a real, device-reachable HTTPS API endpoint.');
  if (process.env.NEXT_PUBLIC_PRODUCTION_VALIDATION === 'true') {
    if (url.origin !== 'https://cordova-emergency-response.vercel.app') failures.push('Protected production validation must use the first-party Cordova API proxy.');
    if (process.env.NEXT_PUBLIC_PREVIEW_ONLY !== 'true') failures.push('Protected production validation must retain the preview-only warning.');
  }
} catch { failures.push('NEXT_PUBLIC_API_URL is missing or invalid.'); }
if (failures.length) {
  console.error('Release blocked:\n' + failures.map(reason => `- ${reason}`).join('\n'));
  process.exitCode = 1;
} else console.log('PWA configuration gate passed. This does not validate deployment or live integrations.');
