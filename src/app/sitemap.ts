import type { MetadataRoute } from 'next';
import { sitemapPolicy } from '@/lib/seo-policy.mjs';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapPolicy(process.env);
}
