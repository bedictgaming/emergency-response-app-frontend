'use client';

import { useEffect, useRef, useState } from 'react';
import type { AxiosError } from 'axios';
import { confirmPasswordReset, requestPasswordReset } from '@/lib/services/authService';
import { AccountPanel } from './AccountPanel';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

export function PasswordRecovery({ token, hasResetLink, validLink, initialEmail, onBack }: {
  token: string | null; hasResetLink: boolean; validLink: boolean; initialEmail: string;
  onBack: (message?: string) => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (request.current || (hasResetLink && (!validLink || !token))) return;
    setError(''); setNotice('');
    if (hasResetLink && (password.length < 12 || password.length > 128 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password))) {
      setError('Use 12–128 characters with uppercase and lowercase letters and a number.');
      return;
    }
    const controller = new AbortController(); request.current = controller; setPending(true);
    try {
      const message = hasResetLink
        ? await confirmPasswordReset(token!, password, controller.signal)
        : await requestPasswordReset(email.trim(), controller.signal);
      if (!controller.signal.aborted) {
        if (hasResetLink) { setPassword(''); onBack('Password reset successfully. Log in with your new password.'); }
        else setNotice(message);
      }
    } catch (failure) {
      if (!controller.signal.aborted) {
        const response = (failure as AxiosError<{ message?: string; errors?: Array<{ message?: string }> }>).response;
        setError(response?.data?.errors?.[0]?.message || response?.data?.message || 'Password recovery could not be completed. Check your connection and try again.');
      }
    } finally {
      if (!controller.signal.aborted) setPending(false);
      if (request.current === controller) request.current = null;
    }
  }

  return (
    <AccountPanel title={hasResetLink ? 'Choose a new password' : 'Reset password'}
      description={hasResetLink ? 'Your reset link expires after 30 minutes and can be used once.' : 'Enter your account email. If eligible, we will request a secure reset link. Email delivery may take a few minutes.'}>
        {hasResetLink && !validLink && <Alert variant="destructive" role="alert">This reset link is incomplete or invalid. Return to Log In and choose Forgot password to request a new link.</Alert>}
        <form onSubmit={submit} className="space-y-4">
          {hasResetLink ? (
            <div>
              <Label htmlFor="reset-password" className="mb-2 block">New password</Label>
              <Input id="reset-password" name="new-password" type="password" autoComplete="new-password" required maxLength={128} disabled={pending || !validLink} value={password} onChange={event => setPassword(event.target.value)} aria-describedby="reset-password-help" className="h-12 rounded-lg text-base" />
              <p id="reset-password-help" className="mt-2 text-sm leading-6 text-muted-foreground">Use 12–128 characters with uppercase and lowercase letters and a number.</p>
            </div>
          ) : (
            <div>
              <Label htmlFor="reset-email" className="mb-2 block">Account email</Label>
              <Input id="reset-email" name="email" type="email" autoComplete="email" required maxLength={254} disabled={pending} value={email} onChange={event => setEmail(event.target.value)} className="h-12 rounded-lg text-base" />
            </div>
          )}
          {error && <Alert variant="destructive" role="alert" className="text-sm">{error}</Alert>}
          {notice && <Alert variant="success" role="status" className="text-sm">{notice}</Alert>}
          <Button type="submit" disabled={pending || (hasResetLink && !validLink)} className="h-12 w-full rounded-lg">{pending ? 'Please wait…' : hasResetLink ? 'Set new password' : 'Send reset link'}</Button>
        </form>
        <Button type="button" variant="outline" disabled={pending} onClick={() => onBack()} className="min-h-11 w-full rounded-lg">Back to Log In</Button>
    </AccountPanel>
  );
}
