import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../../services/api';
import { Search, Filter, Download, Eye, Clock, CheckCircle, XCircle, AlertCircle, Database, RefreshCw, Paperclip, Trash2, Edit, ChevronDown, ChevronUp, Calendar, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PurchaseTransaction {
  id: number;
  invoice_no: string;
  date: string;
  total_amount: number;
  distributor_name: string;
  status?: string; // Paid, Pending, Refunded, Failed
  plan?: string;
  items?: any[];
  total_qty?: number;
  cn_amount?: number;
  cn_number?: string;
  original_amount?: number;
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
let cachedTransactions: PurchaseTransaction[] | null = null;

const PurchaseHistory = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [transactions, setTransactions] = useState<PurchaseTransaction[]>(cachedTransactions || []);
  const [loading, setLoading] = useState(!cachedTransactions);
  
  const [colFilterId, setColFilterId] = useState('');
  const [colFilterDistributor, setColFilterDistributor] = useState('');
  const [colFilterInvoiceNo, setColFilterInvoiceNo] = useState('');
  const [colFilterDate, setColFilterDate] = useState('');
  const [colFilterMinAmount, setColFilterMinAmount] = useState('');
  const [colFilterMaxAmount, setColFilterMaxAmount] = useState('');

  // Debounced filters to avoid database/CPU saturation
  const [debouncedFilters, setDebouncedFilters] = useState({
    id: '',
    distributor: '',
    invoiceNo: '',
    date: '',
    minAmount: '',
    maxAmount: ''
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

    // Debounce text and amount inputs by 2 seconds to prevent rapid changes while typing
    const handler = setTimeout(() => {
      setDebouncedFilters(prev => {
        const nextId = (colFilterId.length === 0 || colFilterId.length >= 3) ? colFilterId : prev.id;
        const nextDistributor = (colFilterDistributor.length === 0 || colFilterDistributor.length >= 3) ? colFilterDistributor : prev.distributor;
        const nextInvoiceNo = (colFilterInvoiceNo.length === 0 || colFilterInvoiceNo.length >= 3) ? colFilterInvoiceNo : prev.invoiceNo;
        const nextMinAmount = colFilterMinAmount;
        const nextMaxAmount = colFilterMaxAmount;

        if (
          prev.id !== nextId ||
          prev.distributor !== nextDistributor ||
          prev.invoiceNo !== nextInvoiceNo ||
          prev.minAmount !== nextMinAmount ||
          prev.maxAmount !== nextMaxAmount
        ) {
          return {
            ...prev,
            id: nextId,
            distributor: nextDistributor,
            invoiceNo: nextInvoiceNo,
            minAmount: nextMinAmount,
            maxAmount: nextMaxAmount
          };
        }
        return prev;
      });
    }, 2000);

    return () => clearTimeout(handler);
  }, [colFilterId, colFilterDistributor, colFilterInvoiceNo, colFilterDate, colFilterMinAmount, colFilterMaxAmount]);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedFilters]);

  // Reconciliation States
  const [activeTab, setActiveTab] = useState<'history' | 'reconciliation'>(
    (location.state as any)?.activeTab || 'history'
  );

  useEffect(() => {
    if ((location.state as any)?.activeTab) {
      setActiveTab((location.state as any).activeTab);
    }
  }, [location.state]);
  const [reconciliationList, setReconciliationList] = useState<any[]>([]);
  const [loadingRecon, setLoadingRecon] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [reissuingUid, setReissuingUid] = useState<number | null>(null);
  const [resolvingUid, setResolvingUid] = useState<number | null>(null);
  const [viewPurchase, setViewPurchase] = useState<any | null>(null);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const data = await api.getPurchases({
        limit: 5000 // Fetch a large history so local column filtering works over all recent items
      });
      setTransactions(Array.isArray(data) ? data : []);
      cachedTransactions = Array.isArray(data) ? data : [];
    } catch (err) {
      console.error('Error fetching purchase history', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    fetchReconciliation();
  }, []);

  const fetchReconciliation = async () => {
    try {
      setLoadingRecon(true);
      const data = await api.getReconciliationList();
      setReconciliationList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error fetching reconciliation list:', err);
    } finally {
      setLoadingRecon(false);
    }
  };

  const handleReissue = async (uid: number) => {
    if (!confirm('Are you sure you want to reprocess this email and reissue the items to inventory? This will record a new purchase invoice.')) {
      return;
    }
    try {
      setReissuingUid(uid);
      const result = await api.reissueOrder(uid);
      alert(result.message || 'Items successfully reissued to inventory!');
      await fetchHistory();
      await fetchReconciliation();
      if (selectedOrder?.email_uid === uid) {
        setSelectedOrder(null);
      }
    } catch (err: any) {
      console.error('Reissue error:', err);
      alert('Failed to reissue items: ' + (err.response?.data?.error || err.message));
    } finally {
      setReissuingUid(null);
    }
  };

  const handleResolveManually = async (uid: number) => {
    if (!confirm('Mark this email order as manually resolved/saved? This will not add items to inventory.')) {
      return;
    }
    try {
      setResolvingUid(uid);
      const result = await api.resolveOrderManually(uid);
      alert(result.message || 'Order resolved manually.');
      await fetchReconciliation();
      if (selectedOrder?.email_uid === uid) {
        setSelectedOrder(null);
      }
    } catch (err: any) {
      console.error('Resolve manually error:', err);
      alert('Failed to resolve order: ' + (err.response?.data?.error || err.message));
    } finally {
      setResolvingUid(null);
    }
  };

  const openView = async (id: number) => {
    try {
      const data = await api.getPurchase(id);
      setViewPurchase(data);
    } catch (err) {
      console.error('Failed to load purchase details:', err);
      alert('Failed to load purchase details.');
    }
  };

  const openEdit = async (id: number) => {
    try {
      const data = await api.getPurchase(id);
      navigate('/manual-purchase', {
        state: {
          prefilledPurchase: {
            editPurchaseId: data.purchase.id,
            distributorName: data.purchase.distributor_name,
            invoiceNo: data.purchase.invoice_no,
            date: data.purchase.date,
            totalAmount: data.purchase.total_amount,
            globalCdPer: 0,
            cnAmount: data.purchase.cn_amount || 0,
            cnNumber: data.purchase.cn_number || '',
            reconcileExpiryReturnId: data.purchase.reconcile_expiry_return_id || null,
            items: data.items.map((item: any) => ({
              medicine_id: item.medicine_id,
              medicine_name: item.medicine_name,
              batch_no: item.batch_no,
              expiry_date: item.expiry_date,
              qty: item.quantity,
              free_qty: item.free_qty || 0,
              rate: item.cost_price,
              mrp: item.mrp,
              cgst_per: item.cgst_per,
              sgst_per: item.sgst_per,
              cd_per: item.cd_per || 0,
              cd_rs: item.cd_value || 0
            }))
          }
        }
      });
    } catch (err) {
      console.error('Failed to load purchase details:', err);
      alert('Failed to load purchase details.');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'Paid': return 'text-green-400 bg-green-400/10 border-green-400/20';
      case 'Pending': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
      case 'Refunded': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
      case 'Failed': return 'text-red-400 bg-red-400/10 border-red-400/20';
      default: return 'text-gray-400 bg-gray-400/10 border-gray-400/20';
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'Paid': return <CheckCircle size={14} className="mr-1" />;
      case 'Pending': return <Clock size={14} className="mr-1" />;
      case 'Refunded': return <AlertCircle size={14} className="mr-1" />;
      case 'Failed': return <XCircle size={14} className="mr-1" />;
      default: return null;
    }
  };

  // Filter Logic
  const filteredData = transactions.filter(t => {
    // Column header filters using debounced values
    if (debouncedFilters.id && !t.id.toString().includes(debouncedFilters.id)) {
      return false;
    }
    if (debouncedFilters.distributor && !(t.distributor_name || '').toLowerCase().includes(debouncedFilters.distributor.toLowerCase())) {
      return false;
    }
    if (debouncedFilters.invoiceNo && !(t.invoice_no || '').toLowerCase().includes(debouncedFilters.invoiceNo.toLowerCase())) {
      return false;
    }
    if (debouncedFilters.date) {
      const pDate = t.date ? t.date.substring(0, 10) : '';
      if (pDate !== debouncedFilters.date) return false;
    }
    const amountVal = t.total_amount || 0;
    const minVal = debouncedFilters.minAmount ? Number(debouncedFilters.minAmount) : 0;
    const maxVal = debouncedFilters.maxAmount ? Number(debouncedFilters.maxAmount) : 100000000;
    if (amountVal < minVal || amountVal > maxVal) {
      return false;
    }

    return true;
  });

  const isDateFiltered = !!(colFilterDate || debouncedFilters.date);
  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = isDateFiltered ? filteredData : filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Purchase Analytics
  const totalPurchases = filteredData.length;
  const totalAmount = filteredData.reduce((sum, t) => sum + (t.total_amount || 0), 0);
  const paidAmount = totalAmount; // Cash workflow, all are paid


  // Export Logic
  const exportToCSV = () => {
    if (filteredData.length === 0) {
      alert('No data to export!');
      return;
    }

    const headers = ['Purchase ID', 'Invoice No', 'Distributor', 'Date', 'Amount'];
    const csvRows = [headers.join(',')];

    filteredData.forEach(tx => {
      const row = [
        tx.id,
        `"${tx.invoice_no || ''}"`,
        `"${tx.distributor_name || ''}"`,
        `"${new Date(tx.date).toLocaleDateString()}"`,
        tx.total_amount || 0
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `Purchase_History_${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getUnreconciledCount = () => {
    return reconciliationList.filter(o => o.status === 'Missing' && !o.is_saved).length;
  };

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden relative">
      {/* Tabs with Actions */}
      <div className="flex justify-between items-center border-b border-glass-border/30 mb-0">
        <div className="flex">
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all ${
              activeTab === 'history'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            Purchase History
          </button>
          <button
            onClick={() => setActiveTab('reconciliation')}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'reconciliation'
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-400 hover:text-white'
            }`}
          >
            Reconcile Distributor Orders
            {getUnreconciledCount() > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse">
                {getUnreconciledCount()} Missing
              </span>
            )}
          </button>
        </div>

        {activeTab === 'history' && (
          <button 
            onClick={exportToCSV}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-1.5 bg-bg2/80 backdrop-blur-md hover:bg-primary/20 hover:shadow-[0_0_15px_rgba(37,99,235,0.3)] px-5 py-3 rounded-full text-primary text-sm font-bold transition-all hover:scale-105 active:scale-95 border border-primary/30 shadow-2xl"
          >
            <Download size={16} />
            Export CSV
          </button>
        )}
      </div>

      {activeTab === 'history' ? (
        <>
          {/* Purchase History Tab */}
          {/* Purchase Analytics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 bg-bg2/20 border border-glass-border/50 rounded-xl z-30 relative select-none text-center divide-x divide-glass-border/30">
            <div className="py-2 px-4 flex items-center justify-between">
              <span className="text-muted text-xs font-semibold uppercase tracking-wider">Total Purchases</span>
              <span className="text-lg font-bold text-text">{totalPurchases}</span>
            </div>
            <div className="py-2 px-4 flex items-center justify-between">
              <span className="text-muted text-xs font-semibold uppercase tracking-wider">Total Value</span>
              <span className="text-lg font-bold text-primary">₹{totalAmount.toFixed(2)}</span>
            </div>
            <div className="py-2 px-4 flex items-center justify-between">
              <span className="text-muted text-xs font-semibold uppercase tracking-wider">Total Paid</span>
              <span className="text-lg font-bold text-green">₹{paidAmount.toFixed(2)}</span>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 bg-glass-bg rounded-2xl flex flex-col min-h-0 overflow-hidden relative z-10 animate-in fade-in duration-300">
            <div className="flex-1 flex flex-col min-h-0 p-4 overflow-hidden bg-bg2/15">
              {loading ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted">
                  <div className="animate-pulse">Loading purchase history...</div>
                </div>
              ) : filteredData.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted">
                  <Database size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="font-semibold">No transactions found</p>
                  <p className="text-xs mt-1">Try adjusting your search or filters</p>
                </div>
              ) : (
                <div className="flex-1 border border-glass-border/30 rounded-xl overflow-auto bg-glass-bg custom-scrollbar min-h-0 relative">
                  <table className="w-full text-left border-collapse text-[11px] font-semibold text-text min-w-full">
                    <thead className="sticky top-0 z-20 bg-bg2 shadow-sm">
                      <tr className="bg-bg2 border-b border-glass-border/30 text-muted font-bold text-[10px] align-top">
                        <th className="p-2 border-r border-glass-border/20 min-w-[100px]">
                          <div className="flex flex-col gap-1.5">
                            <span className="uppercase text-[9px] tracking-wider text-muted font-black">Purchase ID</span>
                            <input
                              type="text"
                              placeholder="Search ID..."
                              value={colFilterId}
                              onChange={e => setColFilterId(e.target.value)}
                              className="w-full px-2 py-1 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                            />
                          </div>
                        </th>
                        <th className="p-2 border-r border-glass-border/20 min-w-[180px]">
                          <div className="flex flex-col gap-1.5">
                            <span className="uppercase text-[9px] tracking-wider text-muted font-black">Distributor Name</span>
                            <input
                              type="text"
                              placeholder="Search distributor..."
                              value={colFilterDistributor}
                              onChange={e => setColFilterDistributor(e.target.value)}
                              className="w-full px-2 py-1 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                            />
                          </div>
                        </th>
                        <th className="p-2 border-r border-glass-border/20 min-w-[120px]">
                          <div className="flex flex-col gap-1.5">
                            <span className="uppercase text-[9px] tracking-wider text-muted font-black">Invoice No.</span>
                            <input
                              type="text"
                              placeholder="Search invoice..."
                              value={colFilterInvoiceNo}
                              onChange={e => setColFilterInvoiceNo(e.target.value)}
                              className="w-full px-2 py-1 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                            />
                          </div>
                        </th>
                        <th className="p-2 border-r border-glass-border/20 min-w-[120px]">
                          <div className="flex flex-col gap-1.5">
                            <span className="uppercase text-[9px] tracking-wider text-muted font-black">Date</span>
                            <input
                              type="date"
                              value={colFilterDate}
                              onChange={e => setColFilterDate(e.target.value)}
                              className="w-full px-1.5 py-1 bg-bg3 border border-glass-border rounded text-[9px] text-text font-normal focus:outline-none focus:border-primary/50"
                            />
                          </div>
                        </th>
                        <th className="p-2 border-r border-glass-border/20 min-w-[150px] text-right">
                          <div className="flex flex-col gap-1.5 items-end">
                            <span className="uppercase text-[9px] tracking-wider text-muted font-black">Amount</span>
                            <div className="flex gap-1 w-full justify-end">
                              <input
                                type="number"
                                placeholder="Min"
                                value={colFilterMinAmount}
                                onChange={e => setColFilterMinAmount(e.target.value)}
                                className="w-16 px-1 py-1 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50"
                              />
                              <input
                                type="number"
                                placeholder="Max"
                                value={colFilterMaxAmount}
                                onChange={e => setColFilterMaxAmount(e.target.value)}
                                className="w-16 px-1 py-1 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50"
                              />
                            </div>
                          </div>
                        </th>
                        <th className="p-2 text-center min-w-[100px] align-bottom">
                          <div className="flex flex-col gap-1.5 items-center justify-end h-full">
                            <span className="uppercase text-[9px] tracking-wider text-muted font-black">Actions</span>
                            {(colFilterId || colFilterDistributor || colFilterInvoiceNo || colFilterDate || colFilterMinAmount || colFilterMaxAmount) ? (
                              <button
                                onClick={() => {
                                  setColFilterId('');
                                  setColFilterDistributor('');
                                  setColFilterInvoiceNo('');
                                  setColFilterDate('');
                                  setColFilterMinAmount('');
                                  setColFilterMaxAmount('');
                                }}
                                className="px-2 py-1 rounded bg-red/15 border border-red/30 text-red-400 hover:bg-red hover:text-white transition-all text-[9px] font-extrabold cursor-pointer h-[26px] w-full"
                                title="Clear Filters"
                              >
                                Reset
                              </button>
                            ) : (
                               <div className="h-[26px]"></div>
                            )}
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-glass-border/30 text-[11px]">
                      {filteredData.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-muted">No purchase transactions matching the filters.</td>
                        </tr>
                      ) : (
                        filteredData.map((tx) => (
                          <tr key={tx.id} className="hover:bg-white/10 transition-all duration-300 group hover:shadow-lg hover:-translate-y-0.5 border-b border-glass-border/30">
                            <td className="p-4 relative">
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-primary to-blue-500 scale-y-0 group-hover:scale-y-100 transition-transform duration-300 origin-center"></div>
                              <span className="font-mono text-sm font-bold text-primary bg-primary/10 px-2 py-1 rounded-md border border-primary/20 shadow-sm">#{tx.id}</span>
                            </td>
                            <td className="p-4 text-sm font-bold text-text group-hover:text-primary transition-colors">
                              {tx.distributor_name}
                            </td>
                            <td className="p-4 font-mono text-sm text-text">
                              {tx.invoice_no || 'N/A'}
                            </td>
                            <td className="p-4 text-sm text-muted">
                              {new Date(tx.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="p-4 text-right">
                              <span className="text-sm font-bold text-green">₹{(tx.total_amount || 0).toFixed(2)}</span>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                <button
                                  onClick={() => openView(tx.id)}
                                  className="p-2 rounded-lg bg-white/5 hover:bg-sky-500 hover:text-white border border-glass-border hover:border-sky-500 shadow-sm hover:shadow-[0_0_15px_rgba(14,165,233,0.4)] text-muted transition-all transform hover:scale-105 active:scale-95"
                                  title="View Details"
                                >
                                  <Eye size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Reconciliation Tab */}
          <div className="flex justify-between items-center bg-white/10 backdrop-blur-lg border border-white/20 border-b-0 p-5 rounded-t-xl relative z-20">
            <div>
              <h3 className="text-white font-semibold text-base">Unreconciled Distributor Orders</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                Automatically scans incoming email receipts to check if they have been successfully booked to inventory.
              </p>
            </div>
            <button
              onClick={fetchReconciliation}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-glass-border text-white text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              <RefreshCw size={14} className={loadingRecon ? 'animate-spin' : ''} />
              Reload List
            </button>
          </div>

          <div className="bg-white/10 backdrop-blur-lg rounded-b-xl border border-white/20 flex-1 flex flex-col min-h-0 relative z-10 overflow-hidden shadow-2xl">
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 z-20 bg-[#18181b]/95 backdrop-blur-sm shadow-sm">
                  <tr className="bg-black/40 border-b border-glass-border/50 text-sm font-semibold text-gray-300">
                    <th className="px-6 py-4 whitespace-nowrap">Received Date</th>
                    <th className="px-6 py-4 whitespace-nowrap">Distributor / Sender</th>
                    <th className="px-6 py-4 whitespace-nowrap">Extracted Invoice No.</th>
                    <th className="px-6 py-4 whitespace-nowrap">Medicines</th>
                    <th className="px-6 py-4 whitespace-nowrap text-center">Status</th>
                    <th className="px-6 py-4 whitespace-nowrap text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-glass-border/30 text-sm">
                  {loadingRecon ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                        <div className="flex justify-center items-center gap-2">
                          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                          Analyzing email receipts...
                        </div>
                      </td>
                    </tr>
                  ) : reconciliationList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                        <div className="flex flex-col items-center justify-center">
                          <CheckCircle size={48} className="text-green-500 mb-4 opacity-40" />
                          <p className="text-base font-bold text-white">All Clear!</p>
                          <p className="text-xs opacity-70 mt-1">No unreconciled or missing distributor orders detected from emails.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    reconciliationList.map((recon, idx) => (
                      <tr key={recon.email_uid || idx} className={`hover:bg-white/5 transition-colors ${recon.is_saved ? 'opacity-60' : ''}`}>
                        <td className="px-6 py-4 text-gray-400 whitespace-nowrap font-mono text-xs">
                          {new Date(recon.date).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-white font-medium">
                          {recon.extracted_distributor}
                          <div className="text-xs text-gray-500 font-normal mt-0.5 truncate max-w-[200px]">{recon.from}</div>
                        </td>
                        <td className="px-6 py-4 font-mono text-white text-xs">
                          {recon.extracted_invoice_no || 'N/A'}
                        </td>
                        <td className="px-6 py-4">
                          {(() => {
                            // Filter out entries that look like IDs, bill numbers, or invoice numbers (purely numeric or short numeric codes)
                            const validNames = (recon.medicine_names || []).filter((name: string) => {
                              if (!name || typeof name !== 'string') return false;
                              const trimmed = name.trim();
                              // Exclude purely numeric strings (IDs, bill numbers)
                              if (/^\d+$/.test(trimmed)) return false;
                              // Exclude common invoice/bill patterns like "INV-123", "BILL-456", "#12345"
                              if (/^(inv|bill|invoice|id|order|ref|no)[\s\-:#]?\d+$/i.test(trimmed)) return false;
                              if (/^#\d+$/.test(trimmed)) return false;
                              // Exclude very short strings (likely codes, not medicine names)
                              if (trimmed.length < 3) return false;
                              return true;
                            });
                            return validNames.length > 0 ? (
                              <div className="text-gray-300 max-w-xs truncate" title={validNames.join(', ')}>
                                {validNames.slice(0, 3).join(', ')}
                                {validNames.length > 3 && ` +${validNames.length - 3} more`}
                              </div>
                            ) : (
                              <span className="text-gray-500 text-xs italic">No medicines detected</span>
                            );
                          })()}
                        </td>
                        <td className="px-6 py-4 text-center">
                          {recon.is_saved ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border text-green-400 bg-green-400/10 border-green-400/20">
                              <CheckCircle size={10} className="mr-1" /> Reconciled
                            </span>
                          ) : recon.status === 'Matched' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border text-yellow-400 bg-yellow-400/10 border-yellow-400/20">
                              <Clock size={10} className="mr-1" /> Unresolved (Matched)
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border text-red-400 bg-red-400/10 border-red-400/20">
                              <AlertCircle size={10} className="mr-1" /> Missing
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => setSelectedOrder(recon)}
                              className="text-gray-400 hover:text-white transition-colors p-1.5 rounded bg-white/5 hover:bg-white/10 border border-glass-border/30"
                              title="Investigate Order"
                            >
                              <Eye size={14} />
                            </button>
                            {!recon.is_saved && (
                              <>
                                <button
                                  onClick={() => handleReissue(recon.email_uid)}
                                  disabled={reissuingUid !== null}
                                  className="text-green-400 hover:text-green-300 transition-colors p-1.5 rounded bg-green-500/10 hover:bg-green-500/20 border border-green-500/20"
                                  title="Reprocess & Reissue items to inventory"
                                >
                                  <RefreshCw size={14} className={reissuingUid === recon.email_uid ? 'animate-spin' : ''} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Investigation Modal */}
      {selectedOrder && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-modal flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-2xl overflow-hidden shadow-2xl animate-in fade-in duration-200">
            <div className="p-6 border-b border-glass-border/30 flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <AlertCircle size={20} className="text-primary" />
                  Investigate Distributor Order
                </h3>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 p-1.5 rounded-lg border border-glass-border/30 transition-all text-xl font-bold"
              >
                &times;
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6 text-sm">
              {/* Metadata Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-black/20 p-4 rounded-xl border border-glass-border/20">
                <div>
                  <span className="text-xs text-gray-400 block mb-1">Distributor</span>
                  <strong className="text-white text-base">{selectedOrder.extracted_distributor || 'N/A'}</strong>
                </div>
                <div>
                  <span className="text-xs text-gray-400 block mb-1">Bill Number</span>
                  <strong className="text-white text-base">{selectedOrder.extracted_invoice_no || 'N/A'}</strong>
                </div>
              </div>

              {/* Medicines List */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-sky uppercase tracking-wide">Medicines in Order</h4>
                {selectedOrder.medicine_names && selectedOrder.medicine_names.length > 0 ? (
                  <div className="space-y-1.5">
                    {selectedOrder.medicine_names.map((name: string, i: number) => (
                      <div key={i} className="bg-white/5 border border-glass-border/20 p-3 rounded-xl flex justify-between items-center">
                        <span className="font-medium text-xs text-gray-300">{name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-gray-500 text-xs italic bg-white/5 p-3 rounded-xl border border-glass-border/20">
                    No medicines detected in this order
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-glass-border/30 bg-black/20 flex flex-wrap gap-3 justify-end">
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-glass-border/40 transition-all"
              >
                Close
              </button>
              {!selectedOrder.is_saved && (
                <>
                  <button
                    onClick={() => handleResolveManually(selectedOrder.email_uid)}
                    disabled={resolvingUid !== null}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 transition-all flex items-center gap-1.5"
                  >
                    {resolvingUid === selectedOrder.email_uid ? 'Resolving...' : 'Resolve Manually'}
                  </button>
                  <button
                    onClick={() => handleReissue(selectedOrder.email_uid)}
                    disabled={reissuingUid !== null}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-xl bg-green-500 hover:bg-green-600 text-white font-bold shadow-lg shadow-green-500/20 transition-all flex items-center gap-1.5"
                  >
                    {reissuingUid === selectedOrder.email_uid ? 'Reissuing...' : 'Reprocess & Reissue to Inventory'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* View Purchase Modal */}
      {viewPurchase && createPortal(
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-modal flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-4xl overflow-hidden shadow-2xl animate-in fade-in duration-200">
            <div className="p-6 border-b border-glass-border/30 flex justify-between items-center bg-black/40">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Eye size={20} className="text-primary" />
                  View Purchase Invoice: {viewPurchase.purchase.invoice_no || 'N/A'}
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  Distributor: {viewPurchase.purchase.distributor_name} &middot; Date: {new Date(viewPurchase.purchase.date).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => setViewPurchase(null)}
                className="text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 p-1.5 rounded-lg border border-glass-border/30 transition-all text-xl font-bold"
              >
                &times;
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh] space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-black/20 p-4 rounded-xl border border-glass-border/20">
                 <div>
                    <span className="text-xs text-gray-500 block mb-1">Invoice No.</span>
                    <strong className="text-white text-sm">{viewPurchase.purchase.invoice_no || 'N/A'}</strong>
                 </div>
                 <div>
                    <span className="text-xs text-gray-500 block mb-1">Date</span>
                    <strong className="text-white text-sm">{new Date(viewPurchase.purchase.date).toLocaleDateString()}</strong>
                 </div>
                 <div>
                    <span className="text-xs text-gray-500 block mb-1">Distributor</span>
                    <strong className="text-white text-sm">{viewPurchase.purchase.distributor_name}</strong>
                 </div>
                 <div>
                    <span className="text-xs text-gray-500 block mb-1">Total Amount</span>
                    <strong className="text-green-400 text-sm font-bold">₹{viewPurchase.purchase.total_amount?.toFixed(2) || '0.00'}</strong>
                 </div>
              </div>

              {viewPurchase.purchase.cn_amount > 0 && (
                <div className="bg-sky-950/20 border border-sky-500/20 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 font-bold text-lg font-mono">
                      CN
                    </div>
                    <div>
                      <span className="text-xs text-sky-300 font-semibold block">Credit Note Applied</span>
                      <span className="text-xs text-gray-400 font-mono">No: {viewPurchase.purchase.cn_number || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <span className="text-xs text-gray-500 block">Original Bill Total</span>
                      <span className="text-sm text-gray-300 font-medium line-through">
                        ₹{(viewPurchase.purchase.original_amount || (viewPurchase.purchase.total_amount + viewPurchase.purchase.cn_amount)).toFixed(2)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-sky-400 block">CN Discount</span>
                      <span className="text-sm text-sky-400 font-semibold">
                        -₹{viewPurchase.purchase.cn_amount.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-gray-400 block">Net Amount Paid</span>
                      <span className="text-sm text-green-400 font-bold">
                        ₹{viewPurchase.purchase.total_amount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <h4 className="text-sm font-bold text-gray-300 mb-3">Items</h4>
                <div className="border border-glass-border/20 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-black/40 text-gray-400 border-b border-glass-border/20 text-xs uppercase">
                      <tr>
                        <th className="px-4 py-3">Medicine</th>
                        <th className="px-4 py-3">Batch</th>
                        <th className="px-4 py-3">Expiry</th>
                        <th className="px-4 py-3 text-right">Qty</th>
                        <th className="px-4 py-3 text-right">Free</th>
                        <th className="px-4 py-3 text-right">Rate</th>
                        <th className="px-4 py-3 text-right">MRP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-glass-border/10">
                      {viewPurchase.items && viewPurchase.items.map((item: any, i: number) => (
                        <tr key={i} className="hover:bg-white/5">
                          <td className="px-4 py-3 text-white font-medium">{item.medicine_name}</td>
                          <td className="px-4 py-3 text-gray-300 font-mono text-xs">{item.batch_no || '-'}</td>
                          <td className="px-4 py-3 text-gray-300 text-xs">{item.expiry_date || '-'}</td>
                          <td className="px-4 py-3 text-right text-gray-300">{item.quantity}</td>
                          <td className="px-4 py-3 text-right text-gray-300">{item.free_qty || 0}</td>
                          <td className="px-4 py-3 text-right text-gray-300">₹{(Number(item.cost_price) || 0).toFixed(2)}</td>
                          <td className="px-4 py-3 text-right text-gray-300">₹{(Number(item.mrp) || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            
            <div className="p-5 border-t border-glass-border/30 bg-black/20 flex justify-end gap-3">
              <button
                onClick={() => setViewPurchase(null)}
                className="px-5 py-2 text-sm font-bold rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-glass-border/40 transition-all"
              >
                Close Preview
              </button>
              <button
                onClick={() => {
                  const idToEdit = viewPurchase.purchase.id;
                  setViewPurchase(null);
                  openEdit(idToEdit);
                }}
                className="px-5 py-2 text-sm font-bold rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 transition-all flex items-center gap-2"
              >
                <Edit size={16} />
                Edit Purchase
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    {/* Edit Purchase Modal */}
      {/* Floating Action Buttons (Removed floating buttons, now rendered inline in search toolbar to avoid overlaying/stacking issues) */}
    </div>
  );
};

export default PurchaseHistory;
