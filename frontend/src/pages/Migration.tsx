import React, { useState, useEffect, useCallback } from 'react';
import {
  UploadCloud, Database, ArrowRight, CheckCircle, Loader2, AlertTriangle,
  FileSpreadsheet, FileText, Archive, X, RefreshCw, Eye, ChevronDown,
  Package, ShoppingCart, Users, RotateCcw, Zap, FileCheck
} from 'lucide-react';
import { api } from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────
type WizardStep = 1 | 2 | 3 | 4;
type DataType = 'inventory' | 'purchases' | 'sales' | 'customers' | 'unknown';

interface FileEntry {
  uploadedFileName: string;     // server file name
  originalName: string;         // user-facing name
  ext: string;                  // csv / xlsx / xls / sql / zip
  headers: string[];
  samples: any[];
  sheetNames?: string[];
  activeSheet?: string;
  detected: { type: DataType; confidence: number };
  userSelectedType: DataType;   // human override
  mapping: Record<string, string>;
  status: 'pending' | 'analyzing' | 'ready' | 'error';
  errorMsg?: string;
  rowCount?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DATA_TYPE_LABELS: Record<DataType, string> = {
  inventory: '📦 Inventory / Stock',
  purchases: '🛒 Purchase Bills',
  sales: '💰 Sales Invoices',
  customers: '👥 Customers / Patients',
  unknown: '❓ Unknown',
};

const DATA_TYPE_ORDER: DataType[] = ['inventory', 'purchases', 'customers', 'sales'];

const TYPE_COLORS: Record<DataType, string> = {
  inventory: 'text-sky border-sky/40 bg-sky/10',
  purchases: 'text-amber-400 border-amber-400/40 bg-amber-400/10',
  sales: 'text-green border-green/40 bg-green/10',
  customers: 'text-purple-400 border-purple-400/40 bg-purple-400/10',
  unknown: 'text-muted border-glass-border bg-white/5',
};

const TYPE_ICONS: Record<DataType, React.ReactNode> = {
  inventory: <Package size={14} />,
  purchases: <ShoppingCart size={14} />,
  sales: <FileCheck size={14} />,
  customers: <Users size={14} />,
  unknown: <FileText size={14} />,
};

const DB_TARGET_COLUMNS = [
  { value: '', label: '-- Ignore Column --' },
  { value: 'name', label: 'Medicine Name ⭐' },
  { value: 'batch_no', label: 'Batch Number' },
  { value: 'expiry_date', label: 'Expiry Date' },
  { value: 'quantity', label: 'Quantity / Stock' },
  { value: 'mrp', label: 'MRP (₹)' },
  { value: 'cost_price', label: 'Cost / Purchase Price (₹)' },
  { value: 'rack_location', label: 'Rack Location' },
  { value: 'invoice_no', label: 'Invoice / Bill No' },
  { value: 'date', label: 'Date' },
  { value: 'total_amount', label: 'Total Amount (₹)' },
  { value: 'patient_name', label: 'Patient / Customer Name' },
  { value: 'distributor_name', label: 'Distributor / Supplier Name' },
  { value: 'doctor_name', label: 'Doctor Name' },
  { value: 'cgst', label: 'CGST %' },
  { value: 'sgst', label: 'SGST %' },
  { value: 'discount', label: 'Discount %' },
];

// ─── Smart auto-mapping: guess target field from column header ─────────────────
function autoMapColumn(header: string): string {
  const h = header.toLowerCase().replace(/[^a-z]/g, '');
  if (h.includes('name') && (h.includes('med') || h.includes('prod') || h.includes('item') || h.includes('drug'))) return 'name';
  if (h.includes('prodname') || h === 'product' || h === 'medicine' || h === 'itemname' || h === 'medname') return 'name';
  if (h.includes('batch')) return 'batch_no';
  if (h.includes('exp')) return 'expiry_date';
  if (h.includes('qty') || h.includes('quantity') || h.includes('stock')) return 'quantity';
  if (h === 'mrp' || h.includes('retail') || h.includes('salerate')) return 'mrp';
  if (h.includes('cost') || h.includes('purch') || h.includes('rate')) return 'cost_price';
  if (h.includes('rack') || h.includes('location') || h.includes('shelf')) return 'rack_location';
  if (h.includes('invoice') || h.includes('billno') || h.includes('bill')) return 'invoice_no';
  if (h === 'date' || h.includes('billdate') || h.includes('saledate') || h.includes('purchdate')) return 'date';
  if (h.includes('total') || h.includes('amount') || h.includes('value')) return 'total_amount';
  if (h.includes('patient') || h.includes('customer') || h.includes('client')) return 'patient_name';
  if (h.includes('dist') || h.includes('supplier') || h.includes('vendor') || h.includes('party')) return 'distributor_name';
  if (h.includes('doctor') || h.includes('dr')) return 'doctor_name';
  if (h.includes('cgst')) return 'cgst';
  if (h.includes('sgst')) return 'sgst';
  if (h.includes('disc')) return 'discount';
  return '';
}

// ─── Component ────────────────────────────────────────────────────────────────
const Migration = () => {
  const [step, setStep] = useState<WizardStep>(1);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [activeFileIdx, setActiveFileIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [migrationStatus, setMigrationStatus] = useState<any>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [stagingData, setStagingData] = useState<{ inventory: any[]; sales: any[]; purchases: any[] }>({ inventory: [], sales: [], purchases: [] });
  const [previewOpen, setPreviewOpen] = useState<number | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [activeImportIdx, setActiveImportIdx] = useState(0); // which file is currently being imported

  // Poll migration status
  useEffect(() => {
    let interval: any;
    if (isPolling) {
      interval = setInterval(async () => {
        try {
          const status = await api.getMigrationStatus();
          setMigrationStatus(status);
          if (status.isStagingReady) {
            setIsPolling(false);
            // Move to next file or go to step 3
            const nextIdx = activeImportIdx + 1;
            const readyFiles = files.filter(f => f.status === 'ready');
            if (nextIdx < readyFiles.length) {
              setActiveImportIdx(nextIdx);
              await importFile(readyFiles[nextIdx]);
            } else {
              fetchStagingData();
              setStep(3);
            }
          }
        } catch (e) { console.error(e); }
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [isPolling, activeImportIdx, files]);

  const fetchStagingData = async () => {
    try {
      const [inv, sales, pur] = await Promise.all([api.getStagingInventory(), api.getStagingSales(), api.getStagingPurchases()]);
      setStagingData({ inventory: inv, sales, purchases: pur });
    } catch (e) { console.error(e); }
  };

  // ─── Upload Handler ─────────────────────────────────────────────────────────
  const handleFileDrop = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;
    setUploading(true);
    setError(null);

    for (const file of selected) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const entry: FileEntry = {
        uploadedFileName: '',
        originalName: file.name,
        ext,
        headers: [],
        samples: [],
        detected: { type: 'unknown', confidence: 0 },
        userSelectedType: 'unknown',
        mapping: {},
        status: 'analyzing',
      };
      setFiles(prev => [...prev, entry]);
      const idx = files.length + selected.indexOf(file);

      try {
        // 1. Upload
        const res = await api.uploadMigrationFile(file);
        const serverName: string = res.file;

        // 2. Analyze based on type
        let analyzed: any = {};
        if (ext === 'zip') {
          analyzed = await api.analyzeZipFile(serverName);
          // ZIP returns multiple files — add each as separate entry
          setFiles(prev => {
            const withoutPlaceholder = prev.filter(f => f.originalName !== file.name || f.status !== 'analyzing');
            const zipEntries: FileEntry[] = (analyzed.files || []).map((zf: any) => ({
              uploadedFileName: zf.extractedFileName,
              originalName: zf.originalName,
              ext: zf.ext,
              headers: zf.headers || [],
              samples: zf.samples || [],
              sheetNames: zf.sheetNames,
              detected: zf.detected || { type: 'unknown', confidence: 0 },
              userSelectedType: (zf.detected?.type as DataType) || 'unknown',
              mapping: Object.fromEntries((zf.headers || []).map((h: string) => [h, autoMapColumn(h)])),
              status: 'ready' as const,
            }));
            return [...withoutPlaceholder, ...zipEntries];
          });
          continue;
        } else if (ext === 'xlsx' || ext === 'xls') {
          analyzed = await api.analyzeExcelFile(serverName);
        } else if (ext === 'csv') {
          analyzed = await api.analyzeMigrationFile(serverName, 0);
        } else if (ext === 'sql') {
          analyzed = { headers: ['[SQL — auto-import]'], samples: [], detected: { type: 'inventory', confidence: 50 } };
        }

        const headers: string[] = analyzed.headers || [];
        const detectedType = (analyzed.detected?.type as DataType) || 'unknown';
        const autoMapping = Object.fromEntries(headers.map((h: string) => [h, autoMapColumn(h)]));

        setFiles(prev => prev.map(f =>
          f.originalName === file.name && f.status === 'analyzing'
            ? {
                ...f,
                uploadedFileName: serverName,
                headers,
                samples: analyzed.samples || [],
                sheetNames: analyzed.sheetNames,
                detected: analyzed.detected || { type: 'unknown', confidence: 0 },
                userSelectedType: detectedType,
                mapping: autoMapping,
                status: 'ready',
              }
            : f
        ));
      } catch (err: any) {
        setFiles(prev => prev.map(f =>
          f.originalName === file.name && f.status === 'analyzing'
            ? { ...f, status: 'error', errorMsg: err.message || 'Analysis failed' }
            : f
        ));
      }
    }
    setUploading(false);
    if (files.length === 0 && selected.length > 0) setStep(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.length]);

  // When files are added, auto-advance to step 2
  useEffect(() => {
    if (files.length > 0 && step === 1) setStep(2);
  }, [files.length]);

  // ─── Import a single file into staging ─────────────────────────────────────
  const importFile = async (file: FileEntry) => {
    try {
      setMigrationStatus({ message: `Importing ${file.originalName}...`, isStagingReady: false });
      setIsPolling(true);
      await api.runMigration(file.uploadedFileName, file.mapping, 0);
    } catch (err: any) {
      setError(`Failed to import ${file.originalName}: ${err.message}`);
      setIsPolling(false);
    }
  };

  // ─── Start all migrations in correct order ──────────────────────────────────
  const startMigration = async () => {
    const readyFiles = DATA_TYPE_ORDER.flatMap(type =>
      files.filter(f => f.status === 'ready' && f.userSelectedType === type)
    ).concat(files.filter(f => f.status === 'ready' && f.userSelectedType === 'unknown'));

    if (readyFiles.length === 0) { setError('No files ready to import.'); return; }
    setError(null);
    setActiveImportIdx(0);
    setStep(3);
    await importFile(readyFiles[0]);
  };

  const finalizeMigration = async () => {
    try {
      await api.finalizeMigration(false);
      setStep(4);
    } catch (err: any) {
      setError(err.message || 'Failed to finalize');
    }
  };

  const handleRollback = async () => {
    if (!confirm('This will DELETE the staged data and let you start fresh. Continue?')) return;
    setRollingBack(true);
    try {
      await api.rollbackMigration();
      setFiles([]);
      setStep(1);
      setMigrationStatus(null);
      setStagingData({ inventory: [], sales: [], purchases: [] });
    } catch (err: any) {
      setError(err.message);
    } finally { setRollingBack(false); }
  };

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));
  const updateType = (idx: number, type: DataType) => setFiles(prev => prev.map((f, i) => i === idx ? { ...f, userSelectedType: type } : f));
  const updateMapping = (fileIdx: number, header: string, target: string) =>
    setFiles(prev => prev.map((f, i) => i === fileIdx ? { ...f, mapping: { ...f.mapping, [header]: target } } : f));

  const readyCount = files.filter(f => f.status === 'ready').length;
  const hasNameMapped = (f: FileEntry) =>
    ['sql', 'unknown'].includes(f.ext) || Object.values(f.mapping).includes('name');

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col fade-in space-y-5 overflow-y-auto pb-12">

      {/* Header */}
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight mb-1 flex items-center gap-2">
          <Database size={28} className="text-primary" />
          Data Migration Wizard
        </h2>
        <p className="text-muted text-sm mt-1">Import your old pharmacy data — CSV, Excel, ZIP, or SQL dumps.</p>
        
        {/* Feature Badges */}
        <div className="flex gap-2 text-[10px] flex-wrap mt-3 max-w-4xl">
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Product Import</span>
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Customer Import</span>
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Supplier Import</span>
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Purchase Import</span>
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Sales Import</span>
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Inventory Import</span>
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Data Validation</span>
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Error Detection</span>
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Duplicate Detection</span>
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Migration Progress Tracking</span>
          <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-1 rounded">✓ Migration Reports</span>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center glass-panel p-4 bg-black/40 gap-1">
        {[
          { num: 1, label: 'Upload Files' },
          { num: 2, label: 'Map & Verify' },
          { num: 3, label: 'Review Staging' },
          { num: 4, label: 'Go Live ✅' },
        ].map((s, i) => (
          <React.Fragment key={s.num}>
            <div className={`flex items-center gap-2 ${step >= s.num ? 'text-primary' : 'text-muted'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                ${step > s.num ? 'bg-green/20 text-green border border-green/50'
                  : step === s.num ? 'bg-primary/20 text-primary border border-primary/50'
                  : 'bg-white/5 border border-glass-border'}`}>
                {step > s.num ? <CheckCircle size={14} /> : s.num}
              </div>
              <span className="font-semibold text-xs hidden md:block">{s.label}</span>
            </div>
            {i < 3 && <div className="flex-1 h-px bg-glass-border mx-1" />}
          </React.Fragment>
        ))}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl flex items-center gap-3">
          <AlertTriangle size={18} /> <span className="font-semibold text-sm">{error}</span>
          <button className="ml-auto text-muted hover:text-white" onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      {/* ─── STEP 1: UPLOAD ──────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-5">
          {/* Drop Zone */}
          <label className="glass-panel p-12 flex flex-col items-center justify-center border-dashed border-2 border-primary/30 cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-all group">
            <UploadCloud size={56} className="text-primary/40 group-hover:text-primary/70 mb-5 transition-all" />
            <h3 className="text-xl font-bold mb-2">Drop files here or click to browse</h3>
            <p className="text-muted text-sm text-center max-w-md mb-2">
              Supports <strong className="text-sky">.csv</strong>, <strong className="text-green">.xlsx / .xls</strong>,
              <strong className="text-amber-400"> .zip</strong> (multiple files), <strong className="text-purple-400">.sql</strong>
            </p>
            <p className="text-muted text-xs">You can upload multiple files at once</p>
            {uploading && <div className="mt-4 flex items-center gap-2 text-sky text-sm"><Loader2 size={16} className="animate-spin" /> Uploading & analyzing...</div>}
            <input
              type="file"
              accept=".csv,.xlsx,.xls,.zip,.sql"
              multiple
              className="hidden"
              onChange={handleFileDrop}
              disabled={uploading}
            />
          </label>

          {/* Format Guide */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { icon: <FileText size={20} className="text-sky" />, label: 'CSV', desc: 'Any comma-separated export from your old software', color: 'border-sky/20' },
              { icon: <FileSpreadsheet size={20} className="text-green" />, label: 'Excel (.xlsx)', desc: 'Excel sheets with medicine/sales data', color: 'border-green/20' },
              { icon: <Archive size={20} className="text-amber-400" />, label: 'ZIP Archive', desc: 'Folder of multiple CSV/Excel files zipped together', color: 'border-amber-400/20' },
              { icon: <Database size={20} className="text-purple-400" />, label: 'SQL Dump', desc: 'Database backup from Marg, Busy, or PostgreSQL', color: 'border-purple-400/20' },
            ].map(f => (
              <div key={f.label} className={`glass-panel p-4 border ${f.color}`}>
                <div className="mb-2">{f.icon}</div>
                <p className="font-bold text-sm">{f.label}</p>
                <p className="text-muted text-xs mt-1">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── STEP 2: MAP & VERIFY ─────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Upload More */}
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">
              {files.length} file{files.length !== 1 ? 's' : ''} ready for import
            </h3>
            <label className="premium-btn bg-white/5 border border-glass-border text-muted hover:bg-white/10 cursor-pointer text-xs">
              <UploadCloud size={13} /> Add More Files
              <input type="file" accept=".csv,.xlsx,.xls,.zip,.sql" multiple className="hidden" onChange={handleFileDrop} />
            </label>
          </div>

          {/* Import Order Hint */}
          <div className="p-3 bg-amber-400/10 border border-amber-400/20 rounded-xl text-xs text-amber-300 flex items-start gap-2">
            <Zap size={14} className="mt-0.5 shrink-0" />
            <div>
              <strong>Import order matters:</strong> App will process files in this order automatically —
              <span className="text-sky"> Inventory</span> →
              <span className="text-amber-400"> Purchases</span> →
              <span className="text-purple-400"> Customers</span> →
              <span className="text-green"> Sales</span>
            </div>
          </div>

          {/* File Cards */}
          {files.map((file, idx) => (
            <div key={idx} className={`glass-panel overflow-hidden border
              ${file.status === 'error' ? 'border-red-500/30' : file.status === 'analyzing' ? 'border-primary/30' : 'border-glass-border'}`}>

              {/* File Header */}
              <div className="flex items-center gap-3 p-4 bg-white/3">
                {file.status === 'analyzing' && <Loader2 size={18} className="animate-spin text-primary shrink-0" />}
                {file.status === 'ready' && <CheckCircle size={18} className="text-green shrink-0" />}
                {file.status === 'error' && <AlertTriangle size={18} className="text-red-400 shrink-0" />}

                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{file.originalName}</p>
                  <p className="text-[10px] text-muted font-mono uppercase">{file.ext} · {file.headers.length} columns</p>
                </div>

                {/* Data Type Selector */}
                {file.status === 'ready' && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted hidden sm:block">Type:</span>
                    <select
                      className={`text-[11px] font-bold px-2 py-1 rounded-lg border cursor-pointer bg-transparent ${TYPE_COLORS[file.userSelectedType]}`}
                      value={file.userSelectedType}
                      onChange={e => updateType(idx, e.target.value as DataType)}
                    >
                      {Object.entries(DATA_TYPE_LABELS).map(([val, label]) => (
                        <option key={val} value={val} className="bg-[#18181b] text-white">{label}</option>
                      ))}
                    </select>
                    {file.detected.type !== 'unknown' && (
                      <span className="text-[9px] text-muted hidden md:block">
                        Auto-detected {file.detected.confidence}%
                      </span>
                    )}
                  </div>
                )}

                {file.status === 'ready' && (
                  <button
                    onClick={() => setPreviewOpen(previewOpen === idx ? null : idx)}
                    className="p-1.5 rounded hover:bg-white/10 text-muted" title="Preview data">
                    <Eye size={14} />
                  </button>
                )}
                <button onClick={() => removeFile(idx)} className="p-1.5 rounded hover:bg-red/20 text-red-400" title="Remove">
                  <X size={14} />
                </button>
              </div>

              {/* Error */}
              {file.status === 'error' && (
                <div className="px-4 pb-3 text-xs text-red-400">{file.errorMsg}</div>
              )}

              {/* Column Mapping */}
              {file.status === 'ready' && file.headers.length > 0 && !['sql'].includes(file.ext) && (
                <div className="border-t border-glass-border p-4 space-y-2 bg-black/20">
                  <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-3">
                    Column Mapping — match your file columns to app fields
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {file.headers.map(header => (
                      <div key={header} className="flex items-center gap-2 bg-white/3 border border-glass-border/30 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-sky truncate">{header}</p>
                          <p className="text-[9px] text-muted truncate">{file.samples[0]?.[header] ?? '—'}</p>
                        </div>
                        <ArrowRight size={11} className="text-muted shrink-0" />
                        <select
                          className="text-[10px] bg-black/40 border border-glass-border rounded px-1.5 py-1 text-text max-w-[130px]"
                          value={file.mapping[header] || ''}
                          onChange={e => updateMapping(idx, header, e.target.value)}
                        >
                          {DB_TARGET_COLUMNS.map(col => (
                            <option key={col.value} value={col.value} className="bg-[#18181b]">{col.label}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  {!hasNameMapped(file) && (
                    <p className="text-amber-400 text-[10px] font-semibold mt-2">
                      ⚠ Map at least one column to "Medicine Name" to enable import.
                    </p>
                  )}
                </div>
              )}

              {/* Data Preview */}
              {previewOpen === idx && file.samples.length > 0 && (
                <div className="border-t border-glass-border bg-black/30 overflow-auto max-h-48">
                  <table className="w-full text-left text-[10px]">
                    <thead className="sticky top-0 bg-[#18181b] shadow-md">
                      <tr>
                        {file.headers.slice(0, 10).map(h => {
                          const mappedValue = file.mapping[h];
                          const targetCol = DB_TARGET_COLUMNS.find(c => c.value === mappedValue);
                          const isIgnored = !targetCol || targetCol.value === '';
                          return (
                            <th key={h} className="p-2 border-b border-glass-border truncate max-w-[120px]">
                              <div className="text-[9px] text-muted font-normal uppercase tracking-wider">{h}</div>
                              <div className={`text-xs font-bold mt-0.5 ${isIgnored ? 'text-muted/50 line-through' : 'text-primary'}`}>
                                {isIgnored ? 'Ignored' : targetCol.label.replace(' ⭐', '')}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {file.samples.map((row, ri) => (
                        <tr key={ri} className="border-b border-glass-border/20 hover:bg-white/5">
                          {file.headers.slice(0, 10).map(h => {
                            const isIgnored = !file.mapping[h];
                            return (
                              <td key={h} className={`p-2 truncate max-w-[120px] ${isIgnored ? 'text-muted/30' : 'text-muted'}`}>
                                {String(row[h] ?? '—')}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {file.headers.length > 10 && (
                    <div className="p-2 text-center text-[10px] text-muted bg-white/5">
                      ...and {file.headers.length - 10} more columns
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Action Bar */}
          {files.length > 0 && (
            <div className="flex items-center justify-between pt-2">
              <button onClick={() => { setFiles([]); setStep(1); }} className="premium-btn bg-white/5 border border-glass-border text-muted hover:bg-white/10 text-xs">
                <X size={13} /> Clear All
              </button>
              <div className="flex items-center gap-3">
                <p className="text-xs text-muted">{readyCount} of {files.length} files ready</p>
                <button
                  onClick={startMigration}
                  disabled={readyCount === 0}
                  className="premium-btn bg-primary text-white shadow-[0_0_20px_rgba(59,130,246,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Database size={15} /> Start Import <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── STEP 3: STAGING REVIEW ───────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5">
          {/* Progress */}
          <div className="glass-panel p-5 border-primary/30">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-base">Import Progress</h3>
                <p className="text-sky text-sm mt-1">{migrationStatus?.message || 'Processing...'}</p>
              </div>
              {isPolling && <Loader2 className="animate-spin text-primary" size={28} />}
              {!isPolling && migrationStatus?.isStagingReady && <CheckCircle className="text-green" size={28} />}
            </div>
            {isPolling && (
              <div className="w-full bg-white/5 rounded-full h-2 mt-3">
                <div className="bg-primary h-2 rounded-full animate-pulse" style={{ width: `${migrationStatus?.progress || 30}%` }} />
              </div>
            )}
          </div>

          {/* Staging Summary */}
          {!isPolling && migrationStatus?.isStagingReady && (
            <div className="space-y-5">
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Inventory Items', count: stagingData.inventory.length, color: 'text-sky' },
                  { label: 'Sales Invoices', count: stagingData.sales.length, color: 'text-green' },
                  { label: 'Purchase Bills', count: stagingData.purchases.length, color: 'text-primary' },
                ].map(s => (
                  <div key={s.label} className="glass-panel p-5 text-center">
                    <p className={`text-3xl font-black ${s.color}`}>{s.count}</p>
                    <p className="text-xs text-muted font-bold uppercase tracking-wider mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Inventory Preview */}
              <div className="glass-panel overflow-hidden">
                <div className="p-4 bg-white/5 border-b border-glass-border flex items-center gap-2">
                  <Package size={15} className="text-sky" />
                  <h4 className="font-bold text-sm">Staged Inventory Preview (first 10 rows)</h4>
                </div>
                <div className="overflow-auto max-h-56">
                  <table className="w-full text-xs text-left">
                    <thead className="sticky top-0 bg-[#18181b]/95">
                      <tr>
                        {['Medicine', 'Batch', 'Quantity', 'MRP'].map(h => (
                          <th key={h} className="p-3 text-muted font-bold border-b border-glass-border">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stagingData.inventory.slice(0, 10).map((i: any) => (
                        <tr key={i.id} className="border-b border-glass-border/20 hover:bg-white/5">
                          <td className="p-3 font-semibold">{i.medicine_name}</td>
                          <td className="p-3 font-mono text-muted">{i.batch_no || '—'}</td>
                          <td className="p-3 font-bold text-sky">{i.quantity}</td>
                          <td className="p-3">₹{i.mrp || '—'}</td>
                        </tr>
                      ))}
                      {stagingData.inventory.length > 10 && (
                        <tr><td colSpan={4} className="p-3 text-center text-muted italic text-xs">
                          ...and {stagingData.inventory.length - 10} more rows
                        </td></tr>
                      )}
                      {stagingData.inventory.length === 0 && (
                        <tr><td colSpan={4} className="p-6 text-center text-muted">No inventory records staged.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                <button
                  onClick={handleRollback}
                  disabled={rollingBack}
                  className="premium-btn bg-white/5 border border-red-500/20 text-red-400 hover:bg-red/10 text-xs"
                >
                  {rollingBack ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                  Rollback & Start Over
                </button>
                <button
                  onClick={finalizeMigration}
                  className="premium-btn bg-green text-white shadow-[0_0_20px_rgba(16,185,129,0.3)] font-bold"
                >
                  <Database size={16} /> Finalize & Go Live
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── STEP 4: SUCCESS ──────────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="glass-panel p-14 flex flex-col items-center justify-center border-2 border-green/30 text-center">
          <div className="w-24 h-24 rounded-full bg-green/20 flex items-center justify-center mb-6">
            <CheckCircle size={48} className="text-green" />
          </div>
          <h3 className="text-3xl font-black mb-3 text-white">Migration Complete!</h3>
          <p className="text-muted max-w-lg mb-8">
            All your old data is now live in the AI Pharmacy database. Inventory, Sales, Purchases, and Patients are ready to use.
          </p>
          <div className="flex gap-3">
            <a href="/" className="premium-btn bg-primary text-white shadow-[0_0_20px_rgba(59,130,246,0.3)] text-base px-8 py-3">
              Go to Dashboard
            </a>
            <button onClick={() => { setStep(1); setFiles([]); setMigrationStatus(null); }}
              className="premium-btn bg-white/5 border border-glass-border text-muted hover:bg-white/10">
              Import More Files
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Migration;
