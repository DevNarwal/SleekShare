'use client';

import { useState } from 'react';
import { useQuery, useMutation, invalidateQueries } from '@/hooks/useQuery';
import { api } from '@/lib/api';
import AddExpenseModal from './AddExpenseModal';
import ExpenseComments from './ExpenseComments';
import { Search, Plus, MessageSquare, Trash2, Edit3, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';

interface Member {
  user: {
    id: string;
    email: string;
    displayName: string;
  };
  role: string;
  joinedAt: string;
  leftAt: string | null;
  status: 'ACTIVE' | 'LEFT';
}

interface ExpenseListProps {
  groupId: string;
  members: Member[];
}

export default function ExpenseList({ groupId, members }: ExpenseListProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [selectedFlag, setSelectedFlag] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [commentsExpense, setCommentsExpense] = useState<any | null>(null);

  // Build query parameters dynamically
  const flagsParam = selectedFlag ? `&flags=${selectedFlag}` : '';
  const categoryParam = category ? `&category=${category}` : '';
  const searchParam = search ? `&search=${encodeURIComponent(search)}` : '';
  
  const { data: expensesRes, loading } = useQuery(
    `/groups/${groupId}/expenses?page=${page}&limit=10${searchParam}${categoryParam}${flagsParam}`,
    () => api.get(`/groups/${groupId}/expenses?page=${page}&limit=10${searchParam}${categoryParam}${flagsParam}`)
  );

  // Delete expense mutation
  const { mutate: deleteExpense } = useMutation(
    (expenseId: string) => api.delete(`/groups/${groupId}/expenses/${expenseId}`),
    {
      onSuccess: () => {
        invalidateQueries(`/groups/${groupId}/expenses`);
        invalidateQueries(`/groups/${groupId}/balances`);
        if (commentsExpense) setCommentsExpense(null);
      },
    }
  );

  const handleEdit = (expense: any) => {
    setEditingExpense(expense);
  };

  const categories = ['General', 'Food', 'Travel', 'Lodging', 'Entertainment', 'Utilities', 'Others'];

  return (
    <div className="space-y-6">
      {/* Search & Filters Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:max-w-xs">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
            <Search size={16} />
          </span>
          <input
            type="text"
            className="w-full rounded-lg bg-white border border-slate-200 pl-10 pr-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] transition font-sans"
            placeholder="Search description..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          {/* Category Selector */}
          <select
            className="rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] w-full sm:w-auto font-sans cursor-pointer"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Flags Selector */}
          <select
            className="rounded-lg bg-white border border-slate-200 px-3 py-2 text-xs text-slate-700 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] w-full sm:w-auto font-sans cursor-pointer"
            value={selectedFlag}
            onChange={(e) => {
              setSelectedFlag(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Flags</option>
            <option value="foreign_currency">Foreign Currency</option>
            <option value="import_warning">Import Anomaly</option>
          </select>

          <button
            onClick={() => setAddModalOpen(true)}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-[#047857] hover:bg-[#065f46] px-4 py-2 text-xs font-semibold text-white transition cursor-pointer shrink-0 font-sans"
          >
            <Plus size={14} />
            Add Expense
          </button>
        </div>
      </div>

      {/* Expenses Table */}
      {loading ? (
        <div className="flex py-12 justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#047857] border-t-transparent"></div>
        </div>
      ) : expensesRes && expensesRes.data?.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold text-xs uppercase tracking-wider font-sans">
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Description</th>
                <th className="px-6 py-4">Category</th>
                <th className="px-6 py-4">Paid By</th>
                <th className="px-6 py-4">Original Amount</th>
                <th className="px-6 py-4 text-[#047857]">INR Value</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {expensesRes.data.map((expense: any) => {
                const payer = members.find((m) => m.user.id === expense.paidBy)?.user.displayName || 'Unknown';
                const originalAmt = Number(expense.amountOriginal);
                const baseAmt = Number(expense.amountBaseInr);
                const isForeign = expense.currencyCode !== 'INR';

                return (
                  <tr
                    key={expense.id}
                    onClick={() => setCommentsExpense(expense)}
                    className="hover:bg-slate-50/50 transition duration-150 cursor-pointer"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                      {new Date(expense.expenseDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      <div className="flex flex-col">
                        <span>{expense.description}</span>
                        {expense.flags?.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {expense.flags.map((f: string) => (
                              <span key={f} className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                                {f.replace('_', ' ')}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                        {expense.category || 'General'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-slate-600">{payer}</td>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-600">
                      {isForeign ? `${expense.currencyCode} ${originalAmt.toFixed(2)}` : `₹${originalAmt.toFixed(2)}`}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap font-bold text-[#047857]">
                      ₹{baseAmt.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setCommentsExpense(expense)}
                          className="rounded p-1.5 text-slate-400 hover:text-slate-700 transition cursor-pointer hover:bg-slate-100"
                          title="Open Comments"
                        >
                          <MessageSquare size={15} />
                        </button>
                        <button
                          onClick={() => handleEdit(expense)}
                          className="rounded p-1.5 text-slate-400 hover:text-slate-700 transition cursor-pointer hover:bg-slate-100"
                          title="Edit"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this expense?')) {
                              deleteExpense(expense.id);
                            }
                          }}
                          className="rounded p-1.5 text-slate-400 hover:text-red-600 transition cursor-pointer hover:bg-red-50"
                          title="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Pagination Controls */}
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between font-sans">
            <span className="text-xs text-slate-500">
              Page {expensesRes.page} of {Math.max(1, Math.ceil(expensesRes.total / 10))} ({expensesRes.total} total)
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="rounded-lg bg-white border border-slate-200 p-1.5 text-slate-500 hover:text-slate-800 transition cursor-pointer disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-50"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={page >= Math.ceil(expensesRes.total / 10)}
                onClick={() => setPage(page + 1)}
                className="rounded-lg bg-white border border-slate-200 p-1.5 text-slate-500 hover:text-slate-800 transition cursor-pointer disabled:opacity-30 disabled:pointer-events-none hover:bg-slate-50"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-16 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
          <p className="text-slate-500 text-sm font-sans">No expenses found matching the selected filters.</p>
        </div>
      )}

      {/* Add Modal */}
      {addModalOpen && (
        <AddExpenseModal
          groupId={groupId}
          members={members}
          onClose={() => setAddModalOpen(false)}
        />
      )}

      {/* Edit Modal */}
      {editingExpense && (
        <AddExpenseModal
          groupId={groupId}
          members={members}
          expense={editingExpense}
          onClose={() => setEditingExpense(null)}
        />
      )}

      {/* Comments Drawer */}
      {commentsExpense && (
        <ExpenseComments
          expenseId={commentsExpense.id}
          expenseDescription={commentsExpense.description}
          onClose={() => setCommentsExpense(null)}
        />
      )}
    </div>
  );
}
