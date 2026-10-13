import type { ReactNode } from 'react';
import { privatePageMetadata } from '@/lib/seo';

export const metadata = privatePageMetadata('Account Settings', 'Sign in to manage your account and sign-in methods.');

export default function AccountLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
