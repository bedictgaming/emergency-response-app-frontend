'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, AlertCircle } from 'lucide-react';

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

import type { User } from '../types';

export function LoginPage() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup state
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');

  const handleGoogleAuth = () => {
    setIsLoading(true);
    setError('');

    setTimeout(() => {
      const user: User = {
        id: crypto.randomUUID(),
        email: 'user@gmail.com',
        name: 'Demo User',
        avatar:
          'https://api.dicebear.com/7.x/avataaars/svg?seed=Demo',
      };

      localStorage.setItem('user', JSON.stringify(user));

      setIsLoading(false);
      router.push('/dashboard');
    }, 1000);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();

    setError('');

    if (!loginEmail || !loginPassword) {
      setError('Please fill in all fields');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      const user: User = {
        id: crypto.randomUUID(),
        email: loginEmail,
        name: loginEmail.split('@')[0],
      };

      localStorage.setItem('user', JSON.stringify(user));

      setIsLoading(false);
      router.push('/dashboard');
    }, 1000);
  };

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();

    setError('');

    if (!signupName || !signupEmail || !signupPassword) {
      setError('Please fill in all fields');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      const user: User = {
        id: crypto.randomUUID(),
        email: signupEmail,
        name: signupName,
      };

      localStorage.setItem('user', JSON.stringify(user));

      setIsLoading(false);
      router.push('/dashboard');
    }, 1000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f6efed] px-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-red-600 mb-4">
            <Shield className="w-7 h-7 text-white" />
          </div>

          <h1 className="text-4xl font-bold text-slate-900">
            Emergency Response
          </h1>

          <p className="text-sm text-slate-500 mt-2">
            Community-Based Emergency Reporting System
          </p>
        </div>

        <Tabs defaultValue="login" className="w-full">

          {/* Tabs */}
          <TabsList className="grid grid-cols-2 w-full bg-gray-200 rounded-xl p-1 mb-3">
            <TabsTrigger
              value="login"
              className="rounded-lg data-[state=active]:bg-white"
            >
              Login
            </TabsTrigger>

            <TabsTrigger
              value="signup"
              className="rounded-lg data-[state=active]:bg-white"
            >
              Sign Up
            </TabsTrigger>
          </TabsList>

          {/* LOGIN TAB */}
          <TabsContent value="login">
            <Card className="border border-gray-200 rounded-xl shadow-sm">

              <CardHeader>
                <CardTitle>Welcome Back</CardTitle>

                <CardDescription>
                  Login to your account to report emergencies
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">

                {/* Google Button */}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full bg-white border-gray-300 hover:bg-gray-50"
                  disabled={isLoading}
                  onClick={handleGoogleAuth}
                >
                  <svg
                    className="w-5 h-5 mr-2"
                    viewBox="0 0 24 24"
                  >
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>

                  Continue with Google
                </Button>

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>

                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-gray-500">
                      OR CONTINUE WITH EMAIL
                    </span>
                  </div>
                </div>

                <form
                  onSubmit={handleLogin}
                  className="space-y-4"
                >
                  <div>
                    <Label>Email</Label>

                    <Input
                      type="email"
                      placeholder="your.email@example.com"
                      value={loginEmail}
                      onChange={(e) =>
                        setLoginEmail(e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <Label>Password</Label>

                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) =>
                        setLoginPassword(e.target.value)
                      }
                    />
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />

                      <AlertDescription>
                        {error}
                      </AlertDescription>
                    </Alert>
                  )}

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-slate-950 hover:bg-slate-800 text-white"
                  >
                    {isLoading
                      ? 'Logging in...'
                      : 'Login'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SIGNUP TAB */}
          <TabsContent value="signup">
            <Card className="border border-gray-200 rounded-xl shadow-sm">

              <CardHeader>
                <CardTitle>Create Account</CardTitle>

                <CardDescription>
                  Sign up to start reporting emergencies
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">

                {/* Google Button */}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full bg-white border-gray-300 hover:bg-gray-50"
                  disabled={isLoading}
                  onClick={handleGoogleAuth}
                >
                  <svg
                    className="w-5 h-5 mr-2"
                    viewBox="0 0 24 24"
                  >
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>

                  Sign up with Google
                </Button>

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>

                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white px-2 text-gray-500">
                      OR SIGN UP WITH EMAIL
                    </span>
                  </div>
                </div>

                <form
                  onSubmit={handleSignup}
                  className="space-y-4"
                >
                  <div>
                    <Label>Full Name</Label>

                    <Input
                      placeholder="John Doe"
                      value={signupName}
                      onChange={(e) =>
                        setSignupName(e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <Label>Email</Label>

                    <Input
                      type="email"
                      placeholder="your.email@example.com"
                      value={signupEmail}
                      onChange={(e) =>
                        setSignupEmail(e.target.value)
                      }
                    />
                  </div>

                  <div>
                    <Label>Password</Label>

                    <Input
                      type="password"
                      placeholder="••••••••"
                      value={signupPassword}
                      onChange={(e) =>
                        setSignupPassword(e.target.value)
                      }
                    />
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />

                      <AlertDescription>
                        {error}
                      </AlertDescription>
                    </Alert>
                  )}

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-slate-950 hover:bg-slate-800 text-white"
                  >
                    {isLoading
                      ? 'Creating Account...'
                      : 'Create Account'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <p className="text-center text-xs text-gray-600 mt-4">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}