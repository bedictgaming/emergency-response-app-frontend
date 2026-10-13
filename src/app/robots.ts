import type { MetadataRoute } from 'next';
import { robotsPolicy } from '@/lib/seo-policy.mjs';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return robotsPolicy(process.env);
}
