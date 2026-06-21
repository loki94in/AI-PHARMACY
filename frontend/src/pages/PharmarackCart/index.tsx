import React, { useState, useEffect } from 'react';
import { RefreshCw, ExternalLink, ShoppingCart, Package, AlertCircle, Truck, Clock } from 'lucide-react';
import { api } from '../../services/api';
import { toastEvent } from '../../services/events';

interface CartLineItem {
  productId: number | null;
  storeId: number;
  productCode: string;
  productName: string;
  company: string;
  packaging: string;
  qty: number;
  ptr: number;
  mrp: number;
  scheme: string;
  stock: number | null;
  amount: number;
  cartSource: string;
  isChecked: boolean;
  createdDate: string;
}

interface Distributor {
  storeId: number;
  storeName: string;
  lineTotal: number;
  deliveryPersons: { name: string; code: string }[];
  items: CartLineItem[];
}

export default function PharmarackCart() {
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchCart = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getPharmarackCart();
      if (data && data.success) {
        setDistributors(data.distributors || []);
        setLastFetched(new Date());
      } else {
        setError('Failed to retrieve cart details.');
      }
    } catch (err: any) {
      console.error('Failed to fetch Pharmarack cart:', err);
      setError(err?.response?.data?.error || 'Failed to fetch cart. Please check server logs or verify your session.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCart();
  }, []);

  const totalProducts = distributors.reduce((s, d) => s + d.items.length, 0);
  const totalQty = distributors.reduce((s, d) => s + d.items.reduce((q, i) => q + i.qty, 0), 0);
  const totalAmount = distributors.reduce((s, d) => s + d.items.reduce((a, i) => a + i.amount, 0), 0);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-text">
      {/* ── Top Header ── */}
      <div className="h-16 border-b border-glass-border/40 px-6 flex items-center justify-between shrink-0 bg-glass-bg/10 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <ShoppingCart size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-text tracking-wide uppercase leading-none flex items-center gap-2">
              Pharmarack Cart
              <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                ● LIVE
              </span>
            </h3>
            <p className="text-[10px] text-muted tracking-wider mt-1">
              {lastFetched
                ? `Last synced ${lastFetched.toLocaleTimeString()}`
                : 'Syncing with Pharmarack…'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchCart}
            disabled={loading}
            className="p-2 rounded-lg bg-bg2 border border-glass-border text-muted hover:text-text hover:bg-bg3 transition-all active:scale-95 flex items-center justify-center disabled:opacity-50"
            title="Refresh Cart Contents"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-primary' : ''} />
          </button>

          <a
            href="https://retailers.pharmarack.com/cart"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-bg2 border border-glass-border text-muted hover:text-text hover:bg-bg3 transition-all text-xs font-bold active:scale-95"
            title="Open Cart on retailers.pharmarack.com"
          >
            <ExternalLink size={13} />
            <span>Open External</span>
          </a>
        </div>
      </div>

      {/* ── Main Area ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5 min-h-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
            <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" />
            <p className="text-xs text-muted font-bold tracking-wider uppercase animate-pulse">
              Fetching Live Cart…
            </p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 max-w-md mx-auto text-center py-12">
            <AlertCircle size={32} className="text-red/80" />
            <div>
              <p className="text-sm font-bold text-text">Failed to fetch cart</p>
              <p className="text-xs text-muted mt-1">{error}</p>
            </div>
            <button
              onClick={fetchCart}
              className="premium-btn bg-primary text-text px-4 py-2 hover:bg-primary/80 text-xs font-bold"
            >
              Retry
            </button>
          </div>
        ) : distributors.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
            <ShoppingCart size={48} className="text-muted/30" />
            <div>
              <p className="text-sm font-bold text-text">Your cart is empty</p>
              <p className="text-xs text-muted mt-1">Add items using the Live Cart Add feature or from Pharmarack directly.</p>
            </div>
          </div>
        ) : (
          distributors.map((dist) => (
            <div key={dist.storeId} className="bg-bg2/30 border border-glass-border rounded-xl overflow-hidden shadow-sm">
              {/* Distributor header */}
              <div className="bg-bg3/60 px-4 py-2.5 border-b border-glass-border flex items-center justify-between">
                <h4 className="text-xs font-extrabold text-text tracking-wide uppercase flex items-center gap-2">
                  <Package size={14} className="text-sky" />
                  {dist.storeName}
                </h4>
                <div className="flex items-center gap-3">
                  {dist.deliveryPersons.length > 0 && (
                    <span className="text-[10px] text-muted flex items-center gap-1">
                      <Truck size={11} />
                      {dist.deliveryPersons[0].name}
                    </span>
                  )}
                  <span className="text-[10px] text-muted font-bold px-2 py-0.5 bg-bg/50 rounded-full border border-glass-border/30">
                    {dist.items.length} item{dist.items.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Line items table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-glass-border/30 text-muted font-bold uppercase tracking-wider text-[10px]">
                      <th className="text-left px-4 py-2">Product</th>
                      <th className="text-left px-3 py-2">Company</th>
                      <th className="text-center px-3 py-2">Pack</th>
                      <th className="text-center px-3 py-2">Qty</th>
                      <th className="text-right px-3 py-2">PTR</th>
                      <th className="text-right px-3 py-2">MRP</th>
                      <th className="text-center px-3 py-2">Scheme</th>
                      <th className="text-center px-3 py-2">Stock</th>
                      <th className="text-right px-4 py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-glass-border/15">
                    {dist.items.map((item, idx) => (
                      <tr key={`${item.productCode}-${idx}`} className="hover:bg-bg3/10 transition-colors">
                        <td className="px-4 py-2.5">
                          <span className="font-bold text-text text-[11px]">{item.productName}</span>
                        </td>
                        <td className="px-3 py-2.5 text-muted text-[10px] max-w-[120px] truncate">{item.company}</td>
                        <td className="px-3 py-2.5 text-center">
                          {item.packaging && (
                            <span className="text-[9px] text-muted bg-bg3/50 px-1.5 py-0.5 rounded border border-glass-border/40 font-mono">
                              {item.packaging}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className="font-black text-text font-mono bg-bg2 px-2 py-0.5 rounded border border-glass-border/60 text-[11px]">
                            {item.qty}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-text text-[11px]">
                          {item.ptr > 0 ? `₹${item.ptr.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-muted text-[11px]">
                          {item.mrp > 0 ? `₹${item.mrp.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {item.scheme ? (
                            <span className="text-[9px] font-bold text-green bg-green/10 px-1.5 py-0.5 rounded border border-green/20">
                              {item.scheme}
                            </span>
                          ) : (
                            <span className="text-muted/40">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-[10px]">
                          {item.stock !== null ? (
                            <span className={item.stock > 10 ? 'text-emerald-400' : item.stock > 0 ? 'text-amber-400' : 'text-red'}>
                              {item.stock}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-black text-emerald-400 text-[11px]">
                          {item.amount > 0 ? `₹${item.amount.toFixed(2)}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Distributor subtotal */}
              {dist.lineTotal > 0 && (
                <div className="border-t border-glass-border/30 px-4 py-2 bg-bg3/30 flex justify-end">
                  <span className="text-[10px] text-muted font-bold uppercase tracking-wider mr-3">Subtotal</span>
                  <span className="text-xs font-black text-emerald-400 font-mono">₹{dist.lineTotal.toFixed(2)}</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* ── Footer / Total Summary ── */}
      {distributors.length > 0 && !loading && (
        <div className="border-t border-glass-border bg-bg2/40 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 shadow-lg">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-[10px] text-muted font-bold uppercase tracking-wider block">Distributors</span>
              <span className="text-base font-black text-text font-mono">{distributors.length}</span>
            </div>
            <div className="h-6 w-[1px] bg-glass-border/30" />
            <div>
              <span className="text-[10px] text-muted font-bold uppercase tracking-wider block">Products</span>
              <span className="text-base font-black text-text font-mono">{totalProducts}</span>
            </div>
            <div className="h-6 w-[1px] bg-glass-border/30" />
            <div>
              <span className="text-[10px] text-muted font-bold uppercase tracking-wider block">Total Qty</span>
              <span className="text-base font-black text-text font-mono">{totalQty}</span>
            </div>
            <div className="h-6 w-[1px] bg-glass-border/30" />
            <div>
              <span className="text-[10px] text-muted font-bold uppercase tracking-wider block">Estimated Total</span>
              <span className="text-lg font-black text-emerald-400 font-mono">₹{totalAmount.toFixed(2)}</span>
            </div>
          </div>

          <a
            href="https://retailers.pharmarack.com/cart"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto premium-btn bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2.5 px-6 rounded-xl flex items-center justify-center gap-2 active:scale-95 shadow-[0_4px_14px_rgba(16,185,129,0.4)] transition-all"
          >
            <ExternalLink size={14} />
            <span>Proceed to Checkout</span>
          </a>
        </div>
      )}
    </div>
  );
}
