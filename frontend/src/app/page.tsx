'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace('/dashboard');
      } else {
        router.replace('/login');
      }
    }
  }, [user, loading, router]);

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-[#0b0f19] text-[#f3f4f6]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-solid border-cyan-glow border-t-transparent"></div>
        <h1 className="text-xl font-medium tracking-wide text-glow-cyan text-cyan-glow animate-pulse">Loading SplitSmart...</h1>
      </div>
    </div>
  );
}
