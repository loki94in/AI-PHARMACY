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
  RotateCcw
} from 'lucide-react';
import { api } from '../services/api';

interface ExpiryItem {
  id: number;
  medicine_name: string;
  batch_no: string;
  expiry_date: string;
  quantity: number;
  mrp: number;
  rack_location?: string;
}

const Expiry = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<ExpiryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [daysFilter, setDaysFilter] = useState(90);
  const [customPhone, setCustomPhone] = useState('');
  const [sendingAlerts, setSendingAlerts] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  
  // Custom Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minQty, setMinQty] = useState('');
  const [maxQty, setMaxQty] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  
  // Notification Toast State
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const fetchExpiryItems = async (days = daysFilter, showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const data = await api.getExpiryList(days);
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      if (Array.isArray(data)) {
        // STRICT RULE: Only show present month
        const filtered = data.filter((r: any) => {
          if (!r.expiry_date) return true;
          const d = new Date(r.expiry_date);
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });
        setItems(filtered);
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
    fetchExpiryItems(daysFilter);
    
    // Attempt to load settings to prefill owner/pharmacist phone number
    api.getLicenseStatus() // we can fetch details from licensing/settings if available
      .catch(err => console.error(err));
  }, [daysFilter]);

  const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 5000);
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

  // Calculations for Expiry Badging
  const getExpiryDaysDiff = (expiryDateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(expiryDateStr);
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
    const matchesSearch = item.medicine_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.batch_no.toLowerCase().includes(searchQuery.toLowerCase());
    
    let matchesDate = true;
    if (dateFrom || dateTo) {
      if (!item.expiry_date) {
        matchesDate = false;
      } else {
        const itemDate = item.expiry_date.substring(0, 10);
        const start = dateFrom || '0000-00-00';
        const end = dateTo || '9999-99-99';
        matchesDate = itemDate >= start && itemDate <= end;
      }
    }

    const matchesMinQty = !minQty || item.quantity >= Number(minQty);
    const matchesMaxQty = !maxQty || item.quantity <= Number(maxQty);

    return matchesSearch && matchesDate && matchesMinQty && matchesMaxQty;
  });

  return (
    <div className="h-full flex flex-col fade-in space-y-6">
      
      {/* Toast Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-[999999] flex items-center gap-2.5 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-2xl animate-slide-in ${
          notification.type === 'success' 
            ? 'bg-green/15 border-green/30 text-green-200' 
            : notification.type === 'error'
              ? 'bg-red/15 border-red/30 text-red-200'
              : 'bg-primary/15 border-primary/30 text-primary-light'
        }`}>
          {notification.type === 'success' ? (
            <Check className="text-green animate-bounce" size={16} />
          ) : notification.type === 'error' ? (
            <AlertCircle className="text-red" size={16} />
          ) : (
            <Bell className="text-primary animate-pulse" size={16} />
          )}
          <span className="text-xs font-semibold">{notification.message}</span>
        </div>
      )}

      {/* Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 select-none">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <CalendarDays className="text-primary" size={22} />
            Expiry Monitor
          </h2>
          <p className="text-xs text-muted mt-1">Audit near-expiry and expired stock batches, manage inventory levels, and send dispatch alerts.</p>
        </div>
        <div className="flex items-center gap-3">
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
            onClick={() => fetchExpiryItems(daysFilter, true)} 
            disabled={refreshing}
            className="p-2 rounded-lg bg-white/5 border border-glass-border hover:bg-white/10 hover:text-white transition-all text-muted"
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
        <div className="xl:col-span-3 glass-panel flex flex-col overflow-hidden bg-white/5 border-glass-border">
          
          {/* Table Toolbar (Search, Days Filters) */}
          <div className="p-4 border-b border-glass-border bg-black/10 flex flex-col gap-4">
            
            {/* Filter Tabs for Expiry Thresholds */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none select-none">
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
            
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  placeholder="Search by medicine or batch..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-black/20 border border-glass-border rounded-lg text-sm focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
                  showFilters ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-white/5 border-glass-border text-muted hover:text-text'
                }`}
              >
                Filters
              </button>
            </div>
            
            {showFilters && (
              <div className="pt-4 border-t border-glass-border flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-muted">From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className="px-3 py-1.5 bg-black/20 border border-glass-border rounded-lg text-sm text-text focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-muted">To</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    className="px-3 py-1.5 bg-black/20 border border-glass-border rounded-lg text-sm text-text focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-muted">Qty</label>
                  <input
                    type="number"
                    value={minQty}
                    onChange={e => setMinQty(e.target.value)}
                    placeholder="Min"
                    min="0"
                    max="100000000"
                    className="px-3 py-1.5 bg-black/20 border border-glass-border rounded-lg text-sm text-text focus:outline-none focus:border-primary/50 w-24"
                  />
                  <span className="text-muted text-xs">-</span>
                  <input
                    type="number"
                    value={maxQty}
                    onChange={e => setMaxQty(e.target.value)}
                    placeholder="Max"
                    min="0"
                    max="100000000"
                    className="px-3 py-1.5 bg-black/20 border border-glass-border rounded-lg text-sm text-text focus:outline-none focus:border-primary/50 w-24"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Table Container */}
          <div className="flex-1 overflow-auto bg-black/20">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-[#18181b]/95 backdrop-blur z-10 select-none">
                <tr>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border/60 w-8">
                    <input type="checkbox" className="rounded" onChange={e => {
                      if (e.target.checked) setSelectedIds(new Set(filteredItems.map(i => i.id)));
                      else setSelectedIds(new Set());
                    }} checked={selectedIds.size === filteredItems.length && filteredItems.length > 0} readOnly />
                  </th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border/60">ID</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border/60">Medicine Name</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border/60">Batch Number</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border/60 text-center">Expiry Date</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border/60 text-center">Remaining Time</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border/60 text-center">Stock Qty</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border/60 text-right">MRP Price</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border/60">Rack Location</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-muted font-semibold">
                      <RefreshCw size={24} className="animate-spin mx-auto mb-3 text-primary opacity-60" />
                      Loading expiry register...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-16 text-center text-muted font-semibold">
                      <CheckCircle2 size={36} className="mx-auto mb-3 text-muted/30" />
                      No items matching expiry thresholds in inventory.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map(item => {
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
                          {new Date(item.expiry_date).toLocaleDateString([], { month: '2-digit', year: '2-digit' })}
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
                  })
                )}
              </tbody>
            </table>
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
