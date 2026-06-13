import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Database as DatabaseIcon, Search, RefreshCw, BookOpen, ArrowDownAZ, Clock, X } from 'lucide-react';
import { api } from '../services/api';

interface MedicineRow {
  id: number;
  name: string;
  generic_name?: string;
  manufacturer?: string;
  marketed_by?: string;
  strength?: string;
  packaging?: string;
  pack_unit?: string;
  item_code?: string;
  category?: string;
  api_reference?: string;
  mrp?: number;
  last_purchase_rate?: number;
  last_purchase_mrp?: number;
  last_distributor_name?: string;
}

const DatabasePage = () => {
  const [medicines, setMedicines] = useState<MedicineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [appending, setAppending] = useState(false);
  const [productNameInput, setProductNameInput] = useState('');
  const [productNameTerm, setProductNameTerm] = useState('');
  const [mrpInput, setMrpInput] = useState('');
  const [mrpTerm, setMrpTerm] = useState('');
  const [apiInput, setApiInput] = useState('');
  const [apiTerm, setApiTerm] = useState('');
  const [packagingInput, setPackagingInput] = useState('');
  const [packagingTerm, setPackagingTerm] = useState('');
  const [distributorInput, setDistributorInput] = useState('');
  const [distributorTerm, setDistributorTerm] = useState('');
  const [sort, setSort] = useState('name_asc');
  const [letter, setLetter] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  // Price History Modal States
  const [showPriceHistoryModal, setShowPriceHistoryModal] = useState(false);
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [priceHistoryMedicine, setPriceHistoryMedicine] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);

  const openPriceHistory = (medicineName: string) => {
    setPriceHistoryMedicine(medicineName);
    setShowPriceHistoryModal(true);
    setLoadingHistory(true);
    setPriceHistory([]);
    
    api.getMedicinePriceHistory(medicineName)
      .then((res: any) => {
        setPriceHistory(res.data || []);
        setLoadingHistory(false);
      })
      .catch((err: any) => {
        console.error('Failed to load medicine price history:', err);
        setLoadingHistory(false);
      });
  };
  const limit = 100;
  
  const observerTarget = useRef<HTMLTableRowElement>(null);

  const loadDatabase = useCallback(() => {
    if (page === 1) setLoading(true);
    else setAppending(true);

    api.getMedicines(page, limit, '', sort, letter, productNameTerm, mrpTerm, apiTerm, packagingTerm, distributorTerm)
      .then((res: any) => {
        if (page === 1) {
          setMedicines(res.data || []);
        } else {
          setMedicines(prev => {
            const newIds = new Set((res.data || []).map((m: any) => m.id));
            const filteredPrev = prev.filter(p => !newIds.has(p.id));
            return [...filteredPrev, ...(res.data || [])];
          });
        }
        setTotalPages(res.totalPages || 1);
        setTotalItems(res.totalItems || 0);
        setLoading(false);
        setAppending(false);
      })
      .catch((err) => {
        console.error('Failed to load medicines database:', err);
        setLoading(false);
        setAppending(false);
      });
  }, [page, limit, sort, letter, productNameTerm, mrpTerm, apiTerm, packagingTerm, distributorTerm]);

  useEffect(() => {
    loadDatabase();
  }, [loadDatabase]);

  // Infinite Scroll Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && !loading && !appending && page < totalPages) {
          setPage(p => p + 1);
        }
      },
      { threshold: 0.1 }
    );
    
    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }
    
    return () => observer.disconnect();
  }, [loading, appending, page, totalPages]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1); // Reset to page 1 on new search
      setProductNameTerm(productNameInput);
      setMrpTerm(mrpInput);
      setApiTerm(apiInput);
      setPackagingTerm(packagingInput);
      setDistributorTerm(distributorInput);
    }, 500);
    return () => clearTimeout(timer);
  }, [productNameInput, mrpInput, apiInput, packagingInput, distributorInput]);

  return (
    <div className="h-full flex flex-col fade-in relative gap-2">
      <div className="glass-panel flex-1 flex flex-col overflow-hidden">
        
        {/* Floating Actions */}
        <div className="absolute bottom-8 right-8 flex flex-col gap-3 z-30">
          <button 
            className="w-12 h-12 rounded-full shadow-[0_0_15px_rgba(14,165,233,0.3)] bg-bg3 border border-glass-border hover:bg-bg2 text-sky-400 flex items-center justify-center transition-all group hover:-translate-y-1"
            onClick={() => { setPage(1); setSort(s => s === 'name_asc' ? 'id_desc' : 'name_asc'); }} 
            title="Toggle Sort Order"
          >
            {sort === 'name_asc' ? <ArrowDownAZ size={20} className="group-hover:scale-110 transition-transform" /> : <Clock size={20} className="group-hover:scale-110 transition-transform" />}
          </button>

          <button 
            className="w-12 h-12 rounded-full shadow-[0_0_20px_rgba(14,165,233,0.5)] bg-sky-500 text-white hover:bg-sky-400 flex items-center justify-center transition-all group hover:-translate-y-1"
            onClick={() => { setPage(1); loadDatabase(); }} 
            title="Refresh Data"
          >
            <RefreshCw size={20} className={loading && page === 1 ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} /> 
          </button>
        </div>



        {/* Data Table */}
        <div className="flex-1 overflow-auto bg-bg2 relative">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-bg/95 backdrop-blur z-10 shadow-md">
              <tr>
                <th className="p-4 text-[11px] font-bold text-muted uppercase tracking-wider border-b border-glass-border w-16">ID</th>
                <th className="p-4 text-[11px] font-bold text-muted uppercase tracking-wider border-b border-glass-border align-top">
                  <div className="flex flex-col gap-2">
                    <span>Product Name</span>
                    <input 
                      type="text" 
                      placeholder="Filter name..." 
                      className="w-full bg-bg3 border border-glass-border rounded px-2 py-1 text-xs text-text focus:outline-none focus:border-sky-500/50 font-normal normal-case"
                      value={productNameInput}
                      onChange={e => setProductNameInput(e.target.value)}
                    />
                  </div>
                </th>
                <th className="p-4 text-[11px] font-bold text-muted uppercase tracking-wider border-b border-glass-border align-top">
                  <div className="flex flex-col gap-2">
                    <span>Composition (API)</span>
                    <input 
                      type="text" 
                      placeholder="Filter composition..." 
                      className="w-full bg-bg3 border border-glass-border rounded px-2 py-1 text-xs text-text focus:outline-none focus:border-sky-500/50 font-normal normal-case"
                      value={apiInput}
                      onChange={e => setApiInput(e.target.value)}
                    />
                  </div>
                </th>
                <th className="p-4 text-[11px] font-bold text-muted uppercase tracking-wider border-b border-glass-border align-top">Strength</th>
                <th className="p-4 text-[11px] font-bold text-muted uppercase tracking-wider border-b border-glass-border align-top">
                  <div className="flex flex-col gap-2">
                    <span>Packaging</span>
                    <input 
                      type="text" 
                      placeholder="Filter packing..." 
                      className="w-full bg-bg3 border border-glass-border rounded px-2 py-1 text-xs text-text focus:outline-none focus:border-sky-500/50 font-normal normal-case"
                      value={packagingInput}
                      onChange={e => setPackagingInput(e.target.value)}
                    />
                  </div>
                </th>
                <th className="p-4 text-[11px] font-bold text-muted uppercase tracking-wider border-b border-glass-border align-top">Manufacturer</th>
                <th className="p-4 text-[11px] font-bold text-muted uppercase tracking-wider border-b border-glass-border text-right align-top">
                  <div className="flex flex-col gap-2 items-end">
                    <span>MRP ₹</span>
                    <input 
                      type="text" 
                      placeholder="Filter MRP..." 
                      className="w-24 bg-bg3 border border-glass-border rounded px-2 py-1 text-xs text-text focus:outline-none focus:border-sky-500/50 text-right font-normal normal-case"
                      value={mrpInput}
                      onChange={e => setMrpInput(e.target.value)}
                    />
                  </div>
                </th>
                <th className="p-4 text-[11px] font-bold text-muted uppercase tracking-wider border-b border-glass-border text-center align-top">
                  <div className="flex flex-col gap-2 items-center">
                    <span>Distributors</span>
                    <input 
                      type="text" 
                      placeholder="Filter distributor..." 
                      className="w-32 bg-bg3 border border-glass-border rounded px-2 py-1 text-xs text-text focus:outline-none focus:border-sky-500/50 font-normal normal-case text-center"
                      value={distributorInput}
                      onChange={e => setDistributorInput(e.target.value)}
                    />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center">
                    <RefreshCw size={24} className="animate-spin text-sky-400 mx-auto mb-3" />
                    <span className="text-muted text-sm block">Loading catalog data...</span>
                  </td>
                </tr>
              ) : medicines.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-muted">
                    <BookOpen size={32} className="mx-auto mb-3 opacity-30" />
                    <span className="block font-medium">No medicines found.</span>
                    <span className="text-xs opacity-70 mt-1 block">Try adjusting your search terms.</span>
                  </td>
                </tr>
              ) : (
                medicines.map(item => (
                  <tr 
                    key={item.id} 
                    className="hover:bg-bg3/50 transition-colors border-b border-glass-border/50 group"
                  >
                    <td className="p-4 text-xs text-muted/60 font-mono">{item.id}</td>
                    <td className="p-4">
                      <div className="font-semibold text-text text-sm">{item.name}</div>
                      <div className="flex flex-wrap gap-2 items-center mt-1">
                        {item.item_code && <span className="text-[10px] text-muted bg-bg3/50 px-1.5 py-0.5 rounded border border-glass-border/40 font-mono">Code: {item.item_code}</span>}
                        {item.api_reference && (
                          <span className="text-[10px] text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20 font-medium" title="Composition (API)">
                            {item.api_reference}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-xs text-sky-400 max-w-[200px] truncate" title={item.api_reference || ''}>
                      {item.api_reference || '-'}
                    </td>
                    <td className="p-4 text-xs text-muted">
                      {item.strength || '-'}
                    </td>
                    <td className="p-4 text-xs text-muted">
                      {item.packaging || '-'}
                    </td>
                    <td className="p-4 text-xs text-muted max-w-[150px] truncate" title={item.manufacturer || ''}>
                      {item.manufacturer || '-'}
                    </td>
                    <td className="p-4 text-right">
                      <div className="text-sm font-bold text-green-400">
                        {item.mrp ? `₹${item.mrp.toFixed(2)}` : '-'}
                      </div>
                      {item.last_purchase_rate !== undefined && item.last_purchase_rate !== null && (
                        <div className="mt-1 flex flex-col items-end gap-0.5 text-[10px]">
                          <span className="text-sky-400 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded font-mono font-semibold" title="Latest Supplier Purchase Cost">
                            Cost: ₹{item.last_purchase_rate.toFixed(2)}
                          </span>
                          {item.last_purchase_mrp !== undefined && item.last_purchase_mrp !== null && Math.abs(item.last_purchase_mrp - (item.mrp || 0)) > 0.01 && (
                            <span className="text-muted text-[9px] font-mono">
                              (Purchased MRP: ₹{item.last_purchase_mrp.toFixed(2)})
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <button
                        onClick={() => openPriceHistory(item.name)}
                        className="px-2.5 py-1 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 hover:bg-sky-500 hover:text-white transition-all font-bold text-xs uppercase"
                        title="View Supplier Price History"
                      >
                        Rates
                      </button>
                      {item.last_distributor_name && (
                        <div 
                          className="text-[10px] text-muted mt-1.5 font-medium truncate max-w-[140px] mx-auto" 
                          title={`Last supplied by: ${item.last_distributor_name}`}
                        >
                          via {item.last_distributor_name}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
              
              {/* Observer target */}
              {!loading && page < totalPages && (
                <tr ref={observerTarget}>
                  <td colSpan={8} className="p-8 text-center text-muted">
                    {appending ? (
                      <><RefreshCw size={20} className="animate-spin inline-block mr-2 text-sky-400" /> Loading more products...</>
                    ) : (
                      'Scroll for more'
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Simple Footer */}
        <div className="p-3 border-t border-glass-border bg-bg3 flex items-center justify-between">
          <div className="text-xs text-muted font-medium">
            Showing <span className="text-text">{medicines.length}</span> of <span className="text-text">{totalItems.toLocaleString()}</span> entries
          </div>
        </div>

      </div>

      {/* Price History Modal */}
      {showPriceHistoryModal && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 backdrop-blur-md">
          <div className="bg-bg border border-glass-border rounded-2xl w-11/12 max-w-4xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-glass-border bg-bg3/50">
              <div>
                <h3 className="text-base font-bold text-text">Supplier Rates & Purchase History</h3>
                <p className="text-xs text-muted mt-1 font-semibold">{priceHistoryMedicine}</p>
              </div>
              <button 
                onClick={() => setShowPriceHistoryModal(false)}
                className="p-1.5 rounded-lg text-muted hover:text-text hover:bg-white/5 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {loadingHistory ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <RefreshCw className="animate-spin text-sky-400" size={24} />
                  <span className="text-sm text-muted">Retrieving distributor records...</span>
                </div>
              ) : priceHistory.length === 0 ? (
                <div className="text-center py-12 text-muted italic">
                  No purchase invoice history found for this medicine in the database.
                </div>
              ) : (
                <div className="bg-bg2 border border-glass-border rounded-xl overflow-hidden overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-bg3 border-b border-glass-border text-[10px] font-bold text-muted uppercase tracking-wider">
                        <th className="py-3 px-4">Purchase Date</th>
                        <th className="py-3 px-4">Distributor</th>
                        <th className="py-3 px-4">Batch</th>
                        <th className="py-3 px-4">Expiry</th>
                        <th className="py-3 px-4 text-right">Cost Rate</th>
                        <th className="py-3 px-4 text-right">MRP</th>
                        <th className="py-3 px-4 text-right">Disc %</th>
                        <th className="py-3 px-4 text-right">GST %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceHistory.map((item, idx) => {
                        const dateStr = item.date ? new Date(item.date).toLocaleDateString() : 'N/A';
                        const gstPer = (item.cgst_per || 0) + (item.sgst_per || 0) + (item.igst_per || 0);
                        return (
                          <tr key={idx} className="border-b border-glass-border/30 hover:bg-bg3/30 transition-colors">
                            <td className="py-3 px-4 font-mono text-muted">{dateStr}</td>
                            <td className="py-3 px-4 text-text font-semibold">{item.distributor_name || 'N/A'}</td>
                            <td className="py-3 px-4 font-mono text-text">{item.batch_no || '-'}</td>
                            <td className="py-3 px-4 font-mono text-muted">{item.expiry_date || '-'}</td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-green-400">₹{item.rate?.toFixed(2) || '0.00'}</td>
                            <td className="py-3 px-4 text-right font-mono text-text">₹{item.mrp?.toFixed(2) || '0.00'}</td>
                            <td className="py-3 px-4 text-right font-mono text-muted">{item.cd_per ? `${item.cd_per}%` : (item.cd_rs ? `₹${item.cd_rs}` : '-')}</td>
                            <td className="py-3 px-4 text-right font-mono text-muted">{gstPer}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end px-6 py-4 border-t border-glass-border bg-bg3/50">
              <button
                onClick={() => setShowPriceHistoryModal(false)}
                className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-xl text-xs font-bold uppercase transition-all"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default DatabasePage;
