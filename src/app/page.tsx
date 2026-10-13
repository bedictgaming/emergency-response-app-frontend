import LandingPage from '@/components/landing/LandingPage';
import { homeMetadata } from '@/lib/seo';
import { serializeJsonLd, websiteSchema } from '@/lib/seo-policy.mjs';

export const metadata = homeMetadata();

export default function Home() {
  const schema = websiteSchema(process.env);
  return <>
    {schema && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />}
    <LandingPage />
  </>;
}
