'use client';

import { useState } from 'react';
import { useQuery, useMutation, invalidateQueries } from '@/hooks/useQuery';
import { api } from '@/lib/api';
import ReviewQueue from './ReviewQueue';
import { UploadCloud, FileSpreadsheet, Play, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface ImportTabProps {
  groupId: string;
  members: any[];
}

export default function ImportTab({ groupId, members }: ImportTabProps) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [conflictJob, setConflictJob] = useState<{ id: string; filename: string } | null>(null);

  // Fetch previous import jobs
  const { data: jobs, loading, refetch } = useQuery(`/groups/${groupId}/import`, () =>
    api.get(`/groups/${groupId}/import`)
  );

  // Upload CSV mutation
  const { mutate: uploadCsv, loading: uploading } = useMutation(
    (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.post(`/groups/${groupId}/import`, formData);
    },
    {
      onSuccess: (res) => {
        setUploadError('');
        setConflictJob(null);
        invalidateQueries(`/groups/${groupId}/import`);
        setActiveJobId(res.id); // auto-open queue for newly uploaded job
      },
      onError: (err: any) => {
        // Handle 409 Conflict for duplicate hashes
        if (err.message?.includes('Conflict') || err.message?.includes('already')) {
          setUploadError('This file content hash matches a previously uploaded import.');
          // Parse or search existing job
          try {
            const parsed = JSON.parse(err.message);
            if (parsed.existingJobId) {
              setConflictJob({ id: parsed.existingJobId, filename: 'Duplicate Job' });
            }
          } catch {
            setConflictJob({ id: 'latest', filename: 'Duplicate file' });
          }
        } else {
          setUploadError(err.message || 'File upload failed');
        }
      },
    }
  );

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setUploadError('');
    setConflictJob(null);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.csv')) {
        uploadCsv(file);
      } else {
        setUploadError('Only CSV files are supported');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError('');
    setConflictJob(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.name.endsWith('.csv')) {
        uploadCsv(file);
      } else {
        setUploadError('Only CSV files are supported');
      }
    }
  };

  if (activeJobId) {
    return (
      <ReviewQueue
        groupId={groupId}
        jobId={activeJobId}
        members={members || []}
        onClose={() => {
          setActiveJobId(null);
          refetch().catch(() => {});
        }}
      />
    );
  }

  return (
    <div className="space-y-8 text-sm font-sans">
      {/* File Upload zone */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 font-serif mb-2">Import Expenses via CSV</h3>
        <p className="text-xs text-slate-500 -mt-2">
          Upload a spreadsheet mapping expenses. Expected headers: date, description, amount, paid_by, split_method, participants
        </p>

        {uploadError && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-600 flex gap-2 items-start">
            <XCircle size={16} className="shrink-0 mt-0.5" />
            <div>
              <p>{uploadError}</p>
              {conflictJob && (
                <button
                  onClick={() => {
                    if (conflictJob.id === 'latest' && jobs && jobs.length > 0) {
                      setActiveJobId(jobs[0].id);
                    } else if (conflictJob.id !== 'latest') {
                      setActiveJobId(conflictJob.id);
                    } else {
                      alert('Could not find existing job. Check history below.');
                    }
                  }}
                  className="mt-2 text-[#047857] font-bold hover:underline block cursor-pointer"
                >
                  Click here to review the existing upload queue
                </button>
              )}
            </div>
          </div>
        )}

        <form
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onSubmit={(e) => e.preventDefault()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center flex flex-col items-center justify-center transition min-h-[180px] ${
            dragActive ? 'border-[#047857] bg-emerald-50/20' : 'border-slate-200 hover:bg-slate-50'
          }`}
        >
          <input
            type="file"
            id="csv-file"
            className="hidden"
            accept=".csv"
            onChange={handleFileChange}
            disabled={uploading}
          />
          
          {uploading ? (
            <div className="space-y-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#047857] border-t-transparent mx-auto"></div>
              <p className="text-slate-700 font-semibold">Uploading and scanning CSV for anomalies...</p>
            </div>
          ) : (
            <>
              <UploadCloud size={40} className="text-slate-400 mb-3" />
              <p className="text-slate-700 font-semibold mb-1.5">Drag and drop your CSV file here</p>
              <span className="text-slate-400 text-xs mb-4 font-semibold">or click to browse local files</span>
              <label
                htmlFor="csv-file"
                className="rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-5 py-2 font-semibold text-xs transition cursor-pointer"
              >
                Browse CSV
              </label>
            </>
          )}
        </form>
      </div>

      {/* Historical jobs */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 font-serif mb-2">Previous CSV Imports</h3>

        {loading ? (
          <div className="flex justify-center py-6">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-solid border-[#047857] border-t-transparent"></div>
          </div>
        ) : jobs && jobs.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-500 font-semibold uppercase font-sans">
                  <th className="px-4 py-3">Filename</th>
                  <th className="px-4 py-3">Upload Date</th>
                  <th className="px-4 py-3">Uploader</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Rows Summary</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {jobs.map((job: any) => {
                  const date = new Date(job.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
                  
                  return (
                    <tr key={job.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-semibold text-slate-900 truncate max-w-[150px]">{job.filename}</td>
                      <td className="px-4 py-3 text-slate-500 font-semibold">{date}</td>
                      <td className="px-4 py-3 text-slate-500 font-semibold">{job.uploader?.displayName || 'Unknown'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block font-bold px-2 py-0.5 rounded text-[9px] uppercase border ${
                          job.status === 'completed'
                            ? 'bg-emerald-50 text-[#047857] border-emerald-200'
                            : job.status === 'failed'
                            ? 'bg-red-50 text-red-600 border-red-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-[10px]">
                        {job.summary ? (
                          <div className="flex gap-2">
                            {job.summary.imported > 0 && <span className="text-[#047857]">{job.summary.imported} imp</span>}
                            {job.summary.approved > 0 && <span className="text-blue-600">{job.summary.approved} app</span>}
                            {job.summary.clean > 0 && <span className="text-[#047857]">{job.summary.clean} cln</span>}
                            {job.summary.warnings > 0 && <span className="text-amber-600">{job.summary.warnings} wrn</span>}
                            {job.summary.errors > 0 && <span className="text-red-600">{job.summary.errors} err</span>}
                            {job.summary.rejected > 0 && <span className="text-slate-500">{job.summary.rejected} rej</span>}
                          </div>
                        ) : 'N/A'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setActiveJobId(job.id)}
                          className="rounded bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-3 py-1 font-semibold text-[10px] transition cursor-pointer flex items-center gap-1 ml-auto"
                        >
                          <Play size={10} className="text-[#047857]" />
                          Review / View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-500 text-center py-6 font-semibold">No previous uploads found.</p>
        )}
      </div>
    </div>
  );
}
