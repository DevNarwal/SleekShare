'use client';

import { useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@/hooks/useQuery';
import { useSocket } from '@/hooks/useSocket';
import { api } from '@/lib/api';
import ExpenseList from '@/components/expenses/ExpenseList';
import BalancesTab from '@/components/balances/BalancesTab';
import MembersTab from '@/components/members/MembersTab';
import ImportTab from '@/components/import/ImportTab';
import AuditTab from '@/components/audit/AuditTab';
import { Plus } from 'lucide-react';

export default function GroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const groupId = params?.id as string;
  const { joinGroup, leaveGroup } = useSocket();

  // Active tab driven by URL search parameters
  const activeTab = searchParams?.get('tab') || 'expenses';

  // Join and leave Socket.IO rooms matching this group
  useEffect(() => {
    if (groupId) {
      joinGroup(groupId);
      return () => {
        leaveGroup(groupId);
      };
    }
  }, [groupId, joinGroup, leaveGroup]);

  // Fetch group profile details
  const { data: group, loading, error } = useQuery(`/groups/${groupId}`, () => api.get(`/groups/${groupId}`), {
    enabled: !!groupId,
  });

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-slate-400">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-solid border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="text-center py-12 rounded-xl border border-slate-200 bg-white max-w-md mx-auto mt-12 shadow-xs">
        <h3 className="text-lg font-serif font-bold text-slate-800 mb-2">Error Loading Group</h3>
        <p className="text-slate-500 text-sm mb-4">{error?.message || 'Group not found or unauthorized access'}</p>
        <button
          onClick={() => router.push('/dashboard')}
          className="rounded-lg bg-primary hover:opacity-90 px-4 py-2 font-semibold text-white text-sm transition"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const getTabHeader = () => {
    switch (activeTab) {
      case 'expenses':
        return {
          category: 'EXPENSES',
          title: 'Expenses',
          description: 'Every charge ever recorded, grouped by month.',
          action: (
            <button
              onClick={() => router.push(`/groups/${groupId}?tab=expenses&action=new-expense`)}
              className="flex items-center gap-1.5 rounded-lg bg-[#047857] hover:bg-[#065f46] px-3.5 py-1.5 text-xs font-semibold text-white transition shadow-xs cursor-pointer"
            >
              <Plus size={14} />
              New expense
            </button>
          ),
        };
      case 'balances':
        return {
          category: 'MONEY FLOW',
          title: 'Balances',
          description: 'Raw paid vs owed, plus the minimum number of payments that clear the slate.',
          action: (
            <button
              onClick={() => router.push(`/groups/${groupId}?tab=balances&action=record-payment`)}
              className="flex items-center gap-1.5 rounded-lg bg-[#047857] hover:bg-[#065f46] px-3.5 py-1.5 text-xs font-semibold text-white transition shadow-xs cursor-pointer"
            >
              Record payment
            </button>
          ),
        };
      case 'import':
        return {
          category: 'DATA INTEGRITY',
          title: 'CSV Import',
          description: 'Import historical data spreadsheets and review validation anomalies.',
          action: null,
        };
      case 'members':
        return {
          category: 'MEMBERSHIP',
          title: 'Members',
          description: 'Roster directory and active timeline windows for group participants.',
          action: null,
        };
      case 'audit':
        return {
          category: 'SECURITY',
          title: 'Audit Log',
          description: 'Immutable append-only trail of all financial and timeline changes.',
          action: null,
        };
      default:
        return null;
    }
  };

  const header = getTabHeader();

  return (
    <div className="space-y-6">
      {/* Header Info */}
      {header && (
        <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b border-slate-100 pb-5 gap-4">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{header.category}</span>
            <h1 className="text-3xl font-serif font-bold text-slate-800 tracking-tight mt-1">{header.title}</h1>
            <p className="text-xs text-slate-500 mt-1">{header.description}</p>
          </div>
          <div className="shrink-0">{header.action}</div>
        </div>
      )}

      {/* Tab Panel */}
      <div className="pt-2">
        {activeTab === 'expenses' && <ExpenseList groupId={groupId} members={group.members} />}
        {activeTab === 'balances' && <BalancesTab groupId={groupId} members={group.members} />}
        {activeTab === 'members' && <MembersTab groupId={groupId} members={group.members} />}
        {activeTab === 'import' && <ImportTab groupId={groupId} members={group.members} />}
        {activeTab === 'audit' && <AuditTab groupId={groupId} />}
      </div>
    </div>
  );
}
