import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { useDeferredEffect } from '../../hooks/useDeferredEffect';
import { PackageSearch, Package, Plus, Minus, RefreshCw, X, AlertTriangle, ShieldAlert, BookOpen, Factory, Send, ChevronDown, Edit, Save } from 'lucide-react';
import { api, type InventoryItem } from '../../services/api';
import { UniversalMedicineEditModal } from '../../components/UniversalMedicineEditModal';
import { createPortal } from 'react-dom';
import { clearExpiryCache } from '../Expiry';
import { cacheInvalidators, appCache } from '../../services/appCache';

const formatExpiryToMMYY = (val: string): string => {
  if (!val) return '';
  val = val.trim().replace(/\s+/g, '');
  if (/^\d{4}$/.test(val)) {
    const mm = val.substring(0, 2);
    const yy = val.substring(2, 4);
    return `${mm}/${yy}`;
  }
  if (/^\d{6}$/.test(val)) {
    const mm = val.substring(0, 2);
    const yyyy = val.substring(2, 6);
    return `${mm}/${yyyy.substring(2, 4)}`;
  }
  if (/^\d{2}\/\d{4}$/.test(val)) {
    const mm = val.substring(0, 2);
    const yyyy = val.substring(3, 7);
    return `${mm}/${yyyy.substring(2, 4)}`;
  }
  if (/^\d{2}\/\d{2}$/.test(val)) {
    return val;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
    const parts = val.substring(0, 10).split('-');
    return `${parts[1]}/${parts[0].substring(2, 4)}`;
  }
  return val;
};

let cachedItems: any[] | null = null;
let cachedSpecialOrders: any[] | null = null;

