'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Network } from 'lucide-react';
import { motion } from 'framer-motion';

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState(searchParams.get('token') ?? '');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [verified, setVerified] = useState(false);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await apiClient.post('/auth/verify-email', { token });
      setVerified(true);
    } catch (err) {
      const e = err as { response?: { data?: { error?: { message?: string } } } };
      setError(e.response?.data?.error?.message || 'Verification failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-sm rounded-2xl border border-border/50 bg-background/80 p-8 shadow-xl backdrop-blur-xl"
    >
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
          <Network className="h-6 w-6 text-primary-foreground" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Verify Email</h1>
        <p className="text-sm text-muted-foreground mt-1">Paste the verification token sent to your email</p>
      </div>

      {verified ? (
        <div className="space-y-4 text-center">
          <div className="rounded-md bg-success/15 p-3 text-sm text-success font-medium">
            Email verified. You can now sign in.
          </div>
          <a href="/login" className="block text-sm text-primary hover:underline">
            Go to Sign In
          </a>
        </div>
      ) : (
        <form onSubmit={handleVerify} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive font-medium text-center">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium leading-none" htmlFor="token">
              Verification Token
            </label>
            <input
              id="token"
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-shadow"
            />
          </div>

          <Button type="submit" className="w-full mt-2" disabled={isLoading}>
            {isLoading ? 'Verifying...' : 'Verify Email'}
          </Button>
        </form>
      )}
    </motion.div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4">
      <Suspense>
        <VerifyEmailForm />
      </Suspense>
      <div className="mt-8 text-center text-xs text-muted-foreground/60">
        Jayant Acharya.
      </div>
    </div>
  );
}
