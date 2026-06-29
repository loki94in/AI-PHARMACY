import { useState, useEffect, useCallback, Fragment, useRef } from 'react';
import { Edit3, Trash2, X, User, FileText, Save, AlertTriangle, BookOpen, RefreshCw, ShieldAlert, Factory, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, SlidersHorizontal, Calendar, Search, Hash } from 'lucide-react';
import { createPortal } from 'react-dom';
import { UniversalMedicineEditModal } from '../../components/UniversalMedicineEditModal';
import { api } from '../../services/api';
import { toastEvent } from '../../services/events';

interface SaleItem {
  id: number;
  invoice_id: number;
  inventory_id: number;
  medicine_id?: number;
  quantity: number;
  unit_price: number;
  loose_qty?: number;
  pack_size?: number;
  batch_number?: string;
  expiry_date?: string;
  medicine_name?: string;
  mrp?: number;
  discount_per?: number;
}

interface SaleInvoice {
  id: number;
  invoice_no: string;
  date: string;
  total_amount: number;
  tax_amount: number;
  payment_medium?: string;
  payment_status?: string;
  roff?: number;
  cgst_value?: number;
  sgst_value?: number;
  igst_value?: number;
  customer_name?: string;
  customer_phone?: string;
  doctor_name?: string;
  discount?: number;
  subtotal?: number;
  items?: SaleItem[];
}

