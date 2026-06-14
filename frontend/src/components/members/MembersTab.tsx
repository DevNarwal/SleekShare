'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useMutation, invalidateQueries } from '@/hooks/useQuery';
import { api } from '@/lib/api';
import { Users, UserPlus, UserMinus, Calendar, AlertCircle } from 'lucide-react';

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

interface MembersTabProps {
  groupId: string;
  members: Member[];
}

export default function MembersTab({ groupId, members }: MembersTabProps) {
  const { user } = useAuth();
  
  // Add Member form state
  const [targetUserId, setTargetUserId] = useState('');
  const [joinedAt, setJoinedAt] = useState(new Date().toISOString().split('T')[0]);
  const [addError, setAddError] = useState('');

  // Remove Member modal state
  const [removeMemberData, setRemoveMemberData] = useState<Member | null>(null);
  const [leftAt, setLeftAt] = useState(new Date().toISOString().split('T')[0]);
  const [removeError, setRemoveError] = useState('');

  // Add member mutation
  const { mutate: addMember, loading: adding } = useMutation(
    (payload: { userId: string; joinedAt?: string }) => api.post(`/groups/${groupId}/members`, payload),
    {
      onSuccess: () => {
        setTargetUserId('');
        setAddError('');
        invalidateQueries(`/groups/${groupId}`);
        invalidateQueries('/groups');
      },
      onError: (err) => {
        setAddError(err.message || 'Failed to add member');
      },
    }
  );

  // Remove member mutation
  const { mutate: removeMember, loading: removing } = useMutation(
    ({ userId, leftAtDate }: { userId: string; leftAtDate?: string }) =>
      api.delete(`/groups/${groupId}/members/${userId}`, {
        body: JSON.stringify({ leftAt: leftAtDate }),
      }),
    {
      onSuccess: () => {
        setRemoveMemberData(null);
        setRemoveError('');
        invalidateQueries(`/groups/${groupId}`);
        invalidateQueries('/groups');
      },
      onError: (err) => {
        setRemoveError(err.message || 'Failed to remove member');
      },
    }
  );

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');

    // UUID Regex Validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(targetUserId.trim())) {
      setAddError('User ID must be a valid UUID v4 format');
      return;
    }

    addMember({
      userId: targetUserId.trim(),
      joinedAt: joinedAt ? new Date(joinedAt).toISOString() : undefined,
    });
  };

  const handleRemoveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!removeMemberData) return;
    setRemoveError('');

    removeMember({
      userId: removeMemberData.user.id,
      leftAtDate: leftAt ? new Date(leftAt).toISOString() : undefined,
    });
  };

  const currentMembership = members.find((m) => m.user.id === user?.id);
  const isAdmin = currentMembership?.role?.toUpperCase() === 'ADMIN';

  return (
    <div className="space-y-8 text-sm font-sans">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Member Roster List */}
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <Users size={18} className="text-[#047857]" />
            <h3 className="text-base font-bold text-slate-900 font-serif">Group Members</h3>
          </div>

          <div className="space-y-3">
            {members.map((m) => {
              const active = m.status === 'ACTIVE';
              return (
                <div key={m.user.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 border border-slate-100 hover:bg-slate-50 transition">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-9 w-9 rounded-full flex items-center justify-center font-bold text-sm text-white shadow-xs shrink-0"
                      style={{ backgroundColor: m.user.avatarColor || '#047857' }}
                    >
                      {m.user.avatarInitials || m.user.displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900">{m.user.displayName}</span>
                        {m.role?.toLowerCase() === 'admin' && (
                          <span className="text-[9px] bg-emerald-50 text-[#047857] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide border border-emerald-200/50">
                            Admin
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 block truncate max-w-[180px] sm:max-w-xs">{m.user.email}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border ${
                        active
                          ? 'bg-emerald-50 text-[#047857] border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}>
                        {m.status}
                      </span>
                      <p className="text-[10px] text-slate-500 mt-1 font-semibold">
                        Joined: {new Date(m.joinedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>

                    {/* Action to remove member (only active members, only admins can trigger, cannot remove oneself) */}
                    {active && isAdmin && m.user.id !== user?.id && (
                      <button
                        onClick={() => setRemoveMemberData(m)}
                        className="rounded bg-white border border-slate-200 p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition cursor-pointer"
                        title="Remove member"
                      >
                        <UserMinus size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Add Member panel */}
        {isAdmin ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 h-fit shadow-xs">
            <div className="flex items-center gap-2 mb-2">
              <UserPlus size={18} className="text-[#047857]" />
              <h3 className="text-base font-bold text-slate-900 font-serif">Add Group Member</h3>
            </div>

            {addError && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-600 flex gap-1.5">
                <AlertCircle size={16} className="shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-xs" htmlFor="userId">
                  User ID (UUID v4) *
                </label>
                <input
                  id="userId"
                  type="text"
                  required
                  className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857]"
                  placeholder="e.g. 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-xs" htmlFor="joinedAt">
                  Join Date
                </label>
                <input
                  id="joinedAt"
                  type="date"
                  className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-slate-900 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857]"
                  value={joinedAt}
                  onChange={(e) => setJoinedAt(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={adding}
                className="w-full rounded-lg bg-[#047857] hover:bg-[#065f46] py-2.5 font-semibold text-white transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
              >
                {adding ? 'Adding...' : 'Add Member'}
              </button>
            </form>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-6 flex flex-col items-center justify-center text-center text-slate-500 h-64 border-dashed">
            <Users size={36} className="mb-2 text-slate-400" />
            <h4 className="font-bold text-slate-900 text-sm font-serif">Need Admin Access</h4>
            <p className="text-xs max-w-xs mt-1">Only group administrators can add new members or configure timelines.</p>
          </div>
        )}
      </div>

      {/* Remove Member modal */}
      {removeMemberData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div onClick={() => setRemoveMemberData(null)} className="absolute inset-0 bg-black/40 backdrop-blur-xs"></div>
          
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl relative z-10 overflow-hidden">
            <h3 className="text-lg font-bold text-slate-900 font-serif mb-4">Soft Remove Member</h3>
            
            {removeError && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-600">
                {removeError}
              </div>
            )}

            <form onSubmit={handleRemoveSubmit} className="space-y-4 text-xs font-sans">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-slate-700 leading-relaxed">
                  This will log the date when <span className="font-semibold text-slate-950">{removeMemberData.user.displayName}</span> left the group.
                </p>
                <p className="text-slate-500 mt-2 font-semibold">
                  They will no longer be eligible for expenses created on dates after their departure.
                </p>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1" htmlFor="leftAt">
                  Departure Date *
                </label>
                <input
                  id="leftAt"
                  type="date"
                  required
                  className="w-full rounded-lg bg-white border border-slate-200 px-3 py-2 text-slate-900 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857]"
                  value={leftAt}
                  onChange={(e) => setLeftAt(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
                <button
                  type="button"
                  onClick={() => setRemoveMemberData(null)}
                  className="rounded-lg bg-white border border-slate-200 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={removing}
                  className="rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2.5 font-semibold text-white transition disabled:opacity-50 cursor-pointer text-xs flex items-center gap-1"
                >
                  {removing ? 'Removing...' : 'Confirm Departure'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
