import { useState, useEffect } from 'react';
import { PackageSearch, Filter, Plus, Minus, RefreshCw, X, AlertTriangle, ShieldAlert, BookOpen, Factory, Send, ChevronDown, Search, Edit, Save } from 'lucide-react';
import { api, type InventoryItem } from '../../services/api';
import { UniversalMedicineEditModal } from '../../components/UniversalMedicineEditModal';
import { createPortal } from 'react-dom';

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
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const parts = val.split('-');
    return `${parts[1]}/${parts[0].substring(2, 4)}`;
  }
  return val;
};

const Inventory = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [minQty, setMinQty] = useState('');
  const [maxQty, setMaxQty] = useState('');
  const [minMRP, setMinMRP] = useState('');
  const [maxMRP, setMaxMRP] = useState('');
  const [showFilters, setShowFilters] = useState(false);
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

  const [specialOrders, setSpecialOrders] = useState<any[]>([]);

  const loadInventory = () => {
    setLoading(true);
    api.getInventory()
      .then(data => {
        const fetchedItems = data && (data as any).data ? (data as any).data : data;
        // STRICT RULE: Only show last 200
        setItems(Array.isArray(fetchedItems) ? fetchedItems.slice(0, 200) : []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

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

  const filteredItems = items.filter(item => {
    const itemName = item.name || '';
    const itemBatch = item.batch_number || '';
    const itemID = String(item.id || '');
    const itemExpiry = item.expiry_date || '';
    const itemRack = item.rack_location || '';
    const itemStock = String(item.stock_quantity || 0);
    const itemMrp = String(item.mrp || 0);
    const searchLower = searchTerm.toLowerCase();

    const matchesSearch = itemName.toLowerCase().includes(searchLower) ||
      itemBatch.toLowerCase().includes(searchLower) ||
      itemID.includes(searchLower) ||
      itemExpiry.toLowerCase().includes(searchLower) ||
      itemRack.toLowerCase().includes(searchLower) ||
      itemStock.includes(searchLower) ||
      itemMrp.includes(searchLower);
      
    const matchesMinQty = !minQty || item.stock_quantity >= Number(minQty);
    const matchesMaxQty = !maxQty || item.stock_quantity <= Number(maxQty);
    const matchesMinMRP = !minMRP || (item.mrp || 0) >= Number(minMRP);
    const matchesMaxMRP = !maxMRP || (item.mrp || 0) <= Number(maxMRP);
    
    const matchesColFilters = 
      itemName.toLowerCase().includes(colFilters.medicine.toLowerCase()) &&
      itemBatch.toLowerCase().includes(colFilters.batch.toLowerCase()) &&
      itemExpiry.toLowerCase().includes(colFilters.expiry.toLowerCase()) &&
      (!colFilters.packs || String(item.stock_quantity).includes(colFilters.packs)) &&
      (!colFilters.loose || String(item.loose_quantity || 0).includes(colFilters.loose)) &&
      (!colFilters.mrp || itemMrp.includes(colFilters.mrp)) &&
      itemRack.toLowerCase().includes(colFilters.rack.toLowerCase());
    
    return matchesSearch && matchesMinQty && matchesMaxQty && matchesMinMRP && matchesMaxMRP && matchesColFilters;
  });

  return (
    <div className="h-full flex flex-col fade-in relative px-4 pb-4 pt-2 gap-2">
      <div className="glass-panel flex-1 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-glass-border flex justify-between items-center bg-white/5">
          <div className="flex items-center gap-3 w-full">
            <div className="relative flex-1 max-w-md">
              <input 
                type="text" 
                placeholder="Search inventory..." 
                className="w-full px-4 py-2 bg-black/20 border border-glass-border rounded-lg text-sm text-text focus:outline-none focus:border-primary/50 transition-all"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <button onClick={() => setShowFilters(!showFilters)} className={`px-4 py-2 rounded-lg border text-sm font-medium flex items-center gap-2 transition-colors ${showFilters ? 'bg-primary/20 border-primary/30 text-primary' : 'bg-white/5 border-glass-border hover:bg-white/10 text-muted hover:text-white'}`}>
              <Filter size={16} /> Filters
            </button>
            <div className="flex-1"></div>
            <button className="px-4 py-2 rounded-lg bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/20 text-sky-400 text-sm font-bold flex items-center gap-2 transition-colors" onClick={loadInventory} aria-label="Refresh inventory" title="Refresh inventory">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> 
              <span className="hidden sm:inline">Refresh</span>
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
                <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">
                  <div className="flex items-center gap-2">
                    <span>Medicine Name</span>
                    <input type="text" placeholder="Filter..." value={colFilters.medicine} onChange={e => setColFilters({...colFilters, medicine: e.target.value})} className="px-2 py-1 bg-black/20 border border-glass-border rounded text-xs text-text placeholder:text-muted/50 focus:outline-none focus:border-primary/50 w-24" />
                  </div>
                </th>
                <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">
                  <div className="flex items-center gap-2">
                    <span>Batch</span>
                    <input type="text" placeholder="Filter..." value={colFilters.batch} onChange={e => setColFilters({...colFilters, batch: e.target.value})} className="px-2 py-1 bg-black/20 border border-glass-border rounded text-xs text-text placeholder:text-muted/50 focus:outline-none focus:border-primary/50 w-20" />
                  </div>
                </th>
                <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">
                  <div className="flex items-center gap-2">
                    <span>Expiry</span>
                    <input type="text" placeholder="Filter..." value={colFilters.expiry} onChange={e => setColFilters({...colFilters, expiry: e.target.value})} className="px-2 py-1 bg-black/20 border border-glass-border rounded text-xs text-text placeholder:text-muted/50 focus:outline-none focus:border-primary/50 w-16" />
                  </div>
                </th>
                <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">
                  <div className="flex items-center gap-2">
                    <span>Packs</span>
                    <input type="text" placeholder="Filter..." value={colFilters.packs} onChange={e => setColFilters({...colFilters, packs: e.target.value})} className="px-2 py-1 bg-black/20 border border-glass-border rounded text-xs text-text placeholder:text-muted/50 focus:outline-none focus:border-primary/50 w-12" />
                  </div>
                </th>
                <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">
                  <div className="flex items-center gap-2">
                    <span>Loose</span>
                    <input type="text" placeholder="Filter..." value={colFilters.loose} onChange={e => setColFilters({...colFilters, loose: e.target.value})} className="px-2 py-1 bg-black/20 border border-glass-border rounded text-xs text-text placeholder:text-muted/50 focus:outline-none focus:border-primary/50 w-12" />
                  </div>
                </th>
                <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">
                  <div className="flex items-center gap-2">
                    <span>MRP ₹</span>
                    <input type="text" placeholder="Filter..." value={colFilters.mrp} onChange={e => setColFilters({...colFilters, mrp: e.target.value})} className="px-2 py-1 bg-black/20 border border-glass-border rounded text-xs text-text placeholder:text-muted/50 focus:outline-none focus:border-primary/50 w-14" />
                  </div>
                </th>
                <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border">
                  <div className="flex items-center gap-2">
                    <span>Rack</span>
                    <input type="text" placeholder="Filter..." value={colFilters.rack} onChange={e => setColFilters({...colFilters, rack: e.target.value})} className="px-2 py-1 bg-black/20 border border-glass-border rounded text-xs text-text placeholder:text-muted/50 focus:outline-none focus:border-primary/50 w-14" />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted">Loading inventory...</td></tr>
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan={8} className="p-8 text-center text-muted">No medicines found.</td></tr>
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
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
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
