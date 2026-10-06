'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, ArrowLeft, LoaderCircle } from 'lucide-react';
import type { AxiosError } from 'axios';
import { confirmPasswordReset, getMe, login, requestPasswordReset, resendVerification, signup } from '@/lib/services/authService';
import { registerWebPush } from '@/lib/browserPush';
import { accountHome } from '@/lib/authorization';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from './ui/tabs';
import {
  Alert,
  AlertDescription,
} from './ui/alert';
import { API_ORIGIN, markSessionChanged } from '@/lib/apiClient';
import { EmailVerificationResult } from './EmailVerificationResult';

type AuthErrorPayload = {
  message?: string;
  errors?: Array<{ message?: string }>;
};

interface LoginPageProps {
  embedded?: boolean;
}

export function LoginPage({ embedded = false }: LoginPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthStatus = searchParams.get('oauth') ?? searchParams.get('error');

  const [isLoading, setIsLoading] = useState(false);
  const [isCompletingOAuth, setIsCompletingOAuth] = useState(oauthStatus === 'success');
  const [error, setError] = useState('');

  // Auto-redirect to dashboard if OAuth was successful
  useEffect(() => {
    if (oauthStatus === 'success') {
      setIsCompletingOAuth(true);
      // The OAuth callback sets fresh HttpOnly cookies. Remove any previous
      // account's browser token before /me so it cannot override those cookies.
      localStorage.removeItem('user');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');

      // Remove any legacy token query parameters without accepting them as credentials.
      window.history.replaceState({}, '', '/login');
      void getMe()
        .then(user => {
          localStorage.setItem('user', JSON.stringify(user));
          markSessionChanged();
          void registerWebPush().catch(() => undefined);
          router.replace(accountHome(user));
        })
        .catch(() => {
          setError('Google login session could not be verified. Please try again.');
          setIsCompletingOAuth(false);
        });
    }
    if (oauthStatus === 'oauth_failed') {
      setError('Google login failed. Please try again.');
    }
    if (oauthStatus === 'oauth_link_required') {
      setError('Google was not linked to this account. Use your email and password to Log In, or choose “Forgot password?” to recover access.');
    }
    if (oauthStatus === 'oauth_email_verification_required') {
      setError('This Google email cannot be used to create an account securely. Register with email, or use a verified Gmail or Google Workspace account.');
    }
  }, [oauthStatus, router]);

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup state
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [verificationCooldown, setVerificationCooldown] = useState(false);
  useEffect(() => {
    if (!verificationCooldown) return;
    const timer = setTimeout(() => setVerificationCooldown(false), 60_000);
    return () => clearTimeout(timer);
  }, [verificationCooldown]);

  const handleResendVerification = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail.trim())) { setError('Enter your account email above, then request verification.'); return; }
    setIsLoading(true); setError(''); setNotice('');
    try {
      const result = await resendVerification(loginEmail.trim());
      setNotice(result.message); setVerificationCooldown(true);
    } catch {
      setError('Verification request could not be completed. Wait a minute, then try again.');
    } finally { setIsLoading(false); }
  };

  // Password visibility state
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState('login');
  const resetToken = searchParams.get('resetToken');

  useEffect(() => {
    if (resetToken) setActiveTab('reset');
  }, [resetToken]);

  const handleGoogleAuth = () => {
    // Google sign-in starts an account switch. Do not carry a prior account's
    // bearer token into the returning OAuth session.
    localStorage.removeItem('user');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    // Redirects the browser to the backend Google OAuth endpoint
    // This is an external backend OAuth navigation, not an internal Next.js route.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `${API_ORIGIN}/api/auth/v1/google`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');

    if (!loginEmail || !loginPassword) {
      setError('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      const response = await login({ email: loginEmail, password: loginPassword });
      const user = response.data.user;
      void registerWebPush(true).catch(() => undefined);
      router.replace(accountHome(user));
    } catch (err: unknown) {
      const authError = err as AxiosError<AuthErrorPayload>;
      const message = authError.response?.data?.message || 'Login failed. Please try again.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setIsLoading(true);
    try {
      const message = resetToken
        ? await confirmPasswordReset(resetToken, newPassword)
        : await requestPasswordReset(resetEmail);
      setNotice(message);
      if (resetToken) {
        window.history.replaceState({}, '', '/login');
        setNewPassword('');
        setActiveTab('login');
      }
    } catch (err: unknown) {
      const authError = err as AxiosError<AuthErrorPayload>;
      setError(authError.response?.data?.message || 'Password reset failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };


  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!signupName || !signupEmail || !signupPassword) {
      setError('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      const result = await signup({ name: signupName, email: signupEmail, password: signupPassword });
      setError('');
      setSignupName('');
      setSignupEmail('');
      setSignupPassword('');
      // Show success and switch to login tab
      alert(result.message || 'Account created! You can now log in.');
      setActiveTab('login');
    } catch (err: unknown) {
      const authError = err as AxiosError<AuthErrorPayload>;
      const errors = authError.response?.data?.errors;
      const message = errors?.[0]?.message || authError.response?.data?.message || 'Signup failed. Please try again.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isCompletingOAuth) {
    const completionStatus = (
      <div
        id="portal-section"
        className={embedded ? 'w-full max-w-[460px]' : 'mx-auto w-full max-w-[448px]'}
        role="status"
        aria-live="polite"
      >
        <Card className="rounded-3xl border border-border bg-white/90 shadow-lg dark:bg-card">
          <CardContent className="flex min-h-64 flex-col items-center justify-center px-8 py-12 text-center">
            <span className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
              <LoaderCircle className="h-7 w-7 animate-spin" aria-hidden="true" />
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-slate-50">
              Finishing sign in
            </h1>
            <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500 dark:text-slate-400">
              Verifying your account and opening your authorized workspace.
            </p>
          </CardContent>
        </Card>
      </div>
    );

    if (embedded) return completionStatus;

    return (
      <div className="figma-shell auth-shell min-h-[100dvh] w-full overflow-y-auto px-4 py-8 sm:py-12">
        {completionStatus}
      </div>
    );
  }

  const content = (
    <div id="portal-section" className={embedded ? "w-full max-w-[460px]" : "mx-auto w-full max-w-[448px]"}>
      {!embedded && (
        <div className="mb-7 text-center">
          <div className="mb-4 inline-flex h-20 w-20 items-center justify-center">
            <img
              src="/emergency-icon.png"
              alt="Emergency Response"
              fetchPriority="low"
              className="h-20 w-20 rounded-full shadow-xl shadow-red-500/20 object-contain"
            />
          </div>

          <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
            Emergency Response
          </h1>

          <p className="mt-2 text-sm font-medium text-slate-600 sm:text-base">
            Community-Based Emergency Reporting System
          </p>
        </div>
      )}

      {embedded && (
        <div className="mb-4 flex items-center justify-between border-b border-slate-200/80 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Official Responder & Citizen Portal
            </span>
          </div>
          <span className="text-[11px] font-semibold text-slate-500">24/7 Access</span>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <EmailVerificationResult />

          {/* Tabs Navigation (Reset tab removed from here; accessed via Forgot Password) */}
          {activeTab !== 'reset' ? (
            <TabsList className="mb-5 grid w-full grid-cols-2 rounded-xl border-border/70 bg-muted p-1 shadow-sm">
              <TabsTrigger
                value="login"
                className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold"
              >
                Log In
              </TabsTrigger>

              <TabsTrigger
                value="signup"
                className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold"
              >
                Sign In
              </TabsTrigger>
            </TabsList>
          ) : (
            <div className="mb-3.5 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setNotice('');
                  setActiveTab('login');
                }}
                className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1.5 bg-white/80 hover:bg-white px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-2xs transition-all cursor-pointer"
              >
                <ArrowLeft size={14} />
                Back to Log In
              </button>
            </div>
          )}

          {/* LOGIN TAB */}
          <TabsContent value="login" className="mt-0 focus-visible:outline-none">
            <Card className="rounded-3xl border border-border bg-white/90 shadow-lg dark:bg-card">
              <CardHeader className="px-6 pb-4 pt-7 sm:px-7">
                <CardTitle className="text-2xl font-bold tracking-tight text-slate-950">Welcome Back</CardTitle>
                <CardDescription className="mt-1 text-sm text-slate-500">
                  Sign in to access your authorized workspace
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-5 px-6 pb-7 pt-0 sm:px-7">

                {/* Google Button */}
                <Button
                  type="button"
                  variant="outline"
                  className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-800 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
                  disabled={isLoading}
                  onClick={handleGoogleAuth}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </Button>

                {/* Divider */}
                <div className="relative flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-slate-150" />
                  </div>
                  <div className="relative flex justify-center text-[10px] font-semibold tracking-wider">
                    <span className="bg-white px-3 text-slate-400">
                      OR CONTINUE WITH EMAIL
                    </span>
                  </div>
                </div>

                <form onSubmit={handleLogin} className="space-y-3.5">
                  <div>
                    <Label htmlFor="login-email" className="text-slate-600 font-medium text-xs mb-1.5 block">Email</Label>
                    <Input
                      className="h-12 w-full rounded-xl border border-slate-200/70 bg-slate-50 px-4 text-sm text-slate-900 transition-all focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-indigo-300"
                      type="email"
                      placeholder="your.email@example.com"
                      value={loginEmail}
                      id="login-email"
                      autoComplete="username"
                      onChange={(e) => setLoginEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <Label htmlFor="login-password" className="text-slate-600 font-medium text-xs">Password</Label>
                      <button
                        type="button"
                        onClick={() => {
                          setError('');
                          setNotice('');
                          setActiveTab('reset');
                        }}
                        className="text-xs text-slate-500 hover:text-slate-900 font-medium transition-colors hover:underline cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        className="h-12 w-full rounded-xl border border-slate-200/70 bg-slate-50 pl-4 pr-11 text-sm text-slate-900 transition-all focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-indigo-300"
                        type={showLoginPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={loginPassword}
                        id="login-password"
                        autoComplete="current-password"
                        onChange={(e) => setLoginPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none p-1 cursor-pointer"
                        title={showLoginPassword ? "Hide password" : "Show password"}
                        aria-label={showLoginPassword ? "Hide password" : "Show password"}
                      >
                        {showLoginPassword ? (
                          <EyeOff className="w-4 h-4 text-slate-500" />
                        ) : (
                          <Eye className="w-4 h-4 text-slate-500" />
                        )}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <Alert variant="destructive" role="alert" className="rounded-xl py-2 px-3">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <AlertDescription className="text-xs">{error}</AlertDescription>
                    </Alert>
                  )}
                  {notice && (
                    <Alert variant="success" role="status" className="rounded-xl px-3 py-2">
                      <AlertDescription className="text-xs">{notice}</AlertDescription>
                    </Alert>
                  )}

                  <Button
                    type="submit"
                    variant="default"
                    disabled={isLoading}
                    className="mt-1 h-12 w-full rounded-xl border border-primary bg-primary text-sm font-bold text-primary-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:bg-red-700 hover:shadow-md cursor-pointer dark:hover:bg-red-600"
                  >
                    {isLoading ? 'Logging in...' : 'Log In'}
                  </Button>
                  <Button type="button" variant="outline" className="min-h-11 w-full" disabled={isLoading || verificationCooldown} onClick={handleResendVerification}>
                    {verificationCooldown ? 'Verification requested · wait one minute' : 'Resend verification email'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reset" className="mt-0 focus-visible:outline-none">
            <Card className="rounded-3xl border border-border bg-white/90 shadow-lg dark:bg-card">
              <CardHeader className="pt-5 px-5 pb-3">
                <CardTitle className="text-xl font-bold text-black tracking-tight">
                  {resetToken ? 'Choose a new password' : 'Reset password'}
                </CardTitle>
                <CardDescription className="text-xs text-slate-400 mt-0.5">
                  {resetToken ? 'Use at least 12 characters with upper/lowercase letters and a number.' : 'We will email a secure link if the account exists.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-5 pb-5 pt-0">
                <form onSubmit={handlePasswordReset} className="space-y-3.5">
                  {resetToken ? (
                    <div>
                      <Label htmlFor="reset-password" className="text-slate-600 font-medium text-xs mb-1.5 block">New password</Label>
                      <div className="relative">
                        <Input
                          type={showResetPassword ? 'text' : 'password'}
                          minLength={12}
                          required
                          value={newPassword}
                          id="reset-password"
                          autoComplete="new-password"
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full h-10 bg-[#eef4fa] border-0 rounded-xl pl-3 pr-10 text-xs text-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => setShowResetPassword((prev) => !prev)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none p-1 cursor-pointer"
                          title={showResetPassword ? "Hide password" : "Show password"}
                          aria-label={showResetPassword ? "Hide password" : "Show password"}
                        >
                          {showResetPassword ? (
                            <EyeOff className="w-4 h-4 text-slate-500" />
                          ) : (
                            <Eye className="w-4 h-4 text-slate-500" />
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Label htmlFor="reset-email" className="text-slate-600 font-medium text-xs mb-1.5 block">Email</Label>
                      <Input
                        type="email"
                        required
                        placeholder="your.email@example.com"
                        value={resetEmail}
                        id="reset-email"
                        autoComplete="email"
                        onChange={(e) => setResetEmail(e.target.value)}
                        className="w-full h-10 bg-[#eef4fa] border-0 rounded-xl px-3 text-xs text-slate-900"
                      />
                    </div>
                  )}
                  {error && <Alert variant="destructive" role="alert" className="rounded-xl py-2 px-3"><AlertDescription className="text-xs">{error}</AlertDescription></Alert>}
                  {notice && <p role="status" className="text-xs text-emerald-700 bg-emerald-50 rounded-xl p-3">{notice}</p>}
                  <Button type="submit" variant="default" disabled={isLoading} className="h-11 w-full rounded-xl border border-primary bg-primary text-xs font-bold text-primary-foreground shadow-sm hover:bg-red-700 transition-all cursor-pointer dark:hover:bg-red-600">
                    {isLoading ? 'Please wait…' : resetToken ? 'Set new password' : 'Send reset link'}
                  </Button>

                  <div className="pt-1 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setNotice('');
                        setActiveTab('login');
                      }}
                      className="text-xs text-slate-500 hover:text-slate-800 font-medium inline-flex items-center gap-1 transition-colors hover:underline cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Back to Log In
                    </button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SIGNUP TAB */}
          <TabsContent value="signup" className="mt-0 focus-visible:outline-none">
            <Card className="rounded-3xl border border-border bg-white/90 shadow-lg dark:bg-card">
              <CardHeader className="pt-5 px-5 pb-3">
                <CardTitle className="text-xl font-bold text-black tracking-tight">Create Account</CardTitle>
                <CardDescription className="text-xs text-slate-400 mt-0.5">
                  Sign up to start reporting emergencies
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4 px-5 pb-5 pt-0">

                {/* Google Button */}
                <Button
                  type="button"
                  variant="outline"
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-800 shadow-sm hover:border-indigo-200 hover:shadow-md"
                  disabled={isLoading}
                  onClick={handleGoogleAuth}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Sign up with Google
                </Button>

                {/* Divider */}
                <div className="relative flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-slate-150" />
                  </div>
                  <div className="relative flex justify-center text-[10px] font-semibold tracking-wider">
                    <span className="bg-white px-3 text-slate-400">
                      OR SIGN UP WITH EMAIL
                    </span>
                  </div>
                </div>

                <form onSubmit={handleSignup} className="space-y-3">
                  <div>
                    <Label htmlFor="signup-name" className="text-slate-600 font-medium text-xs mb-1 block">Full Name</Label>
                    <Input
                    className="h-11 w-full rounded-xl border border-slate-200/70 bg-slate-50 px-3 text-xs text-slate-900 transition-all focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-indigo-300"
                      placeholder="John Doe"
                      value={signupName}
                      id="signup-name"
                      autoComplete="name"
                      onChange={(e) => setSignupName(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="signup-email" className="text-slate-600 font-medium text-xs mb-1 block">Email</Label>
                    <Input
                    className="h-11 w-full rounded-xl border border-slate-200/70 bg-slate-50 px-3 text-xs text-slate-900 transition-all focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-indigo-300"
                      type="email"
                      placeholder="your.email@example.com"
                      value={signupEmail}
                      id="signup-email"
                      autoComplete="email"
                      onChange={(e) => setSignupEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="signup-password" className="text-slate-600 font-medium text-xs mb-1 block">Password</Label>
                    <div className="relative">
                      <Input
                        className="h-11 w-full rounded-xl border border-slate-200/70 bg-slate-50 pl-3 pr-10 text-xs text-slate-900 transition-all focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-indigo-300"
                        type={showSignupPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={signupPassword}
                        id="signup-password"
                        autoComplete="new-password"
                        onChange={(e) => setSignupPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none p-1 cursor-pointer"
                        title={showSignupPassword ? "Hide password" : "Show password"}
                        aria-label={showSignupPassword ? "Hide password" : "Show password"}
                      >
                        {showSignupPassword ? (
                          <EyeOff className="w-4 h-4 text-slate-500" />
                        ) : (
                          <Eye className="w-4 h-4 text-slate-500" />
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">Min. 8 characters, one uppercase letter, and one number.</p>
                  </div>

                  {error && (
                    <Alert variant="destructive" role="alert" className="rounded-xl py-2 px-3">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <AlertDescription className="text-xs">{error}</AlertDescription>
                    </Alert>
                  )}

                  <Button
                    type="submit"
                    variant="default"
                    disabled={isLoading}
                    className="mt-1 h-11 w-full rounded-xl border border-primary bg-primary text-xs font-bold text-primary-foreground shadow-sm hover:bg-red-700 transition-all cursor-pointer dark:hover:bg-red-600"
                  >
                    {isLoading ? 'Creating Account...' : 'Create Account'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Footer Terms */}
        <p className="text-center text-[11px] text-slate-400 font-medium mt-3 leading-relaxed px-6">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    );

    if (embedded) {
      return content;
    }

    return (
      <div className="figma-shell auth-shell min-h-[100dvh] w-full overflow-y-auto px-4 py-8 sm:py-12">
        {content}
      </div>
    );
  }
