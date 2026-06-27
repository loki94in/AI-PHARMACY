import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  CalendarDays, 
  Search, 
  Bell, 
  Check, 
  AlertCircle, 
  AlertTriangle, 
  RefreshCw, 
  CheckCircle2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Package
} from 'lucide-react';
import { api } from '../../services/api';
import { toastEvent } from '../../services/events';

interface ExpiryItem {
  id: number;
  medicine_name: string;
  batch_no: string;
  expiry_date: string;
  quantity: number;
  mrp: number;
  rack_location?: string;
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

export let cachedExpiryItems: ExpiryItem[] | null = null;

export const clearExpiryCache = () => {
  cachedExpiryItems = null;
};

const Expiry = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<ExpiryItem[]>(cachedExpiryItems || []);
  const [loading, setLoading] = useState(!cachedExpiryItems);
  const [refreshing, setRefreshing] = useState(false);
  const [daysFilter, setDaysFilter] = useState(90);
  const [customPhone, setCustomPhone] = useState('');
  const [sendingAlerts, setSendingAlerts] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  
  // Custom Filters (Column filters)
  const [colFilterId, setColFilterId] = useState('');
  const [colFilterMedName, setColFilterMedName] = useState('');
  const [colFilterBatchNo, setColFilterBatchNo] = useState('');
  const [colFilterDate, setColFilterDate] = useState('');
  const [colFilterMinQty, setColFilterMinQty] = useState('');
  const [colFilterMaxQty, setColFilterMaxQty] = useState('');
  const [colFilterMinMrp, setColFilterMinMrp] = useState('');
  const [colFilterMaxMrp, setColFilterMaxMrp] = useState('');
  const [colFilterLocation, setColFilterLocation] = useState('');

  // Debounced filters to avoid CPU/re-render saturation
  const [debouncedFilters, setDebouncedFilters] = useState({
    id: '',
    medicineName: '',
    batchNo: '',
    date: '',
    minQty: '',
    maxQty: '',
    minMrp: '',
    maxMrp: '',
    location: ''
  });

  useEffect(() => {
    // Update date immediately to ensure instant filtering and UI response
    setDebouncedFilters(prev => {
      if (prev.date !== colFilterDate) {
        return {
          ...prev,
          date: colFilterDate
        };
      }
      return prev;
    });

    // Debounce text and numeric range inputs by 2 seconds to prevent rapid updates
    const handler = setTimeout(() => {
      setDebouncedFilters(prev => {
        const nextId = (colFilterId.length === 0 || colFilterId.length >= 3) ? colFilterId : prev.id;
        const nextMedName = (colFilterMedName.length === 0 || colFilterMedName.length >= 3) ? colFilterMedName : prev.medicineName;
        const nextBatchNo = (colFilterBatchNo.length === 0 || colFilterBatchNo.length >= 3) ? colFilterBatchNo : prev.batchNo;
        const nextLocation = (colFilterLocation.length === 0 || colFilterLocation.length >= 3) ? colFilterLocation : prev.location;
        const nextMinQty = colFilterMinQty;
        const nextMaxQty = colFilterMaxQty;
        const nextMinMrp = colFilterMinMrp;
        const nextMaxMrp = colFilterMaxMrp;

        if (
          prev.id !== nextId ||
          prev.medicineName !== nextMedName ||
          prev.batchNo !== nextBatchNo ||
          prev.location !== nextLocation ||
          prev.minQty !== nextMinQty ||
          prev.maxQty !== nextMaxQty ||
          prev.minMrp !== nextMinMrp ||
          prev.maxMrp !== nextMaxMrp
        ) {
          return {
            ...prev,
            id: nextId,
            medicineName: nextMedName,
            batchNo: nextBatchNo,
            location: nextLocation,
            minQty: nextMinQty,
            maxQty: nextMaxQty,
            minMrp: nextMinMrp,
            maxMrp: nextMaxMrp
          };
        }
        return prev;
      });
    }, 2000);

    return () => clearTimeout(handler);
  }, [colFilterId, colFilterMedName, colFilterBatchNo, colFilterDate, colFilterMinQty, colFilterMaxQty, colFilterMinMrp, colFilterMaxMrp, colFilterLocation]);

  // Reset pagination when filters or scope days change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedFilters, daysFilter]);

