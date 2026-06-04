import { useState, useEffect } from 'react';
import { PackageSearch, Filter, Plus, RefreshCw, X, AlertTriangle, ShieldAlert, BookOpen, Factory } from 'lucide-react';
import { api, type InventoryItem } from '../services/api';

const Inventory = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [minQty, setMinQty] = useState('');
  const [maxQty, setMaxQty] = useState('');
  const [minMRP, setMinMRP] = useState('');
  const [maxMRP, setMaxMRP] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Enriched Details Drawer states
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [enrichedData, setEnrichedData] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  const [specialOrders, setSpecialOrders] = useState<any[]>([]);

  useEffect(() => {
    loadInventory();
    api.getOrders()
      .then(data => {
        if (Array.isArray(data)) {
          setSpecialOrders(data.filter(o => o.status === 'Pending' || o.status === 'Ordered'));
        }
      })
      .catch(err => console.error('Error loading special orders for inventory:', err));
  }, []);

  const loadInventory = () => {
    setLoading(true);
    api.getInventory()
      .then(data => {
        let fetchedItems = data && (data as any).data ? (data as any).data : data;
        // STRICT RULE: Only show last 200
        setItems(Array.isArray(fetchedItems) ? fetchedItems.slice(0, 200) : []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  const handleRowClick = (item: InventoryItem) => {
    setSelectedItem(item);
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

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.batch_number && item.batch_number.toLowerCase().includes(searchTerm.toLowerCase()));
      
    const matchesMinQty = !minQty || item.stock_quantity >= Number(minQty);
    const matchesMaxQty = !maxQty || item.stock_quantity <= Number(maxQty);
    const matchesMinMRP = !minMRP || (item.mrp || 0) >= Number(minMRP);
    const matchesMaxMRP = !maxMRP || (item.mrp || 0) <= Number(maxMRP);
    
    return matchesSearch && matchesMinQty && matchesMaxQty && matchesMinMRP && matchesMaxMRP;
  });

  return (
    <div className="h-full flex flex-col fade-in relative">
      <div className="glass-panel flex-1 flex flex-col overflow-hidden">
        <div className="p-5 border-b border-glass-border flex flex-wrap justify-between items-center gap-4 bg-white/5">
          <h3 className="font-bold flex items-center gap-2 text-lg">
            <PackageSearch size={20} className="text-primary" /> 
            Inventory Master
          </h3>
          <div className="flex items-center gap-3">
            <input 
              type="text" 
              placeholder="Search inventory..." 
              className="premium-input w-64"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <button onClick={() => setShowFilters(!showFilters)} className="premium-btn btn-outline text-muted hover:text-white">
              <Filter size={16} /> Filters
            </button>
            <button className="premium-btn btn-sky" onClick={loadInventory} aria-label="Refresh inventory" title="Refresh inventory">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="bg-black/40 p-4 border-b border-glass-border flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-muted">Stock Qty</label>
              <input
                type="number"
                value={minQty}
                onChange={e => setMinQty(e.target.value)}
                placeholder="Min"
                className="px-3 py-1.5 bg-black/20 border border-glass-border rounded-lg text-sm text-text focus:outline-none focus:border-primary/50 w-24"
              />
              <span className="text-muted text-xs">-</span>
              <input
                type="number"
                value={maxQty}
                onChange={e => setMaxQty(e.target.value)}
                placeholder="Max"
                className="px-3 py-1.5 bg-black/20 border border-glass-border rounded-lg text-sm text-text focus:outline-none focus:border-primary/50 w-24"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-muted">MRP</label>
              <input
                type="number"
                value={minMRP}
                onChange={e => setMinMRP(e.target.value)}
                placeholder="Min ₹"
                className="px-3 py-1.5 bg-black/20 border border-glass-border rounded-lg text-sm text-text focus:outline-none focus:border-primary/50 w-24"
              />
              <span className="text-muted text-xs">-</span>
              <input
                type="number"
                value={maxMRP}
                onChange={e => setMaxMRP(e.target.value)}
                placeholder="Max ₹"
                className="px-3 py-1.5 bg-black/20 border border-glass-border rounded-lg text-sm text-text focus:outline-none focus:border-primary/50 w-24"
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto bg-black/20 relative">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[#18181b]/95 backdrop-blur z-10">
              <tr>
                <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">ID</th>
                <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Medicine</th>
                <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Batch</th>
                <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Expiry</th>
                <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Stock</th>
                <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">MRP ₹</th>
                <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">Rack</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted">Loading inventory...</td></tr>
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-muted">No medicines found.</td></tr>
              ) : (
                filteredItems.map(item => {
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
                      <td className="p-4 text-sm font-semibold flex items-center gap-2">
                        {item.name}
                        {hasPending && (
                          <span className="inline-flex items-center gap-1 bg-amber-500/10 border border-amber-500/30 text-amber-500 px-1.5 py-0.5 rounded text-[10px] font-bold animate-pulse">
                            ⚠️ Requested ({pendingMatches[0].qty})
                          </span>
                        )}
                      </td>
                    <td className="p-4 text-sm">{item.batch_number || 'B-NEW'}</td>
                    <td className="p-4 text-sm">{item.expiry_date || '12/2028'}</td>
                    <td className="p-4 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${item.stock_quantity <= 0 ? 'bg-red-bg text-red' : item.stock_quantity < 20 ? 'bg-amber-bg text-amber' : 'bg-green-bg text-green'}`}>
                        {item.stock_quantity}
                      </span>
                    </td>
                    <td className="p-4 text-sm">₹{item.mrp?.toFixed(2) || '0.00'}</td>
                    <td className="p-4 text-sm text-muted">{item.rack_location || '-'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sliding Details Drawer */}
      <div className={`fixed top-0 right-0 h-full w-[450px] bg-[#121214]/95 backdrop-blur-xl border-l border-glass-border shadow-[-8px_0_30px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-in-out z-50 flex flex-col ${panelOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {selectedItem && (
          <>
            {/* Header */}
            <div className="p-6 border-b border-glass-border flex justify-between items-center bg-white/5">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-primary px-2 py-0.5 rounded bg-primary/10">
                  {selectedItem.item_type || 'Medicine'} Details
                </span>
                <h4 className="text-xl font-bold mt-1 text-white">{selectedItem.name}</h4>
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
                  <span className="text-lg font-bold text-white mt-0.5 block">{selectedItem.stock_quantity} units</span>
                </div>
                <div>
                  <span className="text-xs text-muted block uppercase font-semibold">MRP Price</span>
                  <span className="text-lg font-bold text-green mt-0.5 block">₹{selectedItem.mrp?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="mt-2">
                  <span className="text-xs text-muted block uppercase font-semibold">Batch Number</span>
                  <span className="text-sm font-bold text-white mt-0.5 block">{selectedItem.batch_number || 'B-NEW'}</span>
                </div>
                <div className="mt-2">
                  <span className="text-xs text-muted block uppercase font-semibold">Expiry Date</span>
                  <span className="text-sm font-bold text-white mt-0.5 block">{selectedItem.expiry_date || '12/2028'}</span>
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
      </div>
    </div>
  );
};

export default Inventory;
