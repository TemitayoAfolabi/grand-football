'use client';

import { Suspense, useState, useTransition } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { setNewPassword } from './actions';
import { Lock } from 'lucide-react';

export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col items-center justify-center bg-bg-primary px-4">
          <div className="w-full max-w-sm space-y-8">
            <Skeleton className="h-20 w-20 rounded-full mx-auto" />
            <Skeleton className="h-8 w-48 mx-auto" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        </div>
      }
    >
      <SetPasswordContent />
    </Suspense>
  );
}

function SetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reason = searchParams.get('reason');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isFirstLogin = reason === 'first-login';

  const handleSetPassword = () => {
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set('password', password);
      formData.set('confirmPassword', confirmPassword);

      const result = await setNewPassword(formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      // Redirect to login with success message
      router.push('/login?reset=success');
    });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-primary px-4">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.08)_0%,transparent_70%)]" aria-hidden="true" />

      <div className="relative w-full max-w-sm space-y-8">
        {/* Branding */}
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-surface-elevated shadow-glow-accent">
            <Lock className="h-10 w-10 text-accent" aria-hidden="true" />
          </div>
          <h1 className="text-h1 font-bold text-text-primary">
            {isFirstLogin ? 'Set Your Password' : 'Reset Password'}
          </h1>
          <p className="mt-2 text-body-sm text-text-secondary">
            {isFirstLogin
              ? 'Welcome to Grand Football! Please set a secure password for your account.'
              : 'Enter your new password below.'}
          </p>
        </div>

        {/* Error */}
        {error && (
          <Alert variant="error" title="Error">
            {error}
          </Alert>
        )}

        {/* Password requirements */}
        <Alert variant="info" title="Password requirements">
          Must be at least 8 characters long.
        </Alert>

        {/* Set password form */}
        <Card variant="glass" className="space-y-6 p-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSetPassword();
            }}
            className="space-y-4"
          >
            <Input
              label="New password"
              type="password"
              placeholder="Enter your new password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
            />
            <Input
              label="Confirm password"
              type="password"
              placeholder="Confirm your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
              error={
                confirmPassword && password !== confirmPassword
                  ? 'Passwords do not match'
                  : undefined
              }
            />
            <Button
              type="submit"
              className="w-full"
              loading={isPending}
              size="lg"
              disabled={!password || !confirmPassword || password !== confirmPassword}
            >
              {isFirstLogin ? 'Set Password & Continue' : 'Reset Password'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