  const fetchExpiryItems = async (days = 180, showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    if (!cachedExpiryItems && !showRefresh) setLoading(true);
    try {
      const data = await api.getExpiryList(days);
      if (Array.isArray(data)) {
        setItems(data);
        cachedExpiryItems = data;
      }
    } catch (err) {
      console.error('Error fetching near-expiry items:', err);
      showNotification('Failed to load near-expiry inventory data.', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchExpiryItems(180);
    
    // Attempt to load settings to prefill owner/pharmacist phone number
    api.getLicenseStatus() // we can fetch details from licensing/settings if available
      .catch(err => console.error(err));
  }, []);

  const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
    toastEvent.trigger(message, type, '/expiry');
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSendToReturns = () => {
    const selected = filteredItems.filter(item => selectedIds.has(item.id));
    if (selected.length === 0) return;
    navigate('/returns', { state: { prefilledReturnItems: selected } });
  };

  const handleSendWhatsAppAlerts = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendingAlerts(true);
    try {
      const res = await api.sendExpiryAlerts({
        phone: customPhone.trim() || undefined,
        days: daysFilter
      });
      if (res.success) {
        showNotification(res.message || 'WhatsApp alert digest sent successfully!', 'success');
      } else {
        showNotification('No expiring items found to report.', 'info');
      }
    } catch (err: any) {
      console.error('Failed to trigger WhatsApp alerts:', err);
      const errMsg = err.response?.data?.error || 'Failed to dispatch WhatsApp alerts.';
      showNotification(errMsg, 'error');
    } finally {
      setSendingAlerts(false);
    }
  };

