'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import type { AxiosError } from 'axios';
import { getMe, login, signup } from '@/lib/services/authService';
import { registerWebPush } from '@/lib/browserPush';
import { accountHome } from '@/lib/authorization';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Card,
  CardContent,
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
import { PasswordRecovery } from './PasswordRecovery';
import { AccountPanel } from './AccountPanel';
import styles from './account-page.module.css';

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
  const oauthStatus = searchParams.has('resetToken') ? null : searchParams.get('oauth') ?? searchParams.get('error');

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
      setError('This account uses email and password. Log In with those details, or choose “Forgot password?” to recover access.');
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

  // Password visibility state
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState('login');
  const [notice, setNotice] = useState('');
  const hasResetLink = searchParams.has('resetToken');
  const resetToken = searchParams.get('resetToken');
  const validResetLink = searchParams.getAll('resetToken').length === 1
    && /^[0-9a-f]{64}$/i.test(resetToken ?? '')
    && !searchParams.has('verificationToken') && !searchParams.has('oauth');
  const visibleTab = hasResetLink ? 'reset' : activeTab;
  const returnToLogin = (message = '') => {
    setActiveTab('login'); setError(''); setNotice(message);
    if (hasResetLink) router.replace('/login');
  };

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
      <div className="w-full">
        {completionStatus}
      </div>
    );
  }

  const content = (
    <div id="portal-section" className={`mx-auto w-full ${visibleTab === 'reset' ? 'max-w-[440px]' : embedded ? 'max-w-[460px]' : 'max-w-[960px]'}`}>

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

      <Tabs value={visibleTab} onValueChange={value => { setActiveTab(value); setError(''); setNotice(''); }} className={`w-full ${styles.tabs}`}>

          <div className={`${styles.shell} ${visibleTab === 'reset' ? styles.recovery : ''} ${embedded ? styles.compact : ''}`} data-account-layout="split" data-mode={visibleTab}>
          <div className={styles.formStage}>
          {/* LOGIN TAB */}
          <TabsContent value="login" className="mt-0 focus-visible:outline-none">
            <AccountPanel title="Welcome Back" description="Sign in to access your authorized workspace">

                {/* Google Button */}
                <Button
                  type="button"
                  variant="outline"
                  className="theme-inverse-surface theme-inverse-action h-12 w-full gap-3 rounded-lg text-sm font-semibold shadow-none"
                  disabled={isLoading}
                  onClick={handleGoogleAuth}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </Button>

                {/* Divider */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex-1 border-t border-border" aria-hidden="true" />
                  <span>Or continue with email</span>
                  <span className="flex-1 border-t border-border" aria-hidden="true" />
                </div>

                <form onSubmit={handleLogin} className="space-y-3.5">
                  <div>
                    <Label htmlFor="login-email" className="mb-2 block text-sm font-medium">Email</Label>
                    <Input
                      className="h-12 rounded-lg px-3 text-base"
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
                      <Label htmlFor="login-password" className="text-sm font-medium">Password</Label>
                      <button type="button" disabled={isLoading} className="min-h-11 text-xs font-medium text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-primary" onClick={() => { setError(''); setNotice(''); setActiveTab('reset'); }}>
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        className="h-12 rounded-lg pl-3 pr-12 text-base"
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
                        className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
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

                  {notice && <Alert variant="success" role="status" className="rounded-xl text-sm">{notice}</Alert>}

                  <Button
                    type="submit"
                    variant="default"
                    disabled={isLoading}
                    className="mt-1 h-12 w-full rounded-lg text-sm font-semibold"
                  >
                    {isLoading ? 'Logging in...' : 'Log In'}
                  </Button>
                </form>
            </AccountPanel>
          </TabsContent>


          <TabsContent value="reset" className="mt-0 focus-visible:outline-none">
            <PasswordRecovery key={searchParams.toString()} token={hasResetLink ? resetToken : null} hasResetLink={hasResetLink} validLink={validResetLink} initialEmail={loginEmail} onBack={returnToLogin} />
          </TabsContent>

          {/* SIGNUP TAB */}
          <TabsContent value="signup" className="mt-0 focus-visible:outline-none">
            <AccountPanel title="Create Account" description="Create a citizen account and log in immediately. No email verification required.">

                {/* Google Button */}
                <Button
                  type="button"
                  variant="outline"
                  className="theme-inverse-surface theme-inverse-action h-12 w-full gap-3 rounded-lg text-sm font-semibold shadow-none"
                  disabled={isLoading}
                  onClick={handleGoogleAuth}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Sign up with Google
                </Button>

                {/* Divider */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex-1 border-t border-border" aria-hidden="true" />
                  <span>Or sign up with email</span>
                  <span className="flex-1 border-t border-border" aria-hidden="true" />
                </div>

                <form onSubmit={handleSignup} className="space-y-3">
                  <div>
                    <Label htmlFor="signup-name" className="mb-2 block text-sm font-medium">Full Name</Label>
                    <Input
                    className="h-12 rounded-lg px-3 text-base"
                      placeholder="John Doe"
                      value={signupName}
                      id="signup-name"
                      autoComplete="name"
                      onChange={(e) => setSignupName(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="signup-email" className="mb-2 block text-sm font-medium">Email</Label>
                    <Input
                    className="h-12 rounded-lg px-3 text-base"
                      type="email"
                      placeholder="your.email@example.com"
                      value={signupEmail}
                      id="signup-email"
                      autoComplete="email"
                      onChange={(e) => setSignupEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="signup-password" className="mb-2 block text-sm font-medium">Password</Label>
                    <div className="relative">
                      <Input
                        className="h-12 rounded-lg pl-3 pr-12 text-base"
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
                        className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
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
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">Min. 8 characters, one uppercase letter, and one number.</p>
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
                    className="mt-1 h-12 w-full rounded-lg text-sm font-semibold"
                  >
                    {isLoading ? 'Creating Account...' : 'Create Account'}
                  </Button>
                </form>
            </AccountPanel>
          </TabsContent>
          </div>

          {visibleTab !== 'reset' && <aside className={styles.switchPanel} aria-label="Account options">
            <div className={styles.switchCopy}>
              <h2>{visibleTab === 'signup' ? 'Welcome back.' : 'New here?'}</h2>
              <p>{visibleTab === 'signup'
                ? 'Already have an account? Log in to access your authorized workspace.'
                : 'Create a citizen account and log in immediately. No email verification required.'}</p>
              <TabsList className={styles.switchTabs} aria-label="Choose account action" onKeyDown={event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
                const current = tabs.indexOf(event.target as HTMLButtonElement);
                if (current < 0) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
                  : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
                tabs[next]?.click();
                tabs[next]?.focus();
              }}>
                <TabsTrigger value="login" className={styles.switchTab}>Log In</TabsTrigger>
                <TabsTrigger value="signup" className={styles.switchTab}>Sign Up</TabsTrigger>
              </TabsList>
            </div>
          </aside>}
          </div>
        </Tabs>

        {/* Footer Terms */}
        <p className="mt-5 px-4 text-center text-xs leading-5 text-muted-foreground">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    );

    if (embedded) {
      return content;
    }

    return (
      <div className="w-full">
        {content}
      </div>
    );
  }
