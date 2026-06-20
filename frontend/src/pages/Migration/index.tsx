import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  UploadCloud, Database, ArrowRight, CheckCircle, Loader2, AlertTriangle,
  FileText, X, RefreshCw, Eye, ChevronDown,
  Package, ShoppingCart, Users, RotateCcw, Zap, FileCheck, Trash2
} from 'lucide-react';
import { api, apiClient } from '../../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────
type WizardStep = 1 | 2 | 3 | 4;
type DataType = 'inventory' | 'purchases' | 'sales' | 'customers' | 'returns' | 'combined' | 'unknown';

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
  skipLines?: number;           // number of lines to skip
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DATA_TYPE_LABELS: Record<DataType, string> = {
  combined: '✨ All-in-One / Combined Sheet',
  inventory: '📦 Inventory / Stock',
  purchases: '🛒 Purchase Bills',
  sales: '💰 Sales Invoices',
  customers: '👥 Customers / Patients',
  returns: '🔄 Returns / Stock Ledger',
  unknown: '❓ Unknown',
};

const DATA_TYPE_ORDER: DataType[] = ['combined', 'inventory', 'purchases', 'customers', 'sales', 'returns'];

const TYPE_COLORS: Record<DataType, string> = {
  combined: 'text-fuchsia-400 border-fuchsia-400/40 bg-fuchsia-400/10',
  inventory: 'text-sky border-sky/40 bg-sky/10',
  purchases: 'text-amber-400 border-amber-400/40 bg-amber-400/10',
  sales: 'text-green border-green/40 bg-green/10',
  customers: 'text-purple-400 border-purple-400/40 bg-purple-400/10',
  returns: 'text-rose-400 border-rose-400/40 bg-rose-400/10',
  unknown: 'text-muted border-glass-border bg-white/5',
};

const TYPE_ICONS: Record<DataType, React.ReactNode> = {
  combined: <Database size={14} />,
  inventory: <Package size={14} />,
  purchases: <ShoppingCart size={14} />,
  sales: <FileCheck size={14} />,
  customers: <Users size={14} />,
  returns: <RotateCcw size={14} />,
  unknown: <FileText size={14} />,
};

const DB_TARGET_COLUMNS = [
  { value: '', label: '-- Ignore Column --' },
  { value: 'name', label: 'Medicine Name ⭐' },
  { value: 'batch_no', label: 'Batch Number' },
  { value: 'expiry_date', label: 'Expiry Date' },
  { value: 'quantity', label: 'Quantity / Stock' },
  { value: 'loose_qty', label: 'Loose Quantity / Stock' },
  { value: 'packaging', label: 'Pack Size / Packaging' },
  { value: 'mrp', label: 'MRP (₹)' },
  { value: 'cost_price', label: 'Cost / Purchase Price (₹)' },
  { value: 'rack_location', label: 'Rack Location' },
  { value: 'invoice_no', label: 'Invoice / Bill No' },
  { value: 'return_no', label: 'Return Invoice No' },
  { value: 'date', label: 'Date' },
  { value: 'total_amount', label: 'Total Amount (₹)' },
  { value: 'return_invoice_id', label: 'Return Invoice ID' },
  { value: 'return_sub_type', label: 'Return Type (expiry/good)' },
  { value: 'return_date_time', label: 'Return Date Time' },
  { value: 'patient_name', label: 'Patient / Customer Name' },
  { value: 'distributor_name', label: 'Distributor / Supplier Name' },
  { value: 'doctor_name', label: 'Doctor Name' },
  { value: 'phone', label: 'Phone / Mobile' },
  { value: 'address', label: 'Address' },
  { value: 'notes', label: 'Notes / Remarks' },
  { value: 'cgst', label: 'CGST %' },
  { value: 'sgst', label: 'SGST %' },
  { value: 'discount', label: 'Discount %' },
];

const DB_TARGET_SECTIONS = [
  {
    label: 'Common Fields',
    fields: [
      { value: 'name', label: 'Medicine Name ⭐' }
    ]
  },
  {
    label: '📦 Inventory / Stock',
    fields: [
      { value: 'batch_no', label: 'Batch Number' },
      { value: 'expiry_date', label: 'Expiry Date' },
      { value: 'quantity', label: 'Quantity / Stock' },
      { value: 'loose_qty', label: 'Loose Quantity / Stock' },
      { value: 'packaging', label: 'Pack Size / Packaging' },
      { value: 'mrp', label: 'MRP (₹)' },
      { value: 'cost_price', label: 'Cost / Purchase Price (₹)' },
      { value: 'rack_location', label: 'Rack Location' }
    ]
  },
  {
    label: '🛒 Sales & Purchases',
    fields: [
      { value: 'invoice_no', label: 'Invoice / Bill No' },
      { value: 'return_no', label: 'Return Invoice No' },
      { value: 'date', label: 'Date' },
      { value: 'total_amount', label: 'Total Amount (₹)' },
      { value: 'return_invoice_id', label: 'Return Invoice ID' },
      { value: 'return_sub_type', label: 'Return Type (expiry/good)' },
      { value: 'return_date_time', label: 'Return Date Time' },
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
      { value: 'doctor_name', label: 'Doctor Name' },
      { value: 'phone', label: 'Phone / Mobile' },
      { value: 'address', label: 'Address' },
      { value: 'notes', label: 'Notes / Remarks' }
    ]
  }
];

const getFieldLabelAndSection = (value: string) => {
  for (const section of DB_TARGET_SECTIONS) {
    const field = section.fields.find(f => f.value === value);
    if (field) return { section: section.label, label: field.label };
  }
  return { section: 'Unknown', label: value };
};

