'use client';

import { useState, useEffect } from 'react';
import { useMutation, invalidateQueries } from '@/hooks/useQuery';
import { api } from '@/lib/api';
import { X, Calendar, AlertTriangle } from 'lucide-react';

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

interface AddExpenseModalProps {
  groupId: string;
  members: Member[];
  expense?: any; // If provided, we are in edit mode
  onClose: () => void;
}

export default function AddExpenseModal({ groupId, members, expense, onClose }: AddExpenseModalProps) {
  const isEdit = !!expense;
  
  // Form States
  const [description, setDescription] = useState(expense?.description || '');
  const [amountOriginal, setAmountOriginal] = useState(expense?.amountOriginal ? String(expense.amountOriginal) : '');
  const [currencyCode, setCurrencyCode] = useState(expense?.currencyCode || 'INR');
  const [exchangeRate, setExchangeRate] = useState(expense?.exchangeRate ? String(expense.exchangeRate) : '1.0');
  const [paidBy, setPaidBy] = useState(expense?.paidBy || members[0]?.user.id || '');
  const [expenseDate, setExpenseDate] = useState(
    expense?.expenseDate ? new Date(expense.expenseDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
  );
  const [splitMethod, setSplitMethod] = useState<'EQUAL' | 'UNEQUAL' | 'PERCENTAGE' | 'SHARE'>(
    expense?.splitMethod || 'EQUAL'
  );
  const [category, setCategory] = useState(expense?.category || 'General');
  const [notes, setNotes] = useState(expense?.notes || '');
  
  // Selected participants state
  // Map user ID to participating metadata (selected, value for unequal/percentage/share)
  const [participants, setParticipants] = useState<
    Record<string, { selected: boolean; value: string }>
  >({});

  const [error, setError] = useState('');

  // Seed participants state from group members or editing expense
  useEffect(() => {
    const initialParticipants: Record<string, { selected: boolean; value: string }> = {};
    
    // Default: select all group members who are active on this date
    members.forEach((m) => {
      // Find matching participant in editing expense if in edit mode
      const match = expense?.participants?.find((p: any) => p.userId === m.user.id);
      
      const isActive = checkMemberActiveOnDate(m, expenseDate);
      
      if (isEdit) {
        initialParticipants[m.user.id] = {
          selected: !!match,
          value: match
            ? splitMethod === 'UNEQUAL'
              ? String(match.shareAmountInr / (expense.exchangeRate || 1))
              : String(match.shareUnits || '')
            : '',
        };
      } else {
        initialParticipants[m.user.id] = {
          selected: isActive,
          value: '',
        };
      }
    });

    setParticipants(initialParticipants);
  }, [members, expense, isEdit, expenseDate]);

  // Set default exchange rates
  useEffect(() => {
    if (currencyCode === 'INR') {
      setExchangeRate('1.0');
    } else if (expense?.currencyCode === currencyCode) {
      setExchangeRate(String(expense.exchangeRate));
    } else {
      const defaultRates: Record<string, string> = {
        USD: '83.50',
        EUR: '90.00',
        GBP: '105.00',
        SGD: '61.50',
        AED: '22.75',
      };
      setExchangeRate(defaultRates[currencyCode] || '1.0');
    }
  }, [currencyCode, expense]);

  // Timeline validator helper
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

  const handleParticipantSelectToggle = (userId: string) => {
    setParticipants((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        selected: !prev[userId].selected,
      },
    }));
  };

  const handleParticipantValueChange = (userId: string, val: string) => {
    setParticipants((prev) => ({
      ...prev,
      [userId]: {
        ...prev[userId],
        value: val,
      },
    }));
  };

  // Add / Edit expense API call
  const { mutate: saveExpense, loading: saving } = useMutation(
    (payload: any) =>
      isEdit
        ? api.patch(`/groups/${groupId}/expenses/${expense.id}`, payload)
        : api.post(`/groups/${groupId}/expenses`, payload),
    {
      onSuccess: () => {
        invalidateQueries(`/groups/${groupId}/expenses`);
        invalidateQueries(`/groups/${groupId}/balances`);
        onClose();
      },
      onError: (err) => {
        setError(err.message || 'Failed to save expense');
      },
    }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Basic Validation
    if (!description.trim()) {
      setError('Description is required');
      return;
    }
    const amt = parseFloat(amountOriginal);
    if (isNaN(amt) || amt <= 0) {
      setError('Amount must be a positive number');
      return;
    }

    // Timeline Payer Check
    const payerMember = members.find((m) => m.user.id === paidBy);
    if (!payerMember || !checkMemberActiveOnDate(payerMember, expenseDate)) {
      setError(`The payer (${payerMember?.user.displayName || 'Selected user'}) was not an active member on ${expenseDate}`);
      return;
    }

    // Selected participants check
    const selectedParticipantsList = Object.entries(participants)
      .filter(([_, data]) => data.selected)
      .map(([userId, data]) => ({ userId, ...data }));

    if (selectedParticipantsList.length === 0) {
      setError('At least one participant must be selected');
      return;
    }

    // Check timeline for all selected participants
    for (const p of selectedParticipantsList) {
      const member = members.find((m) => m.user.id === p.userId);
      if (!member || !checkMemberActiveOnDate(member, expenseDate)) {
        setError(`Participant (${member?.user.displayName}) was not active on the expense date (${expenseDate})`);
        return;
      }
    }

    // Split math validation
    const payloadParticipants: any[] = [];
    
    if (splitMethod === 'EQUAL') {
      selectedParticipantsList.forEach((p) => {
        payloadParticipants.push({ userId: p.userId });
      });
    } else if (splitMethod === 'UNEQUAL') {
      let sum = 0;
      for (const p of selectedParticipantsList) {
        const val = parseFloat(p.value);
        if (isNaN(val) || val < 0) {
          setError(`Please specify a valid share amount for all checked participants`);
          return;
        }
        sum += val;
        payloadParticipants.push({ userId: p.userId, shareAmount: val });
      }
      
      // Allow slight floating point tolerance (e.g. 0.02)
      if (Math.abs(sum - amt) > 0.05) {
        setError(`Sum of share amounts (₹${sum.toFixed(2)}) must equal the total amount (₹${amt.toFixed(2)})`);
        return;
      }
    } else if (splitMethod === 'PERCENTAGE') {
      let sum = 0;
      for (const p of selectedParticipantsList) {
        const val = parseFloat(p.value);
        if (isNaN(val) || val < 0) {
          setError(`Please specify a valid percentage for all checked participants`);
          return;
        }
        sum += val;
        payloadParticipants.push({ userId: p.userId, shareUnits: val });
      }

      if (Math.abs(sum - 100.0) > 0.05) {
        setError(`Percentages must sum to exactly 100% (currently ${sum.toFixed(2)}%)`);
        return;
      }
    } else if (splitMethod === 'SHARE') {
      let sum = 0;
      for (const p of selectedParticipantsList) {
        const val = parseFloat(p.value);
        if (isNaN(val) || val <= 0) {
          setError(`Please specify valid share units (> 0) for all checked participants`);
          return;
        }
        sum += val;
        payloadParticipants.push({ userId: p.userId, shareUnits: val });
      }
    }

    const rate = parseFloat(exchangeRate);
    if (currencyCode !== 'INR' && (isNaN(rate) || rate <= 0)) {
      setError('Exchange rate is required for non-INR currencies');
      return;
    }

    const payload = {
      description: description.trim(),
      amountOriginal: amt,
      currencyCode: currencyCode.toUpperCase(),
      exchangeRate: currencyCode === 'INR' ? 1.0 : rate,
      paidBy,
      expenseDate: new Date(expenseDate).toISOString(),
      splitMethod,
      participants: payloadParticipants,
      category,
      notes: notes.trim() || undefined,
    };

    saveExpense(payload);
  };

  const categories = ['General', 'Food', 'Travel', 'Lodging', 'Entertainment', 'Utilities', 'Others'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div onClick={onClose} className="absolute inset-0 bg-black/40 backdrop-blur-xs"></div>

      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl relative z-10 max-h-[90vh] overflow-y-auto no-scrollbar">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <h3 className="text-xl font-bold text-slate-900 font-serif">{isEdit ? 'Edit Expense' : 'Add New Expense'}</h3>
          <button
            onClick={onClose}
            className="rounded-lg bg-white border border-slate-200 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600 flex gap-2 items-start font-sans">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-sm font-sans">
          {/* Main details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-semibold mb-1.5" htmlFor="description">
                Description *
              </label>
              <input
                id="description"
                type="text"
                required
                className="w-full rounded-lg bg-white border border-slate-200 px-3.5 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] transition"
                placeholder="Dinner party, Fuel..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1.5">Category</label>
              <select
                className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-slate-700 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] cursor-pointer"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Amount, Currency, Rate */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-700 font-semibold mb-1.5" htmlFor="amount">
                Amount *
              </label>
              <input
                id="amount"
                type="number"
                step="any"
                required
                className="w-full rounded-lg bg-white border border-slate-200 px-3.5 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] transition"
                placeholder="0.00"
                value={amountOriginal}
                onChange={(e) => setAmountOriginal(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1.5">Currency</label>
              <select
                className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-slate-700 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] cursor-pointer"
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value)}
              >
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="SGD">SGD (S$)</option>
                <option value="AED">AED (د.إ)</option>
              </select>
            </div>

            {currencyCode !== 'INR' && (
              <div>
                <label className="block text-slate-700 font-semibold mb-1.5" htmlFor="rate">
                  Exchange Rate (to INR) *
                </label>
                <input
                  id="rate"
                  type="number"
                  step="any"
                  required
                  className="w-full rounded-lg bg-white border border-slate-200 px-3.5 py-2 text-slate-900 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] transition"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Paid By & Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-semibold mb-1.5">Paid By *</label>
              <select
                className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-slate-700 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] cursor-pointer"
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
              >
                {members.map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.displayName} {m.leftAt ? '(Left)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1.5" htmlFor="date">
                Expense Date *
              </label>
              <input
                id="date"
                type="date"
                required
                className="w-full rounded-lg bg-white border border-slate-200 px-3.5 py-2 text-slate-900 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] transition"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
              />
            </div>
          </div>

          {/* Split Mode Router */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1.5">Split Strategy</label>
            <div className="grid grid-cols-4 gap-2">
              {(['EQUAL', 'UNEQUAL', 'PERCENTAGE', 'SHARE'] as const).map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setSplitMethod(method)}
                  className={`py-2 px-3 text-xs font-semibold rounded-lg border cursor-pointer transition ${
                    splitMethod === method
                      ? 'border-[#047857] bg-emerald-50 text-[#047857]'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          {/* Participants Splitting grid */}
          <div className="border border-slate-200 bg-slate-50/50 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Select Participants & Share
            </h4>
            
            <div className="max-h-48 overflow-y-auto space-y-2.5 pr-2">
              {members.map((m) => {
                const isActive = checkMemberActiveOnDate(m, expenseDate);
                const state = participants[m.user.id] || { selected: false, value: '' };

                return (
                  <div key={m.user.id} className="flex items-center justify-between gap-4">
                    <label className={`flex items-center gap-2.5 text-slate-700 cursor-pointer ${!isActive ? 'opacity-40' : ''}`}>
                      <input
                        type="checkbox"
                        disabled={!isActive}
                        checked={state.selected}
                        onChange={() => handleParticipantSelectToggle(m.user.id)}
                        className="rounded border-slate-300 text-[#047857] bg-white focus:ring-[#047857] h-4.5 w-4.5 cursor-pointer"
                      />
                      <div>
                        <span className="font-semibold">{m.user.displayName}</span>
                        {!isActive && (
                          <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded ml-2 border border-amber-200">
                            Inactive on this date
                          </span>
                        )}
                      </div>
                    </label>

                    {state.selected && splitMethod !== 'EQUAL' && (
                      <div className="flex items-center gap-1.5 w-28">
                        <input
                          type="number"
                          step="any"
                          required
                          className="w-full rounded bg-white border border-slate-200 px-2 py-1 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857]"
                          placeholder={
                            splitMethod === 'UNEQUAL' ? 'Amt' : splitMethod === 'PERCENTAGE' ? '%' : 'Shares'
                          }
                          value={state.value}
                          onChange={(e) => handleParticipantValueChange(m.user.id, e.target.value)}
                        />
                        <span className="text-xs text-slate-500 font-semibold">
                          {splitMethod === 'UNEQUAL' ? currencyCode : splitMethod === 'PERCENTAGE' ? '%' : 'sh'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-slate-700 font-semibold mb-1.5" htmlFor="notes">
              Notes
            </label>
            <textarea
              id="notes"
              className="w-full rounded-lg bg-white border border-slate-200 px-3.5 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] h-16 resize-none"
              placeholder="Add details like location, bill images details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-white border border-slate-200 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#047857] hover:bg-[#065f46] px-6 py-2.5 font-semibold text-white transition disabled:opacity-50 cursor-pointer flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-t-transparent"></div>
                  Saving...
                </>
              ) : (
                'Save Expense'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
