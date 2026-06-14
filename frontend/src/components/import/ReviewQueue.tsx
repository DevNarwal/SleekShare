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
  FileSpreadsheet,
  Info,
  CornerDownRight,
  Undo2
} from 'lucide-react';

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

interface ReviewQueueProps {
  groupId: string;
  jobId: string;
  members: Member[];
  onClose: () => void;
}

export default function ReviewQueue({ groupId, jobId, members, onClose }: ReviewQueueProps) {
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'imported'>('all');
  const [resolutions, setResolutions] = useState<Record<string, any>>({});
  const [resolvedAnomalies, setResolvedAnomalies] = useState<Record<string, boolean>>({});
  const [activeMemberMapping, setActiveMemberMapping] = useState<Record<string, string>>({});
  const [activeExchangeRates, setActiveExchangeRates] = useState<Record<string, string>>({});
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  const [activeRejectId, setActiveRejectId] = useState<string | null>(null);
  
  // Bulk action confirmation dialog state
  const [bulkConfirm, setBulkConfirm] = useState<{
    isOpen: boolean;
    type: 'clean' | 'warnings' | 'errors';
    title: string;
    summary: string[];
    onConfirm: () => void;
  } | null>(null);

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
        onClose(); // Redirect back to CSV Import center dashboard
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
        onClose(); // Redirect back to CSV Import center dashboard
      },
      onError: (err) => {
        alert(err.message || 'Bulk import failed');
      },
    }
  );

  // Reject all error rows mutation
  const { mutate: rejectAllErrors, loading: rejectingAllErrors } = useMutation<any, any>(
    () => api.post(`/groups/${groupId}/import/${jobId}/reject-errors`, {}),
    {
      onSuccess: (res) => {
        alert(`Successfully rejected error rows! Count: ${res.rejectedCount}`);
        refetch().catch(() => {});
      },
      onError: (err) => {
        alert(err.message || 'Failed to reject error rows');
      },
    }
  );

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

  // Calculate live statistics
  const pendingRows = job.rows?.filter((r: any) => r.status === 'pending') || [];
  
  const cleanRows = pendingRows.filter((r: any) => {
    const hasErrors = r.anomalies?.some((a: any) => a.severity === 'error');
    const hasWarnings = r.anomalies?.some((a: any) => a.severity === 'warning');
    return !hasErrors && !hasWarnings;
  });

  const warningRows = pendingRows.filter((r: any) => {
    const hasErrors = r.anomalies?.some((a: any) => a.severity === 'error');
    const hasWarnings = r.anomalies?.some((a: any) => a.severity === 'warning');
    return !hasErrors && hasWarnings;
  });

  const errorRows = pendingRows.filter((r: any) => {
    return r.anomalies?.some((a: any) => a.severity === 'error');
  });

  const totalImportableApprovedCount = job.rows?.filter((r: any) => r.status === 'approved').length || 0;

  // Truncated list component
  const TruncatedParticipants = ({ list }: { list: string[] }) => {
    const [expanded, setExpanded] = useState(false);
    if (!list || list.length === 0) return null;
    if (list.length <= 4 || expanded) {
      return (
        <span>
          Participants: <strong className="text-slate-800 font-bold">{list.join(', ')}</strong>
          {list.length > 4 && (
            <button onClick={() => setExpanded(false)} className="ml-2 text-[10px] text-[#047857] hover:underline cursor-pointer font-bold">
              Show less
            </button>
          )}
        </span>
      );
    }
    return (
      <span>
        Participants: <strong className="text-slate-800 font-bold">{list.slice(0, 4).join(', ')}</strong>
        <button onClick={() => setExpanded(true)} className="ml-1.5 text-[10px] text-[#047857] hover:underline cursor-pointer font-bold">
          + {list.length - 4} more
        </button>
      </span>
    );
  };

  // Get status metadata of a row
  const getRowState = (row: any) => {
    if (row.status === 'approved' || row.status === 'imported' || row.status === 'rejected') {
      return { status: row.status, resolvedCount: 0, totalAnomalies: 0, isReady: false };
    }

    const anomalies = row.anomalies || [];
    const totalAnomalies = anomalies.length;
    if (totalAnomalies === 0) {
      return { status: 'ready', resolvedCount: 0, totalAnomalies: 0, isReady: true };
    }

    let resolvedCount = 0;
    let hasUnresolvedError = false;

    anomalies.forEach((a: any) => {
      const isResolved = resolvedAnomalies[a.id] || !!a.resolution;
      if (isResolved) {
        resolvedCount++;
      } else {
        if (a.severity === 'error') {
          hasUnresolvedError = true;
        }
      }
    });

    const isReady = !hasUnresolvedError;
    const statusText = totalAnomalies === resolvedCount
      ? 'All anomalies resolved'
      : `${resolvedCount} of ${totalAnomalies} resolved`;

    return {
      status: isReady ? 'ready' : 'pending',
      statusText,
      resolvedCount,
      totalAnomalies,
      isReady,
    };
  };

  // Handle single row approval
  const handleApproveRow = (row: any) => {
    const rowResolutions = (row.anomalies || [])
      .filter((a: any) => resolvedAnomalies[a.id] || !!a.resolution)
      .map((a: any) => {
        const res = resolutions[a.id];
        // If it was already resolved and is in database, keep it or override if local state exists
        if (!res && a.resolution) {
          return {
            anomalyId: a.id,
            action: a.resolution.toUpperCase(),
          };
        }
        return {
          anomalyId: a.id,
          action: res?.action,
          mappedUserId: res?.mappedUserId,
          rate: res?.rate,
          fromUserId: res?.fromUserId,
          toUserId: res?.toUserId,
          amountInr: res?.amountInr,
          date: res?.date,
        };
      });

    approveRow({
      rowId: row.id,
      payload: { resolutions: rowResolutions },
    });
  };

  // Bulk actions summary getters
  const triggerApproveAllConfirm = () => {
    let membershipsCount = 0;
    let skipCount = 0;
    let reviewCount = 0;
    let importCount = 0;

    const warningOrCleanRows = job.rows?.filter((r: any) => {
      if (r.status !== 'pending') return false;
      const hasErrors = r.anomalies?.some((a: any) => a.severity === 'error');
      return !hasErrors;
    }) || [];

    warningOrCleanRows.forEach((row: any) => {
      importCount++;
      let rowWillBeRejected = false;
      row.anomalies?.forEach((a: any) => {
        if (a.anomalyType === 'PRE_MEMBERSHIP_DATE' || a.anomalyType === 'INACTIVE_MEMBER') {
          membershipsCount++;
        } else if (a.anomalyType === 'DUPLICATE_EXPENSE' || a.anomalyType === 'DUPLICATE_SETTLEMENT') {
          rowWillBeRejected = true;
        } else if (a.anomalyType === 'SETTLEMENT_AS_EXPENSE') {
          reviewCount++;
        }
      });
      if (rowWillBeRejected) {
        skipCount++;
        importCount--;
      }
    });

    setBulkConfirm({
      isOpen: true,
      type: 'warnings',
      title: 'Approve All Warnings',
      summary: [
        `Create ${membershipsCount} backdated user membership(s).`,
        `Skip ${skipCount} duplicate charge(s) (mark as rejected).`,
        `Leave ${reviewCount} complex settlement row(s) for manual review.`,
        `Import ${importCount} clean/resolved row(s) directly.`
      ],
      onConfirm: () => {
        approveAll();
        setBulkConfirm(null);
      }
    });
  };

  const triggerRejectAllErrorsConfirm = () => {
    const errCount = errorRows.length;
    setBulkConfirm({
      isOpen: true,
      type: 'errors',
      title: 'Reject All Error Rows',
      summary: [
        `This will immediately mark all ${errCount} row(s) with severe errors as rejected.`,
        `Rejected rows will not be imported and must be corrected in the source CSV and re-uploaded.`
      ],
      onConfirm: () => {
        rejectAllErrors();
        setBulkConfirm(null);
      }
    });
  };

  const triggerImportCleanConfirm = () => {
    const cleanRowsCount = cleanRows.length + totalImportableApprovedCount;
    setBulkConfirm({
      isOpen: true,
      type: 'clean',
      title: 'Import Clean & Approved Rows',
      summary: [
        `This will write all ${cleanRowsCount} clean or pre-approved expense record(s) into the ledger.`,
        `Any remaining rows with unresolved anomalies will stay in the review queue.`
      ],
      onConfirm: () => {
        importClean();
        setBulkConfirm(null);
      }
    });
  };

  // Render individual anomaly card
  const renderAnomalyCard = (row: any, a: any) => {
    const isError = a.severity === 'error';
    const isWarning = a.severity === 'warning';
    const isInfo = a.severity === 'info';

    const borderStyle = isError
      ? 'border-l-4 border-l-red-600 bg-red-50/30 border-red-200'
      : isWarning
      ? 'border-l-4 border-l-amber-600 bg-amber-50/30 border-amber-200'
      : 'border-l-4 border-l-slate-500 bg-slate-50 border-slate-200';

    const severityBadge = isError
      ? 'bg-red-100 text-red-700 border border-red-200'
      : isWarning
      ? 'bg-amber-100 text-amber-800 border border-amber-200'
      : 'bg-slate-100 text-slate-700 border border-slate-200';

    const isResolved = resolvedAnomalies[a.id] || !!a.resolution;

    if (isResolved) {
      // Collapsed resolved state
      let resolvedText = 'Approved as-is';
      const res = resolutions[a.id];
      if (res) {
        if (res.action === 'CREATE_IMPORT_MEMBERSHIP') {
          resolvedText = 'Create explicit membership backdated to this date';
        } else if (res.action === 'IGNORE_PARTICIPANT') {
          resolvedText = 'Exclude participant from splitting';
        } else if (res.action === 'reject_row') {
          resolvedText = 'Row will be skipped / rejected';
        } else if (res.action === 'MAP_MEMBER') {
          const m = members.find((mem) => mem.user.id === res.mappedUserId);
          resolvedText = `Mapped to member: ${m?.user.displayName || res.mappedUserId}`;
        } else if (res.action === 'ENTER_EXCHANGE_RATE') {
          resolvedText = `Custom exchange rate set: ${res.rate}`;
        } else if (res.action === 'REMAP_SPLIT_METHOD') {
          resolvedText = 'Remap split method to Equal';
        } else if (res.action === 'AUTO_ADJUST_SPLIT') {
          resolvedText = 'Auto-adjust shares ratio';
        } else if (res.action === 'REJECT_AND_CREATE_SETTLEMENT') {
          resolvedText = 'Reject row and record a Settlement instead';
        }
      } else if (a.resolution === 'approved') {
        resolvedText = 'Approved / Resolved';
      } else if (a.resolution === 'rejected') {
        resolvedText = 'Rejected / Excluded';
      }

      return (
        <div
          key={a.id}
          id={`anomaly-${a.id}`}
          tabIndex={0}
          className="flex items-center justify-between text-xs font-semibold text-emerald-800 bg-emerald-50/50 border border-emerald-200 px-4 py-2.5 rounded-xl transition focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          <span className="flex items-center gap-1.5">
            <CheckCircle size={14} className="text-emerald-600 shrink-0" />
            <span>
              <code className="bg-emerald-100 text-emerald-950 px-1 rounded text-[10px] font-mono mr-1.5">{a.anomalyType}</code>
              — Resolved: {resolvedText}
            </span>
          </span>
          {row.status === 'pending' && !a.resolution && (
            <button
              onClick={() => {
                setResolvedAnomalies((prev) => ({ ...prev, [a.id]: false }));
                setResolutions((prev) => {
                  const next = { ...prev };
                  delete next[a.id];
                  return next;
                });
                setTimeout(() => {
                  document.getElementById(`anomaly-${a.id}`)?.focus();
                }, 50);
              }}
              className="text-slate-500 hover:text-slate-800 underline cursor-pointer text-xs font-bold"
            >
              Undo
            </button>
          )}
        </div>
      );
    }

    const onResolve = (action: string, payload: any = {}) => {
      setResolutions((prev) => ({
        ...prev,
        [a.id]: { action, anomalyId: a.id, ...payload },
      }));
      setResolvedAnomalies((prev) => ({
        ...prev,
        [a.id]: true,
      }));
    };

    return (
      <div
        key={a.id}
        id={`anomaly-${a.id}`}
        tabIndex={0}
        className={`p-4 rounded-xl border flex flex-col justify-between gap-3 ${borderStyle} focus:outline-none focus:ring-1 focus:ring-slate-300`}
      >
        <div className="flex justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="font-mono bg-slate-100 text-slate-800 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold">
                {a.anomalyType}
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${severityBadge}`}>
                [{a.severity}]
              </span>
            </div>
            <p className="text-slate-700 text-xs font-semibold leading-relaxed">{a.detail}</p>
            {a.suggestedFix && (
              <p className="mt-1.5 text-[11px] text-slate-500 italic font-semibold">Suggested Fix: {a.suggestedFix}</p>
            )}
          </div>
          <div className="shrink-0 mt-0.5">
            {isError ? (
              <XOctagon size={16} className="text-red-500" />
            ) : isWarning ? (
              <AlertTriangle size={16} className="text-amber-500" />
            ) : (
              <Info size={16} className="text-slate-500" />
            )}
          </div>
        </div>

        {/* Action button controls based on catalog */}
        {!isInfo && row.status === 'pending' && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 mt-1">
            {a.anomalyType === 'PRE_MEMBERSHIP_DATE' || a.anomalyType === 'INACTIVE_MEMBER' ? (
              <>
                <button
                  onClick={() => onResolve('CREATE_IMPORT_MEMBERSHIP')}
                  className="bg-emerald-50 hover:bg-emerald-100 text-[#047857] border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Create Membership
                </button>
                <button
                  onClick={() => onResolve('IGNORE_PARTICIPANT')}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Ignore Participant
                </button>
              </>
            ) : a.anomalyType === 'FUTURE_DATE' || a.anomalyType === 'FOREIGN_CURRENCY' ? (
              <button
                onClick={() => onResolve('approve')}
                className="bg-emerald-50 hover:bg-emerald-100 text-[#047857] border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                Approve
              </button>
            ) : a.anomalyType === 'DUPLICATE_EXPENSE' || a.anomalyType === 'DUPLICATE_SETTLEMENT' ? (
              <button
                onClick={() => onResolve('approve_anyway')}
                className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                Approve Anyway
              </button>
            ) : a.anomalyType === 'PARTICIPANT_MISMATCH' ? (
              <>
                <button
                  onClick={() => onResolve('IGNORE_PARTICIPANT')}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Ignore Participant
                </button>
                <button
                  onClick={() => onResolve('approve_anyway')}
                  className="bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Approve Anyway
                </button>
              </>
            ) : a.anomalyType === 'SETTLEMENT_AS_EXPENSE' ? (
              <>
                <button
                  onClick={() => {
                    const fromUserId = row.parsedData?.paidByUserId || members[0]?.user.id;
                    const toUserObj = row.parsedData?.participants?.find((p: any) => p.userId !== fromUserId);
                    const toUserId = toUserObj?.userId || members[0]?.user.id;

                    onResolve('REJECT_AND_CREATE_SETTLEMENT', {
                      fromUserId,
                      toUserId,
                      amountInr: row.parsedData?.amount || 0,
                      date: row.parsedData?.date || new Date().toISOString().split('T')[0],
                    });
                  }}
                  className="bg-emerald-50 hover:bg-emerald-100 text-[#047857] border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1"
                >
                  <CornerDownRight size={12} />
                  Reject & Create Settlement Instead
                </button>
                <button
                  onClick={() => onResolve('approve_anyway')}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Import as Expense Anyway
                </button>
              </>
            ) : a.anomalyType === 'UNSUPPORTED_SPLIT_TYPE' ? (
              <button
                onClick={() => onResolve('REMAP_SPLIT_METHOD')}
                className="bg-emerald-50 hover:bg-emerald-100 text-[#047857] border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                Approve as Equal Split
              </button>
            ) : a.anomalyType === 'SPLIT_MISMATCH' ? (
              <button
                onClick={() => onResolve('AUTO_ADJUST_SPLIT')}
                className="bg-emerald-50 hover:bg-emerald-100 text-[#047857] border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                Auto-adjust to Equal Split
              </button>
            ) : a.anomalyType === 'MISSING_MEMBER' ? (
              <div className="flex gap-2 items-center flex-wrap">
                <select
                  value={activeMemberMapping[a.id] || ''}
                  onChange={(e) => setActiveMemberMapping((prev) => ({ ...prev, [a.id]: e.target.value }))}
                  className="rounded-lg bg-white border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:outline-none focus:border-[#047857] cursor-pointer"
                >
                  <option value="">Select Member</option>
                  {members.map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.displayName}
                    </option>
                  ))}
                </select>
                <button
                  disabled={!activeMemberMapping[a.id]}
                  onClick={() => onResolve('MAP_MEMBER', { mappedUserId: activeMemberMapping[a.id] })}
                  className="bg-emerald-50 hover:bg-emerald-100 text-[#047857] border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-40"
                >
                  Map Member
                </button>
              </div>
            ) : a.anomalyType === 'FOREIGN_CURRENCY_NO_RATE' ? (
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  step="any"
                  placeholder="Rate (e.g. 83.50)"
                  value={activeExchangeRates[a.id] || ''}
                  onChange={(e) => setActiveExchangeRates((prev) => ({ ...prev, [a.id]: e.target.value }))}
                  className="w-32 rounded-lg bg-white border border-slate-200 px-2.5 py-1 text-xs focus:outline-none focus:border-[#047857]"
                />
                <button
                  disabled={!activeExchangeRates[a.id] || isNaN(Number(activeExchangeRates[a.id]))}
                  onClick={() => onResolve('ENTER_EXCHANGE_RATE', { rate: Number(activeExchangeRates[a.id]) })}
                  className="bg-emerald-50 hover:bg-emerald-100 text-[#047857] border border-emerald-200 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-40"
                >
                  Enter Exchange Rate
                </button>
              </div>
            ) : null}

            {a.anomalyType !== 'FOREIGN_CURRENCY' && (
              <button
                onClick={() => onResolve('reject_row')}
                className="bg-white border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                Reject Row
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 text-sm font-sans relative">
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
      </div>

      {/* STICKY Bulk Action Bar */}
      <div className="sticky top-0 z-30 bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm backdrop-blur-md bg-opacity-95">
        <div>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Import Review</span>
          <div className="flex gap-2.5 items-center mt-1 text-slate-700 font-semibold text-xs">
            <span>{job.rows?.length || 0} rows</span>
            <span>•</span>
            <span className="text-[#047857]">{cleanRows.length + totalImportableApprovedCount} clean / approved</span>
            <span>•</span>
            <span className="text-amber-600">{warningRows.length} with warnings</span>
            <span>•</span>
            <span className="text-red-600">{errorRows.length} with errors</span>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={triggerImportCleanConfirm}
            disabled={importingClean || (cleanRows.length + totalImportableApprovedCount === 0)}
            className="rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 font-semibold text-xs disabled:opacity-30 cursor-pointer flex items-center gap-1.5 transition"
          >
            <ShieldCheck size={14} className="text-[#047857]" />
            Import Clean Rows ({cleanRows.length + totalImportableApprovedCount})
          </button>
          
          <button
            onClick={triggerApproveAllConfirm}
            disabled={approvingAll || warningRows.length === 0}
            className="rounded-lg bg-[#047857] hover:bg-[#065f46] px-4 py-2 font-semibold text-white text-xs disabled:opacity-30 cursor-pointer flex items-center gap-1.5 transition"
          >
            <Zap size={14} />
            Approve All Warnings ({warningRows.length})
          </button>

          <button
            onClick={triggerRejectAllErrorsConfirm}
            disabled={rejectingAllErrors || errorRows.length === 0}
            className="rounded-lg bg-red-600 hover:bg-red-700 px-4 py-2 font-semibold text-white text-xs disabled:opacity-30 cursor-pointer flex items-center gap-1.5 transition"
          >
            <X size={14} />
            Reject All Error Rows ({errorRows.length})
          </button>
        </div>
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

            // Find paidBy value case-insensitively from rawData or parsedData
            const getRawPayerValue = (rawData: any) => {
              if (!rawData) return null;
              const possibleKeys = ['paid_by', 'paidby', 'payer', 'paid by'];
              for (const k of Object.keys(rawData)) {
                if (possibleKeys.includes(k.toLowerCase().trim())) {
                  return rawData[k];
                }
              }
              return null;
            };
            const paidBy = row.parsedData?.paidBy || row.parsedData?.paid_by || getRawPayerValue(row.rawData) || 'Unknown';

            // Find splitMethod value case-insensitively from rawData or parsedData
            const getRawSplitValue = (rawData: any) => {
              if (!rawData) return null;
              const possibleKeys = ['split_method', 'splitmethod', 'split', 'split method'];
              for (const k of Object.keys(rawData)) {
                if (possibleKeys.includes(k.toLowerCase().trim())) {
                  return rawData[k];
                }
              }
              return null;
            };
            const split = row.parsedData?.splitMethod || row.parsedData?.split_method || getRawSplitValue(row.rawData) || 'equal';

            // Handle participants parsed as array of objects or fall back to splitting raw string
            const participantsList = Array.isArray(row.parsedData?.participants)
              ? row.parsedData.participants.map((p: any) => {
                  if (p.value !== undefined && p.value !== null) {
                    return `${p.nameOrEmail} (${p.value})`;
                  }
                  return p.nameOrEmail;
                })
              : typeof row.parsedData?.participants === 'string'
              ? row.parsedData.participants.split(/[,;|]/).map((s: string) => s.trim())
              : [];

            const hasErrors = row.anomalies?.some((a: any) => a.severity === 'error');
            const hasWarnings = row.anomalies?.some((a: any) => a.severity === 'warning');

            const { status: rowStateStatus, statusText: rowStateText, isReady: rowIsReady } = getRowState(row);

            return (
              <div
                key={row.id}
                className={`rounded-2xl border bg-white p-5 transition space-y-4 shadow-xs ${
                  row.status === 'approved'
                    ? 'border-blue-200 bg-blue-50/10'
                    : row.status === 'imported'
                    ? 'border-emerald-200 bg-emerald-50/10'
                    : row.status === 'rejected'
                    ? 'border-slate-200 bg-slate-50/50 opacity-70'
                    : hasErrors
                    ? 'border-red-200 bg-red-50/10'
                    : hasWarnings
                    ? 'border-amber-200 bg-amber-50/10'
                    : 'border-slate-200'
                }`}
              >
                {/* Row Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-bold text-slate-500">Row #{row.rowNumber}</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-600 font-semibold">{date}</span>
                    <span className="text-slate-300">•</span>
                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                      row.status === 'approved'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : row.status === 'imported'
                        ? 'bg-emerald-50 text-[#047857] border-emerald-200'
                        : row.status === 'rejected'
                        ? 'bg-slate-100 text-slate-600 border-slate-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}>
                      {row.status}
                    </span>
                    {row.status === 'pending' && (
                      <>
                        <span className="text-slate-300">•</span>
                        <span className={`text-[11px] font-bold flex items-center gap-1 ${rowIsReady ? 'text-[#047857]' : 'text-slate-500'}`}>
                          <span>⏳ {rowStateText}</span>
                        </span>
                      </>
                    )}
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
                        <TruncatedParticipants list={participantsList} />
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
                            onClick={() => handleApproveRow(row)}
                            disabled={!rowIsReady || approvingRow}
                            className="flex items-center justify-center gap-1 rounded-lg bg-[#047857] hover:bg-[#065f46] px-4 py-2 text-xs font-semibold text-white transition disabled:opacity-30 cursor-pointer"
                          >
                            <Check size={14} />
                            Approve Row
                          </button>
                          <button
                            onClick={() => setActiveRejectId(row.id)}
                            disabled={rejectingRow}
                            className="flex items-center justify-center gap-1 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50 hover:border-red-200 transition px-4 py-2 text-xs font-semibold cursor-pointer"
                          >
                            <X size={14} />
                            Reject Row
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Anomalies List */}
                {row.anomalies?.length > 0 && (
                  <div className="space-y-3 border-t border-slate-100 pt-4 mt-2">
                    {row.anomalies.map((a: any) => renderAnomalyCard(row, a))}
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

      {/* Confirmation Dialog Modal */}
      {bulkConfirm && bulkConfirm.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div onClick={() => setBulkConfirm(null)} className="absolute inset-0 bg-black/40 backdrop-blur-xs"></div>
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl relative z-10 space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <AlertTriangle className="text-amber-500" size={20} />
              <h3 className="text-base font-bold text-slate-900 font-serif">{bulkConfirm.title}</h3>
            </div>
            
            <div className="space-y-2.5 py-1">
              <p className="text-xs text-slate-600 font-semibold mb-2">This action will perform the following changes:</p>
              <ul className="space-y-2">
                {bulkConfirm.summary.map((item, index) => (
                  <li key={index} className="flex gap-2 items-start text-xs text-slate-700 font-semibold leading-relaxed">
                    <span className="text-[#047857] mt-0.5">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 mt-4">
              <button
                onClick={() => setBulkConfirm(null)}
                className="rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 font-semibold text-xs cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                onClick={bulkConfirm.onConfirm}
                className="rounded-lg bg-[#047857] hover:bg-[#065f46] text-white px-5 py-2 font-semibold text-xs cursor-pointer transition shadow-xs"
              >
                Confirm & Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
