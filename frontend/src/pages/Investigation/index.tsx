import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Search, 
  Edit, 
  Clock, 
  Trash2, 
  Check, 
  AlertTriangle, 
  Package,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  SlidersHorizontal
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
  dateFrom: string;
  dateTo: string;
  type: string;
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

const getTodayString = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const getNDaysAgoString = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const cleanQueryForSearch = (query: string): string => {
  const cleaned = query
    .replace(/\b(syrup|syp|suspension|susp|tablet|tab|tablets|tabs|capsule|cap|capsules|caps|injection|inj|drops|drop|solution)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length >= 3 ? cleaned : query;
};

// Module-level cache for instant tab re-mount (State Preservation Contract)
let cachedSearchResults: any[] | null = null;
let cachedTotalItems = 0;
let cachedTotalPages = 1;

const InvestigationCenter = () => {
  // Column-header inline filters
  const [colFilterMedicine, setColFilterMedicine] = useState('');
  const [colFilterBatch, setColFilterBatch] = useState('');
  const [colFilterDateFrom, setColFilterDateFrom] = useState(getNDaysAgoString(15));
  const [colFilterDateTo, setColFilterDateTo] = useState(getTodayString());
  const [colFilterInvoice, setColFilterInvoice] = useState('');
  const [colFilterParty, setColFilterParty] = useState('');
  const [colFilterType, setColFilterType] = useState('All');
  
  // Floating Filter states
  const [filterMinQty, setFilterMinQty] = useState('');
  const [filterMaxQty, setFilterMaxQty] = useState('');
  const [showFloatingFilters, setShowFloatingFilters] = useState(false);
  
  // Column visibility states
  const [visibleColumns, setVisibleColumns] = useState({
    medicine: true,
    batch: true,
    date: true,
    invoice: true,
    party: true,
    openingStock: true,
    purchase: true,
    sales: true,
    purchaseReturn: true,
    salesReturn: true,
    adj: true,
    stockAudit: false, // Default hidden to keep it clean, user can enable
    b2bSales: false,   // Default hidden to keep it clean, user can enable
    closingStock: true,
    medicineStock: true,
    actions: true
  });

  const [searchResults, setSearchResults] = useState<any[]>(cachedSearchResults || []);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [details, setDetails] = useState<SelectedDetails | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(!cachedSearchResults);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [totalItems, setTotalItems] = useState(cachedTotalItems || 0);
  const [totalPages, setTotalPages] = useState(cachedTotalPages || 1);

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

  // Debounced filters to avoid database request saturation
  const [debouncedFilters, setDebouncedFilters] = useState({
    medicine: '',
    batch: '',
    dateFrom: getNDaysAgoString(15),
    dateTo: getTodayString(),
    invoice: '',
    party: '',
    type: 'All'
  });

  useEffect(() => {
    // Update date and type immediately to ensure instant filtering and UI response
    setDebouncedFilters(prev => {
      if (
        prev.dateFrom !== colFilterDateFrom ||
        prev.dateTo !== colFilterDateTo ||
        prev.type !== colFilterType
      ) {
        return {
          ...prev,
          dateFrom: colFilterDateFrom,
          dateTo: colFilterDateTo,
          type: colFilterType
        };
      }
      return prev;
    });

    // Debounce text inputs by 2 seconds to prevent rapid database requests while typing
    const handler = setTimeout(() => {
      setDebouncedFilters(prev => {
        // Only update debounced state if length is 0 (cleared) or at least 3 characters
        const nextMedicine = (colFilterMedicine.length === 0 || colFilterMedicine.length >= 3) ? colFilterMedicine : prev.medicine;
        const nextBatch = (colFilterBatch.length === 0 || colFilterBatch.length >= 3) ? colFilterBatch : prev.batch;
        const nextInvoice = (colFilterInvoice.length === 0 || colFilterInvoice.length >= 3) ? colFilterInvoice : prev.invoice;
        const nextParty = (colFilterParty.length === 0 || colFilterParty.length >= 3) ? colFilterParty : prev.party;

        if (
          prev.medicine !== nextMedicine ||
          prev.batch !== nextBatch ||
          prev.invoice !== nextInvoice ||
          prev.party !== nextParty
        ) {
          return {
            ...prev,
            medicine: nextMedicine,
            batch: nextBatch,
            invoice: nextInvoice,
            party: nextParty
          };
        }
        return prev;
      });
    }, 2000);

    return () => clearTimeout(handler);
  }, [colFilterMedicine, colFilterBatch, colFilterDateFrom, colFilterDateTo, colFilterInvoice, colFilterParty, colFilterType]);

  // Reset page to 1 when filters are updated
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedFilters]);

  // Track if this is the initial mount to allow silent background hydration
  const isFirstMountRef = useRef(true);

  const runSearch = useCallback(async (signal?: AbortSignal, silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const isDateFiltered = !!(debouncedFilters.dateFrom || debouncedFilters.dateTo);
      const activeFilters = {
        page: isDateFiltered ? 1 : currentPage,
        limit: isDateFiltered ? 100000 : pageSize,
        dateFrom: debouncedFilters.dateFrom ? debouncedFilters.dateFrom : getNDaysAgoString(15),
        dateTo: debouncedFilters.dateTo ? debouncedFilters.dateTo : getTodayString(),
        type: debouncedFilters.type,
        medicineName: debouncedFilters.medicine,
        batchNo: debouncedFilters.batch,
        reference: debouncedFilters.invoice,
        party: debouncedFilters.party
      };
      const cleanFilters = Object.fromEntries(
        Object.entries(activeFilters).filter(([_, val]) => val && String(val).trim() !== '')
      );
      const response = await api.getInvestigationTimeline(cleanFilters, { signal });
      if (response && response.data) {
        setSearchResults(response.data);
        setTotalItems(response.totalItems || 0);
        setTotalPages(response.totalPages || 1);

        // Cache the results for instant tab re-mount
        cachedSearchResults = response.data;
        cachedTotalItems = response.totalItems || 0;
        cachedTotalPages = response.totalPages || 1;
      } else {
        const list = Array.isArray(response) ? response : [];
        setSearchResults(list);
        setTotalItems(list.length);
        setTotalPages(1);

        // Cache the results for instant tab re-mount
        cachedSearchResults = list;
        cachedTotalItems = list.length;
        cachedTotalPages = 1;
      }
    } catch (err: any) {
      if (err.name === 'CanceledError' || err.name === 'AbortError' || err.__CANCEL__) {
        // Quietly ignore cancelled requests in the background
        return;
      }
      showToast('Search failed. Please try again.', 'error');
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [currentPage, pageSize, debouncedFilters]);

  useEffect(() => {
    const controller = new AbortController();
    // Run silently only on the very first mount if we already have cached data
    const isSilent = isFirstMountRef.current && !!cachedSearchResults;
    isFirstMountRef.current = false;

    runSearch(controller.signal, isSilent);
    return () => {
      controller.abort();
    };
  }, [runSearch]);

  // Direct Inventory Correction logic
  const handleAdjustStock = async (inventoryId: number) => {
    setSelectedId(inventoryId);
    setDetailsLoading(true);
    setEditingType(null);
    try {
      const detailsData = await api.getInvestigationDetails(inventoryId);
      setDetails(detailsData);
      const logs = await api.getInvestigationAuditLogs(inventoryId);
      setAuditLogs(logs);

      const inv = detailsData.inventory;
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
    } catch (err) {
      showToast('Failed to fetch medicine inventory details.', 'error');
    } finally {
      setDetailsLoading(false);
    }
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
          runSearch();
        } catch (err: any) {
          showToast(err.response?.data?.error || 'Failed to update inventory', 'error');
        }
      }
    });
  };

  // Edit Sales Bill logic
  const handleStartSaleBillEdit = (item: any) => {
    setEditingBillId(item.invoice_id);
    setEditingBillNo(item.reference);
    setBillDiscount(item.discount || 0);

    setDetailsLoading(true);
    api.getSale(item.invoice_id)
      .then(invoiceDetails => {
        const mapped = invoiceDetails.items.map((it: any) => ({
          inventory_id: it.inventory_id,
          medicine_name: it.medicine_name,
          batch_no: it.batch_number,
          quantity: it.quantity,
          unit_price: it.unit_price,
          loose_qty: it.loose_qty || 0,
          original_qty: it.quantity
        }));
        setBillItems(mapped);
        setEditingType('sale');
      })
      .catch(() => showToast('Failed to fetch invoice details', 'error'))
      .finally(() => setDetailsLoading(false));
  };

  // Edit Purchase Bill logic
  const handleStartPurchaseBillEdit = (item: any) => {
    setEditingBillId(item.purchase_id);
    setEditingBillNo(item.reference);

    setDetailsLoading(true);
    api.getPurchase(item.purchase_id)
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

    const cleanQ = cleanQueryForSearch(q);

    try {
      // Fetch local medicines and Pharmarack catalog in parallel
      const localPromise = api.searchMedicine(q).catch(() => []);
      const prPromise = api.searchPharmarack(cleanQ).catch(() => []);

      const [localData, prData] = await Promise.all([localPromise, prPromise]);

      const combined: any[] = [];

      // Add local stock suggestions
      if (Array.isArray(localData)) {
        localData.forEach((item: any) => {
          combined.push({
            ...item,
            isPharmarack: false
          });
        });
      }

      // Add Pharmarack suggestions (filtering out out-of-stock items)
      if (Array.isArray(prData)) {
        prData.forEach((item: any) => {
          const isOutOfStock = ['out of stock', 'no stock', '0'].includes(String(item.stock).toLowerCase().trim());
          if (!isOutOfStock) {
            combined.push({
              medicine_name: item.name,
              mrp: item.mrp,
              rate: item.rate,
              packaging: item.packaging,
              stock: item.stock,
              scheme: item.scheme,
              productId: item.productId,
              storeId: item.storeId,
              productCode: item.productCode,
              company: item.company,
              distributor: item.distributor,
              mapped: item.mapped,
              isPharmarack: true
            });
          }
        });
      }

      setSearchMedicineResults(combined);
    } catch (err) {
      console.error('Unified search failed:', err);
    }
  };

  const handleAddMedicineToBill = async (med: any) => {
    if (med.isPharmarack) {
      if (editingType === 'sale') {
        // Sales bill requires a local inventory item to deduct stock
        const localMatch = searchMedicineResults.find(
          r => !r.isPharmarack && r.medicine_name.toLowerCase().trim() === med.medicine_name.toLowerCase().trim()
        );
        if (localMatch) {
          showToast(`Please select the local stock batch of "${med.medicine_name}" instead to correct the sale.`, 'error');
        } else {
          showToast(`This item ("${med.medicine_name}") is not in your local inventory. Sales bills must reference local stock.`, 'error');
        }
        return;
      }

      if (editingType === 'purchase') {
        // Purchase bill requires a local medicine_id. Look for a matching local medicine.
        let localMedId = null;
        const localMatch = searchMedicineResults.find(
          r => !r.isPharmarack && r.medicine_name.toLowerCase().trim() === med.medicine_name.toLowerCase().trim()
        );
        if (localMatch) {
          localMedId = localMatch.medicine_id;
        } else {
          try {
            const localData = await api.searchMedicine(med.medicine_name);
            if (localData && localData.length > 0) {
              const exact = localData.find((r: any) => r.medicine_name.toLowerCase().trim() === med.medicine_name.toLowerCase().trim());
              localMedId = exact ? exact.medicine_id : localData[0].medicine_id;
            }
          } catch (err) {}
        }

        if (!localMedId) {
          showToast(`"${med.medicine_name}" must exist in your local medicine catalog first. Please add it to your local medicines list.`, 'error');
          return;
        }

        if (billItems.some(i => i.medicine_id === localMedId && i.batch_no === (med.batch_no || 'MANUAL'))) {
          showToast('Medicine and batch already present in list', 'error');
          return;
        }

        setBillItems(prev => [
          ...prev,
          {
            medicine_id: localMedId,
            medicine_name: med.medicine_name,
            batch_no: med.batch_no || 'MANUAL',
            expiry_date: med.expiry_date || '12/28',
            quantity: 1,
            cost_price: med.rate || (med.mrp * 0.7),
            mrp: med.mrp || 0,
            free_qty: 0,
            original_qty: 0
          }
        ]);
        setSearchMedicineQuery('');
        setSearchMedicineResults([]);
        showToast(`Added ${med.medicine_name} to purchase workspace from Pharmarack catalog.`);
      }
    } else {
      // Local inventory item
      if (editingType === 'sale') {
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
    }
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
          runSearch();
        } catch (err: any) {
          showToast(err.response?.data?.error || 'Failed to save correction.', 'error');
        }
      }
    });
  };

  // Helper date formatter matching user's spreadsheet style: DD/MM/YYYY hh:mm AM/PM
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    
    const pad = (num: number) => String(num).padStart(2, '0');
    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = d.getFullYear();
    
    let hours = d.getHours();
    const minutes = pad(d.getMinutes());
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // 0 hour should be 12
    const formattedHours = pad(hours);
    
    return `${day}/${month}/${year} ${formattedHours}:${minutes} ${ampm}`;
  };

  // Formatting helpers for stock quantities
  const formatOpeningStock = (qty: number, loose: number) => `${qty || 0}::${loose || 0}`;
  const formatTxQty = (qty: number, loose: number) => {
    if (loose > 0) return `${qty || 0}::${loose}`;
    return String(qty || 0);
  };

  // Filter results on the client side based on movement quantity range
  const filteredResults = searchResults.filter(item => {
    // Determine the movement (transaction) quantity of this entry
    const txQty = (() => {
      if (item.type === 'Purchase') return item.purchase_qty || 0;
      if (item.type === 'Sale') return item.sale_qty || 0;
      if (item.type === 'Return') {
        if (item.return_type === 'purchase') return item.purchase_return_qty || 0;
        return item.sales_return_qty || 0;
      }
      if (item.type === 'Adjustment') return item.adj_qty || 0;
      return 0;
    })();

    const min = filterMinQty !== '' ? Number(filterMinQty) : 0;
    const max = filterMaxQty !== '' ? Number(filterMaxQty) : 100000000;

    if (txQty < min || txQty > max) return false;
    return true;
  });

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

      {detailsLoading && (
        <div className="absolute inset-0 z-[80] bg-black/40 backdrop-blur-xs flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 animate-pulse text-muted">
            <Clock size={32} className="animate-spin text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider">Fetching details...</span>
          </div>
        </div>
      )}

      {editingType ? (
        /* CORRECTION WORKSPACE PANEL */
        <div className="flex-1 bg-glass-bg border border-glass-border rounded-2xl flex flex-col min-h-0 overflow-hidden animate-in fade-in duration-300">
          <div className="p-4 border-b border-glass-border/30 bg-bg2/40 flex justify-between items-center shrink-0">
            <div className="flex items-center gap-2">
              <Edit size={16} className="text-primary" />
              <h2 className="text-base font-black text-text uppercase">
                {editingType === 'inventory' ? 'Inventory Direct Correction' : 
                 editingType === 'sale' ? `Correcting Sales Invoice #${editingBillNo}` : 
                 `Correcting Purchase Bill #${editingBillNo}`}
              </h2>
            </div>
            <button 
              onClick={() => setEditingType(null)} 
              className="text-xs text-muted hover:text-text font-bold bg-bg3 border border-glass-border px-3 py-1.5 rounded-xl transition-all"
            >
              Discard Workspace
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            {editingType === 'inventory' && (
              <div className="bg-bg2 border border-glass-border p-6 rounded-2xl flex flex-col gap-6 max-w-4xl mx-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
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

                <div className="flex justify-end gap-3 border-t border-glass-border/30 pt-4">
                  <button 
                    onClick={() => setEditingType(null)} 
                    className="px-4 py-2 rounded-xl bg-bg3 text-muted hover:text-text border border-glass-border transition-colors text-xs font-bold"
                  >
                    Discard
                  </button>
                  <button 
                    onClick={saveInventoryAdjustment} 
                    className="px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary/95 transition-all text-xs font-bold shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                  >
                    Save Stock Adjustments
                  </button>
                </div>
              </div>
            )}

            {(editingType === 'sale' || editingType === 'purchase') && (
              <div className="bg-bg2 border border-glass-border p-6 rounded-2xl flex flex-col gap-4 max-w-5xl mx-auto">
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
                    <div className="absolute top-full left-0 right-0 z-[100] mt-1 bg-bg2 border border-glass-border rounded-xl shadow-2xl overflow-hidden max-h-[320px] overflow-y-auto p-1.5 flex flex-col gap-1 custom-scrollbar">
                      {searchMedicineResults.map((med, idx) => {
                        if (med.isPharmarack) {
                          // Pharmarack distributor item rendering
                          const hasStock = med.stock !== undefined;
                          const isLowOrNoStock = hasStock && ['low', 'out of stock', 'no stock', '0'].includes(String(med.stock).toLowerCase().trim());
                          const isHighStock = hasStock && String(med.stock).toLowerCase().trim() === 'high';
                          const isMediumStock = hasStock && String(med.stock).toLowerCase().trim() === 'medium';
                          
                          let stockBadgeClass = 'bg-bg3 text-muted border border-glass-border';
                          if (isHighStock) {
                            stockBadgeClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                          } else if (isMediumStock) {
                            stockBadgeClass = 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
                          } else if (isLowOrNoStock) {
                            stockBadgeClass = 'bg-red-500/10 text-red-400 border border-red-500/20';
                          } else {
                            const num = parseInt(med.stock);
                            if (!isNaN(num)) {
                              if (num >= 50) {
                                stockBadgeClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
                              } else if (num >= 15) {
                                stockBadgeClass = 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
                              } else {
                                stockBadgeClass = 'bg-red-500/10 text-red-400 border border-red-500/20';
                              }
                            }
                          }

                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleAddMedicineToBill(med)}
                              className="w-full text-left p-2.5 hover:bg-primary/10 rounded-lg text-xs text-text flex items-center justify-between border border-transparent hover:border-glass-border/40 transition-all gap-3"
                            >
                              <div className="flex-1 min-w-0 pr-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-text truncate text-xs">{med.medicine_name}</span>
                                  <span className="text-[9px] bg-purple-500/15 border border-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded font-bold uppercase select-none">
                                    Pharmarack
                                  </span>
                                  {hasStock && (
                                    <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold uppercase select-none ${stockBadgeClass}`}>
                                      {med.stock} Stock
                                    </span>
                                  )}
                                  {med.scheme && (
                                    <span className="text-[8px] bg-amber-500/15 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold uppercase select-none">
                                      {med.scheme}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-muted block truncate mt-1">
                                  {med.distributor ? (
                                    <>
                                      <span className={med.mapped ? 'text-text font-semibold' : 'text-purple-400 font-semibold'}>
                                        {med.distributor}
                                      </span>
                                      <span> ({med.mapped ? 'Mapped' : 'Non-mapped'})</span>
                                    </>
                                  ) : (
                                    'No Distributor'
                                  )}
                                  {med.packaging ? ` • ${med.packaging}` : ''}
                                  {med.company ? ` • ${med.company}` : ''}
                                </span>
                              </div>
                              <div className="text-right shrink-0 flex flex-col justify-center items-end">
                                <div className="text-[11px] font-mono font-bold text-text flex flex-col items-end gap-0.5">
                                  {med.rate !== undefined && med.rate !== null && (
                                    <span className="text-emerald-400">PTR: ₹{Number(med.rate).toFixed(2)}</span>
                                  )}
                                  {med.mrp !== undefined && med.mrp !== null && (
                                    <span className="text-muted text-[9px]">MRP: ₹{Number(med.mrp).toFixed(2)}</span>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        } else {
                          // Local Stock item rendering
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => handleAddMedicineToBill(med)}
                              className="w-full text-left p-2.5 hover:bg-primary/10 rounded-lg text-xs text-text flex items-center justify-between border border-transparent hover:border-glass-border/40 transition-all gap-3"
                            >
                              <div className="flex-1 min-w-0 pr-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-text truncate text-xs">{med.medicine_name}</span>
                                  <span className="text-[9px] bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold uppercase select-none">
                                    Local Stock
                                  </span>
                                  <span className="text-[8px] bg-bg3 border border-glass-border text-muted px-1.5 py-0.5 rounded font-mono select-none">
                                    Batch: {med.batch_no || 'N/A'}
                                  </span>
                                  {med.expiry_date && (
                                    <span className="text-[8px] bg-bg3 border border-glass-border text-muted px-1.5 py-0.5 rounded font-mono select-none">
                                      Exp: {med.expiry_date}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[10px] text-muted block truncate mt-1">
                                  Local physical inventory records • {med.rack_location ? `Rack: ${med.rack_location}` : 'No rack location'}
                                </span>
                              </div>
                              <div className="text-right shrink-0 flex flex-col justify-center items-end">
                                <div className="text-[11px] font-mono font-bold text-text flex flex-col items-end gap-0.5">
                                  <span className="text-primary">Stock: {med.quantity ?? 0}</span>
                                  {med.mrp !== undefined && med.mrp !== null && (
                                    <span className="text-muted text-[9px]">MRP: ₹{Number(med.mrp).toFixed(2)}</span>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        }
                      })}
                    </div>
                  )}
                </div>

                {/* Invoice lines */}
                <div className="border border-glass-border/30 rounded-xl overflow-hidden divide-y divide-glass-border/30 max-h-80 overflow-y-auto">
                  {billItems.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted">No items in the list. Please search and add a medicine.</div>
                  ) : (
                    billItems.map((item, index) => (
                      <div key={index} className="p-3.5 bg-bg3/10 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-text truncate">{item.medicine_name}</p>
                          <p className="text-[10px] text-muted">Batch: {item.batch_no}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 shrink-0">
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
                <div className="p-4 bg-bg3/30 border border-glass-border/20 rounded-xl flex items-center justify-between text-xs font-bold">
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

                <div className="flex justify-end gap-3 border-t border-glass-border/30 pt-4 mt-2">
                  <button 
                    onClick={() => setEditingType(null)} 
                    className="px-4 py-2 rounded-xl bg-bg3 text-muted hover:text-text border border-glass-border transition-colors text-xs font-bold"
                  >
                    Discard
                  </button>
                  <button 
                    onClick={saveBillCorrections} 
                    className="px-4 py-2 rounded-xl bg-primary text-white hover:bg-primary/95 transition-all text-xs font-bold shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                  >
                    Save Bill Corrections
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* UNIFIED LEDGER SPREADSHEET TIMELINE */
        <div className="flex-1 bg-glass-bg border border-glass-border rounded-2xl flex flex-col min-h-0 overflow-hidden animate-in fade-in duration-300">
          
          {/* Range Selector and Pagination Header */}
          <div className="p-3 border-b border-glass-border/30 flex flex-wrap items-center justify-between bg-bg2/40 gap-3 shrink-0 select-none text-xs">
            <div className="flex items-center gap-2.5">
              <span className="text-muted font-bold uppercase tracking-wider text-[10px]">Range:</span>
              {!(colFilterDateFrom || colFilterDateTo || debouncedFilters.dateFrom || debouncedFilters.dateTo) ? (
                <div className="flex items-center gap-1.5 bg-bg3 border border-glass-border rounded-lg px-2 py-1">
                  <span className="text-muted">Show from row</span>
                  <input
                    type="number"
                    min="0"
                    max={Math.max(0, totalItems - 1)}
                    value={totalItems === 0 ? 0 : (currentPage - 1) * pageSize}
                    onChange={e => {
                      const val = Math.max(0, parseInt(e.target.value) || 0);
                      const newPage = Math.floor(val / pageSize) + 1;
                      setCurrentPage(Math.min(totalPages, newPage));
                    }}
                    className="w-16 bg-transparent text-center font-mono font-bold outline-none text-primary border-0 p-0 focus:ring-0 text-text"
                  />
                  <span className="text-muted">to</span>
                  <span className="text-text font-mono font-bold">
                    {totalItems === 0 ? 0 : Math.min(totalItems, currentPage * pageSize)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-bg3 border border-glass-border rounded-lg px-2.5 py-1">
                  <span className="text-muted">Showing all</span>
                  <span className="text-text font-mono font-bold">
                    {totalItems}
                  </span>
                </div>
              )}
              <span className="text-muted">
                of <strong className="text-text font-bold">{totalItems.toLocaleString()}</strong> transaction entries
              </span>
            </div>

            {!(colFilterDateFrom || colFilterDateTo || debouncedFilters.dateFrom || debouncedFilters.dateTo) && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-muted">Rows:</span>
                  <select
                    value={pageSize}
                    onChange={e => {
                      const newSize = parseInt(e.target.value);
                      setPageSize(newSize);
                      setCurrentPage(1);
                    }}
                    className="bg-bg3 border border-glass-border rounded-lg text-text px-2 py-1 outline-none focus:border-primary/50 cursor-pointer font-bold font-mono"
                  >
                    <option value="50">50 rows</option>
                    <option value="100">100 rows</option>
                    <option value="250">250 rows</option>
                    <option value="500">500 rows</option>
                  </select>
                </div>

                <div className="flex items-center gap-1 bg-bg3 border border-glass-border rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1 || loading}
                    className="p-1.5 rounded-md hover:bg-bg2/40 active:scale-95 disabled:opacity-30 disabled:pointer-events-none text-muted hover:text-text transition-all cursor-pointer"
                    title="First Page"
                  >
                    <ChevronsLeft size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1 || loading}
                    className="p-1.5 rounded-md hover:bg-bg2/40 active:scale-95 disabled:opacity-30 disabled:pointer-events-none text-muted hover:text-text transition-all flex items-center gap-1 font-bold text-[10px] uppercase tracking-wider cursor-pointer"
                    title="Previous Page"
                  >
                    <ChevronLeft size={14} /> Prev
                  </button>
                  <div className="px-3 text-muted">
                    Page <span className="font-bold text-text font-mono">{currentPage}</span> of <span className="font-bold text-text font-mono">{totalPages}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages || loading}
                    className="p-1.5 rounded-md hover:bg-bg2/40 active:scale-95 disabled:opacity-30 disabled:pointer-events-none text-muted hover:text-text transition-all flex items-center gap-1 font-bold text-[10px] uppercase tracking-wider cursor-pointer"
                    title="Next Page"
                  >
                    Next <ChevronRight size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages || loading}
                    className="p-1.5 rounded-md hover:bg-bg2/40 active:scale-95 disabled:opacity-30 disabled:pointer-events-none text-muted hover:text-text transition-all cursor-pointer"
                    title="Last Page"
                  >
                    <ChevronsRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
          


          <div className="flex-1 flex flex-col min-h-0 p-4 overflow-hidden bg-bg2/15">
            <div className="flex-1 border border-glass-border/30 rounded-xl overflow-auto bg-glass-bg custom-scrollbar min-h-0 relative">
              {/* Subtle pulsing loading progress bar at the top of the table container */}
              {loading && (
                <div className="absolute top-0 left-0 right-0 h-1 bg-primary/20 z-30 overflow-hidden">
                  <div className="h-full bg-primary animate-pulse w-full"></div>
                </div>
              )}
                <table className="w-full text-left border-collapse text-[11px] font-semibold text-text min-w-full">
                  <thead className="sticky top-0 z-20 bg-bg2 shadow-sm">
                    <tr className="bg-bg2 border-b border-glass-border/30 text-muted font-bold text-[10px] align-top">
                      {/* Medicine Header */}
                      {visibleColumns.medicine && (
                        <th className="p-2 border-r border-glass-border/20 min-w-[150px]">
                          <div className="flex flex-col gap-1">
                            <span className="uppercase text-[10px] tracking-wider text-muted font-black">Medicine</span>
                            <input
                              type="text"
                              placeholder="Filter medicine..."
                              value={colFilterMedicine}
                              onChange={e => setColFilterMedicine(e.target.value)}
                              className="w-full px-2 py-0.5 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                            />
                          </div>
                        </th>
                      )}
                      {/* Batch Header */}
                      {visibleColumns.batch && (
                        <th className="p-2 border-r border-glass-border/20 min-w-[70px]">
                          <div className="flex flex-col gap-1">
                            <span className="uppercase text-[10px] tracking-wider text-muted font-black">Batch</span>
                            <input
                              type="text"
                              placeholder="Filter batch..."
                              value={colFilterBatch}
                              onChange={e => setColFilterBatch(e.target.value)}
                              className="w-full px-2 py-0.5 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                            />
                          </div>
                        </th>
                      )}
                      {/* Date Header */}
                      {visibleColumns.date && (
                        <th className="p-2 border-r border-glass-border/20 min-w-[110px]">
                          <div className="flex flex-col gap-1">
                            <span className="uppercase text-[10px] tracking-wider text-muted font-black">Date</span>
                            <input
                              type="date"
                              value={colFilterDateFrom}
                              onChange={e => setColFilterDateFrom(e.target.value)}
                              className="w-full px-1.5 py-0.5 bg-bg3 border border-glass-border rounded text-[9px] text-text font-normal focus:outline-none focus:border-primary/50"
                              title="From Date"
                            />
                            <input
                              type="date"
                              value={colFilterDateTo}
                              onChange={e => setColFilterDateTo(e.target.value)}
                              className="w-full px-1.5 py-0.5 bg-bg3 border border-glass-border rounded text-[9px] text-text font-normal focus:outline-none focus:border-primary/50"
                              title="To Date"
                            />
                          </div>
                        </th>
                      )}
                      {/* Invoice Header */}
                      {visibleColumns.invoice && (
                        <th className="p-2 border-r border-glass-border/20 min-w-[80px]">
                          <div className="flex flex-col gap-1">
                            <span className="uppercase text-[10px] tracking-wider text-muted font-black">Invoice</span>
                            <input
                              type="text"
                              placeholder="Filter invoice..."
                              value={colFilterInvoice}
                              onChange={e => setColFilterInvoice(e.target.value)}
                              className="w-full px-2 py-0.5 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                            />
                          </div>
                        </th>
                      )}
                      {/* Party Header */}
                      {visibleColumns.party && (
                        <th className="p-2 border-r border-glass-border/20 min-w-[90px]">
                          <div className="flex flex-col gap-1">
                            <span className="uppercase text-[10px] tracking-wider text-muted font-black">Party</span>
                            <input
                              type="text"
                              placeholder="Filter party..."
                              value={colFilterParty}
                              onChange={e => setColFilterParty(e.target.value)}
                              className="w-full px-2 py-0.5 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                            />
                          </div>
                        </th>
                      )}
                      {/* Opening Stock Header (with Type Selector) */}
                      {visibleColumns.openingStock && (
                        <th className="p-2 border-r border-glass-border/20 text-center min-w-[90px]">
                          <div className="flex flex-col gap-1 items-center">
                            <span className="uppercase text-[10px] tracking-wider text-muted font-black">Opening Stock</span>
                            <select
                              value={colFilterType}
                              onChange={e => setColFilterType(e.target.value)}
                              className="w-full px-1.5 py-0.5 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal focus:outline-none focus:border-primary/50"
                            >
                              <option value="All">All Types</option>
                              <option value="Purchase">Purchases</option>
                              <option value="Sale">Sales</option>
                              <option value="Return">Returns</option>
                              <option value="Adjustment">Adjustments</option>
                            </select>
                          </div>
                        </th>
                      )}
                      {/* Static Columns without any placeholders */}
                      {visibleColumns.purchase && (
                        <th className="p-2 border-r border-glass-border/20 text-center min-w-[60px] uppercase text-[10px] tracking-wider text-muted font-black">
                          Purchase
                        </th>
                      )}
                      {visibleColumns.sales && (
                        <th className="p-2 border-r border-glass-border/20 text-center min-w-[60px] uppercase text-[10px] tracking-wider text-muted font-black">
                          Sales
                        </th>
                      )}
                      {visibleColumns.purchaseReturn && (
                        <th className="p-2 border-r border-glass-border/20 text-center min-w-[80px] uppercase text-[10px] tracking-wider text-muted font-black">
                          Purchase Return
                        </th>
                      )}
                      {visibleColumns.salesReturn && (
                        <th className="p-2 border-r border-glass-border/20 text-center min-w-[80px] uppercase text-[10px] tracking-wider text-muted font-black">
                          Sales Return
                        </th>
                      )}
                      {visibleColumns.adj && (
                        <th className="p-2 border-r border-glass-border/20 text-center min-w-[45px] uppercase text-[10px] tracking-wider text-muted font-black">
                          Adj
                        </th>
                      )}
                      {visibleColumns.stockAudit && (
                        <th className="p-2 border-r border-glass-border/20 text-center min-w-[70px] uppercase text-[10px] tracking-wider text-muted font-black">
                          Stock Audit
                        </th>
                      )}
                      {visibleColumns.b2bSales && (
                        <th className="p-2 border-r border-glass-border/20 text-center min-w-[75px] uppercase text-[10px] tracking-wider text-muted font-black">
                          B2B Sales
                        </th>
                      )}
                      {visibleColumns.closingStock && (
                        <th className="p-2 border-r border-glass-border/20 text-center min-w-[80px] uppercase text-[10px] tracking-wider text-muted font-black">
                          Closing Stock
                        </th>
                      )}
                      {visibleColumns.medicineStock && (
                        <th className="p-2 border-r border-glass-border/20 text-center min-w-[85px] uppercase text-[10px] tracking-wider text-muted font-black">
                          Medicine Stock
                        </th>
                      )}
                      {/* Actions Header with Reset button */}
                      {visibleColumns.actions && (
                        <th className="p-2 text-center min-w-[70px]">
                          <div className="flex flex-col gap-1 items-center justify-center">
                            <span className="uppercase text-[10px] tracking-wider text-muted font-black">Actions</span>
                            {(colFilterMedicine || colFilterBatch || colFilterInvoice || colFilterParty || colFilterType !== 'All' || colFilterDateFrom !== getNDaysAgoString(15) || colFilterDateTo !== getTodayString() || filterMinQty !== '' || filterMaxQty !== '') && (
                              <button
                                onClick={() => {
                                  setColFilterMedicine('');
                                  setColFilterBatch('');
                                  setColFilterDateFrom(getNDaysAgoString(15));
                                  setColFilterDateTo(getTodayString());
                                  setColFilterInvoice('');
                                  setColFilterParty('');
                                  setColFilterType('All');
                                  setFilterMinQty('');
                                  setFilterMaxQty('');
                                }}
                                className="px-2 py-0.5 rounded bg-red/15 border border-red/30 text-red-400 hover:bg-red hover:text-white transition-all text-[9px] font-extrabold cursor-pointer"
                                title="Clear Filters"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-glass-border/20">
                    {loading && filteredResults.length === 0 ? (
                      <tr>
                        <td colSpan={Object.values(visibleColumns).filter(Boolean).length} className="p-12 text-center text-muted">
                          <div className="flex flex-col items-center justify-center text-center p-6 animate-pulse">
                            <Clock size={32} className="animate-spin text-primary mb-3" />
                            <h3 className="font-bold text-xs text-text uppercase tracking-wider">Loading Stock Ledger...</h3>
                            <p className="text-[11px] max-w-sm mt-1 leading-relaxed">Fetching transaction timeline records from database.</p>
                          </div>
                        </td>
                      </tr>
                    ) : filteredResults.length === 0 ? (
                      <tr>
                        <td colSpan={Object.values(visibleColumns).filter(Boolean).length} className="p-12 text-center text-muted">
                          <div className="flex flex-col items-center justify-center text-center p-6">
                            <Package size={44} className="opacity-20 mb-3" />
                            <h3 className="font-bold text-xs text-text">No ledger entries matches filters</h3>
                            <p className="text-[11px] max-w-sm mt-1 leading-relaxed">Try adjusting the calendar dates, global search query keywords, or quantity ranges.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredResults.map((item, index) => (
                      <tr 
                        key={index} 
                        className="odd:bg-bg3/20 even:bg-transparent hover:bg-primary/5 transition-colors"
                      >
                        {/* Medicine */}
                        {visibleColumns.medicine && (
                          <td className="px-2 py-1.5 border-r border-glass-border/20 text-text" title={item.medicine_name}>
                            <div className="truncate max-w-[150px]">
                              {item.medicine_name || 'System Activity'}
                            </div>
                          </td>
                        )}
                        
                        {/* Batch */}
                        {visibleColumns.batch && (
                          <td className="px-2 py-1.5 border-r border-glass-border/20 font-mono font-bold text-muted">
                            {item.batch_no || 'N/A'}
                          </td>
                        )}

                        {/* Date */}
                        {visibleColumns.date && (
                          <td className="px-2 py-1.5 border-r border-glass-border/20 font-mono whitespace-nowrap text-muted">
                            {formatDate(item.date)}
                          </td>
                        )}

                        {/* Invoice Link */}
                        {visibleColumns.invoice && (
                          <td className="px-2 py-1.5 border-r border-glass-border/20">
                            {item.invoice_id || item.purchase_id ? (
                              <button 
                                onClick={() => {
                                    if (item.type === 'Sale') handleStartSaleBillEdit(item);
                                    if (item.type === 'Purchase') handleStartPurchaseBillEdit(item);
                                }}
                                className="text-primary hover:underline font-bold text-left cursor-pointer underline decoration-dotted"
                              >
                                {item.reference}
                              </button>
                            ) : (
                              <span className="text-muted">{item.reference}</span>
                            )}
                          </td>
                        )}

                        {/* Party */}
                        {visibleColumns.party && (
                          <td className="px-2 py-1.5 border-r border-glass-border/20">
                            <div className="truncate max-w-[120px]">
                              {item.party}
                            </div>
                          </td>
                        )}

                        {/* Opening Stock */}
                        {visibleColumns.openingStock && (
                          <td className="px-2 py-1.5 border-r border-glass-border/20 text-center font-mono text-muted">
                            {formatOpeningStock(item.opening_qty, item.opening_loose)}
                          </td>
                        )}

                        {/* Purchase */}
                        {visibleColumns.purchase && (
                          <td className="px-2 py-1.5 border-r border-glass-border/20 text-center font-mono text-green-400">
                            {item.type === 'Purchase' ? formatTxQty(item.purchase_qty, item.free_qty || 0) : '0'}
                          </td>
                        )}

                        {/* Sales */}
                        {visibleColumns.sales && (
                          <td className="px-2 py-1.5 border-r border-glass-border/20 text-center font-mono text-sky-400">
                            {item.type === 'Sale' ? formatTxQty(item.sale_qty, item.sale_loose) : '0'}
                          </td>
                        )}

                        {/* Purchase Return */}
                        {visibleColumns.purchaseReturn && (
                          <td className="px-2 py-1.5 border-r border-glass-border/20 text-center font-mono text-orange-400">
                            {(item.type === 'Return' && item.return_type === 'purchase') ? formatTxQty(item.purchase_return_qty, 0) : '0'}
                          </td>
                        )}

                        {/* Sales Return */}
                        {visibleColumns.salesReturn && (
                          <td className="px-2 py-1.5 border-r border-glass-border/20 text-center font-mono text-purple-400">
                            {(item.type === 'Return' && item.return_type === 'sale') ? formatTxQty(item.sales_return_qty, 0) : '0'}
                          </td>
                        )}

                        {/* Adj */}
                        {visibleColumns.adj && (
                          <td className="px-2 py-1.5 border-r border-glass-border/20 text-center font-mono text-amber-500">
                            {item.type === 'Adjustment' ? formatTxQty(item.adj_qty, item.adj_loose) : '0'}
                          </td>
                        )}

                        {/* Stock Audit */}
                        {visibleColumns.stockAudit && (
                          <td className="px-2 py-1.5 border-r border-glass-border/20 text-center font-mono text-muted/50">
                            0
                          </td>
                        )}

                        {/* B2B Sales */}
                        {visibleColumns.b2bSales && (
                          <td className="px-2 py-1.5 border-r border-glass-border/20 text-center font-mono text-muted/50">
                            0
                          </td>
                        )}

                        {/* Closing Stock */}
                        {visibleColumns.closingStock && (
                          <td className="px-2 py-1.5 border-r border-glass-border/20 text-center font-mono font-bold text-text">
                            {formatTxQty(item.closing_qty, item.closing_loose)}
                          </td>
                        )}

                        {/* Medicine Stock */}
                        {visibleColumns.medicineStock && (
                          <td className="px-2 py-1.5 border-r border-glass-border/20 text-center font-mono font-bold text-text/80">
                            {formatTxQty(item.medicine_stock_qty, item.medicine_stock_loose)}
                          </td>
                        )}

                        {/* Actions */}
                        {visibleColumns.actions && (
                          <td className="px-1.5 py-1 text-center">
                            {item.inventory_id ? (
                              <button
                                onClick={() => handleAdjustStock(item.inventory_id)}
                                className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500 hover:text-white text-amber-500 transition-all text-[10px] font-extrabold cursor-pointer"
                                title="Direct Stock Master Adjustment"
                              >
                                Adjust
                              </button>
                            ) : (
                              <span className="text-[10px] text-muted/40 font-medium">N/A</span>
                            )}
                          </td>
                        )}
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            </div>
        </div>
      )}

      {/* Floating Filter Button and Panel */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        {showFloatingFilters && (
          <div className="bg-bg2 border border-glass-border p-4 rounded-2xl shadow-2xl w-80 flex flex-col gap-4 mb-3 animate-in slide-in-from-bottom-5 duration-300">
            <div className="flex items-center justify-between border-b border-glass-border/30 pb-2">
              <div className="flex items-center gap-1.5 font-bold text-text">
                <SlidersHorizontal size={14} className="text-primary" />
                <span>Ledger Filters</span>
              </div>
              <button 
                onClick={() => {
                  setColFilterMedicine('');
                  setColFilterBatch('');
                  setColFilterDateFrom(getNDaysAgoString(15));
                  setColFilterDateTo(getTodayString());
                  setColFilterInvoice('');
                  setColFilterParty('');
                  setColFilterType('All');
                  setFilterMinQty('');
                  setFilterMaxQty('');
                }}
                className="text-[10px] text-red hover:underline font-bold"
              >
                Reset All
              </button>
            </div>
            
            <div className="flex flex-col gap-3 text-xs max-h-[65vh] overflow-y-auto pr-1 custom-scrollbar">
              {/* Medicine & Batch */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-muted uppercase">Medicine</label>
                  <input 
                    type="text" 
                    placeholder="Filter medicine..."
                    value={colFilterMedicine}
                    onChange={e => setColFilterMedicine(e.target.value)}
                    className="bg-bg3 border border-glass-border rounded-lg px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-muted uppercase">Batch</label>
                  <input 
                    type="text" 
                    placeholder="Filter batch..."
                    value={colFilterBatch}
                    onChange={e => setColFilterBatch(e.target.value)}
                    className="bg-bg3 border border-glass-border rounded-lg px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>

              {/* Invoice & Party */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-muted uppercase">Invoice</label>
                  <input 
                    type="text" 
                    placeholder="Filter invoice..."
                    value={colFilterInvoice}
                    onChange={e => setColFilterInvoice(e.target.value)}
                    className="bg-bg3 border border-glass-border rounded-lg px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-muted uppercase">Party</label>
                  <input 
                    type="text" 
                    placeholder="Filter party..."
                    value={colFilterParty}
                    onChange={e => setColFilterParty(e.target.value)}
                    className="bg-bg3 border border-glass-border rounded-lg px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>

              {/* Date Range */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-muted uppercase">Date Range</label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-muted">From</span>
                    <input 
                      type="date" 
                      value={colFilterDateFrom}
                      onChange={e => setColFilterDateFrom(e.target.value)}
                      className="bg-bg3 border border-glass-border rounded-lg px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-muted">To</span>
                    <input 
                      type="date" 
                      value={colFilterDateTo}
                      onChange={e => setColFilterDateTo(e.target.value)}
                      className="bg-bg3 border border-glass-border rounded-lg px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-primary/50"
                    />
                  </div>
                </div>
              </div>

              {/* Qty Range */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-muted uppercase">Movement Qty Range</label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-muted">Min Qty</span>
                    <input 
                      type="number" 
                      placeholder="0"
                      min="0"
                      value={filterMinQty}
                      onChange={e => setFilterMinQty(e.target.value)}
                      className="bg-bg3 border border-glass-border rounded-lg px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-primary/50"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-muted">Max Qty</span>
                    <input 
                      type="number" 
                      placeholder="10000000"
                      min="0"
                      value={filterMaxQty}
                      onChange={e => setFilterMaxQty(e.target.value)}
                      className="bg-bg3 border border-glass-border rounded-lg px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-primary/50"
                    />
                  </div>
                </div>
              </div>

              {/* Transaction Type */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-muted uppercase">Transaction Type</label>
                <select
                  value={colFilterType}
                  onChange={e => setColFilterType(e.target.value)}
                  className="w-full bg-bg3 border border-glass-border rounded-lg px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-primary/50 cursor-pointer font-bold"
                >
                  <option value="All">All Types</option>
                  <option value="Purchase">Purchases</option>
                  <option value="Sale">Sales</option>
                  <option value="Return">Returns</option>
                  <option value="Adjustment">Adjustments</option>
                </select>
              </div>
              {/* Column Visibility */}
              <div className="flex flex-col gap-1.5 border-t border-glass-border/30 pt-3">
                <label className="text-[10px] font-bold text-muted uppercase">Column Visibility</label>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px] text-text font-semibold">
                  {Object.keys(visibleColumns).map((colKey) => (
                    <label key={colKey} className="flex items-center gap-1.5 cursor-pointer select-none hover:text-primary transition-colors">
                      <input
                        type="checkbox"
                        checked={visibleColumns[colKey as keyof typeof visibleColumns]}
                        onChange={e => setVisibleColumns(prev => ({ ...prev, [colKey]: e.target.checked }))}
                        className="rounded border-glass-border bg-bg3 text-primary focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span className="capitalize">{colKey.replace(/([A-Z])/g, ' $1').trim()}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <button 
              onClick={() => setShowFloatingFilters(false)}
              className="w-full py-2 bg-primary hover:bg-primary/95 text-white text-xs font-bold rounded-xl shadow-md transition-all"
            >
              Apply Filters
            </button>
          </div>
        )}

        {/* FAB Button */}
        <button
          onClick={() => setShowFloatingFilters(!showFloatingFilters)}
          className={`p-3.5 rounded-full shadow-2xl transition-all duration-300 flex items-center justify-center relative hover:scale-105 active:scale-95 border
            ${showFloatingFilters 
              ? 'bg-primary border-primary text-white shadow-[0_0_20px_rgba(59,130,246,0.4)]' 
              : 'bg-bg2 border-glass-border text-text hover:text-primary shadow-black/40'}`}
          title="Toggle Filters"
        >
          <SlidersHorizontal size={18} />
          {/* Active Filter Counter Badge */}
          {((colFilterMedicine || colFilterBatch || colFilterDateFrom || colFilterDateTo || colFilterInvoice || colFilterParty || colFilterType !== 'All' || filterMinQty || filterMaxQty) ? 1 : 0) > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red text-white rounded-full text-[10px] font-black flex items-center justify-center border border-bg2 animate-in zoom-in duration-300">
              {Number(colFilterMedicine ? 1 : 0) +
               Number(colFilterBatch ? 1 : 0) +
               Number(colFilterDateFrom ? 1 : 0) +
               Number(colFilterDateTo ? 1 : 0) +
               Number(colFilterInvoice ? 1 : 0) +
               Number(colFilterParty ? 1 : 0) +
               Number(colFilterType !== 'All' ? 1 : 0) +
               Number(filterMinQty ? 1 : 0) +
               Number(filterMaxQty ? 1 : 0)}
            </span>
          )}
        </button>
      </div>

      {showFloatingFilters && (
        <div 
          className="fixed inset-0 z-40 bg-black/5" 
          onClick={() => setShowFloatingFilters(false)}
        />
      )}
    </div>
  );
};

export default InvestigationCenter;
