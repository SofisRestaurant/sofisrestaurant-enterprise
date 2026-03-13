import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase/supabaseClient';
import { Button } from '@/components/ui/Button';

function hasRecoveryParams(): boolean {
  const hash = window.location.hash;
  const search = window.location.search;

  return (
    hash.includes('access_token=') ||
    hash.includes('refresh_token=') ||
    hash.includes('type=recovery') ||
    search.includes('code=')
  );
}

export default function UpdatePassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const init = async (): Promise<void> => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            if (isMounted) {
              setStatus('This password reset link is invalid or expired.');
              setReady(false);
            }
            return;
          }
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!isMounted) return;

        if (session || hasRecoveryParams()) {
          setReady(true);
        } else {
          setStatus('This password reset link is invalid or expired.');
          setReady(false);
        }
      } catch {
        if (!isMounted) return;
        setStatus('Could not open password reset. Please request a new reset link.');
        setReady(false);
      }
    };

    void init();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      if (event === 'PASSWORD_RECOVERY' || !!session) {
        setReady(true);
        setStatus(null);
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const isValid = useMemo(() => {
    if (password.length < 8) return false;
    if (password !== confirmPassword) return false;
    return true;
  }, [password, confirmPassword]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setStatus(null);

    if (password.length < 8) {
      setStatus('Password must be at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setStatus('Passwords do not match.');
      return;
    }

    setIsSaving(true);

    const { error } = await supabase.auth.updateUser({ password });

    setIsSaving(false);

    if (error) {
      setStatus(error.message);
      return;
    }

    setStatus('✅ Password updated successfully!');

    setTimeout(() => {
      void navigate('/');
    }, 2000);
  };

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900">Set a new password</h1>
      <p className="mt-2 text-sm text-gray-600">
        Choose a new password to regain access to your account.
      </p>

      {!ready ? (
        <div className="mt-6 rounded-xl border bg-white p-4 text-sm text-gray-700">
          {status ?? 'Opening password reset…'}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-800">New password</label>
            <input
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
              disabled={isSaving}
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-800">Confirm password</label>
            <input
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              autoComplete="new-password"
              disabled={isSaving}
            />
          </div>

          <Button
            type="submit"
            disabled={!isValid || isSaving}
            variant="primary"
            className="w-full"
          >
            {isSaving ? 'Updating…' : 'Update password'}
          </Button>

          {status && (
            <p
              className={`pt-2 text-sm ${
                status.startsWith('✅') ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {status}
            </p>
          )}
        </form>
      )}
    </div>
  );
}