import React, { useState, useEffect } from 'react';
import { X, Save, RefreshCw, AlertTriangle, Pill, Package, Factory, LayoutGrid, Barcode, Tag, MapPin, Database } from 'lucide-react';
import { api } from '../services/api';

interface Props {
  medicineId: number;
  onClose: () => void;
  onSave: () => void;
}

export const UniversalMedicineEditModal: React.FC<Props> = ({ medicineId, onClose, onSave }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});
  const [inventoryId, setInventoryId] = useState<number | null>(null);
  const [totalStock, setTotalStock] = useState<number>(0);

  useEffect(() => {
    setLoading(true);
    api.getQuickEditMedicine(medicineId)
      .then((data: any) => {
        if (data && data.medicine) {
          setForm({
            name: data.medicine.name || '',
            generic_name: data.medicine.generic_name || '',
            manufacturer: data.medicine.manufacturer || '',
            marketed_by: data.medicine.marketed_by || '',
            packaging: data.medicine.packaging || '',
            pack_unit: data.medicine.pack_unit || '',
            item_code: data.medicine.item_code || '',
            category: data.medicine.category || '',
            api_reference: data.medicine.api_reference || '',
            // Inventory primary record data
            quantity: data.inventory?.quantity || 0,
            rack_location: data.inventory?.rack_location || ''
          });
          setInventoryId(data.inventory?.inventory_id || null);
          setTotalStock(data.total_stock || 0);
        } else {
          setError("Failed to load medicine details.");
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError("Failed to load medicine details.");
        setLoading(false);
      });
  }, [medicineId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev: any) => ({ ...prev, [name]: name === 'quantity' ? parseInt(value) || 0 : value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateQuickEditMedicine(medicineId, {
        ...form,
        inventory_id: inventoryId
      });
      setSaving(false);
      onSave(); // Trigger parent refresh
      onClose(); // Close modal
    } catch (err: any) {
      console.error(err);
      setError("Failed to save changes.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999999] flex items-center justify-center p-4 sm:p-6 fade-in">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative bg-[#18181b] border border-glass-border rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden slide-up">
        {/* Header */}
        <div className="p-5 border-b border-glass-border bg-white/5 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary">
              <Pill size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white leading-tight">Quick Edit Medicine</h3>
              <p className="text-xs text-muted mt-0.5">ID: {medicineId} • Universal Sync</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-muted hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-custom">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red/10 border border-red/20 flex items-start gap-3">
              <AlertTriangle className="text-red shrink-0" size={20} />
              <p className="text-sm text-red">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted">
              <RefreshCw size={32} className="animate-spin mb-4 text-primary" />
              <p>Loading medicine details...</p>
            </div>
          ) : (
            <form id="quick-edit-form" onSubmit={handleSubmit} className="space-y-8">
              
              {/* Product Identity */}
              <section>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-glass-border pb-2">
                  <Pill size={16} className="text-primary" /> Identity & Branding
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-muted mb-1.5">Medicine Name *</label>
                    <input 
                      type="text" name="name" required value={form.name} onChange={handleChange}
                      className="w-full px-4 py-2.5 bg-black/40 border border-glass-border rounded-xl text-white focus:border-primary focus:outline-none transition-all font-bold text-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted mb-1.5">Generic Name (Formula)</label>
                    <input 
                      type="text" name="generic_name" value={form.generic_name} onChange={handleChange}
                      className="w-full px-4 py-2 bg-black/40 border border-glass-border rounded-xl text-sm text-white focus:border-primary focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted mb-1.5">Category</label>
                    <div className="relative">
                      <Tag size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                      <input 
                        type="text" name="category" value={form.category} onChange={handleChange}
                        className="w-full pl-9 pr-4 py-2 bg-black/40 border border-glass-border rounded-xl text-sm text-white focus:border-primary focus:outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Manufacturers */}
              <section>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-glass-border pb-2">
                  <Factory size={16} className="text-amber-500" /> Manufacturing
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-muted mb-1.5">Manufacturer</label>
                    <input 
                      type="text" name="manufacturer" value={form.manufacturer} onChange={handleChange}
                      className="w-full px-4 py-2 bg-black/40 border border-glass-border rounded-xl text-sm text-white focus:border-primary focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted mb-1.5">Marketed By</label>
                    <input 
                      type="text" name="marketed_by" value={form.marketed_by} onChange={handleChange}
                      className="w-full px-4 py-2 bg-black/40 border border-glass-border rounded-xl text-sm text-white focus:border-primary focus:outline-none transition-all"
                    />
                  </div>
                </div>
              </section>

              {/* Packaging & Logistics */}
              <section>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-glass-border pb-2">
                  <Package size={16} className="text-sky-500" /> Packaging & Codes
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-muted mb-1.5">Pack Size (e.g., 10x10)</label>
                    <input 
                      type="text" name="packaging" value={form.packaging} onChange={handleChange}
                      className="w-full px-4 py-2 bg-black/40 border border-glass-border rounded-xl text-sm text-white focus:border-primary focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted mb-1.5">Pack Unit (e.g., Strip)</label>
                    <input 
                      type="text" name="pack_unit" value={form.pack_unit} onChange={handleChange}
                      className="w-full px-4 py-2 bg-black/40 border border-glass-border rounded-xl text-sm text-white focus:border-primary focus:outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted mb-1.5">Barcode / Item Code</label>
                    <div className="relative">
                      <Barcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                      <input 
                        type="text" name="item_code" value={form.item_code} onChange={handleChange}
                        className="w-full pl-9 pr-4 py-2 bg-black/40 border border-glass-border rounded-xl text-sm text-white focus:border-primary focus:outline-none transition-all"
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Primary Stock */}
              <section>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-glass-border pb-2">
                  <Database size={16} className="text-emerald-500" /> Primary Stock Info
                </h4>
                {inventoryId ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                    <div>
                      <label className="block text-xs font-semibold text-emerald-500/80 mb-1.5">Primary Batch Quantity</label>
                      <input 
                        type="number" name="quantity" value={form.quantity} onChange={handleChange}
                        className="w-full px-4 py-2 bg-black/40 border border-glass-border rounded-xl text-sm text-white focus:border-emerald-500 focus:outline-none transition-all font-mono font-bold"
                      />
                      <p className="text-[10px] text-muted mt-1.5">Total stock across all batches: <strong>{totalStock}</strong></p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-emerald-500/80 mb-1.5">Rack Location</label>
                      <div className="relative">
                        <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                        <input 
                          type="text" name="rack_location" value={form.rack_location} onChange={handleChange}
                          className="w-full pl-9 pr-4 py-2 bg-black/40 border border-glass-border rounded-xl text-sm text-white focus:border-emerald-500 focus:outline-none transition-all uppercase"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-white/5 border border-glass-border text-center text-sm text-muted">
                    No physical inventory stock recorded for this medicine yet.
                  </div>
                )}
              </section>

              {/* Notes */}
              <section>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2 border-b border-glass-border pb-2">
                  <LayoutGrid size={16} className="text-purple-500" /> Additional Notes
                </h4>
                <textarea 
                  name="api_reference" 
                  value={form.api_reference} 
                  onChange={handleChange}
                  rows={3}
                  placeholder="Composition details, storage instructions, or general notes..."
                  className="w-full px-4 py-3 bg-black/40 border border-glass-border rounded-xl text-sm text-white focus:border-primary focus:outline-none transition-all resize-none"
                />
              </section>

            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-glass-border bg-black/40 flex justify-end gap-3 shrink-0">
          <button 
            type="button" 
            onClick={onClose}
            className="px-5 py-2 rounded-xl border border-glass-border hover:bg-white/10 text-muted hover:text-white font-medium transition-colors"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            form="quick-edit-form"
            disabled={saving || loading}
            className="px-6 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold transition-colors flex items-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
            {saving ? 'Saving...' : 'Save Universal Changes'}
          </button>
        </div>

      </div>
    </div>
  );
};
