'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getMeFresh } from '@/lib/services/authService';
import { accountHome } from '@/lib/authorization';
import { isDefinitiveAuthFailure, markSessionChanged, markSessionEnded } from '@/lib/apiClient';
import { LoadingPlaceholder } from '@/components/ui/loading-placeholder';
import { Button } from './ui/button';

/** Browser hints schedule a cookie-backed check; they never authorize access. */
export function SessionRestoreBoundary({ children, fullPage = false }: { children: ReactNode; fullPage?: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const explicitAction = params.get('session') === 'manual'
    || ['resetToken', 'verificationToken', 'oauth', 'error'].some(key => params.has(key));
  // OAuth deliberately removes its query while verifying cookies. Do not start
  // a second restoration flow underneath that existing callback handler.
  const [skipThisVisit] = useState(explicitAction);
  const [bypass, setBypass] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<'public' | 'checking' | 'unavailable'>('public');
  const cancelled = useRef(false);

  useEffect(() => {
    if (skipThisVisit || explicitAction || bypass) return;
    let active = true;
    cancelled.current = false;
    const controller = new AbortController();
    let account: string | null;
    let logoutEpoch: string | null;
    try {
      account = localStorage.getItem('user');
      logoutEpoch = localStorage.getItem('emergency-logout-epoch');
      const generation = localStorage.getItem('emergency-session-generation');
      const hint = document.cookie.split('; ').some(cookie => /^sessionRenewAt=\d{13}$/.test(cookie));
      // Guests never incur an unnecessary /me + refresh failure on entry.
      if (!account && !generation && !hint) { setPhase('public'); return; }
    } catch { setPhase('unavailable'); return; }
    setPhase('checking');
    const sameAccount = () => localStorage.getItem('user') === account
      && localStorage.getItem('emergency-logout-epoch') === logoutEpoch;
    const stop = () => { cancelled.current = true; controller.abort(); };
    const accountChanged = (event: StorageEvent) => {
      if (event.key === null || event.key === 'user' || event.key === 'emergency-logout-epoch') {
        stop(); setPhase('public');
      }
    };
    const reopened = (event: PageTransitionEvent) => {
      if (event.persisted) setAttempt(value => value + 1);
    };
    window.addEventListener('storage', accountChanged);
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', reopened);
    void getMeFresh(controller.signal).then(user => {
      if (!active || cancelled.current) return;
      if (!sameAccount()) { setPhase('public'); return; }
      const destination = accountHome(user);
      if (destination === '/' || destination === '/login') { setPhase('public'); return; }
      // Only this server-verified identity selects the citizen/department home.
      localStorage.setItem('user', JSON.stringify(user));
      markSessionChanged();
      router.replace(destination);
    }).catch(error => {
      if (!active || cancelled.current) return;
      if (isDefinitiveAuthFailure(error)) {
        // A 401 may already have cleared the cache in the shared interceptor.
        // Never clear another tab's newer account after a late failure.
        if (sameAccount()) { localStorage.removeItem('user'); markSessionEnded(); }
        setPhase('public');
      } else setPhase('unavailable');
    });
    return () => {
      active = false; controller.abort();
      window.removeEventListener('storage', accountChanged);
      window.removeEventListener('pagehide', stop);
      window.removeEventListener('pageshow', reopened);
    };
  }, [attempt, bypass, explicitAction, router, skipThisVisit]);

  if (skipThisVisit || explicitAction || bypass || phase === 'public') return children;
  const useLogin = () => {
    // Cancel synchronously, before a late successful profile can redirect.
    cancelled.current = true;
    setBypass(true);
    if (fullPage) router.replace('/login?session=manual');
  };
  return (
    <div className={`flex w-full flex-col items-center justify-center bg-background px-4 py-8 ${fullPage ? 'min-h-[100dvh]' : 'min-h-64'}`}>
      <div className="w-full max-w-sm space-y-4">
        {phase === 'checking'
          ? <LoadingPlaceholder label="Restoring your session..." layout="panel" />
          : <p role="alert" className="text-base leading-6 text-muted-foreground">We could not check your saved session. Reconnect and retry, or use Log In.</p>}
        <div className="flex flex-wrap gap-3">
          {phase === 'unavailable' && <Button className="min-h-11" onClick={() => setAttempt(value => value + 1)}>Retry session check</Button>}
          <Button variant="outline" className="min-h-11" onClick={useLogin}>Use Log In instead</Button>
          <a className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium text-primary underline underline-offset-4" href="tel:911">Call 911</a>
        </div>
      </div>
    </div>
  );
}
