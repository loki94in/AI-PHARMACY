import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Database, Upload, FileText, CheckCircle, AlertCircle, Loader2, History, Check, AlertTriangle, Play, RefreshCw } from 'lucide-react';
import { api, apiClient } from '../services/api';

interface CatalogJob {
  id: number;
  file_path: string;
  original_filename: string | null;
  status: 'pending' | 'processing' | 'ready_for_review' | 'done' | 'failed' | 'waiting_for_mapping' | 'paused' | 'pending_analysis' | 'processing_analysis';
  created_at: string;
  total_count?: number;
  existing_count?: number;
  new_count?: number;
  duplicate_count?: number;
  progress?: number;
  error_log?: string | null;
}

const AVAILABLE_DB_SECTIONS = [
  {
    label: 'Common / Product Info',
    fields: [
      { value: 'name', label: 'Product Name (Required)' },
      { value: 'api_reference', label: 'Composition / Generic' },
      { value: 'strength', label: 'Strength' },
      { value: 'packaging', label: 'Packaging Type' },
      { value: 'manufacturer', label: 'Manufacturer' },
      { value: 'marketed_by', label: 'Marketed By' },
      { value: 'hsn_code', label: 'HSN Code' },
      { value: 'schedule_type', label: 'Schedule Type' }
    ]
  },
  {
    label: '💰 Pricing & Taxes',
    fields: [
      { value: 'mrp', label: 'MRP (Price)' },
      { value: 'cgst', label: 'CGST %' },
      { value: 'sgst', label: 'SGST %' }
    ]
  },
  {
    label: '📦 Stock & Batch details',
    fields: [
      { value: 'quantity', label: 'Stock Quantity' },
      { value: 'batch_no', label: 'Batch Number' },
      { value: 'expiry_date', label: 'Expiry Date' },
      { value: 'rack', label: 'Rack Location' }
    ]
  }
];

const getFieldLabelAndSection = (value: string) => {
  for (const section of AVAILABLE_DB_SECTIONS) {
    const field = section.fields.find(f => f.value === value);
    if (field) return { section: section.label, label: field.label };
  }
  return { section: 'Unknown', label: value };
};

