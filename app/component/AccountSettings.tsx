'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { ArrowLeft, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { HeaderFrame } from './HeaderFrame';
import { EmergencyLogo } from './EmergencyLogo';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { LoadingPlaceholder } from '@/components/ui/loading-placeholder';
import { accountHome } from '@/lib/authorization';
import { getMeFresh, getLoginMethods, beginGoogleLink, unlinkGoogle, type AuthUser, type LoginMethods } from '@/lib/services/authService';

const callbackMessages: Record<string, string> = {
  linked: 'Google connected. You can now use either sign-in method. Other sessions were signed out.',
  cancelled: 'Google connection cancelled. Your sign-in methods have not changed.',
  expired: 'The connection attempt expired or your session changed. Confirm your password and try again.',
  email_mismatch: 'Choose the verified Gmail or Google Workspace account with the same email as this account.',
  changed: 'Your account or sign-in methods changed. Review the methods below before trying again.',
  failed: 'Google connection could not be confirmed. Reload Settings to check before trying again.',
};
const safeErrors = new Set([
  'Your current password was not confirmed. Try again or use Forgot password.',
  'A confirmed password is required. You cannot remove your only sign-in method.',
  'Your session or sign-in methods changed. Reload Settings and try again.',
  'Your account changed. Reload Settings and try again.',
  'Google is already connected. Reload Settings to see your sign-in methods.',
  'Google is your only sign-in method. Set a password with Forgot password before disconnecting it.',
]);

