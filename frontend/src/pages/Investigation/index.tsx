import { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  RotateCcw, 
  Edit, 
  Clock, 
  FileText, 
  Trash2, 
  Plus, 
  Check, 
  AlertTriangle, 
  HelpCircle,
  TrendingUp,
  Package,
  Calendar,
  DollarSign
} from 'lucide-react';
import { api } from '../../services/api';

interface SearchFilters {
  q: string;
  patientName: string;
  medicineName: string;
  salesBillNo: string;
  purchaseBillNo: string;
  batchNo: string;
  distributor: string;
  expiryDate: string;
  mrp: string;
  quantity: string;
  looseQuantity: string;
}

interface SelectedDetails {
  inventory: {
    id: number;
    medicine_id: number;
    medicine_name: string;
    batch_no: string;
    expiry_date: string;
    quantity: number;
    loose_quantity: number;
    mrp: number;
    cost_price: number;
    rack_location?: string;
  };
  purchases: Array<{
    id: number;
    purchase_id: number;
    medicine_id: number;
    batch_no: string;
    expiry_date: string;
    quantity: number;
    free_qty: number;
    cost_price: number;
    mrp: number;
    invoice_no: string;
    date: string;
    distributor_name: string;
  }>;
  sales: Array<{
    id: number;
    invoice_id: number;
    inventory_id: number;
    quantity: number;
    unit_price: number;
    loose_qty: number;
    invoice_no: string;
    date: string;
    customer_name: string;
  }>;
  timeline: Array<{
    date: string;
    type: 'Purchase' | 'Sale' | 'Adjustment';
    reference: string;
    detail: string;
    qtyChange: number;
    price?: number;
    cost?: number;
    mrp?: number;
  }>;
}