const Inventory = () => {
  const navigate = useNavigate();
  // Check appCache first (populated by prefetchAll on app start)
  // items, loading, totalItems now come from useInfiniteScroll hook below
  const [colFilters, setColFilters] = useState({
    medicine: '', batch: '', expiry: '', packs: '', loose: '', mrp: '', rack: ''
  });

  // Enriched Details Drawer states
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [enrichedData, setEnrichedData] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState<Partial<InventoryItem>>({});
  
  const [universalEditMedicineId, setUniversalEditMedicineId] = useState<number | null>(null);

  const [specialOrders, setSpecialOrders] = useState<any[]>(cachedSpecialOrders || []);

  // Infinite scroll managed by useInfiniteScroll hook
  const BATCH_SIZE = 100;

  // Debounced column filter states
  const [debouncedFilters, setDebouncedFilters] = useState(colFilters);

  // Debounce colFilters update to avoid database request saturation
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedFilters(prev => {
        const nextMedicine = (colFilters.medicine.length === 0 || colFilters.medicine.length >= 3) ? colFilters.medicine : prev.medicine;
        const nextBatch = (colFilters.batch.length === 0 || colFilters.batch.length >= 3) ? colFilters.batch : prev.batch;
        const nextExpiry = (colFilters.expiry.length === 0 || colFilters.expiry.length >= 3) ? colFilters.expiry : prev.expiry;
        const nextRack = (colFilters.rack.length === 0 || colFilters.rack.length >= 3) ? colFilters.rack : prev.rack;
        
        const nextPacks = colFilters.packs;
        const nextLoose = colFilters.loose;
        const nextMrp = colFilters.mrp;

        if (
          prev.medicine !== nextMedicine ||
          prev.batch !== nextBatch ||
          prev.expiry !== nextExpiry ||
          prev.rack !== nextRack ||
          prev.packs !== nextPacks ||
          prev.loose !== nextLoose ||
          prev.mrp !== nextMrp
        ) {
          return {
            medicine: nextMedicine,
            batch: nextBatch,
            expiry: nextExpiry,
            rack: nextRack,
            packs: nextPacks,
            loose: nextLoose,
            mrp: nextMrp
          };
        }
        return prev;
      });
    }, 2000);
    return () => clearTimeout(handler);
  }, [colFilters]);







  // ── Infinite scroll hook — replaces loadInventory + pagination ────────────
  const {
    rows: items,
    total: totalItems,
    loading,
    loadingMore,
    hasMore,
    setFilters: setInvFilters,
    sentinelRef,
    reset: resetInventory,
  } = useInfiniteScroll<InventoryItem, typeof debouncedFilters>({
    cacheKey: 'inventory',
    batchSize: BATCH_SIZE,
    initialFilters: debouncedFilters,
    fetcher: async (offset, filters) => {
      const data = await api.getInventory({
        page: Math.floor(offset / BATCH_SIZE) + 1,
        limit: BATCH_SIZE,
        medicine: filters.medicine,
        batch: filters.batch,
        expiry: filters.expiry,
        packs: filters.packs,
        loose: filters.loose,
        mrp: filters.mrp,
        rack: filters.rack,
      });
      const list = data && (data as any).data ? (data as any).data : (Array.isArray(data) ? data : []);
      const total = (data as any).totalItems ?? list.length;
      return { data: list, meta: { total } };
    },
  });

  // Re-run infinite scroll when debounced filters change
  useEffect(() => {
    setInvFilters(debouncedFilters);
  }, [debouncedFilters]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshing = loadingMore;
  const handleRefresh = resetInventory;

  useDeferredEffect(() => {
    api.getOrders()
      .then(data => {
        if (Array.isArray(data)) {
          const activeOrders = data.filter(o => o.status === 'Pending' || o.status === 'Ordered');
          setSpecialOrders(activeOrders);
          cachedSpecialOrders = activeOrders;
        }
      })
      .catch(err => console.error('Error loading special orders for inventory:', err));
  }, []);

  const handleRowClick = (item: InventoryItem) => {
    setSelectedItem(item);
    setIsEditing(false);
    setEditForm({
      name: item.name || item.medicine_name,
      stock_quantity: item.stock_quantity,
      mrp: item.mrp,
      batch_number: item.batch_number,
      expiry_date: item.expiry_date,
      loose_quantity: item.loose_quantity,
      rack_location: item.rack_location
    });
    setPanelOpen(true);
    setDetailsLoading(true);
    setEnrichedData(null);

    // Call the new enrichment route we implemented in the backend
    api.getEnrichedMedicine(item.id)
      .then(res => {
        if (res.success) {
          setEnrichedData(res.enrichment);
        }
        setDetailsLoading(false);
      })
      .catch(err => {
        console.error(err);
        setDetailsLoading(false);
      });
  };

  const handleSave = () => {
    if (!selectedItem) return;
    setIsSaving(true);
    api.updateMedicine(selectedItem.id, editForm)
      .then(() => {
        clearExpiryCache();
        cacheInvalidators.onInventoryUpdated(); // invalidate Inventory + Expiry caches
        setIsSaving(false);
        setIsEditing(false);
        setSelectedItem({ ...selectedItem, ...editForm } as InventoryItem);
        loadInventory();
      })
      .catch(err => {
        console.error('Failed to update item:', err);
        setIsSaving(false);
      });
  };

  const filteredItems = items;

  return (
    <div className="h-full flex flex-col gap-4 overflow-hidden relative">
      <div className="flex-1 bg-glass-bg border border-glass-border rounded-2xl flex flex-col min-h-0 overflow-hidden relative animate-in fade-in duration-300">
        
        {/* Inventory count bar + Sync button */}
        <div className="p-3 border-b border-glass-border flex items-center justify-between bg-bg2/40 gap-3 shrink-0 select-none text-xs">
          <span className="text-muted">
            Showing <strong className="text-text font-mono">{items.length.toLocaleString()}</strong>
            {totalItems > items.length && (
              <> of <strong className="text-text font-mono">{totalItems.toLocaleString()}</strong></>
            )} medicines
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            title="Sync inventory from server"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-glass-border bg-bg text-muted hover:text-primary hover:border-primary/40 transition-all disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin text-primary' : ''} />
            <span className="text-[10px] font-bold uppercase tracking-wider">{refreshing ? 'Syncing...' : 'Sync'}</span>
          </button>
        </div>

        <div className="flex-1 flex flex-col min-h-0 p-4 overflow-hidden bg-bg2/15">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted">
              <div className="animate-pulse">Loading inventory...</div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-muted">
              <Package size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-semibold">No medicines found</p>
              <p className="text-xs mt-1">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="flex-1 border border-glass-border/30 rounded-xl overflow-auto bg-glass-bg custom-scrollbar min-h-0 relative">
              <table className="w-full text-left border-collapse text-[11px] font-semibold text-text min-w-full">
                <thead className="sticky top-0 z-20 bg-bg2 shadow-sm">
                  <tr className="bg-bg2 border-b border-glass-border/30 text-muted font-bold text-[10px] align-top">
                    <th className="p-2 border-r border-glass-border/20 w-16">
                      <div className="flex flex-col gap-1">
                        <span className="uppercase text-[10px] tracking-wider text-muted font-black">ID</span>
                      </div>
                    </th>
                    <th className="p-2 border-r border-glass-border/20 min-w-[160px]">
                      <div className="flex flex-col gap-1">
                        <span className="uppercase text-[10px] tracking-wider text-muted font-black">Medicine Name</span>
                      </div>
                    </th>
                    <th className="p-2 border-r border-glass-border/20 min-w-[100px]">
                      <div className="flex flex-col gap-1">
                        <span className="uppercase text-[10px] tracking-wider text-muted font-black">Batch</span>
                      </div>
                    </th>
                    <th className="p-2 border-r border-glass-border/20 min-w-[90px]">
                      <div className="flex flex-col gap-1">
                        <span className="uppercase text-[10px] tracking-wider text-muted font-black">Expiry</span>
                      </div>
                    </th>
                    <th className="p-2 border-r border-glass-border/20 min-w-[80px]">
                      <div className="flex flex-col gap-1">
                        <span className="uppercase text-[10px] tracking-wider text-muted font-black">Packs</span>
                      </div>
                    </th>
                    <th className="p-2 border-r border-glass-border/20 min-w-[80px]">
                      <div className="flex flex-col gap-1">
                        <span className="uppercase text-[10px] tracking-wider text-muted font-black">Loose</span>
                      </div>
                    </th>
                    <th className="p-2 border-r border-glass-border/20 min-w-[100px]">
                      <div className="flex flex-col gap-1">
                        <span className="uppercase text-[10px] tracking-wider text-muted font-black">MRP (₹)</span>
                      </div>
                    </th>
                    <th className="p-2 border-r border-glass-border/20 min-w-[80px]">
                      <div className="flex flex-col gap-1">
                        <span className="uppercase text-[10px] tracking-wider text-muted font-black">Rack</span>
                      </div>
                    </th>
                    <th className="p-2 text-center min-w-[80px]">
                      <div className="flex flex-col gap-1 items-center justify-center">
                        <span className="uppercase text-[10px] tracking-wider text-muted font-black">Actions</span>
                      </div>
                    </th>
                  </tr>
                  <tr className="bg-bg2 border-b border-glass-border/30">
                    <td className="p-2 border-r border-glass-border/20"></td>
                    <td className="p-2 border-r border-glass-border/20">
                      <input
                        type="text"
                        placeholder="Filter medicine..."
                        value={colFilters.medicine}
                        onChange={e => setColFilters({...colFilters, medicine: e.target.value})}
                        className="w-full px-2 py-0.5 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                      />
                    </td>
                    <td className="p-2 border-r border-glass-border/20">
                      <input
                        type="text"
                        placeholder="Filter batch..."
                        value={colFilters.batch}
                        onChange={e => setColFilters({...colFilters, batch: e.target.value})}
                        className="w-full px-2 py-0.5 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                      />
                    </td>
                    <td className="p-2 border-r border-glass-border/20">
                      <input
                        type="text"
                        placeholder="Filter expiry..."
                        value={colFilters.expiry}
                        onChange={e => setColFilters({...colFilters, expiry: e.target.value})}
                        className="w-full px-2 py-0.5 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                      />
                    </td>
                    <td className="p-2 border-r border-glass-border/20">
                      <input
                        type="text"
                        placeholder="Filter packs..."
                        value={colFilters.packs}
                        onChange={e => setColFilters({...colFilters, packs: e.target.value})}
                        className="w-full px-2 py-0.5 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                      />
                    </td>
                    <td className="p-2 border-r border-glass-border/20">
                      <input
                        type="text"
                        placeholder="Filter loose..."
                        value={colFilters.loose}
                        onChange={e => setColFilters({...colFilters, loose: e.target.value})}
                        className="w-full px-2 py-0.5 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                      />
                    </td>
                    <td className="p-2 border-r border-glass-border/20">
                      <input
                        type="text"
                        placeholder="Filter MRP..."
                        value={colFilters.mrp}
                        onChange={e => setColFilters({...colFilters, mrp: e.target.value})}
                        className="w-full px-2 py-0.5 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                      />
                    </td>
                    <td className="p-2 border-r border-glass-border/20">
                      <input
                        type="text"
                        placeholder="Filter rack..."
                        value={colFilters.rack}
                        onChange={e => setColFilters({...colFilters, rack: e.target.value})}
                        className="w-full px-2 py-0.5 bg-bg3 border border-glass-border rounded text-[10px] text-text font-normal placeholder:text-muted/40 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
                      />
                    </td>
                    <td className="p-2 text-center flex items-center justify-center">
                      {(colFilters.medicine || colFilters.batch || colFilters.expiry || colFilters.packs || colFilters.loose || colFilters.mrp || colFilters.rack) && (
                        <button
                          onClick={() => {
                            setColFilters({
                              medicine: '',
                              batch: '',
                              expiry: '',
                              packs: '',
                              loose: '',
                              mrp: '',
                              rack: ''
                            });
                          }}
                          className="px-2 py-0.5 rounded bg-red/15 border border-red/30 text-red-400 hover:bg-red hover:text-white transition-all text-[9px] font-extrabold cursor-pointer"
                          title="Clear Filters"
                        >
                          Reset
                        </button>
                      )}
                    </td>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map(item => {
                    const pendingMatches = specialOrders.filter(
                      o => o.product.toLowerCase().trim() === item.name.toLowerCase().trim() ||
                           item.name.toLowerCase().includes(o.product.toLowerCase().trim())
                    );
                    const hasPending = pendingMatches.length > 0;
                    return (
                      <tr 
                        key={item.id} 
                        className="hover:bg-white/5 cursor-pointer transition-colors border-b border-glass-border"
                        onClick={() => handleRowClick(item)}
                      >
                        <td className="p-4 text-sm text-muted">{item.id}</td>
                        <td className="p-4 text-sm font-semibold">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={e => { e.stopPropagation(); navigate(`/medicines/${item.medicine_id || item.id}`); }}
                              className="text-left hover:text-primary hover:underline transition-colors"
                              title="View medicine detail"
                            >
                              {item.name}
                            </button>
                          {hasPending && (
                            <span className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 text-amber-500 px-1.5 py-0.5 rounded text-[10px] font-bold animate-pulse">
                              ⚠️ Requested ({pendingMatches[0].qty})
                            </span>
                          )}
                          </div>
                        </td>
                        <td className="p-4 text-sm">{item.batch_number || 'B-NEW'}</td>
                        <td className="p-4 text-sm">{item.expiry_date || '12/2028'}</td>
                        <td className="p-4 text-sm">
                          <div className="flex items-center gap-1.5" title="Full Packs Available">
                            <span className={`px-2 py-1 rounded-md border text-xs font-bold shadow-sm ${item.stock_quantity <= 0 ? 'bg-red/10 border-red/20 text-red' : item.stock_quantity < 20 ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-green/10 border-green/20 text-green'}`}>
                              {item.stock_quantity || 0}
                            </span>
                            <span className="text-[10px] text-muted font-semibold">Packs</span>
                          </div>
                        </td>
                        <td className="p-4 text-sm">
                          <div className="flex items-center gap-1.5" title="Loose Units Available">
                            <span className={`px-2 py-1 rounded-md border text-xs font-bold shadow-sm ${!item.loose_quantity || item.loose_quantity <= 0 ? 'bg-white/5 border-glass-border text-muted opacity-50' : 'bg-primary/10 border-primary/20 text-primary'}`}>
                              {item.loose_quantity || 0}
                            </span>
                            <span className="text-[10px] text-muted font-semibold">Units</span>
                          </div>
                        </td>
                        <td className="p-4 text-sm">₹{item.mrp?.toFixed(2) || '0.00'}</td>
                        <td className="p-4 text-sm text-muted">{item.rack_location || '-'}</td>
                        <td className="p-4 text-sm"></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Infinite scroll sentinel */}
              {hasMore && (
                <div ref={sentinelRef} className="py-4 text-center text-xs text-muted">
                  {loadingMore ? (
                    <span className="flex items-center justify-center gap-2">
                      <RefreshCw size={12} className="animate-spin" /> Loading more...
                    </span>
                  ) : (
                    <span className="opacity-30">scroll for more</span>
                  )}
                </div>
              )}
              {!hasMore && items.length > 0 && (
                <div className="py-3 text-center text-[10px] text-muted opacity-40">
                  All {totalItems.toLocaleString()} medicines loaded
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sliding Details Drawer */}
      {createPortal(
        <div className={`fixed top-0 right-0 h-full w-[450px] bg-[#121214]/95 backdrop-blur-xl border-l border-glass-border shadow-[-8px_0_30px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-in-out z-[999999] flex flex-col ${panelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          {selectedItem && (
            <>
              {/* Header */}
              <div className="p-6 border-b border-glass-border flex justify-between items-center bg-white/5">
                <div className="min-w-0 flex-1 mr-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary px-2 py-0.5 rounded bg-primary/10 inline-block mb-1">
                    {selectedItem.item_type || 'Medicine'} Details
                  </span>
                  {isEditing ? (
                    <input 
                      type="text" 
                      className="text-xl font-bold mt-1 w-full px-2 py-1 bg-black/40 border border-glass-border rounded-lg text-white focus:border-primary focus:outline-none transition-all"
                      value={editForm.name ?? ''} 
                      onChange={e => setEditForm({...editForm, name: e.target.value})} 
                      placeholder="Medicine Name"
                    />
                  ) : (
                    <h4 className="text-xl font-bold mt-1 text-white truncate" title={selectedItem.name || selectedItem.medicine_name}>{selectedItem.name || selectedItem.medicine_name}</h4>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {isEditing ? (
                    <>
                      <button 
                        onClick={() => {
                          setIsEditing(false);
                          setEditForm({
                            name: selectedItem.name || selectedItem.medicine_name,
                            stock_quantity: selectedItem.stock_quantity,
                            mrp: selectedItem.mrp,
                            batch_number: selectedItem.batch_number,
                            expiry_date: selectedItem.expiry_date,
                            loose_quantity: selectedItem.loose_quantity,
                            rack_location: selectedItem.rack_location
                          });
                        }}
                        className="px-3 py-1.5 rounded-lg border border-glass-border hover:bg-white/10 text-muted hover:text-white text-sm font-medium transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold transition-colors flex items-center gap-2"
                      >
                        {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                        Save
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setIsEditing(true)}
                        className="px-3 py-1.5 rounded-lg bg-white/5 border border-glass-border hover:bg-white/10 text-muted hover:text-white text-sm font-medium transition-colors flex items-center gap-2"
                        title="Edit this specific batch details"
                      >
                        <Edit size={14} />
                        Edit Batch
                      </button>
                      <button 
                        onClick={() => setUniversalEditMedicineId(selectedItem.medicine_id || (selectedItem as any).id)}
                        className="px-3 py-1.5 rounded-lg bg-sky/10 border border-sky/30 hover:bg-sky/20 text-sky text-sm font-bold transition-colors flex items-center gap-2"
                        title="Edit global medicine details universally across the app"
                      >
                        <Edit size={14} />
                        Universal Edit
                      </button>
                    </div>
                  )}
                </div>
                <button 
                  onClick={() => setPanelOpen(false)}
                  className="p-1.5 rounded-full hover:bg-white/10 text-muted hover:text-white transition-colors ml-2"
                  aria-label="Close panel"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Special Request Alert Banner */}
                {specialOrders.filter(
                  o => o.product.toLowerCase().trim() === selectedItem.name.toLowerCase().trim() ||
                       selectedItem.name.toLowerCase().includes(o.product.toLowerCase().trim())
                ).map(o => (
                  <div key={o.id} className="bg-amber-500/10 border border-amber-500/30 text-amber-200 p-4 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
                    <div>
                      <div className="font-bold text-xs">Pending Out-of-Stock Special Request</div>
                      <p className="text-[11px] text-amber-300/80 mt-1">
                        Customer <strong>{o.requester}</strong> ({o.phone}) requested <strong>{o.qty}</strong> unit(s) of this item. Please reserve/reconcile this stock when receiving purchases.
                      </p>
                    </div>
                  </div>
                ))}

                {/* Batch Info Card */}
                <div className="grid grid-cols-2 gap-4 bg-white/5 p-4 rounded-xl border border-glass-border">
                  <div>
                    <span className="text-xs text-muted block uppercase font-semibold">Stock Quantity</span>
                    {isEditing ? (
                      <div className="flex items-center gap-2 mt-1">
                        <button 
                          onClick={() => setEditForm({...editForm, stock_quantity: Math.max(0, (editForm.stock_quantity || 0) - 1)})}
                          className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
                        >
                          <Minus size={14} />
                        </button>
                        <input 
                          type="number" 
                          className="w-full px-2 py-1.5 bg-black/40 border border-glass-border rounded-lg text-sm text-white text-center focus:border-primary focus:outline-none transition-all"
                          value={editForm.stock_quantity ?? ''} 
                          onChange={e => setEditForm({...editForm, stock_quantity: Number(e.target.value)})} 
                        />
                        <button 
                          onClick={() => setEditForm({...editForm, stock_quantity: (editForm.stock_quantity || 0) + 1})}
                          className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-lg font-bold text-white mt-0.5 block">{selectedItem.stock_quantity} packs</span>
                    )}
                  </div>
                  <div>
                    <span className="text-xs text-muted block uppercase font-semibold">MRP Price</span>
                    {isEditing ? (
                      <div className="relative mt-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">₹</span>
                        <input 
                          type="number" 
                          step="0.01"
                          className="w-full pl-7 pr-3 py-1.5 bg-black/40 border border-glass-border rounded-lg text-sm text-green font-bold focus:border-primary focus:outline-none transition-all"
                          value={editForm.mrp ?? ''} 
                          onChange={e => setEditForm({...editForm, mrp: Number(e.target.value)})} 
                        />
                      </div>
                    ) : (
                      <span className="text-lg font-bold text-green mt-0.5 block">₹{selectedItem.mrp?.toFixed(2) || '0.00'}</span>
                    )}
                  </div>
                  <div className="mt-2">
                    <span className="text-xs text-muted block uppercase font-semibold">Loose Units</span>
                    {isEditing ? (
                      <div className="flex items-center gap-2 mt-1">
                        <button 
                          onClick={() => setEditForm({...editForm, loose_quantity: Math.max(0, (editForm.loose_quantity || 0) - 1)})}
                          className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
                        >
                          <Minus size={14} />
                        </button>
                        <input 
                          type="number" 
                          className="w-full px-2 py-1.5 bg-black/40 border border-glass-border rounded-lg text-sm text-white text-center focus:border-primary focus:outline-none transition-all"
                          value={editForm.loose_quantity ?? ''} 
                          onChange={e => setEditForm({...editForm, loose_quantity: Number(e.target.value)})} 
                        />
                        <button 
                          onClick={() => setEditForm({...editForm, loose_quantity: (editForm.loose_quantity || 0) + 1})}
                          className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white transition-colors"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-sm font-bold text-white mt-0.5 block">{selectedItem.loose_quantity || 0}</span>
                    )}
                  </div>
                  <div className="mt-2">
                    <span className="text-xs text-muted block uppercase font-semibold">Rack</span>
                    {isEditing ? (
                      <input 
                        type="text" 
                        className="mt-1 w-full px-3 py-1.5 bg-black/40 border border-glass-border rounded-lg text-sm text-white focus:border-primary focus:outline-none transition-all"
                        value={editForm.rack_location ?? ''} 
                        onChange={e => setEditForm({...editForm, rack_location: e.target.value})} 
                      />
                    ) : (
                      <span className="text-sm font-bold text-white mt-0.5 block">{selectedItem.rack_location || '-'}</span>
                    )}
                  </div>
                  <div className="mt-2">
                    <span className="text-xs text-muted block uppercase font-semibold">Batch Number</span>
                    {isEditing ? (
                      <input 
                        type="text" 
                        className="mt-1 w-full px-3 py-1.5 bg-black/40 border border-glass-border rounded-lg text-sm text-white focus:border-primary focus:outline-none transition-all"
                        value={editForm.batch_number ?? ''} 
                        onChange={e => setEditForm({...editForm, batch_number: e.target.value})} 
                      />
                    ) : (
                      <span className="text-sm font-bold text-white mt-0.5 block">{selectedItem.batch_number || 'B-NEW'}</span>
                    )}
                  </div>
                  <div className="mt-2">
                    <span className="text-xs text-muted block uppercase font-semibold">Expiry Date</span>
                    {isEditing ? (
                      <input 
                        type="text" 
                        placeholder="MM/YY"
                        className="mt-1 w-full px-3 py-1.5 bg-black/40 border border-glass-border rounded-lg text-sm text-white focus:border-primary focus:outline-none transition-all"
                        value={editForm.expiry_date ?? ''} 
                        onChange={e => setEditForm({...editForm, expiry_date: formatExpiryToMMYY(e.target.value)})} 
                      />
                    ) : (
                      <span className="text-sm font-bold text-white mt-0.5 block">{selectedItem.expiry_date || '12/28'}</span>
                    )}
                  </div>
                </div>

                {/* Enrichment Section */}
                <div className="space-y-5">
                  <h5 className="text-xs font-bold uppercase tracking-widest text-muted border-b border-glass-border pb-2">Medical Profile (openFDA)</h5>

                  {detailsLoading ? (
                    <div className="flex flex-col items-center justify-center py-10 space-y-3">
                      <RefreshCw className="animate-spin text-primary" size={24} />
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
                              <span key={i} className="px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
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
                          <BookOpen size={14} className="text-sky" /> Indications & Usage
                        </span>
                        <div className="bg-white/5 p-3 rounded-lg border border-glass-border text-sm text-muted leading-relaxed max-h-36 overflow-y-auto">
                          {enrichedData.indications || 'Not available.'}
                        </div>
                      </div>

                      {/* Warnings */}
                      <div className="space-y-1.5">
                        <span className="text-xs text-muted uppercase font-bold flex items-center gap-1.5 text-amber">
                          <AlertTriangle size={14} /> Warnings & Precautions
                        </span>
                        <div className="bg-amber/5 p-3 rounded-lg border border-amber/20 text-sm text-amber-300 leading-relaxed max-h-36 overflow-y-auto">
                          {enrichedData.warnings || 'No active drug safety warnings.'}
                        </div>
                      </div>

                      {/* Side Effects */}
                      <div className="space-y-1.5">
                        <span className="text-xs text-muted uppercase font-bold flex items-center gap-1.5 text-red">
                          <ShieldAlert size={14} /> Adverse Reactions
                        </span>
                        <div className="bg-red/5 p-3 rounded-lg border border-red/20 text-sm text-red-300 leading-relaxed max-h-36 overflow-y-auto">
                          {enrichedData.sideEffects || 'No common adverse reactions logged.'}
                        </div>
                      </div>

                      {/* Source and Manufacturer */}
                      <div className="pt-2 flex justify-between items-center text-xs text-muted">
                        <span className="flex items-center gap-1"><Factory size={12} /> Mfg: {enrichedData.manufacturer || selectedItem.manufacturer || 'Unknown'}</span>
                        <span className="px-2 py-0.5 rounded bg-green/10 text-green font-bold uppercase text-[10px] tracking-wide">
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
            loadInventory();
            if (selectedItem) {
              // Optionally reload enriched data
              setPanelOpen(false);
              setTimeout(() => handleRowClick(selectedItem), 300);
            }
          }} 
        />
      )}

    </div>
  );
};

export default Inventory;
