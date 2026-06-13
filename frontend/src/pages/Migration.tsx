import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  UploadCloud, Database, ArrowRight, CheckCircle, Loader2, AlertTriangle,
  FileSpreadsheet, FileText, Archive, X, RefreshCw, Eye, ChevronDown,
  Package, ShoppingCart, Users, RotateCcw, Zap, FileCheck
} from 'lucide-react';
import { api, apiClient } from '../services/api';

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

const DB_TARGET_SECTIONS = [
  {
    label: 'Common Fields',
    fields: [
      { value: '', label: '-- Ignore Column --' },
      { value: 'name', label: 'Medicine Name ⭐' }
    ]
  },
  {
    label: '📦 Inventory / Stock',
    fields: [
      { value: 'batch_no', label: 'Batch Number' },
      { value: 'expiry_date', label: 'Expiry Date' },
      { value: 'quantity', label: 'Quantity / Stock' },
      { value: 'mrp', label: 'MRP (₹)' },
      { value: 'cost_price', label: 'Cost / Purchase Price (₹)' },
      { value: 'rack_location', label: 'Rack Location' }
    ]
  },
  {
    label: '🛒 Sales & Purchases',
    fields: [
      { value: 'invoice_no', label: 'Invoice / Bill No' },
      { value: 'date', label: 'Date' },
      { value: 'total_amount', label: 'Total Amount (₹)' },
      { value: 'cgst', label: 'CGST %' },
      { value: 'sgst', label: 'SGST %' },
      { value: 'discount', label: 'Discount %' }
    ]
  },
  {
    label: '👥 Customer & Doctor',
    fields: [
      { value: 'patient_name', label: 'Patient / Customer Name' },
      { value: 'distributor_name', label: 'Distributor / Supplier Name' },
      { value: 'doctor_name', label: 'Doctor Name' }
    ]
  }
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
  const [stagingData, setStagingData] = useState<{ inventory: any[]; sales: any[]; purchases: any[]; errors: any[] }>({ inventory: [], sales: [], purchases: [], errors: [] });
  const [previewOpen, setPreviewOpen] = useState<number | null>(null);
  const [rollingBack, setRollingBack] = useState(false);
  const [activeImportIdx, setActiveImportIdx] = useState(0); // which file is currently being imported
  
  // Mapping Modal State
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [activeMappingFileIdx, setActiveMappingFileIdx] = useState<number | null>(null);

  // Staging Explorer & Editing States
  const [activeStagingTab, setActiveStagingTab] = useState<'inventory' | 'sales' | 'purchases' | 'errors'>('inventory');
  const [stagingSearchQuery, setStagingSearchQuery] = useState('');
  const [editingRecordType, setEditingRecordType] = useState<'inventory' | 'sales' | 'purchases' | null>(null);
  const [editingRecordData, setEditingRecordData] = useState<any>(null);
  const [savingRecord, setSavingRecord] = useState(false);

  const handleEditRecord = (type: 'inventory' | 'sales' | 'purchases', record: any) => {
    setEditingRecordType(type);
    setEditingRecordData({ ...record });
  };

  const handleSaveRecord = async () => {
    if (!editingRecordType || !editingRecordData) return;
    setSavingRecord(true);
    try {
      const { id } = editingRecordData;
      if (editingRecordType === 'inventory') {
        await api.updateStagingInventory(id, {
          medicine_name: editingRecordData.medicine_name,
          api_reference: editingRecordData.api_reference,
          batch_no: editingRecordData.batch_no,
          expiry_date: editingRecordData.expiry_date,
          quantity: editingRecordData.quantity,
          mrp: editingRecordData.mrp,
          cost_price: editingRecordData.cost_price,
          rack_location: editingRecordData.rack_location,
        });
      } else if (editingRecordType === 'sales') {
        await api.updateStagingSales(id, {
          invoice_no: editingRecordData.invoice_no,
          date: editingRecordData.date,
          total_amount: editingRecordData.total_amount,
          patient_name: editingRecordData.patient_name,
          doctor_name: editingRecordData.doctor_name,
        });
      } else if (editingRecordType === 'purchases') {
        await api.updateStagingPurchases(id, {
          invoice_no: editingRecordData.invoice_no,
          date: editingRecordData.date,
          total_amount: editingRecordData.total_amount,
          distributor_name: editingRecordData.distributor_name,
        });
      }
      await fetchStagingData();
      setEditingRecordType(null);
      setEditingRecordData(null);
    } catch (err: any) {
      alert(`Failed to update record: ${err.message || 'Unknown error'}`);
    } finally {
      setSavingRecord(false);
    }
  };

  const handleDeleteRecord = async (type: 'inventory' | 'sales' | 'purchases', id: number) => {
    if (!confirm('Are you sure you want to delete this staged record? This cannot be undone.')) return;
    try {
      if (type === 'inventory') {
        await api.deleteStagingInventory(id);
      } else if (type === 'sales') {
        await api.deleteStagingSales(id);
      } else if (type === 'purchases') {
        await api.deleteStagingPurchases(id);
      }
      await fetchStagingData();
    } catch (err: any) {
      alert(`Failed to delete record: ${err.message || 'Unknown error'}`);
    }
  };

  const fetchStagingData = useCallback(async () => {
    try {
      const [inv, sales, pur, errs] = await Promise.all([
        api.getStagingInventory(),
        api.getStagingSales(),
        api.getStagingPurchases(),
        api.getStagingErrors()
      ]);
      setStagingData({ 
        inventory: Array.isArray(inv) ? inv : [], 
        sales: Array.isArray(sales) ? sales : [], 
        purchases: Array.isArray(pur) ? pur : [], 
        errors: Array.isArray(errs) ? errs : [] 
      });
    } catch (e) { console.error(e); }
  }, []);

  // SSE EventSource tracking for migration progress
  useEffect(() => {
    if (!isPolling) return;

    const backendUrl = apiClient.defaults.baseURL || window.location.origin;
    const cleanBaseUrl = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
    const sseUrl = cleanBaseUrl.startsWith('/api')
      ? `${cleanBaseUrl}/notifications/stream`
      : `${cleanBaseUrl}/api/notifications/stream`;

    let eventSource: EventSource | null = new EventSource(sseUrl);

    eventSource.onmessage = async (event) => {
      try {
        const eventData = JSON.parse(event.data);
        const { type, payload } = eventData;

        if (type === 'migration_update' && payload) {
          setMigrationStatus(payload);
          if (payload.isStagingReady) {
            setIsPolling(false);
            
            // Move to next file or go to step 3
            const nextIdx = activeImportIdx + 1;
            const readyFiles = files.filter(f => f.status === 'ready');
            if (nextIdx < readyFiles.length) {
              setActiveImportIdx(nextIdx);
              await importFile(readyFiles[nextIdx]);
            } else {
              await fetchStagingData();
              setStep(3);
            }
          }
        }
      } catch (err) {
        console.error('Failed to parse migration SSE message:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.warn('Migration SSE connection error, retrying in 5 seconds...', err);
      eventSource?.close();
    };

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [isPolling, activeImportIdx, files, fetchStagingData]);

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
  const importFile = useCallback(async (file: FileEntry) => {
    try {
      setMigrationStatus({ message: `Importing ${file.originalName}...`, isStagingReady: false });
      setIsPolling(true);
      await api.runMigration(file.uploadedFileName, file.mapping, 0);
    } catch (err: any) {
      setError(`Failed to import ${file.originalName}: ${err.message}`);
      setIsPolling(false);
    }
  }, []);

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
      setStagingData({ inventory: [], sales: [], purchases: [], errors: [] });
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

                {file.status === 'ready' && file.headers.length > 0 && !['sql'].includes(file.ext) && (
                  <button
                    onClick={() => {
                      setActiveMappingFileIdx(idx);
                      setShowMappingModal(true);
                    }}
                    className="text-[10px] bg-amber-500 hover:bg-amber-600 text-black px-2 py-1 rounded font-bold transition-all ml-2"
                  >
                    Configure Mappings
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
              
              {/* Missing mapping warning */}
              {file.status === 'ready' && file.headers.length > 0 && !['sql'].includes(file.ext) && !hasNameMapped(file) && (
                <div className="px-4 pb-3">
                  <p className="text-amber-400 text-[10px] font-semibold">
                    ⚠ Map at least one column to "Medicine Name" to enable import.
                  </p>
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

      {/* ─── STEP 3: STAGING REVIEW ─────────────────────────────────────────── */}
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

              {/* Interactive Staging Explorer */}
              <div className="glass-panel overflow-hidden border border-glass-border">
                {/* Tabs Bar */}
                <div className="flex border-b border-glass-border bg-bg2 p-2 gap-2 overflow-x-auto">
                  <button
                    onClick={() => { setActiveStagingTab('inventory'); setStagingSearchQuery(''); }}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${activeStagingTab === 'inventory' ? 'bg-primary text-text' : 'text-muted hover:text-text bg-bg3/50'}`}
                  >
                    <Package size={14} /> Inventory ({stagingData.inventory.length})
                  </button>
                  <button
                    onClick={() => { setActiveStagingTab('sales'); setStagingSearchQuery(''); }}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${activeStagingTab === 'sales' ? 'bg-primary text-text' : 'text-muted hover:text-text bg-bg3/50'}`}
                  >
                    <FileCheck size={14} /> Sales Invoices ({stagingData.sales.length})
                  </button>
                  <button
                    onClick={() => { setActiveStagingTab('purchases'); setStagingSearchQuery(''); }}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${activeStagingTab === 'purchases' ? 'bg-primary text-text' : 'text-muted hover:text-text bg-bg3/50'}`}
                  >
                    <ShoppingCart size={14} /> Purchase Bills ({stagingData.purchases.length})
                  </button>
                  <button
                    onClick={() => { setActiveStagingTab('errors'); setStagingSearchQuery(''); }}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${activeStagingTab === 'errors' ? 'bg-primary text-text' : 'text-muted hover:text-text bg-bg3/50'}`}
                  >
                    <AlertTriangle size={14} /> Skipped Errors ({stagingData.errors.length})
                  </button>
                </div>

                {/* Filter and Search */}
                <div className="p-4 border-b border-glass-border bg-bg/50">
                  <input
                    type="text"
                    placeholder={`Search staged ${activeStagingTab} records...`}
                    value={stagingSearchQuery}
                    onChange={(e) => setStagingSearchQuery(e.target.value)}
                    className="w-full max-w-md bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2.5 outline-none focus:border-primary transition-all"
                  />
                </div>

                {/* Data Tables */}
                <div className="overflow-auto max-h-[450px] bg-bg/20">
                  {activeStagingTab === 'inventory' && (() => {
                    const filtered = stagingData.inventory.filter(i => {
                      const query = stagingSearchQuery.toLowerCase();
                      return (i.medicine_name || '').toLowerCase().includes(query) ||
                             (i.batch_no || '').toLowerCase().includes(query) ||
                             (i.rack_location || '').toLowerCase().includes(query);
                    });

                    return (
                      <table className="w-full text-xs text-left">
                        <thead className="sticky top-0 bg-bg2 border-b border-glass-border">
                          <tr>
                            <th className="p-3 text-muted font-bold">Medicine Name</th>
                            <th className="p-3 text-muted font-bold">Generic / Composition</th>
                            <th className="p-3 text-muted font-bold">Batch</th>
                            <th className="p-3 text-muted font-bold">Expiry</th>
                            <th className="p-3 text-muted font-bold text-center">Qty</th>
                            <th className="p-3 text-muted font-bold">MRP</th>
                            <th className="p-3 text-muted font-bold">Cost Price</th>
                            <th className="p-3 text-muted font-bold">Rack</th>
                            <th className="p-3 text-muted font-bold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((i: any) => (
                            <tr key={i.id} className="border-b border-glass-border/20 hover:bg-bg2/40 transition-colors">
                              <td className="p-3 font-semibold text-text">{i.medicine_name}</td>
                              <td className="p-3 text-muted">{i.api_reference || '—'}</td>
                              <td className="p-3 font-mono text-muted">{i.batch_no || '—'}</td>
                              <td className="p-3 font-mono text-muted">{i.expiry_date || '—'}</td>
                              <td className="p-3 text-center font-bold text-sky">{i.quantity}</td>
                              <td className="p-3 text-text">₹{i.mrp || '—'}</td>
                              <td className="p-3 text-text">₹{i.cost_price || '—'}</td>
                              <td className="p-3 text-muted font-mono">{i.rack_location || '—'}</td>
                              <td className="p-3 text-right whitespace-nowrap">
                                <button
                                  onClick={() => handleEditRecord('inventory', i)}
                                  className="text-primary hover:underline font-bold mr-3 text-[11px]"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteRecord('inventory', i.id)}
                                  className="text-red-400 hover:underline font-bold text-[11px]"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                          {filtered.length === 0 && (
                            <tr><td colSpan={9} className="p-6 text-center text-muted">No matching staging inventory records found.</td></tr>
                          )}
                        </tbody>
                      </table>
                    );
                  })()}

                  {activeStagingTab === 'sales' && (() => {
                    const filtered = stagingData.sales.filter(s => {
                      const query = stagingSearchQuery.toLowerCase();
                      return (s.invoice_no || '').toLowerCase().includes(query) ||
                             (s.patient_name || '').toLowerCase().includes(query) ||
                             (s.doctor_name || '').toLowerCase().includes(query);
                    });

                    return (
                      <table className="w-full text-xs text-left">
                        <thead className="sticky top-0 bg-bg2 border-b border-glass-border">
                          <tr>
                            <th className="p-3 text-muted font-bold">Invoice No</th>
                            <th className="p-3 text-muted font-bold">Date</th>
                            <th className="p-3 text-muted font-bold">Total Amount</th>
                            <th className="p-3 text-muted font-bold">Patient Name</th>
                            <th className="p-3 text-muted font-bold">Doctor Name</th>
                            <th className="p-3 text-muted font-bold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((s: any) => (
                            <tr key={s.id} className="border-b border-glass-border/20 hover:bg-bg2/40 transition-colors">
                              <td className="p-3 font-semibold text-text">{s.invoice_no}</td>
                              <td className="p-3 font-mono text-muted">{s.date || '—'}</td>
                              <td className="p-3 font-bold text-green">₹{s.total_amount || 0}</td>
                              <td className="p-3 text-text">{s.patient_name || '—'}</td>
                              <td className="p-3 text-text">{s.doctor_name || '—'}</td>
                              <td className="p-3 text-right whitespace-nowrap">
                                <button
                                  onClick={() => handleEditRecord('sales', s)}
                                  className="text-primary hover:underline font-bold mr-3 text-[11px]"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteRecord('sales', s.id)}
                                  className="text-red-400 hover:underline font-bold text-[11px]"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                          {filtered.length === 0 && (
                            <tr><td colSpan={6} className="p-6 text-center text-muted">No matching staging sales records found.</td></tr>
                          )}
                        </tbody>
                      </table>
                    );
                  })()}

                  {activeStagingTab === 'purchases' && (() => {
                    const filtered = stagingData.purchases.filter(p => {
                      const query = stagingSearchQuery.toLowerCase();
                      return (p.invoice_no || '').toLowerCase().includes(query) ||
                             (p.distributor_name || '').toLowerCase().includes(query);
                    });

                    return (
                      <table className="w-full text-xs text-left">
                        <thead className="sticky top-0 bg-bg2 border-b border-glass-border">
                          <tr>
                            <th className="p-3 text-muted font-bold">Invoice / Bill No</th>
                            <th className="p-3 text-muted font-bold">Date</th>
                            <th className="p-3 text-muted font-bold">Total Amount</th>
                            <th className="p-3 text-muted font-bold">Distributor Name</th>
                            <th className="p-3 text-muted font-bold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((p: any) => (
                            <tr key={p.id} className="border-b border-glass-border/20 hover:bg-bg2/40 transition-colors">
                              <td className="p-3 font-semibold text-text">{p.invoice_no}</td>
                              <td className="p-3 font-mono text-muted">{p.date || '—'}</td>
                              <td className="p-3 font-bold text-primary">₹{p.total_amount || 0}</td>
                              <td className="p-3 text-text">{p.distributor_name || '—'}</td>
                              <td className="p-3 text-right whitespace-nowrap">
                                <button
                                  onClick={() => handleEditRecord('purchases', p)}
                                  className="text-primary hover:underline font-bold mr-3 text-[11px]"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteRecord('purchases', p.id)}
                                  className="text-red-400 hover:underline font-bold text-[11px]"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                          {filtered.length === 0 && (
                            <tr><td colSpan={5} className="p-6 text-center text-muted">No matching staging purchases records found.</td></tr>
                          )}
                        </tbody>
                      </table>
                    );
                  })()}

                  {activeStagingTab === 'errors' && (() => {
                    const filtered = stagingData.errors.filter(e => {
                      const query = stagingSearchQuery.toLowerCase();
                      return (e.file_name || '').toLowerCase().includes(query) ||
                             (e.error_message || '').toLowerCase().includes(query) ||
                             (e.raw_data || '').toLowerCase().includes(query);
                    });

                    return (
                      <table className="w-full text-xs text-left">
                        <thead className="sticky top-0 bg-bg2 border-b border-glass-border">
                          <tr>
                            <th className="p-3 text-muted font-bold">File Name</th>
                            <th className="p-3 text-muted font-bold">Row Index</th>
                            <th className="p-3 text-muted font-bold">Error Message</th>
                            <th className="p-3 text-muted font-bold">Raw Data Preview</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((e: any) => (
                            <tr key={e.id} className="border-b border-glass-border/20 hover:bg-bg2/40 transition-colors">
                              <td className="p-3 font-semibold text-muted max-w-[150px] truncate">{e.file_name}</td>
                              <td className="p-3 font-mono text-amber-500 font-bold">{e.row_index}</td>
                              <td className="p-3 text-red-400 font-semibold">{e.error_message}</td>
                              <td className="p-3 font-mono text-[10px] text-muted max-w-[250px] truncate" title={e.raw_data}>{e.raw_data}</td>
                            </tr>
                          ))}
                          {filtered.length === 0 && (
                            <tr><td colSpan={4} className="p-6 text-center text-muted">No matching skipped log errors found.</td></tr>
                          )}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                <button
                  onClick={handleRollback}
                  disabled={rollingBack}
                  className="premium-btn bg-bg3 border border-red-500/20 text-red-400 hover:bg-red-500/10 text-xs"
                >
                  {rollingBack ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                  Rollback & Start Over
                </button>
                <button
                  onClick={finalizeMigration}
                  className="premium-btn bg-green text-text shadow-[0_0_20px_rgba(16,185,129,0.3)] font-bold"
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

      {/* Mapping Preview Popup */}
      {showMappingModal && activeMappingFileIdx !== null && files[activeMappingFileIdx] && (
  createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-3">
          <div className="glass-panel w-full max-w-[99vw] h-[98vh] lg:max-w-[98vw] lg:h-[95vh] flex flex-col rounded-2xl border border-glass-border shadow-2xl overflow-hidden bg-bg">
            {/* Modal Header */}
            <div className="p-4 md:px-6 md:py-4 border-b border-glass-border bg-bg2 flex justify-between items-center">
              <div>
                <h4 className="text-lg font-bold text-text flex items-center gap-2">
                  <Database size={20} className="text-primary" />
                  Migration Column Mapping
                </h4>
                <p className="text-muted text-xs mt-1">
                  Map the columns from "{files[activeMappingFileIdx].originalName}" to the app fields.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowMappingModal(false);
                  setActiveMappingFileIdx(null);
                }}
                className="text-muted hover:text-text transition-colors text-sm font-bold bg-bg3 px-3 py-1.5 rounded-lg border border-glass-border"
              >
                Close
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
              {/* Left Column: Mappings form */}
              <div className="w-full lg:w-[48%] xl:w-[50%] p-4 md:p-5 overflow-y-auto border-b lg:border-b-0 lg:border-r border-glass-border flex flex-col gap-4">
                <h5 className="text-xs font-semibold text-muted uppercase tracking-wider">Configure Column Mappings</h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                  {files[activeMappingFileIdx].headers.map((header) => {
                    const currentMapping = files[activeMappingFileIdx].mapping[header] || '';
                    const sampleValue = files[activeMappingFileIdx].samples[0]?.[header] || '—';

                    return (
                      <div key={header} className="p-3 rounded-lg border border-glass-border bg-bg2 hover:bg-bg3 hover:border-primary/40 transition-all flex flex-col gap-2">
                        <div className="flex flex-col gap-1 min-w-0">
                          <span className="text-xs font-bold text-text truncate block" title={header}>
                            {header}
                          </span>
                          <span className="text-[10px] text-muted bg-bg px-1.5 py-0.5 rounded border border-glass-border truncate self-start block max-w-full font-medium" title={String(sampleValue)}>
                            Sample: <span className="text-primary font-mono">{String(sampleValue)}</span>
                          </span>
                        </div>
                        
                        <select
                          value={currentMapping}
                          onChange={(e) => {
                            updateMapping(activeMappingFileIdx, header, e.target.value);
                          }}
                          className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary transition-all cursor-pointer font-medium"
                        >
                          {DB_TARGET_SECTIONS.map((section) => (
                            <optgroup key={section.label} label={section.label} className="bg-bg text-primary font-semibold">
                              {section.fields.map((f) => (
                                <option key={f.value} value={f.value} className="bg-bg text-text font-normal">
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

              {/* Right Column: Sample Data Preview (First 10 Rows) */}
              <div className="w-full lg:w-[52%] xl:w-[50%] p-4 md:p-5 flex flex-col overflow-hidden">
                <h5 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Sample Data Grid (First 10 Rows)</h5>
                
                <div className="flex-1 overflow-auto border border-glass-border rounded-xl bg-bg3/50">
                  <table className="min-w-full divide-y divide-glass-border text-xs text-left">
                    <thead className="bg-bg2 sticky top-0 z-10">
                      <tr>
                        {files[activeMappingFileIdx].headers.map((header) => {
                          const isMapped = files[activeMappingFileIdx].mapping[header];
                          return (
                            <th 
                              key={header} 
                              className={`px-4 py-3 font-bold border-b border-glass-border truncate whitespace-nowrap ${isMapped ? 'text-primary' : 'text-muted'}`}
                            >
                              {header}
                              {isMapped && (
                                <span className="block text-[8px] font-normal text-emerald-400 capitalize">
                                  → {DB_TARGET_COLUMNS.find(c => c.value === isMapped)?.label || isMapped}
                                </span>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-glass-border text-text font-mono">
                      {files[activeMappingFileIdx].samples.slice(0, 10).map((row, idx) => (
                        <tr key={idx} className="hover:bg-bg2 transition-colors">
                          {files[activeMappingFileIdx].headers.map((header) => (
                            <td key={header} className="px-4 py-2 border-r border-glass-border truncate max-w-[200px]" title={row[header]}>
                              {row[header] !== undefined ? String(row[header]) : ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-glass-border bg-bg2 flex justify-between items-center">
              <div className="text-xs text-muted flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-amber-500" />
                <span>Verify mappings before importing. Ensure critical fields like Medicine Name are mapped.</span>
              </div>
              
              <button
                onClick={() => {
                  setShowMappingModal(false);
                  setActiveMappingFileIdx(null);
                }}
                className="bg-primary hover:bg-primary/90 text-text text-xs font-bold px-6 py-3 rounded-lg flex items-center gap-2 shadow-lg hover:shadow-primary/20 transition-all"
              >
                <CheckCircle size={14} /> Confirm Mappings
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
      )}

      {/* Interactive Staging Record Edit Modal */}
      {editingRecordType !== null && editingRecordData !== null && (
        createPortal(
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="glass-panel w-full max-w-lg rounded-2xl border border-glass-border shadow-2xl overflow-hidden bg-bg">
              {/* Header */}
              <div className="p-4 border-b border-glass-border bg-bg2 flex justify-between items-center">
                <h4 className="text-sm font-bold text-text flex items-center gap-2">
                  <Database size={18} className="text-primary" />
                  Edit Staged {editingRecordType === 'inventory' ? 'Inventory Item' : editingRecordType === 'sales' ? 'Sales Invoice' : 'Purchase Bill'}
                </h4>
                <button
                  onClick={() => { setEditingRecordType(null); setEditingRecordData(null); }}
                  className="text-muted hover:text-text transition-colors text-xs font-bold bg-bg3 px-2.5 py-1 rounded-lg border border-glass-border"
                >
                  Close
                </button>
              </div>

              {/* Body */}
              <div className="p-5 max-h-[70vh] overflow-y-auto space-y-4">
                {editingRecordType === 'inventory' && (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted uppercase">Medicine Name</label>
                      <input
                        type="text"
                        value={editingRecordData.medicine_name || ''}
                        onChange={(e) => setEditingRecordData({ ...editingRecordData, medicine_name: e.target.value })}
                        className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted uppercase">Generic / Composition API Reference</label>
                      <input
                        type="text"
                        value={editingRecordData.api_reference || ''}
                        onChange={(e) => setEditingRecordData({ ...editingRecordData, api_reference: e.target.value })}
                        className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted uppercase">Batch Number</label>
                        <input
                          type="text"
                          value={editingRecordData.batch_no || ''}
                          onChange={(e) => setEditingRecordData({ ...editingRecordData, batch_no: e.target.value })}
                          className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted uppercase">Expiry Date</label>
                        <input
                          type="text"
                          value={editingRecordData.expiry_date || ''}
                          onChange={(e) => setEditingRecordData({ ...editingRecordData, expiry_date: e.target.value })}
                          placeholder="YYYY-MM-DD"
                          className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted uppercase">Quantity</label>
                        <input
                          type="number"
                          value={editingRecordData.quantity || 0}
                          onChange={(e) => setEditingRecordData({ ...editingRecordData, quantity: parseInt(e.target.value, 10) || 0 })}
                          className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted uppercase">MRP (₹)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editingRecordData.mrp || 0}
                          onChange={(e) => setEditingRecordData({ ...editingRecordData, mrp: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted uppercase">Cost Price (₹)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editingRecordData.cost_price || 0}
                          onChange={(e) => setEditingRecordData({ ...editingRecordData, cost_price: parseFloat(e.target.value) || 0 })}
                          className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted uppercase">Rack Location</label>
                      <input
                        type="text"
                        value={editingRecordData.rack_location || ''}
                        onChange={(e) => setEditingRecordData({ ...editingRecordData, rack_location: e.target.value })}
                        className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary"
                      />
                    </div>
                  </>
                )}

                {editingRecordType === 'sales' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted uppercase">Invoice Number</label>
                        <input
                          type="text"
                          value={editingRecordData.invoice_no || ''}
                          onChange={(e) => setEditingRecordData({ ...editingRecordData, invoice_no: e.target.value })}
                          className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted uppercase">Date</label>
                        <input
                          type="text"
                          value={editingRecordData.date || ''}
                          onChange={(e) => setEditingRecordData({ ...editingRecordData, date: e.target.value })}
                          className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted uppercase">Total Amount (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editingRecordData.total_amount || 0}
                        onChange={(e) => setEditingRecordData({ ...editingRecordData, total_amount: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted uppercase">Patient / Customer Name</label>
                      <input
                        type="text"
                        value={editingRecordData.patient_name || ''}
                        onChange={(e) => setEditingRecordData({ ...editingRecordData, patient_name: e.target.value })}
                        className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted uppercase">Doctor Name</label>
                      <input
                        type="text"
                        value={editingRecordData.doctor_name || ''}
                        onChange={(e) => setEditingRecordData({ ...editingRecordData, doctor_name: e.target.value })}
                        className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary"
                      />
                    </div>
                  </>
                )}

                {editingRecordType === 'purchases' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted uppercase">Invoice / Bill Number</label>
                        <input
                          type="text"
                          value={editingRecordData.invoice_no || ''}
                          onChange={(e) => setEditingRecordData({ ...editingRecordData, invoice_no: e.target.value })}
                          className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted uppercase">Date</label>
                        <input
                          type="text"
                          value={editingRecordData.date || ''}
                          onChange={(e) => setEditingRecordData({ ...editingRecordData, date: e.target.value })}
                          className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted uppercase">Total Amount (₹)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={editingRecordData.total_amount || 0}
                        onChange={(e) => setEditingRecordData({ ...editingRecordData, total_amount: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-muted uppercase">Distributor / Supplier Name</label>
                      <input
                        type="text"
                        value={editingRecordData.distributor_name || ''}
                        onChange={(e) => setEditingRecordData({ ...editingRecordData, distributor_name: e.target.value })}
                        className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-glass-border bg-bg2 flex justify-between items-center">
                <button
                  onClick={() => { setEditingRecordType(null); setEditingRecordData(null); }}
                  className="bg-bg3 border border-glass-border hover:bg-bg3/80 text-text text-xs font-bold px-4 py-2 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRecord}
                  disabled={savingRecord}
                  className="bg-primary hover:bg-primary/95 text-text text-xs font-bold px-6 py-2.5 rounded-lg flex items-center gap-2 shadow-lg"
                >
                  {savingRecord ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  Save Changes
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      )}
    </div>
  );
};

export default Migration;
