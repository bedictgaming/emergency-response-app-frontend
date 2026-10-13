import type { ReactNode } from 'react';
import { privatePageMetadata } from '@/lib/seo';

export const metadata = privatePageMetadata('Log In and Sign Up', 'Sign in or create your Cordova Emergency Response account.');

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
