'use client';

import { Suspense } from 'react';
import AppShell from '@/components/layout/AppShell';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa] text-[#18181b]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#047857] border-t-transparent"></div>
      </div>
    }>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
