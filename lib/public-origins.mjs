export const PUBLIC_ORIGINS = Object.freeze([
  'https://cordova-emergency-response.site',
]);

/** Browser API traffic stays first-party only on explicitly approved live aliases. */
export function resolveApiOrigin(configured, browserOrigin, live, staging) {
  const publicConfigured = PUBLIC_ORIGINS.find(origin => configured === origin || configured === origin + '/');
  return live && !staging && publicConfigured && PUBLIC_ORIGINS.includes(browserOrigin)
    ? browserOrigin : (publicConfigured || configured);
}

/** Private evidence is authorized with this host's session, not another alias's cookie. */
export function evidenceAccessPath(source, apiOrigin) {
  const url = new URL(source, apiOrigin);
  // Ignore the metadata's host entirely. Only this validated path is requested
  // through apiClient; no credential can be sent to a legacy or hostile host.
  if (!['http:', 'https:'].includes(url.protocol)
    || !/^\/api\/attachments\/v1\/[^/]+\/content$/.test(url.pathname)
    || url.username || url.password) throw new Error('Invalid evidence endpoint');
  return url.pathname.slice('/api'.length).replace(/\/content$/, '/access-url');
}
