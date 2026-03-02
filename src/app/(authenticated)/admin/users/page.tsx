'use client';

import { useState, useTransition } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  adminCreateUser,
  removeFromAllowlist,
  adminResendInvite,
} from '../actions';
import { UserPlus, Trash2, RefreshCw } from 'lucide-react';

interface AllowlistEntry {
  id: string;
  email: string;
  created_at: string;
}

export default function AdminUsersPage() {
  const [entries, setEntries] = useState<AllowlistEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmAction, setConfirmAction] = useState<{
    id: string;
    type: 'delete' | 'reset' | 'resend';
  } | null>(null);

  // Load allowlist entries on mount
  if (!loaded) {
    void import('@supabase/ssr').then(({ createBrowserClient }) => {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      void supabase
        .from('allowlist')
        .select('*')
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          setEntries((data as AllowlistEntry[]) ?? []);
          setLoaded(true);
        });
    });
  }

  function handleCreateUser(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await adminCreateUser(formData);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'User created! They will receive an email to set their password.' });
        setLoaded(false);
      }
    });
  }

  function handleRemove(formData: FormData) {
    setMessage(null);
    setConfirmAction(null);
    startTransition(async () => {
      const result = await removeFromAllowlist(formData);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: 'User removed from allowlist.' });
        setLoaded(false);
      }
    });
  }

  function handleResendInvite(email: string) {
    setMessage(null);
    setConfirmAction(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('email', email);
      const result = await adminResendInvite(formData);
      if (result.error) {
        setMessage({ type: 'error', text: result.error });
      } else {
        setMessage({ type: 'success', text: `Invite re-sent to ${email}.` });
      }
    });
  }

  return (
    <div className="space-y-6">
      <h2 className="text-h2 text-text-primary">User Management</h2>

      {/* Create user form */}
      <Card>
        <CardHeader>
          <CardTitle>Create User Account</CardTitle>
        </CardHeader>
        <p className="text-body-sm text-text-secondary mb-4">
          Create a new user account. They will receive an email to set their password.
        </p>
        <form action={handleCreateUser} className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                name="email"
                type="email"
                placeholder="user@example.com"
                label="Email"
                required
              />
            </div>
            <div className="flex-1">
              <Input
                name="displayName"
                type="text"
                placeholder="Display name (optional)"
                label="Display Name"
                maxLength={20}
              />
            </div>
          </div>
          <Button type="submit" loading={isPending}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Create User
          </Button>
        </form>
      </Card>

      {message && (
        <Alert variant={message.type === 'success' ? 'success' : 'error'}>
          {message.text}
        </Alert>
      )}

      {/* User list */}
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <Badge>{entries.length}</Badge>
        </CardHeader>
        {entries.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-secondary">
            No users yet. Create your first user above.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <p className="text-body-sm font-medium text-text-primary">{entry.email}</p>
                  <p className="text-xs text-text-secondary">
                    Added {new Date(entry.created_at).toLocaleDateString('en-GB')}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {confirmAction?.id === entry.id ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-error">
                        {confirmAction.type === 'delete'
                          ? 'Remove?'
                          : confirmAction.type === 'reset'
                            ? 'Reset password?'
                            : 'Resend invite?'}
                      </span>
                      {confirmAction.type === 'delete' ? (
                        <form action={handleRemove}>
                          <input type="hidden" name="id" value={entry.id} />
                          <input type="hidden" name="email" value={entry.email} />
                          <Button type="submit" variant="danger" size="sm" loading={isPending}>
                            Yes
                          </Button>
                        </form>
                      ) : confirmAction.type === 'resend' ? (
                        <Button
                          variant="primary"
                          size="sm"
                          loading={isPending}
                          onClick={() => handleResendInvite(entry.email)}
                        >
                          Yes
                        </Button>
                      ) : null}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setConfirmAction(null)}
                      >
                        No
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setConfirmAction({ id: entry.id, type: 'resend' })
                        }
                        aria-label={`Resend invite to ${entry.email}`}
                        title="Resend invite email"
                      >
                        <RefreshCw className="h-4 w-4 text-text-secondary" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setConfirmAction({ id: entry.id, type: 'delete' })
                        }
                        aria-label={`Remove ${entry.email}`}
                        title="Remove user"
                      >
                        <Trash2 className="h-4 w-4 text-error" aria-hidden="true" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
