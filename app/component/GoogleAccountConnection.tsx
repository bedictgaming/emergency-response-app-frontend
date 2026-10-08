"use client";

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { LoadingPlaceholder } from '@/components/ui/loading-placeholder';
import { beginGoogleConnection, disconnectGoogle, getGoogleConnection, type GoogleConnectionStatus } from '@/lib/services/authService';
import { markSessionEnded } from '@/lib/apiClient';

const outcomes: Record<string, string> = {
  linked: 'Checking your Google connection…',
  cancelled: 'Google connection was cancelled. You can still log in with your system password.',
  expired: 'The linking attempt expired or your session changed. Confirm your password and try again.',
  email_mismatch: 'Choose the Google account with the same verified email as your citizen account.',
  conflict: 'Google is already connected to an account. No accounts were merged or replaced.',
  not_allowed: 'This Google connection action is available only to active citizens.',
  failed: 'Google could not be connected. Your account was not merged or replaced. Try again later.',
};

export function GoogleAccountConnection({ userId, email }: { userId: string; email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<GoogleConnectionStatus | null>(null);
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const request = useRef<AbortController | null>(null);
  const details = useRef<HTMLDetailsElement>(null);
  const accountStillMatches = () => {
    try { return JSON.parse(localStorage.getItem('user') ?? 'null')?.id === userId; } catch { return false; }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.getAll('googleLink');
    if (result.length === 1 && Object.hasOwn(outcomes, result[0])) {
      setNotice(outcomes[result[0]]);
      if (details.current) details.current.open = true;
      setOpen(true);
    }
    // A callback enum is only feedback; GET status supplies the actual truth.
    if (params.has('googleLink')) {
      params.delete('googleLink');
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${params.size ? `?${params}` : ''}${window.location.hash}`);
    }
  }, []);

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (['user', 'emergency-session-generation', 'emergency-logout-epoch'].includes(event.key ?? '')) {
        request.current?.abort(); setPassword(''); setStatus(null); setBusy(false); setOpen(false);
        if (details.current) details.current.open = false;
      }
    };
    window.addEventListener('storage', changed);
    return () => { window.removeEventListener('storage', changed); request.current?.abort(); };
  }, [userId]);

  useEffect(() => {
    if (!open) { request.current?.abort(); setPassword(''); setBusy(false); return; }
    const abort = new AbortController(); request.current = abort;
    setStatus(null); setError('');
    void getGoogleConnection(abort.signal).then(value => {
      if (abort.signal.aborted || !accountStillMatches()) return;
      setStatus(value);
      setNotice(previous => previous === outcomes.linked
        ? (value.available && value.linked ? 'Google is connected. You can now use either sign-in method.' : 'A Google connection could not be confirmed. Your system password still works.')
        : previous);
    }).catch(() => {
      if (!abort.signal.aborted && accountStillMatches()) setError('Connection status is unavailable. Retry before changing your sign-in methods.');
    });
    return () => abort.abort();
    // userId is the account snapshot; status requests never authorize by email.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId, revision]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !status?.available || !status.hasPassword) return;
    request.current?.abort();
    const abort = new AbortController(); request.current = abort;
    const logoutEpoch = localStorage.getItem('emergency-logout-epoch');
    const currentPassword = password; setPassword(''); setBusy(true); setError(''); setNotice('');
    try {
      if (status.linked) {
        await disconnectGoogle(currentPassword, abort.signal);
        if (abort.signal.aborted || !accountStillMatches() || localStorage.getItem('emergency-logout-epoch') !== logoutEpoch) return;
        localStorage.removeItem('user'); markSessionEnded();
        router.replace('/login');
      } else {
        const url = await beginGoogleConnection(currentPassword, abort.signal);
        if (abort.signal.aborted || !accountStillMatches() || localStorage.getItem('emergency-logout-epoch') !== logoutEpoch) return;
        window.location.assign(url);
      }
    } catch (failure) {
      if (abort.signal.aborted || !accountStillMatches()) return;
      const response = failure as { response?: { data?: { errorCode?: string } } };
      const messages: Record<string, string> = {
        wrong_password: 'Your current system password is incorrect. Try again or use Forgot password.',
        expired: outcomes.expired, conflict: outcomes.conflict, not_allowed: outcomes.not_allowed,
        password_required: 'Set a system password through Forgot password first.',
      };
      setError(messages[response.response?.data?.errorCode ?? ''] ?? 'The action could not be confirmed. Retry status before trying again.');
    } finally { if (!abort.signal.aborted) setBusy(false); }
  };

  return <details ref={details} className="mt-8 rounded-xl border border-border bg-card text-card-foreground"
    onToggle={event => setOpen(event.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer rounded-xl px-5 py-4 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Account sign-in</summary>
    {open && <div className="space-y-4 border-t border-border p-5">
      <h2 className="text-lg font-semibold">Google connection</h2>
      <p className="max-w-prose break-words text-sm text-muted-foreground">Keep your existing account and reports. Connecting Google is optional and never required to report an emergency.</p>
      {notice && <p role="status" className="text-sm text-foreground">{notice}</p>}
      {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p>
        <Button type="button" variant="outline" onClick={() => setRevision(value => value + 1)} disabled={busy}>Retry status</Button></div>}
      {!status && !error && <LoadingPlaceholder label="Checking Google connection" rows={2} />}
      {status && !status.available && <p className="text-sm text-muted-foreground">Google linking is not available yet. Email and password login still works.</p>}
      {status?.available && <>
        <p className="text-sm font-medium">{status.linked ? 'Google is connected.' : 'Google is not connected.'}</p>
        {!status.hasPassword ? <p className="text-sm text-muted-foreground">To disconnect safely, first set a system password using <Link className="inline-flex min-h-11 items-center underline underline-offset-4" href="/login">Forgot password on the login page</Link>.</p>
          : <form onSubmit={submit} className="max-w-md space-y-3">
            <p className="break-words text-sm text-muted-foreground">{status.linked
              ? 'Disconnecting Google signs out every session. You will log back in with your system password.'
              : `Confirm your system password, then choose the verified Google account for ${email}. This attempt lasts five minutes.`}</p>
            <label htmlFor="google-connection-password" className="block text-sm font-medium">Current system password</label>
            <Input id="google-connection-password" name="currentPassword" type="password" autoComplete="current-password" required maxLength={4096}
              value={password} onChange={event => setPassword(event.target.value)} disabled={busy} className="text-base!" />
            <Button type="submit" disabled={busy || !password || !!error} className="min-h-11 w-full bg-[color-mix(in_srgb,var(--primary)_88%,black)]! hover:bg-[color-mix(in_srgb,var(--primary)_80%,black)]! sm:w-auto">{busy ? 'Confirming…' : status.linked ? 'Disconnect Google and sign out' : 'Confirm password and connect Google'}</Button>
          </form>}
        <p className="max-w-prose text-sm text-muted-foreground">Your Google password and system password are separate. Resetting your system password does not disconnect Google. If you suspect an unwanted connection, reset your system password, log in and disconnect Google here.</p>
      </>}
    </div>}
  </details>;
}

