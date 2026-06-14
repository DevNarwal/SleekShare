'use client';

import { useState } from 'react';
import { useQuery, useMutation, invalidateQueries } from '@/hooks/useQuery';
import { api } from '@/lib/api';
import {
  ArrowLeft,
  Check,
  X,
  AlertTriangle,
  XOctagon,
  Settings,
  ShieldCheck,
  Zap,
  CheckCircle,
  FileSpreadsheet
} from 'lucide-react';

interface ReviewQueueProps {
  groupId: string;
  jobId: string;
  onClose: () => void;
}

export default function ReviewQueue({ groupId, jobId, onClose }: ReviewQueueProps) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'imported'>('all');
  const [resolutions, setResolutions] = useState<Record<string, 'CREATE_IMPORT_MEMBERSHIP' | 'IGNORE_PARTICIPANT'>>({});
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  const [activeRejectId, setActiveRejectId] = useState<string | null>(null);

  // Fetch job rows and summary
  const { data: job, loading, refetch } = useQuery(`/groups/${groupId}/import/${jobId}`, () =>
    api.get(`/groups/${groupId}/import/${jobId}`)
  );

  // Approve row mutation
  const { mutate: approveRow, loading: approvingRow } = useMutation(
    ({ rowId, payload }: { rowId: string; payload: any }) =>
      api.post(`/groups/${groupId}/import/${jobId}/rows/${rowId}/approve`, payload),
    {
      onSuccess: () => {
        refetch().catch(() => {});
        invalidateQueries(`/groups/${groupId}`);
      },
      onError: (err) => {
        alert(err.message || 'Row approval failed');
      },
    }
  );

  // Reject row mutation
  const { mutate: rejectRow, loading: rejectingRow } = useMutation(
    ({ rowId, reason }: { rowId: string; reason?: string }) =>
      api.post(`/groups/${groupId}/import/${jobId}/rows/${rowId}/reject`, { reason }),
    {
      onSuccess: () => {
        setActiveRejectId(null);
        refetch().catch(() => {});
      },
      onError: (err) => {
        alert(err.message || 'Row rejection failed');
      },
    }
  );

  // Approve all warnings and clean mutation
  const { mutate: approveAll, loading: approvingAll } = useMutation<any, any>(
    () => api.post(`/groups/${groupId}/import/${jobId}/approve-all`, {}),
    {
      onSuccess: (res) => {
        alert(`Successfully approved and imported rows! Imported count: ${res.importedCount}`);
        refetch().catch(() => {});
        invalidateQueries(`/groups/${groupId}/expenses`);
        invalidateQueries(`/groups/${groupId}/balances`);
      },
      onError: (err) => {
        alert(err.message || 'Bulk approval failed');
      },
    }
  );

  // Import clean and approved mutation
  const { mutate: importClean, loading: importingClean } = useMutation<any, any>(
    () => api.post(`/groups/${groupId}/import/${jobId}/import-clean`, {}),
    {
      onSuccess: (res) => {
        alert(`Successfully imported approved rows! Imported count: ${res.importedCount}`);
        refetch().catch(() => {});
        invalidateQueries(`/groups/${groupId}/expenses`);
        invalidateQueries(`/groups/${groupId}/balances`);
      },
      onError: (err) => {
        alert(err.message || 'Bulk import failed');
      },
    }
  );

  const handleResolutionSelect = (anomalyId: string, action: 'CREATE_IMPORT_MEMBERSHIP' | 'IGNORE_PARTICIPANT') => {
    setResolutions((prev) => ({
      ...prev,
      [anomalyId]: action,
    }));
  };

  const handleRowApproveSubmit = (row: any) => {
    // Map resolutions for this row's anomalies
    const mapped = row.anomalies
      .filter((a: any) => a.severity === 'warning')
      .map((a: any) => {
        const action = resolutions[a.id];
        if (!action) {
          throw new Error(`Please choose a resolution action for the warning: ${a.message}`);
        }
        return {
          anomalyId: a.id,
          action,
        };
      });

    approveRow({
      rowId: row.id,
      payload: { resolutions: mapped },
    });
  };

  if (loading) {
    return (
      <div className="flex h-[40vh] items-center justify-center text-slate-400">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#047857] border-t-transparent"></div>
      </div>
    );
  }

  if (!job) return null;

  // Filter rows
  const filteredRows = job.rows?.filter((r: any) => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  return (
    <div className="space-y-6 text-sm font-sans">
      {/* Back button */}
      <button
        onClick={onClose}
        className="flex items-center gap-1.5 text-slate-500 hover:text-slate-900 transition cursor-pointer font-semibold"
      >
        <ArrowLeft size={16} />
        Back to CSV Import Dashboard
      </button>

      {/* Header Info */}
      <div className="p-5 rounded-2xl border border-slate-200 bg-white flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={20} className="text-[#047857]" />
            <h3 className="text-lg font-bold text-slate-900 font-serif truncate max-w-sm sm:max-w-md">{job.filename}</h3>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-semibold">Uploaded by: {job.uploader?.displayName || 'Unknown'}</p>
        </div>

        {/* Action Controls */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => {
              if (confirm('Approve and import all clean rows and warning rows (if pre-approved)?')) {
                approveAll();
              }
            }}
            disabled={approvingAll || job.summary?.clean + job.summary?.warnings === 0}
            className="rounded-lg bg-[#047857] hover:bg-[#065f46] px-4 py-2 font-semibold text-white text-xs disabled:opacity-30 cursor-pointer flex items-center gap-1.5"
          >
            <Zap size={14} />
            Approve & Import All
          </button>
          
          <button
            onClick={() => importClean()}
            disabled={importingClean || job.summary?.approved === 0}
            className="rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 font-semibold text-xs disabled:opacity-30 cursor-pointer flex items-center gap-1.5"
          >
            <ShieldCheck size={14} className="text-[#047857]" />
            Import Approved Rows
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-4">
        {[
          { label: 'Total Rows', count: job.summary?.totalRows, color: 'text-slate-900' },
          { label: 'Clean Rows', count: job.summary?.clean, color: 'text-[#047857]' },
          { label: 'Warnings', count: job.summary?.warnings, color: 'text-amber-600' },
          { label: 'Errors', count: job.summary?.errors, color: 'text-red-600' },
          { label: 'Approved', count: job.summary?.approved, color: 'text-blue-600' },
          { label: 'Imported', count: job.summary?.imported, color: 'text-[#047857]' },
          { label: 'Rejected', count: job.summary?.rejected, color: 'text-slate-500' },
        ].map((card, idx) => (
          <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">{card.label}</span>
            <span className={`text-xl font-bold font-serif mt-1 block ${card.color}`}>{card.count}</span>
          </div>
        ))}
      </div>

      {/* Queue Filter Navigation */}
      <div className="flex border-b border-slate-200 overflow-x-auto no-scrollbar">
        {([
          { id: 'all', name: 'All Rows' },
          { id: 'pending', name: 'Pending Review' },
          { id: 'approved', name: 'Approved' },
          { id: 'imported', name: 'Imported' },
          { id: 'rejected', name: 'Rejected' },
        ] as const).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-5 py-2.5 font-semibold text-xs border-b-2 transition whitespace-nowrap cursor-pointer ${
              filter === tab.id
                ? 'border-[#047857] text-[#047857] bg-emerald-50/20'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.name}
          </button>
        ))}
      </div>

      {/* Rows Queue */}
      <div className="space-y-4">
        {filteredRows && filteredRows.length > 0 ? (
          filteredRows.map((row: any) => {
            const date = row.parsedData?.date ? new Date(row.parsedData.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Invalid Date';
            const description = row.parsedData?.description || 'No Description';
            const amount = Number(row.parsedData?.amount || 0);
            const currency = row.parsedData?.currency || 'INR';
            const paidBy = row.parsedData?.paid_by || 'Unknown';
            const split = row.parsedData?.split_method || 'equal';
            const participantsList = row.parsedData?.participants ? row.parsedData.participants.split(/[,;|]/).map((s: string) => s.trim()) : [];

            const hasErrors = row.anomalies?.some((a: any) => a.severity === 'error');
            const hasWarnings = row.anomalies?.some((a: any) => a.severity === 'warning');

            return (
              <div
                key={row.id}
                className={`rounded-2xl border bg-white p-5 transition space-y-4 shadow-xs ${
                  row.status === 'approved'
                    ? 'border-blue-200 bg-blue-50/10'
                    : row.status === 'imported'
                    ? 'border-emerald-200 bg-emerald-50/10'
                    : hasErrors
                    ? 'border-red-200 bg-red-50/10'
                    : hasWarnings
                    ? 'border-amber-200 bg-amber-50/10'
                    : 'border-slate-200'
                }`}
              >
                {/* Row Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-slate-500">Row #{row.rowNumber}</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-600 font-semibold">{date}</span>
                    <span className="text-slate-300">•</span>
                    <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                      {row.status}
                    </span>
                  </div>
                  
                  <div className="font-bold text-slate-900 text-base font-serif">
                    {currency} {amount.toFixed(2)}
                  </div>
                </div>

                {/* Details layout */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2 space-y-2">
                    <h4 className="text-base font-bold text-slate-900 font-serif">{description}</h4>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500 font-semibold">
                      <span>Paid By: <strong className="text-slate-800 font-bold">{paidBy}</strong></span>
                      <span>Split: <strong className="text-slate-800 font-bold uppercase">{split}</strong></span>
                      {participantsList.length > 0 && (
                        <span>Participants: <strong className="text-slate-800 font-bold">{participantsList.join(', ')}</strong></span>
                      )}
                    </div>
                  </div>

                  {/* Resolution interface for pending rows */}
                  {row.status === 'pending' && (
                    <div className="flex justify-end items-center gap-2">
                      {activeRejectId === row.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            rejectRow({ rowId: row.id, reason: rejectNotes[row.id] });
                          }}
                          className="flex gap-2 w-full"
                        >
                          <input
                            type="text"
                            required
                            placeholder="Rejection reason..."
                            className="w-full rounded bg-white border border-slate-200 px-2.5 py-1 text-xs focus:outline-none focus:border-[#047857] text-slate-900"
                            value={rejectNotes[row.id] || ''}
                            onChange={(e) => setRejectNotes({ ...rejectNotes, [row.id]: e.target.value })}
                          />
                          <button type="submit" className="text-red-600 hover:opacity-80"><Check size={16} /></button>
                          <button type="button" onClick={() => setActiveRejectId(null)} className="text-slate-400 hover:text-slate-700"><X size={16} /></button>
                        </form>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              try {
                                handleRowApproveSubmit(row);
                              } catch (err: any) {
                                alert(err.message);
                              }
                            }}
                            disabled={hasErrors || approvingRow}
                            className="flex items-center justify-center gap-1 rounded-lg bg-[#047857] hover:bg-[#065f46] px-3.5 py-1.5 text-xs font-semibold text-white transition disabled:opacity-30 cursor-pointer"
                          >
                            <Check size={14} />
                            Approve
                          </button>
                          <button
                            onClick={() => setActiveRejectId(row.id)}
                            disabled={rejectingRow}
                            className="flex items-center justify-center gap-1 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition px-3.5 py-1.5 text-xs font-semibold cursor-pointer"
                          >
                            <X size={14} />
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Anomalies List */}
                {row.anomalies?.length > 0 && (
                  <div className="space-y-2 border-t border-slate-100 pt-3">
                    {row.anomalies.map((a: any) => {
                      const isError = a.severity === 'error';
                      return (
                        <div
                          key={a.id}
                          className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border text-xs ${
                            isError
                              ? 'bg-red-50 border-red-200 text-red-700 font-medium'
                              : 'bg-amber-50 border-amber-200 text-amber-700 font-medium'
                          }`}
                        >
                          <div className="flex gap-2 items-start">
                            {isError ? (
                              <XOctagon size={16} className="shrink-0 mt-0.5" />
                            ) : (
                              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                            )}
                            <div>
                              <span className="font-bold uppercase tracking-wider text-[10px] block mb-0.5">
                                {a.type} ({a.severity})
                              </span>
                              <p>{a.message}</p>
                            </div>
                          </div>

                          {/* Resolution Select dropdown for Warnings on pending rows */}
                          {!isError && row.status === 'pending' && (
                            <div className="flex items-center gap-2 shrink-0">
                              <Settings size={14} className="text-slate-500" />
                              <select
                                className="rounded bg-white border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:border-[#047857]"
                                value={resolutions[a.id] || ''}
                                onChange={(e) =>
                                  handleResolutionSelect(
                                    a.id,
                                    e.target.value as 'CREATE_IMPORT_MEMBERSHIP' | 'IGNORE_PARTICIPANT'
                                  )
                                }
                              >
                                <option value="">Select Resolution</option>
                                <option value="CREATE_IMPORT_MEMBERSHIP">Create Membership</option>
                                <option value="IGNORE_PARTICIPANT">Ignore Participant</option>
                              </select>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="text-center py-12 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50">
            <p className="text-slate-500 text-sm font-semibold">No rows found matching the selected filter.</p>
          </div>
        )}
      </div>
    </div>
  );
}
