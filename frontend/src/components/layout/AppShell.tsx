'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@/hooks/useQuery';
import { api } from '@/lib/api';
import {
  LayoutDashboard,
  Users,
  LogOut,
  Menu,
  X,
  Plus,
  ChevronRight,
  FolderOpen,
  Search,
  Bell,
  Settings,
  Receipt,
  CreditCard,
  UploadCloud,
  History,
  Coins
} from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const { user, logout, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || '';
  const searchParams = useSearchParams();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Parse active group ID from URL
  const groupMatch = pathname.match(/^\/groups\/([^\/]+)/);
  const pathGroupId = groupMatch ? groupMatch[1] : null;

  // Local storage cache for active group ID
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (pathGroupId) {
        setActiveGroupId(pathGroupId);
        localStorage.setItem('splitsmart_last_group_id', pathGroupId);
      } else {
        const cached = localStorage.getItem('splitsmart_last_group_id');
        if (cached) {
          setActiveGroupId(cached);
        }
      }
    }
  }, [pathGroupId]);

  // Fetch active group details
  const { data: activeGroup } = useQuery(
    activeGroupId ? `/groups/${activeGroupId}` : '',
    () => api.get(`/groups/${activeGroupId}`),
    { enabled: !!activeGroupId }
  );

  // Fetch import jobs for active group to show dynamic badge count
  const { data: importJobs } = useQuery(
    activeGroupId ? `/groups/${activeGroupId}/import` : '',
    () => api.get(`/groups/${activeGroupId}/import`),
    { enabled: !!activeGroupId }
  );

  // Compute pending import warnings badge
  const pendingImportsCount = importJobs
    ? importJobs.filter((j: any) => j.status === 'pending' || j.status === 'reviewing').length
    : 0;

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa] text-[#18181b]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!user) {
    return <>{children}</>;
  }

  // Active tab in URL parameter
  const tab = searchParams?.get('tab') || 'expenses';

  // Compute breadcrumb name
  let breadcrumbName = 'Dashboard';
  if (pathname.startsWith('/groups/new') || pathname.startsWith('/dashboard')) {
    breadcrumbName = 'Groups';
  } else if (pathGroupId) {
    if (tab === 'expenses') breadcrumbName = 'Expenses';
    else if (tab === 'balances') breadcrumbName = 'Balances';
    else if (tab === 'import') breadcrumbName = 'CSV Import';
    else if (tab === 'members') breadcrumbName = 'Members';
    else if (tab === 'audit') breadcrumbName = 'Audit Log';
  }

  // Sidebar link items
  const mainWorkspaceLinks = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, isActive: pathname === '/dashboard' },
    { name: 'Groups', href: '/dashboard', icon: Users, isActive: pathname === '/dashboard' },
  ];

  const resolvedGroupSlug = activeGroup?.slug || activeGroupId;

  const groupWorkspaceLinks = resolvedGroupSlug
    ? [
        {
          name: 'Expenses',
          href: `/groups/${resolvedGroupSlug}?tab=expenses`,
          icon: Receipt,
          isActive: !!pathGroupId && tab === 'expenses',
        },
        {
          name: 'Balances',
          href: `/groups/${resolvedGroupSlug}?tab=balances`,
          icon: CreditCard,
          isActive: !!pathGroupId && tab === 'balances',
        },
        {
          name: 'Settlements',
          href: `/groups/${resolvedGroupSlug}?tab=balances`, // settlements goes to balances view
          icon: Coins,
          isActive: false, // passive
        },
      ]
    : [];

  const dataOpsLinks = resolvedGroupSlug
    ? [
        {
          name: 'CSV Import',
          href: `/groups/${resolvedGroupSlug}?tab=import`,
          icon: UploadCloud,
          isActive: !!pathGroupId && tab === 'import',
          badge: pendingImportsCount > 0 ? pendingImportsCount : null,
        },
        {
          name: 'Audit Log',
          href: `/groups/${resolvedGroupSlug}?tab=audit`,
          icon: History,
          isActive: !!pathGroupId && tab === 'audit',
        },
      ]
    : [];

  return (
    <div className="flex min-h-screen bg-[#f8f9fa] text-[#18181b]">
      {/* Mobile menu trigger */}
      <div className="lg:hidden fixed top-3.5 left-4 z-50">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="rounded-lg bg-white border border-slate-200 p-2 text-slate-500 hover:text-slate-800 transition shadow-xs cursor-pointer"
        >
          {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Sidebar - Light neutral theme */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#f4f4f5] border-r border-slate-200 flex flex-col justify-between transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:static lg:translate-x-0'
        }`}
      >
        <div className="flex flex-col flex-1 overflow-y-auto px-4 py-6">
          {/* Brand Logo & Selected Group */}
          <div className="mb-8 px-2 flex flex-col">
            <span className="text-xl font-bold tracking-tight text-[#18181b] flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-[#047857] flex items-center justify-center text-white shrink-0 shadow-xs">
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M12 2L9.12 8.12L2 9.12L7.5 14L5.88 21L12 17.27L18.12 21L16.5 14L22 9.12L14.88 8.12L12 2Z" />
                </svg>
              </span>
              SplitSmart
            </span>
            {activeGroup && (
              <span className="text-xs text-slate-500 font-semibold mt-1 bg-slate-200/50 px-2 py-0.5 rounded-md self-start truncate max-w-full">
                {activeGroup.name}
              </span>
            )}
          </div>

          {/* Navigation Group: Workspace */}
          <div className="space-y-6">
            <div>
              <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Workspace</span>
              <nav className="mt-2 space-y-1">
                {mainWorkspaceLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.name}
                      href={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition cursor-pointer ${
                        link.isActive
                          ? 'bg-[#e4e4e7] text-slate-900'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-[#e4e4e7]/50'
                      }`}
                    >
                      <Icon size={16} className="shrink-0" />
                      {link.name}
                    </Link>
                  );
                })}

                {groupWorkspaceLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.name}
                      href={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold transition cursor-pointer ${
                        link.isActive
                          ? 'bg-[#e4e4e7] text-slate-900'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-[#e4e4e7]/50'
                      }`}
                    >
                      <Icon size={16} className="shrink-0" />
                      {link.name}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Navigation Group: Data & Ops */}
            {dataOpsLinks.length > 0 && (
              <div>
                <span className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Data & ops</span>
                <nav className="mt-2 space-y-1">
                  {dataOpsLinks.map((link) => {
                    const Icon = link.icon;
                    return (
                      <Link
                        key={link.name}
                        href={link.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold transition cursor-pointer ${
                          link.isActive
                            ? 'bg-[#e4e4e7] text-slate-900'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-[#e4e4e7]/50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Icon size={16} className="shrink-0" />
                          <span>{link.name}</span>
                        </div>
                        {link.badge && (
                          <span className="h-5 min-w-5 px-1 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center">
                            {link.badge}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </nav>
              </div>
            )}
          </div>
        </div>

        {/* Footer Profile & Logout */}
        <div className="p-4 border-t border-slate-200/60">
          <div className="flex items-center justify-between gap-3 mb-4 px-2">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0"
                style={{
                  backgroundColor: user.avatarColor || '#a7f3d0',
                  color: user.avatarColor ? '#ffffff' : '#065f46',
                }}
              >
                {user.avatarInitials || user.displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="overflow-hidden">
                <h4 className="text-xs font-bold text-slate-800 truncate">{user.displayName}</h4>
                <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
              </div>
            </div>
            <button className="text-slate-400 hover:text-slate-700 cursor-pointer">
              <Settings size={14} />
            </button>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 transition cursor-pointer"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      {/* Backdrop for Mobile Menu */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden fixed inset-0 z-30 bg-black/30 backdrop-blur-xs"
        ></div>
      )}

      {/* Main Content Area with Header */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Header / Top Bar */}
        <header className="h-14 border-b border-slate-200/60 px-6 lg:px-8 flex items-center justify-between shrink-0 bg-[#ffffff]">
          {/* Left Side: Collapse Button + Breadcrumbs */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
            >
              <Menu size={16} />
            </button>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span className="text-slate-400 font-semibold select-none">SplitSmart</span>
              <span className="text-slate-300 font-normal select-none">/</span>
              <span className="text-slate-700 font-bold select-none">{breadcrumbName}</span>
            </div>
          </div>

          {/* Right Side: Global Search + Notifications + Quick Actions */}
          <div className="flex items-center gap-4">
            {/* Search Input */}
            <div className="relative hidden md:block">
              <input
                type="text"
                placeholder="Search expenses, members..."
                className="w-60 rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 pl-8 text-[11px] text-slate-700 focus:outline-none focus:border-slate-300 placeholder-slate-400"
              />
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                <Search size={10} />
              </span>
            </div>

            {/* Notification Bell */}
            <button className="p-2 rounded-full hover:bg-slate-100 text-slate-500 relative cursor-pointer">
              <Bell size={14} />
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-emerald-600"></span>
            </button>

            {/* Quick action button: New Expense */}
            {resolvedGroupSlug && (
              <button
                onClick={() => {
                  router.push(`/groups/${resolvedGroupSlug}?tab=expenses&action=new-expense`);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-[#047857] hover:bg-[#065f46] px-3.5 py-1.5 text-xs font-semibold text-white transition shadow-xs cursor-pointer"
              >
                <Plus size={14} />
                New expense
              </button>
            )}
          </div>
        </header>

        {/* Dynamic page container */}
        <main className="flex-1 overflow-y-auto bg-white p-6 lg:p-8 relative">
          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
