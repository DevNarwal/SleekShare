'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, invalidateQueries } from '@/hooks/useQuery';
import { api } from '@/lib/api';
import { Plus, Users, FolderOpen, RefreshCw, Layers } from 'lucide-react';

export default function DashboardPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupIcon, setGroupIcon] = useState('📁');
  const [error, setError] = useState('');

  // Fetch groups
  const { data: groups, loading, refetch } = useQuery('/groups', () => api.get('/groups'));

  // Create group mutation
  const { mutate: createGroup, loading: creating } = useMutation(
    (dto: { name: string; icon?: string }) => api.post('/groups', dto),
    {
      onSuccess: () => {
        setGroupName('');
        setGroupIcon('📁');
        setModalOpen(false);
        invalidateQueries('/groups');
      },
      onError: (err) => {
        setError(err.message || 'Failed to create group');
      },
    }
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) {
      setError('Group name is required');
      return;
    }
    setError('');
    await createGroup({ name: groupName, icon: groupIcon });
  };

  const icons = ['📁', '🍕', '✈️', '🏠', '🚗', '🍻', '🎓', '🛍️', '🎮'];

  // Calculations
  const totalVolume = groups ? groups.reduce((sum: number, g: any) => sum + Number(g.volume || 0), 0) : 0;
  const activeGroupsCount = groups ? groups.length : 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 font-serif">Dashboard</h1>
          <p className="text-sm text-slate-500 font-sans">Manage your shared expense groups and track budgets</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#047857] hover:bg-[#065f46] px-4 py-2.5 font-semibold text-white transition shadow-sm cursor-pointer text-sm font-sans"
        >
          <Plus size={18} />
          Create Group
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 relative overflow-hidden shadow-xs">
          <div className="absolute top-4 right-4 text-emerald-700 opacity-20"><Layers size={24} /></div>
          <p className="text-sm font-semibold text-slate-500 font-sans">Active Groups</p>
          <h3 className="text-3xl font-bold text-slate-900 mt-2 font-serif">{activeGroupsCount}</h3>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 relative overflow-hidden shadow-xs">
          <div className="absolute top-4 right-4 text-emerald-700 opacity-20"><FolderOpen size={24} /></div>
          <p className="text-sm font-semibold text-slate-500 font-sans">Total Group Volume</p>
          <h3 className="text-3xl font-bold text-slate-900 mt-2 font-serif">
            ₹{totalVolume.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 relative overflow-hidden shadow-xs flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-500 font-sans">Sync Status</p>
            <h3 className="text-lg font-bold text-[#047857] mt-2 flex items-center gap-1.5 font-sans">
              <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse"></span>
              Live Connected
            </h3>
          </div>
          <button
            onClick={() => refetch()}
            className="rounded-lg bg-white border border-slate-200 p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition cursor-pointer"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Groups Section */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 font-serif mb-6">Your Shared Groups</h2>
        
        {loading ? (
          <div className="flex py-12 justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#047857] border-t-transparent"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groups && groups.map((group: any) => (
              <Link
                key={group.id}
                href={`/groups/${group.slug}`}
                className="group block rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-[#047857]/50 hover:shadow-md relative overflow-hidden"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-3xl p-2.5 bg-slate-50 border border-slate-100 rounded-xl group-hover:scale-105 transition duration-300">
                    {group.icon || '📁'}
                  </span>
                  <div className="flex items-center gap-1 text-slate-600 text-xs font-semibold bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
                    <Users size={12} />
                    {group.memberCount} members
                  </div>
                </div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-[#047857] transition font-serif truncate mb-2">
                  {group.name}
                </h3>
                <div className="flex justify-between items-center text-xs mt-4 pt-3 border-t border-slate-100">
                  <span className="text-slate-500 font-sans">Volume (INR)</span>
                  <span className="font-bold text-slate-900 font-serif text-sm">
                    ₹{Number(group.volume || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  </span>
                </div>
              </Link>
            ))}

            {/* Create new group dashed card */}
            <button
              onClick={() => setModalOpen(true)}
              className="group block rounded-2xl border-2 border-dashed border-slate-200 hover:border-[#047857]/50 bg-slate-50/50 p-6 transition hover:bg-slate-50 shadow-xs relative flex flex-col items-center justify-center min-h-[165px] cursor-pointer"
            >
              <div className="flex flex-col items-center gap-2">
                <span className="p-3 bg-white border border-slate-200 rounded-full group-hover:scale-105 transition duration-300 text-slate-500 group-hover:text-[#047857]">
                  <Plus size={24} />
                </span>
                <span className="text-sm font-semibold text-slate-600 group-hover:text-[#047857] transition font-sans">
                  Create new group
                </span>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            onClick={() => setModalOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-xs"
          ></div>
          
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl relative z-10 overflow-hidden">
            <h3 className="text-xl font-bold text-slate-900 font-serif mb-4">Create New Group</h3>
            
            {error && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-600 font-sans">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5 font-sans" htmlFor="groupName">
                  Group Name
                </label>
                <input
                  id="groupName"
                  type="text"
                  required
                  className="w-full rounded-lg bg-white border border-slate-200 px-4 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#047857] focus:ring-1 focus:ring-[#047857] transition font-sans"
                  placeholder="Trip to Goa, Apartment Rent..."
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5 font-sans">
                  Select Group Icon
                </label>
                <div className="grid grid-cols-9 gap-2">
                  {icons.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setGroupIcon(emoji)}
                      className={`h-9 w-9 text-lg flex items-center justify-center rounded-lg border transition hover:bg-slate-50 cursor-pointer ${
                        groupIcon === emoji
                          ? 'border-[#047857] bg-emerald-50/50 text-[#047857]'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg bg-white border border-slate-200 px-4 py-2.5 font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer text-sm font-sans"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-[#047857] hover:bg-[#065f46] px-4 py-2.5 font-semibold text-white transition disabled:opacity-50 cursor-pointer text-sm font-sans flex items-center gap-1.5"
                >
                  {creating ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-solid border-white border-t-transparent"></div>
                      Creating...
                    </>
                  ) : (
                    'Create Group'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
