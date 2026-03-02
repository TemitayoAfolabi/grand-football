'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { requestPasswordReset } from '../actions';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleReset = () => {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('email', email);

      const result = await requestPasswordReset(formData);

      if (result.error) {
        setError(result.error);
        return;
      }

      setEmailSent(true);
    });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-primary px-4">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.08)_0%,transparent_70%)]" aria-hidden="true" />

      <div className="relative w-full max-w-sm space-y-8">
        {/* Back link */}
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-body-sm text-text-secondary hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to sign in
        </Link>

        {/* Branding */}
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-surface-elevated shadow-glow-accent text-4xl">
            🔑
          </div>
          <h1 className="text-h1 font-bold text-text-primary">Reset Password</h1>
          <p className="mt-2 text-body-sm text-text-secondary">
            Enter your email and we&apos;ll send you a link to reset your password.
          </p>
        </div>

        {/* Error */}
        {error && (
          <Alert variant="error" title="Error">
            {error}
          </Alert>
        )}

        {/* Success */}
        {emailSent ? (
          <Alert variant="success" title="Check your email">
            If an account exists for <strong className="text-text-primary">{email}</strong>, we&apos;ve sent a password reset link. Check your inbox.
          </Alert>
        ) : (
          <Card variant="glass" className="space-y-6 p-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleReset();
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
              <Button type="submit" className="w-full" loading={isPending} size="lg">
                Send Reset Link
              </Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
