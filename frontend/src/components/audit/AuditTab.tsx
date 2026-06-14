'use client';

import React from 'react';
import { useQuery } from '@/hooks/useQuery';
import { api } from '@/lib/api';
import { History, PlusCircle, CheckCircle, Edit, Trash2, ArrowRight } from 'lucide-react';

interface AuditTabProps {
  groupId: string;
}

export default function AuditTab({ groupId }: AuditTabProps) {
  const { data: logs, loading } = useQuery(`/groups/${groupId}/audit`, () =>
    api.get(`/groups/${groupId}/audit`)
  );

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'expense.created':
      case 'settlement.created':
        return <PlusCircle className="text-emerald-600 shrink-0" size={16} />;
      case 'expense.updated':
      case 'settlement.updated':
        return <Edit className="text-blue-600 shrink-0" size={16} />;
      case 'expense.deleted':
      case 'settlement.deleted':
        return <Trash2 className="text-red-500 shrink-0" size={16} />;
      case 'import.completed':
        return <CheckCircle className="text-indigo-600 shrink-0" size={16} />;
      default:
        return <History className="text-slate-500 shrink-0" size={16} />;
    }
  };

  const formatEventMetadata = (log: any) => {
    const meta = log.metadata || {};
    switch (log.eventType) {
      case 'expense.created':
        return `Created expense "${meta.description || 'No description'}" of ₹${meta.amountOriginal || 0}`;
      case 'expense.updated':
        return `Updated expense "${meta.description || 'No description'}"`;
      case 'expense.deleted':
        return `Deleted expense ID ${log.entityId || ''}`;
      case 'settlement.created':
        return `Recorded settlement of ₹${meta.amountInr || 0}`;
      case 'import.completed':
        return `Completed CSV import job: ${meta.filename || 'Unknown'} (Clean: ${meta.cleanRows || 0}, Anomaly: ${meta.anomalyRows || 0})`;
      case 'member.joined':
        return `Joined the group via invitation`;
      case 'member.left':
        return `Left the group`;
      default:
        return `${log.eventType} on ${log.entityType || 'entity'}`;
    }
  };

  if (loading) {
    return (
      <div className="flex h-[40vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-solid border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-serif text-slate-800 tracking-tight font-bold">Audit Log</h2>
        <p className="text-xs text-slate-500">Immutable ledger trail of all financial and membership operations inside this group.</p>
      </div>

      {logs && logs.length > 0 ? (
        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs divide-y divide-slate-100">
          {logs.map((log: any) => (
            <div key={log.id} className="p-4 flex items-start justify-between gap-4 hover:bg-slate-50/50 transition">
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 p-1.5 bg-slate-100 rounded-lg shrink-0">
                  {getEventIcon(log.eventType)}
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-700 font-semibold leading-relaxed">
                    {formatEventMetadata(log)}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1.5">
                    <span>by {log.actor?.displayName || 'System'}</span>
                    <span>•</span>
                    <span>{new Date(log.createdAt).toLocaleString()}</span>
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  {log.eventType.split('.')[1] || log.eventType}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
          <History className="mx-auto text-slate-300 mb-2" size={32} />
          <h4 className="text-xs font-semibold text-slate-700">No events logged yet</h4>
          <p className="text-[10px] text-slate-500">Audit events will appear as expenses are added or imports completed.</p>
        </div>
      )}
    </div>
  );
}