const InvestigationCenter = () => {
  const [filters, setFilters] = useState<SearchFilters>({
    q: '',
    patientName: '',
    medicineName: '',
    salesBillNo: '',
    purchaseBillNo: '',
    batchNo: '',
    distributor: '',
    expiryDate: '',
    mrp: '',
    quantity: '',
    looseQuantity: ''
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [details, setDetails] = useState<SelectedDetails | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Modals / Confirmation State
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Edit / Adjustment States
  const [editingType, setEditingType] = useState<'inventory' | 'sale' | 'purchase' | null>(null);
  const [editInventoryForm, setEditInventoryForm] = useState({
    quantity: 0,
    loose_quantity: 0,
    batch_no: '',
    expiry_date: '',
    mrp: 0,
    cost_price: 0,
    rack_location: ''
  });

  // Target Bill Edit States
  const [editingBillId, setEditingBillId] = useState<number | null>(null);
  const [editingBillNo, setEditingBillNo] = useState<string>('');
  const [billItems, setBillItems] = useState<any[]>([]);
  const [billDiscount, setBillDiscount] = useState<number>(0);
  const [searchMedicineResults, setSearchMedicineResults] = useState<any[]>([]);
  const [searchMedicineQuery, setSearchMedicineQuery] = useState('');

  // Notification Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const runSearch = async () => {
    setLoading(true);
    try {
      const activeFilters = Object.fromEntries(
        Object.entries(filters).filter(([_, val]) => val.trim() !== '')
      );
      const data = await api.searchInvestigation(activeFilters);
      setSearchResults(data);
      if (data.length > 0 && !selectedId) {
        // Automatically select the first row
        handleSelectRecord(data[0].inventory_id);
      } else if (data.length === 0) {
        setDetails(null);
        setAuditLogs([]);
        setSelectedId(null);
      }
    } catch (err) {
      showToast('Search failed. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRecord = async (inventoryId: number) => {
    setSelectedId(inventoryId);
    setDetailsLoading(true);
    setEditingType(null);
    try {
      const detailsData = await api.getInvestigationDetails(inventoryId);
      setDetails(detailsData);
      const logs = await api.getInvestigationAuditLogs(inventoryId);
      setAuditLogs(logs);
    } catch (err) {
      showToast('Failed to fetch details.', 'error');
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    runSearch();
  }, []);

  const handleFilterChange = (key: keyof SearchFilters, val: string) => {
    setFilters(prev => ({ ...prev, [key]: val }));
  };

  const handleClearFilters = () => {
    setFilters({
      q: '',
      patientName: '',
      medicineName: '',
      salesBillNo: '',
      purchaseBillNo: '',
      batchNo: '',
      distributor: '',
      expiryDate: '',
      mrp: '',
      quantity: '',
      looseQuantity: ''
    });
    setSearchResults([]);
    setDetails(null);
    setAuditLogs([]);
    setSelectedId(null);
  };

  // Direct Inventory Correction logic
  const startInventoryEdit = () => {
    if (!details) return;
    const inv = details.inventory;
    setEditInventoryForm({
      quantity: inv.quantity,
      loose_quantity: inv.loose_quantity,
      batch_no: inv.batch_no,
      expiry_date: inv.expiry_date,
      mrp: inv.mrp,
      cost_price: inv.cost_price,
      rack_location: inv.rack_location || ''
    });
    setEditingType('inventory');
  };

  const saveInventoryAdjustment = () => {
    if (!selectedId || !details) return;
    if (editInventoryForm.quantity < 0 || editInventoryForm.loose_quantity < 0) {
      showToast('Quantities cannot be negative', 'error');
      return;
    }

    setConfirmModal({
      show: true,
      title: 'Confirm Inventory Adjustments',
      message: `Adjusting stock for ${details.inventory.medicine_name}. Quantity: ${details.inventory.quantity} -> ${editInventoryForm.quantity}. Expiry: "${details.inventory.expiry_date}" -> "${editInventoryForm.expiry_date}". Are you sure?`,
      onConfirm: async () => {
        try {
          await api.updateInvestigationInventory(selectedId, editInventoryForm);
          showToast('Inventory adjusted successfully.');
          setEditingType(null);
          setConfirmModal(null);
          handleSelectRecord(selectedId);
        } catch (err: any) {
          showToast(err.response?.data?.error || 'Failed to update inventory', 'error');
        }
      }
    });
  };

  // Edit Sales Bill logic
  const startSaleBillEdit = (sale: any) => {
    setEditingBillId(sale.invoice_id);
    setEditingBillNo(sale.invoice_no);
    setBillDiscount(sale.discount || 0);

    // Initialize items currently on this invoice
    // Fetch detailed items
    setDetailsLoading(true);
    api.getSale(sale.invoice_id)
      .then(invoiceDetails => {
        const mapped = invoiceDetails.items.map((it: any) => ({
          inventory_id: it.inventory_id,
          medicine_name: it.medicine_name,
          batch_no: it.batch_number,
          quantity: it.quantity,
          unit_price: it.unit_price,
          loose_qty: it.loose_qty || 0,
          original_qty: it.quantity // Keep to track reversion delta
        }));
        setBillItems(mapped);
        setEditingType('sale');
      })
      .catch(() => showToast('Failed to fetch invoice details', 'error'))
      .finally(() => setDetailsLoading(false));
  };

  // Edit Purchase Bill logic
  const startPurchaseBillEdit = (p: any) => {
    setEditingBillId(p.purchase_id);
    setEditingBillNo(p.invoice_no);

    setDetailsLoading(true);
    api.getPurchase(p.purchase_id)
      .then(purchaseDetails => {
        const mapped = purchaseDetails.items.map((it: any) => ({
          medicine_id: it.medicine_id,
          medicine_name: it.medicine_name,
          batch_no: it.batch_no,
          expiry_date: it.expiry_date,
          quantity: it.quantity,
          cost_price: it.cost_price,
          mrp: it.mrp,
          free_qty: it.free_qty || 0,
          original_qty: it.quantity
        }));
        setBillItems(mapped);
        setEditingType('purchase');
      })
      .catch(() => showToast('Failed to fetch purchase bill details', 'error'))
      .finally(() => setDetailsLoading(false));
  };

  // Inline Recalculation Engine
  const calculateRecalculatedTotal = () => {
    if (editingType === 'sale') {
      const subtotal = billItems.reduce((acc, it) => acc + (it.quantity * it.unit_price), 0);
      const tax = subtotal * 0.05;
      return Math.round(subtotal + tax - billDiscount);
    }
    if (editingType === 'purchase') {
      return billItems.reduce((acc, it) => acc + (it.quantity * it.cost_price), 0);
    }
    return 0;
  };

  // Item list mutation helpers
  const handleItemQtyChange = (index: number, newQty: number) => {
    if (newQty < 0) return;
    setBillItems(prev => {
      const next = [...prev];
      next[index].quantity = newQty;
      return next;
    });
  };

  const handleItemLooseQtyChange = (index: number, newQty: number) => {
    if (newQty < 0) return;
    setBillItems(prev => {
      const next = [...prev];
      next[index].loose_qty = newQty;
      return next;
    });
  };

  const handleRemoveBillItem = (index: number) => {
    setConfirmModal({
      show: true,
      title: 'Confirm Item Removal',
      message: `Are you sure you want to remove "${billItems[index].medicine_name}" from this transaction? Stock reconciliation will occur automatically.`,
      onConfirm: () => {
        setBillItems(prev => prev.filter((_, idx) => idx !== index));
        setConfirmModal(null);
      }
    });
  };

  const handleSearchMedicineForAdd = async (q: string) => {
    setSearchMedicineQuery(q);
    if (q.trim().length < 2) {
      setSearchMedicineResults([]);
      return;
    }
    try {
      const data = await api.searchMedicine(q);
      setSearchMedicineResults(data);
    } catch { }
  };

  const handleAddMedicineToBill = (med: any) => {
    if (editingType === 'sale') {
      // Check if already in list
      if (billItems.some(i => i.inventory_id === med.inventory_id)) {
        showToast('Medicine already present in list', 'error');
        return;
      }
      setBillItems(prev => [
        ...prev,
        {
          inventory_id: med.inventory_id,
          medicine_name: med.medicine_name,
          batch_no: med.batch_no,
          quantity: 1,
          unit_price: med.mrp,
          loose_qty: 0,
          original_qty: 0
        }
      ]);
    } else if (editingType === 'purchase') {
      if (billItems.some(i => i.medicine_id === med.medicine_id && i.batch_no === med.batch_no)) {
        showToast('Medicine and batch already present in list', 'error');
        return;
      }
      setBillItems(prev => [
        ...prev,
        {
          medicine_id: med.medicine_id,
          medicine_name: med.medicine_name,
          batch_no: med.batch_no || 'MANUAL',
          expiry_date: med.expiry_date || '12/28',
          quantity: 1,
          cost_price: med.cost_price || (med.mrp * 0.7),
          mrp: med.mrp,
          free_qty: 0,
          original_qty: 0
        }
      ]);
    }
    setSearchMedicineQuery('');
    setSearchMedicineResults([]);
    showToast(`Added ${med.medicine_name} to transaction workspace.`);
  };

  const saveBillCorrections = () => {
    if (!editingBillId) return;

    const actionText = editingType === 'sale' ? 'Sales Bill' : 'Purchase Bill';
    setConfirmModal({
      show: true,
      title: `Confirm ${actionText} Correction`,
      message: `This will update Invoice #${editingBillNo} with corrected items and prices, then adjust inventory stock balances automatically. Proceed?`,
      onConfirm: async () => {
        try {
          if (editingType === 'sale') {
            await api.updateInvestigationSaleBill(editingBillId, {
              items: billItems,
              discount: billDiscount
            });
          } else {
            await api.updateInvestigationPurchaseBill(editingBillId, {
              items: billItems
            });
          }
          showToast(`${actionText} corrected successfully!`);
          setEditingType(null);
          setConfirmModal(null);
          if (selectedId) handleSelectRecord(selectedId);
        } catch (err: any) {
          showToast(err.response?.data?.error || 'Failed to save correction.', 'error');
        }
      }
    });
  };

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden relative">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[99999] flex items-center gap-2 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-2xl text-xs font-semibold animate-in slide-in-from-top-4
          ${toast.type === 'success' ? 'bg-green/15 border-green/30 text-green-200' : 'bg-red/15 border-red/30 text-red-200'}`}>
          <Check size={14} />
          {toast.message}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && confirmModal.show && (
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-bg2 border border-glass-border max-w-md w-full rounded-2xl shadow-2xl overflow-hidden p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3 text-amber-500">
              <AlertTriangle size={24} />
              <h3 className="font-bold text-base text-text">{confirmModal.title}</h3>
            </div>
            <p className="text-xs text-muted leading-relaxed">{confirmModal.message}</p>
            <div className="flex justify-end gap-3 mt-2">
              <button 
                onClick={() => setConfirmModal(null)} 
                className="px-4 py-2 rounded-xl bg-bg3 text-muted hover:text-text border border-glass-border transition-colors text-xs font-bold"
              >
                Cancel
              </button>
              <button 
                onClick={confirmModal.onConfirm} 
                className="px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary/95 transition-all text-xs font-bold shadow-[0_0_15px_rgba(59,130,246,0.2)]"
              >
                Confirm Adjustment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTAINER SPLIT */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0 overflow-hidden">
        
        {/* LEFT PANEL: Filters and Search Results */}
        <div className="w-full lg:w-[320px] shrink-0 bg-glass-bg border border-glass-border rounded-2xl flex flex-col min-h-0 overflow-hidden">
          
          {/* SECTION 1: Search Filters */}
          <div className="p-4 border-b border-glass-border/30 bg-bg2/40 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-text flex items-center gap-1.5">
                <Filter size={14} className="text-primary" /> SEARCH FILTERS
              </span>
              <button 
                onClick={() => setShowAdvanced(!showAdvanced)} 
                className="text-[10px] text-primary hover:underline font-bold"
              >
                {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
              </button>
            </div>

            {/* Global search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2 text-muted" size={13} />
              <input 
                type="text"
                placeholder="Global Name, Batch, or Bill..."
                value={filters.q}
                onChange={e => handleFilterChange('q', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && runSearch()}
                className="w-full bg-bg3 border border-glass-border rounded-lg pl-8 pr-3 py-1.5 text-xs text-text placeholder-muted focus:outline-none"
              />
            </div>

            {/* Advanced Panel */}
            {showAdvanced && (
              <div className="grid grid-cols-1 gap-2 border-t border-glass-border/20 pt-2.5 animate-in fade-in duration-200">
                <input 
                  type="text"
                  placeholder="Medicine Name"
                  value={filters.medicineName}
                  onChange={e => handleFilterChange('medicineName', e.target.value)}
                  className="w-full bg-bg3 border border-glass-border rounded-lg px-2.5 py-1 text-xs text-text focus:outline-none"
                />
                <input 
                  type="text"
                  placeholder="Patient Name"
                  value={filters.patientName}
                  onChange={e => handleFilterChange('patientName', e.target.value)}
                  className="w-full bg-bg3 border border-glass-border rounded-lg px-2.5 py-1 text-xs text-text focus:outline-none"
                />
                <input 
                  type="text"
                  placeholder="Sales Bill Number"
                  value={filters.salesBillNo}
                  onChange={e => handleFilterChange('salesBillNo', e.target.value)}
                  className="w-full bg-bg3 border border-glass-border rounded-lg px-2.5 py-1 text-xs text-text focus:outline-none"
                />
                <input 
                  type="text"
                  placeholder="Purchase Bill Number"
                  value={filters.purchaseBillNo}
                  onChange={e => handleFilterChange('purchaseBillNo', e.target.value)}
                  className="w-full bg-bg3 border border-glass-border rounded-lg px-2.5 py-1 text-xs text-text focus:outline-none"
                />
                <input 
                  type="text"
                  placeholder="Batch Number"
                  value={filters.batchNo}
                  onChange={e => handleFilterChange('batchNo', e.target.value)}
                  className="w-full bg-bg3 border border-glass-border rounded-lg px-2.5 py-1 text-xs text-text focus:outline-none"
                />
                <input 
                  type="text"
                  placeholder="Distributor"
                  value={filters.distributor}
                  onChange={e => handleFilterChange('distributor', e.target.value)}
                  className="w-full bg-bg3 border border-glass-border rounded-lg px-2.5 py-1 text-xs text-text focus:outline-none"
                />
              </div>
            )}

            <div className="flex gap-2">
              <button 
                onClick={runSearch}
                disabled={loading}
                className="flex-1 py-1.5 bg-primary text-white hover:bg-primary/95 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1"
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
              <button 
                onClick={handleClearFilters}
                className="p-1.5 bg-bg3 hover:bg-bg2 text-muted hover:text-text border border-glass-border rounded-lg transition-colors"
                title="Reset Filters"
              >
                <RotateCcw size={13} />
              </button>
            </div>
          </div>

          {/* Results List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 flex flex-col gap-1.5 bg-bg2/10">
            {loading ? (
              <div className="p-8 text-center text-xs text-muted animate-pulse">Running query...</div>
            ) : searchResults.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted">No records match filter values.</div>
            ) : (
              searchResults.map(item => (
                <button
                  key={item.inventory_id}
                  onClick={() => handleSelectRecord(item.inventory_id)}
                  className={`w-full text-left p-2.5 rounded-xl border transition-all duration-200 flex flex-col gap-1 cursor-pointer
                    ${selectedId === item.inventory_id 
                      ? 'bg-primary/10 border-primary shadow-[inset_0_0_10px_rgba(59,130,246,0.15)]' 
                      : 'bg-glass-bg border-glass-border/30 hover:border-glass-border/70 hover:translate-x-0.5'}`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-bold text-xs text-text truncate max-w-[170px]">{item.medicine_name}</span>
                    <span className="text-[9px] font-mono font-bold bg-bg3 text-primary px-1.5 py-0.5 rounded border border-glass-border">
                      {item.batch_no}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-muted font-medium">
                    <span>Stock: <strong className="text-text font-bold">{item.quantity}</strong> | Loose: {item.loose_quantity}</span>
                    <span>MRP: ₹{item.mrp}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Details, Timeline, Edit Workspace */}
        <div className="flex-1 bg-glass-bg border border-glass-border rounded-2xl flex flex-col min-h-0 overflow-hidden">
          {detailsLoading ? (
            <div className="flex-1 flex items-center justify-center p-8 text-muted">
              <div className="flex flex-col items-center gap-2 animate-pulse">
                <Clock size={32} className="animate-spin text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider">Fetching details timeline...</span>
              </div>
            </div>
          ) : !details ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted">
              <Package size={44} className="opacity-20 mb-3" />
              <h3 className="font-bold text-xs text-text">Select a record to investigate</h3>
              <p className="text-[11px] max-w-sm mt-1 leading-relaxed">Choose one matching search result on the left to review its stock lineage, purchase references, sales history, and make edits.</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              
              {/* HEADER INFORMATION STRIP */}
              <div className="p-4 border-b border-glass-border/30 bg-bg2/40 flex justify-between items-center shrink-0">
                <div className="min-w-0">
                  <h2 className="text-base font-black text-text truncate">{details.inventory.medicine_name}</h2>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[10px] text-muted font-medium">
                    <span>Batch: <strong className="text-text font-bold">{details.inventory.batch_no}</strong></span>
                    <span>Expiry: <strong className="text-text font-bold">{details.inventory.expiry_date}</strong></span>
                    <span>MRP: <strong className="text-text font-bold">₹{details.inventory.mrp}</strong></span>
                    <span>Rack: <strong className="text-text font-bold">{details.inventory.rack_location || 'Not Specified'}</strong></span>
                  </div>
                </div>

                {!editingType && (
                  <button 
                    onClick={startInventoryEdit}
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 border border-primary/20 hover:bg-primary/20 hover:border-primary/40 text-primary hover:text-white transition-all text-xs font-bold rounded-lg"
                  >
                    <Edit size={13} />
                    Adjust Stock
                  </button>
                )}
              </div>

              {/* CORE DETAILS SCROLLABLE WORKSPACE */}
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar flex flex-col gap-4">
                
                {/* TRANSACTION LINEAGE WORKSPACE */}
                {editingType ? (
                  
                  /* EDIT PANEL SECTION */
                  <div className="bg-bg2 border border-glass-border p-4 rounded-2xl flex flex-col gap-4 animate-in slide-in-from-top-4 duration-300">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs text-text flex items-center gap-1.5 uppercase">
                        <Edit size={14} className="text-primary" /> 
                        {editingType === 'inventory' ? 'Inventory Direct Correction' : 
                         editingType === 'sale' ? `Correcting Sales Invoice #${editingBillNo}` : 
                         `Correcting Purchase Bill #${editingBillNo}`}
                      </span>
                      <button 
                        onClick={() => setEditingType(null)} 
                        className="text-[10px] text-muted hover:text-text font-bold"
                      >
                        Discard Adjustments
                      </button>
                    </div>

                    {/* Inventory Adjust Form */}
                    {editingType === 'inventory' && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-muted uppercase">Stock Quantity</label>
                          <input 
                            type="number"
                            value={editInventoryForm.quantity}
                            onChange={e => setEditInventoryForm(prev => ({ ...prev, quantity: Math.max(0, Number(e.target.value)) }))}
                            className="bg-bg3 border border-glass-border rounded-lg px-3 py-1.5 text-xs text-text focus:outline-none"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-muted uppercase">Loose Quantity</label>
                          <input 
                            type="number"
                            value={editInventoryForm.loose_quantity}
                            onChange={e => setEditInventoryForm(prev => ({ ...prev, loose_quantity: Math.max(0, Number(e.target.value)) }))}
                            className="bg-bg3 border border-glass-border rounded-lg px-3 py-1.5 text-xs text-text focus:outline-none"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-muted uppercase">Batch Number</label>
                          <input 
                            type="text"
                            value={editInventoryForm.batch_no}
                            onChange={e => setEditInventoryForm(prev => ({ ...prev, batch_no: e.target.value }))}
                            className="bg-bg3 border border-glass-border rounded-lg px-3 py-1.5 text-xs text-text focus:outline-none"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-muted uppercase">Expiry Date</label>
                          <input 
                            type="text"
                            placeholder="MM/YY"
                            value={editInventoryForm.expiry_date}
                            onChange={e => setEditInventoryForm(prev => ({ ...prev, expiry_date: e.target.value }))}
                            className="bg-bg3 border border-glass-border rounded-lg px-3 py-1.5 text-xs text-text focus:outline-none"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-muted uppercase">MRP (₹)</label>
                          <input 
                            type="number"
                            value={editInventoryForm.mrp}
                            onChange={e => setEditInventoryForm(prev => ({ ...prev, mrp: Math.max(0, Number(e.target.value)) }))}
                            className="bg-bg3 border border-glass-border rounded-lg px-3 py-1.5 text-xs text-text focus:outline-none"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-muted uppercase">Cost Price (₹)</label>
                          <input 
                            type="number"
                            value={editInventoryForm.cost_price}
                            onChange={e => setEditInventoryForm(prev => ({ ...prev, cost_price: Math.max(0, Number(e.target.value)) }))}
                            className="bg-bg3 border border-glass-border rounded-lg px-3 py-1.5 text-xs text-text focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    {/* Transaction Items Form (Sales/Purchases) */}
                    {(editingType === 'sale' || editingType === 'purchase') && (
                      <div className="flex flex-col gap-3">
                        
                        {/* Search to add medicine item */}
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2.5 text-muted" size={13} />
                          <input 
                            type="text"
                            placeholder="Search medicine to add to this transaction..."
                            value={searchMedicineQuery}
                            onChange={e => handleSearchMedicineForAdd(e.target.value)}
                            className="w-full bg-bg3 border border-glass-border rounded-lg pl-8 pr-3 py-2 text-xs text-text placeholder-muted focus:outline-none"
                          />
                          {searchMedicineResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 z-[100] mt-1 bg-bg2 border border-glass-border rounded-xl shadow-2xl overflow-hidden max-h-48 overflow-y-auto p-1.5 flex flex-col gap-1">
                              {searchMedicineResults.map((med, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => handleAddMedicineToBill(med)}
                                  className="w-full text-left p-2 hover:bg-primary/10 rounded-lg text-xs text-text flex items-center justify-between border border-transparent hover:border-primary/20"
                                >
                                  <span>{med.medicine_name} (Batch: {med.batch_no || 'N/A'})</span>
                                  <span className="font-mono text-muted text-[10px]">Stock: {med.quantity}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Invoice lines */}
                        <div className="border border-glass-border/30 rounded-xl overflow-hidden divide-y divide-glass-border/30 max-h-60 overflow-y-auto">
                          {billItems.length === 0 ? (
                            <div className="p-6 text-center text-xs text-muted">No items in the list. Please add a medicine.</div>
                          ) : (
                            billItems.map((item, index) => (
                              <div key={index} className="p-3 bg-bg3/20 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold text-text truncate">{item.medicine_name}</p>
                                  <p className="text-[10px] text-muted">Batch: {item.batch_no}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-3 shrink-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-muted uppercase">Qty</span>
                                    <input 
                                      type="number"
                                      value={item.quantity}
                                      onChange={e => handleItemQtyChange(index, Math.max(0, Number(e.target.value)))}
                                      className="w-16 bg-bg3 border border-glass-border rounded-lg px-2 py-1 text-xs text-text focus:outline-none"
                                    />
                                  </div>
                                  {editingType === 'sale' && (
                                    <>
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-muted uppercase">Loose</span>
                                        <input 
                                          type="number"
                                          value={item.loose_qty}
                                          onChange={e => handleItemLooseQtyChange(index, Math.max(0, Number(e.target.value)))}
                                          className="w-14 bg-bg3 border border-glass-border rounded-lg px-2 py-1 text-xs text-text focus:outline-none"
                                        />
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-muted uppercase">Price</span>
                                        <span className="font-mono font-bold text-text">₹{item.unit_price}</span>
                                      </div>
                                    </>
                                  )}
                                  {editingType === 'purchase' && (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[10px] text-muted uppercase">Cost</span>
                                      <span className="font-mono font-bold text-text">₹{item.cost_price}</span>
                                    </div>
                                  )}
                                  <button
                                    onClick={() => handleRemoveBillItem(index)}
                                    className="p-1.5 rounded hover:bg-red/10 text-red-400 transition-colors"
                                    title="Remove item"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Recalculated values strip */}
                        <div className="p-3 bg-bg3/30 border border-glass-border/20 rounded-xl flex items-center justify-between text-xs font-bold">
                          {editingType === 'sale' && (
                            <div className="flex items-center gap-3">
                              <span className="text-muted">Discount Override:</span>
                              <input 
                                type="number"
                                value={billDiscount}
                                onChange={e => setBillDiscount(Math.max(0, Number(e.target.value)))}
                                className="w-16 bg-bg3 border border-glass-border rounded-lg px-2 py-0.5 font-mono text-text focus:outline-none"
                              />
                            </div>
                          )}
                          <div className="ml-auto text-right">
                            <span className="text-muted mr-1.5">Recalculated Total:</span>
                            <span className="text-primary text-sm font-black font-mono">₹{calculateRecalculatedTotal()}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-2.5">
                      <button 
                        onClick={() => setEditingType(null)} 
                        className="px-4 py-2 rounded-xl bg-bg3 text-muted border border-glass-border transition-colors text-xs font-bold"
                      >
                        Discard
                      </button>
                      <button 
                        onClick={editingType === 'inventory' ? saveInventoryAdjustment : saveBillCorrections} 
                        className="px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary/95 transition-all text-xs font-bold shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                      >
                        Save Adjustments
                      </button>
                    </div>
                  </div>
                ) : (
                  
                  /* BILL INFORMATION SECTIONS */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* SECTION 3: Purchase Bill Info */}
                    <div className="bg-bg2/40 border border-glass-border/30 p-4 rounded-2xl flex flex-col gap-3">
                      <h3 className="font-bold text-xs text-text flex items-center gap-1.5 border-b border-glass-border/20 pb-2">
                        <TrendingUp size={14} className="text-green" /> SECTION 3: PURCHASE BILL RECORD
                      </h3>
                      {details.purchases.length === 0 ? (
                        <p className="text-[11px] text-muted text-center py-6">No matching purchase records for this batch.</p>
                      ) : (
                        details.purchases.map(p => (
                          <div key={p.id} className="p-3 bg-bg3/20 border border-glass-border/20 rounded-xl flex items-center justify-between gap-3 hover:bg-bg3/40 transition-colors">
                            <div className="min-w-0">
                              <p className="font-bold text-xs text-text truncate">Bill: {p.invoice_no}</p>
                              <p className="text-[10px] text-muted truncate">{p.distributor_name}</p>
                              <p className="text-[9px] text-muted/60">{new Date(p.date).toLocaleDateString()}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right shrink-0">
                                <p className="font-mono text-xs text-text font-bold">Qty: {p.quantity}</p>
                                <p className="text-[9px] text-muted font-mono">Cost: ₹{p.cost_price}</p>
                              </div>
                              <button 
                                onClick={() => startPurchaseBillEdit(p)}
                                className="p-1.5 rounded hover:bg-primary/10 text-primary transition-colors"
                                title="Edit Purchase Bill"
                              >
                                <Edit size={13} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* SECTION 4: Sales Bill Info */}
                    <div className="bg-bg2/40 border border-glass-border/30 p-4 rounded-2xl flex flex-col gap-3">
                      <h3 className="font-bold text-xs text-text flex items-center gap-1.5 border-b border-glass-border/20 pb-2">
                        <FileText size={14} className="text-sky" /> SECTION 4: SALES BILL RECORDS
                      </h3>
                      {details.sales.length === 0 ? (
                        <p className="text-[11px] text-muted text-center py-6">No sales recorded from this batch.</p>
                      ) : (
                        details.sales.map(s => (
                          <div key={s.id} className="p-3 bg-bg3/20 border border-glass-border/20 rounded-xl flex items-center justify-between gap-3 hover:bg-bg3/40 transition-colors">
                            <div className="min-w-0">
                              <p className="font-bold text-xs text-text truncate">Bill: {s.invoice_no}</p>
                              <p className="text-[10px] text-muted truncate">Patient: {s.customer_name || 'Walk-in'}</p>
                              <p className="text-[9px] text-muted/60">{new Date(s.date).toLocaleDateString()}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-right shrink-0">
                                <p className="font-mono text-xs text-text font-bold">Qty: {s.quantity}</p>
                                <p className="text-[9px] text-muted font-mono">Price: ₹{s.unit_price}</p>
                              </div>
                              <button 
                                onClick={() => startSaleBillEdit(s)}
                                className="p-1.5 rounded hover:bg-primary/10 text-primary transition-colors"
                                title="Edit Sales Bill"
                              >
                                <Edit size={13} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* DOUBLE SPLIT: Stock movement timeline and Audit summary */}
                {!editingType && (
                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                    
                    {/* SECTION 5: Stock Movement History (3 cols) */}
                    <div className="lg:col-span-3 bg-bg2/40 border border-glass-border/30 p-4 rounded-2xl flex flex-col gap-3">
                      <h3 className="font-bold text-xs text-text flex items-center gap-1.5 border-b border-glass-border/20 pb-2">
                        <Clock size={14} className="text-primary" /> STOCK MOVEMENT TIMELINE
                      </h3>
                      <div className="flex-1 max-h-80 overflow-y-auto custom-scrollbar flex flex-col gap-3.5 pl-3 border-l-2 border-primary/20">
                        {details.timeline.length === 0 ? (
                          <p className="text-[11px] text-muted py-4">No stock ledger movement logs found.</p>
                        ) : (
                          details.timeline.map((item, idx) => (
                            <div key={idx} className="relative group">
                              {/* Bullets */}
                              <div className={`absolute -left-[17px] top-1 w-2.5 h-2.5 rounded-full border border-bg
                                ${item.type === 'Purchase' ? 'bg-green' : 
                                  item.type === 'Sale' ? 'bg-sky' : 'bg-amber-500'}`} 
                              />
                              <div>
                                <p className="text-xs font-semibold text-text flex items-center gap-2">
                                  <span>{item.detail}</span>
                                  <span className={`text-[9px] px-1 rounded font-bold uppercase
                                    ${item.type === 'Purchase' ? 'bg-green/10 text-green-400' : 
                                      item.type === 'Sale' ? 'bg-sky/10 text-sky-400' : 'bg-amber-500/10 text-amber-400'}`}>
                                    {item.type}
                                  </span>
                                </p>
                                <div className="flex items-center gap-3 text-[10px] text-muted font-medium mt-0.5">
                                  <span className="font-mono">{new Date(item.date).toLocaleString()}</span>
                                  <span>Ref: {item.reference}</span>
                                  <span className={`font-mono font-bold ${item.qtyChange > 0 ? 'text-green' : 'text-red-400'}`}>
                                    {item.qtyChange > 0 ? `+${item.qtyChange}` : item.qtyChange} units
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* SECTION 6: Audit Logs (2 cols) */}
                    <div className="lg:col-span-2 bg-bg2/40 border border-glass-border/30 p-4 rounded-2xl flex flex-col gap-3">
                      <h3 className="font-bold text-xs text-text flex items-center gap-1.5 border-b border-glass-border/20 pb-2">
                        <Clock size={14} className="text-purple-400" /> AUDIT ADJUSTMENT LOGS
                      </h3>
                      <div className="flex-1 max-h-80 overflow-y-auto custom-scrollbar flex flex-col gap-2.5">
                        {auditLogs.length === 0 ? (
                          <p className="text-[11px] text-muted py-6 text-center">No corrections logged for this medicine.</p>
                        ) : (
                          auditLogs.map((log, idx) => (
                            <div key={idx} className="p-2 bg-bg3/25 border border-glass-border/10 rounded-xl flex flex-col gap-1">
                              <div className="flex justify-between items-center text-[9px] font-bold text-purple-400 uppercase tracking-wider">
                                <span>{log.action_type}</span>
                                <span className="font-mono text-muted/60 font-medium">{new Date(log.created_at).toLocaleDateString()}</span>
                              </div>
                              <p className="text-[10px] text-text leading-relaxed font-medium">{log.description}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                  </div>
                )}

              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default InvestigationCenter;