const getTodayString = () => {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
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

// Module-level cache for instant re-mount
let cachedInvoices: SaleInvoice[] | null = null;

const Sells = () => {
  const [invoices, setInvoices] = useState<SaleInvoice[]>(cachedInvoices || []);
  const [loading, setLoading] = useState(!cachedInvoices);
  const [colFilterNo, setColFilterNo] = useState('');
  const [colFilterName, setColFilterName] = useState('');
  const [colFilterStartDate, setColFilterStartDate] = useState('');
  const [colFilterEndDate, setColFilterEndDate] = useState('');
  const [colFilterDrName, setColFilterDrName] = useState('');
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  const setQuickDateRange = (preset: 'today' | 'yesterday' | '7days' | '30days' | 'clear') => {
    if (preset === 'today') {
      const today = getTodayString();
      setColFilterStartDate(today);
      setColFilterEndDate(today);
    } else if (preset === 'yesterday') {
      const yesterday = getNDaysAgoString(1);
      setColFilterStartDate(yesterday);
      setColFilterEndDate(yesterday);
    } else if (preset === '7days') {
      setColFilterStartDate(getNDaysAgoString(7));
      setColFilterEndDate(getTodayString());
    } else if (preset === '30days') {
      setColFilterStartDate(getNDaysAgoString(30));
      setColFilterEndDate(getTodayString());
    } else if (preset === 'clear') {
      setColFilterStartDate('');
      setColFilterEndDate('');
    }
  };

  // Debounced filters to avoid database request saturation
  const [debouncedFilters, setDebouncedFilters] = useState({
    invoiceNo: '',
    customerName: '',
    startDate: '',
    endDate: '',
    doctorName: ''
  });

  useEffect(() => {
    // Update date immediately to ensure instant filtering and UI response
    setDebouncedFilters(prev => {
      if (
        prev.startDate !== colFilterStartDate ||
        prev.endDate !== colFilterEndDate
      ) {
        return {
          ...prev,
          startDate: colFilterStartDate,
          endDate: colFilterEndDate
        };
      }
      return prev;
    });

    // Debounce text and numeric inputs by 2 seconds to prevent rapid database requests while typing
    const handler = setTimeout(() => {
      setDebouncedFilters(prev => {
        // Only update debounced state if length is 0 (cleared) or at least 3 characters for text
        const nextInvoiceNo = (colFilterNo.length === 0 || colFilterNo.length >= 3) ? colFilterNo : prev.invoiceNo;
        const nextCustomerName = (colFilterName.length === 0 || colFilterName.length >= 3) ? colFilterName : prev.customerName;
        const nextDoctorName = (colFilterDrName.length === 0 || colFilterDrName.length >= 3) ? colFilterDrName : prev.doctorName;

        if (
          prev.invoiceNo !== nextInvoiceNo ||
          prev.customerName !== nextCustomerName ||
          prev.doctorName !== nextDoctorName
        ) {
          return {
            ...prev,
            invoiceNo: nextInvoiceNo,
            customerName: nextCustomerName,
            doctorName: nextDoctorName
          };
        }
        return prev;
      });
    }, 2000);

    return () => clearTimeout(handler);
  }, [colFilterNo, colFilterName, colFilterStartDate, colFilterEndDate, colFilterDrName]);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedFilters]);

  // Edit modal state
  const [editInvoice, setEditInvoice] = useState<SaleInvoice | null>(null);
  const [viewInvoice, setViewInvoice] = useState<SaleInvoice | null>(null);
  const [editItems, setEditItems] = useState<SaleItem[]>([]);
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editDiscount, setEditDiscount] = useState(0);
  const [editPaymentMedium, setEditPaymentMedium] = useState('CASH');
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  // OpenFDA Enrichment Drawer State
  const [selectedEnrichedItem, setSelectedEnrichedItem] = useState<{ medicine_name: string; batch?: string } | null>(null);
  const [enrichedData, setEnrichedData] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  // Universal Edit state
  const [universalEditMedicineId, setUniversalEditMedicineId] = useState<number | null>(null);

  const handleOpenEnrichment = async (item: SaleItem) => {
    if (!item.medicine_id) {
      toastEvent.trigger('Medicine profile not available', 'error');
      return;
    }
    setSelectedEnrichedItem({ medicine_name: item.medicine_name || 'Unknown', batch: item.batch_number });
    setPanelOpen(true);
    setDetailsLoading(true);
    try {
      const data = await api.getEnrichedMedicine(item.medicine_id);
      setEnrichedData(data);
    } catch (err) {
      console.error('Failed to load enriched details:', err);
      toastEvent.trigger('Failed to load medical profile', 'error');
      setPanelOpen(false);
    } finally {
      setDetailsLoading(false);
    }
  };

  const isInitial = useRef(true);

  const fetchInvoices = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // ponytail: only filter by date if debouncedFilters.startDate or debouncedFilters.endDate is selected. If empty, load latest invoices across all dates.
      const params: { limit: number; date_from?: string; date_to?: string; search?: string } = { limit: 500 };
      if (debouncedFilters.startDate) {
        params.date_from = debouncedFilters.startDate;
      }
      if (debouncedFilters.endDate) {
        params.date_to = debouncedFilters.endDate;
      }
      const searchVal = debouncedFilters.customerName || debouncedFilters.invoiceNo;
      if (searchVal) {
        params.search = searchVal;
      }
      const data = await api.listSales(params);
      const invoicesList = Array.isArray(data) ? data : (data && Array.isArray(data.invoices) ? data.invoices : []);
      cachedInvoices = invoicesList;
      setInvoices(invoicesList);
    } catch (err) {
      console.error('Failed to load sales:', err);
      toastEvent.trigger('Failed to load sales', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [debouncedFilters.startDate, debouncedFilters.endDate, debouncedFilters.invoiceNo, debouncedFilters.customerName]);

  // Handle mount fetch
  useEffect(() => {
    fetchInvoices(!!cachedInvoices);
  }, []);

  // Handle filter changes that query the server (skip initial mount)
  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    fetchInvoices(false);
  }, [debouncedFilters.startDate, debouncedFilters.endDate, debouncedFilters.invoiceNo, debouncedFilters.customerName]);

  const openView = async (invoice: SaleInvoice) => {
    try {
      const full = await api.getSale(invoice.id);
      setViewInvoice(full);
    } catch (err) {
      toastEvent.trigger('Failed to load invoice details', 'error');
    }
  };

  const openEdit = async (invoice: SaleInvoice) => {
    try {
      const full = await api.getSale(invoice.id);
      setViewInvoice(null);
      setEditInvoice(full);
      setEditItems(full.items || []);
      setEditCustomerName(full.customer_name || '');
      setEditCustomerPhone(full.customer_phone || '');
      setEditPaymentMedium(full.payment_medium || 'CASH');
      
      const sub = full.subtotal || (full.items || []).reduce((sum: number, item: any) => {
        const packSize = item.pack_size || 10;
        const looseQty = item.loose_qty || 0;
        const discPer = item.discount_per || 0;
        const discountedPrice = item.unit_price * (1 - discPer / 100);
        return sum + (discountedPrice * item.quantity) + ((discountedPrice / packSize) * looseQty);
      }, 0);
      const disc = full.discount || Math.max(0, sub - (full.total_amount || 0));
      setEditDiscount(disc);
    } catch (err) {
      toastEvent.trigger('Failed to load invoice details', 'error');
    }
  };

  const handleSaveEdit = async () => {
    if (!editInvoice) return;
    setSaving(true);
    try {
      await api.updateSale(editInvoice.id, {
        items: editItems.map(item => ({
          inventory_id: item.inventory_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          loose_qty: item.loose_qty || 0,
          discount_per: item.discount_per || 0,
        })),
        patient_name: editCustomerName,
        patient_phone: editCustomerPhone,
        discount: editDiscount,
        paymentMedium: editPaymentMedium,
      });
      toastEvent.trigger('Invoice updated successfully', 'success');
      setEditInvoice(null);
      fetchInvoices(true);
    } catch (err) {
      toastEvent.trigger('Failed to update invoice', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteSale(id);
      toastEvent.trigger('Invoice deleted, stock restored', 'success');
      setDeleteConfirm(null);
      fetchInvoices(true);
    } catch (err) {
      toastEvent.trigger('Failed to delete invoice', 'error');
    }
  };

  const updateItemQty = (index: number, qty: number) => {
    setEditItems(prev => prev.map((item, i) => i === index ? { ...item, quantity: Math.max(0, qty) } : item));
  };

  const updateItemPrice = (index: number, price: number) => {
    setEditItems(prev => prev.map((item, i) => i === index ? { ...item, unit_price: price } : item));
  };

  const updateItemLooseQty = (index: number, looseQty: number) => {
    setEditItems(prev => prev.map((item, i) => i === index ? { ...item, loose_qty: Math.max(0, looseQty) } : item));
  };

  const updateItemMrp = (index: number, mrp: number) => {
    const newItems = [...editItems];
    newItems[index].mrp = mrp;
    setEditItems(newItems);
  };

  const updateItemDiscountPer = (index: number, discPer: number) => {
    const newItems = [...editItems];
    newItems[index].discount_per = Math.min(100, Math.max(0, discPer));
    setEditItems(newItems);
  };

  const removeItem = (index: number) => {
    setEditItems(prev => prev.filter((_, i) => i !== index));
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return d;
    }
  };

  const filteredInvoices = invoices.filter(inv => {
    const total = Number(inv.total_amount) || 0;

    // Column header filters using debounced values
    if (debouncedFilters.invoiceNo && !inv.invoice_no.toLowerCase().includes(debouncedFilters.invoiceNo.toLowerCase())) {
      return false;
    }
    if (debouncedFilters.customerName) {
      const nameMatch = (inv.customer_name || 'Walk-in').toLowerCase().includes(debouncedFilters.customerName.toLowerCase());
      const phoneMatch = (inv.customer_phone || '').includes(debouncedFilters.customerName);
      if (!nameMatch && !phoneMatch) return false;
    }
    if (debouncedFilters.startDate || debouncedFilters.endDate) {
      const invDate = inv.date ? inv.date.substring(0, 10) : '';
      if (debouncedFilters.startDate && invDate < debouncedFilters.startDate) return false;
      if (debouncedFilters.endDate && invDate > debouncedFilters.endDate) return false;
    }
    if (debouncedFilters.doctorName && !((inv.doctor_name || '').toLowerCase().includes(debouncedFilters.doctorName.toLowerCase()))) {
      return false;
    }

    return true;
  });

  const isDateFiltered = !!(colFilterStartDate || colFilterEndDate || debouncedFilters.startDate || debouncedFilters.endDate);
  const totalPages = Math.ceil(filteredInvoices.length / pageSize);
  const paginatedInvoices = isDateFiltered ? filteredInvoices : filteredInvoices.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const activeFiltersCount = [colFilterNo, colFilterName, colFilterStartDate, colFilterEndDate, colFilterDrName].filter(Boolean).length;

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden relative">

      {/* Invoices Table */}
      <div className="flex-1 bg-glass-bg border border-glass-border rounded-2xl flex flex-col min-h-0 overflow-hidden relative animate-in fade-in duration-300">
        
        {/* Range Selector and Pagination Header */}
        <div className="p-3 border-b border-glass-border/30 flex flex-wrap items-center justify-between bg-bg2/40 gap-3 shrink-0 select-none text-xs">
          <div className="flex items-center gap-2.5">
            <span className="text-muted font-bold uppercase tracking-wider text-[10px]">Range:</span>
            {!isDateFiltered ? (
              <div className="flex items-center gap-1.5 bg-bg3 border border-glass-border rounded-lg px-2 py-1">
                <span className="text-muted">Show from row</span>
                <input
                  type="number"
                  min="0"
                  max={Math.max(0, filteredInvoices.length - 1)}
                  value={filteredInvoices.length === 0 ? 0 : (currentPage - 1) * pageSize}
                  onChange={e => {
                    const val = Math.max(0, parseInt(e.target.value) || 0);
                    const newPage = Math.floor(val / pageSize) + 1;
                    setCurrentPage(Math.min(totalPages, newPage));
                  }}
                  className="w-16 bg-transparent text-center font-mono font-bold outline-none text-primary border-0 p-0 focus:ring-0 text-text"
                />
                <span className="text-muted">to</span>
                <span className="text-text font-mono font-bold">
                  {filteredInvoices.length === 0 ? 0 : Math.min(filteredInvoices.length, currentPage * pageSize)}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-bg3 border border-glass-border rounded-lg px-2.5 py-1">
                <span className="text-muted">Showing all</span>
                <span className="text-text font-mono font-bold">
                  {filteredInvoices.length}
                </span>
              </div>
            )}
            <span className="text-muted">
              of <strong className="text-text font-bold">{filteredInvoices.length.toLocaleString()}</strong> invoices
            </span>
          </div>

          {!isDateFiltered && (
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
                  <option value="15">15 rows</option>
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

        <div className="flex-1 flex flex-col min-h-0 p-4 overflow-hidden bg-bg2/15 gap-3">
          {/* Active Filter Pills */}
          {activeFiltersCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-bg3/20 border border-glass-border/40 rounded-xl text-xs shrink-0 select-none animate-in fade-in duration-200">
              <span className="text-muted font-bold uppercase text-[9px] tracking-wider mr-1">Active Filters:</span>
              {colFilterNo && (
                <span className="inline-flex items-center gap-1 bg-primary/10 border border-primary/25 text-primary px-2.5 py-0.5 rounded-full font-mono text-[10px]">
                  No: {colFilterNo}
                  <button onClick={() => setColFilterNo('')} className="hover:text-red transition-colors cursor-pointer ml-0.5" title="Clear Invoice filter">
                    <X size={10} />
                  </button>
                </span>
              )}
              {colFilterName && (
                <span className="inline-flex items-center gap-1 bg-primary/10 border border-primary/25 text-primary px-2.5 py-0.5 rounded-full text-[10px]">
                  Patient: {colFilterName}
                  <button onClick={() => setColFilterName('')} className="hover:text-red transition-colors cursor-pointer ml-0.5" title="Clear Patient filter">
                    <X size={10} />
                  </button>
                </span>
              )}
              {(colFilterStartDate || colFilterEndDate) && (
                <span className="inline-flex items-center gap-1 bg-primary/10 border border-primary/25 text-primary px-2.5 py-0.5 rounded-full text-[10px]">
                  Date: {colFilterStartDate || 'Any'} to {colFilterEndDate || 'Any'}
                  <button 
                    onClick={() => {
                      setColFilterStartDate('');
                      setColFilterEndDate('');
                    }} 
                    className="hover:text-red transition-colors cursor-pointer ml-0.5"
                    title="Clear Date filter"
                  >
                    <X size={10} />
                  </button>
                </span>
              )}
              {colFilterDrName && (
                <span className="inline-flex items-center gap-1 bg-primary/10 border border-primary/25 text-primary px-2.5 py-0.5 rounded-full text-[10px]">
                  Dr: {colFilterDrName}
                  <button onClick={() => setColFilterDrName('')} className="hover:text-red transition-colors cursor-pointer ml-0.5" title="Clear Doctor filter">
                    <X size={10} />
                  </button>
                </span>
              )}
              <button
                onClick={() => {
                  setColFilterNo('');
                  setColFilterName('');
                  setColFilterStartDate('');
                  setColFilterEndDate('');
                  setColFilterDrName('');
                }}
                className="text-[10px] text-red hover:underline font-bold transition-all ml-2 cursor-pointer"
              >
                Clear All
              </button>
            </div>
          )}

          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted">
              <div className="animate-pulse">Loading invoices...</div>
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted">
              <FileText size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold">No invoices found</p>
              <p className="text-xs mt-1">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="flex-1 border border-glass-border/30 rounded-xl overflow-auto bg-glass-bg custom-scrollbar min-h-0 relative">
              <table className="w-full text-left border-collapse text-[11px] font-semibold text-text min-w-full">
                <thead className="sticky top-0 z-20 bg-bg2 shadow-sm">
                  <tr className="bg-bg2 border-b border-glass-border/30 text-muted font-bold text-[10px]">
                    <th className="p-3 border-r border-glass-border/20 min-w-[100px] uppercase tracking-wider text-muted font-black">
                      No.
                    </th>
                    <th className="p-3 border-r border-glass-border/20 min-w-[180px] uppercase tracking-wider text-muted font-black">
                      Name of the patient
                    </th>
                    <th className="p-3 border-r border-glass-border/20 min-w-[140px] uppercase tracking-wider text-muted font-black">
                      Date
                    </th>
                    <th className="p-3 border-r border-glass-border/20 min-w-[110px] uppercase tracking-wider text-muted font-black">
                      Dr Name
                    </th>
                    <th className="p-3 border-r border-glass-border/20 min-w-[100px] uppercase tracking-wider text-muted font-black">
                      Final Amount
                    </th>
                    <th className="p-3 border-r border-glass-border/20 min-w-[90px] uppercase tracking-wider text-muted font-black">
                      Discount
                    </th>
                    <th className="p-3 text-center min-w-[100px] uppercase tracking-wider text-muted font-black">
                      Actions
                    </th>
                  </tr>
                  <tr className="bg-bg2/90 border-b border-glass-border/30">
                    <td className="p-2 border-r border-glass-border/20">
                      <input
                        type="text"
                        placeholder="Filter No..."
                        value={colFilterNo}
                        onChange={e => setColFilterNo(e.target.value)}
                        className="w-full px-2 py-1 bg-bg3 border border-glass-border rounded-md text-[11px] text-text placeholder:text-muted/40 focus:outline-none focus:border-primary/50 font-mono"
                      />
                    </td>
                    <td className="p-2 border-r border-glass-border/20">
                      <input
                        type="text"
                        placeholder="Filter patient..."
                        value={colFilterName}
                        onChange={e => setColFilterName(e.target.value)}
                        className="w-full px-2 py-1 bg-bg3 border border-glass-border rounded-md text-[11px] text-text placeholder:text-muted/40 focus:outline-none focus:border-primary/50"
                      />
                    </td>
                    <td className="p-2 border-r border-glass-border/20">
                      <div className="flex items-center gap-1 w-full">
                        <input
                          type="date"
                          value={colFilterStartDate}
                          onChange={e => setColFilterStartDate(e.target.value)}
                          className="flex-1 w-0 min-w-0 px-1 py-0.5 bg-bg3 border border-glass-border rounded-md text-[10px] text-text focus:outline-none focus:border-primary/50 cursor-pointer"
                          title="From Date"
                        />
                        <span className="text-muted text-[10px] shrink-0">-</span>
                        <input
                          type="date"
                          value={colFilterEndDate}
                          onChange={e => setColFilterEndDate(e.target.value)}
                          className="flex-1 w-0 min-w-0 px-1 py-0.5 bg-bg3 border border-glass-border rounded-md text-[10px] text-text focus:outline-none focus:border-primary/50 cursor-pointer"
                          title="To Date"
                        />
                      </div>
                    </td>
                    <td className="p-2 border-r border-glass-border/20">
                      <input
                        type="text"
                        placeholder="Filter doctor..."
                        value={colFilterDrName}
                        onChange={e => setColFilterDrName(e.target.value)}
                        className="w-full px-2 py-1 bg-bg3 border border-glass-border rounded-md text-[11px] text-text placeholder:text-muted/40 focus:outline-none focus:border-primary/50"
                      />
                    </td>
                    <td className="p-2 border-r border-glass-border/20 bg-bg2/40"></td>
                    <td className="p-2 border-r border-glass-border/20 bg-bg2/40"></td>
                    <td className="p-2 bg-bg2/40 text-center">
                      {(colFilterNo || colFilterName || colFilterStartDate || colFilterEndDate || colFilterDrName) && (
                        <button
                          type="button"
                          onClick={() => {
                            setColFilterNo('');
                            setColFilterName('');
                            setColFilterStartDate('');
                            setColFilterEndDate('');
                            setColFilterDrName('');
                          }}
                          className="px-2 py-1 text-[10px] bg-red/10 border border-red/20 text-red hover:bg-red hover:text-white rounded transition-colors font-bold cursor-pointer"
                          title="Clear filters"
                        >
                          Clear
                        </button>
                      )}
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {paginatedInvoices.map((inv, idx) => (
                    <tr key={inv.id} className="hover:bg-white/10 transition-all duration-300 group relative z-10 hover:shadow-lg hover:-translate-y-0.5">
                      <td className="p-4 border-b border-glass-border/50 relative cursor-pointer">
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary to-purple-500 scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-center"></div>
                        <span className="font-mono text-sm font-bold text-primary bg-primary/10 px-2 py-1 rounded-md border border-primary/20 shadow-sm">{inv.invoice_no}</span>
                      </td>
                      <td className="p-4 border-b border-glass-border/50 cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className="bg-white/5 p-2 rounded-full border border-glass-border shadow-sm group-hover:bg-white/10 group-hover:shadow-md transition-all">
                            <User size={14} className="text-muted group-hover:text-primary transition-colors" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-text group-hover:text-primary transition-colors">{inv.customer_name || 'Walk-in'}</div>
                            {inv.customer_phone && <div className="text-[10px] text-muted font-medium mt-0.5">{inv.customer_phone}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 border-b border-glass-border/50 text-sm text-muted">
                        {formatDate(inv.date)}
                      </td>
                      <td className="p-4 border-b border-glass-border/50 text-sm text-muted">
                        {inv.doctor_name || '-'}
                      </td>
                      <td className="p-4 border-b border-glass-border/50">
                        <span className="text-sm font-bold text-green">₹{Math.round(Number(inv.total_amount || 0))}</span>
                      </td>
                      <td className="p-4 border-b border-glass-border/50 text-sm text-muted">
                        ₹{Math.round(Number(inv.discount || 0))}
                      </td>

                      <td className="p-4 border-b border-glass-border/50">
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 min-w-[140px]">
                          {deleteConfirm === inv.id ? (
                            <div className="flex items-center gap-2 p-1 rounded-lg bg-red/10 border border-red/20 w-full justify-center">
                              <button
                                onClick={() => handleDelete(inv.id)}
                                className="px-3 py-1.5 bg-red text-white rounded-md text-[10px] font-bold hover:bg-red/80 shadow-md transform hover:scale-105 transition-all"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className="px-3 py-1.5 bg-white/10 text-text rounded-md text-[10px] font-bold hover:bg-white/20 shadow-sm transition-all"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => openView(inv)}
                                className="p-2 rounded-lg bg-white/5 hover:bg-sky-500 hover:text-white border border-glass-border hover:border-sky-500 shadow-sm hover:shadow-[0_0_15px_rgba(14,165,233,0.4)] text-muted transition-all transform hover:scale-105 active:scale-95"
                                title="View invoice"
                              >
                                <FileText size={14} />
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(inv.id)}
                                className="p-2 rounded-lg bg-white/5 hover:bg-red hover:text-white border border-glass-border hover:border-red shadow-sm hover:shadow-[0_0_15px_rgba(220,38,38,0.4)] text-muted transition-all transform hover:scale-105 active:scale-95"
                                title="Delete invoice"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editInvoice && createPortal(
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-4xl max-h-[90vh] overflow-y-auto border-primary/20">
            {/* Modal Header */}
            <div className="p-5 border-b border-glass-border flex justify-between items-center bg-white/5 sticky top-0 z-10">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Edit3 size={18} className="text-primary" />
                  Edit Invoice: {editInvoice.invoice_no}
                </h3>
                <p className="text-xs text-muted mt-1">Modify items, customer, or payment details</p>
              </div>
              <button
                onClick={() => setEditInvoice(null)}
                className="p-2 rounded-lg hover:bg-white/10 text-muted hover:text-text transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5">
              {/* Customer Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-muted uppercase tracking-wider mb-1 block">Customer Name</label>
                  <input
                    type="text"
                    value={editCustomerName}
                    onChange={e => setEditCustomerName(e.target.value)}
                    className="w-full px-3 py-2 bg-black/20 border border-glass-border rounded-lg text-sm text-text focus:outline-none focus:border-primary/50"
                    placeholder="Customer name..."
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted uppercase tracking-wider mb-1 block">Phone</label>
                  <input
                    type="text"
                    value={editCustomerPhone}
                    onChange={e => setEditCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-black/20 border border-glass-border rounded-lg text-sm text-text focus:outline-none focus:border-primary/50"
                    placeholder="Phone number..."
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted uppercase tracking-wider mb-1 block">Payment Method</label>
                  <select
                    value={editPaymentMedium}
                    onChange={e => setEditPaymentMedium(e.target.value)}
                    className="w-full px-3 py-2 bg-black/20 border border-glass-border rounded-lg text-sm text-text focus:outline-none focus:border-primary/50"
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                    <option value="CREDIT">Credit</option>
                  </select>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-muted uppercase tracking-wider">Invoice Items</h4>
                  <span className="text-xs text-muted">{editItems.length} item{editItems.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="overflow-x-auto border border-glass-border rounded-lg">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr>
                        <th className="p-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-glass-border bg-black/20">Medicine</th>
                        <th className="p-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-glass-border bg-black/20">Batch</th>
                        <th className="p-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-glass-border bg-black/20">Expiry</th>
                        <th className="p-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-glass-border bg-black/20 text-center">Strips</th>
                        <th className="p-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-glass-border bg-black/20 text-center">Loose</th>
                        <th className="p-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-glass-border bg-black/20 text-center">CD %</th>
                        <th className="p-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-glass-border bg-black/20">MRP</th>
                        <th className="p-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-glass-border bg-black/20">Unit Price</th>
                        <th className="p-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-glass-border bg-black/20">Subtotal</th>
                        <th className="p-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-glass-border bg-black/20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {editItems.map((item, idx) => {
                        const packSize = item.pack_size || 10;
                        const looseQty = item.loose_qty || 0;
                        const discPer = item.discount_per || 0;
                        const discountedPrice = item.unit_price * (1 - discPer / 100);
                        const itemTotal = (discountedPrice * item.quantity) + ((discountedPrice / packSize) * looseQty);
                        return (
                          <tr key={item.id} className="hover:bg-white/5">
                            <td className="p-3 border-b border-glass-border/50 text-sm font-semibold">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleOpenEnrichment(item)}
                                  className="text-primary hover:text-sky-400 p-1 bg-primary/10 rounded-lg transition-colors border border-primary/20 shadow-sm"
                                  title="View Medical Profile"
                                >
                                  <BookOpen size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    if (item.medicine_id) setUniversalEditMedicineId(item.medicine_id);
                                  }}
                                  disabled={!item.medicine_id}
                                  className={`p-1 rounded-lg transition-all border shadow-sm ${item.medicine_id ? 'bg-sky/10 border-sky/20 text-sky hover:text-white hover:bg-sky' : 'opacity-30 cursor-not-allowed border-glass-border text-muted bg-white/5'}`}
                                  title="Quick Edit Medicine"
                                >
                                  <Edit3 size={14} />
                                </button>
                                <span>{item.medicine_name || `Item #${item.inventory_id}`}</span>
                              </div>
                            </td>
                            <td className="p-3 border-b border-glass-border/50">
                              <span className="text-[10px] font-mono bg-white/10 px-2 py-0.5 rounded">{item.batch_number || '-'}</span>
                            </td>
                            <td className="p-3 border-b border-glass-border/50 text-[11px] text-muted">{item.expiry_date || '-'}</td>
                            <td className="p-3 border-b border-glass-border/50">
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={e => updateItemQty(idx, parseInt(e.target.value) || 0)}
                                className="w-16 px-2 py-1 bg-black/20 border border-glass-border rounded text-sm text-text text-center focus:outline-none focus:border-primary/50"
                                min={0}
                              />
                            </td>
                            <td className="p-3 border-b border-glass-border/50">
                              <input
                                type="number"
                                value={looseQty}
                                onChange={e => updateItemLooseQty(idx, parseInt(e.target.value) || 0)}
                                className="w-16 px-2 py-1 bg-amber/10 border border-amber/30 rounded text-sm text-amber text-center focus:outline-none focus:border-amber/50"
                                min={0}
                                max={packSize - 1}
                                title={`Loose units (max ${packSize - 1} per strip)`}
                              />
                            </td>
                            <td className="p-3 border-b border-glass-border/50 text-center">
                              <input
                                type="number"
                                value={item.discount_per || ''}
                                onChange={e => updateItemDiscountPer(idx, parseFloat(e.target.value) || 0)}
                                className="w-16 px-2 py-1 bg-sky/10 border border-sky/30 rounded text-sm text-sky text-center focus:outline-none focus:border-sky/50"
                                min={0}
                                max={100}
                                placeholder="%"
                              />
                            </td>
                            <td className="p-3 border-b border-glass-border/50">
                              <input
                                type="number"
                                value={item.mrp || 0}
                                onChange={e => updateItemMrp(idx, parseFloat(e.target.value) || 0)}
                                className="w-20 px-2 py-1 bg-purple/10 border border-purple/30 rounded text-sm text-purple text-right focus:outline-none focus:border-purple/50"
                                min={0}
                                step={0.01}
                                title="MRP (Maximum Retail Price)"
                              />
                            </td>
                            <td className="p-3 border-b border-glass-border/50">
                              <input
                                type="number"
                                value={item.unit_price}
                                onChange={e => updateItemPrice(idx, parseFloat(e.target.value) || 0)}
                                className="w-20 px-2 py-1 bg-black/20 border border-glass-border rounded text-sm text-text text-right focus:outline-none focus:border-primary/50"
                                min={0}
                                step={0.01}
                              />
                            </td>
                            <td className="p-3 border-b border-glass-border/50 text-sm font-bold text-green text-right">
                              ₹{Math.round(itemTotal)}
                            </td>
                            <td className="p-3 border-b border-glass-border/50">
                              <button
                                onClick={() => removeItem(idx)}
                                className="p-1 rounded hover:bg-red/20 text-muted hover:text-red transition-all"
                                title="Remove item"
                              >
                                <X size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-white/5">
                        <td colSpan={6} className="p-3 text-sm font-bold text-muted text-right">Subtotal:</td>
                        <td className="p-3 text-sm font-bold text-green text-right">
                          ₹{Math.round(editItems.reduce((sum, item) => {
                            const pSize = item.pack_size || 10;
                            const q = item.quantity || 0;
                            const l = item.loose_qty || 0;
                            const d = item.discount_per || 0;
                            const dPrice = item.unit_price * (1 - d / 100);
                            return sum + (q * dPrice) + (l * (dPrice / pSize));
                          }, 0))}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Discount */}
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-muted uppercase tracking-wider">Discount (₹)</label>
                <input
                  type="number"
                  value={editDiscount}
                  onChange={e => setEditDiscount(parseFloat(e.target.value) || 0)}
                  className="w-24 px-3 py-1.5 bg-black/20 border border-glass-border rounded-lg text-sm text-text focus:outline-none focus:border-primary/50"
                  min={0}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-glass-border flex justify-between items-center bg-white/5 sticky bottom-0">
              <button
                onClick={() => setEditInvoice(null)}
                className="px-4 py-2 bg-white/10 text-muted rounded-lg text-sm font-semibold hover:bg-white/20 transition-all"
              >
                Cancel
              </button>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-xs text-muted">Total</div>
                  <div className="text-lg font-extrabold text-green">
                    ₹{Math.round(editItems.reduce((sum, item) => {
                      const pSize = item.pack_size || 10;
                      const q = item.quantity || 0;
                      const l = item.loose_qty || 0;
                      const d = item.discount_per || 0;
                      const dPrice = item.unit_price * (1 - d / 100);
                      return sum + (q * dPrice) + (l * (dPrice / pSize));
                    }, 0) - editDiscount)}
                  </div>
                </div>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/80 disabled:opacity-50 transition-all"
                >
                  <Save size={14} />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* View Modal */}
      {viewInvoice && createPortal(
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-4xl max-h-[90vh] flex flex-col border-sky-500/20">
            {/* Modal Header */}
            <div className="p-5 border-b border-glass-border flex justify-between items-center bg-white/5 shrink-0">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <FileText size={18} className="text-sky-500" />
                  Bill Preview: {viewInvoice.invoice_no}
                </h3>
                <p className="text-xs text-muted mt-1">Read-only view of the invoice</p>
              </div>
              <button
                onClick={() => setViewInvoice(null)}
                className="p-2 rounded-lg hover:bg-white/10 text-muted hover:text-text transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5 flex-1 overflow-y-auto">
              {/* Customer Info */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white/5 p-4 rounded-xl border border-glass-border">
                <div>
                  <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Customer Name</div>
                  <div className="text-sm font-semibold text-text">{viewInvoice.customer_name || 'Walk-in'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Phone</div>
                  <div className="text-sm font-semibold text-text">{viewInvoice.customer_phone || '-'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Payment Method</div>
                  <div className="text-sm font-semibold text-text">{viewInvoice.payment_medium || 'CASH'}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Date</div>
                  <div className="text-sm font-semibold text-text">{formatDate(viewInvoice.date)}</div>
                </div>
              </div>

              {/* Items Table */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-muted uppercase tracking-wider">Invoice Items</h4>
                  <span className="text-xs text-muted">{viewInvoice.items?.length || 0} item{(viewInvoice.items?.length || 0) !== 1 ? 's' : ''}</span>
                </div>
                <div className="overflow-x-auto border border-glass-border rounded-lg bg-black/20">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr>
                        <th className="p-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-glass-border">Medicine</th>
                        <th className="p-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-glass-border">Batch</th>
                        <th className="p-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-glass-border text-center">Qty (Strips/Loose)</th>
                        <th className="p-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-glass-border text-center">CD %</th>
                        <th className="p-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-glass-border">MRP</th>
                        <th className="p-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-glass-border">Unit Price</th>
                        <th className="p-3 text-[10px] font-bold text-muted uppercase tracking-wider border-b border-glass-border">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewInvoice.items?.map((item, idx) => {
                        const packSize = item.pack_size || 10;
                        const looseQty = item.loose_qty || 0;
                        const discPer = item.discount_per || 0;
                        const discountedPrice = item.unit_price * (1 - discPer / 100);
                        const itemTotal = (discountedPrice * item.quantity) + ((discountedPrice / packSize) * looseQty);
                        return (
                          <tr key={idx} className="hover:bg-white/5">
                            <td className="p-3 border-b border-glass-border/50 text-sm font-semibold">
                              {item.medicine_name || `Item #${item.inventory_id}`}
                            </td>
                            <td className="p-3 border-b border-glass-border/50">
                              <span className="text-[10px] font-mono bg-white/10 px-2 py-0.5 rounded">{item.batch_number || '-'}</span>
                            </td>
                            <td className="p-3 border-b border-glass-border/50 text-center text-sm">
                              {item.quantity} / {looseQty}
                            </td>
                            <td className="p-3 border-b border-glass-border/50 text-center text-sm">
                              {discPer}%
                            </td>
                            <td className="p-3 border-b border-glass-border/50 text-sm text-muted">
                              ₹{item.mrp || 0}
                            </td>
                            <td className="p-3 border-b border-glass-border/50 text-sm font-medium">
                              ₹{discountedPrice.toFixed(2)}
                            </td>
                            <td className="p-3 border-b border-glass-border/50 text-sm font-bold text-green">
                              ₹{Math.round(itemTotal)}
                            </td>
                          </tr>
                        );
                      })}
                      {(!viewInvoice.items || viewInvoice.items.length === 0) && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-muted">No items found in this invoice</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Discount & Tax Info */}
              <div className="flex justify-end pt-2 mt-6">
                <div className="w-64 space-y-2">
                  {(() => {
                    const calculatedSubtotal = viewInvoice.items?.reduce((sum, item) => {
                      const packSize = item.pack_size || 10;
                      const looseQty = item.loose_qty || 0;
                      const discPer = item.discount_per || 0;
                      const discountedPrice = item.unit_price * (1 - discPer / 100);
                      return sum + (discountedPrice * item.quantity) + ((discountedPrice / packSize) * looseQty);
                    }, 0) || 0;
                    const displaySubtotal = viewInvoice.subtotal || calculatedSubtotal;
                    const calculatedDiscount = Math.max(0, calculatedSubtotal - (viewInvoice.total_amount || 0));
                    const displayDiscount = viewInvoice.discount || calculatedDiscount || 0;
                    return (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted">Subtotal:</span>
                          <span className="font-semibold">₹{Math.round(displaySubtotal)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted">Discount:</span>
                          <span className="font-semibold text-amber-500">-₹{Math.round(displayDiscount)}</span>
                        </div>
                      </>
                    );
                  })()}
                  <div className="flex justify-between text-lg font-bold pt-2 border-t border-glass-border/50">
                    <span className="text-text">Grand Total:</span>
                    <span className="text-green text-xl">₹{Math.round(viewInvoice.total_amount || 0)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-glass-border flex justify-between items-center bg-white/5 shrink-0">
              <button
                onClick={() => setViewInvoice(null)}
                className="px-4 py-2 bg-white/10 text-muted rounded-lg text-sm font-semibold hover:bg-white/20 transition-all"
              >
                Close Preview
              </button>
              <button
                onClick={() => openEdit(viewInvoice)}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/80 transition-all"
              >
                <Edit3 size={14} />
                Edit Invoice
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Sliding Details Drawer for OpenFDA Enrichment */}
      {createPortal(
        <div className={`fixed top-0 right-0 h-full w-[450px] bg-[#121214]/95 backdrop-blur-xl border-l border-glass-border shadow-[-8px_0_30px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-in-out z-drawer flex flex-col ${panelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {selectedEnrichedItem && (
          <>
            {/* Header */}
            <div className="p-6 border-b border-glass-border flex justify-between items-center bg-white/5">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-purple-400 px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">
                  Medical Profile
                </span>
                <h4 className="text-xl font-bold mt-1 text-white">{selectedEnrichedItem.medicine_name}</h4>
              </div>
              <button 
                onClick={() => setPanelOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/10 text-muted hover:text-white transition-colors"
                aria-label="Close panel"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Enrichment Section */}
              <div className="space-y-5">
                <h5 className="text-xs font-bold uppercase tracking-widest text-muted border-b border-glass-border pb-2">openFDA Intelligence</h5>

                {detailsLoading ? (
                  <div className="flex flex-col items-center justify-center py-10 space-y-3">
                    <RefreshCw className="animate-spin text-purple-500" size={24} />
                    <span className="text-sm text-muted">Retrieving OpenFDA monographs...</span>
                  </div>
                ) : enrichedData ? (
                  <div className="space-y-5 fade-in">
                    {/* Active Ingredients */}
                    <div>
                      <span className="text-xs text-muted uppercase font-bold block mb-2">Active Ingredients</span>
                      <div className="flex flex-wrap gap-2">
                        {enrichedData.activeIngredients && enrichedData.activeIngredients.length > 0 ? (
                          enrichedData.activeIngredients.map((ing: string, i: number) => (
                            <span key={i} className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                              {ing}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-muted italic">Generic formula not indexed.</span>
                        )}
                      </div>
                    </div>

                    {/* Indications */}
                    <div className="space-y-1.5">
                      <span className="text-xs text-muted uppercase font-bold flex items-center gap-1.5 text-sky-400">
                        <BookOpen size={14} className="text-sky-400" /> Indications & Usage
                      </span>
                      <div className="bg-white/5 p-3 rounded-lg border border-glass-border text-sm text-muted leading-relaxed max-h-48 overflow-y-auto">
                        {enrichedData.indications || 'Not available.'}
                      </div>
                    </div>

                    {/* Warnings */}
                    <div className="space-y-1.5">
                      <span className="text-xs text-muted uppercase font-bold flex items-center gap-1.5 text-yellow-500">
                        <AlertTriangle size={14} /> Warnings & Precautions
                      </span>
                      <div className="bg-yellow-500/5 p-3 rounded-lg border border-yellow-500/20 text-sm text-yellow-200/80 leading-relaxed max-h-48 overflow-y-auto">
                        {enrichedData.warnings || 'No active drug safety warnings.'}
                      </div>
                    </div>

                    {/* Side Effects */}
                    <div className="space-y-1.5">
                      <span className="text-xs text-muted uppercase font-bold flex items-center gap-1.5 text-red-500">
                        <ShieldAlert size={14} /> Adverse Reactions
                      </span>
                      <div className="bg-red-500/5 p-3 rounded-lg border border-red-500/20 text-sm text-red-300 leading-relaxed max-h-48 overflow-y-auto">
                        {enrichedData.sideEffects || 'No common adverse reactions logged.'}
                      </div>
                    </div>

                    {/* Source and Manufacturer */}
                    <div className="pt-2 flex justify-between items-center text-xs text-muted">
                      <span className="flex items-center gap-1">
                        <Factory size={12} /> Mfg: {enrichedData.manufacturer || 'Unknown'}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-green-500/10 border border-green-500/20 text-green-500 font-bold uppercase text-[10px] tracking-wide">
                        Source: {enrichedData.enrichmentSource || 'FDA'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-muted italic">No enrichment profile found.</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>,
        document.body
      )}

      {universalEditMedicineId && (
        <UniversalMedicineEditModal 
          medicineId={universalEditMedicineId} 
          onClose={() => setUniversalEditMedicineId(null)} 
          onSave={() => {
            // Refetch to reflect any potential naming changes if needed
            fetchInvoices(true);
          }} 
        />
      )}

      {/* Floating Action Button (FAB) for Filters */}
      <button
        type="button"
        onClick={() => setIsFilterDrawerOpen(true)}
        className="absolute bottom-6 right-6 z-30 flex items-center gap-2 px-4.5 py-3 bg-primary text-white rounded-full shadow-lg hover:shadow-primary/30 hover:scale-105 active:scale-95 transition-all duration-300 group cursor-pointer border border-primary/35 font-bold text-xs uppercase tracking-wider select-none"
        title="Open Filter Panel"
      >
        <SlidersHorizontal size={14} className="group-hover:rotate-12 transition-transform" />
        <span>Filters</span>
        {activeFiltersCount > 0 && (
          <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[9px] font-black bg-white text-primary rounded-full shadow-inner animate-pulse">
            {activeFiltersCount}
          </span>
        )}
      </button>

      {/* Sliding Filter Drawer Portal */}
      {isFilterDrawerOpen && createPortal(
        <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
          {/* Style injection for animations and custom scrollbars */}
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @keyframes slideInRight {
              from { transform: translateX(100%); }
              to { transform: translateX(0); }
            }
            .animate-fade-in {
              animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            .animate-slide-in-right {
              animation: slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
          `}} />

          {/* Backdrop with blur */}
          <div 
            className="absolute inset-0 bg-bg/40 backdrop-blur-xs transition-opacity duration-300 animate-fade-in"
            onClick={() => setIsFilterDrawerOpen(false)}
          />
          
          {/* Drawer Panel Container */}
          <div className="relative w-full max-w-sm bg-bg2 border-l border-glass-border shadow-2xl h-full flex flex-col z-10 animate-slide-in-right">
            {/* Drawer Header */}
            <div className="p-5 border-b border-glass-border/40 bg-bg3/10 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-inner">
                  <SlidersHorizontal size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-text leading-tight">Sells Filters</h4>
                  <p className="text-[10px] text-muted mt-0.5">Filter invoice records by criteria</p>
                </div>
              </div>
              <button 
                onClick={() => setIsFilterDrawerOpen(false)}
                className="p-2 rounded-full hover:bg-bg3 text-muted hover:text-text transition-all cursor-pointer border border-transparent hover:border-glass-border"
                title="Close Drawer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar select-none">
              
              {/* Search Details Section */}
              <div className="space-y-4">
                <h5 className="text-[10px] font-black uppercase tracking-widest text-muted/80 border-b border-glass-border/30 pb-1.5">Invoice Information</h5>
                
                {/* Invoice Number Input */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted uppercase tracking-wide flex items-center gap-1.5">
                    <Hash size={11} className="text-primary" /> Invoice Number
                  </label>
                  <div className="relative group">
                    <input
                      type="text"
                      placeholder="Filter by invoice no..."
                      value={colFilterNo}
                      onChange={e => setColFilterNo(e.target.value)}
                      className="w-full pl-3 pr-8 py-2.5 bg-bg3 border border-glass-border rounded-xl text-xs text-text placeholder:text-muted/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 font-mono transition-all"
                    />
                    {colFilterNo && (
                      <button 
                        onClick={() => setColFilterNo('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors p-0.5 rounded-full hover:bg-bg2"
                        title="Clear Input"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Patient Name Input */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted uppercase tracking-wide flex items-center gap-1.5">
                    <User size={11} className="text-primary" /> Patient Name / Phone
                  </label>
                  <div className="relative group">
                    <input
                      type="text"
                      placeholder="Filter by name or phone..."
                      value={colFilterName}
                      onChange={e => setColFilterName(e.target.value)}
                      className="w-full pl-3 pr-8 py-2.5 bg-bg3 border border-glass-border rounded-xl text-xs text-text placeholder:text-muted/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                    />
                    {colFilterName && (
                      <button 
                        onClick={() => setColFilterName('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors p-0.5 rounded-full hover:bg-bg2"
                        title="Clear Input"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Doctor Name Input */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted uppercase tracking-wide flex items-center gap-1.5">
                    <User size={11} className="text-primary" /> Prescribing Doctor
                  </label>
                  <div className="relative group">
                    <input
                      type="text"
                      placeholder="Filter by doctor..."
                      value={colFilterDrName}
                      onChange={e => setColFilterDrName(e.target.value)}
                      className="w-full pl-3 pr-8 py-2.5 bg-bg3 border border-glass-border rounded-xl text-xs text-text placeholder:text-muted/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
                    />
                    {colFilterDrName && (
                      <button 
                        onClick={() => setColFilterDrName('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text transition-colors p-0.5 rounded-full hover:bg-bg2"
                        title="Clear Input"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Date Filters Section */}
              <div className="space-y-4 pt-4 border-t border-glass-border/30">
                <h5 className="text-[10px] font-black uppercase tracking-widest text-muted/80 border-b border-glass-border/30 pb-1.5 flex items-center gap-1.5">
                  <Calendar size={11} className="text-primary" /> Date Range
                </h5>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-muted uppercase tracking-wide">From Date</span>
                    <input
                      type="date"
                      value={colFilterStartDate}
                      onChange={e => setColFilterStartDate(e.target.value)}
                      className="w-full px-2.5 py-2.5 bg-bg3 border border-glass-border rounded-xl text-xs text-text focus:outline-none focus:border-primary/50 cursor-pointer transition-all"
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-muted uppercase tracking-wide">To Date</span>
                    <input
                      type="date"
                      value={colFilterEndDate}
                      onChange={e => setColFilterEndDate(e.target.value)}
                      className="w-full px-2.5 py-2.5 bg-bg3 border border-glass-border rounded-xl text-xs text-text focus:outline-none focus:border-primary/50 cursor-pointer transition-all"
                    />
                  </div>
                </div>

                {/* Date Presets Buttons */}
                <div className="space-y-2">
                  <span className="text-[9px] font-bold text-muted uppercase tracking-wide block">Quick Intervals</span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setQuickDateRange('today')}
                      className="px-3 py-1.5 text-[10px] bg-bg3 hover:bg-primary/15 hover:text-primary border border-glass-border rounded-lg text-muted transition-all font-bold cursor-pointer active:scale-95"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickDateRange('yesterday')}
                      className="px-3 py-1.5 text-[10px] bg-bg3 hover:bg-primary/15 hover:text-primary border border-glass-border rounded-lg text-muted transition-all font-bold cursor-pointer active:scale-95"
                    >
                      Yesterday
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickDateRange('7days')}
                      className="px-3 py-1.5 text-[10px] bg-bg3 hover:bg-primary/15 hover:text-primary border border-glass-border rounded-lg text-muted transition-all font-bold cursor-pointer active:scale-95"
                    >
                      Last 7 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickDateRange('30days')}
                      className="px-3 py-1.5 text-[10px] bg-bg3 hover:bg-primary/15 hover:text-primary border border-glass-border rounded-lg text-muted transition-all font-bold cursor-pointer active:scale-95"
                    >
                      Last 30 Days
                    </button>
                    {(colFilterStartDate || colFilterEndDate) && (
                      <button
                        type="button"
                        onClick={() => setQuickDateRange('clear')}
                        className="px-3 py-1.5 text-[10px] bg-red/10 border border-red/25 hover:bg-red hover:text-white rounded-lg text-red-400 transition-all font-bold cursor-pointer active:scale-95"
                      >
                        Clear Dates
                      </button>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* Sticky Drawer Footer */}
            <div className="p-4 border-t border-glass-border/40 bg-bg3/10 flex gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setColFilterNo('');
                  setColFilterName('');
                  setColFilterStartDate('');
                  setColFilterEndDate('');
                  setColFilterDrName('');
                }}
                disabled={activeFiltersCount === 0}
                className="flex-1 px-4 py-3 bg-bg3 hover:bg-red/10 border border-glass-border hover:border-red/30 text-muted hover:text-red rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none active:scale-95 text-center"
              >
                Reset All
              </button>
              <button
                type="button"
                onClick={() => setIsFilterDrawerOpen(false)}
                className="flex-1 px-4 py-3 bg-primary hover:bg-primary/90 text-white border border-primary/30 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-md shadow-primary/20 active:scale-95 text-center"
              >
                Show {filteredInvoices.length} {filteredInvoices.length === 1 ? 'Invoice' : 'Invoices'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
};

export default Sells;