export default function AccountSettings() {
  const router = useRouter();
  const [account, setAccount] = useState<AuthUser | null>(null);
  const [methods, setMethods] = useState<LoginMethods | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [action, setAction] = useState<'link' | 'unlink' | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const scope = useRef<() => boolean>(() => false);
  const mutation = useRef<AbortController | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const rawUser = localStorage.getItem('user');
    const logoutEpoch = localStorage.getItem('emergency-logout-epoch');
    let active = true;
    const current = () => active && !controller.signal.aborted && rawUser === localStorage.getItem('user') && logoutEpoch === localStorage.getItem('emergency-logout-epoch');
    scope.current = current;
    const stop = () => { active = false; controller.abort(); mutation.current?.abort(); setAccount(null); setMethods(null); setPassword(''); setAction(null); };
    const accountChanged = (event: StorageEvent) => {
      if (event.key === null || event.key === 'user' || event.key === 'emergency-logout-epoch') {
        stop(); router.replace('/login?session=manual');
      }
    };
    const reopen = (event: PageTransitionEvent) => { if (event.persisted) setAttempt(value => value + 1); };
    window.addEventListener('storage', accountChanged);
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', reopen);
    setLoadError(false); setMethods(null); setAccount(null); setPassword(''); setAction(null); setBusy(false); setShowPassword(false);
    const callback = new URLSearchParams(window.location.search).get('googleLink');
    if (callback) {
      setNotice(callbackMessages[callback] ?? callbackMessages.failed);
      window.history.replaceState({}, '', '/settings');
    }
    void Promise.all([getMeFresh(controller.signal), getLoginMethods(controller.signal)]).then(([user, signInMethods]) => {
      if (!current()) return;
      if (!['USER', 'ADMIN', 'DISPATCHER'].includes(user.role) || !['/dashboard', '/admin/main-dashboard', '/admin/fire-dashboard', '/admin/medical-dashboard', '/admin/police-dashboard', '/admin/drrmo-dashboard'].includes(accountHome(user))) {
        router.replace('/login?session=manual'); return;
      }
      if (signInMethods.accountId !== user.id) { setLoadError(true); return; }
      if (callback === 'linked' && !signInMethods.google.connected) setNotice(callbackMessages.failed);
      setAccount(user); setMethods(signInMethods);
    }).catch(() => { if (current()) setLoadError(true); });
    return () => {
      active = false; controller.abort(); mutation.current?.abort();
      window.removeEventListener('storage', accountChanged); window.removeEventListener('pagehide', stop); window.removeEventListener('pageshow', reopen);
    };
  }, [attempt, router]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const current = scope.current;
    if (!account || !methods || !action || !current() || submitting.current) return;
    submitting.current = true; setBusy(true); setError(''); setNotice('');
    const controller = new AbortController(); mutation.current = controller;
    try {
      if (action === 'link') {
        const url = await beginGoogleLink(account.id, password, controller.signal);
        if (!current()) return;
        setPassword(''); window.location.assign(url);
      } else {
        await unlinkGoogle(account.id, password, controller.signal);
        if (!current()) return;
        setPassword(''); setAction(null); setMethods(null);
        setNotice('Google disconnected. Use your email and password next time. Other sessions were signed out.');
        setAttempt(value => value + 1);
      }
    } catch (failure) {
      if (!current()) return;
      setPassword('');
      const message = axios.isAxiosError(failure) ? failure.response?.data?.message : undefined;
      setError(safeErrors.has(message) ? message : axios.isAxiosError(failure) && failure.response?.status === 429
        ? 'Too many attempts. Wait a few minutes before trying again.'
        : 'We could not confirm the change. Reload Settings to check your sign-in methods, then try again.');
    } finally { submitting.current = false; if (current()) setBusy(false); }
  };

  return <div className="min-h-screen bg-background text-foreground">
    <HeaderFrame pinned surfaceClassName="flex min-h-16 items-center justify-between gap-3 px-2 py-2 sm:px-4">
      <div className="flex min-w-0 items-center gap-3"><EmergencyLogo /><span className="truncate text-sm font-bold sm:text-base">Cordova Emergency Response</span></div>
      <Link href={account ? accountHome(account) : '/login?session=manual'} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ArrowLeft size={16} aria-hidden="true" /><span>{account ? 'Dashboard' : 'Log In'}</span></Link>
    </HeaderFrame>
    <main className="mx-auto w-full max-w-2xl px-4 pt-8 pb-24 sm:px-6 sm:pt-12">
      <h1 className="text-2xl font-bold tracking-tight">Account Settings</h1>
      <p className="mt-2 text-base text-muted-foreground">Manage how you sign in. Connecting Google is optional and does not affect emergency reporting.</p>
      {notice && <p role="status" className="mt-6 rounded-lg border border-border bg-muted p-4 text-sm leading-6">{notice}</p>}
      {!account || !methods ? loadError ? <div className="mt-6 space-y-4"><p role="alert">Your sign-in methods could not be loaded. Reconnect and retry.</p><Button onClick={() => { setError(''); setAttempt(value => value + 1); }} className="min-h-11">Reload Settings</Button></div>
        : <LoadingPlaceholder label="Checking account and sign-in methods..." layout="panel" className="mt-6" />
        : <>
          <p className="mt-6 text-sm text-muted-foreground break-words">Signed in as <span className="font-semibold text-foreground">{account.email}</span></p>
          <section aria-labelledby="methods-title" className="mt-6 rounded-xl border border-border bg-card px-5 sm:px-6">
            <h2 id="methods-title" className="pt-5 text-lg font-semibold">Sign-in methods</h2>
            <div className="flex items-start gap-3 py-5"><KeyRound className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" /><div><h3 className="font-semibold">Email and password</h3><p className="mt-1 text-sm text-muted-foreground">{methods.password ? 'Available. Your password stays private.' : 'Not set. Use Forgot password to add a password before disconnecting Google.'}</p></div></div>
            <div className="border-t border-border py-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" /><div className="min-w-0"><h3 className="font-semibold">Google</h3><p className="mt-1 text-sm text-muted-foreground break-words">{methods.google.connected ? `Connected${methods.google.email ? ` · ${methods.google.email}` : ''}` : 'Not connected. Use the Google account with the same email.'}</p></div></div>
              {!action && <div className="mt-4 pl-8">{methods.google.connected ? methods.canUnlinkGoogle
                ? <Button variant="outline" className="min-h-11" onClick={() => { setAction('unlink'); setError(''); }}>Disconnect Google</Button>
                : <p className="text-sm text-muted-foreground">Google is your only sign-in method. It cannot be disconnected yet.</p>
                : <Button className="min-h-11" disabled={!methods.password} onClick={() => { setAction('link'); setError(''); }}>Connect Google</Button>}</div>}
            </div>
          </section>
          {action && <form onSubmit={submit} aria-label={action === 'link' ? 'Connect Google' : 'Disconnect Google'} className="mt-6 space-y-4">
            <h2 className="text-lg font-semibold">{action === 'link' ? 'Confirm your password to connect Google' : 'Confirm disconnecting Google'}</h2>
            <p id="password-help" className="text-sm leading-6 text-muted-foreground">{action === 'link' ? 'Next, choose your matching verified Gmail or Google Workspace account. This attempt lasts five minutes.' : 'You will use your email and password next time. Other sessions will be signed out.'}</p>
            <div><Label htmlFor="settings-password">Current password</Label><div className="relative mt-2"><Input id="settings-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required maxLength={4096} autoFocus disabled={busy} value={password} onChange={event => setPassword(event.target.value)} aria-describedby="password-help" className="min-h-11 pr-12 text-base!" /><button type="button" disabled={busy} aria-label={showPassword ? 'Hide current password' : 'Show current password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)} className="absolute top-0 right-0 flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
            {error && <p role="alert" className="text-sm leading-6 text-destructive">{error}</p>}
            <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy || !password} className="min-h-11">{busy ? 'Confirming...' : action === 'link' ? 'Continue to Google' : 'Confirm disconnect'}</Button><Button type="button" variant="outline" disabled={busy} className="min-h-11" onClick={() => { setPassword(''); setShowPassword(false); setAction(null); setError(''); }}>Cancel</Button></div>
          </form>}
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm"><Link href="/login?session=manual" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring">Forgot password?</Link><Button variant="outline" className="min-h-11" disabled={busy} onClick={() => { setError(''); setAttempt(value => value + 1); }}>Reload Settings</Button></div>
        </>}
      <p className="mt-8 text-sm text-muted-foreground">For immediate danger, <a href="tel:911" className="font-semibold underline underline-offset-4">call 911</a>.</p>
    </main>
  </div>;
}
