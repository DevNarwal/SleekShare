'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

export default function RegisterPage() {
  const { user, register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      router.replace('/dashboard');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setError('Please fill in all fields');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await register(name, email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa] px-4 font-sans">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl relative overflow-hidden">
        {/* Decorative subtle accent */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#047857]"></div>

        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 font-serif">
            Split<span className="text-[#047857]">Smart</span>
          </h2>
          <p className="mt-2 text-xs font-semibold text-slate-500">Join SplitSmart and start tracking expenses in real-time</p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600 font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="name">
              Full Name
            </label>
            <input
              id="name"
              type="text"
              required
              className="w-full rounded-lg bg-white border border-slate-200 px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] transition"
              placeholder="Aisha Patel"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              className="w-full rounded-lg bg-white border border-slate-200 px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] transition"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              className="w-full rounded-lg bg-white border border-slate-200 px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] transition"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-[#047857] hover:bg-[#065f46] py-3 font-semibold text-white transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-solid border-white border-t-transparent"></div>
                Creating Account...
              </>
            ) : (
              'Sign Up'
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm font-semibold">
          <span className="text-slate-500">Already have an account? </span>
          <Link href="/login" className="text-[#047857] hover:underline">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