  // Helper to parse dates robustly in case raw slash format is present
  const parseDateRobust = (dateStr: string) => {
    if (!dateStr) return new Date(NaN);
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      let year = parseInt(parts[1], 10);
      const month = parseInt(parts[0], 10) - 1;
      if (isNaN(year) || isNaN(month)) return new Date(NaN);
      if (year < 100) year += 2000;
      return new Date(year, month + 1, 0);
    }
    return new Date(dateStr);
  };

  // Calculations for Expiry Badging
  const getExpiryDaysDiff = (expiryDateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = parseDateRobust(expiryDateStr);
    if (isNaN(exp.getTime())) return 0;
    exp.setHours(0, 0, 0, 0);
    
    const diffTime = exp.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getExpiryStatusDetails = (daysDiff: number) => {
    if (daysDiff <= 0) {
      return {
        label: 'EXPIRED',
        colorClass: 'bg-red-500/15 border-red-500/30 text-red font-bold',
        rowClass: 'border-red-500/10 bg-red-500/5',
        daysText: `${Math.abs(daysDiff)} days ago`
      };
    } else if (daysDiff <= 30) {
      return {
        label: 'CRITICAL',
        colorClass: 'bg-orange-500/15 border-orange-500/30 text-orange-500 font-bold',
        rowClass: 'border-orange-500/10 bg-orange-500/5',
        daysText: `in ${daysDiff} days`
      };
    } else if (daysDiff <= 60) {
      return {
        label: 'WARNING',
        colorClass: 'bg-amber-500/15 border-amber-500/30 text-amber-500 font-bold',
        rowClass: 'border-amber-500/5',
        daysText: `in ${daysDiff} days`
      };
    } else {
      return {
        label: 'NEAR EXPIRY',
        colorClass: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400 font-semibold',
        rowClass: '',
        daysText: `in ${daysDiff} days`
      };
    }
  };

  const filteredItems = items.filter(item => {
    // Filter based on daysFilter scope tab
    const diff = getExpiryDaysDiff(item.expiry_date);
    if (diff > daysFilter) {
      return false;
    }

    // Column-specific header filters using debounced values
    if (debouncedFilters.id && !item.id.toString().includes(debouncedFilters.id)) {
      return false;
    }
    if (debouncedFilters.medicineName && !item.medicine_name.toLowerCase().includes(debouncedFilters.medicineName.toLowerCase())) {
      return false;
    }
    if (debouncedFilters.batchNo && !item.batch_no.toLowerCase().includes(debouncedFilters.batchNo.toLowerCase())) {
      return false;
    }
    if (debouncedFilters.date) {
      const itemDate = item.expiry_date ? item.expiry_date.substring(0, 10) : '';
      if (itemDate !== debouncedFilters.date) return false;
    }
    const qtyVal = item.quantity || 0;
    const minQ = debouncedFilters.minQty ? Number(debouncedFilters.minQty) : 0;
    const maxQ = debouncedFilters.maxQty ? Number(debouncedFilters.maxQty) : 100000000;
    if (qtyVal < minQ || qtyVal > maxQ) return false;

    const mrpVal = item.mrp || 0;
    const minM = debouncedFilters.minMrp ? Number(debouncedFilters.minMrp) : 0;
    const maxM = debouncedFilters.maxMrp ? Number(debouncedFilters.maxMrp) : 100000000;
    if (mrpVal < minM || mrpVal > maxM) return false;

    if (debouncedFilters.location && !(item.rack_location || '').toLowerCase().includes(debouncedFilters.location.toLowerCase())) {
      return false;
    }

    return true;
  });

  const isDateFiltered = !!(colFilterDate || debouncedFilters.date);
  const totalPages = Math.ceil(filteredItems.length / pageSize);
  const paginatedItems = isDateFiltered ? filteredItems : filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="h-full flex flex-col fade-in space-y-6">
      


      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 select-none pb-2 border-b border-glass-border/30">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          <span className="text-[10px] font-bold text-muted uppercase tracking-wider mr-1.5 hidden sm:inline">Scope Days:</span>
          {[30, 60, 90, 180].map(days => (
            <button
              key={days}
              onClick={() => setDaysFilter(days)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                daysFilter === days
                  ? 'bg-primary/20 border-primary text-primary font-bold shadow-[0_0_12px_rgba(14,165,233,0.15)]'
                  : 'bg-white/5 border-glass-border/60 text-muted hover:text-text hover:bg-white/10'
              }`}
            >
              {days} Days
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {selectedIds.size > 0 && (
            <button
              onClick={handleSendToReturns}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30 transition-all text-xs font-bold"
            >
              <RotateCcw size={13} />
              Return {selectedIds.size} Selected
            </button>
          )}
          <button 
            onClick={() => fetchExpiryItems(180, true)} 
            disabled={refreshing}
            className="p-2 rounded-lg bg-white/5 border border-glass-border hover:bg-white/10 hover:text-white transition-all text-muted"
            title="Refresh list"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 flex-1 min-h-0">
        
        {/* LEFT COLUMN: Summary & Dispatch Widget */}
        <div className="xl:col-span-1 flex flex-col space-y-6">
          
          {/* Dispatch Widget Card */}
          <div className="glass-panel p-6">
            <h3 className="font-bold flex items-center gap-2 mb-6 text-sm text-text border-b border-glass-border/30 pb-3">
              <Bell size={16} className="text-amber-500 animate-pulse" /> 
              WhatsApp Alert Summary
            </h3>
            
            <form onSubmit={handleSendWhatsAppAlerts} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted uppercase tracking-wider">Recipient Phone Number</label>
                <input 
                  type="tel" 
                  value={customPhone}
                  onChange={e => setCustomPhone(e.target.value)}
                  className="premium-input w-full font-mono font-semibold" 
                  placeholder="e.g. 9876543210" 
                  maxLength={10}
                />
                <p className="text-[9px] text-muted">Leave empty to use the default configured `owner_phone` in settings.</p>
              </div>

              <div className="bg-white/5 p-4 rounded-xl border border-glass-border/40 space-y-2.5">
                <div className="text-[10px] font-bold text-muted uppercase tracking-wider">Digest Scope</div>
                <div className="text-xs flex justify-between font-semibold">
                  <span className="text-muted">Target Horizon:</span>
                  <span className="text-white">{daysFilter} Days</span>
                </div>
                <div className="text-xs flex justify-between font-semibold">
                  <span className="text-muted">Matching Items:</span>
                  <span className="text-amber-500 font-bold">{filteredItems.length} items</span>
                </div>
              </div>

              <button 
                type="submit"
                disabled={sendingAlerts || filteredItems.length === 0}
                className="premium-btn bg-amber-500 text-black shadow-[0_4px_14px_rgba(245,158,11,0.3)] hover:bg-amber-600 w-full mt-4 font-bold disabled:opacity-50"
              >
                {sendingAlerts ? 'Sending Reports...' : 'Send WhatsApp Digest'}
                <Bell size={14} className="ml-1" />
              </button>
            </form>
          </div>

          {/* Quick Statistics Card */}
          <div className="glass-panel p-6 flex-1 min-h-0 overflow-y-auto scrollbar-thin">
            <h3 className="font-bold mb-4 text-xs text-muted uppercase tracking-wider">Summary Statistics</h3>
            <div className="space-y-3.5">
              <div className="flex justify-between items-center bg-[#18181b]/50 p-3 rounded-lg border border-glass-border/30">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded bg-red shrink-0" />
                  <span className="text-xs font-semibold">Expired Batches</span>
                </div>
                <span className="font-mono text-sm font-bold text-red">
                  {items.filter(item => getExpiryDaysDiff(item.expiry_date) <= 0).length}
                </span>
              </div>
              
              <div className="flex justify-between items-center bg-[#18181b]/50 p-3 rounded-lg border border-glass-border/30">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded bg-orange-500 shrink-0" />
                  <span className="text-xs font-semibold">Nearing (30 Days)</span>
                </div>
                <span className="font-mono text-sm font-bold text-orange-500">
                  {items.filter(item => {
                    const diff = getExpiryDaysDiff(item.expiry_date);
                    return diff > 0 && diff <= 30;
                  }).length}
                </span>
              </div>

              <div className="flex justify-between items-center bg-[#18181b]/50 p-3 rounded-lg border border-glass-border/30">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded bg-amber-500 shrink-0" />
                  <span className="text-xs font-semibold">Nearing (60 Days)</span>
                </div>
                <span className="font-mono text-sm font-bold text-amber-500">
                  {items.filter(item => {
                    const diff = getExpiryDaysDiff(item.expiry_date);
                    return diff > 30 && diff <= 60;
                  }).length}
                </span>
              </div>

              <div className="flex justify-between items-center bg-[#18181b]/50 p-3 rounded-lg border border-glass-border/30">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded bg-indigo-500 shrink-0" />
                  <span className="text-xs font-semibold">Nearing (90 Days)</span>
                </div>
                <span className="font-mono text-sm font-bold text-indigo-400">
                  {items.filter(item => {
                    const diff = getExpiryDaysDiff(item.expiry_date);
                    return diff > 60 && diff <= 90;
                  }).length}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Table Directory of Nearing Expiry */}
        <div className="xl:col-span-3 bg-glass-bg border border-glass-border rounded-2xl flex flex-col min-h-0 overflow-hidden relative shadow-2xl animate-in fade-in duration-300">
          
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
                    max={Math.max(0, filteredItems.length - 1)}
                    value={filteredItems.length === 0 ? 0 : (currentPage - 1) * pageSize}
                    onChange={e => {
                      const val = Math.max(0, parseInt(e.target.value) || 0);
                      const newPage = Math.floor(val / pageSize) + 1;
                      setCurrentPage(Math.min(totalPages, newPage));
                    }}
                    className="w-16 bg-transparent text-center font-mono font-bold outline-none text-primary border-0 p-0 focus:ring-0 text-text"
                  />
                  <span className="text-muted">to</span>
                  <span className="text-text font-mono font-bold">
                    {filteredItems.length === 0 ? 0 : Math.min(filteredItems.length, currentPage * pageSize)}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 bg-bg3 border border-glass-border rounded-lg px-2.5 py-1">
                  <span className="text-muted">Showing all</span>
                  <span className="text-text font-mono font-bold">
                    {filteredItems.length}
                  </span>
                </div>
              )}
              <span className="text-muted">
                of <strong className="text-text font-bold">{filteredItems.length.toLocaleString()}</strong> expiring items
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

          <div className="flex-1 flex flex-col min-h-0 p-4 overflow-hidden bg-bg2/15">
            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted font-semibold">
                <RefreshCw size={24} className="animate-spin mx-auto mb-3 text-primary opacity-60" />
                Loading expiry register...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-16 text-center text-muted font-semibold">
                <CheckCircle2 size={36} className="mx-auto mb-3 text-muted/30" />
                No items matching expiry thresholds in inventory.
              </div>
            ) : (
              <div className="flex-1 border border-glass-border/30 rounded-xl overflow-auto bg-glass-bg custom-scrollbar min-h-0 relative">
                <table className="w-full text-left border-collapse text-[11px] font-semibold text-text min-w-full">
                  <thead className="sticky top-0 z-20 bg-bg2 shadow-sm">
                    <tr className="bg-bg2 border-b border-glass-border/30 text-muted font-bold text-[10px] align-top">
                      <th className="p-2 border-r border-glass-border/20 w-8">
                        <input type="checkbox" className="rounded animate-in fade-in cursor-pointer" onChange={e => {
                          if (e.target.checked) setSelectedIds(new Set(filteredItems.map(i => i.id)));
                          else setSelectedIds(new Set());
                        }} checked={selectedIds.size === filteredItems.length && filteredItems.length > 0} readOnly />
                      </th>
                      <th className="p-2 border-r border-glass-border/20 min-w-[50px]">
                        <div className="flex flex-col gap-1">
                          <span className="uppercase text-[10px] tracking-wider text-muted font-black">ID</span>
                        </div>
                      </th>
                      <th className="p-2 border-r border-glass-border/20 min-w-[150px]">
                        <div className="flex flex-col gap-1">
                          <span className="uppercase text-[10px] tracking-wider text-muted font-black">Medicine Name</span>
                        </div>
                      </th>
                      <th className="p-2 border-r border-glass-border/20 min-w-[100px]">
                        <div className="flex flex-col gap-1">
                          <span className="uppercase text-[10px] tracking-wider text-muted font-black">Batch Number</span>
                        </div>
                      </th>
                      <th className="p-2 border-r border-glass-border/20 min-w-[100px] text-center">
                        <div className="flex flex-col gap-1">
                          <span className="uppercase text-[10px] tracking-wider text-muted font-black">Expiry Date</span>
                        </div>
                      </th>
                      <th className="p-2 border-r border-glass-border/20 min-w-[100px] text-center">
                        <div className="flex flex-col gap-1">
                          <span className="uppercase text-[10px] tracking-wider text-muted font-black">Remaining Time</span>
                        </div>
                      </th>
                      <th className="p-2 border-r border-glass-border/20 min-w-[90px] text-center">
                        <div className="flex flex-col gap-1">
                          <span className="uppercase text-[10px] tracking-wider text-muted font-black">Stock Qty</span>
                        </div>
                      </th>
                      <th className="p-2 border-r border-glass-border/20 min-w-[110px] text-right">
                        <div className="flex flex-col gap-1 items-end">
                          <span className="uppercase text-[10px] tracking-wider text-muted font-black">MRP Price</span>
                        </div>
                      </th>
                      <th className="p-2 min-w-[130px]">
                        <div className="flex flex-col gap-1">
                          <span className="uppercase text-[10px] tracking-wider text-muted font-black">Rack Location</span>
                        </div>
                      </th>
                    </tr>
                    <tr className="bg-bg2 border-b border-glass-border/30">
                      <td className="p-2 border-r border-glass-border/20"></td>
                      <td className="p-2 border-r border-glass-border/20">
                        <input
                          type="text"
                          placeholder="Filter ID..."
                          value={colFilterId}
                          onChange={e => setColFilterId(e.target.value)}
                          className="w-full px-2 py-0.5 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                        />
                      </td>
                      <td className="p-2 border-r border-glass-border/20">
                        <input
                          type="text"
                          placeholder="Filter name..."
                          value={colFilterMedName}
                          onChange={e => setColFilterMedName(e.target.value)}
                          className="w-full px-2 py-0.5 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                        />
                      </td>
                      <td className="p-2 border-r border-glass-border/20">
                        <input
                          type="text"
                          placeholder="Filter batch..."
                          value={colFilterBatchNo}
                          onChange={e => setColFilterBatchNo(e.target.value)}
                          className="w-full px-2 py-0.5 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                        />
                      </td>
                      <td className="p-2 border-r border-glass-border/20">
                        <input
                          type="date"
                          value={colFilterDate}
                          onChange={e => setColFilterDate(e.target.value)}
                          className="w-full px-1.5 py-0.5 bg-bg3 border border-glass-border rounded text-[9px] text-text font-normal focus:outline-none focus:border-primary/50"
                        />
                      </td>
                      <td className="p-2 border-r border-glass-border/20"></td>
                      <td className="p-2 border-r border-glass-border/20">
                        <div className="flex gap-1">
                          <input
                            type="number"
                            placeholder="Min"
                            value={colFilterMinQty}
                            onChange={e => setColFilterMinQty(e.target.value)}
                            className="w-1/2 px-1 py-0.5 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50"
                          />
                          <input
                            type="number"
                            placeholder="Max"
                            value={colFilterMaxQty}
                            onChange={e => setColFilterMaxQty(e.target.value)}
                            className="w-1/2 px-1 py-0.5 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50"
                          />
                        </div>
                      </td>
                      <td className="p-2 border-r border-glass-border/20">
                        <div className="flex gap-1">
                          <input
                            type="number"
                            placeholder="Min"
                            value={colFilterMinMrp}
                            onChange={e => setColFilterMinMrp(e.target.value)}
                            className="w-1/2 px-1 py-0.5 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50 text-right"
                          />
                          <input
                            type="number"
                            placeholder="Max"
                            value={colFilterMaxMrp}
                            onChange={e => setColFilterMaxMrp(e.target.value)}
                            className="w-1/2 px-1 py-0.5 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50 text-right"
                          />
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center justify-between gap-1">
                          <input
                            type="text"
                            placeholder="Filter location..."
                            value={colFilterLocation}
                            onChange={e => setColFilterLocation(e.target.value)}
                            className="flex-1 px-2 py-0.5 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                          />
                          {(colFilterId || colFilterMedName || colFilterBatchNo || colFilterDate || colFilterMinQty || colFilterMaxQty || colFilterMinMrp || colFilterMaxMrp || colFilterLocation) && (
                            <button
                              onClick={() => {
                                setColFilterId('');
                                setColFilterMedName('');
                                setColFilterBatchNo('');
                                setColFilterDate('');
                                setColFilterMinQty('');
                                setColFilterMaxQty('');
                                setColFilterMinMrp('');
                                setColFilterMaxMrp('');
                                setColFilterLocation('');
                              }}
                              className="px-2 py-0.5 rounded bg-red/15 border border-red/30 text-red-400 hover:bg-red hover:text-white transition-all text-[9px] font-extrabold cursor-pointer whitespace-nowrap ml-1"
                              title="Clear Filters"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedItems.map(item => {
                      const daysDiff = getExpiryDaysDiff(item.expiry_date);
                      const details = getExpiryStatusDetails(daysDiff);
                      const isSelected = selectedIds.has(item.id);
                      return (
                        <tr 
                          key={item.id} 
                          className={`hover:bg-white/5 border-b border-glass-border/20 transition-all ${details.rowClass} ${isSelected ? 'bg-red-500/10' : ''}`}
                        >
                          <td className="p-4">
                            <input
                              type="checkbox"
                              className="rounded cursor-pointer"
                              checked={isSelected}
                              onChange={() => toggleSelect(item.id)}
                            />
                          </td>
                          <td className="p-4 text-muted font-mono select-none">
                            {item.id}
                          </td>
                          <td className="p-4 font-semibold text-text">
                            {item.medicine_name}
                          </td>
                          <td className="p-4 select-none">
                            <span className="font-mono bg-white/5 border border-glass-border/30 rounded px-2 py-0.5 font-semibold text-text">
                              {item.batch_no}
                            </span>
                          </td>
                          <td className="p-4 text-center font-mono select-none">
                            {(() => {
                              const d = parseDateRobust(item.expiry_date);
                              return isNaN(d.getTime()) ? item.expiry_date : d.toLocaleDateString([], { month: '2-digit', year: '2-digit' });
                            })()}
                          </td>
                          <td className="p-4 text-center font-semibold select-none">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${details.colorClass}`}>
                                {details.label}
                              </span>
                              <span className="text-[10px] text-muted font-medium">{details.daysText}</span>
                            </div>
                          </td>
                          <td className="p-4 text-center font-bold font-mono">
                            {item.quantity}
                          </td>
                          <td className="p-4 text-right font-mono font-bold text-sky">
                            ₹{item.mrp?.toFixed(2) || '0.00'}
                          </td>
                          <td className="p-4 text-muted select-none">
                            {item.rack_location || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Table Footer */}
          <div className="p-3 border-t border-glass-border bg-black/10 text-muted select-none flex justify-between items-center px-4">
            <span>Expired/Expiring Items: <strong>{filteredItems.length}</strong></span>
            {items.some(item => getExpiryDaysDiff(item.expiry_date) <= 0) && (
              <span className="flex items-center gap-1.5 text-xs text-red animate-pulse">
                <AlertTriangle size={12} />
                Attention required: Expired batches in stock
              </span>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};

export default Expiry;
