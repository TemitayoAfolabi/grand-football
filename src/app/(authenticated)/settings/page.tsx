'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { GlowDivider } from '@/components/glow-divider';
import { updateProfile, changePassword } from './actions';
import { Settings, LogOut, BookOpen, ChevronRight, User, Award, Lock } from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPasswordPending, startPasswordTransition] = useTransition();

  if (!loaded) {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setEmail(user.email || '');
        void supabase
          .from('profiles')
          .select('display_name')
          .eq('id', user.id)
          .single()
          .then(({ data: profileData }) => {
            if (profileData?.display_name) {
              setDisplayName(profileData.display_name);
            }
            setLoaded(true);
          });
      }
    });
  }

  function handleSubmit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await updateProfile(formData);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'Display name updated!' });
      }
    });
  }

  function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    void supabase.auth.signOut().then(() => {
      router.push('/login');
    });
  }

  function handlePasswordChange() {
    setPasswordMessage(null);
    startPasswordTransition(async () => {
      const formData = new FormData();
      formData.set('currentPassword', currentPassword);
      formData.set('newPassword', newPassword);
      formData.set('confirmPassword', confirmPassword);

      const result = await changePassword(formData);
      if (result.error) {
        setPasswordMessage({ type: 'error', text: result.error });
      } else {
        setPasswordMessage({ type: 'success', text: 'Password changed successfully!' });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    });
  }

  const initials = displayName ? displayName.charAt(0).toUpperCase() : email ? email.charAt(0).toUpperCase() : '?';

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-h1 text-text-primary">Profile</h1>

      {/* Avatar section */}
      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-accent/30 bg-accent-muted text-h1 font-bold text-accent">
          {initials}
        </div>
        <div>
          <p className="text-h3 font-semibold text-text-primary">{displayName || 'Anonymous'}</p>
          {email && <p className="text-body-sm text-text-secondary">{email}</p>}
        </div>
      </div>

      <GlowDivider />

      {/* Display Name Form */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-accent" aria-hidden="true" />
              Display Name
            </div>
          </CardTitle>
        </CardHeader>
        <form action={handleSubmit} className="space-y-4">
          <Input
            name="displayName"
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your display name"
            minLength={3}
            maxLength={20}
            required
            hint="3–20 characters, alphanumeric and spaces only"
          />
          {message && (
            <Alert variant={message.type === 'success' ? 'success' : 'error'}>
              {message.text}
            </Alert>
          )}
          <Button type="submit" loading={isPending}>
            Save Changes
          </Button>
        </form>
      </Card>

      {/* Links */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-accent" aria-hidden="true" />
              About
            </div>
          </CardTitle>
        </CardHeader>
        <Link
          href="/badges"
          className="flex items-center justify-between rounded-input p-3 text-body text-text-primary hover:bg-surface-elevated transition-colors"
        >
          <div className="flex items-center gap-3">
            <Award className="h-4 w-4 text-accent" aria-hidden="true" />
            My Badges &amp; Milestones
          </div>
          <ChevronRight className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
        </Link>
        <Link
          href="/rules"
          className="flex items-center justify-between rounded-input p-3 text-body text-text-primary hover:bg-surface-elevated transition-colors"
        >
          <div className="flex items-center gap-3">
            <BookOpen className="h-4 w-4 text-accent" aria-hidden="true" />
            How Scoring Works
          </div>
          <ChevronRight className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
        </Link>
      </Card>

      {/* Change Password */}
      <Card>
        <CardHeader>
          <CardTitle>
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-accent" aria-hidden="true" />
              Change Password
            </div>
          </CardTitle>
        </CardHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handlePasswordChange();
          }}
          className="space-y-4"
        >
          <Input
            label="Current password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          <Input
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            autoComplete="new-password"
            minLength={8}
            hint="Minimum 8 characters"
          />
          <Input
            label="Confirm new password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            minLength={8}
            error={
              confirmPassword && newPassword !== confirmPassword
                ? 'Passwords do not match'
                : undefined
            }
          />
          {passwordMessage && (
            <Alert variant={passwordMessage.type === 'success' ? 'success' : 'error'}>
              {passwordMessage.text}
            </Alert>
          )}
          <Button
            type="submit"
            loading={isPasswordPending}
            disabled={!currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
          >
            Change Password
          </Button>
        </form>
      </Card>

      {/* Sign Out */}
      <Card>
        <Button variant="danger" onClick={handleSignOut} loading={signingOut} className="w-full">
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign Out
        </Button>
      </Card>
    </div>
  );
}