const CatalogUpload = () => {
  const [activeTab, setActiveTab] = useState<'upload' | 'history'>('upload');
  
  // Job States
  const [uploading, setUploading] = useState(false);
  const [jobId, setJobId] = useState<number | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({
    total: 0,
    existing: 0,
    new: 0,
    duplicates: 0
  });
  
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  // History & List States
  const [previousJobs, setPreviousJobs] = useState<CatalogJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  
  // Messaging States
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Mapping States
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({});

  // Fetch previous jobs
  const fetchJobs = useCallback(async () => {
    setLoadingJobs(true);
    try {
      const jobs = await api.getCatalogJobs();
      setPreviousJobs(jobs || []);
    } catch (err: any) {
      console.error('Failed to fetch catalog jobs:', err);
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const jobIdRef = useRef<number | null>(null);
  useEffect(() => {
    jobIdRef.current = jobId;
  }, [jobId]);

  useEffect(() => {
    const backendUrl = apiClient.defaults.baseURL || window.location.origin;
    const cleanBaseUrl = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
    const sseUrl = cleanBaseUrl.startsWith('/api')
      ? `${cleanBaseUrl}/notifications/stream`
      : `${cleanBaseUrl}/api/notifications/stream`;

    let eventSource: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      eventSource = new EventSource(sseUrl);

      eventSource.onmessage = (event) => {
        try {
          const eventData = JSON.parse(event.data);
          const { type, payload } = eventData;

          if (type === 'catalog_job_progress' && payload) {
            // Update active job progress if it matches
            if (payload.id === jobIdRef.current) {
              setProgress(payload.progress);
              if (payload.status) {
                setJobStatus(payload.status);
              }
              if (payload.total_count !== undefined) {
                setStats(prev => ({
                  total: payload.total_count,
                  existing: payload.existing_count || 0,
                  new: payload.new_count || 0,
                  duplicates: payload.duplicate_count || 0
                }));
              }
            }
            // Update previousJobs list item progress
            setPreviousJobs(prev => 
              prev.map(job => 
                job.id === payload.id 
                  ? { 
                      ...job, 
                      status: payload.status || job.status,
                      progress: payload.progress,
                      total_count: payload.total_count !== undefined ? payload.total_count : job.total_count,
                      new_count: payload.new_count !== undefined ? payload.new_count : job.new_count,
                      existing_count: payload.existing_count !== undefined ? payload.existing_count : job.existing_count,
                      duplicate_count: payload.duplicate_count !== undefined ? payload.duplicate_count : job.duplicate_count
                    } 
                  : job
              )
            );
          } else if (type === 'catalog_job_update' && payload) {
            // Update active job status/progress if it matches
            if (payload.id === jobIdRef.current) {
              setProgress(payload.progress !== undefined ? payload.progress : 0);
              setJobStatus(payload.status);

              if (payload.total_count !== undefined) {
                setStats(prev => ({
                  total: payload.total_count,
                  existing: payload.existing_count || 0,
                  new: payload.new_count || 0,
                  duplicates: payload.duplicate_count || 0
                }));
              }

              if (payload.status === 'done') {
                setImporting(false);
                setUploading(false);
                setJobId(null);
                setJobStatus(null);
                setPreviewRows([]);
                setSuccess(`Success! Imported catalogue products are now fully integrated and searchable.`);
              } else if (payload.status === 'failed') {
                setImporting(false);
                setJobStatus('failed');
                setError(payload.error || 'Ingestion failed.');
              } else if (payload.status === 'waiting_for_mapping') {
                setUploading(false);
                api.getCatalogJobStatus(payload.id).then(data => {
                  const headers = Array.isArray(data.headers) && data.headers.length > 0 ? data.headers : [];
                  const preview = Array.isArray(data.previewData) ? data.previewData : [];
                  
                  setFileHeaders(headers);
                  setPreviewRows(preview);
                  
                  if (preview.length > 0) {
                    setPreviewHeaders(Object.keys(preview[0]));
                  } else if (headers.length > 0) {
                    setPreviewHeaders(headers);
                  } else {
                    setPreviewHeaders([]);
                  }
                  
                  setColumnMappings(data.suggestedMapping || {});
                  setShowMappingModal(true);
                }).catch(err => {
                  console.error('Failed to load mapping details:', err);
                  setError('Failed to load mapping details.');
                });
              }
            }
            
            // Update previousJobs list item status/progress
            setPreviousJobs(prev => 
              prev.map(job => 
                job.id === payload.id 
                  ? { 
                      ...job, 
                      status: payload.status, 
                      progress: payload.progress !== undefined ? payload.progress : job.progress,
                      error_log: payload.error || job.error_log,
                      total_count: payload.total_count !== undefined ? payload.total_count : job.total_count,
                      new_count: payload.new_count !== undefined ? payload.new_count : job.new_count,
                      existing_count: payload.existing_count !== undefined ? payload.existing_count : job.existing_count,
                      duplicate_count: payload.duplicate_count !== undefined ? payload.duplicate_count : job.duplicate_count
                    } 
                  : job
              )
            );

            // Fetch latest jobs to refresh stats and details
            fetchJobs();
          }
        } catch (err) {
          console.error('Failed to parse catalog SSE message:', err);
        }
      };

      eventSource.onerror = (err) => {
        console.warn('Catalog SSE disconnected or failed, retrying in 5 seconds...', err);
        eventSource?.close();
        eventSource = null;
        reconnectTimeout = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [fetchJobs]);

  // Handle file uploading
  const handleUpload = async (file: File) => {
    if (!file) return;
    setError(null);
    setSuccess(null);
    setUploading(true);
    setJobStatus('pending_analysis');
    setProgress(0);
    setPreviewRows([]);
    setJobId(null);
    
    try {
      const res = await api.uploadCatalogFile(file);
      if (res.success && res.jobId) {
        setJobId(res.jobId);
        setJobStatus(res.status || 'pending_analysis');
      } else {
        throw new Error(res.message || 'Upload failed');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || err.message || 'Failed to upload catalogue file');
      setUploading(false);
      setJobStatus(null);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(e.target.files[0]);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = () => {
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  // Trigger background batch import
  const handleIngestImport = async () => {
    if (!jobId) return;
    setError(null);
    setSuccess(null);
    setImporting(true);
    setJobStatus('processing');
    setProgress(0);
    
    try {
      const res = await api.importCatalogJob(jobId);
      if (res.success) {
        setSuccess('Background ingestion started successfully.');
      } else {
        throw new Error(res.message || 'Failed to trigger import');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || err.message || 'Failed to initiate batch import');
      setImporting(false);
      setJobStatus(null);
    }
  };

  const handlePauseJob = async (id: number) => {
    try {
      await api.pauseCatalogJob(id);
      setSuccess(`Catalogue Ingestion Job #${id} paused.`);
      if (jobId === id) {
        setJobStatus('paused');
      }
      fetchJobs();
    } catch (err: any) {
      console.error('Pause failed:', err);
      setError(err.response?.data?.error || err.message || 'Failed to pause ingestion');
    }
  };

  const handleResumeJob = async (id: number) => {
    try {
      await api.resumeCatalogJob(id);
      setSuccess(`Catalogue Ingestion Job #${id} resumed.`);
      if (jobId === id) {
        setImporting(true);
        setJobStatus('processing');
      }
      fetchJobs();
    } catch (err: any) {
      console.error('Resume failed:', err);
      setError(err.response?.data?.error || err.message || 'Failed to resume ingestion');
    }
  };

  // Load a job from history for review
  const reviewJobFromHistory = async (job: CatalogJob) => {
    setError(null);
    setSuccess(null);
    setUploading(true);
    setJobId(job.id);
    setJobStatus(job.status);
    setProgress(job.progress || 0);
    setStats({
      total: job.total_count || 0,
      existing: job.existing_count || 0,
      new: job.new_count || 0,
      duplicates: job.duplicate_count || 0
    });

    try {
      const data = await api.getCatalogJobStatus(job.id);
      if (data.previewData && data.previewData.length > 0) {
        setPreviewHeaders(Object.keys(data.previewData[0]));
        setPreviewRows(data.previewData);
      }
      setUploading(false);
      setActiveTab('upload');
      setSuccess(`Viewing review for Catalogue Job #${job.id}.`);
    } catch (err: any) {
      console.error(err);
      setError('Failed to load catalogue preview details.');
      setUploading(false);
    }
  };

  return (
    <div className="h-full flex flex-col fade-in relative overflow-y-auto pb-12">
      <div className="glass-panel flex-1 flex flex-col overflow-hidden m-6 rounded-xl border border-glass-border">
        {/* Header Section */}
        <div className="p-6 border-b border-glass-border flex flex-col gap-3 bg-white/5">
          <div className="flex flex-wrap justify-between items-start gap-4">
            <div>
              <h3 className="font-bold flex items-center gap-2 text-2xl text-white">
                <Database size={24} className="text-primary" /> 
                Catalogue Manager
              </h3>
              <p className="text-gray-400 text-sm mt-1">Upload and ingest huge product catalogue databases (100–200 MB+) in the background without locking or freezing the system.</p>
              

            </div>
            
            {/* Tabs */}
            <div className="flex bg-black/40 border border-glass-border p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('upload')}
                className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${activeTab === 'upload' ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'}`}
              >
                <Upload size={14} /> Upload & Ingest
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${activeTab === 'history' ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'}`}
              >
                <History size={14} /> Import Jobs
              </button>
            </div>
          </div>
        </div>

        {/* Success & Error Banners */}
        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl flex items-start gap-3 text-sm">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold">Error Processing Catalogue:</span>
              <p className="mt-1 text-xs">{error}</p>
            </div>
          </div>
        )}
        {success && (
          <div className="mx-6 mt-4 p-4 bg-green-500/10 text-green-400 border border-green-500/20 rounded-xl flex items-center gap-3 text-sm">
            <CheckCircle size={18} className="shrink-0" />
            <span className="font-semibold">{success}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 p-6 overflow-hidden flex flex-col">
          {activeTab === 'upload' ? (
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Dropzone */}
              {!jobId && !uploading && (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <label
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    className={`bg-white/5 border-2 border-dashed rounded-xl p-12 max-w-lg w-full cursor-pointer transition-all ${isDragOver ? 'border-primary bg-primary/5' : 'border-glass-border hover:border-primary/50'}`}
                  >
                    <Upload size={48} className="mx-auto text-gray-500 mb-4" />
                    <h4 className="text-lg font-semibold text-white mb-2">Upload Catalogue File</h4>
                    <p className="text-gray-400 text-sm mb-6">Select or drag catalogue CSV, PDF, or Excel database to scan (Supports 100MB+ files)</p>
                    <div className="premium-btn bg-primary text-white pointer-events-none">
                      Select Catalogue File
                    </div>
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls,.pdf"
                      onChange={onFileChange}
                      className="hidden"
                    />
                  </label>
                </div>
              )}

              {/* Uploading or Scanning / Pre-scan Phase */}
              {uploading && !importing && (
                <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto">
                  <Loader2 size={48} className="animate-spin text-primary mb-4" />
                  <h4 className="text-lg font-semibold text-white mb-2">
                    {jobStatus === 'pending_analysis' && 'Uploading database...'}
                    {jobStatus === 'processing_analysis' && 'Analyzing file schema and extracting data...'}
                    {jobStatus === 'pending' && 'Analyzing file schema...'}
                    {jobStatus === 'processing' && 'Pre-scanning and compiling statistics...'}
                    {!jobStatus && 'Uploading database...'}
                  </h4>
                  {stats.total > 0 && jobStatus === 'processing_analysis' && (
                    <p className="text-xs text-primary mb-2 font-semibold animate-pulse">
                      Scanned {stats.total.toLocaleString()} rows so far...
                    </p>
                  )}
                  <p className="text-gray-400 text-sm mb-4">
                    The background worker is parsing your file. You can safely navigate away and continue working; you will be notified when mapping is ready.
                  </p>
                  <div className="w-full bg-white/5 rounded-full h-2 mt-2">
                    <div className="bg-primary h-2 rounded-full animate-pulse w-3/4" />
                  </div>
                </div>
              )}

              {/* Importing Ingestion Phase */}
              {importing && (
                <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto">
                  {jobStatus === 'paused' ? (
                    <Loader2 size={48} className="text-amber-500 mb-4" />
                  ) : (
                    <RefreshCw size={48} className="animate-spin text-green mb-4" />
                  )}
                  <h4 className="text-lg font-semibold text-white mb-2">
                    {jobStatus === 'paused' ? `Ingestion Paused: ${progress}%` : `Ingesting catalogue: ${progress}% Complete`}
                  </h4>
                  {stats.total > 0 && (
                    <p className="text-xs text-gray-400 mb-2 font-semibold">
                      Ingested {((stats.new || 0) + (stats.existing || 0) + (stats.duplicates || 0)).toLocaleString()} / {stats.total.toLocaleString()} products
                    </p>
                  )}
                  <p className="text-gray-400 text-sm mb-4">
                    Processing products in transactional batches of 1,000 to keep memory low and prevent locks.
                  </p>
                  
                  {/* Progress Bar */}
                  <div className="w-full bg-white/5 rounded-full h-4 relative overflow-hidden border border-glass-border">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ease-out ${jobStatus === 'paused' ? 'bg-amber-500' : 'bg-green'}`} 
                      style={{ width: `${progress}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white">
                      {progress}%
                    </span>
                  </div>

                  {stats.total > 0 && (
                    <div className="grid grid-cols-3 gap-3 w-full mt-6">
                      <div className="bg-black/30 border border-glass-border/40 rounded p-3 flex flex-col items-center">
                        <span className="text-xl font-bold text-emerald-400">{stats.new}</span>
                        <span className="text-[10px] text-gray-400 uppercase tracking-wide mt-1">New Products</span>
                      </div>
                      <div className="bg-black/30 border border-glass-border/40 rounded p-3 flex flex-col items-center">
                        <span className="text-xl font-bold text-blue-400">{stats.existing}</span>
                        <span className="text-[10px] text-gray-400 uppercase tracking-wide mt-1">Updated</span>
                      </div>
                      <div className="bg-black/30 border border-glass-border/40 rounded p-3 flex flex-col items-center">
                        <span className="text-xl font-bold text-amber-400">{stats.duplicates}</span>
                        <span className="text-[10px] text-gray-400 uppercase tracking-wide mt-1">Duplicates Skipped</span>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-4 mt-6">
                    {jobStatus === 'processing' || jobStatus === 'pending' ? (
                      <button
                        onClick={() => handlePauseJob(jobId!)}
                        className="bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold px-6 py-2.5 rounded-xl shadow-lg transition-all"
                      >
                        Pause Ingestion
                      </button>
                    ) : jobStatus === 'paused' ? (
                      <button
                        onClick={() => handleResumeJob(jobId!)}
                        className="bg-green hover:bg-green/90 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-lg transition-all flex items-center gap-1.5"
                      >
                        <Play size={13} /> Resume Ingestion
                      </button>
                    ) : null}
                  </div>

                  <p className="text-[10px] text-gray-500 mt-4">
                    You can safely close this screen or continue recording sales/bills while import runs in the background.
                  </p>
                </div>
              )}

              {/* Scan Results & Review Screen */}
              {jobId && !uploading && !importing && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                    <div>
                      <h4 className="text-lg font-semibold text-white">Catalogue Analysis Results</h4>
                      <p className="text-xs text-gray-400">Review results below. Products will be created or merged on confirm.</p>
                    </div>

                    <div className="flex items-center gap-3">
                      {jobStatus === 'ready_for_review' && (
                        <button
                          onClick={handleIngestImport}
                          className="premium-btn bg-green text-white hover:opacity-90 flex items-center gap-1.5 text-xs font-bold shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                        >
                          <Play size={13} /> Start Ingestion
                        </button>
                      )}
                      
                      {jobStatus === 'waiting_for_mapping' && (
                        <button
                          onClick={() => setShowMappingModal(true)}
                          className="text-xs bg-amber-500 hover:bg-amber-600 text-black px-4 py-2 rounded-xl font-bold transition-all shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                        >
                          Configure Mappings
                        </button>
                      )}

                      <button
                        onClick={() => { setJobId(null); setJobStatus(null); setPreviewRows([]); }}
                        className="bg-white/5 border border-glass-border hover:bg-white/10 px-4 py-2 rounded-xl text-xs font-bold text-gray-400 transition-all"
                      >
                        Upload Another
                      </button>
                    </div>
                  </div>

                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    {[
                      { label: 'Total Products Found', value: stats.total, color: 'text-primary' },
                      { label: 'Existing Products (Merge)', value: stats.existing, color: 'text-yellow-400' },
                      { label: 'New Products (Create)', value: stats.new, color: 'text-green' },
                      { label: 'Duplicates in CSV', value: stats.duplicates, color: 'text-red-400' }
                    ].map((card, idx) => (
                      <div key={idx} className="glass-panel p-5 text-center">
                        <p className={`text-2xl font-black ${card.color}`}>{card.value.toLocaleString()}</p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-1">{card.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Dynamic Preview Header */}
                  <h5 className="font-bold text-xs text-gray-400 mb-2 uppercase tracking-wider">
                    Catalogue Preview (First 100 lines)
                  </h5>

                  {/* Preview Table */}
                  <div className="flex-1 overflow-auto border border-glass-border/30 rounded-xl bg-black/20">
                    <table className="w-full text-left text-xs text-gray-300">
                      <thead className="sticky top-0 bg-[#18181b]/95 border-b border-glass-border">
                        <tr>
                          {previewHeaders.map((header) => (
                            <th key={header} className="p-3 font-bold uppercase tracking-wide text-gray-400">{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, ri) => (
                          <tr key={ri} className="border-b border-glass-border/10 hover:bg-white/5 transition-all">
                            {previewHeaders.map((header) => (
                              <td key={header} className="p-3 text-gray-300 max-w-xs truncate" title={row[header]}>
                                {String(row[header] ?? '—')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* History Tab */
            <div className="flex-1 flex flex-col overflow-hidden">
              <h4 className="text-lg font-semibold text-white mb-4">Ingestion Jobs Log</h4>
              
              {loadingJobs ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 size={32} className="animate-spin text-primary" />
                </div>
              ) : previousJobs.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-500">
                  <Database size={40} className="mb-2 text-gray-600" />
                  <p className="text-sm">No catalogue ingestion records found.</p>
                </div>
              ) : (
                <div className="flex-1 overflow-auto border border-glass-border/30 rounded-xl bg-black/20">
                  <table className="w-full text-left text-xs text-gray-300">
                    <thead className="sticky top-0 bg-[#18181b]/95 border-b border-glass-border">
                      <tr>
                        <th className="p-3">Job ID</th>
                        <th className="p-3">Catalogue File</th>
                        <th className="p-3">Created At</th>
                        <th className="p-3">Stats</th>
                        <th className="p-3">Progress</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previousJobs.map((job) => (
                        <tr key={job.id} className="border-b border-glass-border/20 hover:bg-white/5 transition-all">
                          <td className="p-3 font-semibold text-white">#{job.id}</td>
                          <td className="p-3 max-w-xs truncate font-semibold" title={job.file_path}>
                            {job.original_filename || job.file_path.split('\\').pop()?.split('/').pop() || 'Unknown File'}
                          </td>
                          <td className="p-3 text-gray-400">
                            {new Date(job.created_at).toLocaleString()}
                          </td>
                          <td className="p-3 text-gray-400">
                            {job.total_count ? (
                              <div className="text-[10px] space-y-0.5">
                                <div>Total: <span className="font-bold text-white">{job.total_count.toLocaleString()}</span></div>
                                <div className="flex gap-2">
                                  <span className="text-green">New: {job.new_count?.toLocaleString() || 0}</span>
                                  <span>|</span>
                                  <span className="text-yellow-400">Exist: {job.existing_count?.toLocaleString() || 0}</span>
                                  <span>|</span>
                                  <span className="text-red-400">Dup: {job.duplicate_count?.toLocaleString() || 0}</span>
                                </div>
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-col gap-1">
                              {job.status === 'processing_analysis' ? (
                                <span className="text-[9px] text-primary font-medium animate-pulse">
                                  Analyzing: {job.total_count?.toLocaleString() || 0} rows scanned
                                </span>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 bg-white/5 h-1.5 rounded-full overflow-hidden border border-glass-border">
                                      <div 
                                        className={`h-full rounded-full ${job.status === 'paused' ? 'bg-amber-500' : 'bg-primary'}`} 
                                        style={{ width: `${job.progress || 0}%` }}
                                      />
                                    </div>
                                    <span className="text-[9px] font-bold text-gray-400">{job.progress || 0}%</span>
                                  </div>
                                  {job.total_count ? (
                                    <span className="text-[9px] text-gray-500 font-medium">
                                      {((job.new_count || 0) + (job.existing_count || 0) + (job.duplicate_count || 0)).toLocaleString()} / {job.total_count.toLocaleString()} rows
                                    </span>
                                  ) : null}
                                </>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                              job.status === 'done' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                              job.status === 'processing' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                              job.status === 'ready_for_review' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                              job.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                              job.status === 'waiting_for_mapping' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                              job.status === 'paused' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                              'bg-red-500/10 text-red-400 border-red-500/20'
                            }`}>
                              {job.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            {(job.status === 'processing' || job.status === 'pending') && (
                              <button
                                onClick={() => handlePauseJob(job.id)}
                                className="text-xs bg-amber-500 hover:bg-amber-600 text-black px-3 py-1 rounded-lg font-bold transition-all mr-2"
                              >
                                Pause
                              </button>
                            )}
                            {job.status === 'paused' && (
                              <button
                                onClick={() => handleResumeJob(job.id)}
                                className="text-xs bg-green hover:bg-green/90 text-white px-3 py-1 rounded-lg font-bold transition-all mr-2 flex inline-flex items-center gap-1"
                              >
                                <Play size={10} /> Resume
                              </button>
                            )}
                            {job.status === 'waiting_for_mapping' && (
                              <button
                                onClick={async () => {
                                  setError(null);
                                  setSuccess(null);
                                  setJobId(job.id);
                                  setJobStatus(job.status);
                                  try {
                                    const data = await api.getCatalogJobStatus(job.id);
                                    
                                    const headers = Array.isArray(data.headers) && data.headers.length > 0 ? data.headers : [];
                                    const preview = Array.isArray(data.previewData) ? data.previewData : [];
                                    
                                    setFileHeaders(headers);
                                    setPreviewRows(preview);
                                    
                                    if (preview.length > 0) {
                                      setPreviewHeaders(Object.keys(preview[0]));
                                    } else if (headers.length > 0) {
                                      setPreviewHeaders(headers);
                                    } else {
                                      setPreviewHeaders([]);
                                    }
                                    
                                    setColumnMappings(data.suggestedMapping || {});
                                    setShowMappingModal(true);
                                  } catch (err) {
                                    console.error('Configure Mappings Error:', err);
                                    setError('Failed to load mapping details.');
                                  }
                                }}
                                className="text-xs bg-amber-500 hover:bg-amber-600 text-black px-3 py-1 rounded-lg font-bold transition-all"
                              >
                                Configure Mappings
                              </button>
                            )}
                            {(job.status === 'ready_for_review' || job.status === 'done') && (
                              <button
                                onClick={() => reviewJobFromHistory(job)}
                                className="text-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 px-3 py-1 rounded-lg font-bold transition-all"
                              >
                                Review / Import
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mapping Preview Popup */}
      {showMappingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-3">
          <div className="glass-panel w-full max-w-[99vw] h-[98vh] lg:max-w-[98vw] lg:h-[95vh] flex flex-col rounded-2xl border border-glass-border shadow-2xl overflow-hidden bg-zinc-950">
            {/* Modal Header */}
            <div className="p-4 md:px-6 md:py-4 border-b border-glass-border bg-white/5 flex justify-between items-center">
              <div>
                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                  <Database size={20} className="text-primary" />
                  Catalogue Column Mapping & Configuration
                </h4>
                <p className="text-gray-400 text-xs mt-1">
                  Map the columns from your uploaded file to the pharmacy catalog fields. Product Name is required.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowMappingModal(false);
                }}
                className="text-gray-400 hover:text-white transition-colors text-sm font-bold bg-white/10 px-3 py-1.5 rounded-lg border border-white/10"
              >
                Cancel
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
              {/* Left Column: Mappings form */}
              <div className="w-full lg:w-[48%] xl:w-[50%] p-4 md:p-5 overflow-y-auto border-b lg:border-b-0 lg:border-r border-glass-border flex flex-col gap-4">
                <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Configure Column Mappings</h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {fileHeaders.map((header) => {
                    const currentMapping = columnMappings[header] || '';
                    const sampleValue = previewRows[0]?.[header] || '—';

                    return (
                      <div key={header} className="p-3 rounded-lg border border-glass-border/60 bg-white/5 hover:bg-white/10 hover:border-primary/40 transition-all flex flex-col gap-2">
                        <div className="flex flex-col gap-1 min-w-0">
                          <span className="text-xs font-bold text-white truncate block" title={header}>
                            {header}
                          </span>
                          <span className="text-[10px] text-gray-400 bg-black/40 px-1.5 py-0.5 rounded border border-glass-border/30 truncate self-start block max-w-full font-medium" title={String(sampleValue)}>
                            Sample: <span className="text-primary font-mono">{String(sampleValue)}</span>
                          </span>
                        </div>
                        
                        <select
                          value={currentMapping}
                          onChange={(e) => {
                            const newMappings = { ...columnMappings, [header]: e.target.value };
                            setColumnMappings(newMappings);
                          }}
                          className="w-full bg-black/60 border border-glass-border/60 text-white text-xs rounded-lg p-2 outline-none focus:border-primary transition-all cursor-pointer font-medium"
                        >
                          <option value="">-- Ignore --</option>
                          {AVAILABLE_DB_SECTIONS.map((section) => (
                            <optgroup key={section.label} label={section.label} className="bg-[#18181b] text-primary font-semibold">
                              {section.fields.map((f) => (
                                <option key={f.value} value={f.value} className="bg-[#18181b] text-white font-normal">
                                  {f.label}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Column: Sample Data Preview (First 100 Rows) */}
              <div className="w-full lg:w-[52%] xl:w-[50%] p-4 md:p-5 flex flex-col overflow-hidden">
                <h5 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Sample Data Grid (First 100 Rows)</h5>
                
                <div className="flex-1 overflow-auto border border-glass-border rounded-xl bg-black/40">
                  <table className="min-w-full divide-y divide-glass-border text-xs text-left">
                    <thead className="bg-white/5 sticky top-0 z-10">
                      <tr>
                        {fileHeaders.filter(header => columnMappings[header]).map((header) => {
                          const isMapped = columnMappings[header];
                          const fieldInfo = isMapped ? getFieldLabelAndSection(isMapped) : null;
                          return (
                            <th 
                              key={header} 
                              className={`px-4 py-3 font-bold border-b border-glass-border truncate whitespace-nowrap ${isMapped ? 'text-primary' : 'text-gray-500'}`}
                            >
                              {header}
                              {isMapped && fieldInfo && (
                                <span className="block text-[10px] font-medium text-emerald-400 mt-1 flex items-center gap-1.5">
                                  <span className="bg-emerald-400/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-400/20">{fieldInfo.section}</span>
                                  <span>{fieldInfo.label}</span>
                                </span>
                              )}
                            </th>
                          );
                        })}
                        {fileHeaders.filter(header => columnMappings[header]).length === 0 && (
                          <th className="px-4 py-3 font-normal text-gray-500 italic border-b border-glass-border">No columns mapped yet.</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-glass-border/40 text-gray-300 font-mono">
                      {previewRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          {fileHeaders.filter(header => columnMappings[header]).map((header) => (
                            <td key={header} className="px-4 py-2 border-r border-glass-border/20 truncate max-w-[200px]" title={row[header]}>
                              {row[header] !== undefined ? String(row[header]) : ''}
                            </td>
                          ))}
                          {fileHeaders.filter(header => columnMappings[header]).length === 0 && (
                            <td className="px-4 py-2 italic text-gray-600">Select mappings on the left to preview data.</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-glass-border bg-white/5 flex justify-between items-center">
              <div className="text-xs text-gray-400 flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-amber-500 animate-pulse" />
                <span>Mappings are learned to auto-suggest in subsequent file uploads.</span>
              </div>
              
              <button
                onClick={async () => {
                  // Validate Product Name (required) is mapped
                  const nameMapped = Object.values(columnMappings).includes('name');
                  if (!nameMapped) {
                    alert('Error: You must map at least one column to the "Product Name (Required)" target field.');
                    return;
                  }
                  
                  // Start ingestion
                  if (!jobId) return;
                  setError(null);
                  setSuccess(null);
                  setImporting(true);
                  setJobStatus('processing');
                  setProgress(0);
                  setShowMappingModal(false);
                  setActiveTab('upload');
                  
                  try {
                    const res = await api.importCatalogJob(jobId, columnMappings, {});
                    if (res.success) {
                      setSuccess('Mapping confirmed. Background ingestion started successfully.');
                    } else {
                      throw new Error(res.message || 'Ingestion trigger failed');
                    }
                  } catch (err: any) {
                    setError(err.response?.data?.error || err.message || 'Failed to trigger ingestion');
                    setImporting(false);
                    setJobStatus(null);
                  }
                }}
                className="bg-primary hover:bg-primary/90 text-white text-xs font-bold px-6 py-3 rounded-lg flex items-center gap-2 shadow-lg hover:shadow-primary/20 transition-all"
              >
                <Play size={14} /> Confirm & Start Ingestion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CatalogUpload;
