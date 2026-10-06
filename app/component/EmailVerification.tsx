'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { verifyEmail } from '@/lib/services/authService';
import { LoginPage } from './LoginPage';
import { Alert } from './ui/alert';
import { Button } from './ui/button';

export function AccountEmailEntry() {
  const params = useSearchParams();
  const token = params.get('verificationToken');
  const valid = params.getAll('verificationToken').length === 1 && !params.has('resetToken') && !params.has('oauth')
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token ?? '');
  if (!params.has('verificationToken')) return <LoginPage />;
  // A changed link remounts the panel and aborts any older pending redemption.
  return <VerificationPanel key={params.toString()} token={token} valid={valid} />;
}

function VerificationPanel({ token, valid }: { token: string | null; valid: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function confirm() {
    if (!valid || !token || request.current) return;
    const controller = new AbortController(); request.current = controller;
    setPending(true); setError('');
    try {
      await verifyEmail(token, controller.signal);
      if (!controller.signal.aborted) router.replace('/login?verified=true');
    } catch (failure) {
      if (!controller.signal.aborted) {
        const status = (failure as { response?: { status?: number } }).response?.status;
        setError(status === 400 || status === 404 || status === 410
          ? 'This verification link is invalid or expired. Request a new verification email from Log In.'
          : 'Verification could not be completed. Check your connection, then try again.');
      }
    } finally {
      if (!controller.signal.aborted) setPending(false);
      if (request.current === controller) request.current = null;
    }
  }

  return (
    <section aria-labelledby="email-verification-heading" className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-card-foreground">
      <h1 id="email-verification-heading" className="text-2xl font-semibold">Verify your email</h1>
      <p className="mt-3 text-base leading-relaxed text-muted-foreground">Select Verify email to confirm this link. Verification does not log you in or grant administrator access.</p>
      {!valid && <Alert variant="destructive" role="alert" className="mt-5">This verification link is incomplete or invalid. Request a new verification email from Log In.</Alert>}
      {error && <Alert variant="destructive" role="alert" className="mt-5">{error}</Alert>}
      <Button type="button" onClick={() => void confirm()} disabled={!valid || pending} className="mt-6 min-h-11 w-full">{pending ? 'Verifying email…' : 'Verify email'}</Button>
      <Link href="/login" className="mt-3 inline-flex min-h-11 items-center text-primary underline underline-offset-4">Return to Log In</Link>
    </section>
  );
}
