export const PUBLIC_ORIGINS = Object.freeze([
  'https://cordova-emergency-response.site',
  'https://cordova-emergency-response.vercel.app',
]);

/** Browser API traffic stays first-party only on explicitly approved live aliases. */
export function resolveApiOrigin(configured, browserOrigin, live, staging) {
  return live && !staging && PUBLIC_ORIGINS.includes(configured)
    && PUBLIC_ORIGINS.includes(browserOrigin) ? browserOrigin : configured;
}

/** Private evidence is authorized with this host's session, not another alias's cookie. */
export function evidenceAccessPath(source, apiOrigin) {
  const url = new URL(source, apiOrigin);
  if (![apiOrigin, ...PUBLIC_ORIGINS].includes(url.origin)
    || !/^\/api\/attachments\/v1\/[^/]+\/content$/.test(url.pathname)
    || url.username || url.password) throw new Error('Invalid evidence endpoint');
  return url.pathname.slice('/api'.length).replace(/\/content$/, '/access-url');
}
