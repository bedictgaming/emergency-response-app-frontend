import type { Metadata } from 'next';
import { SEO_DESCRIPTION, SEO_IMAGE, SEO_NAME, SEO_ORIGIN, SEO_TITLE, shouldIndexPublicSite } from './seo-policy.mjs';

export const privateRobots: Metadata['robots'] = {
  index: false, follow: false, noarchive: true, nosnippet: true, noimageindex: true,
};

export function privatePageMetadata(title: string, description: string): Metadata {
  return { title, description, robots: privateRobots };
}

export function homeMetadata(): Metadata {
  return {
    title: { absolute: SEO_TITLE }, description: SEO_DESCRIPTION,
    alternates: { canonical: SEO_ORIGIN + '/' },
    robots: shouldIndexPublicSite(process.env) ? { index: true, follow: true } : privateRobots,
    openGraph: {
      type: 'website', locale: 'en_PH', siteName: SEO_NAME,
      title: SEO_TITLE, description: SEO_DESCRIPTION, url: SEO_ORIGIN + '/',
      images: [{ url: SEO_IMAGE, width: 1200, height: 630, alt: `${SEO_NAME}: community reporting in Cordova, Cebu.` }],
    },
    twitter: {
      card: 'summary_large_image', title: SEO_TITLE, description: SEO_DESCRIPTION,
      images: [{ url: SEO_IMAGE, alt: `${SEO_NAME}: community reporting in Cordova, Cebu.` }],
    },
  };
}
