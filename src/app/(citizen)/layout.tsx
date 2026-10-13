import type { ReactNode } from 'react';
import { privatePageMetadata } from '@/lib/seo';

export const metadata = privatePageMetadata('Citizen Dashboard', 'Sign in to submit and track your own emergency reports.');

export default function CitizenLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
