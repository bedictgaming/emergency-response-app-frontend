'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert } from './ui/alert';

// These non-credential redirect flags are feedback only, never account authority.
export function EmailVerificationResult({ showLoginLink = false }: { showLoginLink?: boolean }) {
  const params = useSearchParams();
  const failure = params.getAll('error').includes('verification_failed');
  const success = !params.has('error') && params.getAll('verified').length === 1 && params.get('verified') === 'true';
  if (!failure && !success) return null;
  return (
    <Alert variant={success ? 'success' : 'destructive'} role={success ? 'status' : 'alert'} className="mb-5">
      <h2 className="text-lg font-semibold">{success ? 'Email verification completed' : 'Email verification unsuccessful'}</h2>
      <p className="mt-2 text-base leading-relaxed">{success
        ? 'Log in with your email and password to continue. Account access is checked when you log in.'
        : 'This link could not verify your account. It may be expired or already used. Try logging in if you verified before. Verification email resend is not available.'}</p>
      {showLoginLink && <Link href="/login" className="mt-3 inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Go to Log In</Link>}
    </Alert>
  );
}
