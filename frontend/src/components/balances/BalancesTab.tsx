'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, invalidateQueries } from '@/hooks/useQuery';
import { api } from '@/lib/api';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowRight,
  Info,
  Calendar,
  AlertCircle,
  Wrench,
  CheckCircle
} from 'lucide-react';

interface Member {
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarInitials?: string;
    avatarColor?: string;
  };
  role: string;
  joinedAt: string;
  leftAt: string | null;
  status: 'ACTIVE' | 'LEFT';
}

interface BalancesTabProps {
  groupId: string;
  members: Member[];
}

export default function BalancesTab({ groupId, members }: BalancesTabProps) {
  const { user } = useAuth();
  
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [settleModal, setSettleModal] = useState<{ from: string; to: string; amount: number } | null>(null);
  const [settleDate, setSettleDate] = useState(new Date().toISOString().split('T')[0]);
  const [settleNote, setSettleNote] = useState('');
  const [settleError, setSettleError] = useState('');

  // Editable Form States
  const [payerId, setPayerId] = useState('');
  const [receiverId, setReceiverId] = useState('');
  const [amount, setAmount] = useState('');

  // Listen to the URL action=record-payment parameter
  useEffect(() => {
    const action = searchParams?.get('action');
    if (action === 'record-payment') {
      if (!settleModal) {
        setSettleModal({ from: '', to: '', amount: 0 });
      }
    } else {
      if (settleModal && !settleModal.from && !settleModal.to) {
        setSettleModal(null);
      }
    }
  }, [searchParams]);

  // Sync editable form states when settleModal changes
  useEffect(() => {
    if (settleModal) {
      setPayerId(settleModal.from || '');
      setReceiverId(settleModal.to || '');
      setAmount(settleModal.amount > 0 ? String(settleModal.amount) : '');
    } else {
      setPayerId('');
      setReceiverId('');
      setAmount('');
    }
  }, [settleModal]);

  const handleCloseModal = () => {
    setSettleModal(null);
    setSettleNote('');
    setSettleError('');
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.delete('action');
    router.replace(`${pathname}?${params.toString()}`);
  };

  const checkMemberActiveOnDate = (m: Member, dateStr: string) => {
    const checkDate = new Date(dateStr);
    checkDate.setHours(0, 0, 0, 0);

    const joined = new Date(m.joinedAt);
    joined.setHours(0, 0, 0, 0);

    const left = m.leftAt ? new Date(m.leftAt) : null;
    if (left) {
      left.setHours(0, 0, 0, 0);
    }

    return joined <= checkDate && (left === null || left >= checkDate);
  };
  
  // Explain states
  const [explainFrom, setExplainFrom] = useState(user?.id || '');
  const [explainTo, setExplainTo] = useState('');
  const [explainTrigger, setExplainTrigger] = useState(false);

  // Raw balances query
  const { data: rawData, loading: rawLoading } = useQuery(`/groups/${groupId}/balances/raw`, () =>
    api.get(`/groups/${groupId}/balances/raw`)
  );

  // Simplified balances query
  const { data: simplifiedData, loading: simplifiedLoading } = useQuery(`/groups/${groupId}/balances/simplified`, () =>
    api.get(`/groups/${groupId}/balances/simplified`)
  );

  // Explained balances query (conditional on selections)
  const explainKey = explainTrigger && explainFrom && explainTo ? `/groups/${groupId}/balances/explain?userId=${explainFrom}&targetUserId=${explainTo}` : '';
  const { data: explainData, loading: explainLoading, refetch: refetchExplain } = useQuery(
    explainKey,
    () => api.get(`/groups/${groupId}/balances/explain?userId=${explainFrom}&targetUserId=${explainTo}`),
    { enabled: !!explainKey }
  );

  // Create settlement mutation
  const { mutate: recordSettlement, loading: settling } = useMutation(
    (payload: any) => api.post(`/groups/${groupId}/settlements`, payload),
    {
      onSuccess: () => {
        invalidateQueries(`/groups/${groupId}/balances`);
        invalidateQueries(`/groups/${groupId}/settlements`);
        handleCloseModal();
        if (explainTrigger) refetchExplain().catch(() => {});
      },
      onError: (err) => {
        setSettleError(err.message || 'Settlement failed');
      },
    }
  );

  // Rebuild ledger mutation (Admin only)
  const { mutate: rebuildLedger, loading: rebuilding } = useMutation(
    () => api.post(`/groups/${groupId}/balances/rebuild-ledger`, {}),
    {
      onSuccess: () => {
        alert('Group ledger rebuilt successfully!');
        invalidateQueries(`/groups/${groupId}/balances`);
        if (explainTrigger) refetchExplain().catch(() => {});
      },
      onError: (err) => {
        alert(err.message || 'Ledger rebuild failed');
      },
    }
  );

  const handleSettleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSettleError('');

    if (!payerId) {
      setSettleError('Sender (payer) is required');
      return;
    }
    if (!receiverId) {
      setSettleError('Receiver is required');
      return;
    }
    if (payerId === receiverId) {
      setSettleError('Sender and receiver cannot be the same user');
      return;
    }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setSettleError('Settlement amount must be greater than 0');
      return;
    }

    const payerMember = members.find((m) => m.user.id === payerId);
    if (payerMember && !checkMemberActiveOnDate(payerMember, settleDate)) {
      setSettleError(`The sender (${payerMember.user.displayName}) was not an active member on the settlement date (${settleDate})`);
      return;
    }

    const receiverMember = members.find((m) => m.user.id === receiverId);
    if (receiverMember && !checkMemberActiveOnDate(receiverMember, settleDate)) {
      setSettleError(`The receiver (${receiverMember.user.displayName}) was not an active member on the settlement date (${settleDate})`);
      return;
    }

    recordSettlement({
      fromUserId: payerId,
      toUserId: receiverId,
      amountInr: amt,
      settlementDate: new Date(settleDate).toISOString(),
      note: settleNote.trim() || undefined,
    });
  };

  const getUserName = (id: string) => {
    return members.find((m) => m.user.id === id)?.user.displayName || 'Unknown';
  };

  const isAdmin = members.find((m) => m.user.id === user?.id)?.role?.toUpperCase() === 'ADMIN';

  return (
    <div className="space-y-8 text-sm font-sans">
      {/* Admin Operations Section */}
      {isAdmin && (
        <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-2 text-slate-700">
            <Wrench size={16} className="text-[#047857]" />
            <span className="font-bold text-xs uppercase tracking-wider text-slate-500">Admin Controls</span>
          </div>
          <button
            onClick={() => {
              if (confirm('Rebuilding the ledger will recalculate all group balances from source records. Proceed?')) {
                rebuildLedger();
              }
            }}
            disabled={rebuilding}
            className="rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-3 py-1.5 font-semibold text-xs transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            {rebuilding ? 'Rebuilding...' : 'Rebuild Group Ledger'}
          </button>
        </div>
      )}

      {/* Main Grid: Raw vs Simplified */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Section 1: Raw Balances */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-xs">
          <h3 className="text-base font-bold text-slate-900 font-serif">Member Net Balances</h3>
          
          {rawLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-solid border-[#047857] border-t-transparent"></div>
            </div>
          ) : rawData?.members?.length > 0 ? (
            <div className="space-y-4">
              {rawData.members.map((m: any) => {
                const isPositive = m.netBalance >= 0;
                return (
                  <div key={m.user.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 border border-slate-100">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ backgroundColor: m.user.avatarColor || '#047857' }}
                      >
                        {m.user.avatarInitials || m.user.displayName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-900">{m.user.displayName}</h4>
                        <div className="flex gap-2.5 text-[10px] text-slate-500 mt-0.5 font-semibold">
                          <span>Paid: ₹{m.totalPaid.toFixed(2)}</span>
                          <span>Owed: ₹{m.totalOwed.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <span className={`font-bold text-base ${isPositive ? 'text-[#047857]' : 'text-red-600'}`}>
                        {isPositive ? '+' : ''}₹{m.netBalance.toFixed(2)}
                      </span>
                      <p className="text-[10px] text-slate-500 font-semibold mt-0.5">{isPositive ? 'credited' : 'debtor'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-slate-500 text-center py-6">No balances recorded.</p>
          )}
        </div>

        {/* Section 2: Simplified Cash Flow Balances */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-xs">
          <h3 className="text-base font-bold text-slate-900 font-serif">Simplified Transfers</h3>
          
          {/* Informational Alert Box */}
          <div className="flex items-start gap-3 p-3.5 rounded-xl border border-blue-100 bg-blue-50/50 text-blue-800 text-xs leading-relaxed">
            <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Optimized Settlements:</span> SplitSmart uses a greedy transfers algorithm to minimize the absolute number of transactions needed to settle all outstanding balances.
            </div>
          </div>
          
          {simplifiedLoading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-solid border-[#047857] border-t-transparent"></div>
            </div>
          ) : simplifiedData?.transfers?.length > 0 ? (
            <div className="space-y-4">
              {simplifiedData.transfers.map((t: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 border border-slate-100">
                  <div className="flex items-center gap-2 flex-wrap text-slate-700">
                    <span className="font-semibold text-slate-900">{getUserName(t.from)}</span>
                    <ArrowRight size={14} className="text-slate-400 shrink-0" />
                    <span className="font-semibold text-slate-900">{getUserName(t.to)}</span>
                    <span className="text-slate-500">owes</span>
                    <span className="font-bold text-[#047857]">₹{t.amount.toFixed(2)}</span>
                  </div>
                  
                  <button
                    onClick={() => setSettleModal({ from: t.from, to: t.to, amount: t.amount })}
                    className="rounded-lg bg-[#047857] hover:bg-[#065f46] px-3 py-1.5 text-xs font-semibold text-white transition cursor-pointer"
                  >
                    Settle Up
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 flex flex-col items-center gap-2 bg-slate-50/50 border border-dashed border-slate-200 rounded-xl">
              <CheckCircle size={32} className="text-[#047857]" />
              <h4 className="font-bold text-slate-900 font-serif">All Settled!</h4>
              <p className="text-slate-500 text-xs">There are no outstanding debts in this group.</p>
            </div>
          )}
        </div>
      </div>

      {/* Section 3: Detailed Ledger Audit (Why You Owe Drilldown) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-5 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 font-serif">Pair-wise balance drilldown</h3>
        <p className="text-xs text-slate-500 -mt-3">Audit the exact history of transactions between any two members.</p>
        
        <div className="flex flex-col sm:flex-row gap-3 items-end">
          <div className="w-full sm:w-1/3">
            <label className="block text-slate-700 font-semibold mb-1 text-xs">From (Member A)</label>
            <select
              className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-slate-800 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] cursor-pointer"
              value={explainFrom}
              onChange={(e) => {
                setExplainFrom(e.target.value);
                setExplainTrigger(false);
              }}
            >
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>{m.user.displayName}</option>
              ))}
            </select>
          </div>

          <div className="w-full sm:w-1/3">
            <label className="block text-slate-700 font-semibold mb-1 text-xs">To (Member B)</label>
            <select
              className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-slate-800 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] cursor-pointer"
              value={explainTo}
              onChange={(e) => {
                setExplainTo(e.target.value);
                setExplainTrigger(false);
              }}
            >
              <option value="">Select Member</option>
              {members.filter((m) => m.user.id !== explainFrom).map((m) => (
                <option key={m.user.id} value={m.user.id}>{m.user.displayName}</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setExplainTrigger(true)}
            disabled={!explainFrom || !explainTo}
            className="w-full sm:w-auto rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-5 py-2 font-semibold transition disabled:opacity-30 cursor-pointer"
          >
            Explain Balance
          </button>
        </div>

        {/* Drilldown results */}
        {explainTrigger && (
          <div className="border border-slate-200 bg-slate-50/30 rounded-xl p-4 mt-4">
            {explainLoading ? (
              <div className="flex justify-center py-6">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-solid border-[#047857] border-t-transparent"></div>
              </div>
            ) : explainData ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center bg-white border border-slate-200 rounded-lg p-3 shadow-xs">
                  <span className="font-bold text-slate-700">Net Position:</span>
                  <span className={`font-bold text-base ${explainData.netAmount >= 0 ? 'text-red-600' : 'text-[#047857]'}`}>
                    {explainData.netAmount >= 0 
                      ? `${getUserName(explainFrom)} owes ${getUserName(explainTo)} ₹${explainData.netAmount.toFixed(2)}`
                      : `${getUserName(explainTo)} owes ${getUserName(explainFrom)} ₹${Math.abs(explainData.netAmount).toFixed(2)}`
                    }
                  </span>
                </div>

                {explainData.lines?.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 font-semibold uppercase">
                          <th className="py-2.5">Date</th>
                          <th className="py-2.5">Type</th>
                          <th className="py-2.5">Description</th>
                          <th className="py-2.5 text-right font-semibold text-[#047857]">Contribution (INR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {explainData.lines.map((line: any, idx: number) => {
                          const isOwed = line.amount >= 0;
                          return (
                            <tr key={idx} className="hover:bg-slate-50/40">
                              <td className="py-3 whitespace-nowrap text-slate-500">
                                {new Date(line.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                              </td>
                              <td className="py-3 whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase border ${
                                  line.type === 'expense' 
                                    ? 'bg-[#047857]/10 text-[#047857] border-[#047857]/20'
                                    : 'bg-blue-50 text-blue-700 border-blue-200'
                                }`}>
                                  {line.type}
                                </span>
                              </td>
                              <td className="py-3 text-slate-800 font-medium">{line.description || 'No notes'}</td>
                              <td className={`py-3 text-right font-bold ${isOwed ? 'text-red-600' : 'text-[#047857]'}`}>
                                {isOwed ? '+' : '-'}₹{Math.abs(line.amount).toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-slate-500 text-center py-4">No direct ledger contributions found.</p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Settle Up Dialog */}
      {settleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div onClick={handleCloseModal} className="absolute inset-0 bg-black/40 backdrop-blur-xs"></div>
          
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl relative z-10 overflow-hidden">
            <h3 className="text-lg font-bold text-slate-900 font-serif mb-4">Record Settlement</h3>
            
            {settleError && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                {settleError}
              </div>
            )}

            <form onSubmit={handleSettleSubmit} className="space-y-4">
              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-xs">Sender (Who Pays) *</label>
                <select
                  required
                  className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-slate-700 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] cursor-pointer"
                  value={payerId}
                  onChange={(e) => setPayerId(e.target.value)}
                >
                  <option value="">Select Payer</option>
                  {members.map((m) => {
                    const isActive = checkMemberActiveOnDate(m, settleDate);
                    return (
                      <option key={m.user.id} value={m.user.id} disabled={!isActive}>
                        {m.user.displayName} {!isActive ? '(Inactive on date)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-xs">Receiver (Who is Paid) *</label>
                <select
                  required
                  className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-slate-700 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] cursor-pointer"
                  value={receiverId}
                  onChange={(e) => setReceiverId(e.target.value)}
                >
                  <option value="">Select Receiver</option>
                  {members
                    .filter((m) => m.user.id !== payerId)
                    .map((m) => {
                      const isActive = checkMemberActiveOnDate(m, settleDate);
                      return (
                        <option key={m.user.id} value={m.user.id} disabled={!isActive}>
                          {m.user.displayName} {!isActive ? '(Inactive on date)' : ''}
                        </option>
                      );
                    })}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-xs">Amount (INR) *</label>
                <input
                  type="number"
                  step="any"
                  required
                  className="w-full rounded-lg bg-white border border-slate-200 px-3.5 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] transition"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-xs">Settlement Date *</label>
                <input
                  type="date"
                  required
                  className="w-full rounded-lg bg-white border border-slate-200 px-3.5 py-2 text-slate-800 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857]"
                  value={settleDate}
                  onChange={(e) => setSettleDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-xs">Note</label>
                <input
                  type="text"
                  className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-slate-800 focus:outline-none placeholder-slate-400"
                  placeholder="Settle debts cash transaction..."
                  value={settleNote}
                  onChange={(e) => setSettleNote(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="rounded-lg bg-white border border-slate-200 px-4 py-2.5 text-slate-700 hover:bg-slate-50 transition cursor-pointer text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settling}
                  className="rounded-lg bg-[#047857] hover:bg-[#065f46] px-4 py-2.5 font-semibold text-white transition disabled:opacity-50 cursor-pointer text-xs flex items-center gap-1.5"
                >
                  {settling ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
