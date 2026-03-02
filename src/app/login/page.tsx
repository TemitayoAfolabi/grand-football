'use client';

import { Suspense, useState, useTransition } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { GlowDivider } from '@/components/glow-divider';
import { Skeleton } from '@/components/ui/skeleton';
import { loginWithPassword } from './actions';
import Link from 'next/link';

const ERROR_MESSAGES: Record<string, string> = {
  not_allowed: 'Your email is not on the invite list. Contact the league admin.',
  expired: 'Your link has expired. Please request a new one.',
  session_expired: 'Your session has expired. Please sign in again.',
  default: 'Something went wrong. Please try again.',
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center bg-bg-primary px-4">
          <div className="w-full max-w-sm space-y-8">
            <div className="flex flex-col items-center gap-4">
              <Skeleton className="h-20 w-20 rounded-full" />
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const errorParam = searchParams.get('error');
  const resetSuccess = searchParams.get('reset') === 'success';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    errorParam ? (ERROR_MESSAGES[errorParam] ?? ERROR_MESSAGES.default) ?? null : null,
  );
  const [isPending, startTransition] = useTransition();

  const handleLogin = () => {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('email', email);
      formData.set('password', password);

      const result = await loginWithPassword(formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      if (result.forcePasswordChange) {
        router.push('/auth/set-password?reason=first-login');
        return;
      }

      router.push('/');
      router.refresh();
    });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-primary px-4">
      {/* Subtle radial glow background */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.08)_0%,transparent_70%)]" aria-hidden="true" />

      <div className="relative w-full max-w-sm space-y-8">
        {/* Branding */}
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-surface-elevated shadow-glow-accent text-4xl">
            ⚽
          </div>
          <h1 className="text-h1 font-bold">
            <span className="text-accent">Grand</span>{' '}
            <span className="text-text-primary">Football</span>
          </h1>
          <p className="mt-2 text-body-sm text-text-secondary">
            Premier League predictions for the elite few
          </p>
        </div>

        {/* Password reset success */}
        {resetSuccess && (
          <Alert variant="success" title="Password updated">
            Your password has been set successfully. Sign in below.
          </Alert>
        )}

        {/* Error */}
        {error && (
          <Alert variant="error" title="Sign in failed">
            {error}
          </Alert>
        )}

        {/* Login form */}
        <Card variant="glass" className="space-y-6 p-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin();
            }}
            className="space-y-4"
          >
            <Input
              label="Email address"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              minLength={8}
            />
            <Button type="submit" className="w-full" loading={isPending} size="lg">
              Sign In
            </Button>
          </form>

          <GlowDivider />

          <div className="text-center">
            <Link
              href="/login/forgot-password"
              className="text-body-sm text-accent hover:text-accent-hover transition-colors"
            >
              Forgot your password?
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
