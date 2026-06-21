import React, { useState, useEffect } from 'react';
import { RefreshCw, ExternalLink, ShoppingCart, HelpCircle, Package, AlertCircle, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { toastEvent } from '../../services/events';

interface CartItem {
  productId: number;
  storeId: number;
  productName: string;
  packaging: string;
  distributor: string;
  qty: number;
  rate: number | null;
  mrp: number | null;
  scheme: string;
  amount: number | null;
}

export default function PharmarackCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'Live' | 'Unknown'>('Unknown');

  const fetchCart = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getPharmarackCart();
      if (data && data.success) {
        setItems(data.items || []);
        setMode(data.mode || 'Live');
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

  const handleReload = () => {
    fetchCart();
  };

  // Group items by distributor
  const groupedItems = items.reduce((acc, item) => {
    const dist = item.distributor || 'Unknown Distributor';
    if (!acc[dist]) {
      acc[dist] = [];
    }
    acc[dist].push(item);
    return acc;
  }, {} as Record<string, CartItem[]>);

  // Calculate overall totals
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);
  const totalAmount = items.reduce((sum, item) => {
    const val = item.amount !== null ? item.amount : (item.rate || 0) * item.qty;
    return sum + val;
  }, 0);

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
              {mode !== 'Unknown' && (
                <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                  ● LIVE
                </span>
              )}
            </h3>
            <p className="text-[10px] text-muted tracking-wider mt-1">
              Distributor Cart and Order Breakdown
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh/Reload */}
          <button
            onClick={handleReload}
            disabled={loading}
            className="p-2 rounded-lg bg-bg2 border border-glass-border text-muted hover:text-text hover:bg-bg3 transition-all active:scale-95 flex items-center justify-center disabled:opacity-50"
            title="Refresh Cart Contents"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-primary' : ''} />
          </button>

          {/* Open External */}
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
      <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
            <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" />
            <p className="text-xs text-muted font-bold tracking-wider uppercase animate-pulse">
              Loading Cart Contents…
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
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
            <ShoppingCart size={48} className="text-muted/30" />
            <div>
              <p className="text-sm font-bold text-text">Your cart is empty</p>
              <p className="text-xs text-muted mt-1">Items added through Quick Special Request will appear here.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedItems).map(([distributor, distItems]) => (
              <div key={distributor} className="bg-bg2/30 border border-glass-border rounded-xl overflow-hidden shadow-sm">
                <div className="bg-bg3/60 px-4 py-2.5 border-b border-glass-border flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-text tracking-wide uppercase flex items-center gap-2">
                    <Package size={14} className="text-sky" />
                    {distributor}
                  </h4>
                  <span className="text-[10px] text-muted font-bold px-2 py-0.5 bg-bg/50 rounded-full border border-glass-border/30">
                    {distItems.length} Product{distItems.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className="divide-y divide-glass-border/20">
                  {distItems.map((item, idx) => (
                    <div key={`${item.productId}-${idx}`} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-bg3/10 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-text truncate">{item.productName}</span>
                          {item.packaging && (
                            <span className="text-[10px] text-muted bg-bg3/50 px-1.5 py-0.5 rounded border border-glass-border/40 font-semibold uppercase font-mono">
                              {item.packaging}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1.5 text-xs text-muted">
                          {item.rate !== null && (
                            <span>PTR: <strong className="text-text font-bold">₹{item.rate.toFixed(2)}</strong></span>
                          )}
                          {item.mrp !== null && (
                            <span>MRP: <strong className="text-text/70">₹{item.mrp.toFixed(2)}</strong></span>
                          )}
                          {item.scheme && (
                            <span className="text-[10px] font-bold text-green bg-green/10 px-1.5 py-0.5 rounded border border-green/20">
                              Scheme: {item.scheme}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-6 flex-shrink-0">
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted uppercase tracking-wider font-bold">Qty:</span>
                          <span className="text-sm font-black text-text font-mono bg-bg2 px-2.5 py-1 rounded border border-glass-border/60">
                            {item.qty}
                          </span>
                        </div>

                        <div className="text-right min-w-[80px]">
                          <p className="text-[10px] text-muted font-bold uppercase tracking-wider leading-none">Total</p>
                          <p className="text-sm font-black text-emerald-400 font-mono mt-1">
                            ₹{((item.amount !== null ? item.amount : (item.rate || 0) * item.qty)).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Footer / Total Summary ── */}
      {items.length > 0 && !loading && (
        <div className="border-t border-glass-border bg-bg2/40 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 shrink-0 shadow-lg">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-[10px] text-muted font-bold uppercase tracking-wider block">Total Items</span>
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