// ─── Smart auto-mapping: guess target field from column header ─────────────────
function autoMapColumn(header: string): string {
  const h = header.toLowerCase().replace(/[^a-z]/g, '');
  if (h.includes('name') && (h.includes('med') || h.includes('prod') || h.includes('item') || h.includes('drug'))) return 'name';
  if (h.includes('prodname') || h === 'product' || h === 'medicine' || h === 'itemname' || h === 'medname') return 'name';
  if (h.includes('loose')) return 'loose_qty';
  if (h.includes('pack') || h.includes('packaging') || h.includes('packing')) return 'packaging';
  if (h.includes('phone') || h.includes('mobile') || h.includes('contact')) return 'phone';
  if (h.includes('address')) return 'address';
  if (h.includes('note') || h.includes('remark')) return 'notes';
  if (h.includes('batch')) return 'batch_no';
  if (h.includes('exp')) return 'expiry_date';
  if (h.includes('qty') || h.includes('quantity') || h.includes('stock')) return 'quantity';
  if (h === 'mrp' || h.includes('retail') || h.includes('salerate')) return 'mrp';
  if (h.includes('cost') || h.includes('purch') || h.includes('rate')) return 'cost_price';
  if (h.includes('rack') || h.includes('location') || h.includes('shelf')) return 'rack_location';
  if (h.includes('return') || h === 'retno') return 'return_no';
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

const getMappingColor = (targetCol: string) => {
  if (!targetCol) return 'ignored';
  if (targetCol.startsWith('custom_col_')) return 'blue';
  
  const blueFields = ['name'];
  if (blueFields.includes(targetCol)) return 'blue';
  
  const greenFields = ['batch_no', 'expiry_date', 'quantity', 'loose_qty', 'packaging', 'mrp', 'cost_price', 'rack_location'];
  if (greenFields.includes(targetCol)) return 'green';
  
  const yellowFields = ['invoice_no', 'return_no', 'date', 'total_amount', 'cgst', 'sgst', 'discount'];
  if (yellowFields.includes(targetCol)) return 'yellow';
  
  const purpleFields = ['patient_name', 'distributor_name', 'doctor_name', 'phone', 'mobile', 'address', 'notes'];
  if (purpleFields.includes(targetCol)) return 'purple';
  
  return 'ignored';
};

const getHighlightStyles = (targetCol: string, isHovered: boolean) => {
  const color = getMappingColor(targetCol);
  
  if (color === 'blue') {
    return {
      header: isHovered ? 'bg-blue-500/20 text-blue-300 border-blue-500/80 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'bg-blue-500/10 text-blue-400 border-blue-500/30',
      cell: isHovered ? 'bg-blue-500/15 border-r border-blue-500/30 text-blue-300' : 'bg-blue-500/5 border-r border-blue-500/20 text-blue-400/90'
    };
  }
  if (color === 'green') {
    return {
      header: isHovered ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/80 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      cell: isHovered ? 'bg-emerald-500/15 border-r border-emerald-500/30 text-emerald-300' : 'bg-emerald-500/5 border-r border-emerald-500/20 text-emerald-400/90'
    };
  }
  if (color === 'yellow') {
    return {
      header: isHovered ? 'bg-amber-500/20 text-amber-300 border-amber-500/80 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-amber-500/10 text-amber-400 border-amber-500/30',
      cell: isHovered ? 'bg-amber-500/15 border-r border-amber-500/30 text-amber-300' : 'bg-amber-500/5 border-r border-amber-500/20 text-amber-400/90'
    };
  }
  if (color === 'purple') {
    return {
      header: isHovered ? 'bg-purple-500/20 text-purple-300 border-purple-500/80 shadow-[0_0_15px_rgba(168,85,247,0.3)]' : 'bg-purple-500/10 text-purple-400 border-purple-500/30',
      cell: isHovered ? 'bg-purple-500/15 border-r border-purple-500/30 text-purple-300' : 'bg-purple-500/5 border-r border-purple-500/20 text-purple-400/90'
    };
  }
  
  return {
    header: isHovered ? 'bg-white/10 text-gray-200 border-white/40' : 'bg-white/5 text-gray-500 border-glass-border opacity-50 grayscale',
    cell: isHovered ? 'bg-white/5 border-r border-white/10 text-gray-200' : 'border-r border-glass-border/10 text-gray-500 opacity-50 grayscale'
  };
};

// ─── Component ────────────────────────────────────────────────────────────────
const Migration = () => {
  const [step, setStep] = useState<WizardStep>(1);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const [activeFileIdx, setActiveFileIdx] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [migrationStatus, setMigrationStatus] = useState<any>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [stagingData, setStagingData] = useState<{ inventory: any[]; sales: any[]; purchases: any[]; returns: any[]; errors: any[] }>({ inventory: [], sales: [], purchases: [], returns: [], errors: [] });
  const [previewOpen, setPreviewOpen] = useState<number | null>(null);



  const handleSkipLinesChange = async (idx: number, newSkipLines: number) => {
    const file = files[idx];
    if (!file) return;

    setFiles(prev => prev.map((f, i) => i === idx ? { ...f, status: 'analyzing', skipLines: newSkipLines } : f));
    try {
      let analyzed: any = {};
      if (file.ext === 'csv') {
        analyzed = await api.analyzeMigrationFile(file.uploadedFileName, newSkipLines);
      } else if (file.ext === 'xlsx' || file.ext === 'xls') {
        analyzed = await api.analyzeExcelFile(file.uploadedFileName, 0, newSkipLines);
      } else {
        analyzed = { headers: file.headers, samples: file.samples };
      }
      
      const headers = analyzed.headers || [];
      const detectedType = (analyzed.detected?.type as DataType) || file.userSelectedType;
      const autoMapping = Object.fromEntries(headers.map((h: string) => [h, autoMapColumn(h)]));

      // Reset ignored rows in moduleFilters when headers change
      setModuleFilters(prev => {
        const current = prev[file.uploadedFileName] || {};
        return {
          ...prev,
          [file.uploadedFileName]: { ...current, ignoredRows: [] }
        };
      });

      setFiles(prev => prev.map((f, i) => i === idx ? {
        ...f,
        headers,
        samples: analyzed.samples || [],
        detected: analyzed.detected || f.detected,
        mapping: autoMapping,
        status: 'ready'
      } : f));
    } catch (err: any) {
      setFiles(prev => prev.map((f, i) => i === idx ? {
        ...f,
        status: 'error',
        errorMsg: err.message || 'Analysis failed'
      } : f));
    }
  };

  // Staging Items Preview modal state
  const [viewingItemsRecord, setViewingItemsRecord] = useState<{ id: number; type: 'sales' | 'purchases' | 'returns'; name: string; patient_name?: string; doctor_name?: string; distributor_name?: string } | null>(null);
  const [viewingItems, setViewingItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingItemData, setEditingItemData] = useState<any>(null);
  const [newItemData, setNewItemData] = useState<any>({});
  const [addingNewItem, setAddingNewItem] = useState<boolean>(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [activeImportIdx, setActiveImportIdx] = useState(0); // which file is currently being imported
  
  // Mapping Modal State
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [activeMappingFileIdx, setActiveMappingFileIdx] = useState<number | null>(null);
  const [hoveredHeader, setHoveredHeader] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const autoOpenedRef = useRef<Record<string, boolean>>({});

  // Mapping Session & Reversibility States
  const [tempMapping, setTempMapping] = useState<Record<string, string>>({});
  const [customColumns, setCustomColumns] = useState<string[]>([]);
  const [mappingHistory, setMappingHistory] = useState<Record<string, string>[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [showOnlyMapped, setShowOnlyMapped] = useState<boolean>(false);

  // Sync mapping modal local state with file analysis state when active file changes or re-analyzes
  useEffect(() => {
    if (activeMappingFileIdx !== null && files[activeMappingFileIdx]) {
      const currentFile = files[activeMappingFileIdx];
      if (currentFile.status === 'ready') {
        const tempKeys = Object.keys(tempMapping);
        const headersMatch = currentFile.headers.length === tempKeys.length && currentFile.headers.every(h => tempKeys.includes(h));
        if (!headersMatch) {
          setTempMapping(currentFile.mapping);
          const initialCustom = Object.values(currentFile.mapping).filter((val: any) => typeof val === 'string' && val.startsWith('custom_col_')) as string[];
          setCustomColumns(Array.from(new Set(initialCustom)));
          setMappingHistory([currentFile.mapping]);
          setHistoryIndex(0);
        }
      }
    }
  }, [activeMappingFileIdx, files, tempMapping]);

  // Guided Configurator State
  const [configSubStep, setConfigSubStep] = useState<'modules' | 'filters' | 'medicines' | 'preview'>('modules');
  const [selectedModules, setSelectedModules] = useState<Record<string, boolean>>({
    combined: true,
    inventory: true,
    purchases: true,
    sales: true,
    customers: true,
    returns: true,
    unknown: true,
  });
  const [moduleFilters, setModuleFilters] = useState<Record<string, {
    rangeStart?: string;
    rangeEnd?: string;
    onlyActiveStock?: boolean;
    excludeExpired?: boolean;
    minPurchaseDate?: string;
    ignoredRows?: number[];
  }>>({});
  const [medicineActions, setMedicineActions] = useState<Record<string, {
    action: 'import' | 'skip' | 'merge';
    target?: string;
  }>>({});
  const [preMigrationAnalysis, setPreMigrationAnalysis] = useState<any>(null);
  const [analyzingPreMigration, setAnalyzingPreMigration] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [simulatingPreMigration, setSimulatingPreMigration] = useState(false);

  // V2 Migration projects, templates, snapshots and conflicts states
  const [projects, setProjects] = useState<any[]>([]);
  const [activeProject, setActiveProject] = useState<any>(null);
  const [newProjectName, setNewProjectName] = useState<string>('');
  const [templates, setTemplates] = useState<any[]>([]);
  const [saveTemplateName, setSaveTemplateName] = useState<string>('');
  const [stagingConflicts, setStagingConflicts] = useState<any[]>([]);
  const [activePreviewHeader, setActivePreviewHeader] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<any[]>([]);

  const fetchV2Data = useCallback(async () => {
    try {
      const [projs, temps, snaps] = await Promise.all([
        api.getProjects(),
        api.getTemplates(),
        api.getSnapshots(),
      ]);
      setProjects(projs || []);
      setTemplates(temps || []);
      setSnapshots(snaps || []);
      if (projs && projs.length > 0 && !activeProject) {
        setActiveProject(projs[0]);
      }
    } catch (e) {
      console.error('Failed to load V2 migration data:', e);
    }
  }, [activeProject]);

  useEffect(() => {
    fetchV2Data();
  }, []);

  const fetchConflicts = useCallback(async () => {
    try {
      const conflicts = await api.getStagingConflicts();
      setStagingConflicts(conflicts || []);
    } catch (e) {
      console.error('Failed to fetch staging conflicts:', e);
    }
  }, []);

  useEffect(() => {
    if (step === 3) {
      fetchConflicts();
    }
  }, [step, fetchConflicts]);

  const handleResolveConflict = async (conflict: any, resolution: string) => {
    try {
      await api.resolveStagingConflict(conflict.id, resolution);
      await fetchConflicts();
      await fetchStagingData();
    } catch (err: any) {
      alert(err.message || 'Failed to resolve conflict');
    }
  };

  const openMappingModal = (idx: number) => {
    const file = files[idx];
    if (!file) return;
    
    setTempMapping(file.mapping);
    
    // Initialize custom columns
    const initialCustom = Object.values(file.mapping).filter((val: any) => typeof val === 'string' && val.startsWith('custom_col_')) as string[];
    setCustomColumns(Array.from(new Set(initialCustom)));
    
    // Initialize history
    setMappingHistory([file.mapping]);
    setHistoryIndex(0);
    
    setActiveMappingFileIdx(idx);
    setShowMappingModal(true);
  };

  const updateTempMappingWithHistory = (newMapping: Record<string, string>) => {
    setTempMapping(newMapping);
    const newHistory = mappingHistory.slice(0, historyIndex + 1);
    setMappingHistory([...newHistory, newMapping]);
    setHistoryIndex(newHistory.length);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setTempMapping(mappingHistory[prevIndex]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < mappingHistory.length - 1) {
      const nextIndex = historyIndex + 1;
      setHistoryIndex(nextIndex);
      setTempMapping(mappingHistory[nextIndex]);
    }
  };

  const handleDeleteCustomColumn = (targetCol: string) => {
    if (window.confirm(`Are you sure you want to delete the custom column "${targetCol.replace('custom_col_', '')}"? This will unmap any headers currently mapped to it.`)) {
      setCustomColumns(prev => prev.filter(c => c !== targetCol));
      const updatedMapping = { ...tempMapping };
      Object.keys(updatedMapping).forEach(key => {
        if (updatedMapping[key] === targetCol) {
          updatedMapping[key] = '';
        }
      });
      updateTempMappingWithHistory(updatedMapping);
    }
  };

  const commitMappings = () => {
    if (activeMappingFileIdx !== null) {
      setFiles(prev => prev.map((f, i) => i === activeMappingFileIdx ? { ...f, mapping: tempMapping } : f));
    }
    setShowMappingModal(false);
    setActiveMappingFileIdx(null);
  };

  // Staging Explorer & Editing States
  const [activeStagingTab, setActiveStagingTab] = useState<'inventory' | 'sales' | 'purchases' | 'returns' | 'errors' | 'skipped_rows'>('inventory');
  const [stagingSearchQuery, setStagingSearchQuery] = useState('');
  const [editingRecordType, setEditingRecordType] = useState<'inventory' | 'sales' | 'purchases' | 'returns' | null>(null);
  const [editingRecordData, setEditingRecordData] = useState<any>(null);
  const [savingRecord, setSavingRecord] = useState(false);

  const handleEditRecord = (type: 'inventory' | 'sales' | 'purchases' | 'returns', record: any) => {
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
          loose_quantity: editingRecordData.loose_quantity,
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
      } else if (editingRecordType === 'returns') {
        await api.updateStagingReturns(id, {
          return_no: editingRecordData.return_no,
          date: editingRecordData.date,
          total_amount: editingRecordData.total_amount,
          distributor_name: editingRecordData.distributor_name,
          return_invoice_id: editingRecordData.return_invoice_id,
          return_sub_type: editingRecordData.return_sub_type,
          return_date_time: editingRecordData.return_date_time,
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

  const handleDeleteRecord = async (type: 'inventory' | 'sales' | 'purchases' | 'returns', id: number) => {
    if (!confirm('Are you sure you want to delete this staged record? This cannot be undone.')) return;
    try {
      if (type === 'inventory') {
        await api.deleteStagingInventory(id);
      } else if (type === 'sales') {
        await api.deleteStagingSales(id);
      } else if (type === 'purchases') {
        await api.deleteStagingPurchases(id);
      } else if (type === 'returns') {
        await api.deleteStagingReturns(id);
      }
      await fetchStagingData();
    } catch (err: any) {
      alert(`Failed to delete record: ${err.message || 'Unknown error'}`);
    }
  };

  const handleViewItems = async (type: 'sales' | 'purchases' | 'returns', record: any) => {
    setViewingItemsRecord({
      id: record.id,
      type,
      name: record.invoice_no || record.return_no || `ID: ${record.id}`,
      patient_name: record.patient_name,
      doctor_name: record.doctor_name,
      distributor_name: record.distributor_name,
    });
    setViewingItems([]);
    setLoadingItems(true);
    try {
      let items = [];
      if (type === 'sales') {
        items = await api.getStagingSaleItems(record.id);
      } else if (type === 'purchases') {
        items = await api.getStagingPurchaseItems(record.id);
      } else if (type === 'returns') {
        items = await api.getStagingReturnItems(record.id);
      }
      setViewingItems(Array.isArray(items) ? items : []);
    } catch (err: any) {
      alert(`Failed to fetch items: ${err.message || 'Unknown error'}`);
    } finally {
      setLoadingItems(false);
    }
  };
  const handleSaveStagedItem = async (itemId: number) => {
    if (!viewingItemsRecord || !editingItemData) return;
    try {
      const type = viewingItemsRecord.type;
      const invoiceId = viewingItemsRecord.id;
      if (type === 'sales') {
        await api.updateStagingSaleItem(invoiceId, itemId, editingItemData);
      } else if (type === 'purchases') {
        await api.updateStagingPurchaseItem(invoiceId, itemId, editingItemData);
      } else if (type === 'returns') {
        await api.updateStagingReturnItem(invoiceId, itemId, editingItemData);
      }
      setEditingItemId(null);
      setEditingItemData(null);
      await handleViewItems(type, { id: invoiceId, invoice_no: viewingItemsRecord.name, return_no: viewingItemsRecord.name });
    } catch (err: any) {
      alert(`Failed to update item: ${err.message || 'Unknown error'}`);
    }
  };

  const handleDeleteStagedItem = async (itemId: number) => {
    if (!viewingItemsRecord) return;
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      const type = viewingItemsRecord.type;
      const invoiceId = viewingItemsRecord.id;
      if (type === 'sales') {
        await api.deleteStagingSaleItem(invoiceId, itemId);
      } else if (type === 'purchases') {
        await api.deleteStagingPurchaseItem(invoiceId, itemId);
      } else if (type === 'returns') {
        await api.deleteStagingReturnItem(invoiceId, itemId);
      }
      await handleViewItems(type, { id: invoiceId, invoice_no: viewingItemsRecord.name, return_no: viewingItemsRecord.name });
    } catch (err: any) {
      alert(`Failed to delete item: ${err.message || 'Unknown error'}`);
    }
  };

  const handleAddStagedItem = async () => {
    if (!viewingItemsRecord) return;
    try {
      const type = viewingItemsRecord.type;
      const invoiceId = viewingItemsRecord.id;
      if (type === 'sales') {
        await api.addStagingSaleItem(invoiceId, newItemData);
      } else if (type === 'purchases') {
        await api.addStagingPurchaseItem(invoiceId, newItemData);
      } else if (type === 'returns') {
        await api.addStagingReturnItem(invoiceId, newItemData);
      }
      setNewItemData({});
      setAddingNewItem(false);
      await handleViewItems(type, { id: invoiceId, invoice_no: viewingItemsRecord.name, return_no: viewingItemsRecord.name });
    } catch (err: any) {
      alert(`Failed to add item: ${err.message || 'Unknown error'}`);
    }
  };

  const fetchStagingData = useCallback(async () => {
    try {
      const [inv, sales, pur, rets, errs] = await Promise.all([
        api.getStagingInventory(),
        api.getStagingSales(),
        api.getStagingPurchases(),
        api.getStagingReturns(),
        api.getStagingErrors()
      ]);
      setStagingData({ 
        inventory: Array.isArray(inv) ? inv : [], 
        sales: Array.isArray(sales) ? sales : [], 
        purchases: Array.isArray(pur) ? pur : [], 
        returns: Array.isArray(rets) ? rets : [], 
        errors: Array.isArray(errs) ? errs : [] 
      });
    } catch (e) { console.error(e); }
  }, []);

  // Fetch staging data on initial render
  useEffect(() => {
    fetchStagingData();
  }, [fetchStagingData]);

  // Auto-advance to step 3 if staging data already exists (e.g. after page refresh)
  useEffect(() => {
    const hasData =
      stagingData.inventory.length > 0 ||
      stagingData.sales.length > 0 ||
      stagingData.purchases.length > 0 ||
      stagingData.returns.length > 0;
    if (hasData && step === 1 && files.length === 0) {
      setStep(3);
    }
  }, [stagingData]);

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

  useEffect(() => {
    if (hoveredHeader && scrollContainerRef.current) {
      const thElement = scrollContainerRef.current.querySelector(
        `th[data-header="${CSS.escape(hoveredHeader)}"]`
      );
      if (thElement) {
        thElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }
    }
  }, [hoveredHeader]);

  useEffect(() => {
    const readyCSVFiles = files.filter(f => f.status === 'ready' && !['sql'].includes(f.ext) && f.headers.length > 0);
    if (readyCSVFiles.length === 1) {
      const file = readyCSVFiles[0];
      const idx = files.findIndex(f => f.uploadedFileName === file.uploadedFileName);
      if (idx !== -1 && !autoOpenedRef.current[file.uploadedFileName]) {
        autoOpenedRef.current[file.uploadedFileName] = true;
        openMappingModal(idx);
      }
    }
  }, [files]);

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
        skipLines: 0,
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
              skipLines: 0,
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
                skipLines: 0,
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
      const filtersForFile = moduleFilters[file.uploadedFileName] || {};
      await api.runMigration(
        file.uploadedFileName,
        file.userSelectedType,
        file.mapping,
        file.skipLines || 0, // skipLines
        0, // sheetIndex
        filtersForFile,
        medicineActions
      );
    } catch (err: any) {
      setError(`Failed to import ${file.originalName}: ${err.message}`);
      setIsPolling(false);
    }
  }, [moduleFilters, medicineActions]);

  // ─── Start all migrations in correct order ──────────────────────────────────
  const startMigration = async () => {
    const readyFiles = DATA_TYPE_ORDER.flatMap(type =>
      files.filter(f => f.status === 'ready' && f.userSelectedType === type && selectedModules[type])
    ).concat(files.filter(f => f.status === 'ready' && f.userSelectedType === 'unknown' && selectedModules['unknown']));

    if (readyFiles.length === 0) { setError('No files selected for import.'); return; }
    setError(null);
    setActiveImportIdx(0);
    setStep(3);
    await importFile(readyFiles[0]);
  };

  const runPreMigrationAnalysis = async () => {
    const mainFile = files.find(f => f.status === 'ready' && selectedModules[f.userSelectedType]);
    if (!mainFile) {
      setConfigSubStep('preview');
      return;
    }
    setAnalyzingPreMigration(true);
    try {
      const data = await api.preMigrationAnalyze(mainFile.uploadedFileName, mainFile.skipLines || 0, 0, mainFile.mapping);
      setPreMigrationAnalysis(data);
      
      const initialActions: Record<string, any> = {};
      if (data.medicineCandidates) {
        data.medicineCandidates.forEach((cand: string) => {
          const suggestions = data.mergeSuggestions?.[cand] || [];
          if (suggestions.length > 0) {
            initialActions[cand] = { action: 'merge', target: suggestions[0] };
          } else {
            initialActions[cand] = { action: 'import' };
          }
        });
      }
      setMedicineActions(initialActions);
      setConfigSubStep('medicines');
    } catch (err: any) {
      setError(`Analysis failed: ${err.message}`);
    } finally {
      setAnalyzingPreMigration(false);
    }
  };

  const runPreMigrationSimulation = async () => {
    const mainFile = files.find(f => f.status === 'ready' && selectedModules[f.userSelectedType]);
    if (!mainFile) {
      setConfigSubStep('preview');
      return;
    }
    setSimulatingPreMigration(true);
    try {
      const filtersForFile = moduleFilters[mainFile.uploadedFileName] || {};
      const data = await api.preMigrationSimulate(
        mainFile.uploadedFileName,
        mainFile.userSelectedType,
        mainFile.mapping,
        mainFile.skipLines || 0,
        0,
        filtersForFile
      );
      setSimulationResult(data.simulation);
      setConfigSubStep('preview');
    } catch (err: any) {
      setError(`Simulation failed: ${err.message}`);
    } finally {
      setSimulatingPreMigration(false);
    }
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
      setStagingData({ inventory: [], sales: [], purchases: [], returns: [], errors: [] });
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

      {step === 1 && (
        <div className="space-y-5">
          {/* Project Management Bar */}
          <div className="glass-panel p-4 bg-bg2 border border-glass-border flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-muted uppercase">Active Migration Project:</span>
              {projects.length > 0 ? (
                <select
                  value={activeProject?.id || ''}
                  onChange={(e) => {
                    const p = projects.find(proj => proj.id === parseInt(e.target.value));
                    setActiveProject(p);
                  }}
                  className="bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 font-bold outline-none cursor-pointer"
                >
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-muted">No projects found. Create one to get started.</span>
              )}
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <input
                type="text"
                placeholder="New Project Name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="flex-1 md:flex-initial bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2.5 outline-none focus:border-primary transition-all"
              />
              <button
                onClick={async () => {
                  if (!newProjectName.trim()) return;
                  try {
                    const res = await api.createProject(newProjectName);
                    if (res.success) {
                      setNewProjectName('');
                      await fetchV2Data();
                    }
                  } catch (err: any) {
                    alert(err.message || 'Failed to create project');
                  }
                }}
                className="premium-btn bg-primary text-text text-xs font-bold py-2 px-4 shrink-0"
              >
                + Create Project
              </button>
            </div>
          </div>

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


        </div>
      )}

      {/* ─── STEP 2: MAP & VERIFY ─────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Guided Configurator Sub-steps progress indicator */}
          <div className="flex items-center gap-2 pb-2 border-b border-glass-border/30 overflow-x-auto">
            {[
              { key: 'modules', label: '1. Select Modules' },
              { key: 'filters', label: '2. Mappings & Filters' },
              { key: 'medicines', label: '3. Medicine Matcher' },
              { key: 'preview', label: '4. Cart Preview' }
            ].map((sub, i) => {
              const active = configSubStep === sub.key;
              return (
                <React.Fragment key={sub.key}>
                  <button
                    disabled={
                      (sub.key === 'filters' && readyCount === 0) ||
                      (sub.key === 'medicines' && readyCount === 0) ||
                      (sub.key === 'preview' && readyCount === 0)
                    }
                    onClick={() => {
                      if (sub.key === 'medicines') {
                        runPreMigrationAnalysis();
                      } else if (sub.key === 'preview') {
                        runPreMigrationSimulation();
                      } else {
                        setConfigSubStep(sub.key as any);
                      }
                    }}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all whitespace-nowrap ${
                      active 
                        ? 'bg-primary/20 text-primary border border-primary/50' 
                        : 'text-muted hover:text-text bg-white/5 border border-glass-border'
                    }`}
                  >
                    {sub.label}
                  </button>
                  {i < 3 && <span className="text-muted/40 text-[10px]">➔</span>}
                </React.Fragment>
              );
            })}
          </div>

          {/* Sub-step 1: Choose Modules */}
          {configSubStep === 'modules' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg text-text">Choose Modules to Migrate</h3>
                <label className="premium-btn bg-white/5 border border-glass-border text-muted hover:bg-white/10 cursor-pointer text-xs">
                  <UploadCloud size={13} /> Add More Files
                  <input type="file" accept=".csv,.xlsx,.xls,.zip,.sql" multiple className="hidden" onChange={handleFileDrop} />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {files.map((file, idx) => {
                  const isChecked = selectedModules[file.userSelectedType];
                  return (
                    <div key={idx} className="glass-panel p-4 border border-glass-border/30 hover:border-glass-border/70 transition-all flex flex-col justify-between gap-3 bg-bg">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className={`p-2 rounded-lg ${TYPE_COLORS[file.userSelectedType] || 'bg-white/5'}`}>
                            {TYPE_ICONS[file.userSelectedType] || <FileText size={16} />}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-sm text-text truncate">{file.originalName}</h4>
                            <p className="text-[10px] text-muted font-mono uppercase mt-0.5">{file.ext} · {file.headers.length} columns</p>
                          </div>
                        </div>
                        <button onClick={() => removeFile(idx)} className="p-1 rounded hover:bg-red/10 text-red-400" title="Remove">
                          <X size={14} />
                        </button>
                      </div>

                      {file.status === 'ready' && (
                        <div className="flex flex-col gap-2.5 bg-bg2 p-3 rounded-lg border border-glass-border/20">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted font-semibold">Enable Module:</span>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => setSelectedModules(prev => ({ ...prev, [file.userSelectedType]: e.target.checked }))}
                              className="w-4 h-4 rounded border-glass-border bg-transparent text-primary focus:ring-primary focus:ring-offset-bg"
                            />
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted">Module Type:</span>
                            <select
                              className={`text-[11px] font-bold px-2 py-1 rounded-lg border cursor-pointer bg-[#18181b] ${TYPE_COLORS[file.userSelectedType]}`}
                              value={file.userSelectedType}
                              onChange={e => updateType(idx, e.target.value as DataType)}
                            >
                              {Object.entries(DATA_TYPE_LABELS).map(([val, label]) => (
                                <option key={val} value={val} className="bg-[#18181b] text-text">{label}</option>
                              ))}
                            </select>
                          </div>

                          {file.detected.type !== 'unknown' && (
                            <p className="text-[10px] text-muted">
                              Heuristic confidence: <strong className="text-primary">{file.detected.confidence}%</strong>
                            </p>
                          )}

                          {file.headers.length > 0 && !['sql'].includes(file.ext) && (
                            <button
                              type="button"
                              onClick={() => openMappingModal(idx)}
                              className="mt-2 w-full premium-btn bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 text-[11px] font-bold py-1.5 flex items-center justify-center gap-1.5"
                            >
                              <Eye size={12} />
                              Preview & Map Columns
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {files.length > 0 && (
                <div className="flex justify-end pt-4">
                  <button
                    onClick={() => setConfigSubStep('filters')}
                    className="premium-btn bg-primary text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]"
                  >
                    Continue to Filters <ArrowRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Sub-step 2: Columns & Scope Filters */}
          {configSubStep === 'filters' && (
            <div className="space-y-4">
              <h3 className="font-bold text-lg text-text">Columns Mappings & Preprocessing Filters</h3>
              
              <div className="space-y-4">
                {files.filter(f => selectedModules[f.userSelectedType]).map((file, idx) => {
                  const absoluteIdx = files.indexOf(file);
                  const mappedCount = Object.values(file.mapping).filter(v => v !== '').length;
                  const totalCount = file.headers.length;
                  const fileFilter = moduleFilters[file.uploadedFileName] || {};
                  
                  return (
                    <div key={file.uploadedFileName} className="glass-panel p-4 border border-glass-border/30 space-y-4 bg-bg">
                      {/* File Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-glass-border/20 pb-3">
                        <div>
                          <h4 className="font-bold text-sm text-text flex items-center gap-1.5">
                            <span className={`p-1 rounded ${TYPE_COLORS[file.userSelectedType]}`}>
                              {TYPE_ICONS[file.userSelectedType]}
                            </span>
                            {file.originalName}
                          </h4>
                          <p className="text-[10px] text-muted mt-0.5 font-mono">
                            {mappedCount} of {totalCount} columns mapped.
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {file.headers.length > 0 && !['sql'].includes(file.ext) && (
                            <button
                              onClick={() => openMappingModal(absoluteIdx)}
                              className="premium-btn bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 text-xs px-3 py-1.5 font-bold flex items-center gap-1.5"
                            >
                              <Eye size={12} className="text-amber-400" />
                              Preview & Map Columns
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Warnings */}
                      {!hasNameMapped(file) && (
                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300">
                          ⚠ Please map at least one column to "Medicine Name" to enable import for this module.
                        </div>
                      )}

                      {/* Mapped Columns Summary */}
                      {mappedCount > 0 && (
                        <div className="bg-bg2/50 p-3 rounded-lg border border-glass-border/25 space-y-1.5">
                          <h5 className="text-[10px] font-bold text-muted uppercase tracking-wider">Active Column Mappings</h5>
                          <div className="flex flex-wrap gap-1.5">
                            {Object.entries(file.mapping)
                              .filter(([_, target]) => target !== '')
                              .map(([source, target]) => {
                                const customFieldName = target.startsWith('custom_col_') ? target.substring(11) : '';
                                const targetLabel = customFieldName 
                                  ? `Custom: ${customFieldName}` 
                                  : (DB_TARGET_COLUMNS.find(c => c.value === target)?.label.replace(' ⭐', '') || target);
                                return (
                                  <div key={source} className="text-[10px] bg-primary/10 border border-primary/20 text-primary rounded px-2 py-0.5 font-medium flex items-center gap-1">
                                    <span className="font-bold text-text truncate max-w-[100px]" title={source}>{source}</span>
                                    <span className="text-muted">➔</span>
                                    <span className="font-bold">{targetLabel}</span>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* Scope & Preprocessing Filters */}
                      {!['sql'].includes(file.ext) && (
                        <div className="bg-bg2 p-4 rounded-lg border border-glass-border/25 space-y-3">
                          <h5 className="font-bold text-xs text-text uppercase tracking-wider flex items-center gap-1">
                            <span className="text-primary font-bold">Filter Options</span>
                          </h5>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Row Index Range Selection */}
                            <div className="space-y-1.5">
                              <label className="text-xs text-muted block font-semibold">Row Index Range:</label>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  placeholder="Start Row (e.g. 1)"
                                  value={fileFilter.rangeStart || ''}
                                  onChange={(e) => setModuleFilters(prev => ({
                                    ...prev,
                                    [file.uploadedFileName]: { ...fileFilter, rangeStart: e.target.value }
                                  }))}
                                  className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary transition-all"
                                />
                                <span className="text-muted text-xs">to</span>
                                <input
                                  type="number"
                                  placeholder="End Row"
                                  value={fileFilter.rangeEnd || ''}
                                  onChange={(e) => setModuleFilters(prev => ({
                                    ...prev,
                                    [file.uploadedFileName]: { ...fileFilter, rangeEnd: e.target.value }
                                  }))}
                                  className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary transition-all"
                                />
                              </div>
                              <p className="text-[10px] text-muted">Leave empty to import all rows.</p>
                            </div>

                            {/* Manual Ignored Rows Selection */}
                            <div className="space-y-1.5">
                              <label className="text-xs text-muted block font-semibold">Ignore Specific Rows manually:</label>
                              <input
                                type="text"
                                placeholder="e.g. 1, 2, 5, 12, 15 (comma-separated)"
                                value={fileFilter.ignoredRows?.join(', ') || ''}
                                onChange={(e) => {
                                  const text = e.target.value;
                                  const parsed = text.split(',')
                                    .map(val => parseInt(val.trim()))
                                    .filter(val => !isNaN(val) && val > 0);
                                  setModuleFilters(prev => ({
                                    ...prev,
                                    [file.uploadedFileName]: { ...fileFilter, ignoredRows: parsed }
                                  }));
                                }}
                                className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary transition-all font-mono"
                              />
                              <p className="text-[10px] text-muted">Allows ignoring rows that aren't visible in the first 10 rows preview.</p>
                            </div>

                            {/* Conditional filters based on DataType */}
                            <div className="flex flex-col gap-2 justify-center">
                              {(file.userSelectedType === 'inventory' || file.userSelectedType === 'combined') && (
                                <>
                                  <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={!!fileFilter.onlyActiveStock}
                                      onChange={(e) => setModuleFilters(prev => ({
                                        ...prev,
                                        [file.uploadedFileName]: { ...fileFilter, onlyActiveStock: e.target.checked }
                                      }))}
                                      className="w-4 h-4 rounded border-glass-border bg-transparent text-primary focus:ring-primary focus:ring-offset-bg"
                                    />
                                    <span className="text-xs text-muted font-medium">Import only active stock (Quantity &gt; 0)</span>
                                  </label>

                                  <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                      type="checkbox"
                                      checked={!!fileFilter.excludeExpired}
                                      onChange={(e) => setModuleFilters(prev => ({
                                        ...prev,
                                        [file.uploadedFileName]: { ...fileFilter, excludeExpired: e.target.checked }
                                      }))}
                                      className="w-4 h-4 rounded border-glass-border bg-transparent text-primary focus:ring-primary focus:ring-offset-bg"
                                    />
                                    <span className="text-xs text-muted font-medium">Exclude expired products (Expiry &gt; Today)</span>
                                  </label>
                                </>
                              )}

                              {(file.userSelectedType === 'purchases' || file.userSelectedType === 'sales') && (
                                <div className="space-y-1">
                                  <label className="text-xs text-muted block font-semibold">Min Transaction Date:</label>
                                  <input
                                    type="date"
                                    value={fileFilter.minPurchaseDate || ''}
                                    onChange={(e) => setModuleFilters(prev => ({
                                      ...prev,
                                      [file.uploadedFileName]: { ...fileFilter, minPurchaseDate: e.target.value }
                                    }))}
                                    className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary transition-all"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between pt-4">
                <button
                  onClick={() => setConfigSubStep('modules')}
                  className="premium-btn bg-white/5 border border-glass-border text-muted hover:bg-white/10 text-xs"
                >
                  Back
                </button>
                <button
                  onClick={runPreMigrationAnalysis}
                  className="premium-btn bg-primary text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]"
                >
                  {analyzingPreMigration ? (
                    <>
                      <Loader2 size={14} className="animate-spin mr-1" /> Analyzing composition...
                    </>
                  ) : (
                    <>
                      Verify Medicines <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Sub-step 3: Medicine Match & Merge Reviews */}
          {configSubStep === 'medicines' && (
            <div className="space-y-4">
              <h3 className="font-bold text-lg text-text">Medicine Verification & Merge Resolver</h3>
              <p className="text-xs text-muted">
                Review medicine names extracted from the file. You can choose to import as new, merge with suggested database matches, or skip them.
              </p>

              {analyzingPreMigration ? (
                <div className="glass-panel p-10 flex flex-col items-center justify-center border border-glass-border/30 bg-bg">
                  <Loader2 size={32} className="animate-spin text-primary mb-3" />
                  <p className="text-sm font-semibold text-text">Scanning Composition...</p>
                  <p className="text-xs text-muted mt-1">Cross-referencing unique medicine names with database master...</p>
                </div>
              ) : !preMigrationAnalysis ? (
                <div className="glass-panel p-10 text-center bg-bg border border-glass-border/30 rounded-xl max-w-md mx-auto space-y-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary">
                    <Database size={16} />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-text">Analysis Pending</h4>
                    <p className="text-xs text-muted mt-1">
                      Please go back to the previous step and click the "Verify Medicines" button to analyze this file.
                    </p>
                  </div>
                  <button 
                    onClick={() => setConfigSubStep('filters')}
                    className="premium-btn bg-white/5 border border-glass-border text-muted hover:bg-white/10 text-xs mt-3 mx-auto flex items-center gap-1.5"
                  >
                    Go Back to Mappings & Filters
                  </button>
                </div>
              ) : preMigrationAnalysis?.medicineCandidates?.length === 0 ? (
                <div className="glass-panel p-8 text-center bg-bg border border-glass-border/30 rounded-xl space-y-4 max-w-xl mx-auto">
                  <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary">
                    <Database size={20} />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-text">Direct Bill/Invoice Ingestion (No Item Mapping)</h4>
                    <p className="text-xs text-muted mt-2 leading-relaxed">
                      This file does not have a column mapped to <strong className="text-primary">Medicine Name</strong> (or contains no medicine item data). 
                      It will be migrated directly as aggregate bill-wise records (e.g. return invoices, purchase bills, or sales invoices) containing total amounts, dates, and distributor/patient details.
                    </p>
                    <p className="text-xs text-muted mt-1">
                      No individual medicine mapping is required.
                    </p>
                  </div>
                  <div className="pt-2">
                    <button
                      onClick={runPreMigrationSimulation}
                      className="premium-btn bg-primary hover:bg-primary/90 text-white font-bold px-6 py-2.5 rounded-lg shadow-md hover:shadow-primary/20 transition-all text-xs flex items-center justify-center gap-1.5 mx-auto"
                    >
                      {simulatingPreMigration ? (
                        <>
                          <Loader2 size={14} className="animate-spin" /> Simulating...
                        </>
                      ) : (
                        <>
                          <span>Continue to Preview</span>
                          <ArrowRight size={14} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="max-h-[400px] overflow-y-auto border border-glass-border/20 rounded-xl bg-bg divide-y divide-glass-border/10">
                    {preMigrationAnalysis?.medicineCandidates?.map((cand: string) => {
                      const suggestions = preMigrationAnalysis.mergeSuggestions?.[cand] || [];
                      const actionObj = medicineActions[cand] || { action: 'import' };
                      
                      return (
                        <div key={cand} className="p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                          <div className="flex-1 min-w-0">
                            <span className="font-bold text-text block truncate" title={cand}>{cand}</span>
                            {suggestions.length > 0 && actionObj.action === 'merge' && (
                              <span className="text-[10px] text-green block mt-0.5">
                                Maps to suggested master composition
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3">
                            {/* Action selector */}
                            <div className="flex rounded-lg bg-bg2 border border-glass-border/30 p-0.5">
                              {[
                                { val: 'import', label: 'Import New' },
                                { val: 'merge', label: 'Merge Suggestion', disabled: suggestions.length === 0 },
                                { val: 'skip', label: 'Skip' }
                              ].map(act => (
                                <button
                                  key={act.val}
                                  disabled={act.disabled}
                                  onClick={() => setMedicineActions(prev => ({
                                    ...prev,
                                    [cand]: { ...prev[cand], action: act.val as any }
                                  }))}
                                  className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all select-none ${
                                    act.disabled ? 'opacity-30 cursor-not-allowed' :
                                    actionObj.action === act.val 
                                      ? 'bg-primary/20 text-primary border border-primary/30' 
                                      : 'text-muted hover:text-text'
                                  }`}
                                >
                                  {act.label}
                                </button>
                              ))}
                            </div>

                            {/* Dropdown for suggested merges */}
                            {actionObj.action === 'merge' && suggestions.length > 0 && (
                              <select
                                className="bg-[#18181b] border border-glass-border/40 text-text text-[11px] rounded p-1 outline-none font-bold"
                                value={actionObj.target || suggestions[0]}
                                onChange={(e) => setMedicineActions(prev => ({
                                  ...prev,
                                  [cand]: { ...prev[cand], target: e.target.value }
                                }))}
                              >
                                {suggestions.map((sug: string) => (
                                  <option key={sug} value={sug} className="bg-[#18181b] text-text">{sug}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex justify-between pt-4">
                    <button
                      onClick={() => setConfigSubStep('filters')}
                      className="premium-btn bg-white/5 border border-glass-border text-muted hover:bg-white/10 text-xs"
                    >
                      Back
                    </button>
                    <button
                      onClick={runPreMigrationSimulation}
                      className="premium-btn bg-primary text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]"
                    >
                      {simulatingPreMigration ? (
                        <>
                          <Loader2 size={14} className="animate-spin mr-1" /> Simulating changes...
                        </>
                      ) : (
                        <>
                          Continue to Simulation <ArrowRight size={14} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sub-step 4: Migration Cart & Final Preview */}
          {configSubStep === 'preview' && (
            <div className="space-y-4">
              <h3 className="font-bold text-lg text-text">Staging Ingestion Cart Preview</h3>
              <p className="text-xs text-muted">
                Review your migration cart items and simulation predictions before launching the SQLite staging load.
              </p>

              {simulatingPreMigration ? (
                <div className="glass-panel p-10 flex flex-col items-center justify-center border border-glass-border/30 bg-bg">
                  <Loader2 size={32} className="animate-spin text-primary mb-3" />
                  <p className="text-sm font-semibold text-text">Running Simulation...</p>
                  <p className="text-xs text-muted mt-1">Estimating target insertions and merges...</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Cart summary */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="glass-panel p-4 border border-glass-border/20 bg-bg">
                      <h4 className="font-bold text-xs uppercase tracking-wider text-muted mb-3">Cart Contents</h4>
                      <div className="space-y-2 text-xs">
                        {files.filter(f => selectedModules[f.userSelectedType]).map((f, i) => (
                          <div key={i} className="flex justify-between border-b border-glass-border/10 pb-1.5">
                            <span className="text-text font-medium truncate max-w-[200px]">{f.originalName}</span>
                            <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] uppercase font-mono ${TYPE_COLORS[f.userSelectedType]}`}>
                              {f.userSelectedType}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Simulation results prediction */}
                    <div className="glass-panel p-4 border border-glass-border/20 bg-bg flex flex-col justify-between">
                      <div>
                        <h4 className="font-bold text-xs uppercase tracking-wider text-muted mb-3">Simulation Prediction</h4>
                        {simulationResult ? (
                          <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-muted">Will Create:</span>
                              <span className="font-bold text-green">{simulationResult.created} medicines</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted">Will Update / Merge:</span>
                              <span className="font-bold text-sky">{simulationResult.updated} medicines</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted">Will Skip:</span>
                              <span className="font-bold text-amber-500">{simulationResult.skipped} records</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted">No simulation details available.</p>
                        )}
                      </div>
                      <p className="text-[10px] text-muted mt-3">Prediction counts based on a sample run of up to 1,000 rows.</p>
                    </div>
                  </div>

                  <div className="flex justify-between pt-4">
                    <button
                      onClick={() => setConfigSubStep('medicines')}
                      className="premium-btn bg-white/5 border border-glass-border text-muted hover:bg-white/10 text-xs"
                    >
                      Back
                    </button>
                    <button
                      onClick={startMigration}
                      className="premium-btn bg-primary text-white shadow-[0_0_20px_rgba(59,130,246,0.3)] font-bold"
                    >
                      <Database size={15} className="mr-1" /> Confirm & Start Ingestion <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── STEP 3: STAGING REVIEW ─────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5">
          {/* Progress — shown while import is running */}
          {(isPolling || migrationStatus) && (
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
          )}

          {/* Staging Summary — show whenever data exists OR migration just completed */}
          {!isPolling && (() => {
            const hasStagingData =
              stagingData.inventory.length > 0 ||
              stagingData.sales.length > 0 ||
              stagingData.purchases.length > 0 ||
              stagingData.returns.length > 0 ||
              stagingData.errors.length > 0;
            if (!hasStagingData && !migrationStatus?.isStagingReady) return null;
            return (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Inventory Items', count: stagingData.inventory.length, color: 'text-sky' },
                  { label: 'Sales Invoices', count: stagingData.sales.length, color: 'text-green' },
                  { label: 'Purchase Bills', count: stagingData.purchases.length, color: 'text-primary' },
                  { label: 'Returns', count: stagingData.returns?.length || 0, color: 'text-rose-400' },
                ].map(s => (
                  <div key={s.label} className="glass-panel p-5 text-center">
                    <p className={`text-3xl font-black ${s.color}`}>{s.count}</p>
                    <p className="text-xs text-muted font-bold uppercase tracking-wider mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Conflict Resolution Center Panel */}
              {stagingConflicts.length > 0 && (
                <div className="glass-panel p-4 border border-amber-500/30 bg-amber-500/5 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="text-amber-500" size={18} />
                      <div>
                        <h4 className="font-bold text-sm text-text">Migration Conflict Resolution Center ({stagingConflicts.length} pending)</h4>
                        <p className="text-[11px] text-muted">Some imported rows match existing items in the live database. Action is required.</p>
                      </div>
                    </div>
                  </div>

                  <div className="max-h-[250px] overflow-y-auto border border-glass-border/20 rounded-lg bg-bg divide-y divide-glass-border/10 font-sans">
                    {stagingConflicts.map((c: any) => {
                      const rawRow = JSON.parse(c.raw_imported_data);
                      return (
                        <div key={c.id} className="p-3 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-text block">Medicine ID: {rawRow.medicine_id} — Batch: {rawRow.batch_no}</span>
                            <span className="text-[10px] text-muted block mt-0.5">Reason: {c.conflict_reason} | Staged Qty: {rawRow.quantity} | Staged Expiry: {rawRow.expiry_date}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleResolveConflict(c, 'merge')}
                              className="px-2.5 py-1.5 rounded bg-sky/10 border border-sky/30 text-sky text-[10px] font-bold hover:bg-sky/20 transition-all cursor-pointer"
                            >
                              Merge Stock
                            </button>
                            <button
                              onClick={() => handleResolveConflict(c, 'replace')}
                              className="px-2.5 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold hover:bg-emerald-500/20 transition-all cursor-pointer"
                            >
                              Replace Live
                            </button>
                            <button
                              onClick={() => handleResolveConflict(c, 'skip')}
                              className="px-2.5 py-1.5 rounded bg-white/5 border border-glass-border text-muted text-[10px] font-bold hover:bg-white/10 transition-all cursor-pointer"
                            >
                              Skip Row
                            </button>
                            <button
                              onClick={() => handleResolveConflict(c, 'create_new')}
                              className="px-2.5 py-1.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold hover:bg-amber-500/20 transition-all cursor-pointer"
                            >
                              Create New
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Database Recovery Snapshots Panel */}
              {snapshots.length > 0 && (
                <div className="glass-panel p-4 border border-glass-border bg-bg2/50 rounded-xl space-y-3">
                  <h4 className="font-bold text-xs uppercase tracking-wider text-muted flex items-center gap-1.5">
                    <RotateCcw size={14} /> Database Recovery Snapshots / Rollbacks
                  </h4>
                  <div className="max-h-[150px] overflow-y-auto divide-y divide-glass-border/10 text-xs bg-bg/25 rounded-lg border border-glass-border/20 p-2">
                    {snapshots.map(snap => (
                      <div key={snap.id} className="py-2 flex items-center justify-between gap-3">
                        <span className="font-mono text-muted text-[10px] truncate max-w-[400px]">{snap.backup_path.split('\\').pop() || snap.backup_path}</span>
                        <span className="text-muted text-[10px]">{snap.created_at}</span>
                        <button
                          onClick={async () => {
                            if (confirm('Are you sure you want to restore the database to this state? Current data will be replaced.')) {
                              try {
                                const res = await api.restoreSnapshot(snap.id);
                                alert(res.message);
                                window.location.reload();
                              } catch (err: any) {
                                alert(err.message || 'Failed to restore snapshot');
                              }
                            }
                          }}
                          className="px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[10px] font-bold hover:bg-rose-500/20 transition-all cursor-pointer"
                        >
                          Restore DB
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                    onClick={() => { setActiveStagingTab('returns'); setStagingSearchQuery(''); }}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${activeStagingTab === 'returns' ? 'bg-primary text-text' : 'text-muted hover:text-text bg-bg3/50'}`}
                  >
                    <RotateCcw size={14} /> Returns ({stagingData.returns?.length || 0})
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
                            <th className="p-3 text-muted font-bold text-center">Loose Qty</th>
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
                              <td className="p-3 text-center font-bold text-sky">{i.loose_quantity ?? 0}</td>
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
                            <tr><td colSpan={10} className="p-6 text-center text-muted">No matching staging inventory records found.</td></tr>
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
                            <th className="p-3 text-muted font-bold text-center">Total Qty</th>
                            <th className="p-3 text-muted font-bold text-center">Items</th>
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
                              <td className="p-3 text-center font-bold text-sky">{s.total_qty ?? 0}</td>
                              <td className="p-3 text-center text-muted">{s.item_count ?? 0}</td>
                              <td className="p-3 text-text">{s.patient_name || '—'}</td>
                              <td className="p-3 text-text">{s.doctor_name || '—'}</td>
                              <td className="p-3 text-right whitespace-nowrap">
                                <button
                                  onClick={() => handleViewItems('sales', s)}
                                  className="text-green hover:underline font-bold mr-3 text-[11px]"
                                >
                                  View Items
                                </button>
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
                            <tr><td colSpan={8} className="p-6 text-center text-muted">No matching staging sales records found.</td></tr>
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
                            <th className="p-3 text-muted font-bold text-center">Total Qty</th>
                            <th className="p-3 text-muted font-bold text-center">Items</th>
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
                              <td className="p-3 text-center font-bold text-sky">{p.total_qty ?? 0}</td>
                              <td className="p-3 text-center text-muted">{p.item_count ?? 0}</td>
                              <td className="p-3 text-text">{p.distributor_name || '—'}</td>
                              <td className="p-3 text-right whitespace-nowrap">
                                <button
                                  onClick={() => handleViewItems('purchases', p)}
                                  className="text-green hover:underline font-bold mr-3 text-[11px]"
                                >
                                  View Items
                                </button>
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
                            <tr><td colSpan={7} className="p-6 text-center text-muted">No matching staging purchases records found.</td></tr>
                          )}
                        </tbody>
                      </table>
                    );
                  })()}

                  {activeStagingTab === 'returns' && (() => {
                    const filtered = stagingData.returns?.filter(r => {
                      const query = stagingSearchQuery.toLowerCase();
                      return (r.return_no || '').toLowerCase().includes(query) ||
                             (r.distributor_name || '').toLowerCase().includes(query);
                    }) || [];

                    return (
                      <table className="w-full text-xs text-left">
                        <thead className="sticky top-0 bg-bg2 border-b border-glass-border">
                          <tr>
                            <th className="p-3 text-muted font-bold">Return No</th>
                            <th className="p-3 text-muted font-bold">Return Invoice ID</th>
                            <th className="p-3 text-muted font-bold">Type</th>
                            <th className="p-3 text-muted font-bold">Date / Time</th>
                            <th className="p-3 text-muted font-bold">Total Amount</th>
                            <th className="p-3 text-muted font-bold text-center">Total Qty</th>
                            <th className="p-3 text-muted font-bold text-center">Items</th>
                            <th className="p-3 text-muted font-bold">Distributor Name</th>
                            <th className="p-3 text-muted font-bold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((r: any) => (
                            <tr key={r.id} className="border-b border-glass-border/20 hover:bg-bg2/40 transition-colors">
                              <td className="p-3 font-semibold text-text">{r.return_no}</td>
                              <td className="p-3 font-mono text-muted">{r.return_invoice_id || '—'}</td>
                              <td className="p-3">
                                {r.return_sub_type === 'expiry' ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-sky-500/10 border border-sky-500/20 text-sky-400">
                                    Expiry
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-green-500/10 border border-green-500/20 text-green-400">
                                    Good Return
                                  </span>
                                )}
                              </td>
                              <td className="p-3 font-mono text-muted whitespace-nowrap">
                                {r.return_date_time || r.date || '—'}
                              </td>
                              <td className="p-3 font-bold text-rose-400">₹{r.total_amount || 0}</td>
                              <td className="p-3 text-center font-bold text-sky">{r.total_qty ?? 0}</td>
                              <td className="p-3 text-center text-muted">{r.item_count ?? 0}</td>
                              <td className="p-3 text-text">{r.distributor_name || '—'}</td>
                              <td className="p-3 text-right whitespace-nowrap">
                                <button
                                  onClick={() => handleViewItems('returns', r)}
                                  className="text-green hover:underline font-bold mr-3 text-[11px]"
                                >
                                  View Items
                                </button>
                                <button
                                  onClick={() => handleEditRecord('returns', r)}
                                  className="text-primary hover:underline font-bold mr-3 text-[11px]"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteRecord('returns', r.id)}
                                  className="text-red-400 hover:underline font-bold text-[11px]"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                          {filtered.length === 0 && (
                            <tr><td colSpan={7} className="p-6 text-center text-muted">No matching staging returns records found.</td></tr>
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
            );
          })()}
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
      {showMappingModal && activeMappingFileIdx !== null && files[activeMappingFileIdx] && (() => {
        const file = files[activeMappingFileIdx];
        const visibleHeaders = file.headers.filter(h => {
          if (showOnlyMapped) {
            return tempMapping[h] && tempMapping[h] !== '';
          }
          return true;
        });

        return createPortal(
          <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/80 backdrop-blur-sm p-2 sm:p-3">
            <div className="glass-panel w-full max-w-[99vw] h-[98vh] lg:max-w-[98vw] lg:h-[95vh] flex flex-col rounded-2xl border border-glass-border shadow-2xl overflow-hidden bg-bg">
              {/* Modal Header */}
              <div className="p-4 md:px-6 md:py-4 border-b border-glass-border bg-bg2 flex justify-between items-center">
                <div>
                  <h4 className="text-lg font-bold text-text flex items-center gap-2">
                    <Database size={20} className="text-primary" />
                    Migration Column Mapping
                  </h4>
                  <p className="text-muted text-xs mt-1">
                    Map the columns from "{file.originalName}" to the app fields.
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
              <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
                {file.status === 'analyzing' && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-xs z-20 flex flex-col items-center justify-center gap-3">
                    <Loader2 size={36} className="animate-spin text-primary" />
                    <span className="text-sm font-semibold text-text">Re-analyzing file with new skip lines...</span>
                  </div>
                )}

                {/* Left Column: Mappings form */}
                <div className="w-full lg:w-[48%] xl:w-[50%] p-4 md:p-5 overflow-y-auto border-b lg:border-b-0 lg:border-r border-glass-border flex flex-col gap-4">
                  
                  {/* Preset Mapping Templates Bar */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-bg3 p-3 rounded-lg border border-glass-border/30">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted">Load Mapping Preset:</span>
                      <select
                        onChange={(e) => {
                          const template = templates.find(t => t.name === e.target.value);
                          if (template) {
                            try {
                              const parsedMappings = typeof template.mappings === 'string' ? JSON.parse(template.mappings) : template.mappings;
                              updateTempMappingWithHistory(parsedMappings);
                            } catch (err) {
                              console.error('Failed to apply template:', err);
                            }
                          }
                        }}
                        className="bg-bg border border-glass-border text-text text-xs rounded p-1.5 outline-none font-bold cursor-pointer"
                      >
                        <option value="">-- Select Template --</option>
                        {templates.filter(t => t.module_type === file.userSelectedType).map(t => (
                          <option key={t.id} value={t.name}>{t.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <input
                        type="text"
                        placeholder="Save as template"
                        value={saveTemplateName}
                        onChange={(e) => setSaveTemplateName(e.target.value)}
                        className="bg-bg border border-glass-border text-text text-xs rounded p-1.5 outline-none flex-1 sm:flex-initial"
                      />
                      <button
                        onClick={async () => {
                          if (!saveTemplateName.trim()) return;
                          try {
                            await api.saveTemplate(saveTemplateName, file.userSelectedType, tempMapping);
                            setSaveTemplateName('');
                            const temps = await api.getTemplates();
                            setTemplates(temps || []);
                            alert('Template saved successfully!');
                          } catch (err: any) {
                            alert(err.message || 'Failed to save template');
                          }
                        }}
                        className="px-3 py-1.5 bg-primary/20 border border-primary/30 text-primary text-[11px] font-bold rounded hover:bg-primary/30 transition-all shrink-0"
                      >
                        Save
                      </button>
                    </div>
                  </div>

                  {/* File Preprocessing Configurations inside Mapping Modal */}
                  <div className="flex flex-col gap-4 bg-bg2 p-4 rounded-xl border border-glass-border/30">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <label className="text-xs font-bold text-text whitespace-nowrap">Skip top metadata rows:</label>
                        <input
                          type="number"
                          min={0}
                          value={file.skipLines || 0}
                          onChange={(e) => handleSkipLinesChange(activeMappingFileIdx, Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-16 bg-bg3 border border-glass-border text-text text-xs rounded-lg p-1.5 outline-none focus:border-primary text-center font-bold"
                        />
                        <span className="text-[10px] text-muted">(skips legacy header/shop metadata rows)</span>
                      </div>
                      
                      <div className="text-[11px] text-muted font-semibold">
                        Headers: <span className="font-mono text-primary font-bold">{file.headers.length} detected</span>
                      </div>
                    </div>

                    <div className="w-full space-y-1.5 border-t border-glass-border/10 pt-3">
                      <label className="text-xs font-bold text-text block">Ignore Specific Rows manually (comma-separated):</label>
                      <input
                        type="text"
                        placeholder="e.g. 1, 2, 5, 12, 15"
                        value={moduleFilters[file.uploadedFileName]?.ignoredRows?.join(', ') || ''}
                        onChange={(e) => {
                          const text = e.target.value;
                          const parsed = text.split(',')
                            .map(val => parseInt(val.trim()))
                            .filter(val => !isNaN(val) && val > 0);
                          setModuleFilters(prev => ({
                            ...prev,
                            [file.uploadedFileName]: { ...(prev[file.uploadedFileName] || {}), ignoredRows: parsed }
                          }));
                        }}
                        className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary font-mono"
                      />
                      <p className="text-[9px] text-muted">Allows ignoring rows that aren't visible in the first 10 rows preview.</p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <h5 className="text-xs font-semibold text-muted uppercase tracking-wider">Configure Column Mappings</h5>
                    
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          const updatedMapping = { ...tempMapping };
                          file.headers.forEach(h => {
                            if (!updatedMapping[h]) {
                              updatedMapping[h] = '';
                            }
                          });
                          updateTempMappingWithHistory(updatedMapping);
                        }}
                        className="px-2.5 py-1 bg-bg3 hover:bg-bg2 border border-glass-border text-muted hover:text-text text-[10px] font-bold rounded-lg transition-all"
                        title="Set all unmapped columns to Ignore"
                      >
                        Ignore Unused Columns
                      </button>
                      
                      {/* Undo / Redo controls */}
                      <div className="flex items-center gap-2 bg-bg3 p-1 rounded-lg border border-glass-border">
                        <button
                          onClick={handleUndo}
                          disabled={historyIndex <= 0}
                          className="p-1 px-2 text-[10px] font-bold rounded hover:bg-bg2 disabled:opacity-30 disabled:pointer-events-none text-text transition-colors"
                          title="Undo Mapping Change"
                        >
                          Undo
                        </button>
                        <div className="w-px h-3 bg-glass-border" />
                        <button
                          onClick={handleRedo}
                          disabled={historyIndex >= mappingHistory.length - 1}
                          className="p-1 px-2 text-[10px] font-bold rounded hover:bg-bg2 disabled:opacity-30 disabled:pointer-events-none text-text transition-colors"
                          title="Redo Mapping Change"
                        >
                          Redo
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {file.headers.map((header) => {
                      const currentMapping = tempMapping[header] || '';
                      const sampleValue = file.samples[0]?.[header] || '—';

                      const isCustomMapping = currentMapping.startsWith('custom_col_');
                      const customFieldName = isCustomMapping ? currentMapping.substring(11) : '';

                      return (
                        <div 
                          key={header} 
                          onMouseEnter={() => setHoveredHeader(header)}
                          onMouseLeave={() => setHoveredHeader(null)}
                          className={`p-3 rounded-lg border transition-all flex flex-col gap-2 ${
                            hoveredHeader === header 
                              ? 'border-primary bg-bg3 shadow-[0_0_15px_rgba(59,130,246,0.2)]' 
                              : 'border-glass-border bg-bg2 hover:bg-bg3 hover:border-primary/40'
                          }`}
                        >
                          <div className="flex flex-col gap-1 min-w-0">
                            <span className="text-xs font-bold text-text truncate block" title={header}>
                              {header}
                            </span>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] text-muted bg-bg px-1.5 py-0.5 rounded border border-glass-border truncate block max-w-full font-medium" title={String(sampleValue)}>
                                Sample: <span className="text-primary font-mono">{String(sampleValue)}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => setActivePreviewHeader(activePreviewHeader === header ? null : header)}
                                className="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 text-[9px] font-bold shrink-0 transition-all"
                                title="Toggle unique values preview"
                              >
                                Preview
                              </button>
                            </div>
                            
                            {activePreviewHeader === header && (
                              <div className="bg-[#121214] border border-glass-border/40 p-2 rounded-lg text-[10px] text-muted space-y-1 max-h-28 overflow-y-auto font-mono">
                                <div className="font-sans font-semibold text-text pb-1 border-b border-glass-border/10 flex justify-between items-center">
                                  <span>Sample Values</span>
                                  <button onClick={() => setActivePreviewHeader(null)} className="text-muted hover:text-white">✕</button>
                                </div>
                                {file.samples.slice(0, 10).map((s, idx) => (
                                  <div key={idx} className="truncate">{s[header] !== undefined ? String(s[header]) : '—'}</div>
                                ))}
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-1.5 w-full">
                            <select
                              value={currentMapping}
                              onFocus={() => setHoveredHeader(header)}
                              onBlur={() => setHoveredHeader(null)}
                              onChange={(e) => {
                                  if (e.target.value === 'CREATE_CUSTOM') {
                                    const colName = window.prompt("Enter new custom database column name:");
                                    if (colName) {
                                      const cleanName = colName.trim().replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
                                      if (cleanName) {
                                        const customVal = `custom_col_${cleanName}`;
                                        if (!customColumns.includes(customVal)) {
                                          setCustomColumns(prev => [...prev, customVal]);
                                        }
                                        const newMapping = { ...tempMapping, [header]: customVal };
                                        updateTempMappingWithHistory(newMapping);
                                      }
                                    }
                                  } else {
                                    const newMapping = { ...tempMapping, [header]: e.target.value };
                                    updateTempMappingWithHistory(newMapping);
                                  }
                              }}
                              className="flex-1 bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary transition-all cursor-pointer font-medium"
                            >
                              <option value="" className="bg-bg text-text font-normal">-- Ignore --</option>
                              {DB_TARGET_SECTIONS.map((section) => (
                                <optgroup key={section.label} label={section.label} className="bg-bg text-primary font-semibold">
                                  {section.fields.map((f) => (
                                    <option key={`${section.label}-${f.value}`} value={f.value} className="bg-bg text-text font-normal">
                                      {f.label}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                              
                              {/* Render Created Custom Columns */}
                              {customColumns.length > 0 && (
                                <optgroup label="✨ Created Custom Columns" className="bg-bg text-blue-400 font-semibold">
                                  {customColumns.map((c) => (
                                    <option key={c} value={c} className="bg-bg text-text font-normal">
                                      Custom Field: {c.substring(11)}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              
                              <option value="CREATE_CUSTOM" className="bg-bg text-yellow-500 font-semibold">
                                + Add Custom Column...
                              </option>
                            </select>

                            {isCustomMapping && (
                              <button
                                onClick={() => handleDeleteCustomColumn(currentMapping)}
                                className="p-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-lg transition-colors shrink-0"
                                title="Delete Custom Column Mapping"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right Column: Sample Data Preview */}
                <div className="w-full lg:w-[52%] xl:w-[50%] p-4 md:p-5 flex flex-col overflow-hidden">
                  <div className="flex justify-between items-center mb-3">
                    <h5 className="text-xs font-semibold text-muted uppercase tracking-wider">Sample Data Grid (First 10 Rows)</h5>
                    <label className="flex items-center gap-2 text-xs text-muted cursor-pointer hover:text-text select-none">
                      <input
                        type="checkbox"
                        checked={showOnlyMapped}
                        onChange={(e) => setShowOnlyMapped(e.target.checked)}
                        className="rounded border-glass-border bg-bg3 text-primary focus:ring-0 focus:ring-offset-0 focus:outline-none"
                      />
                      Show Mapped Columns Only
                    </label>
                  </div>
                  
                  <div ref={scrollContainerRef} className="flex-1 overflow-auto border border-glass-border rounded-xl bg-bg3/50">
                    <table className="min-w-full divide-y divide-glass-border text-xs text-left">
                      <thead className="bg-bg2 sticky top-0 z-10">
                        <tr>
                          <th className="px-3 py-2 text-muted font-bold w-[160px] text-center border-b border-glass-border">Row Actions</th>
                          {visibleHeaders.map((header) => {
                            const isMapped = tempMapping[header];
                            const customFieldName = isMapped && isMapped.startsWith('custom_col_') ? isMapped.substring(11) : '';
                            const fieldInfo = isMapped ? (customFieldName ? { section: 'Custom Column', label: customFieldName } : getFieldLabelAndSection(isMapped)) : null;
                            const styles = getHighlightStyles(isMapped || '', hoveredHeader === header);
                            return (
                              <th 
                                key={header} 
                                data-header={header}
                                onMouseEnter={() => setHoveredHeader(header)}
                                onMouseLeave={() => setHoveredHeader(null)}
                                className={`px-4 py-3 font-bold border-b border-glass-border transition-all duration-150 truncate whitespace-nowrap cursor-pointer ${styles.header}`}
                              >
                                {header}
                                {isMapped && fieldInfo && (
                                  <span className="block text-[10px] font-bold mt-1 flex flex-wrap items-center gap-1">
                                    <span className={`px-1.5 py-0.5 rounded border text-[8px] uppercase font-semibold ${
                                      customFieldName 
                                        ? 'bg-blue-400/10 text-blue-300 border-blue-400/20' 
                                        : 'bg-emerald-400/10 text-emerald-300 border-emerald-400/20'
                                    }`}>
                                      {fieldInfo.section}
                                    </span>
                                    <span className="truncate max-w-[120px] text-text font-normal">
                                      {fieldInfo.label}
                                    </span>
                                  </span>
                                )}
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-glass-border text-text font-mono">
                        {file.samples.slice(0, 10).map((row, rowIdx) => {
                          const absoluteRowIndex = rowIdx + (file.skipLines || 0) + 1; // 1-based index in the file
                          const relativeRowIdx = rowIdx + 1; // 1-based relative index after skipLines
                          const currentFilters = moduleFilters[file.uploadedFileName] || {};
                          const isRowIgnored = currentFilters.ignoredRows?.includes(relativeRowIdx);

                          return (
                            <tr key={rowIdx} className={`hover:bg-bg2 transition-colors ${isRowIgnored ? 'bg-red-500/10 text-muted opacity-40 line-through' : ''}`}>
                              <td className="px-2 py-1.5 border-r border-glass-border/20">
                                <div className="flex items-center justify-center gap-2">
                                  {/* Checkbox to Skip */}
                                  <label className="inline-flex items-center gap-1 cursor-pointer select-none" title={isRowIgnored ? 'Include this row in migration' : 'Skip/Ignore this row'}>
                                    <input
                                      type="checkbox"
                                      checked={isRowIgnored}
                                      onChange={() => {
                                        const currentIgnored = currentFilters.ignoredRows || [];
                                        const newIgnored = currentIgnored.includes(relativeRowIdx)
                                          ? currentIgnored.filter((r: number) => r !== relativeRowIdx)
                                          : [...currentIgnored, relativeRowIdx];
                                        setModuleFilters(prev => ({
                                          ...prev,
                                          [file.uploadedFileName]: { ...currentFilters, ignoredRows: newIgnored }
                                        }));
                                      }}
                                      className="rounded border-glass-border bg-bg3 text-primary focus:ring-0 focus:ring-offset-0 focus:outline-none w-3.5 h-3.5 cursor-pointer"
                                    />
                                    <span className="text-[10px] text-muted hover:text-text font-sans font-medium">Skip</span>
                                  </label>

                                  {/* Trash Icon Button to Delete (Ignore) Row */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const currentIgnored = currentFilters.ignoredRows || [];
                                      const newIgnored = currentIgnored.includes(relativeRowIdx)
                                        ? currentIgnored.filter((r: number) => r !== relativeRowIdx)
                                        : [...currentIgnored, relativeRowIdx];
                                      setModuleFilters(prev => ({
                                        ...prev,
                                        [file.uploadedFileName]: { ...currentFilters, ignoredRows: newIgnored }
                                      }));
                                    }}
                                    className={`p-1 rounded border transition-all ${
                                      isRowIgnored
                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                        : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                                    }`}
                                    title={isRowIgnored ? 'Restore / Include row' : 'Delete / Ignore row'}
                                  >
                                    <Trash2 size={12} />
                                  </button>

                                  <div className="w-px h-3 bg-glass-border/30" />

                                  {/* Set Header Button */}
                                  <button
                                    type="button"
                                    onClick={() => handleSkipLinesChange(activeMappingFileIdx, absoluteRowIndex)}
                                    className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-all whitespace-nowrap"
                                    title="Set this row as the header, skipping all rows above it"
                                  >
                                    Set Header
                                  </button>
                                </div>
                              </td>

                              {visibleHeaders.map((header) => {
                                const isMapped = tempMapping[header];
                                const styles = getHighlightStyles(isMapped || '', hoveredHeader === header);
                                return (
                                  <td 
                                    key={header} 
                                    onMouseEnter={() => setHoveredHeader(header)}
                                    onMouseLeave={() => setHoveredHeader(null)}
                                    className={`px-4 py-2 truncate max-w-[200px] transition-all duration-150 ${styles.cell}`} 
                                    title={row[header]}
                                  >
                                    {row[header] !== undefined ? String(row[header]) : ''}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
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
                  onClick={commitMappings}
                  className="bg-primary hover:bg-primary/95 text-text text-xs font-bold px-6 py-3 rounded-lg flex items-center gap-2 shadow-lg hover:shadow-primary/20 transition-all"
                >
                  <CheckCircle size={14} /> Confirm Mappings
                </button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Interactive Staging Record Edit Modal */}
      {editingRecordType !== null && editingRecordData !== null && (
        createPortal(
          <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
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
                    <div className="grid grid-cols-2 gap-3">
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
                        <label className="text-[10px] font-bold text-muted uppercase">Loose Quantity</label>
                        <input
                          type="number"
                          value={editingRecordData.loose_quantity || 0}
                          onChange={(e) => setEditingRecordData({ ...editingRecordData, loose_quantity: parseInt(e.target.value, 10) || 0 })}
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

                {editingRecordType === 'returns' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted uppercase">Return Number</label>
                        <input
                          type="text"
                          value={editingRecordData.return_no || ''}
                          onChange={(e) => setEditingRecordData({ ...editingRecordData, return_no: e.target.value })}
                          className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted uppercase">Return Invoice ID</label>
                        <input
                          type="text"
                          value={editingRecordData.return_invoice_id || ''}
                          onChange={(e) => setEditingRecordData({ ...editingRecordData, return_invoice_id: e.target.value })}
                          className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted uppercase">Return Type</label>
                        <select
                          value={editingRecordData.return_sub_type || 'good'}
                          onChange={(e) => setEditingRecordData({ ...editingRecordData, return_sub_type: e.target.value })}
                          className="w-full bg-bg3 border border-glass-border text-text text-xs rounded-lg p-2 outline-none focus:border-primary"
                        >
                          <option value="good">Good Return</option>
                          <option value="expiry">Expiry</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted uppercase">Return Date / Time</label>
                        <input
                          type="text"
                          value={editingRecordData.return_date_time || editingRecordData.date || ''}
                          onChange={(e) => setEditingRecordData({ ...editingRecordData, return_date_time: e.target.value })}
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

      {/* View Staged Items Modal */}
      {viewingItemsRecord !== null && (
        createPortal(
          <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="glass-panel w-full max-w-3xl rounded-2xl border border-glass-border shadow-2xl overflow-hidden bg-bg">
              {/* Header */}
              <div className="p-4 border-b border-glass-border bg-bg2 flex justify-between items-center gap-4">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-text flex items-center gap-2">
                    <Eye size={18} className="text-primary shrink-0" />
                    Staged Items — <span className="text-primary font-mono">{viewingItemsRecord.name}</span>
                  </h4>
                  <div className="flex flex-wrap gap-3 mt-1.5">
                    <span className="text-[10px] text-muted uppercase font-bold tracking-wider">
                      {viewingItemsRecord.type === 'sales' ? 'Sales Invoice' : viewingItemsRecord.type === 'purchases' ? 'Purchase Bill' : 'Return'}
                    </span>
                    {viewingItemsRecord.patient_name && (
                      <span className="text-[11px] text-purple-300 font-semibold">👤 {viewingItemsRecord.patient_name}</span>
                    )}
                    {viewingItemsRecord.doctor_name && (
                      <span className="text-[11px] text-sky font-semibold">🩺 Dr. {viewingItemsRecord.doctor_name}</span>
                    )}
                    {viewingItemsRecord.distributor_name && (
                      <span className="text-[11px] text-amber-300 font-semibold">🏭 {viewingItemsRecord.distributor_name}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setAddingNewItem(true);
                      setNewItemData({
                        medicine_name: '',
                        batch_no: 'BATCH',
                        quantity: 1,
                        loose_qty: 0,
                        unit_price: 0,
                        cost_price: 0,
                        mrp: 0,
                        expiry_date: viewingItemsRecord.type !== 'sales' ? '2028-12-01 00:00:00' : undefined
                      });
                    }}
                    className="bg-primary hover:bg-primary/95 text-text text-xs font-bold px-3 py-1.5 rounded-lg border border-glass-border flex items-center gap-1 shadow-lg"
                  >
                    + Add Item
                  </button>
                  <button
                    onClick={() => { setViewingItemsRecord(null); setEditingItemId(null); setAddingNewItem(false); }}
                    className="text-muted hover:text-text transition-colors text-xs font-bold bg-bg3 px-2.5 py-1 rounded-lg border border-glass-border"
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-5 max-h-[60vh] overflow-y-auto">
                {loadingItems ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted">
                    <Loader2 className="animate-spin text-primary" size={32} />
                    <span className="text-xs font-semibold">Loading items...</span>
                  </div>
                ) : viewingItems.length === 0 && !addingNewItem ? (
                  <div className="text-center py-12 text-muted text-xs">
                    No items found for this record.
                  </div>
                ) : (
                  <table className="w-full text-xs text-left">
                    <thead className="sticky top-0 bg-bg2 border-b border-glass-border">
                      <tr>
                        <th className="p-3 text-muted font-bold">Medicine Name</th>
                        <th className="p-3 text-muted font-bold">Batch</th>
                        {(viewingItemsRecord.type === 'purchases' || viewingItemsRecord.type === 'returns') && <th className="p-3 text-muted font-bold">Expiry</th>}
                        <th className="p-3 text-muted font-bold text-center">Qty</th>
                        {viewingItemsRecord.type === 'sales' && <th className="p-3 text-muted font-bold text-center">Loose Qty</th>}
                        <th className="p-3 text-muted font-bold">{viewingItemsRecord.type === 'sales' ? 'Unit Price' : 'Cost Price'}</th>
                        <th className="p-3 text-muted font-bold">MRP</th>
                        <th className="p-3 text-muted font-bold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {addingNewItem && (
                        <tr className="bg-primary/5 border-b border-glass-border">
                          <td className="p-2">
                            <input
                              type="text"
                              placeholder="Medicine Name"
                              value={newItemData.medicine_name || ''}
                              onChange={e => setNewItemData((prev: any) => ({ ...prev, medicine_name: e.target.value }))}
                              className="bg-bg3 border border-glass-border rounded px-2 py-1 text-xs text-text focus:border-primary w-full outline-none"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              placeholder="Batch"
                              value={newItemData.batch_no || ''}
                              onChange={e => setNewItemData((prev: any) => ({ ...prev, batch_no: e.target.value }))}
                              className="bg-bg3 border border-glass-border rounded px-2 py-1 text-xs text-text focus:border-primary w-full outline-none"
                            />
                          </td>
                          {(viewingItemsRecord.type === 'purchases' || viewingItemsRecord.type === 'returns') && (
                            <td className="p-2">
                              <input
                                type="text"
                                placeholder="YYYY-MM-DD"
                                value={newItemData.expiry_date || ''}
                                onChange={e => setNewItemData((prev: any) => ({ ...prev, expiry_date: e.target.value }))}
                                className="bg-bg3 border border-glass-border rounded px-2 py-1 text-xs text-text focus:border-primary w-full outline-none font-mono"
                              />
                            </td>
                          )}
                          <td className="p-2">
                            <input
                              type="number"
                              placeholder="Qty"
                              value={newItemData.quantity || 0}
                              onChange={e => setNewItemData((prev: any) => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
                              className="bg-bg3 border border-glass-border rounded px-2 py-1 text-xs text-text focus:border-primary w-full outline-none text-center"
                            />
                          </td>
                          {viewingItemsRecord.type === 'sales' && (
                            <td className="p-2">
                              <input
                                type="number"
                                placeholder="Loose Qty"
                                value={newItemData.loose_qty || 0}
                                onChange={e => setNewItemData((prev: any) => ({ ...prev, loose_qty: parseInt(e.target.value) || 0 }))}
                                className="bg-bg3 border border-glass-border rounded px-2 py-1 text-xs text-text focus:border-primary w-full outline-none text-center"
                              />
                            </td>
                          )}
                          <td className="p-2">
                            <input
                              type="number"
                              step="0.01"
                              placeholder="Price"
                              value={viewingItemsRecord.type === 'sales' ? (newItemData.unit_price || 0) : (newItemData.cost_price || 0)}
                              onChange={e => {
                                const val = parseFloat(e.target.value) || 0;
                                setNewItemData((prev: any) => viewingItemsRecord.type === 'sales' ? ({ ...prev, unit_price: val }) : ({ ...prev, cost_price: val }));
                              }}
                              className="bg-bg3 border border-glass-border rounded px-2 py-1 text-xs text-text focus:border-primary w-full outline-none"
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              step="0.01"
                              placeholder="MRP"
                              value={newItemData.mrp || 0}
                              onChange={e => setNewItemData((prev: any) => ({ ...prev, mrp: parseFloat(e.target.value) || 0 }))}
                              className="bg-bg3 border border-glass-border rounded px-2 py-1 text-xs text-text focus:border-primary w-full outline-none"
                            />
                          </td>
                          <td className="p-2 text-right whitespace-nowrap space-x-2">
                            <button
                              onClick={handleAddStagedItem}
                              className="text-green hover:underline font-bold text-xs"
                            >
                              Add
                            </button>
                            <button
                              onClick={() => setAddingNewItem(false)}
                              className="text-muted hover:underline font-bold text-xs"
                            >
                              Cancel
                            </button>
                          </td>
                        </tr>
                      )}

                      {viewingItems.map((item: any, idx: number) => {
                        const qty = item.quantity || 0;
                        const price = viewingItemsRecord.type === 'sales' ? (item.unit_price || 0) : (item.cost_price || 0);
                        const total = viewingItemsRecord.type === 'returns' ? (item.total_price || (qty * price)) : (qty * price);
                        
                        const isEditing = editingItemId === item.id;

                        if (isEditing) {
                          return (
                            <tr key={item.id || idx} className="border-b border-glass-border bg-bg3/60">
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={editingItemData?.medicine_name || ''}
                                  onChange={e => setEditingItemData((prev: any) => ({ ...prev, medicine_name: e.target.value }))}
                                  className="bg-bg border border-glass-border rounded px-2 py-1 text-xs text-text focus:border-primary w-full outline-none"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={editingItemData?.batch_no || ''}
                                  onChange={e => setEditingItemData((prev: any) => ({ ...prev, batch_no: e.target.value }))}
                                  className="bg-bg border border-glass-border rounded px-2 py-1 text-xs text-text focus:border-primary w-full outline-none"
                                />
                              </td>
                              {(viewingItemsRecord.type === 'purchases' || viewingItemsRecord.type === 'returns') && (
                                <td className="p-2">
                                  <input
                                    type="text"
                                    value={editingItemData?.expiry_date || ''}
                                    onChange={e => setEditingItemData((prev: any) => ({ ...prev, expiry_date: e.target.value }))}
                                    className="bg-bg border border-glass-border rounded px-2 py-1 text-xs text-text focus:border-primary w-full outline-none font-mono"
                                  />
                                </td>
                              )}
                              <td className="p-2">
                                <input
                                  type="number"
                                  value={editingItemData?.quantity || 0}
                                  onChange={e => setEditingItemData((prev: any) => ({ ...prev, quantity: parseInt(e.target.value) || 0 }))}
                                  className="bg-bg border border-glass-border rounded px-2 py-1 text-xs text-text focus:border-primary w-full outline-none text-center"
                                />
                              </td>
                              {viewingItemsRecord.type === 'sales' && (
                                <td className="p-2">
                                  <input
                                    type="number"
                                    value={editingItemData?.loose_qty || 0}
                                    onChange={e => setEditingItemData((prev: any) => ({ ...prev, loose_qty: parseInt(e.target.value) || 0 }))}
                                    className="bg-bg border border-glass-border rounded px-2 py-1 text-xs text-text focus:border-primary w-full outline-none text-center"
                                  />
                                </td>
                              )}
                              <td className="p-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={viewingItemsRecord.type === 'sales' ? (editingItemData?.unit_price || 0) : (editingItemData?.cost_price || 0)}
                                  onChange={e => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setEditingItemData((prev: any) => viewingItemsRecord.type === 'sales' ? ({ ...prev, unit_price: val }) : ({ ...prev, cost_price: val }));
                                  }}
                                  className="bg-bg border border-glass-border rounded px-2 py-1 text-xs text-text focus:border-primary w-full outline-none"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editingItemData?.mrp || 0}
                                  onChange={e => setEditingItemData((prev: any) => ({ ...prev, mrp: parseFloat(e.target.value) || 0 }))}
                                  className="bg-bg border border-glass-border rounded px-2 py-1 text-xs text-text focus:border-primary w-full outline-none"
                                />
                              </td>
                              <td className="p-2 text-right whitespace-nowrap space-x-2">
                                <button
                                  onClick={() => handleSaveStagedItem(item.id)}
                                  className="text-green hover:underline font-bold text-xs"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => { setEditingItemId(null); setEditingItemData(null); }}
                                  className="text-muted hover:underline font-bold text-xs"
                                >
                                  Cancel
                                </button>
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr key={item.id || idx} className="border-b border-glass-border/20 hover:bg-bg2/40 transition-colors">
                            <td className="p-3 font-semibold text-text">{item.medicine_name || 'Unknown Medicine'}</td>
                            <td className="p-3 font-mono text-muted">{item.batch_no || '—'}</td>
                            {(viewingItemsRecord.type === 'purchases' || viewingItemsRecord.type === 'returns') && <td className="p-3 font-mono text-muted">{item.expiry_date || '—'}</td>}
                            <td className="p-3 text-center text-text font-semibold">{qty}</td>
                            {viewingItemsRecord.type === 'sales' && <td className="p-3 text-center text-muted">{item.loose_qty || 0}</td>}
                            <td className="p-3 text-text">₹{price}</td>
                            <td className="p-3 text-text">₹{item.mrp || 0}</td>
                            <td className="p-3 text-right text-text whitespace-nowrap">
                              <span className="font-bold mr-3">₹{total.toFixed(2)}</span>
                              <button
                                onClick={() => {
                                  setEditingItemId(item.id);
                                  setEditingItemData({ ...item });
                                }}
                                className="text-primary hover:underline font-bold text-[11px] mr-2"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteStagedItem(item.id)}
                                className="text-red-400 hover:underline font-bold text-[11px]"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-glass-border bg-bg2 flex justify-end">
                <button
                  onClick={() => { setViewingItemsRecord(null); setEditingItemId(null); setAddingNewItem(false); }}
                  className="bg-bg3 border border-glass-border hover:bg-bg3/80 text-text text-xs font-bold px-5 py-2 rounded-lg transition-colors"
                >
                  Close
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
