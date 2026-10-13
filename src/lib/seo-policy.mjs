import { PUBLIC_ORIGINS } from './public-origins.mjs';

export const SEO_ORIGIN = PUBLIC_ORIGINS[0];
export const SEO_NAME = 'Cordova Emergency Response';
export const SEO_TITLE = `${SEO_NAME} | Emergency Reporting in Cordova, Cebu`;
export const SEO_DESCRIPTION = 'Report fire, medical, police and hazard emergencies in Cordova, Cebu. Share your location and a current photo, then track your report online.';
export const SEO_IMAGE = '/images/seo-share-card.png';

// Explicit public build only; SEO is not authentication or access control.
export function shouldIndexPublicSite(env) {
  return env.NODE_ENV === 'production'
    && env.NEXT_PUBLIC_PUBLIC_LAUNCH === 'true'
    && env.NEXT_PUBLIC_PRODUCTION_VALIDATION === 'false'
    && env.NEXT_PUBLIC_PREVIEW_ONLY === 'false'
    && env.NEXT_PUBLIC_STAGING_TEST === 'false'
    && env.NEXT_PUBLIC_VERCEL_ENV !== 'preview'
    && env.VERCEL_ENV !== 'preview'
    && [SEO_ORIGIN, SEO_ORIGIN + '/'].includes(env.NEXT_PUBLIC_API_URL);
}

export function robotsPolicy(env) {
  // HTML must stay crawlable for its noindex tags to be seen. A robots.txt
  // disallow is not an indexing prohibition or an authorization boundary.
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['api', 'apI', 'aPi', 'aPI', 'Api', 'ApI', 'APi', 'API'].map(prefix => '/' + prefix) },
    ...(shouldIndexPublicSite(env) ? { sitemap: SEO_ORIGIN + '/sitemap.xml' } : {}),
  };
}

export function sitemapPolicy(env) {
  // Never enumerate sessions, incidents, evidence, accounts or protected pages.
  return shouldIndexPublicSite(env) ? [{ url: SEO_ORIGIN + '/' }] : [];
}

export function websiteSchema(env) {
  return shouldIndexPublicSite(env) ? {
    '@context': 'https://schema.org', '@type': 'WebSite',
    '@id': SEO_ORIGIN + '/#website', name: SEO_NAME,
    url: SEO_ORIGIN + '/', description: SEO_DESCRIPTION, inLanguage: 'en-PH',
  } : null;
}

export function serializeJsonLd(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
