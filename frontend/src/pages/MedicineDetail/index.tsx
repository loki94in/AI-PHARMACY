import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Package, TrendingUp, ShoppingCart, RotateCcw,
  Truck, AlertTriangle, CheckCircle, RefreshCw, ExternalLink,
  Boxes, ClipboardList, Calendar, BadgeIndianRupee, BarChart3,
} from 'lucide-react';
import api from '../../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Batch {
  id: number; batch_no: string; expiry_date: string;
  quantity: number; loose_quantity: number;
  mrp: number; cost_price: number; rack_location: string;
}
interface PurchaseRow {
  id: number; batch_no: string; expiry_date: string;
  quantity: number; free_qty: number; cost_price: number; mrp: number;
  date: string; invoice_no: string;
  distributor_name: string; distributor_id: number;
}
interface SaleRow {
  id: number; quantity: number; unit_price: number; loose_qty: number;
  invoice_no: string; date: string; patient_name: string;
}
interface ReturnRow {
  batch_no: string; quantity: number; expiry_date: string;
  date: string; return_no: string; distributor_name: string;
}
interface Analytics {
  totalStock: number; avgMonthlyConsumption: number;
  monthsRemaining: string | null; reorderPoint: number;
  suggestedOrderQty: number | null;
}
interface MedicineDetail {
  medicine: Record<string, any>;
  batches: Batch[];
  purchases: PurchaseRow[];
  sales: SaleRow[];
  returned: ReturnRow[];
  analytics: Analytics;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtMoney(n: number | null | undefined) {
  if (n == null) return '—';
  return `₹${Number(n).toFixed(2)}`;
}
function expiryColor(dateStr: string) {
  const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  if (diff <= 0) return 'text-red-400 bg-red-500/10 border-red-500/30';
  if (diff <= 30) return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
  if (diff <= 90) return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
  return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MedicineDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<MedicineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ordering, setOrdering] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'batches' | 'purchases' | 'sales' | 'returns'>('batches');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/medicines/${id}`);
      if (!res.ok) throw new Error(`${res.status}`);
      setData(await res.json());
    } catch (e: any) {
      setError('Failed to load medicine details.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleAutoOrder = async () => {
    if (!data) return;
    const { medicine, analytics } = data;
    const qty = analytics.suggestedOrderQty ?? analytics.avgMonthlyConsumption * 3;
    if (qty <= 0) return;
    setOrdering(true);
    try {
      await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product: medicine.name,
          requester: 'Auto-Order System',
          phone: medicine.distributor_phone || '',
          qty,
          priority: 'normal',
          status: 'ordered',
          distributor_id: medicine.primary_distributor_id || null,
        }),
      });
      setOrderSuccess(true);
      setTimeout(() => setOrderSuccess(false), 3000);
    } catch {
      alert('Failed to create order. Please try manually.');
    } finally {
      setOrdering(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <RefreshCw className="animate-spin text-primary" size={28} />
    </div>
  );

  if (error || !data) return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-muted">
      <AlertTriangle size={36} className="text-red-400" />
      <p className="text-sm">{error || 'Medicine not found'}</p>
      <button onClick={() => navigate(-1)} className="premium-btn text-xs">← Go Back</button>
    </div>
  );

  const { medicine, batches, purchases, sales, returned, analytics } = data;
  const needsReorder = analytics.totalStock <= analytics.reorderPoint && analytics.reorderPoint > 0;

  return (
    <div className="flex flex-col gap-5 fade-in max-w-7xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate(-1)}
          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-glass-border transition-all mt-1">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-text truncate">{medicine.name}</h1>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {medicine.generic_name && (
              <span className="text-xs text-muted bg-white/5 border border-glass-border px-2 py-0.5 rounded-full">
                {medicine.generic_name}
              </span>
            )}
            {medicine.schedule_type && medicine.schedule_type !== 'None' && (
              <span className="text-xs font-bold text-purple-400 bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 rounded-full">
                {medicine.schedule_type}
              </span>
            )}
            {medicine.category && (
              <span className="text-xs text-sky-400 bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded-full">
                {medicine.category}
              </span>
            )}
            {medicine.manufacturer && (
              <span className="text-xs text-muted">{medicine.manufacturer}</span>
            )}
          </div>
        </div>
        <button onClick={load}
          className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-glass-border transition-all">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* ── Reorder Alert Banner ── */}
      {needsReorder && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle size={18} className="text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-400">Stock below reorder level</p>
            <p className="text-xs text-muted">
              Current: <strong className="text-text">{analytics.totalStock}</strong> units ·
              Reorder point: <strong className="text-text">{analytics.reorderPoint}</strong> ·
              Suggest ordering <strong className="text-amber-400">{analytics.suggestedOrderQty}</strong> units
            </p>
          </div>
          <button
            onClick={handleAutoOrder}
            disabled={ordering || orderSuccess}
            className={`shrink-0 px-4 py-2 rounded-lg text-xs font-bold transition-all border ${
              orderSuccess
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                : 'bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30'
            }`}
          >
            {ordering ? 'Ordering…' : orderSuccess ? '✓ Ordered!' : '⚡ Auto Order'}
          </button>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Boxes, label: 'Total Stock', value: `${analytics.totalStock} units`, color: 'text-sky-400' },
          { icon: BarChart3, label: 'Avg Monthly Sales', value: analytics.avgMonthlyConsumption > 0 ? `${analytics.avgMonthlyConsumption} units` : 'No data', color: 'text-violet-400' },
          { icon: Calendar, label: 'Stock Months Left', value: analytics.monthsRemaining ? `${analytics.monthsRemaining} mo` : 'N/A', color: analytics.monthsRemaining && parseFloat(analytics.monthsRemaining) < 2 ? 'text-red-400' : 'text-emerald-400' },
          { icon: BadgeIndianRupee, label: 'MRP', value: fmtMoney(medicine.mrp), color: 'text-amber-400' },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="glass-panel p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-muted text-xs font-bold uppercase tracking-wider">
              <Icon size={13} />
              {label}
            </div>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Info + Distributor ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Medicine Info */}
        <div className="glass-panel p-5">
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
            <Package size={13} /> Medicine Info
          </h2>
          <div className="space-y-2 text-sm">
            {[
              ['HSN Code', medicine.hsn_code],
              ['Packaging', medicine.packaging],
              ['Strength', medicine.strength],
              ['Item Type', medicine.item_type],
              ['CGST', medicine.cgst_per ? `${medicine.cgst_per}%` : null],
              ['SGST', medicine.sgst_per ? `${medicine.sgst_per}%` : null],
              ['Rack', medicine.rack],
              ['Minimum Limit', medicine.minimum_limit],
              ['Item Code', medicine.item_code],
            ].filter(([, v]) => v != null && v !== '').map(([label, value]) => (
              <div key={label as string} className="flex justify-between gap-2 border-b border-glass-border/20 pb-1.5">
                <span className="text-muted">{label}</span>
                <span className="text-text font-medium text-right">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Distributor */}
        <div className="glass-panel p-5">
          <h2 className="text-xs font-bold text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
            <Truck size={13} /> Primary Distributor
          </h2>
          {medicine.primary_distributor_name ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
                  <Truck size={18} className="text-primary" />
                </div>
                <div>
                  <p className="font-bold text-text">{medicine.primary_distributor_name}</p>
                  <p className="text-xs text-muted">Based on last purchase</p>
                </div>
                <button
                  onClick={() => navigate('/purchases', { state: { prefilledPurchase: { distributorName: medicine.primary_distributor_name } } })}
                  className="ml-auto p-1.5 rounded-lg hover:bg-white/10 transition-all"
                  title="View purchases from this distributor"
                >
                  <ExternalLink size={14} className="text-muted" />
                </button>
              </div>
              {medicine.distributor_phone && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted">📞</span>
                  <a href={`tel:${medicine.distributor_phone}`} className="text-sky-400 hover:underline">{medicine.distributor_phone}</a>
                </div>
              )}
              {medicine.distributor_email && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted">✉</span>
                  <span className="text-text">{medicine.distributor_email}</span>
                </div>
              )}

              {/* Auto-Order Section */}
              <div className="mt-4 pt-4 border-t border-glass-border/30">
                <p className="text-xs font-bold text-muted uppercase tracking-wider mb-3">Auto-Order via Distributor</p>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <div className="bg-white/5 rounded-lg p-2.5 border border-glass-border/30">
                    <p className="text-muted">Avg Monthly Use</p>
                    <p className="font-bold text-text mt-0.5">{analytics.avgMonthlyConsumption} units</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2.5 border border-glass-border/30">
                    <p className="text-muted">Suggested Order</p>
                    <p className="font-bold text-amber-400 mt-0.5">
                      {analytics.suggestedOrderQty != null ? `${analytics.suggestedOrderQty} units` : 'N/A'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleAutoOrder}
                  disabled={ordering || orderSuccess || !analytics.suggestedOrderQty}
                  className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all border ${
                    orderSuccess
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                      : analytics.suggestedOrderQty
                      ? 'bg-primary/20 border-primary/40 text-primary hover:bg-primary/30'
                      : 'opacity-40 bg-white/5 border-glass-border text-muted cursor-not-allowed'
                  }`}
                >
                  {ordering ? '⏳ Placing Order…'
                    : orderSuccess ? '✓ Order Placed!'
                    : analytics.suggestedOrderQty
                    ? `⚡ Order ${analytics.suggestedOrderQty} units from ${medicine.primary_distributor_name}`
                    : 'Stock is sufficient'}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted text-sm">
              <Truck size={28} className="mx-auto mb-2 opacity-30" />
              No distributor linked yet.
              <br />
              <span className="text-xs">Purchase this medicine to auto-detect distributor.</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs: Batches / Purchases / Sales / Returns ── */}
      <div className="glass-panel overflow-hidden">
        <div className="flex border-b border-glass-border/30 bg-bg2/30">
          {([
            ['batches', Boxes, `Batches (${batches.length})`],
            ['purchases', ShoppingCart, `Purchases (${purchases.length})`],
            ['sales', TrendingUp, `Sales (${sales.length})`],
            ['returns', RotateCcw, `Returns (${returned.length})`],
          ] as const).map(([tab, Icon, label]) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-2 px-5 py-3 text-xs font-bold border-b-2 transition-all ${
                activeTab === tab
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-muted hover:text-text'
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          {/* Batches Tab */}
          {activeTab === 'batches' && (
            batches.length === 0
              ? <EmptyState label="No stock batches in inventory" />
              : <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-bg2/90 backdrop-blur border-b border-glass-border/30">
                    <tr>{['Batch No', 'Expiry', 'Qty', 'Loose Qty', 'MRP', 'Cost', 'Rack'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-glass-border/20">
                    {batches.map(b => (
                      <tr key={b.id} className="hover:bg-white/3 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-text">{b.batch_no || '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${expiryColor(b.expiry_date)}`}>
                            {fmtDate(b.expiry_date)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-bold text-text">{b.quantity}</td>
                        <td className="px-4 py-2.5 text-muted">{b.loose_quantity || 0}</td>
                        <td className="px-4 py-2.5 text-amber-400 font-medium">{fmtMoney(b.mrp)}</td>
                        <td className="px-4 py-2.5 text-muted">{fmtMoney(b.cost_price)}</td>
                        <td className="px-4 py-2.5 text-muted">{b.rack_location || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
          )}

          {/* Purchases Tab */}
          {activeTab === 'purchases' && (
            purchases.length === 0
              ? <EmptyState label="No purchase history found" />
              : <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-bg2/90 backdrop-blur border-b border-glass-border/30">
                    <tr>{['Invoice', 'Date', 'Distributor', 'Batch', 'Qty', 'Free', 'Cost', 'MRP'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-glass-border/20">
                    {purchases.map(p => (
                      <tr key={p.id} className="hover:bg-white/3 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-sky-400">{p.invoice_no || '—'}</td>
                        <td className="px-4 py-2.5 text-muted">{fmtDate(p.date)}</td>
                        <td className="px-4 py-2.5 text-text">{p.distributor_name || '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-muted">{p.batch_no || '—'}</td>
                        <td className="px-4 py-2.5 font-bold text-text">{p.quantity}</td>
                        <td className="px-4 py-2.5 text-emerald-400">{p.free_qty || 0}</td>
                        <td className="px-4 py-2.5 text-muted">{fmtMoney(p.cost_price)}</td>
                        <td className="px-4 py-2.5 text-amber-400">{fmtMoney(p.mrp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
          )}

          {/* Sales Tab */}
          {activeTab === 'sales' && (
            sales.length === 0
              ? <EmptyState label="No sales found for this medicine" />
              : <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-bg2/90 backdrop-blur border-b border-glass-border/30">
                    <tr>{['Invoice', 'Date', 'Patient', 'Qty', 'Loose', 'Unit Price', 'Total'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-glass-border/20">
                    {sales.map(s => (
                      <tr key={s.id} className="hover:bg-white/3 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-emerald-400">{s.invoice_no || '—'}</td>
                        <td className="px-4 py-2.5 text-muted">{fmtDate(s.date)}</td>
                        <td className="px-4 py-2.5 text-text">{s.patient_name || 'Walk-in'}</td>
                        <td className="px-4 py-2.5 font-bold text-text">{s.quantity}</td>
                        <td className="px-4 py-2.5 text-muted">{s.loose_qty || 0}</td>
                        <td className="px-4 py-2.5 text-amber-400">{fmtMoney(s.unit_price)}</td>
                        <td className="px-4 py-2.5 font-bold text-text">
                          {fmtMoney((s.quantity * s.unit_price) + (s.loose_qty * s.unit_price / 10))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
          )}

          {/* Returns Tab */}
          {activeTab === 'returns' && (
            returned.length === 0
              ? <EmptyState label="No purchase returns for this medicine" />
              : <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-bg2/90 backdrop-blur border-b border-glass-border/30">
                    <tr>{['Return No', 'Date', 'Distributor', 'Batch', 'Qty', 'Expiry'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-muted uppercase tracking-wider">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-glass-border/20">
                    {returned.map((r, i) => (
                      <tr key={i} className="hover:bg-white/3 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-orange-400">{r.return_no || '—'}</td>
                        <td className="px-4 py-2.5 text-muted">{fmtDate(r.date)}</td>
                        <td className="px-4 py-2.5 text-text">{r.distributor_name || '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-muted">{r.batch_no || '—'}</td>
                        <td className="px-4 py-2.5 font-bold text-red-400">{r.quantity}</td>
                        <td className="px-4 py-2.5">
                          {r.expiry_date
                            ? <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${expiryColor(r.expiry_date)}`}>{fmtDate(r.expiry_date)}</span>
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted gap-2">
      <ClipboardList size={28} className="opacity-30" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
