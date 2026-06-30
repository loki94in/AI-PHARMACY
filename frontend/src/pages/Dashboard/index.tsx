import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDeferredEffect } from '../../hooks/useDeferredEffect';
import {
  IndianRupee, PackageOpen, ListTodo, ArrowUpRight, ArrowDownRight,
  AlertTriangle, Clock, CheckCircle, Activity, RefreshCw,
  ShoppingBag, CalendarDays, ClipboardList, TrendingUp,
} from 'lucide-react';
import { api } from '../../services/api';
import { appCache } from '../../services/appCache';
import type { DashboardStats } from '../../services/api';

const fmtMoney = (n: number) => `₹${Number(n || 0).toFixed(2)}`;
const fmtDate  = (d: string) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

const Dashboard = () => {
  const navigate = useNavigate();
  const cached = appCache.get<DashboardStats>('dashboard');
  const [stats, setStats]     = useState<DashboardStats | null>(cached || null);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [dateStr, setDateStr] = useState('');

  const loadDashboard = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await api.getDashboard();
      setStats(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setTimeout(() => setRefreshing(false), 600);
    }
  }, []);

  useDeferredEffect(() => {
    setDateStr(new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
    loadDashboard();
  }, []);

  useEffect(() => appCache.subscribe('dashboard', (s) => { if (s === null) loadDashboard(); }), [loadDashboard]);

  const handleDismissAlert = async (id: number) => {
    try {
      await api.dismissDashboardAlert(id);
      setStats(prev => {
        if (!prev) return null;
        return { ...prev, pendingTasks: Math.max(0, prev.pendingTasks - 1), alerts: prev.alerts?.filter(a => a.id !== id) };
      });
    } catch {}
  };

  if (loading) return <div className="animate-pulse text-muted p-8">Loading dashboard…</div>;
  if (error)   return <div className="text-red p-4 glass-panel border-red/20">{error}</div>;

  const change = stats?.salesChange;
  const changeUp = change !== null && change !== undefined && change >= 0;

  return (
    <div className="space-y-6 fade-in">

      {/* ── Header ── */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight mb-1">Welcome back 👋</h2>
          <p className="text-muted text-sm">{dateStr}</p>
        </div>
        <button
          onClick={loadDashboard} disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-glass-border bg-glass-bg/30 text-muted text-xs font-semibold hover:text-primary hover:border-primary/40 transition-all disabled:opacity-50"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin text-primary' : ''} />
          Refresh
        </button>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Today Sales */}
        <div className="glass-panel p-5 relative overflow-hidden cursor-pointer hover:border-emerald-500/30 transition-all" onClick={() => navigate('/sells')}>
          <div className="absolute top-0 right-0 w-28 h-28 bg-[radial-gradient(circle,rgba(16,185,129,0.12)_0%,transparent_70%)] translate-x-6 -translate-y-6 pointer-events-none" />
          <IndianRupee className="absolute right-5 top-5 text-muted/20" size={26} />
          <p className="text-[10px] text-muted font-bold uppercase tracking-wider mb-2">Today's Sales</p>
          <p className="text-2xl font-extrabold text-emerald-400">{fmtMoney(stats?.todaySales || 0)}</p>
          {change !== null && change !== undefined ? (
            <div className={`flex items-center gap-1 mt-1.5 text-[11px] font-semibold ${changeUp ? 'text-emerald-400' : 'text-red-400'}`}>
              {changeUp ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
              {Math.abs(change)}% vs yesterday ({fmtMoney(stats?.yesterdaySales || 0)})
            </div>
          ) : (
            <p className="text-[11px] text-muted mt-1.5">No sales yesterday</p>
          )}
        </div>

        {/* Low Stock */}
        <div className="glass-panel p-5 relative overflow-hidden cursor-pointer hover:border-red-500/30 transition-all" onClick={() => navigate('/inventory')}>
          <div className="absolute top-0 right-0 w-28 h-28 bg-[radial-gradient(circle,rgba(239,68,68,0.12)_0%,transparent_70%)] translate-x-6 -translate-y-6 pointer-events-none" />
          <PackageOpen className="absolute right-5 top-5 text-muted/20" size={26} />
          <p className="text-[10px] text-muted font-bold uppercase tracking-wider mb-2">Low Stock</p>
          <p className={`text-2xl font-extrabold ${(stats?.lowStock || 0) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>{stats?.lowStock || 0}</p>
          <p className="text-[11px] text-muted mt-1.5">{(stats?.lowStock || 0) > 0 ? 'Items below 5 units' : 'All stock healthy'}</p>
        </div>

        {/* Expiry Alert */}
        <div className="glass-panel p-5 relative overflow-hidden cursor-pointer hover:border-amber-500/30 transition-all" onClick={() => navigate('/expiry')}>
          <div className="absolute top-0 right-0 w-28 h-28 bg-[radial-gradient(circle,rgba(245,158,11,0.12)_0%,transparent_70%)] translate-x-6 -translate-y-6 pointer-events-none" />
          <CalendarDays className="absolute right-5 top-5 text-muted/20" size={26} />
          <p className="text-[10px] text-muted font-bold uppercase tracking-wider mb-2">Expiring Soon</p>
          <p className={`text-2xl font-extrabold ${(stats?.expiryCount || 0) > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{stats?.expiryCount || 0}</p>
          <p className="text-[11px] text-muted mt-1.5">Items in inventory</p>
        </div>

        {/* Pending Orders */}
        <div className="glass-panel p-5 relative overflow-hidden cursor-pointer hover:border-sky-500/30 transition-all" onClick={() => navigate('/orders')}>
          <div className="absolute top-0 right-0 w-28 h-28 bg-[radial-gradient(circle,rgba(14,165,233,0.12)_0%,transparent_70%)] translate-x-6 -translate-y-6 pointer-events-none" />
          <ClipboardList className="absolute right-5 top-5 text-muted/20" size={26} />
          <p className="text-[10px] text-muted font-bold uppercase tracking-wider mb-2">Pending Orders</p>
          <p className={`text-2xl font-extrabold ${(stats?.pendingOrders || 0) > 0 ? 'text-sky-400' : 'text-emerald-400'}`}>{stats?.pendingOrders || 0}</p>
          <p className="text-[11px] text-muted mt-1.5">Awaiting fulfilment</p>
        </div>
      </div>

      {/* ── Automation Alerts ── */}
      {stats?.alerts && stats.alerts.length > 0 && (
        <div className="glass-panel border-amber-500/20 bg-amber-500/5 overflow-hidden">
          <div className="p-4 border-b border-amber-500/20 flex justify-between items-center bg-amber-500/10">
            <h3 className="font-bold flex items-center gap-2 text-amber-400 text-sm">
              <AlertTriangle size={16} className="animate-pulse" /> Automation Alerts
            </h3>
            <span className="text-[10px] font-bold bg-amber-500/20 border border-amber-500/30 text-amber-400 px-2 py-0.5 rounded-full uppercase">Action Required</span>
          </div>
          <div className="divide-y divide-glass-border/30">
            {stats.alerts.map(alert => (
              <div key={alert.id} className="p-3 flex items-center justify-between gap-4 hover:bg-white/5 transition-all">
                <div>
                  <p className="text-sm font-semibold text-text">{alert.description}</p>
                  <span className="text-[9px] text-muted font-mono">{fmtDate(alert.created_at)}</span>
                </div>
                <button onClick={() => handleDismissAlert(alert.id)}
                  className="px-3 py-1 bg-white/5 hover:bg-white/10 text-muted hover:text-text text-[10px] font-bold border border-glass-border rounded-lg transition-all shrink-0">
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Two-column: Recent Sales + Recent Purchases ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Recent Sales */}
        <div className="glass-panel overflow-hidden">
          <div className="p-4 border-b border-glass-border flex justify-between items-center bg-white/5">
            <h3 className="font-bold flex items-center gap-2 text-sm">
              <TrendingUp size={15} className="text-emerald-400" /> Recent Sales
            </h3>
            <button onClick={() => navigate('/sells')} className="text-[10px] text-sky-400 hover:underline">View all →</button>
          </div>
          {!stats?.recentSales || stats.recentSales.length === 0 ? (
            <div className="p-8 text-center text-muted text-sm">No sales yet today</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-black/20">
                <tr>
                  {['Invoice', 'Customer', 'Amount', 'Mode'].map(h => (
                    <th key={h} className="p-3 text-left text-[10px] font-bold text-muted uppercase tracking-wider border-b border-glass-border">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-glass-border/20">
                {stats.recentSales.map(s => (
                  <tr key={s.invoice_no} className="hover:bg-white/5 transition-colors">
                    <td className="p-3 font-mono text-sky-400">{s.invoice_no}</td>
                    <td className="p-3 text-text truncate max-w-[100px]">{s.patient_name || 'Walk-in'}</td>
                    <td className="p-3 font-bold text-emerald-400">{fmtMoney(s.total_amount)}</td>
                    <td className="p-3 text-muted capitalize">{s.payment_mode || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Purchases */}
        <div className="glass-panel overflow-hidden">
          <div className="p-4 border-b border-glass-border flex justify-between items-center bg-white/5">
            <h3 className="font-bold flex items-center gap-2 text-sm">
              <ShoppingBag size={15} className="text-violet-400" /> Recent Purchases
            </h3>
            <button onClick={() => navigate('/purchase-history')} className="text-[10px] text-sky-400 hover:underline">View all →</button>
          </div>
          {!stats?.recentPurchases || stats.recentPurchases.length === 0 ? (
            <div className="p-8 text-center text-muted text-sm">No recent purchases</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-black/20">
                <tr>
                  {['Invoice', 'Distributor', 'Amount'].map(h => (
                    <th key={h} className="p-3 text-left text-[10px] font-bold text-muted uppercase tracking-wider border-b border-glass-border">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-glass-border/20">
                {stats.recentPurchases.map((p, i) => (
                  <tr key={i} className="hover:bg-white/5 transition-colors">
                    <td className="p-3 font-mono text-violet-400">{p.invoice_no || '—'}</td>
                    <td className="p-3 text-text truncate max-w-[140px]">{p.distributor_name || '—'}</td>
                    <td className="p-3 font-bold text-amber-400">{fmtMoney(p.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Pending Tasks count (links to automation) ── */}
      {(stats?.pendingTasks || 0) > 0 && (
        <div className="glass-panel p-4 flex items-center gap-4 border-purple-500/20 bg-purple-500/5 cursor-pointer hover:bg-purple-500/10 transition-all"
          onClick={() => navigate('/automation-center')}>
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0">
            <ListTodo size={18} className="text-purple-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-purple-400">{stats?.pendingTasks} automation task{stats?.pendingTasks !== 1 ? 's' : ''} need attention</p>
            <p className="text-xs text-muted">Click to view Automation Center</p>
          </div>
          <Activity size={16} className="text-muted shrink-0" />
        </div>
      )}

    </div>
  );
};

export default Dashboard;
