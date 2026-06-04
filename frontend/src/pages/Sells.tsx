import { useState, useEffect, useCallback } from 'react';
import { Search, Filter, Edit3, Trash2, X, ChevronDown, ChevronUp, Calendar, Package, User, FileText, Save, AlertTriangle } from 'lucide-react';
import { api } from '../services/api';
import { toastEvent } from '../services/events';

interface SaleItem {
  id: number;
  invoice_id: number;
  inventory_id: number;
  quantity: number;
  unit_price: number;
  loose_qty?: number;
  pack_size?: number;
  batch_number?: string;
  expiry_date?: string;
  medicine_name?: string;
  mrp?: number;
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
  items?: SaleItem[];
}

const Sells = () => {
  const [invoices, setInvoices] = useState<SaleInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);

  // Edit modal state
  const [editInvoice, setEditInvoice] = useState<SaleInvoice | null>(null);
  const [editItems, setEditItems] = useState<SaleItem[]>([]);
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editDiscount, setEditDiscount] = useState(0);
  const [editPaymentMedium, setEditPaymentMedium] = useState('CASH');
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listSales({
        search: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        batch: batchFilter || undefined,
      });
      // STRICT RULE: Only show last 120
      setInvoices(Array.isArray(data) ? data.slice(0, 120) : []);
    } catch (err) {
      console.error('Failed to load sales:', err);
      toastEvent.trigger('Failed to load sales', 'error');
    } finally {
      setLoading(false);
    }
  }, [search, dateFrom, dateTo, batchFilter]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchInvoices();
  };

  const openEdit = async (invoice: SaleInvoice) => {
    try {
      const full = await api.getSale(invoice.id);
      setEditInvoice(full);
      setEditItems(full.items || []);
      setEditCustomerName(full.customer_name || '');
      setEditCustomerPhone(full.customer_phone || '');
      setEditPaymentMedium(full.payment_medium || 'CASH');
      setEditDiscount(0);
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
        })),
        patient_name: editCustomerName,
        patient_phone: editCustomerPhone,
        discount: editDiscount,
        paymentMedium: editPaymentMedium,
      });
      toastEvent.trigger('Invoice updated successfully', 'success');
      setEditInvoice(null);
      fetchInvoices();
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
      fetchInvoices();
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
    setEditItems(prev => prev.map((item, i) => i === index ? { ...item, mrp: mrp } : item));
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

  return (
    <div className="space-y-6 fade-in">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight">Sales Bills</h2>
          <p className="text-sm text-muted mt-1">View, filter, and edit all invoices</p>
        </div>
        <div className="text-xs text-muted font-semibold bg-white/5 px-3 py-1.5 rounded-full border border-glass-border">
          {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="glass-panel p-4">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by invoice #, customer name, or phone..."
              className="w-full pl-10 pr-4 py-2.5 bg-black/20 border border-glass-border rounded-lg text-sm text-text placeholder:text-muted/50 focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-all ${
              showFilters ? 'bg-primary/20 border-primary/40 text-primary' : 'bg-white/5 border-glass-border text-muted hover:text-text'
            }`}
          >
            <Filter size={14} />
            Filters
            {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            type="submit"
            className="px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/80 transition-colors"
          >
            Search
          </button>
        </form>

        {showFilters && (
          <div className="mt-4 pt-4 border-t border-glass-border flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-muted" />
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
              <Package size={14} className="text-muted" />
              <label className="text-xs font-semibold text-muted">Batch</label>
              <input
                type="text"
                value={batchFilter}
                onChange={e => setBatchFilter(e.target.value)}
                placeholder="Batch number..."
                className="px-3 py-1.5 bg-black/20 border border-glass-border rounded-lg text-sm text-text placeholder:text-muted/50 focus:outline-none focus:border-primary/50 w-40"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-muted">Amount</label>
              <input
                type="number"
                value={minAmount}
                onChange={e => setMinAmount(e.target.value)}
                placeholder="Min 0"
                min="0"
                max="100000000"
                className="px-3 py-1.5 bg-black/20 border border-glass-border rounded-lg text-sm text-text focus:outline-none focus:border-primary/50 w-24"
              />
              <span className="text-muted text-xs">-</span>
              <input
                type="number"
                value={maxAmount}
                onChange={e => setMaxAmount(e.target.value)}
                placeholder="Max 100M"
                min="0"
                max="100000000"
                className="px-3 py-1.5 bg-black/20 border border-glass-border rounded-lg text-sm text-text focus:outline-none focus:border-primary/50 w-28"
              />
            </div>
            {(dateFrom || dateTo || batchFilter || minAmount || maxAmount) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); setBatchFilter(''); setMinAmount(''); setMaxAmount(''); }}
                className="text-xs text-red hover:text-red/80 font-semibold flex items-center gap-1"
              >
                <X size={12} /> Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Invoices Table */}
      <div className="glass-panel overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-muted">
            <div className="animate-pulse">Loading invoices...</div>
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center text-muted">
            <FileText size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-semibold">No invoices found</p>
            <p className="text-xs mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border bg-black/20">Invoice #</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border bg-black/20">Date</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border bg-black/20">Customer</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border bg-black/20">Items</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border bg-black/20">Total</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border bg-black/20">Payment</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border bg-black/20">Status</th>
                  <th className="p-4 text-xs font-bold text-muted uppercase tracking-wider border-b border-glass-border bg-black/20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invoices.filter(inv => {
                  const total = Number(inv.total_amount) || 0;
                  const min = minAmount ? Number(minAmount) : 0;
                  const max = maxAmount ? Number(maxAmount) : 100000000;
                  return total >= min && total <= max;
                }).map(inv => (
                  <tr key={inv.id} className="hover:bg-white/5 transition-colors group">
                    <td className="p-4 border-b border-glass-border/50">
                      <span className="font-mono text-sm font-bold text-primary">{inv.invoice_no}</span>
                    </td>
                    <td className="p-4 border-b border-glass-border/50 text-sm text-muted">
                      {formatDate(inv.date)}
                    </td>
                    <td className="p-4 border-b border-glass-border/50">
                      <div className="flex items-center gap-2">
                        <User size={14} className="text-muted/50" />
                        <div>
                          <div className="text-sm font-semibold">{inv.customer_name || 'Walk-in'}</div>
                          {inv.customer_phone && <div className="text-[10px] text-muted">{inv.customer_phone}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="p-4 border-b border-glass-border/50 text-sm text-muted">
                      {inv.items?.length || 0} item{inv.items?.length !== 1 ? 's' : ''}
                    </td>
                    <td className="p-4 border-b border-glass-border/50">
                      <span className="text-sm font-bold text-green">₹{Number(inv.total_amount).toFixed(2)}</span>
                    </td>
                    <td className="p-4 border-b border-glass-border/50">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-white/10 text-muted">
                        {inv.payment_medium || 'CASH'}
                      </span>
                    </td>
                    <td className="p-4 border-b border-glass-border/50">
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        inv.payment_status === 'PAID' ? 'bg-green/20 text-green' : 'bg-amber/20 text-amber'
                      }`}>
                        {inv.payment_status || 'PAID'}
                      </span>
                    </td>
                    <td className="p-4 border-b border-glass-border/50">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEdit(inv)}
                          className="p-1.5 rounded-lg hover:bg-primary/20 text-muted hover:text-primary transition-all"
                          title="Edit invoice"
                        >
                          <Edit3 size={14} />
                        </button>
                        {deleteConfirm === inv.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(inv.id)}
                              className="px-2 py-1 bg-red text-white rounded text-[10px] font-bold hover:bg-red/80"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="px-2 py-1 bg-white/10 text-muted rounded text-[10px] font-bold hover:bg-white/20"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(inv.id)}
                            className="p-1.5 rounded-lg hover:bg-red/20 text-muted hover:text-red transition-all"
                            title="Delete invoice"
                          >
                            <Trash2 size={14} />
                          </button>
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

      {/* Edit Modal */}
      {editInvoice && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
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
                        const unitRate = item.mrp ? item.mrp / packSize : item.unit_price;
                        const itemTotal = (item.unit_price * item.quantity) + (unitRate * looseQty);
                        return (
                          <tr key={item.id} className="hover:bg-white/5">
                            <td className="p-3 border-b border-glass-border/50 text-sm font-semibold">{item.medicine_name || `Item #${item.inventory_id}`}</td>
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
                              ₹{itemTotal.toFixed(2)}
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
                          ₹{editItems.reduce((sum, item) => {
                            const packSize = item.pack_size || 10;
                            const looseQty = item.loose_qty || 0;
                            const mrp = item.mrp || item.unit_price;
                            const unitRate = mrp / packSize;
                            return sum + (item.unit_price * item.quantity) + (unitRate * looseQty);
                          }, 0).toFixed(2)}
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
                    ₹{(editItems.reduce((sum, item) => {
                      const packSize = item.pack_size || 10;
                      const looseQty = item.loose_qty || 0;
                      const mrp = item.mrp || item.unit_price;
                      const unitRate = mrp / packSize;
                      return sum + (item.unit_price * item.quantity) + (unitRate * looseQty);
                    }, 0) * 1.05 - editDiscount).toFixed(2)}
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
        </div>
      )}
    </div>
  );
};

export default Sells;
